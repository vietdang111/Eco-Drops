import type {
  BatchStatus,
  InvoiceChecks,
  RiskTier,
  VarianceTier,
} from "./domain";
import { DomainError } from "./errors";

export const RISK_RULES_VERSION = "risk-v2";

const LEGAL_TRANSITIONS: Readonly<Record<BatchStatus, readonly BatchStatus[]>> = {
  DRAFT: ["PENDING_VERIFICATION", "BLOCKED"],
  PENDING_VERIFICATION: ["IN_TRANSIT", "BLOCKED"],
  BLOCKED: [],
  IN_TRANSIT: ["DELIVERED"],
  DELIVERED: ["RECEIVED", "UNDER_REVIEW", "REJECTED"],
  RECEIVED: ["UNDER_REVIEW", "CERTIFIED", "REJECTED"],
  UNDER_REVIEW: ["CERTIFIED", "REJECTED"],
  REJECTED: [],
  CERTIFIED: ["DISTRIBUTING"],
  DISTRIBUTING: ["CLOSED"],
  CLOSED: [],
};

export interface WeightVarianceResult {
  expectedWeightKg: number;
  actualNetWeightKg: number;
  absoluteVarianceKg: number;
  varianceRatio: number;
  variancePercent: number;
  tier: VarianceTier;
}

export interface RiskInput {
  category: string;
  quantity: number;
  unitWeightKg: number;
  declaredValueCents: number;
  authorityAttested: boolean;
  invoiceChecks: InvoiceChecks;
  baselineRisk?: RiskTier;
  baselineReasons?: readonly string[];
  policyVersion?: string;
}

export interface RiskAssessment {
  tier: RiskTier;
  rulesVersion: string;
  reasons: string[];
}

export interface CertificationGateInput {
  status: BatchStatus;
  riskTier: RiskTier | null;
  complianceAttested: boolean;
  uploaderUserId: string;
  approverUserId: string;
  varianceTier: VarianceTier | null;
  evidencePhotoCount: number;
  sampleScanCount: number;
  reviewReason?: string | null;
}

export function canTransitionBatch(from: BatchStatus, to: BatchStatus): boolean {
  return LEGAL_TRANSITIONS[from].includes(to);
}

export function assertBatchTransition(from: BatchStatus, to: BatchStatus): void {
  if (!canTransitionBatch(from, to)) {
    throw new DomainError(
      "ILLEGAL_TRANSITION",
      `Batch cannot transition from ${from} to ${to}.`,
      { from, to },
    );
  }
}

export function classifyWeightVariance(
  expectedWeightKg: number,
  actualNetWeightKg: number,
): WeightVarianceResult {
  if (!Number.isFinite(expectedWeightKg) || expectedWeightKg <= 0) {
    throw new RangeError("expectedWeightKg must be greater than zero.");
  }
  if (!Number.isFinite(actualNetWeightKg) || actualNetWeightKg < 0) {
    throw new RangeError("actualNetWeightKg must be non-negative.");
  }

  const absoluteVarianceKg = Math.abs(actualNetWeightKg - expectedWeightKg);
  const varianceRatio = absoluteVarianceKg / expectedWeightKg;
  const tier: VarianceTier = varianceRatio <= 0.05 ? "PASS" : varianceRatio <= 0.15 ? "REVIEW" : "REJECT";

  return {
    expectedWeightKg,
    actualNetWeightKg,
    absoluteVarianceKg,
    varianceRatio,
    variancePercent: varianceRatio * 100,
    tier,
  };
}

export function calculateVerifiedUnits(
  claimedUnits: number,
  netWeightKg: number,
  unitWeightKg: number,
): number {
  if (!Number.isSafeInteger(claimedUnits) || claimedUnits < 0) {
    throw new RangeError("claimedUnits must be a non-negative safe integer.");
  }
  if (!Number.isFinite(netWeightKg) || netWeightKg < 0) {
    throw new RangeError("netWeightKg must be non-negative.");
  }
  if (!Number.isFinite(unitWeightKg) || unitWeightKg <= 0) {
    throw new RangeError("unitWeightKg must be greater than zero.");
  }
  return Math.min(claimedUnits, Math.max(0, Math.floor(netWeightKg / unitWeightKg)));
}

export function calculateRemainingAllocationCapacity(
  verifiedUnits: number,
  existingItemCount: number,
  pendingAllocationQuantity: number,
): number {
  for (const [name, value] of [
    ["verifiedUnits", verifiedUnits],
    ["existingItemCount", existingItemCount],
    ["pendingAllocationQuantity", pendingAllocationQuantity],
  ] as const) {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new RangeError(`${name} must be a non-negative safe integer.`);
    }
  }
  return Math.max(0, verifiedUnits - existingItemCount - pendingAllocationQuantity);
}

