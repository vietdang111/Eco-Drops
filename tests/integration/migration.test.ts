import { afterEach, describe, expect, it } from "vitest";
import { initializeDatabase, openDatabase, SCHEMA_VERSION, type DatabaseConnection } from "../../src/lib/db";

describe("additive schema v2 migration", () => {
  let db: DatabaseConnection | undefined;

  afterEach(() => {
    if (db?.open) db.close();
  });

  it("upgrades a v1-shaped database idempotently without replacing existing rows", () => {
    db = openDatabase(":memory:");
    db.prepare(
      `INSERT INTO organizations (id, name, slug, kind, synthetic, created_at)
       VALUES ('org-existing-v1', 'Existing V1 Organization', 'existing-v1', 'corporate', 0,
               '2025-01-01T00:00:00.000Z')`,
    ).run();

    db.exec("DROP TABLE allocation_items");
    db.exec("DROP TABLE campus_allocations");
    db.exec("DROP TABLE hs_policy_catalog");
    db.prepare("UPDATE app_meta SET value = '1' WHERE key = 'schema_version'").run();

    expect(() => initializeDatabase(db as DatabaseConnection)).not.toThrow();
    expect(() => initializeDatabase(db as DatabaseConnection)).not.toThrow();

    expect(db.prepare<[], { value: string }>(
      "SELECT value FROM app_meta WHERE key = 'schema_version'",
    ).get()?.value).toBe(String(SCHEMA_VERSION));
    expect(db.prepare<[], { name: string }>(
      "SELECT name FROM organizations WHERE id = 'org-existing-v1'",
    ).get()?.name).toBe("Existing V1 Organization");
    expect(db.prepare<[], { count: number }>(
      "SELECT COUNT(*) AS count FROM hs_policy_catalog WHERE active = 1",
    ).get()?.count).toBe(5);
    expect(db.prepare<[], { count: number }>(
      "SELECT COUNT(*) AS count FROM campus_allocations",
    ).get()?.count).toBe(0);
    expect(db.prepare<[], { count: number }>(
      "SELECT COUNT(*) AS count FROM allocation_items",
    ).get()?.count).toBe(0);
  });

  it("refuses to relabel a database from a newer schema version", () => {
    db = openDatabase(":memory:");
    db.prepare("UPDATE app_meta SET value = '3' WHERE key = 'schema_version'").run();

    expect(() => initializeDatabase(db as DatabaseConnection)).toThrow(
      "newer than supported schema 2",
    );
    expect(db.prepare<[], { value: string }>(
      "SELECT value FROM app_meta WHERE key = 'schema_version'",
    ).get()?.value).toBe("3");
  });
});
