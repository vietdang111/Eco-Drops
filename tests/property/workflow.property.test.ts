import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  BATCH_STATUSES,
  RISK_TIERS,
  VARIANCE_TIERS,
  type BatchStatus,
} from "../../src/lib/domain";
import { DomainError } from "../../src/lib/errors";
import {
  assertBatchTransition,
  assertCertificationGates,
  calculateRemainingAllocationCapacity,
  calculateVerifiedUnits,
  canTransitionBatch,
  certificationGateFailures,
  classifyWeightVariance,
  type CertificationGateInput,
} from "../../src/lib/workflow";

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

const VALID_GATE: CertificationGateInput = {
  status: "RECEIVED",
  riskTier: "GREEN",
  complianceAttested: false,
  uploaderUserId: "uploader",
  approverUserId: "independent-approver",
  varianceTier: "PASS",
  evidencePhotoCount: 1,
  sampleScanCount: 1,
};

function caughtDomainError(run: () => unknown): DomainError {
  let caught: unknown;
  try {
    run();
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(DomainError);
  return caught as DomainError;
}

describe("verified units", () => {
  it("never exceeds the claim and equals the weight-derived floor", () => {
    fc.assert(
      fc.property(
        fc.record({
          claimedUnits: fc.integer({ min: 0, max: 1_000_000 }),
          netWeightKg: fc.integer({ min: 0, max: 10_000_000 }),
          unitWeightKg: fc.integer({ min: 1, max: 10_000 }),
        }),
        ({ claimedUnits, netWeightKg, unitWeightKg }) => {
          const verified = calculateVerifiedUnits(claimedUnits, netWeightKg, unitWeightKg);
          const weightDerivedFloor = Math.floor(netWeightKg / unitWeightKg);

          expect(verified).toBe(Math.min(claimedUnits, weightDerivedFloor));
          expect(verified).toBeGreaterThanOrEqual(0);
          expect(verified).toBeLessThanOrEqual(claimedUnits);
          expect(Number.isInteger(verified)).toBe(true);
        },
      ),
      { seed: 20260301, numRuns: 200 },
    );
  });

  it.each([
    [10, 8.9, 2, 4],
    [10, 99, 2, 10],
    [0, 99, 2, 0],
  ] as const)(
    "returns %d for %d claimed units, %d kg net, and %d kg units",
    (claimedUnits, netWeightKg, unitWeightKg, expected) => {
      expect(calculateVerifiedUnits(claimedUnits, netWeightKg, unitWeightKg)).toBe(expected);
    },
  );
});

describe("allocation capacity", () => {
  it("subtracts every materialized item and pending allocation exactly once", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 1_000_000 }),
        fc.integer({ min: 0, max: 1_000_000 }),
        fc.integer({ min: 0, max: 1_000_000 }),
        (verifiedUnits, existingItemCount, pendingAllocationQuantity) => {
          const capacity = calculateRemainingAllocationCapacity(
            verifiedUnits,
            existingItemCount,
            pendingAllocationQuantity,
          );
          expect(capacity).toBe(
            Math.max(0, verifiedUnits - existingItemCount - pendingAllocationQuantity),
          );
          expect(capacity).toBeGreaterThanOrEqual(0);
          expect(Number.isSafeInteger(capacity)).toBe(true);
        },
      ),
      { seed: 20260324, numRuns: 250 },
    );
  });
});