export function assessBatchRisk(input: RiskInput): RiskAssessment {
  const category = input.category.trim().toLowerCase();
  const failedChecks = Object.entries(input.invoiceChecks)
    .filter(([, passed]) => !passed)
    .map(([name]) => name);
  const prohibited = ["recalled", "hazardous", "medical", "food", "chemical"].some((term) =>
    category.includes(term),
  );
  const baselineRisk = input.baselineRisk ?? "GREEN";
  const baselineReasons = [...(input.baselineReasons ?? [])];

  const hardStopReasons = [
    ...(!input.authorityAttested ? ["Missing authority attestation"] : []),
    ...failedChecks.map((check) => `Invoice ${check} check failed`),
    ...(prohibited ? ["Category is outside the safe functional-surplus policy"] : []),
  ];
  if (baselineRisk === "RED" || hardStopReasons.length > 0) {
    return {
      tier: "RED",
      rulesVersion: input.policyVersion
        ? `${RISK_RULES_VERSION}/${input.policyVersion}`
        : RISK_RULES_VERSION,
      reasons: [...new Set([...baselineReasons, ...hardStopReasons])],
    };
  }

  const totalWeightKg = input.quantity * input.unitWeightKg;
  const unitValueCents = input.quantity === 0 ? 0 : input.declaredValueCents / input.quantity;
  const reviewReasons = [
    ...(input.quantity > 1_000 ? ["Large unit count"] : []),
    ...(totalWeightKg > 1_000 ? ["Large declared shipment weight"] : []),
    ...(unitValueCents > 50_000 ? ["High declared value per unit"] : []),
  ];
  const tier: RiskTier = baselineRisk === "YELLOW" || reviewReasons.length > 0 ? "YELLOW" : "GREEN";

  return {
    tier,
    rulesVersion: input.policyVersion
      ? `${RISK_RULES_VERSION}/${input.policyVersion}`
      : RISK_RULES_VERSION,
    reasons: [...new Set([
      ...baselineReasons,
      ...reviewReasons,
      ...(baselineReasons.length === 0 && reviewReasons.length === 0
        ? ["All versioned intake checks passed"]
        : []),
    ])],
  };
}

export function assertSubmissionGate(riskTier: RiskTier, complianceAttested: boolean): void {
  if (riskTier === "YELLOW" && !complianceAttested) {
    throw new DomainError(
      "BUSINESS_GATE_FAILED",
      "Yellow-tier batches require a compliance attestation before submission.",
    );
  }
}

export function certificationGateFailures(input: CertificationGateInput): string[] {
  const failures: string[] = [];
  const eligibleState = input.status === "RECEIVED" || input.status === "UNDER_REVIEW";
  const eligibleRisk = input.riskTier === "GREEN" || input.riskTier === "YELLOW";
  const complianceReady = input.riskTier !== "YELLOW" || input.complianceAttested;
  const eligibleVariance = input.varianceTier === "PASS" || input.varianceTier === "REVIEW";
  const validPair =
    (input.status === "RECEIVED" && input.varianceTier === "PASS") ||
    (input.status === "UNDER_REVIEW" && input.varianceTier === "REVIEW");

  if (!eligibleState) failures.push("Batch is not in a receivable certification state");
  if (!eligibleRisk) {
    failures.push(
      input.riskTier === "RED"
        ? "Red-tier batches cannot be certified"
        : "Batch risk must be GREEN or YELLOW before certification",
    );
  }
  if (!complianceReady) failures.push("Yellow-tier compliance attestation is required for certification");
  if (input.uploaderUserId === input.approverUserId) failures.push("Uploader cannot approve their own batch");
  if (!eligibleVariance) failures.push("Receiving variance did not pass a certifiable gate");
  if (eligibleState && eligibleVariance && !validPair) {
    failures.push("Receiving state and variance tier are inconsistent");
  }
  if (input.evidencePhotoCount < 1) failures.push("At least one evidence photo is required");
  if (input.sampleScanCount < 1) failures.push("At least one sample scan is required");
  if (input.varianceTier === "REVIEW" && !input.reviewReason?.trim()) {
    failures.push("A review reason is required for 5–15% variance");
  }
  return failures;
}

export function assertCertificationGates(input: CertificationGateInput): void {
  const failures = certificationGateFailures(input);
  if (failures.length > 0) {
    throw new DomainError("BUSINESS_GATE_FAILED", "Certification gates did not pass.", { failures });
  }
}
