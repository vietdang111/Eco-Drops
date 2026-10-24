import type { FollowUpOutcome } from "./domain";

export const CARBON_FORMULA_VERSION = "avoided-emissions-v1";
export const SCENARIOS = ["low", "base", "high"] as const;
export type CarbonScenario = (typeof SCENARIOS)[number];

export interface ScenarioAssumptions {
  factorKgCO2ePerKg: number;
  displacementRate: number;
  retentionRate: number;
  handlingKgCO2ePerItem: number;
}

export interface CarbonCalculationInput {
  unitWeightKg: number;
  eligibleUnits: number;
  methodologySource: string;
  methodologyVersion: string;
  factorVersion: string;
  formulaVersion?: string;
  scenarios: Record<CarbonScenario, ScenarioAssumptions>;
  sampleSizes: {
    displacement: number;
    retention: number;
  };
}

export interface ScenarioEstimate extends ScenarioAssumptions {
  embodiedNewKgCO2ePerItem: number;
  estimatedAvoidedEmissionsKgCO2ePerItem: number;
  estimatedAvoidedEmissionsKgCO2e: number;
}

export interface AvoidedEmissionsEstimate {
  label: "Estimated avoided emissions";
  verified: boolean;
  eligibleUnits: number;
  unitWeightKg: number;
  methodologySource: string;
  methodologyVersion: string;
  factorVersion: string;
  formulaVersion: string;
  formula: string;
  sampleSizes: {
    displacement: number;
    retention: number;
  };
  scenarios: Record<CarbonScenario, ScenarioEstimate>;
}

export interface SmoothedRateInput {
  positive: number;
  total: number;
  priorPositive?: number;
  priorNegative?: number;
}

const FORMULA =
  "max(0, unit_weight_kg × factor_kgCO2e_per_kg × displacement_rate × retention_rate − handling_kgCO2e_per_item) × eligible_units";

function assertFiniteNonNegative(value: number, name: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${name} must be a finite non-negative number.`);
  }
}

function assertRate(value: number, name: string): void {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new RangeError(`${name} must be between 0 and 1.`);
  }
}

function rounded(value: number): number {
  return Math.round((value + Number.EPSILON) * 1_000_000) / 1_000_000;
}

export function smoothRate({
  positive,
  total,
  priorPositive = 1,
  priorNegative = 1,
}: SmoothedRateInput): number {
  if (!Number.isInteger(positive) || !Number.isInteger(total) || positive < 0 || total < positive) {
    throw new RangeError("Smoothed-rate counts must be non-negative integers with positive <= total.");
  }
  assertFiniteNonNegative(priorPositive, "priorPositive");
  assertFiniteNonNegative(priorNegative, "priorNegative");
  const denominator = total + priorPositive + priorNegative;
  if (denominator === 0) {
    throw new RangeError("A smoothed rate needs observations or a non-zero prior.");
  }
  return rounded((positive + priorPositive) / denominator);
}

export function retentionRateFromOutcomes(
  outcomes: readonly FollowUpOutcome[],
  priorPositive = 1,
  priorNegative = 1,
): { rate: number; retained: number; sampleSize: number } {
  const retained = outcomes.filter((outcome) => outcome === "IN_USE" || outcome === "PASSED_ON").length;
  // RETURNING and NO_ANSWER are deliberately in the denominator and therefore not retained.
  return {
    rate: smoothRate({ positive: retained, total: outcomes.length, priorPositive, priorNegative }),
    retained,
    sampleSize: outcomes.length,
  };
}

export function calculateScenarioEstimate(
  unitWeightKg: number,
  eligibleUnits: number,
  assumptions: ScenarioAssumptions,
): ScenarioEstimate {
  assertFiniteNonNegative(unitWeightKg, "unitWeightKg");
  if (!Number.isSafeInteger(eligibleUnits) || eligibleUnits < 0) {
    throw new RangeError("eligibleUnits must be a non-negative safe integer.");
  }
  assertFiniteNonNegative(assumptions.factorKgCO2ePerKg, "factorKgCO2ePerKg");
  assertRate(assumptions.displacementRate, "displacementRate");
  assertRate(assumptions.retentionRate, "retentionRate");
  assertFiniteNonNegative(assumptions.handlingKgCO2ePerItem, "handlingKgCO2ePerItem");

  const embodiedNew = unitWeightKg * assumptions.factorKgCO2ePerKg;
  const avoidedPerItem = Math.max(
    0,
    embodiedNew * assumptions.displacementRate * assumptions.retentionRate -
      assumptions.handlingKgCO2ePerItem,
  );

  return {
    ...assumptions,
    embodiedNewKgCO2ePerItem: rounded(embodiedNew),
    estimatedAvoidedEmissionsKgCO2ePerItem: rounded(avoidedPerItem),
    estimatedAvoidedEmissionsKgCO2e: rounded(avoidedPerItem * eligibleUnits),
  };
}

export function calculateAvoidedEmissions(
  input: CarbonCalculationInput,
  verified = false,
): AvoidedEmissionsEstimate {
  if (!input.methodologySource || !input.methodologyVersion || !input.factorVersion) {
    throw new RangeError("Methodology source and versions are required.");
  }
  assertFiniteNonNegative(input.sampleSizes.displacement, "displacement sample size");
  assertFiniteNonNegative(input.sampleSizes.retention, "retention sample size");

  return {
    label: "Estimated avoided emissions",
    verified,
    eligibleUnits: input.eligibleUnits,
    unitWeightKg: input.unitWeightKg,
    methodologySource: input.methodologySource,
    methodologyVersion: input.methodologyVersion,
    factorVersion: input.factorVersion,
    formulaVersion: input.formulaVersion ?? CARBON_FORMULA_VERSION,
    formula: FORMULA,
    sampleSizes: { ...input.sampleSizes },
    scenarios: {
      low: calculateScenarioEstimate(input.unitWeightKg, input.eligibleUnits, input.scenarios.low),
      base: calculateScenarioEstimate(input.unitWeightKg, input.eligibleUnits, input.scenarios.base),
      high: calculateScenarioEstimate(input.unitWeightKg, input.eligibleUnits, input.scenarios.high),
    },
  };
}
