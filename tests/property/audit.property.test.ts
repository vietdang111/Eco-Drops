import fc from "fast-check";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  appendAuditEvent,
  verifyAuditChain,
  type AuditEventRecord,
} from "../../src/lib/audit";
import { openDatabase, type DatabaseConnection } from "../../src/lib/db";

const payloadArbitrary = fc.record({
  count: fc.integer({ min: -1_000_000, max: 1_000_000 }),
  label: fc
    .array(fc.constantFrom(..."abcdefghijklmnopqrstuvwxyz0123456789"), { maxLength: 30 })
    .map((characters) => characters.join("")),
  active: fc.boolean(),
});

const TAMPER_CASES = [
  { kind: "payload", expectedReason: "EVENT_HASH_MISMATCH", expectedChecked: 0 },
  { kind: "hash", expectedReason: "EVENT_HASH_MISMATCH", expectedChecked: 0 },
  { kind: "previous hash", expectedReason: "PREVIOUS_HASH_MISMATCH", expectedChecked: 1 },
] as const;

function appendTwoEvents(
  db: DatabaseConnection,
  firstPayload: { count: number; label: string; active: boolean },
  secondPayload: { count: number; label: string; active: boolean },
): readonly [AuditEventRecord, AuditEventRecord] {
  const first = appendAuditEvent(db, {
    eventId: "audit-property-first",
    eventType: "PROPERTY_FIRST",
    entityType: "test_entity",
    entityId: "entity-first",
    occurredAt: "2026-01-01T00:00:00.000Z",
    payload: firstPayload,
  });
  const second = appendAuditEvent(db, {
    eventId: "audit-property-second",
    eventType: "PROPERTY_SECOND",
    entityType: "test_entity",
    entityId: "entity-second",
    occurredAt: "2026-01-01T00:00:01.000Z",
    payload: secondPayload,
  });
  return [first, second];
}

describe("audit hash chain", () => {
  let db: DatabaseConnection;

  beforeEach(() => {
    db = openDatabase(":memory:");
  });

  afterEach(() => {
    db.close();
  });

  it("passes for an untouched chain", () => {
    const [first, second] = appendTwoEvents(
      db,
      { count: 1, label: "created", active: true },
      { count: 2, label: "certified", active: false },
    );

    expect(second.previousHash).toBe(first.hash);
    expect(verifyAuditChain(db)).toEqual({
      valid: true,
      checkedEvents: 2,
      firstBrokenEvent: null,
      headHash: second.hash,
    });
  });

  it.each(TAMPER_CASES)(
    "detects a modified $kind and reports the first broken event",
    ({ kind, expectedReason, expectedChecked }) => {
      fc.assert(
        fc.property(payloadArbitrary, payloadArbitrary, (firstPayload, secondPayload) => {
          db.exec("DELETE FROM audit_events");
          const [first, second] = appendTwoEvents(db, firstPayload, secondPayload);
          expect(verifyAuditChain(db).valid).toBe(true);

          if (kind === "payload") {
            db.prepare("UPDATE audit_events SET payload_json = ? WHERE sequence = ?").run(
              JSON.stringify({ ...firstPayload, tampered: true }),
              first.sequence,
            );
          } else if (kind === "hash") {
            db.prepare("UPDATE audit_events SET hash = ? WHERE sequence = ?").run(
              "f".repeat(64),
              first.sequence,
            );
          } else {
            db.prepare("UPDATE audit_events SET previous_hash = ? WHERE sequence = ?").run(
              "e".repeat(64),
              second.sequence,
            );
          }

          const verification = verifyAuditChain(db);
          expect(verification.valid).toBe(false);
          expect(verification.checkedEvents).toBe(expectedChecked);
          expect(verification.firstBrokenEvent?.reason).toBe(expectedReason);
          expect(verification.firstBrokenEvent?.eventId).toBe(
            kind === "previous hash" ? second.eventId : first.eventId,
          );
        }),
        { seed: 20260320 + expectedChecked + expectedReason.length, numRuns: 50 },
      );
    },
  );
});
