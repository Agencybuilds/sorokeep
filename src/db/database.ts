import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

import Database from "better-sqlite3";
import { Migrator } from "./migrator.js";
import { getLogger } from "../logging/index.js";

const logger = getLogger().child({ component: "Database" });

const SOROKEEP_DIR = path.join(os.homedir(), '.sorokeep');

const DB_PATH = path.join(SOROKEEP_DIR, 'sorokeep.db');

function ensureDataDirExists(dir: string) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SCHEMA_FILE_PATH = path.join(__dirname, 'schema.sql');
const SCHEMA = fs.readFileSync(SCHEMA_FILE_PATH, 'utf-8')
    // Removes SQL comments. [^\n]* (not .*) so a CRLF-checked-out file still
    // matches: JS `.` excludes all line terminators including \r, so `.*\n`
    // silently fails to match a comment ending in \r\n — the comment (and,
    // once whitespace collapses newlines to spaces, everything after it,
    // since SQLite's own -- then runs to the string's end) survives into
    // the executed script instead of being stripped.
    .replace(/--[^\n]*\n/g, '')
    .replace(/\s+/g, ' ') // Collapse whitespaces
    .trim();

let db: Database.Database | null = null;

export function getDatabase(customPath?: string): Database.Database {
    if (db) return db;

    const dbPath = customPath ?? DB_PATH;
    ensureDataDirExists(path.dirname(dbPath));

    db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    db.exec(SCHEMA);

    // Run schema migrations
    const migrationsDir = path.join(__dirname, 'migrations');
    const migrator = new Migrator(db, migrationsDir);
    migrator.run();

    // ── Live migrations ───────────────────────────────────────────────────────
    // ALTER TABLE is idempotent-safe here: we catch the "duplicate column" error
    // that SQLite throws when the column already exists. This handles existing
    // sorokeep.db files created before these columns were added to schema.sql.
    const migrations = [
        `ALTER TABLE alerts_fired ADD COLUMN delivered INTEGER NOT NULL DEFAULT 0`,
        `ALTER TABLE alerts_fired ADD COLUMN delivered_at TEXT`,
        `ALTER TABLE alerts_fired ADD COLUMN retry_count INTEGER NOT NULL DEFAULT 0`,
        `ALTER TABLE alert_configs ADD COLUMN webhook_secret TEXT`,
        `ALTER TABLE contracts ADD COLUMN poll_interval_seconds INTEGER`,
        `CREATE TABLE IF NOT EXISTS channel_accounts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            public_key TEXT NOT NULL UNIQUE,
            keypair_source TEXT,
            label TEXT,
            network TEXT NOT NULL DEFAULT 'testnet',
            funded BOOLEAN NOT NULL DEFAULT 0,
            balance_xlm REAL,
            balance_checked_at TEXT,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`,
        `ALTER TABLE contracts ADD COLUMN last_introspected_at DATETIME`,
        `ALTER TABLE contracts ADD COLUMN active INTEGER NOT NULL DEFAULT 1`,
        // issue #325 — quiet-hours / maintenance-window columns
        `ALTER TABLE alert_configs ADD COLUMN quiet_hours_start TEXT`,
        `ALTER TABLE alert_configs ADD COLUMN quiet_hours_end TEXT`,
        `ALTER TABLE alert_configs ADD COLUMN quiet_hours_timezone TEXT`,
        // issue #400 — group-level default poll interval
        `ALTER TABLE contract_groups ADD COLUMN poll_interval_seconds INTEGER`,
        // issue #420 — per-transaction fee ceiling on extension policies
        `ALTER TABLE extension_policies ADD COLUMN max_fee_stroops INTEGER`,
    ];
    for (const sql of migrations) {
        try {
            db.exec(sql);
        } catch (err: unknown) {
            // Only "already exists" is expected here. A bare catch would also
            // swallow a typo, a missing table or a constraint violation, so a
            // statement could silently never apply and nothing would say so.
            const message = err instanceof Error ? err.message : String(err);
            if (!/duplicate column name|already exists/i.test(message)) {
                throw new Error(`Live migration failed: ${message}\n  statement: ${sql.trim().slice(0, 120)}`);
            }
        }
    }

    migrateAlertConfigsChannelTypeCheck(db);
    relaxChannelTypeChecks(db);

    return db;
}

function migrateAlertConfigsChannelTypeCheck(db: Database.Database): void {
    const row = db.prepare(`
        SELECT sql FROM sqlite_master
        WHERE type = 'table' AND name = 'alert_configs'
    `).get() as { sql?: string } | undefined;

    if (!row?.sql) {
        return;
    }

    const hasLegacyCheck = /CHECK\s*\(\s*channel_type\s+IN\s*\(\s*'slack'\s*,\s*'webhook'(?:,\s*'pagerduty')?\s*\)\s*\)/i.test(row.sql);
    if (!hasLegacyCheck) {
        return;
    }

    db.exec("PRAGMA foreign_keys = OFF;");
    db.exec("BEGIN TRANSACTION;");
    db.exec(`
        CREATE TABLE alert_configs_new (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            contract_id TEXT NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
            channel_type TEXT NOT NULL CHECK(channel_type IN ('slack', 'webhook', 'pagerduty', 'discord', 'telegram')),
            channel_target TEXT NOT NULL,
            threshold_ledgers INTEGER NOT NULL,
            webhook_secret TEXT,
            quiet_hours_start    TEXT,
            quiet_hours_end      TEXT,
            quiet_hours_timezone TEXT,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
    `);
    db.exec(`
        INSERT INTO alert_configs_new (id, contract_id, channel_type, channel_target, threshold_ledgers, webhook_secret, quiet_hours_start, quiet_hours_end, quiet_hours_timezone, created_at)
        SELECT id, contract_id, channel_type, channel_target, threshold_ledgers, webhook_secret, quiet_hours_start, quiet_hours_end, quiet_hours_timezone, created_at
        FROM alert_configs
    `);
    db.exec(`DROP TABLE alert_configs;`);
    db.exec(`ALTER TABLE alert_configs_new RENAME TO alert_configs;`);
    db.exec("COMMIT;");
    db.exec("PRAGMA foreign_keys = ON;");
}

