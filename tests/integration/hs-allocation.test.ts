import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ActorContext } from "../../src/lib/domain";
import { DomainError, type DomainErrorCode } from "../../src/lib/errors";
import {
  DEMO_BATCHES,
  DEMO_ORGANIZATIONS,
  DEMO_TIMESTAMP,
} from "../../src/lib/seed";
import {
  adminActor,
  campusActor,
  corporateActor,
  createSeededServiceHarness,
  startCompatibleKioskSession,
  warehouseActor,
  type SeededServiceHarness,
} from "../helpers/seeded-service";

function caughtDomainError(run: () => unknown, expectedCode: DomainErrorCode): DomainError {
  let caught: unknown;
  try {
    run();
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(DomainError);
  expect((caught as DomainError).code).toBe(expectedCode);
  return caught as DomainError;
}

function invoice(marker: string): { mimeType: "application/pdf"; bytes: Uint8Array<ArrayBuffer> } {
  const source = Buffer.from(`%PDF-1.7\n${marker}`);
  const bytes = new Uint8Array(new ArrayBuffer(source.byteLength));
  bytes.set(source);
  return {
    mimeType: "application/pdf",
    bytes,
  };
}

describe("HS policy and certified campus distribution", () => {
  let harness: SeededServiceHarness;

  beforeEach(async () => {
    harness = await createSeededServiceHarness(3);
  });

  afterEach(() => {
    harness.db.close();
  });

  it("publishes the exact active HS mappings without claiming condition or recall proof", () => {
    const expected = {
      "847130": ["electronics", "YELLOW", "REVIEW"],
      "850440": ["electronics", "YELLOW", "REVIEW"],
      "610910": ["apparel", "GREEN", "ELIGIBLE"],
      "482010": ["study supplies", "GREEN", "ELIGIBLE"],
      "902110": ["medical equipment", "RED", "BLOCKED"],
    } as const;

    for (const [hsCode, [category, baselineRisk, policyDecision]] of Object.entries(expected)) {
      const policy = harness.service.getHsCodePolicy(corporateActor, hsCode);
      expect(policy).toMatchObject({
        hsCode,
        category,
        baselineRisk,
        policyDecision,
        policyVersion: "hs-policy-2026.1",
        active: true,
      });
      expect(policy.notice).toContain("does not prove item condition");
      expect(policy.notice).toContain("recall status");
    }
  });

  it("derives category from HS, rejects legacy mismatch, and fails unknown codes closed", () => {
    const created = harness.service.createBatch(corporateActor, {
      hsCode: "610910",
      quantity: 10,
      unitWeightKg: 0.2,
      declaredValueCents: 10_000,
      invoiceIdentifier: "HS-DERIVED-001",
      authorityAttested: true,
      invoice: invoice("derived-category"),
    });
    expect(created.category).toBe("apparel");
    expect(
      harness.db.prepare<[string], { category: string; factorId: string }>(
        "SELECT category, factor_id AS factorId FROM batches WHERE id = ?",
      ).get(created.id),
    ).toEqual({ category: "apparel", factorId: "factor-apparel-v1" });

    const mismatch = caughtDomainError(
      () => harness.service.createBatch(corporateActor, {
        hsCode: "482010",
        category: "electronics",
        quantity: 5,
        unitWeightKg: 0.4,
        declaredValueCents: 5_000,
        invoiceIdentifier: "HS-MISMATCH-001",
        authorityAttested: true,
        invoice: invoice("mismatch"),
      }),
      "INVALID_INPUT",
    );
    expect(mismatch.details).toMatchObject({
      providedCategory: "electronics",
      derivedCategory: "study supplies",
    });

    const unknown = caughtDomainError(
      () => harness.service.createBatch(corporateActor, {
        hsCode: "999999",
        category: "electronics",
        quantity: 5,
        unitWeightKg: 1,
        declaredValueCents: 5_000,
        invoiceIdentifier: "HS-UNKNOWN-001",
        authorityAttested: true,
        invoice: invoice("unknown"),
      }),
      "BUSINESS_GATE_FAILED",
    );
    expect(unknown.message).toContain("fails closed");
  });

  it("combines catalog baseline risk with intake rules at submission", () => {
    const yellow = harness.service.createBatch(corporateActor, {
      hsCode: "850440",
      category: "electronics",
      quantity: 10,
      unitWeightKg: 0.2,
      declaredValueCents: 10_000,
      invoiceIdentifier: "YELLOW-BASELINE-001",
      authorityAttested: true,
      invoice: invoice("yellow-baseline"),
    });
    expect(
      caughtDomainError(
        () => harness.service.submitBatch(corporateActor, {
          batchId: yellow.id,
          complianceAttested: false,
        }),
        "BUSINESS_GATE_FAILED",
      ).message,
    ).toContain("compliance attestation");
    const submittedYellow = harness.service.submitBatch(corporateActor, {
      batchId: yellow.id,
      complianceAttested: true,
    });
    expect(submittedYellow).toMatchObject({
      category: "electronics",
      status: "PENDING_VERIFICATION",
      riskTier: "YELLOW",
      complianceAttested: true,
    });

    const green = harness.service.createBatch(corporateActor, {
      hsCode: "482010",
      quantity: 10,
      unitWeightKg: 0.2,
      declaredValueCents: 10_000,
      invoiceIdentifier: "GREEN-BASELINE-001",
      authorityAttested: true,
      invoice: invoice("green-baseline"),
    });
    expect(harness.service.submitBatch(corporateActor, {
      batchId: green.id,
      complianceAttested: false,
    })).toMatchObject({
      category: "study supplies",
      status: "PENDING_VERIFICATION",
      riskTier: "GREEN",
    });

    const sizeReview = harness.service.createBatch(corporateActor, {
      hsCode: "610910",
      quantity: 1_001,
      unitWeightKg: 0.1,
      declaredValueCents: 100_100,
      invoiceIdentifier: "SIZE-REVIEW-001",
      authorityAttested: true,
      invoice: invoice("size-review"),
    });
    expect(() => harness.service.submitBatch(corporateActor, {
      batchId: sizeReview.id,
      complianceAttested: false,
    })).toThrow(DomainError);
    expect(harness.service.submitBatch(corporateActor, {
      batchId: sizeReview.id,
      complianceAttested: true,
    })).toMatchObject({ status: "PENDING_VERIFICATION", riskTier: "YELLOW" });

    const red = harness.service.createBatch(corporateActor, {
      hsCode: "902110",
      category: "medical equipment",
      quantity: 2,
      unitWeightKg: 1,
      declaredValueCents: 2_000,
      invoiceIdentifier: "RED-BASELINE-001",
      authorityAttested: true,
      invoice: invoice("red-baseline"),
    });
    expect(harness.service.submitBatch(corporateActor, {
      batchId: red.id,
      complianceAttested: true,
    })).toMatchObject({ status: "BLOCKED", riskTier: "RED" });
  });

  it("certifies RECEIVED+PASS and UNDER_REVIEW+REVIEW with all existing gates", () => {
    const received = harness.service.receiveBatch(warehouseActor, {
      batchId: DEMO_BATCHES.delivered,
      grossWeightKg: 38,
      tareWeightKg: 2,
      sampleScanCount: 4,
      evidencePhotos: [{
        mimeType: "image/jpeg",
        bytes: Uint8Array.from([0xff, 0xd8, 0xff, 0x00]),
      }],
    });
    expect(received).toMatchObject({ batchStatus: "RECEIVED", varianceTier: "PASS" });
    expect(harness.service.certifyBatch(warehouseActor, {
      batchId: DEMO_BATCHES.delivered,
    }).status).toBe("CERTIFIED");

    expect(harness.service.certifyBatch(warehouseActor, {
      batchId: DEMO_BATCHES.review,
      reviewReason: "Independent weight reconciliation accepted.",
    }).status).toBe("CERTIFIED");
  });

  it("rejects mismatched certification state/variance and null risk", () => {
    harness.db.prepare("UPDATE batches SET status = 'RECEIVED' WHERE id = ?")
      .run(DEMO_BATCHES.review);
    const mismatch = caughtDomainError(
      () => harness.service.certifyBatch(warehouseActor, {
        batchId: DEMO_BATCHES.review,
        reviewReason: "Independent weight reconciliation accepted.",
      }),
      "BUSINESS_GATE_FAILED",
    );
    expect((mismatch.details as { failures: string[] }).failures)
      .toContain("Receiving state and variance tier are inconsistent");

    harness.db.prepare("UPDATE batches SET status = 'UNDER_REVIEW', risk_tier = NULL WHERE id = ?")
      .run(DEMO_BATCHES.review);
    const nullRisk = caughtDomainError(
      () => harness.service.certifyBatch(warehouseActor, {
        batchId: DEMO_BATCHES.review,
        reviewReason: "Independent weight reconciliation accepted.",
      }),
      "BUSINESS_GATE_FAILED",
    );
    expect((nullRisk.details as { failures: string[] }).failures)
      .toContain("Batch risk must be GREEN or YELLOW before certification");
  });

  it("reserves only the six unmaterialized seeded units and replays allocation exactly once", () => {
    const detail = harness.readModels.getBatchDetail(warehouseActor, DEMO_BATCHES.certified);
    expect(detail.allocations).toEqual([]);
    expect(detail.distribution).toEqual({
      verifiedUnits: 12,
      existingItemCount: 6,
      pendingAllocationQuantity: 0,
      receivedAllocationQuantity: 0,
      totalAllocationQuantity: 0,
      remainingCapacity: 6,
      fullyDistributed: false,
    });

    const invalidMaximum = caughtDomainError(
      () => harness.service.createCampusAllocation(warehouseActor, {
        batchId: DEMO_BATCHES.certified,
        campusOrganizationId: DEMO_ORGANIZATIONS.campus,
        quantity: 501,
        idempotencyKey: "allocation-above-maximum",
      }),
      "INVALID_INPUT",
    );
    expect(invalidMaximum.message).toBe("Request validation failed.");

    const tooLarge = caughtDomainError(
      () => harness.service.createCampusAllocation(warehouseActor, {
        batchId: DEMO_BATCHES.certified,
        campusOrganizationId: DEMO_ORGANIZATIONS.campus,
        quantity: 7,
        idempotencyKey: "over-allocation-0001",
      }),
      "BUSINESS_GATE_FAILED",
    );
    expect(tooLarge.details).toMatchObject({ remainingCapacity: 6 });

    const request = {
      batchId: DEMO_BATCHES.certified,
      campusOrganizationId: DEMO_ORGANIZATIONS.campus,
      quantity: 6,
      idempotencyKey: "allocation-replay-0001",
    } as const;
    const first = harness.service.createCampusAllocation(warehouseActor, request);
    expect(harness.service.createCampusAllocation(warehouseActor, request)).toEqual(first);
    expect(first).toMatchObject({
      batchStatus: "DISTRIBUTING",
      distribution: { remainingCapacity: 0, pendingAllocationQuantity: 6 },
      allocation: { quantity: 6, status: "ALLOCATED", itemCount: 0 },
    });
    expect(harness.db.prepare<[], { count: number }>(
      "SELECT COUNT(*) AS count FROM campus_allocations",
    ).get()?.count).toBe(1);
  });

  it("materializes canonical available items only at campus receipt and closes at exact capacity", () => {
    const allocation = harness.service.createCampusAllocation(warehouseActor, {
      batchId: DEMO_BATCHES.certified,
      campusOrganizationId: DEMO_ORGANIZATIONS.campus,
      quantity: 6,
      idempotencyKey: "exact-capacity-allocation",
    });
    const kiosk = startCompatibleKioskSession(harness.service, "receipt-visibility-person-0001");
    expect(harness.service.matchKioskItems({ token: kiosk.token })).toHaveLength(2);
    expect(allocation.allocation.itemCount).toBe(0);

    const request = {
      allocationId: allocation.allocation.id,
      labelPrefix: "Campus Laptop",
      compatibility: { connector: "usb-c" },
      needTags: ["coursework"],
      idempotencyKey: "exact-capacity-receipt",
    };
    const receipt = harness.service.receiveCampusAllocation(campusActor, request);
    expect(harness.service.receiveCampusAllocation(campusActor, request)).toEqual(receipt);
    expect(receipt).toMatchObject({
      itemsCreated: 6,
      batchStatus: "CLOSED",
      allocation: { status: "RECEIVED", itemCount: 6, category: "electronics" },
      distribution: {
        verifiedUnits: 12,
        existingItemCount: 12,
        pendingAllocationQuantity: 0,
        remainingCapacity: 0,
        fullyDistributed: true,
      },
    });
    expect(new Set(receipt.itemIds).size).toBe(6);
    expect(harness.db.prepare<[string], { count: number }>(
      `SELECT COUNT(*) AS count FROM allocation_items ai
        JOIN items i ON i.id = ai.item_id
       WHERE ai.allocation_id = ? AND i.status = 'AVAILABLE' AND i.category = 'electronics'`,
    ).get(allocation.allocation.id)?.count).toBe(6);
    expect(harness.service.matchKioskItems({ token: kiosk.token })).toHaveLength(8);
  });

  it("keeps DISTRIBUTING for partial receipt and enforces role-scoped allocation visibility", () => {
    const outsiderCampusId = "org-campus-unaddressed";
    const outsiderUserId = "user-campus-unaddressed";
    harness.db.prepare(
      `INSERT INTO organizations (id, name, slug, kind, synthetic, created_at)
       VALUES (?, 'Unaddressed Campus', 'unaddressed-campus', 'campus', 0, ?)`,
    ).run(outsiderCampusId, DEMO_TIMESTAMP);
    harness.db.prepare(
      `INSERT INTO users (id, org_id, email, password_hash, role, synthetic, created_at)
       VALUES (?, ?, 'unaddressed@example.test', 'unused', 'campus_admin', 0, ?)`,
    ).run(outsiderUserId, outsiderCampusId, DEMO_TIMESTAMP);
    const outsiderCampusActor: ActorContext = {
      userId: outsiderUserId,
      organizationId: outsiderCampusId,
      role: "campus_admin",
    };

    const created = harness.service.createCampusAllocation(adminActor, {
      batchId: DEMO_BATCHES.certified,
      campusOrganizationId: DEMO_ORGANIZATIONS.campus,
      quantity: 2,
      idempotencyKey: "partial-allocation-0001",
    });
    expect(harness.readModels.listAllocations(corporateActor)).toHaveLength(1);
    expect(harness.readModels.listAllocations(warehouseActor)).toHaveLength(1);
    expect(harness.readModels.listAllocations(adminActor)).toHaveLength(1);
    expect(harness.readModels.listAllocations(campusActor)).toHaveLength(1);
    expect(harness.readModels.listAllocations(outsiderCampusActor)).toEqual([]);
    expect(harness.readModels.listBatches(campusActor).map((batch) => batch.id))
      .toContain(DEMO_BATCHES.certified);
    expect(harness.readModels.listBatches(outsiderCampusActor).map((batch) => batch.id))
      .not.toContain(DEMO_BATCHES.certified);
    expect(harness.readModels.getBatchDetail(campusActor, DEMO_BATCHES.certified).allocations)
      .toHaveLength(1);
    expect(caughtDomainError(
      () => harness.readModels.getAllocation(outsiderCampusActor, created.allocation.id),
      "NOT_FOUND",
    ).httpStatus).toBe(404);

    const receipt = harness.service.receiveCampusAllocation(campusActor, {
      allocationId: created.allocation.id,
      idempotencyKey: "partial-receipt-0001",
    });
    expect(receipt).toMatchObject({
      itemsCreated: 2,
      batchStatus: "DISTRIBUTING",
      distribution: { existingItemCount: 8, remainingCapacity: 4, fullyDistributed: false },
    });
    expect(caughtDomainError(
      () => harness.service.receiveCampusAllocation(warehouseActor, {
        allocationId: created.allocation.id,
        idempotencyKey: "warehouse-cannot-receive",
      }),
      "FORBIDDEN",
    ).httpStatus).toBe(403);
    expect(caughtDomainError(
      () => harness.service.createCampusAllocation(corporateActor, {
        batchId: DEMO_BATCHES.certified,
        campusOrganizationId: DEMO_ORGANIZATIONS.campus,
        quantity: 1,
        idempotencyKey: "corporate-cannot-allocate",
      }),
      "FORBIDDEN",
    ).httpStatus).toBe(403);
    expect(harness.readModels.listCampuses(warehouseActor)).toContainEqual({
      id: DEMO_ORGANIZATIONS.campus,
      name: "Synthetic Demo Campus",
      slug: "synthetic-demo-campus",
      synthetic: true,
    });
    expect(caughtDomainError(
      () => harness.readModels.listCampuses(campusActor),
      "FORBIDDEN",
    ).httpStatus).toBe(403);
  });
});