describe("weight variance", () => {
  it("is symmetric for equal deviations above and below expected weight", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 1_000_000 }),
        fc.integer({ min: 0, max: 1_000_000 }),
        (base, deviation) => {
          const expectedWeightKg = base + deviation + 1;
          const below = classifyWeightVariance(expectedWeightKg, expectedWeightKg - deviation);
          const above = classifyWeightVariance(expectedWeightKg, expectedWeightKg + deviation);

          expect(below.absoluteVarianceKg).toBe(deviation);
          expect(above.absoluteVarianceKg).toBe(deviation);
          expect(below.varianceRatio).toBe(above.varianceRatio);
          expect(below.variancePercent).toBe(above.variancePercent);
          expect(below.tier).toBe(above.tier);
        },
      ),
      { seed: 20260302, numRuns: 200 },
    );
  });

  it.each([
    ["exactly 5% below", 95, "PASS"],
    ["exactly 5% above", 105, "PASS"],
    ["exactly 15% below", 85, "REVIEW"],
    ["exactly 15% above", 115, "REVIEW"],
    ["more than 15% below", 84.999999, "REJECT"],
    ["more than 15% above", 115.000001, "REJECT"],
  ] as const)("classifies %s as %s", (_label, actualNetWeightKg, expectedTier) => {
    expect(classifyWeightVariance(100, actualNetWeightKg).tier).toBe(expectedTier);
  });
});

