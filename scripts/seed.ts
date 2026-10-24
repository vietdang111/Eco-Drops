import { getDatabasePath, openDatabase } from "../src/lib/db";
import { DEMO_USERS, seedDatabase } from "../src/lib/seed";

async function main(): Promise<void> {
  const databasePath = getDatabasePath();
  const db = openDatabase(databasePath);
  try {
    const result = await seedDatabase(db, { clear: true });
    console.info(`Seeded synthetic EcoDrops demo data at ${databasePath}.`);
    console.info(
      `Created ${result.organizations} organizations, ${result.users} users, ${result.batches} batches, and ${result.items} items.`,
    );
    console.info("Synthetic demo credentials (never use in production):");
    for (const user of Object.values(DEMO_USERS)) {
      console.info(`  ${user.role}: ${user.email} / ${result.password}`);
    }
  } finally {
    db.close();
  }
}

main().catch((error: unknown) => {
  console.error("Failed to seed the EcoDrops demo database.", error);
  process.exitCode = 1;
});
