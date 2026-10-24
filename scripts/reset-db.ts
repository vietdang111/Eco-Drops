import { extname, isAbsolute, relative, resolve } from "node:path";
import { getDatabasePath, openDatabase } from "../src/lib/db";
import { DEMO_USERS, seedDatabase } from "../src/lib/seed";

function assertSafeDemoPath(databasePath: string): void {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Refusing to reset a database while NODE_ENV=production.");
  }
  if (databasePath === ":memory:") return;

  const workspace = resolve(process.cwd());
  const pathFromWorkspace = relative(workspace, databasePath);
  if (pathFromWorkspace.startsWith("..") || isAbsolute(pathFromWorkspace)) {
    throw new Error("Refusing to reset a database outside the current workspace.");
  }
  if (![".db", ".sqlite", ".sqlite3"].includes(extname(databasePath))) {
    throw new Error("Refusing to reset a path that is not a SQLite database file.");
  }
}

async function main(): Promise<void> {
  const databasePath = getDatabasePath();
  assertSafeDemoPath(databasePath);
  const db = openDatabase(databasePath);
  try {
    // Reset through one SQLite transaction instead of unlinking a live WAL database.
    // This remains safe when a local demo server has the same file open.
    const result = await seedDatabase(db, { clear: true });
    console.info(`Reset ${databasePath} to deterministic synthetic EcoDrops demo data.`);
    console.info("Synthetic demo credentials (never use in production):");
    for (const user of Object.values(DEMO_USERS)) {
      console.info(`  ${user.role}: ${user.email} / ${result.password}`);
    }
  } finally {
    db.close();
  }
}

main().catch((error: unknown) => {
  console.error("Failed to reset the EcoDrops demo database.", error);
  process.exitCode = 1;
});
