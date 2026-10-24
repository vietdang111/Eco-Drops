import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  calculateScenarioEstimate,
  retentionRateFromOutcomes,
  smoothRate,
  type ScenarioAssumptions,
} from "../../src/lib/carbon";
import { FOLLOW_UP_OUTCOMES } from "../../src/lib/domain";

const scenarioInputArbitrary = fc
  .record({
    unitWeightTenths: fc.integer({ min: 0, max: 10_000 }),
    factorTenths: fc.integer({ min: 0, max: 10_000 }),
    displacementBasisPoints: fc.integer({ min: 0, max: 10_000 }),
    handlingHundredths: fc.integer({ min: 0, max: 100_000 }),
  })
  .map(({ unitWeightTenths, factorTenths, displacementBasisPoints, handlingHundredths }) => ({
    unitWeightKg: unitWeightTenths / 10,
    factorKgCO2ePerKg: factorTenths / 10,
    displacementRate: displacementBasisPoints / 10_000,
    handlingKgCO2ePerItem: handlingHundredths / 100,
  }));

const smoothedRateArbitrary = fc.integer({ min: 1, max: 2_000 }).chain((total) =>
  fc
    .record({
      positive: fc.integer({ min: 0, max: total }),
      priorPositive: fc.integer({ min: 0, max: 100 }),
      priorNegative: fc.integer({ min: 0, max: 100 }),
    })
    .filter(({ priorPositive, priorNegative }) => priorPositive + priorNegative > 0)
    .map((values) => ({ total, ...values })),
);

describe("estimated avoided emissions", () => {
  it("is non-negative and monotonic in eligible units", () => {
    fc.assert(
      fc.property(
        scenarioInputArbitrary,
        fc.integer({ min: 0, max: 1_000_000 }),
        fc.integer({ min: 0, max: 1_000_000 }),
        fc.integer({ min: 0, max: 10_000 }),
        (input, firstUnits, secondUnits, retentionBasisPoints) => {
          const lowerUnits = Math.min(firstUnits, secondUnits);
          const upperUnits = Math.max(firstUnits, secondUnits);
          const assumptions: ScenarioAssumptions = {
            factorKgCO2ePerKg: input.factorKgCO2ePerKg,
            displacementRate: input.displacementRate,
            retentionRate: retentionBasisPoints / 10_000,
            handlingKgCO2ePerItem: input.handlingKgCO2ePerItem,
          };
          const lower = calculateScenarioEstimate(input.unitWeightKg, lowerUnits, assumptions);
          const upper = calculateScenarioEstimate(input.unitWeightKg, upperUnits, assumptions);

          expect(lower.estimatedAvoidedEmissionsKgCO2e).toBeGreaterThanOrEqual(0);
          expect(upper.estimatedAvoidedEmissionsKgCO2e).toBeGreaterThanOrEqual(0);
          expect(upper.estimatedAvoidedEmissionsKgCO2e).toBeGreaterThanOrEqual(
            lower.estimatedAvoidedEmissionsKgCO2e,
          );
        },
      ),
      { seed: 20260311, numRuns: 200 },
    );
  });

  it("is monotonic in retention and never exceeds the displacement-only result", () => {
    fc.assert(
      fc.property(
        scenarioInputArbitrary,
        fc.integer({ min: 0, max: 10_000 }),
        fc.integer({ min: 0, max: 10_000 }),
        fc.integer({ min: 0, max: 100_000 }),
        (input, firstRetention, secondRetention, eligibleUnits) => {
          const lowerRetention = Math.min(firstRetention, secondRetention) / 10_000;
          const upperRetention = Math.max(firstRetention, secondRetention) / 10_000;
          const shared = {
            factorKgCO2ePerKg: input.factorKgCO2ePerKg,
            displacementRate: input.displacementRate,
            handlingKgCO2ePerItem: input.handlingKgCO2ePerItem,
          };
          const lower = calculateScenarioEstimate(input.unitWeightKg, eligibleUnits, {
            ...shared,
            retentionRate: lowerRetention,
          });
          const upper = calculateScenarioEstimate(input.unitWeightKg, eligibleUnits, {
            ...shared,
            retentionRate: upperRetention,
          });
          const displacementOnly = calculateScenarioEstimate(input.unitWeightKg, eligibleUnits, {
            ...shared,
            retentionRate: 1,
          });

          for (const estimate of [lower, upper, displacementOnly]) {
            expect(estimate.estimatedAvoidedEmissionsKgCO2ePerItem).toBeGreaterThanOrEqual(0);
            expect(estimate.estimatedAvoidedEmissionsKgCO2e).toBeGreaterThanOrEqual(0);
          }
          expect(upper.estimatedAvoidedEmissionsKgCO2e).toBeGreaterThanOrEqual(
            lower.estimatedAvoidedEmissionsKgCO2e,
          );
          expect(upper.estimatedAvoidedEmissionsKgCO2e).toBeLessThanOrEqual(
            displacementOnly.estimatedAvoidedEmissionsKgCO2e,
          );
        },
      ),
      { seed: 20260312, numRuns: 200 },
    );
  });
});

describe("smoothed displacement and retention rates", () => {
  it.each([
    ["displacement", 20260313],
    ["retention", 20260314],
  ] as const)("keeps the %s estimate between the observed and prior rates", (_label, seed) => {
    fc.assert(
      fc.property(
        smoothedRateArbitrary,
        ({ positive, total, priorPositive, priorNegative }) => {
          const observedRate = positive / total;
          const priorRate = priorPositive / (priorPositive + priorNegative);
          const result = smoothRate({ positive, total, priorPositive, priorNegative });
          const exactPosterior =
            (positive + priorPositive) / (total + priorPositive + priorNegative);

          expect(result).toBeGreaterThanOrEqual(Math.min(observedRate, priorRate) - 0.000001);
          expect(result).toBeLessThanOrEqual(Math.max(observedRate, priorRate) + 0.000001);
          expect(Math.abs(result - exactPosterior)).toBeLessThanOrEqual(0.000001);
        },
      ),
      { seed, numRuns: 200 },
    );
  });
});

describe("retention outcomes", () => {
  it("never counts NO_ANSWER as retained", () => {
    fc.assert(
      fc.property(
        fc.array(fc.constantFrom(...FOLLOW_UP_OUTCOMES), { maxLength: 100 }),
        (outcomes) => {
          const before = retentionRateFromOutcomes(outcomes);
          const after = retentionRateFromOutcomes([...outcomes, "NO_ANSWER"]);

          expect(after.retained).toBe(before.retained);
          expect(after.sampleSize).toBe(before.sampleSize + 1);
          expect(after.rate).toBeLessThanOrEqual(before.rate);
        },
      ),
      { seed: 20260315, numRuns: 200 },
    );
  });

  it("treats unanswered and returning follow-ups conservatively", () => {
    expect(
      retentionRateFromOutcomes(["IN_USE", "PASSED_ON", "RETURNING", "NO_ANSWER"]),
    ).toEqual({ retained: 2, sampleSize: 4, rate: 0.5 });
    expect(retentionRateFromOutcomes(["NO_ANSWER"])).toEqual({
      retained: 0,
      sampleSize: 1,
      rate: 0.333333,
    });
  });
});
