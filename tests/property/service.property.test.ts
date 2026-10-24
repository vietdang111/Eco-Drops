import fc from "fast-check";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DomainError, type DomainErrorCode } from "../../src/lib/errors";
import { DEMO_BATCHES, DEMO_ORGANIZATIONS } from "../../src/lib/seed";
import {
  campusActor,
  createSeededServiceHarness,
  startCompatibleKioskSession,
  warehouseActor,
  type SeededServiceHarness,
} from "../helpers/seeded-service";

const identifierArbitrary = fc
  .array(fc.constantFrom(..."abcdefghijklmnopqrstuvwxyz0123456789"), {
    minLength: 8,
    maxLength: 24,
  })
  .map((characters) => characters.join(""));

const APPROVED_PUBLIC_KEYS = [
  "auditHash",
  "issueDate",
  "methodologyVersion",
  "recordId",
  "status",
] as const;

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

function cleanupKioskState(
  harness: SeededServiceHarness,
  sessionIds: readonly string[],
  itemIds: readonly string[],
): void {
  for (const sessionId of sessionIds) {
    harness.db
      .prepare("DELETE FROM idempotency_records WHERE principal_type = 'kiosk_session' AND principal_id = ?")
      .run(sessionId);
    harness.db.prepare("DELETE FROM claims WHERE kiosk_session_id = ?").run(sessionId);
    harness.db.prepare("DELETE FROM kiosk_sessions WHERE id = ?").run(sessionId);
  }
  for (const itemId of itemIds) {
    harness.db.prepare("UPDATE items SET status = 'AVAILABLE' WHERE id = ?").run(itemId);
  }
}