/**
 * channel_type validity used to be enforced by a fixed SQL CHECK enum
 * (`CHECK(channel_type IN ('slack', 'webhook', ...))`). That enum is now
 * enforced at the application layer by the alert channel registry
 * (src/alerts/registry.ts) so contributors can add a new channel without a
 * schema migration. Existing databases still carry the old restrictive
 * CHECK on disk — this rebuilds `alert_configs` and `resource_alert_configs`
 * in place (SQLite has no `ALTER TABLE ... DROP CONSTRAINT`) to the new
 * permissive CHECK, preserving all rows. No-op once already relaxed.
 */
/**
 * Rebuilds a table with a new definition, carrying over every column the old and
 * new definitions share.
 *
 * SQLite cannot drop a CHECK constraint, so relaxing one means the twelve-step
 * rebuild dance: create a replacement, copy, drop, rename. The dangerous part is
 * the copy — an earlier version of this listed its columns by hand, so when
 * `enabled` was later added to `alert_configs` by migration 005, every rebuild
 * silently dropped both the column and its data. Anyone who had disabled an
 * alert config lost that state, and nothing failed loudly.
 *
 * Computing the copy list as the intersection of the two tables means a column
 * added in future is carried over automatically. Columns only in the new
 * definition take their default; columns only in the old one are intentionally
 * being removed and are dropped.
 */
function rebuildTable(
    db: Database.Database,
    table: string,
    newTableDdl: (tmpName: string) => string,
): void {
    const tmp = `${table}__rebuild`;
    const columnsOf = (t: string): string[] =>
        (db.prepare(`PRAGMA table_info(${t})`).all() as { name: string }[]).map((c) => c.name);

    const before = columnsOf(table);

    db.exec("PRAGMA foreign_keys = OFF;");
    db.exec("BEGIN TRANSACTION;");
    try {
        db.exec(newTableDdl(tmp));

        const shared = columnsOf(tmp).filter((c) => before.includes(c));
        const dropped = before.filter((c) => !shared.includes(c));
        if (dropped.length) {
            // Not necessarily a bug — a rebuild can legitimately remove a column —
            // but it should never happen silently again.
            logger.warn(
                `Rebuilding ${table}: dropping column(s) ${dropped.join(", ")}. ` +
                `If that was not intended, the replacement definition is missing them.`,
            );
        }

        const cols = shared.join(", ");
        db.exec(`INSERT INTO ${tmp} (${cols}) SELECT ${cols} FROM ${table};`);
        db.exec(`DROP TABLE ${table};`);
        db.exec(`ALTER TABLE ${tmp} RENAME TO ${table};`);
        db.exec("COMMIT;");
    } catch (err) {
        db.exec("ROLLBACK;");
        throw err;
    } finally {
        db.exec("PRAGMA foreign_keys = ON;");
    }
}

function relaxChannelTypeChecks(db: Database.Database): void {
    const hasEnumCheck = (tableName: string): boolean => {
        const row = db.prepare(`
            SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?
        `).get(tableName) as { sql?: string } | undefined;
        return !!row?.sql && /CHECK\s*\(\s*channel_type\s+IN\s*\(/i.test(row.sql);
    };

    if (hasEnumCheck("alert_configs")) {
        // Must stay in step with schema.sql's alert_configs definition.
        rebuildTable(db, "alert_configs", (t) => `
            CREATE TABLE ${t} (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                contract_id TEXT NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
                channel_type TEXT NOT NULL CHECK(channel_type <> ''),
                channel_target TEXT NOT NULL,
                threshold_ledgers INTEGER NOT NULL,
                webhook_secret TEXT,
                quiet_hours_start    TEXT,
                quiet_hours_end      TEXT,
                quiet_hours_timezone TEXT,
                enabled INTEGER NOT NULL DEFAULT 1,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
        `);
    }

    if (hasEnumCheck("resource_alert_configs")) {
        rebuildTable(db, "resource_alert_configs", (t) => `
            CREATE TABLE ${t} (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                contract_id TEXT NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
                channel_type TEXT NOT NULL CHECK(channel_type <> ''),
                channel_target TEXT NOT NULL,
                cpu_limit INTEGER NOT NULL,
                mem_limit INTEGER NOT NULL,
                webhook_secret TEXT,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(contract_id, channel_type, channel_target)
            )
        `);
    }
}

export function closeDatabase() {
    if (db) {
        db.close();
        db = null;
    }
}

export function vacuumDatabase(db: Database.Database): boolean {
    if (db.inTransaction) {
        return false;
    }

    try {
        db.exec("VACUUM");
        return true;
    } catch (err: unknown) {
        if (err instanceof Error && /(busy|locked)/i.test(err.message)) {
            return false;
        }
        throw err;
    }
}

export function getDatabaseForTesting(): Database.Database {
    const db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    db.exec(SCHEMA);

    // Run schema migrations
    const migrationsDir = path.join(__dirname, 'migrations');
    const migrator = new Migrator(db, migrationsDir);
    migrator.run();

    return db;
}
