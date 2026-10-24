import { createHash, randomUUID } from "node:crypto";
import type { DatabaseConnection } from "./db";
import type { ActorContext, JsonValue } from "./domain";

export const AUDIT_GENESIS_HASH = "0".repeat(64);

export interface AuditEventData {
  eventId: string;
  eventType: string;
  entityType: string;
  entityId: string;
  actorUserId: string | null;
  actorRole: string | null;
  organizationId: string | null;
  occurredAt: string;
  payload: JsonValue;
}

export interface AuditEventRecord extends AuditEventData {
  sequence: number;
  previousHash: string;
  hash: string;
}

export interface AppendAuditEventInput {
  eventId?: string;
  eventType: string;
  entityType: string;
  entityId: string;
  actor?: ActorContext | null;
  organizationId?: string | null;
  occurredAt?: string;
  payload: JsonValue;
}

export interface AuditVerificationResult {
  valid: boolean;
  checkedEvents: number;
  firstBrokenEvent: null | {
    sequence: number;
    eventId: string;
    reason: "PREVIOUS_HASH_MISMATCH" | "EVENT_HASH_MISMATCH" | "INVALID_PAYLOAD";
    expectedHash?: string;
    actualHash?: string;
  };
  headHash: string;
}

interface AuditRow {
  sequence: number;
  eventId: string;
  eventType: string;
  entityType: string;
  entityId: string;
  actorUserId: string | null;
  actorRole: string | null;
  organizationId: string | null;
  occurredAt: string;
  payloadJson: string;
  previousHash: string;
  hash: string;
}

function normalizeJson(value: unknown, stack: Set<object>): JsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("Canonical JSON does not support non-finite numbers.");
    return Object.is(value, -0) ? 0 : value;
  }
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) {
    if (stack.has(value)) throw new TypeError("Canonical JSON does not support circular values.");
    stack.add(value);
    const result = value.map((entry) => (entry === undefined ? null : normalizeJson(entry, stack)));
    stack.delete(value);
    return result;
  }
  if (typeof value === "object") {
    if (stack.has(value)) throw new TypeError("Canonical JSON does not support circular values.");
    stack.add(value);
    const result: Record<string, JsonValue> = {};
    for (const key of Object.keys(value).sort()) {
      const entry = (value as Record<string, unknown>)[key];
      if (entry !== undefined) result[key] = normalizeJson(entry, stack);
    }
    stack.delete(value);
    return result;
  }
  throw new TypeError(`Canonical JSON does not support ${typeof value} values.`);
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(normalizeJson(value, new Set()));
}

export function sha256Hex(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

export function hashAuditEvent(previousHash: string, event: AuditEventData): string {
  if (!/^[a-f0-9]{64}$/.test(previousHash)) {
    throw new TypeError("Previous audit hash must be a lowercase SHA-256 digest.");
  }
  return sha256Hex(`${previousHash}\n${canonicalJson(event)}`);
}

function rows(db: DatabaseConnection): AuditRow[] {
  return db.prepare<[], AuditRow>(
    `SELECT sequence, event_id AS eventId, event_type AS eventType, entity_type AS entityType,
            entity_id AS entityId, actor_user_id AS actorUserId, actor_role AS actorRole,
            org_id AS organizationId, occurred_at AS occurredAt, payload_json AS payloadJson,
            previous_hash AS previousHash, hash
       FROM audit_events ORDER BY sequence ASC`,
  ).all();
}

export function appendAuditEvent(db: DatabaseConnection, input: AppendAuditEventInput): AuditEventRecord {
  const previous = db.prepare<[], { hash: string }>(
    "SELECT hash FROM audit_events ORDER BY sequence DESC LIMIT 1",
  ).get();
  const previousHash = previous?.hash ?? AUDIT_GENESIS_HASH;
  const payload = JSON.parse(canonicalJson(input.payload)) as JsonValue;
  const data: AuditEventData = {
    eventId: input.eventId ?? randomUUID(),
    eventType: input.eventType,
    entityType: input.entityType,
    entityId: input.entityId,
    actorUserId: input.actor?.userId ?? null,
    actorRole: input.actor?.role ?? null,
    organizationId: input.organizationId ?? input.actor?.organizationId ?? null,
    occurredAt: input.occurredAt ?? new Date().toISOString(),
    payload,
  };
  const hash = hashAuditEvent(previousHash, data);
  const result = db.prepare<[
    string,
    string,
    string,
    string,
    string | null,
    string | null,
    string | null,
    string,
    string,
    string,
    string,
  ]>(
    `INSERT INTO audit_events
      (event_id, event_type, entity_type, entity_id, actor_user_id, actor_role, org_id,
       occurred_at, payload_json, previous_hash, hash)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    data.eventId,
    data.eventType,
    data.entityType,
    data.entityId,
    data.actorUserId,
    data.actorRole,
    data.organizationId,
    data.occurredAt,
    canonicalJson(payload),
    previousHash,
    hash,
  );

  return {
    ...data,
    sequence: Number(result.lastInsertRowid),
    previousHash,
    hash,
  };
}

export function listAuditEvents(db: DatabaseConnection): AuditEventRecord[] {
  return rows(db).map((row) => ({
    sequence: row.sequence,
    eventId: row.eventId,
    eventType: row.eventType,
    entityType: row.entityType,
    entityId: row.entityId,
    actorUserId: row.actorUserId,
    actorRole: row.actorRole,
    organizationId: row.organizationId,
    occurredAt: row.occurredAt,
    payload: JSON.parse(row.payloadJson) as JsonValue,
    previousHash: row.previousHash,
    hash: row.hash,
  }));
}

export function verifyAuditChain(db: DatabaseConnection): AuditVerificationResult {
  const events = rows(db);
  let previousHash = AUDIT_GENESIS_HASH;
  let checkedEvents = 0;

  for (const row of events) {
    if (row.previousHash !== previousHash) {
      return {
        valid: false,
        checkedEvents,
        firstBrokenEvent: {
          sequence: row.sequence,
          eventId: row.eventId,
          reason: "PREVIOUS_HASH_MISMATCH",
          expectedHash: previousHash,
          actualHash: row.previousHash,
        },
        headHash: previousHash,
      };
    }

    let payload: JsonValue;
    try {
      payload = JSON.parse(row.payloadJson) as JsonValue;
      canonicalJson(payload);
    } catch {
      return {
        valid: false,
        checkedEvents,
        firstBrokenEvent: { sequence: row.sequence, eventId: row.eventId, reason: "INVALID_PAYLOAD" },
        headHash: previousHash,
      };
    }

    const expectedHash = hashAuditEvent(previousHash, {
      eventId: row.eventId,
      eventType: row.eventType,
      entityType: row.entityType,
      entityId: row.entityId,
      actorUserId: row.actorUserId,
      actorRole: row.actorRole,
      organizationId: row.organizationId,
      occurredAt: row.occurredAt,
      payload,
    });
    if (row.hash !== expectedHash) {
      return {
        valid: false,
        checkedEvents,
        firstBrokenEvent: {
          sequence: row.sequence,
          eventId: row.eventId,
          reason: "EVENT_HASH_MISMATCH",
          expectedHash,
          actualHash: row.hash,
        },
        headHash: previousHash,
      };
    }
    previousHash = row.hash;
    checkedEvents += 1;
  }

  return { valid: true, checkedEvents, firstBrokenEvent: null, headHash: previousHash };
}
