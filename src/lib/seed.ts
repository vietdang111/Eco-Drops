import { createHash } from "node:crypto";
import { appendAuditEvent, canonicalJson, sha256Hex } from "./audit";
import { hashPassword, hashSessionToken } from "./auth";
import { calculateAvoidedEmissions, type CarbonCalculationInput } from "./carbon";
import { runInTransaction, seedHsPolicyCatalog, type DatabaseConnection } from "./db";
import type { DemoResetResult } from "./service";

export const DEMO_PASSWORD = "DemoPass!2026";
export const DEMO_TIMESTAMP = "2026-02-15T12:00:00.000Z";

export const DEMO_ORGANIZATIONS = {
  corporate: "org-synthetic-corporate",
  warehouse: "org-synthetic-warehouse",
  campus: "org-synthetic-campus",
  platform: "org-synthetic-platform",
} as const;

export const DEMO_USERS = {
  corporate: { id: "user-synthetic-corporate", email: "corp@demo.ecodrops.local", role: "corp_user" },
  warehouse: { id: "user-synthetic-warehouse", email: "warehouse@demo.ecodrops.local", role: "warehouse_op" },
  campus: { id: "user-synthetic-campus", email: "campus@demo.ecodrops.local", role: "campus_admin" },
  admin: { id: "user-synthetic-admin", email: "admin@demo.ecodrops.local", role: "admin" },
} as const;

export const DEMO_BATCHES = {
  draft: "batch-synthetic-draft",
  pending: "batch-synthetic-pending",
  inTransit: "batch-synthetic-in-transit",
  delivered: "batch-synthetic-delivered",
  review: "batch-synthetic-review",
  certified: "batch-synthetic-certified",
  blocked: "batch-synthetic-blocked",
} as const;

export interface SeedOptions {
  clear?: boolean;
}

interface DemoBatch {
  id: string;
  hsCode: string;
  category: string;
  quantity: number;
  unitWeightKg: number;
  declaredValueCents: number;
  status: string;
  riskTier: string | null;
  riskReasons: string[];
  factorId: string;
}

const TABLES_IN_DELETE_ORDER = [
  "idempotency_records",
  "outcomes",
  "claim_decisions",
  "claims",
  "kiosk_sessions",
  "allocation_items",
  "items",
  "campus_allocations",
  "certificates",
  "evidence_photos",
  "receivings",
  "shipment_events",
  "shipments",
  "batches",
  "sessions",
  "users",
  "emission_factors",
  "methodologies",
  "audit_events",
  "organizations",
  "hs_policy_catalog",
] as const;

function deterministicSalt(email: string): Buffer {
  return createHash("sha256").update(`EcoDrops synthetic seed:${email}`).digest().subarray(0, 16);
}

function insertShipment(
  db: DatabaseConnection,
  batchId: string,
  suffix: string,
  status: "IN_TRANSIT" | "DELIVERED",
): void {
  const shipmentId = `shipment-synthetic-${suffix}`;
  db.prepare<[string, string, string, string, string, string]>(
    `INSERT INTO shipments
      (id, batch_id, tracking_reference, status, carrier_mode, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'SIMULATED', ?, ?)`,
  ).run(shipmentId, batchId, `ECO-DEMO-${suffix.toUpperCase()}`, status, DEMO_TIMESTAMP, DEMO_TIMESTAMP);
  db.prepare<[string, string, string, string]>(
    `INSERT INTO shipment_events (id, shipment_id, status, source, occurred_at, payload_json)
     VALUES (?, ?, 'IN_TRANSIT', 'SIMULATED_CARRIER', ?, ?)`,
  ).run(`shipment-event-${suffix}-transit`, shipmentId, DEMO_TIMESTAMP, canonicalJson({ simulated: true }));
  if (status === "DELIVERED") {
    db.prepare<[string, string, string, string]>(
      `INSERT INTO shipment_events (id, shipment_id, status, source, occurred_at, payload_json)
       VALUES (?, ?, 'DELIVERED', 'SIMULATED_CARRIER', ?, ?)`,
    ).run(`shipment-event-${suffix}-delivered`, shipmentId, DEMO_TIMESTAMP, canonicalJson({ simulated: true }));
  }
}

