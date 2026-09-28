import type Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

/**
 * Splits a migration file into executable statements, discarding comments and
 * blank lines. Deliberately simple: these files are hand-written DDL with no
 * string literals containing semicolons, and a real SQL parser would be more
 * machinery than the job needs.
 */
function splitStatements(sql: string): string[] {
    return sql
        .split("\n")
        .filter((line) => !line.trim().startsWith("--"))
        .join("\n")
        .split(";")
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
}

export class Migrator {
    private db: Database.Database;
    private migrationsDir: string;

    constructor(db: Database.Database, migrationsDir: string) {
        this.db = db;
        this.migrationsDir = migrationsDir;
    }

    /**
     * Initializes the migrations tracking table if it doesn't exist.
     */
    public init(): void {
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS schema_migrations (
                version INTEGER PRIMARY KEY,
                applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );
        `);
    }

    /**
     * Retrieves all applied migration versions.
     */
    public getAppliedMigrations(): number[] {
        this.init();
        const rows = this.db.prepare("SELECT version FROM schema_migrations ORDER BY version ASC;").all() as { version: number }[];
        return rows.map((r) => r.version);
    }

    /**
     * Retrieves list of pending migrations from the migrations directory.
     */
    public getPendingMigrations(): { version: number; filename: string; filepath: string }[] {
        this.init();
        if (!fs.existsSync(this.migrationsDir)) {
            return [];
        }

        const files = fs.readdirSync(this.migrationsDir);
        const pending: { version: number; filename: string; filepath: string }[] = [];
        const applied = new Set(this.getAppliedMigrations());

        for (const file of files) {
            const match = file.match(/^(\d+)(?:_.*)?\.sql$/i);
            if (match) {
                const version = parseInt(match[1]!, 10);
                if (!applied.has(version)) {
                    pending.push({
                        version,
                        filename: file,
                        filepath: path.join(this.migrationsDir, file),
                    });
                }
            }
        }

        // Sort pending migrations by version to ensure sequential execution
        return pending.sort((a, b) => a.version - b.version);
    }

    /**
     * Executes all pending migrations sequentially, each in its own transaction.
     *
     * A migration made only of `ALTER TABLE ... ADD COLUMN` statements is run
     * statement by statement, and a "duplicate column name" on any one of them is
     * tolerated. That is deliberate and load-bearing:
     *
     * `getDatabase()` applies schema.sql before running migrations, so on a fresh
     * database the columns a migration adds already exist, while on an upgraded
     * one they may not — and the two can be mixed within a single migration.
     * Migration 014 is exactly that case: it adds `predictive_cycles` to both
     * `extension_policies` (which predates it, so the column is missing) and
     * `guard_policy_history` (created by schema.sql, so the column is already
     * there).
     *
     * An earlier version ran the whole file as one `exec` inside one transaction
     * and caught the duplicate-column error around the outside. On an upgraded
     * database that meant the first ALTER succeeded, the second raised, the
     * transaction rolled the first one back, and the handler then recorded the
     * migration as applied — so `extension_policies.predictive_cycles` was
     * permanently absent and the migration could never run again to fix it.
     * Per-statement execution is what makes the partial case work.
     */
    public run(): void {
        this.init();
        const pending = this.getPendingMigrations();

        for (const migration of pending) {
            const sql = fs.readFileSync(migration.filepath, "utf-8");
            const statements = splitStatements(sql);
            const allAddColumn = statements.length > 0 &&
                statements.every((s) => /^ALTER\s+TABLE\s+\S+\s+ADD\s+COLUMN/i.test(s));

            const runMigrationTx = this.db.transaction(() => {
                if (allAddColumn) {
                    for (const statement of statements) {
                        try {
                            this.db.exec(statement);
                        } catch (err: unknown) {
                            const message = err instanceof Error ? err.message : String(err);
                            // Already present is success for this statement; anything
                            // else is a real failure and must abort the migration.
                            if (!/duplicate column name/i.test(message)) throw err;
                        }
                    }
                } else {
                    this.db.exec(sql);
                }
                this.db.prepare("INSERT INTO schema_migrations (version) VALUES (?);").run(migration.version);
            });

            runMigrationTx();
        }
    }
}