describe("seeded service properties", () => {
  let harness: SeededServiceHarness;

  beforeEach(async () => {
    harness = await createSeededServiceHarness(1);
  });

  afterEach(() => {
    harness.db.close();
  });

  it("makes every checkout replay idempotent regardless of repeat count and valid key", () => {
    fc.assert(
      fc.property(
        identifierArbitrary,
        fc.integer({ min: 2, max: 8 }),
        (idempotencyKey, repeatCount) => {
          const session = startCompatibleKioskSession(
            harness.service,
            `idempotency-person-${idempotencyKey}`,
          );
          try {
            const request = {
              token: session.token,
              itemId: "item-synthetic-001",
              idempotencyKey,
            };
            const first = harness.service.checkoutKioskItem(request);
            for (let replay = 1; replay < repeatCount; replay += 1) {
              expect(harness.service.checkoutKioskItem(request)).toEqual(first);
            }

            const claimCount = harness.db
              .prepare<[string], { count: number }>(
                "SELECT COUNT(*) AS count FROM claims WHERE kiosk_session_id = ?",
              )
              .get(session.sessionId)?.count;
            const idempotencyCount = harness.db
              .prepare<[string], { count: number }>(
                "SELECT COUNT(*) AS count FROM idempotency_records WHERE principal_id = ?",
              )
              .get(session.sessionId)?.count;
            const checkoutAuditCount = harness.db
              .prepare<[string], { count: number }>(
                "SELECT COUNT(*) AS count FROM audit_events WHERE event_type = 'SPONSORED_ITEM_CHECKED_OUT' AND entity_id = ?",
              )
              .get(first.claimId)?.count;

            expect(claimCount).toBe(1);
            expect(idempotencyCount).toBe(1);
            expect(checkoutAuditCount).toBe(1);
            expect(
              caughtDomainError(
                () =>
                  harness.service.checkoutKioskItem({
                    ...request,
                    itemId: "item-synthetic-003",
                  }),
                "IDEMPOTENCY_CONFLICT",
              ).httpStatus,
            ).toBe(409);
          } finally {
            cleanupKioskState(harness, [session.sessionId], ["item-synthetic-001"]);
          }
        },
      ),
      { seed: 20260321, numRuns: 40 },
    );
  });

  it("enforces one weekly claim across any number of sessions sharing an anonymous key", () => {
    fc.assert(
      fc.property(
        identifierArbitrary,
        fc.integer({ min: 1, max: 5 }),
        (principalSuffix, blockedAttempts) => {
          const weeklyClaimToken = `weekly-cap-person-${principalSuffix}`;
          const sessions = [
            startCompatibleKioskSession(harness.service, weeklyClaimToken),
          ];
          try {
            harness.service.checkoutKioskItem({
              token: sessions[0].token,
              itemId: "item-synthetic-001",
              idempotencyKey: `first-${principalSuffix}`,
            });

            for (let attempt = 0; attempt < blockedAttempts; attempt += 1) {
              const session = startCompatibleKioskSession(harness.service, weeklyClaimToken);
              sessions.push(session);
              const error = caughtDomainError(
                () =>
                  harness.service.checkoutKioskItem({
                    token: session.token,
                    itemId: "item-synthetic-003",
                    idempotencyKey: `blocked-${attempt}-${principalSuffix}`,
                  }),
                "BUSINESS_GATE_FAILED",
              );
              expect(error.message).toContain("weekly claim cap");
            }

            const newClaimCount = sessions.reduce(
              (total, session) =>
                total +
                (harness.db
                  .prepare<[string], { count: number }>(
                    "SELECT COUNT(*) AS count FROM claims WHERE kiosk_session_id = ?",
                  )
                  .get(session.sessionId)?.count ?? 0),
              0,
            );
            const secondItemStatus = harness.db
              .prepare<[string], { status: string }>("SELECT status FROM items WHERE id = ?")
              .get("item-synthetic-003")?.status;

            expect(newClaimCount).toBe(1);
            expect(secondItemStatus).toBe("AVAILABLE");
          } finally {
            cleanupKioskState(
              harness,
              sessions.map((session) => session.sessionId),
              ["item-synthetic-001", "item-synthetic-003"],
            );
          }
        },
      ),
      { seed: 20260322, numRuns: 30 },
    );
  });

  it("makes every authenticated allocation retry exactly-once within verified capacity", () => {
    fc.assert(
      fc.property(
        identifierArbitrary,
        fc.integer({ min: 1, max: 6 }),
        fc.integer({ min: 2, max: 6 }),
        (keySuffix, quantity, repeatCount) => {
          const idempotencyKey = `allocation-${keySuffix}`;
          let allocationId: string | undefined;
          try {
            const request = {
              batchId: DEMO_BATCHES.certified,
              campusOrganizationId: DEMO_ORGANIZATIONS.campus,
              quantity,
              idempotencyKey,
            };
            const first = harness.service.createCampusAllocation(warehouseActor, request);
            allocationId = first.allocation.id;
            for (let replay = 1; replay < repeatCount; replay += 1) {
              expect(harness.service.createCampusAllocation(warehouseActor, request)).toEqual(first);
            }
            expect(harness.db.prepare<[], { count: number }>(
              "SELECT COUNT(*) AS count FROM campus_allocations",
            ).get()?.count).toBe(1);
            expect(first.distribution).toMatchObject({
              verifiedUnits: 12,
              existingItemCount: 6,
              pendingAllocationQuantity: quantity,
              remainingCapacity: 6 - quantity,
            });
            expect(
              caughtDomainError(
                () => harness.service.createCampusAllocation(warehouseActor, {
                  ...request,
                  quantity: quantity === 6 ? 5 : quantity + 1,
                }),
                "IDEMPOTENCY_CONFLICT",
              ).httpStatus,
            ).toBe(409);
            expect(
              caughtDomainError(
                () => harness.service.receiveCampusAllocation(warehouseActor, {
                  allocationId: first.allocation.id,
                  idempotencyKey: `receive-${keySuffix}`,
                }),
                "FORBIDDEN",
              ).httpStatus,
            ).toBe(403);
            expect(harness.readModels.getAllocation(campusActor, first.allocation.id).itemCount).toBe(0);
          } finally {
            harness.db.prepare(
              "DELETE FROM idempotency_records WHERE operation = 'create_allocation' AND principal_id = ?",
            ).run(DEMO_BATCHES.certified);
            if (allocationId) {
              harness.db.prepare("DELETE FROM audit_events WHERE entity_id = ?").run(allocationId);
              harness.db.prepare("DELETE FROM campus_allocations WHERE id = ?").run(allocationId);
            }
            harness.db.prepare(
              "UPDATE batches SET status = 'CERTIFIED' WHERE id = ?",
            ).run(DEMO_BATCHES.certified);
          }
        },
      ),
      { seed: 20260325, numRuns: 35 },
    );
  });

  it("keeps the public certificate projection to exactly five approved keys", () => {
    fc.assert(
      fc.property(
        identifierArbitrary,
        fc.integer({ min: 0, max: 1_000_000 }),
        (privateMarker, privateTotal) => {
          harness.db
            .prepare(
              `UPDATE certificates
                  SET snapshot_json = ?, low_kg_co2e = ?, base_kg_co2e = ?, high_kg_co2e = ?
                WHERE record_id = 'ECD-SYNTHETIC-0001'`,
            )
            .run(
              JSON.stringify({
                privateMarker,
                batchId: "must-not-leak",
                verifiedUnits: privateTotal,
              }),
              privateTotal,
              privateTotal,
              privateTotal,
            );

          const projection = harness.service.getPublicCertificate("ECD-SYNTHETIC-0001");
          expect(Object.keys(projection).sort()).toEqual([...APPROVED_PUBLIC_KEYS].sort());
          expect(projection).toEqual({
            recordId: "ECD-SYNTHETIC-0001",
            issueDate: "2026-02-15T12:00:00.000Z",
            status: "CERTIFIED",
            methodologyVersion: "demo-methodology-2026.1",
            auditHash: expect.stringMatching(/^[a-f0-9]{64}$/),
          });
          expect("batchId" in projection).toBe(false);
          expect("snapshot" in projection).toBe(false);
          expect("verifiedUnits" in projection).toBe(false);
        },
      ),
      { seed: 20260323, numRuns: 50 },
    );
  });
});