function insertReceiving(
  db: DatabaseConnection,
  batchId: string,
  suffix: string,
  receivedBy: string,
  expectedWeightKg: number,
  netWeightKg: number,
  unitWeightKg: number,
  claimedUnits: number,
  varianceTier: "PASS" | "REVIEW",
): void {
  const receivingId = `receiving-synthetic-${suffix}`;
  const variance = Math.abs(netWeightKg - expectedWeightKg);
  db.prepare<[
    string,
    string,
    string,
    number,
    number,
    number,
    number,
    number,
    number,
    string,
    number,
    number,
    string | null,
    string,
  ]>(
    `INSERT INTO receivings
      (id, batch_id, received_by_user_id, gross_weight_kg, tare_weight_kg, net_weight_kg,
       expected_weight_kg, absolute_variance_kg, variance_ratio, variance_tier,
       sample_scan_count, verified_units, review_reason, received_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    receivingId,
    batchId,
    receivedBy,
    netWeightKg + 2,
    2,
    netWeightKg,
    expectedWeightKg,
    variance,
    variance / expectedWeightKg,
    varianceTier,
    12,
    Math.min(claimedUnits, Math.floor(netWeightKg / unitWeightKg)),
    varianceTier === "REVIEW" ? "Synthetic supervisor review: count and photos reconcile." : null,
    DEMO_TIMESTAMP,
  );
  db.prepare<[string, string, string, string, number, string]>(
    `INSERT INTO evidence_photos
      (id, receiving_id, storage_name, content_hash, mime_type, size_bytes, created_at)
     VALUES (?, ?, ?, ?, 'image/jpeg', ?, ?)`,
  ).run(
    `evidence-synthetic-${suffix}`,
    receivingId,
    `synthetic-${suffix}.jpg`,
    sha256Hex(`synthetic evidence ${suffix}`),
    128,
    DEMO_TIMESTAMP,
  );
}

function clearDatabase(db: DatabaseConnection): void {
  for (const table of TABLES_IN_DELETE_ORDER) db.exec(`DELETE FROM ${table}`);
  db.exec("DELETE FROM sqlite_sequence WHERE name = 'audit_events'");
}

export async function seedDatabase(
  db: DatabaseConnection,
  options: SeedOptions = { clear: true },
): Promise<DemoResetResult> {
  const userEntries = [
    [DEMO_USERS.corporate, DEMO_ORGANIZATIONS.corporate],
    [DEMO_USERS.warehouse, DEMO_ORGANIZATIONS.warehouse],
    [DEMO_USERS.campus, DEMO_ORGANIZATIONS.campus],
    [DEMO_USERS.admin, DEMO_ORGANIZATIONS.platform],
  ] as const;
  const passwordHashes = await Promise.all(
    userEntries.map(([user]) => hashPassword(DEMO_PASSWORD, { salt: deterministicSalt(user.email) })),
  );

  return runInTransaction(db, () => {
    if (options.clear ?? true) clearDatabase(db);
    seedHsPolicyCatalog(db);
    const existing = db.prepare<[], { count: number }>("SELECT COUNT(*) AS count FROM organizations").get()?.count ?? 0;
    if (existing > 0) {
      throw new Error("Database is not empty. Pass { clear: true } to replace it with synthetic demo data.");
    }

    const organizations = [
      [DEMO_ORGANIZATIONS.corporate, "Synthetic Circular Co.", "synthetic-circular-co", "corporate"],
      [DEMO_ORGANIZATIONS.warehouse, "Synthetic Independent Warehouse", "synthetic-warehouse", "warehouse"],
      [DEMO_ORGANIZATIONS.campus, "Synthetic Demo Campus", "synthetic-demo-campus", "campus"],
      [DEMO_ORGANIZATIONS.platform, "EcoDrops Demo Operations", "ecodrops-demo-operations", "platform"],
    ] as const;
    for (const organization of organizations) {
      db.prepare<[string, string, string, string, number, string]>(
        "INSERT INTO organizations (id, name, slug, kind, synthetic, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      ).run(organization[0], organization[1], organization[2], organization[3], 1, DEMO_TIMESTAMP);
    }

    userEntries.forEach(([user, organizationId], index) => {
      db.prepare<[string, string, string, string, string, number, string]>(
        "INSERT INTO users (id, org_id, email, password_hash, role, synthetic, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      ).run(user.id, organizationId, user.email, passwordHashes[index] ?? "", user.role, 1, DEMO_TIMESTAMP);
      const rawExpiredToken = `synthetic-expired-session-token-${user.id}`;
      db.prepare<[string, string, string, string, string, string]>(
        `INSERT INTO sessions (id, user_id, token_hash, created_at, expires_at, revoked_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).run(
        `session-expired-${user.id}`,
        user.id,
        hashSessionToken(rawExpiredToken),
        "2025-01-01T00:00:00.000Z",
        "2025-01-01T08:00:00.000Z",
        "2025-01-01T08:00:00.000Z",
      );
    });

    db.prepare<[string, string, string, string, string, string, string, number, string]>(
      `INSERT INTO methodologies
        (id, name, version, source_name, source_url, formula_version, assumptions_json, active, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      "methodology-synthetic-v1",
      "EcoDrops Avoided Emissions Demo Methodology",
      "demo-methodology-2026.1",
      "EPA WARM v16 / USEEIO source families; EcoDrops proxy assumptions",
      "https://www.epa.gov/warm",
      "avoided-emissions-v1",
      canonicalJson({
        notice: "Factors, displacement, retention, and handling are synthetic demo proxies.",
        noAnswerRetention: 0,
      }),
      1,
      DEMO_TIMESTAMP,
    );

    const factors = [
      ["factor-electronics-v1", "electronics", 8, 12, 18, 0.35, 0.55, 0.75, 0.55, 0.7, 0.85, 0.3],
      ["factor-apparel-v1", "apparel", 10, 15, 22, 0.3, 0.5, 0.7, 0.5, 0.68, 0.82, 0.08],
      ["factor-study-v1", "study supplies", 1.8, 2.7, 4, 0.35, 0.55, 0.72, 0.55, 0.7, 0.85, 0.04],
      ["factor-other-v1", "other", 2, 4, 7, 0.25, 0.45, 0.65, 0.45, 0.65, 0.8, 0.1],
    ] as const;
    for (const factor of factors) {
      db.prepare<[
        string,
        string,
        string,
        string,
        number,
        number,
        number,
        number,
        number,
        number,
        number,
        number,
        number,
        number,
        number,
        number,
      ]>(
        `INSERT INTO emission_factors
          (id, methodology_id, category, version, low_factor, base_factor, high_factor,
           low_displacement, base_displacement, high_displacement,
           low_retention, base_retention, high_retention, handling_kg_co2e_per_item,
           displacement_sample_size, retention_sample_size)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        factor[0],
        "methodology-synthetic-v1",
        factor[1],
        "proxy-factor-2026.1",
        factor[2],
        factor[3],
        factor[4],
        factor[5],
        factor[6],
        factor[7],
        factor[8],
        factor[9],
        factor[10],
        factor[11],
        24,
        18,
      );
    }

    const batches: DemoBatch[] = [
      { id: DEMO_BATCHES.draft, hsCode: "847130", category: "electronics", quantity: 40, unitWeightKg: 1.4, declaredValueCents: 1_200_000, status: "DRAFT", riskTier: null, riskReasons: [], factorId: "factor-electronics-v1" },
      { id: DEMO_BATCHES.pending, hsCode: "610910", category: "apparel", quantity: 120, unitWeightKg: 0.25, declaredValueCents: 360_000, status: "PENDING_VERIFICATION", riskTier: "GREEN", riskReasons: ["All versioned intake checks passed"], factorId: "factor-apparel-v1" },
      { id: DEMO_BATCHES.inTransit, hsCode: "482010", category: "study supplies", quantity: 100, unitWeightKg: 0.5, declaredValueCents: 250_000, status: "IN_TRANSIT", riskTier: "GREEN", riskReasons: ["All versioned intake checks passed"], factorId: "factor-study-v1" },
      { id: DEMO_BATCHES.delivered, hsCode: "847130", category: "electronics", quantity: 30, unitWeightKg: 1.2, declaredValueCents: 900_000, status: "DELIVERED", riskTier: "YELLOW", riskReasons: ["Portable computers require battery review before distribution."], factorId: "factor-electronics-v1" },
      { id: DEMO_BATCHES.review, hsCode: "610910", category: "apparel", quantity: 100, unitWeightKg: 1, declaredValueCents: 500_000, status: "UNDER_REVIEW", riskTier: "GREEN", riskReasons: ["All versioned intake checks passed"], factorId: "factor-apparel-v1" },
      { id: DEMO_BATCHES.certified, hsCode: "847130", category: "electronics", quantity: 12, unitWeightKg: 1.5, declaredValueCents: 480_000, status: "CERTIFIED", riskTier: "YELLOW", riskReasons: ["Portable computers require battery review before distribution."], factorId: "factor-electronics-v1" },
      { id: DEMO_BATCHES.blocked, hsCode: "902110", category: "medical equipment", quantity: 10, unitWeightKg: 2, declaredValueCents: 700_000, status: "BLOCKED", riskTier: "RED", riskReasons: ["Orthopaedic and medical products are blocked by the medical-products policy."], factorId: "factor-other-v1" },
    ];
    for (const batch of batches) {
      const suffix = batch.id.replace("batch-synthetic-", "");
      db.prepare<[
        string,
        string,
        string,
        string,
        string,
        number,
        number,
        number,
        string,
        string,
        string,
        number,
        string,
        number,
        number,
        number,
        number,
        number,
        number,
        string,
        string | null,
        string | null,
        string | null,
        string,
        string,
        string,
      ]>(
        `INSERT INTO batches
          (id, org_id, created_by_user_id, hs_code, category, quantity, unit_weight_kg,
           declared_value_cents, invoice_identifier, invoice_hash, invoice_mime_type,
           invoice_size_bytes, invoice_storage_name, invoice_format_check,
           invoice_consistency_check, invoice_plausibility_check, invoice_uniqueness_check,
           authority_attested, compliance_attested, status, risk_tier, risk_rules_version,
           risk_reasons_json, factor_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        batch.id,
        DEMO_ORGANIZATIONS.corporate,
        DEMO_USERS.corporate.id,
        batch.hsCode,
        batch.category,
        batch.quantity,
        batch.unitWeightKg,
        batch.declaredValueCents,
        `SYNTHETIC-INVOICE-${suffix.toUpperCase()}`,
        sha256Hex(`synthetic invoice bytes ${suffix}`),
        "application/pdf",
        512 + suffix.length,
        `synthetic-${suffix}.pdf`,
        1,
        1,
        1,
        1,
        1,
        batch.riskTier === "YELLOW" ? 1 : 0,
        batch.status,
        batch.riskTier,
        batch.riskTier === null ? null : "risk-v2/hs-policy-2026.1",
        batch.riskTier === null ? null : canonicalJson(batch.riskReasons),
        batch.factorId,
        DEMO_TIMESTAMP,
        DEMO_TIMESTAMP,
      );
    }

    insertShipment(db, DEMO_BATCHES.inTransit, "transit", "IN_TRANSIT");
    insertShipment(db, DEMO_BATCHES.delivered, "delivered", "DELIVERED");
    insertShipment(db, DEMO_BATCHES.review, "review", "DELIVERED");
    insertShipment(db, DEMO_BATCHES.certified, "certified", "DELIVERED");
    insertReceiving(db, DEMO_BATCHES.review, "review", DEMO_USERS.warehouse.id, 100, 90, 1, 100, "REVIEW");
    insertReceiving(db, DEMO_BATCHES.certified, "certified", DEMO_USERS.warehouse.id, 18, 18, 1.5, 12, "PASS");

    const carbonInput: CarbonCalculationInput = {
      unitWeightKg: 1.5,
      eligibleUnits: 12,
      methodologySource: "EPA WARM v16 / USEEIO source families; EcoDrops proxy assumptions",
      methodologyVersion: "demo-methodology-2026.1",
      factorVersion: "proxy-factor-2026.1",
      formulaVersion: "avoided-emissions-v1",
      scenarios: {
        low: { factorKgCO2ePerKg: 8, displacementRate: 0.35, retentionRate: 0.55, handlingKgCO2ePerItem: 0.3 },
        base: { factorKgCO2ePerKg: 12, displacementRate: 0.55, retentionRate: 0.7, handlingKgCO2ePerItem: 0.3 },
        high: { factorKgCO2ePerKg: 18, displacementRate: 0.75, retentionRate: 0.85, handlingKgCO2ePerItem: 0.3 },
      },
      sampleSizes: { displacement: 24, retention: 18 },
    };
    const estimate = calculateAvoidedEmissions(carbonInput, true);
    const certificateEvent = appendAuditEvent(db, {
      eventId: "audit-synthetic-certificate",
      eventType: "BATCH_CERTIFIED",
      entityType: "certificate",
      entityId: "ECD-SYNTHETIC-0001",
      actor: {
        userId: DEMO_USERS.warehouse.id,
        organizationId: DEMO_ORGANIZATIONS.warehouse,
        role: "warehouse_op",
      },
      organizationId: DEMO_ORGANIZATIONS.corporate,
      occurredAt: DEMO_TIMESTAMP,
      payload: {
        batchId: DEMO_BATCHES.certified,
        recordId: "ECD-SYNTHETIC-0001",
        verifiedUnits: 12,
        methodologyVersion: estimate.methodologyVersion,
        lowKgCO2e: estimate.scenarios.low.estimatedAvoidedEmissionsKgCO2e,
        baseKgCO2e: estimate.scenarios.base.estimatedAvoidedEmissionsKgCO2e,
        highKgCO2e: estimate.scenarios.high.estimatedAvoidedEmissionsKgCO2e,
      },
    });
    db.prepare<[string, string, string, string, string, string, number, number, number, string]>(
      `INSERT INTO certificates
        (record_id, batch_id, issue_date, status, methodology_version, snapshot_json,
         low_kg_co2e, base_kg_co2e, high_kg_co2e, audit_hash)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      "ECD-SYNTHETIC-0001",
      DEMO_BATCHES.certified,
      DEMO_TIMESTAMP,
      "CERTIFIED",
      estimate.methodologyVersion,
      canonicalJson({ ...estimate, claimedUnits: 12, verifiedUnits: 12, synthetic: true }),
      estimate.scenarios.low.estimatedAvoidedEmissionsKgCO2e,
      estimate.scenarios.base.estimatedAvoidedEmissionsKgCO2e,
      estimate.scenarios.high.estimatedAvoidedEmissionsKgCO2e,
      certificateEvent.hash,
    );

    const items = [
      ["item-synthetic-001", "USB-C Laptop 01", "AVAILABLE", 0, { connector: "usb-c" }, ["coursework", "remote-learning"]],
      ["item-synthetic-002", "USB-C Laptop 02", "DISTRIBUTED", 0, { connector: "usb-c" }, ["coursework"]],
      ["item-synthetic-003", "USB-C Laptop 03", "AVAILABLE", 1, { connector: "usb-c" }, ["coursework"]],
      ["item-synthetic-004", "USB-C Laptop 04", "DISTRIBUTED", 0, { connector: "usb-c" }, ["remote-learning"]],
      ["item-synthetic-005", "USB-C Laptop 05", "DIVERTED", 0, { connector: "usb-c" }, ["coursework"]],
      ["item-synthetic-006", "USB-C Laptop 06", "CLAIMED", 0, { connector: "usb-c" }, ["coursework"]],
    ] as const;
    for (const item of items) {
      db.prepare<[string, string, string, string, string, string, string, number, string, string]>(
        `INSERT INTO items
          (id, batch_id, campus_org_id, label, category, compatibility_json, need_tags_json,
           status, circulation_count, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'electronics', ?, ?, ?, ?, ?, ?)`,
      ).run(
        item[0],
        DEMO_BATCHES.certified,
        DEMO_ORGANIZATIONS.campus,
        item[1],
        canonicalJson(item[4]),
        canonicalJson(item[5]),
        item[2],
        item[3],
        DEMO_TIMESTAMP,
        DEMO_TIMESTAMP,
      );
    }

    const historicalKioskSessions = [
      ["kiosk-session-synthetic-kept", "kept"],
      ["kiosk-session-synthetic-returned", "returned"],
      ["kiosk-session-synthetic-passed-on", "passed-on"],
      ["kiosk-session-synthetic-history", "unknown"],
    ] as const;
    for (const [sessionId, suffix] of historicalKioskSessions) {
      db.prepare<[string, string, string, string, string, string, string, string, string, string]>(
        `INSERT INTO kiosk_sessions
          (id, campus_org_id, token_hash, weekly_key_hash, mode, requested_categories_json,
           compatibility_json, need_tags_json, created_at, expires_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        sessionId,
        DEMO_ORGANIZATIONS.campus,
        hashSessionToken(`synthetic-kiosk-token-${suffix}-fixture-only`),
        sha256Hex(`synthetic-weekly-anonymous-key-${suffix}`),
        "CATEGORY_KNOWN",
        canonicalJson(["electronics"]),
        canonicalJson({ connector: "usb-c" }),
        canonicalJson(["coursework"]),
        "2026-02-08T12:00:00.000Z",
        "2026-02-08T12:30:00.000Z",
      );
    }

    const claims = [
      ["claim-synthetic-kept", "kiosk-session-synthetic-kept", "item-synthetic-002", "KEPT", "KEEP", "YES", "IN_USE"],
      ["claim-synthetic-returned", "kiosk-session-synthetic-returned", "item-synthetic-003", "RETURNED", "RETURN", "UNSURE", "RETURNING"],
      ["claim-synthetic-passed-on", "kiosk-session-synthetic-passed-on", "item-synthetic-004", "KEPT", "KEEP", "YES", "PASSED_ON"],
      ["claim-synthetic-unknown", "kiosk-session-synthetic-history", "item-synthetic-006", "CHECKED_OUT", null, "UNSURE", "NO_ANSWER"],
    ] as const;
    for (const claim of claims) {
      db.prepare<[string, string, string, string, string, string, string]>(
        `INSERT INTO claims
          (id, kiosk_session_id, item_id, claim_method, status, week_key, created_at, updated_at)
         VALUES (?, ?, ?, 'SPONSORED_FREE', ?, ?, ?, ?)`,
      ).run(claim[0], claim[1], claim[2], claim[3], "2026-W06", "2026-02-08T12:05:00.000Z", "2026-02-08T12:10:00.000Z");
      if (claim[4]) {
        db.prepare<[string, string, string, string]>(
          "INSERT INTO claim_decisions (id, claim_id, decision, decided_at) VALUES (?, ?, ?, ?)",
        ).run(`decision-${claim[0]}`, claim[0], claim[4], "2026-02-08T12:10:00.000Z");
      }
      db.prepare<[string, string, string, string, string]>(
        `INSERT INTO outcomes (id, claim_id, displacement_answer, follow_up_outcome, recorded_at)
         VALUES (?, ?, ?, ?, ?)`,
      ).run(`outcome-${claim[0]}`, claim[0], claim[5], claim[6], DEMO_TIMESTAMP);
    }

    const replay = {
      claimId: "claim-synthetic-unknown",
      itemId: "item-synthetic-006",
      status: "CHECKED_OUT",
      claimMethod: "SPONSORED_FREE",
      createdAt: "2026-02-08T12:05:00.000Z",
    };
    db.prepare<[string, string, string, string, string, string, string]>(
      `INSERT INTO idempotency_records
        (operation, principal_type, principal_id, idempotency_key, request_hash, response_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      "checkout",
      "kiosk_session",
      "kiosk-session-synthetic-history",
      "synthetic-checkout-key-0001",
      sha256Hex(canonicalJson({ itemId: "item-synthetic-006" })),
      canonicalJson(replay),
      "2026-02-08T12:05:00.000Z",
    );

    appendAuditEvent(db, {
      eventId: "audit-synthetic-seed-complete",
      eventType: "SYNTHETIC_DEMO_DATA_SEEDED",
      entityType: "demo_dataset",
      entityId: "synthetic-2026.1",
      occurredAt: DEMO_TIMESTAMP,
      payload: {
        synthetic: true,
        organizations: organizations.length,
        users: userEntries.length,
        batches: batches.length,
        items: items.length,
        simulatedActions: ["carrier", "scale", "payment", "time"],
        sourcedMethodologyFamily: "EPA WARM v16 / USEEIO",
      },
    });

    return {
      synthetic: true,
      organizations: organizations.length,
      users: userEntries.length,
      batches: batches.length,
      items: items.length,
      password: DEMO_PASSWORD,
    };
  });
}
