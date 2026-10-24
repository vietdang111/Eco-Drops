import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ActorContext } from "../../src/lib/domain";
import { DomainError, type DomainErrorCode } from "../../src/lib/errors";
import {
  DEMO_BATCHES,
  DEMO_TIMESTAMP,
  DEMO_USERS,
} from "../../src/lib/seed";
import {
  corporateActor,
  createSeededServiceHarness,
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

describe("service safety boundaries", () => {
  let harness: SeededServiceHarness;

  beforeEach(async () => {
    harness = await createSeededServiceHarness();
  });

  afterEach(() => {
    harness.db.close();
  });

  it("prevents a red-tier batch from being shipped", () => {
    const error = caughtDomainError(
      () => harness.service.createShipment(corporateActor, { batchId: DEMO_BATCHES.blocked }),
      "BUSINESS_GATE_FAILED",
    );

    expect(error.message).toBe("Red-tier batches cannot be shipped.");
    expect(
      harness.db
        .prepare<[string], { count: number }>(
          "SELECT COUNT(*) AS count FROM shipments WHERE batch_id = ?",
        )
        .get(DEMO_BATCHES.blocked)?.count,
    ).toBe(0);
    expect(
      harness.db
        .prepare<[string], { status: string }>("SELECT status FROM batches WHERE id = ?")
        .get(DEMO_BATCHES.blocked)?.status,
    ).toBe("BLOCKED");
  });

  it("prevents red-tier certification even if storage is forced into an otherwise eligible state", () => {
    harness.db
      .prepare("UPDATE batches SET status = 'RECEIVED' WHERE id = ?")
      .run(DEMO_BATCHES.blocked);
    harness.db
      .prepare(
        `INSERT INTO receivings
          (id, batch_id, received_by_user_id, gross_weight_kg, tare_weight_kg, net_weight_kg,
           expected_weight_kg, absolute_variance_kg, variance_ratio, variance_tier,
           sample_scan_count, verified_units, received_at)
         VALUES ('receiving-red-defense-test', ?, ?, 20, 0, 20, 20, 0, 0, 'PASS', 1, 10, ?)`,
      )
      .run(DEMO_BATCHES.blocked, DEMO_USERS.warehouse.id, DEMO_TIMESTAMP);
    harness.db
      .prepare(
        `INSERT INTO evidence_photos
          (id, receiving_id, storage_name, content_hash, mime_type, size_bytes, created_at)
         VALUES ('evidence-red-defense-test', 'receiving-red-defense-test',
                 'red-defense-test.jpg', ?, 'image/jpeg', 3, ?)`,
      )
      .run("a".repeat(64), DEMO_TIMESTAMP);

    const error = caughtDomainError(
      () => harness.service.certifyBatch(warehouseActor, { batchId: DEMO_BATCHES.blocked }),
      "BUSINESS_GATE_FAILED",
    );
    const failures = (error.details as { failures?: string[] } | undefined)?.failures;

    expect(failures).toContain("Red-tier batches cannot be certified");
    expect(
      harness.db
        .prepare<[string], { count: number }>(
          "SELECT COUNT(*) AS count FROM certificates WHERE batch_id = ?",
        )
        .get(DEMO_BATCHES.blocked)?.count,
    ).toBe(0);
    expect(
      harness.db
        .prepare<[string], { status: string }>("SELECT status FROM batches WHERE id = ?")
        .get(DEMO_BATCHES.blocked)?.status,
    ).toBe("RECEIVED");
  });

  it("rejects cross-organization private access without revealing record existence", () => {
    const outsiderOrganizationId = "org-test-outsider";
    const outsiderUserId = "user-test-outsider";
    harness.db
      .prepare(
        `INSERT INTO organizations (id, name, slug, kind, synthetic, created_at)
         VALUES (?, 'Outsider Test Organization', 'outsider-test-organization', 'corporate', 1, ?)`,
      )
      .run(outsiderOrganizationId, DEMO_TIMESTAMP);
    harness.db
      .prepare(
        `INSERT INTO users (id, org_id, email, password_hash, role, synthetic, created_at)
         VALUES (?, ?, 'outsider@example.test', 'unused-test-password-hash', 'corp_user', 1, ?)`,
      )
      .run(outsiderUserId, outsiderOrganizationId, DEMO_TIMESTAMP);
    const outsiderActor: ActorContext = {
      userId: outsiderUserId,
      organizationId: outsiderOrganizationId,
      role: "corp_user",
    };

    expect(
      caughtDomainError(
        () => harness.service.getBatchImpact(outsiderActor, DEMO_BATCHES.certified),
        "NOT_FOUND",
      ).httpStatus,
    ).toBe(404);
    expect(
      caughtDomainError(
        () => harness.service.getCertificateExport(outsiderActor, "ECD-SYNTHETIC-0001"),
        "NOT_FOUND",
      ).httpStatus,
    ).toBe(404);

    const forgedActor: ActorContext = {
      ...corporateActor,
      organizationId: outsiderOrganizationId,
    };
    expect(
      caughtDomainError(
        () => harness.service.getBatchImpact(forgedActor, DEMO_BATCHES.certified),
        "FORBIDDEN",
      ).httpStatus,
    ).toBe(403);
  });

  it("keeps synthetic history within the three-claim demo cap per anonymous week", () => {
    const violations = harness.db.prepare<[], { weeklyKeyHash: string; weekKey: string; count: number }>(
      `SELECT ks.weekly_key_hash AS weeklyKeyHash, c.week_key AS weekKey, COUNT(*) AS count
         FROM claims c JOIN kiosk_sessions ks ON ks.id = c.kiosk_session_id
        GROUP BY ks.weekly_key_hash, c.week_key
       HAVING COUNT(*) > 3`,
    ).all();

    expect(violations).toEqual([]);
  });
});
