import { describe, it, expect } from "vitest";
import Database from "better-sqlite3";
import { Migrator } from "../../src/db/migrator.js";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";

const MIGRATIONS_DIR = path.join(process.cwd(), "src", "db", "migrations");
const SCHEMA = fs.readFileSync(path.join(process.cwd(), "src", "db", "schema.sql"), "utf8");

function tmpDbPath(name: string): string {
    return path.join(fs.mkdtempSync(path.join(os.tmpdir(), "sorokeep-upgrade-")), `${name}.db`);
}
const columns = (db: Database.Database, table: string): string[] =>
    (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((c) => c.name);

describe("migrator: partially-applicable ADD COLUMN migrations", () => {
    // Regression guard. getDatabase() runs schema.sql before the migrations, so a
    // migration that adds the same column to two tables can find it already
    // present on one and missing on the other. Migration 014 is exactly this.
    //
    // The bug: the whole file ran as one exec inside one transaction with the
    // duplicate-column error caught outside it. The first ALTER succeeded, the
    // second raised, the transaction rolled the first one back, and the handler
    // recorded the migration as applied anyway -- so the column was permanently
    // absent and the migration could never re-run to fix it.
    it("applies the statements that can apply when a later one hits a duplicate column", () => {
        const db = new Database(":memory:");
        db.exec(`CREATE TABLE needs_it (id INTEGER);`);
        db.exec(`CREATE TABLE already_has_it (id INTEGER, shared INTEGER NOT NULL DEFAULT 0);`);

        const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sorokeep-mig-"));
        fs.writeFileSync(path.join(dir, "001_add_shared.sql"),
            `ALTER TABLE needs_it ADD COLUMN shared INTEGER NOT NULL DEFAULT 0;\n` +
            `ALTER TABLE already_has_it ADD COLUMN shared INTEGER NOT NULL DEFAULT 0;\n`);

        new Migrator(db, dir).run();

        expect(columns(db, "needs_it")).toContain("shared");
        expect(columns(db, "already_has_it")).toContain("shared");
        const applied = db.prepare("SELECT version FROM schema_migrations").all() as { version: number }[];
        expect(applied.map((r) => r.version)).toEqual([1]);
    });

    it("still aborts and does not record the migration when a statement genuinely fails", () => {
        const db = new Database(":memory:");
        db.exec(`CREATE TABLE only_one (id INTEGER);`);

        const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sorokeep-mig-"));
        fs.writeFileSync(path.join(dir, "001_bad.sql"),
            `ALTER TABLE only_one ADD COLUMN ok INTEGER;\n` +
            `ALTER TABLE does_not_exist ADD COLUMN nope INTEGER;\n`);

        expect(() => new Migrator(db, dir).run()).toThrow();
        const applied = db.prepare("SELECT count(*) c FROM schema_migrations").get() as { c: number };
        expect(applied.c).toBe(0);
    });
});

describe("upgrading a v1.0.0 database", () => {
    // The real scenario: someone installed v1.0.0, has data, and upgrades. Their
    // schema must end up identical to a fresh install's, or the code will query
    // columns their database does not have.
    it("converges to the same schema as a fresh install, preserving data", async () => {
        const { getDatabaseForTesting } = await import("../../src/db/database.js");

        // A fresh install.
        const fresh = getDatabaseForTesting();
        const freshShape: Record<string, string[]> = {};
        for (const t of fresh.prepare(
            "SELECT name FROM sqlite_master WHERE type='table' AND sql IS NOT NULL",
        ).all() as { name: string }[]) {
            freshShape[t.name] = columns(fresh, t.name).sort();
        }

        // A real v1.0.0 install, built from that release's own schema.sql rather
        // than from today's with bits removed. The distinction matters: the bug
        // this guards against needs an *asymmetry* within one migration, and
        // v1.0.0's schema is what produces it.
        //
        // Migration 014 adds `predictive_cycles` to two tables. On a v1.0.0
        // upgrade, `extension_policies` already exists without the column, while
        // `guard_policy_history` did not exist at all and so gets created by
        // today's schema.sql *with* it. One ALTER must succeed and the other must
        // hit a duplicate. Simulating by dropping the column from both tables
        // makes both ALTERs succeed and tests nothing.
        const legacySchema = execFileSync("git", ["show", "v1.0.0:src/db/schema.sql"],
            { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });

        const oldPath = tmpDbPath("legacy");
        const legacy = new Database(oldPath);
        legacy.exec(legacySchema);
        legacy.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
            version INTEGER PRIMARY KEY,
            applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );`);
        // v1.0.0 shipped migration 001, so a real install would have recorded it.
        legacy.exec(fs.readFileSync(path.join(MIGRATIONS_DIR, "001_resource_usage_logs.sql"), "utf8"));
        legacy.prepare("INSERT INTO schema_migrations (version) VALUES (1)").run();
        legacy.prepare("INSERT INTO contracts (id, name, network) VALUES (?, ?, ?)")
            .run("CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC", "legacy", "testnet");
        legacy.close();

        // Upgrade it the way getDatabase does.
        const upgraded = new Database(oldPath);
        upgraded.pragma("foreign_keys = ON");
        upgraded.exec(SCHEMA);
        new Migrator(upgraded, MIGRATIONS_DIR).run();

        expect(columns(upgraded, "alert_configs")).toContain("enabled");
        expect(columns(upgraded, "extension_policies")).toContain("predictive_cycles");
        expect(
            (upgraded.prepare("SELECT count(*) c FROM contracts").get() as { c: number }).c,
        ).toBe(1);

        for (const [table, cols] of Object.entries(freshShape)) {
            if (table === "sqlite_sequence") continue;
            expect(columns(upgraded, table).sort(), `table ${table} differs after upgrade`).toEqual(cols);
        }
    });
});
