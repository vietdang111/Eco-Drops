import { openDatabase } from "../src/lib/db";
import { seedDatabase } from "../src/lib/seed";

interface FactorRow {
  id: string;
  lowFactor: number;
  baseFactor: number;
  highFactor: number;
  lowDisplacement: number;
  baseDisplacement: number;
  highDisplacement: number;
  lowRetention: number;
  baseRetention: number;
  highRetention: number;
  handling: number;
  sourceUrl: string;
  assumptionsJson: string;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function ordered(values: readonly number[]): boolean {
  return values.every((value, index) => Number.isFinite(value) && (index === 0 || value >= values[index - 1]!));
}

async function main(): Promise<void> {
  const db = openDatabase(":memory:");
  try {
    await seedDatabase(db, { clear: true });
    const rows = db.prepare<[], FactorRow>(
      `SELECT f.id, f.low_factor AS lowFactor, f.base_factor AS baseFactor,
              f.high_factor AS highFactor, f.low_displacement AS lowDisplacement,
              f.base_displacement AS baseDisplacement, f.high_displacement AS highDisplacement,
              f.low_retention AS lowRetention, f.base_retention AS baseRetention,
              f.high_retention AS highRetention,
              f.handling_kg_co2e_per_item AS handling,
              m.source_url AS sourceUrl, m.assumptions_json AS assumptionsJson
         FROM emission_factors f JOIN methodologies m ON m.id = f.methodology_id`,
    ).all();

    assert(rows.length > 0, "At least one emission-factor row is required.");
    for (const row of rows) {
      assert(ordered([row.lowFactor, row.baseFactor, row.highFactor]), `${row.id}: factors must be low <= base <= high.`);
      assert(ordered([row.lowDisplacement, row.baseDisplacement, row.highDisplacement]), `${row.id}: displacement rates must be ordered.`);
      assert(ordered([row.lowRetention, row.baseRetention, row.highRetention]), `${row.id}: retention rates must be ordered.`);
      assert([row.lowDisplacement, row.baseDisplacement, row.highDisplacement, row.lowRetention, row.baseRetention, row.highRetention].every((rate) => rate >= 0 && rate <= 1), `${row.id}: rates must be between zero and one.`);
      assert(Number.isFinite(row.handling) && row.handling >= 0, `${row.id}: handling must be non-negative.`);
      assert(new URL(row.sourceUrl).protocol === "https:", `${row.id}: methodology source must use HTTPS.`);
      const assumptions = JSON.parse(row.assumptionsJson) as { notice?: unknown; noAnswerRetention?: unknown };
      assert(typeof assumptions.notice === "string" && /prox(?:y|ies)/i.test(assumptions.notice), `${row.id}: proxy-factor disclosure is required.`);
      assert(assumptions.noAnswerRetention === 0, `${row.id}: no-answer retention must remain zero.`);
    }
    console.info(`Factor-integrity check passed for ${rows.length} versioned factor rows.`);
  } finally {
    db.close();
  }
}

main().catch((error: unknown) => {
  console.error("Factor-integrity check failed.", error);
  process.exitCode = 1;
});