describe("certification gates", () => {
  it("agrees with the complete certification eligibility model", () => {
    const reviewReasonArbitrary = fc.constantFrom<string | null | undefined>(
      undefined,
      null,
      "",
      "   ",
      "independent review completed",
    );

    fc.assert(
      fc.property(
        fc.constantFrom(...BATCH_STATUSES),
        fc.oneof(fc.constant(null), fc.constantFrom(...RISK_TIERS)),
        fc.boolean(),
        fc.boolean(),
        fc.oneof(fc.constant(null), fc.constantFrom(...VARIANCE_TIERS)),
        fc.integer({ min: 0, max: 3 }),
        fc.integer({ min: 0, max: 3 }),
        reviewReasonArbitrary,
        (status, riskTier, complianceAttested, sameApprover, varianceTier, evidencePhotoCount, sampleScanCount, reviewReason) => {
          const input: CertificationGateInput = {
            status,
            riskTier,
            complianceAttested,
            uploaderUserId: "uploader",
            approverUserId: sameApprover ? "uploader" : "independent-approver",
            varianceTier,
            evidencePhotoCount,
            sampleScanCount,
            reviewReason,
          };
          const eligibleState = status === "RECEIVED" || status === "UNDER_REVIEW";
          const eligibleRisk = riskTier === "GREEN" || riskTier === "YELLOW";
          const complianceReady = riskTier !== "YELLOW" || complianceAttested;
          const eligibleVariance = varianceTier === "PASS" || varianceTier === "REVIEW";
          const validPair =
            (status === "RECEIVED" && varianceTier === "PASS") ||
            (status === "UNDER_REVIEW" && varianceTier === "REVIEW");
          const hasReviewReason = typeof reviewReason === "string" && reviewReason.trim().length > 0;
          const shouldPass =
            validPair &&
            eligibleRisk &&
            complianceReady &&
            !sameApprover &&
            evidencePhotoCount > 0 &&
            sampleScanCount > 0 &&
            (varianceTier !== "REVIEW" || hasReviewReason);
          const failures = certificationGateFailures(input);

          expect(failures.includes("Batch is not in a receivable certification state")).toBe(!eligibleState);
          expect(failures.includes("Red-tier batches cannot be certified")).toBe(riskTier === "RED");
          expect(failures.includes("Batch risk must be GREEN or YELLOW before certification")).toBe(
            riskTier === null,
          );
          expect(failures.includes("Yellow-tier compliance attestation is required for certification")).toBe(
            riskTier === "YELLOW" && !complianceAttested,
          );
          expect(failures.includes("Uploader cannot approve their own batch")).toBe(sameApprover);
          expect(failures.includes("Receiving variance did not pass a certifiable gate")).toBe(!eligibleVariance);
          expect(failures.includes("Receiving state and variance tier are inconsistent")).toBe(
            eligibleState && eligibleVariance && !validPair,
          );
          expect(failures.includes("At least one evidence photo is required")).toBe(evidencePhotoCount < 1);
          expect(failures.includes("At least one sample scan is required")).toBe(sampleScanCount < 1);
          expect(failures.includes("A review reason is required for 5–15% variance")).toBe(
            varianceTier === "REVIEW" && !hasReviewReason,
          );
          expect(failures.length === 0).toBe(shouldPass);

          if (shouldPass) {
            expect(() => assertCertificationGates(input)).not.toThrow();
          } else {
            expect(caughtDomainError(() => assertCertificationGates(input)).code).toBe(
              "BUSINESS_GATE_FAILED",
            );
          }
        },
      ),
      { seed: 20260303, numRuns: 300 },
    );
  });

  const failureCases: ReadonlyArray<
    readonly [string, Partial<CertificationGateInput>, string]
  > = [
    ["an eligible state", { status: "DELIVERED" }, "Batch is not in a receivable certification state"],
    ["non-red risk", { riskTier: "RED" }, "Red-tier batches cannot be certified"],
    ["an explicit green or yellow risk", { riskTier: null }, "Batch risk must be GREEN or YELLOW before certification"],
    ["a YELLOW compliance attestation", { riskTier: "YELLOW", complianceAttested: false }, "Yellow-tier compliance attestation is required for certification"],
    ["a RECEIVED+PASS pairing", { status: "RECEIVED", varianceTier: "REVIEW", reviewReason: "reviewed" }, "Receiving state and variance tier are inconsistent"],
    ["an UNDER_REVIEW+REVIEW pairing", { status: "UNDER_REVIEW", varianceTier: "PASS" }, "Receiving state and variance tier are inconsistent"],
    ["a different approver", { approverUserId: "uploader" }, "Uploader cannot approve their own batch"],
    ["a certifiable variance", { varianceTier: "REJECT" }, "Receiving variance did not pass a certifiable gate"],
    ["evidence", { evidencePhotoCount: 0 }, "At least one evidence photo is required"],
    ["a sample scan", { sampleScanCount: 0 }, "At least one sample scan is required"],
    [
      "a review reason for review-tier variance",
      { varianceTier: "REVIEW", reviewReason: "   " },
      "A review reason is required for 5–15% variance",
    ],
  ];

  it.each(failureCases)("requires %s", (_label, override, expectedFailure) => {
    const failures = certificationGateFailures({ ...VALID_GATE, ...override });
    expect(failures).toContain(expectedFailure);
  });

  it("accepts review-tier variance only with a nonblank review reason", () => {
    expect(
      certificationGateFailures({
        ...VALID_GATE,
        status: "UNDER_REVIEW",
        varianceTier: "REVIEW",
        reviewReason: "Independent weight review completed",
      }),
    ).toEqual([]);
  });
});

describe("batch state transitions", () => {
  it("matches the legal-transition model for arbitrary state pairs", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...BATCH_STATUSES),
        fc.constantFrom(...BATCH_STATUSES),
        (from, to) => {
          const legal = LEGAL_TRANSITIONS[from].includes(to);
          expect(canTransitionBatch(from, to)).toBe(legal);

          if (legal) {
            expect(() => assertBatchTransition(from, to)).not.toThrow();
          } else {
            const error = caughtDomainError(() => assertBatchTransition(from, to));
            expect(error.code).toBe("ILLEGAL_TRANSITION");
            expect(error.httpStatus).toBe(409);
            expect(error.details).toEqual({ from, to });
          }
        },
      ),
      { seed: 20260304, numRuns: 300 },
    );
  });

  it("rejects every illegal pair in the finite transition matrix", () => {
    for (const from of BATCH_STATUSES) {
      for (const to of BATCH_STATUSES) {
        if (!LEGAL_TRANSITIONS[from].includes(to)) {
          expect(caughtDomainError(() => assertBatchTransition(from, to)).code).toBe(
            "ILLEGAL_TRANSITION",
          );
        }
      }
    }
  });
});
