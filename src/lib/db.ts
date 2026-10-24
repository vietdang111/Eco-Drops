import BetterSqlite3 from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

export type DatabaseConnection = BetterSqlite3.Database;
export const SCHEMA_VERSION = 2;
export const HS_POLICY_VERSION = "hs-policy-2026.1";
export const HS_POLICY_NOTICE =
  "HS classification determines category and baseline intake risk only; it does not prove item condition, authenticity, safety, or recall status.";

export interface HsPolicySeed {
  id: string;
  hsCode: string;
  category: string;
  baselineRisk: "GREEN" | "YELLOW" | "RED";
  rationale: string;
}

export const HS_POLICY_CATALOG: readonly HsPolicySeed[] = [
  {
    id: "hs-policy-2026.1-847130",
    hsCode: "847130",
    category: "electronics",
    baselineRisk: "YELLOW",
    rationale: "Portable computers require battery review before distribution.",
  },
  {
    id: "hs-policy-2026.1-850440",
    hsCode: "850440",
    category: "electronics",
    baselineRisk: "YELLOW",
    rationale: "Static converters require an electrical-safety attestation.",
  },
  {
    id: "hs-policy-2026.1-610910",
    hsCode: "610910",
    category: "apparel",
    baselineRisk: "GREEN",
    rationale: "Apparel is eligible for standard functional-surplus review.",
  },
  {
    id: "hs-policy-2026.1-482010",
    hsCode: "482010",
    category: "study supplies",
    baselineRisk: "GREEN",
    rationale: "Paper study supplies are eligible for standard functional-surplus review.",
  },
  {
    id: "hs-policy-2026.1-902110",
    hsCode: "902110",
    category: "medical equipment",
    baselineRisk: "RED",
    rationale: "Orthopaedic and medical products are blocked by the medical-products policy.",
  },
] as const;

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS app_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS organizations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL CHECK (kind IN ('corporate', 'warehouse', 'campus', 'platform')),
  synthetic INTEGER NOT NULL DEFAULT 0 CHECK (synthetic IN (0, 1)),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('corp_user', 'warehouse_op', 'campus_admin', 'admin')),
  synthetic INTEGER NOT NULL DEFAULT 0 CHECK (synthetic IN (0, 1)),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE CHECK (length(token_hash) = 64),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT
);

CREATE TABLE IF NOT EXISTS methodologies (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  version TEXT NOT NULL UNIQUE,
  source_name TEXT NOT NULL,
  source_url TEXT NOT NULL,
  formula_version TEXT NOT NULL,
  assumptions_json TEXT NOT NULL CHECK (json_valid(assumptions_json)),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS emission_factors (
  id TEXT PRIMARY KEY,
  methodology_id TEXT NOT NULL REFERENCES methodologies(id) ON DELETE RESTRICT,
  category TEXT NOT NULL,
  version TEXT NOT NULL,
  low_factor REAL NOT NULL CHECK (low_factor >= 0),
  base_factor REAL NOT NULL CHECK (base_factor >= 0),
  high_factor REAL NOT NULL CHECK (high_factor >= 0),
  low_displacement REAL NOT NULL CHECK (low_displacement BETWEEN 0 AND 1),
  base_displacement REAL NOT NULL CHECK (base_displacement BETWEEN 0 AND 1),
  high_displacement REAL NOT NULL CHECK (high_displacement BETWEEN 0 AND 1),
  low_retention REAL NOT NULL CHECK (low_retention BETWEEN 0 AND 1),
  base_retention REAL NOT NULL CHECK (base_retention BETWEEN 0 AND 1),
  high_retention REAL NOT NULL CHECK (high_retention BETWEEN 0 AND 1),
  handling_kg_co2e_per_item REAL NOT NULL CHECK (handling_kg_co2e_per_item >= 0),
  displacement_sample_size INTEGER NOT NULL DEFAULT 0 CHECK (displacement_sample_size >= 0),
  retention_sample_size INTEGER NOT NULL DEFAULT 0 CHECK (retention_sample_size >= 0),
  UNIQUE (methodology_id, category, version)
);

CREATE TABLE IF NOT EXISTS batches (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  created_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  hs_code TEXT NOT NULL CHECK (length(hs_code) = 6 AND hs_code NOT GLOB '*[^0-9]*'),
  category TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_weight_kg REAL NOT NULL CHECK (unit_weight_kg > 0),
  declared_value_cents INTEGER NOT NULL CHECK (declared_value_cents >= 0),
  invoice_identifier TEXT NOT NULL,
  invoice_hash TEXT NOT NULL UNIQUE CHECK (length(invoice_hash) = 64),
  invoice_mime_type TEXT NOT NULL CHECK (invoice_mime_type = 'application/pdf'),
  invoice_size_bytes INTEGER NOT NULL CHECK (invoice_size_bytes > 0),
  invoice_storage_name TEXT NOT NULL UNIQUE,
  invoice_format_check INTEGER NOT NULL CHECK (invoice_format_check IN (0, 1)),
  invoice_consistency_check INTEGER NOT NULL CHECK (invoice_consistency_check IN (0, 1)),
  invoice_plausibility_check INTEGER NOT NULL CHECK (invoice_plausibility_check IN (0, 1)),
  invoice_uniqueness_check INTEGER NOT NULL CHECK (invoice_uniqueness_check IN (0, 1)),
  authority_attested INTEGER NOT NULL CHECK (authority_attested IN (0, 1)),
  compliance_attested INTEGER NOT NULL DEFAULT 0 CHECK (compliance_attested IN (0, 1)),
  status TEXT NOT NULL CHECK (status IN ('DRAFT', 'PENDING_VERIFICATION', 'BLOCKED', 'IN_TRANSIT', 'DELIVERED', 'RECEIVED', 'UNDER_REVIEW', 'REJECTED', 'CERTIFIED', 'DISTRIBUTING', 'CLOSED')),
  risk_tier TEXT CHECK (risk_tier IN ('GREEN', 'YELLOW', 'RED')),
  risk_rules_version TEXT,
  risk_reasons_json TEXT CHECK (risk_reasons_json IS NULL OR json_valid(risk_reasons_json)),
  factor_id TEXT REFERENCES emission_factors(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (org_id, invoice_identifier)
);

CREATE TABLE IF NOT EXISTS shipments (
  id TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL UNIQUE REFERENCES batches(id) ON DELETE RESTRICT,
  tracking_reference TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('CREATED', 'IN_TRANSIT', 'DELIVERED')),
  carrier_mode TEXT NOT NULL CHECK (carrier_mode IN ('SIMULATED', 'WEBHOOK')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS shipment_events (
  id TEXT PRIMARY KEY,
  shipment_id TEXT NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('CREATED', 'IN_TRANSIT', 'DELIVERED')),
  source TEXT NOT NULL CHECK (source IN ('SIMULATED_CARRIER', 'SIGNED_CARRIER_WEBHOOK')),
  occurred_at TEXT NOT NULL,
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json))
);

CREATE TABLE IF NOT EXISTS receivings (
  id TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL UNIQUE REFERENCES batches(id) ON DELETE RESTRICT,
  received_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  gross_weight_kg REAL NOT NULL CHECK (gross_weight_kg > 0),
  tare_weight_kg REAL NOT NULL CHECK (tare_weight_kg >= 0),
  net_weight_kg REAL NOT NULL CHECK (net_weight_kg >= 0),
  expected_weight_kg REAL NOT NULL CHECK (expected_weight_kg > 0),
  absolute_variance_kg REAL NOT NULL CHECK (absolute_variance_kg >= 0),
  variance_ratio REAL NOT NULL CHECK (variance_ratio >= 0),
  variance_tier TEXT NOT NULL CHECK (variance_tier IN ('PASS', 'REVIEW', 'REJECT')),
  sample_scan_count INTEGER NOT NULL CHECK (sample_scan_count > 0),
  verified_units INTEGER NOT NULL CHECK (verified_units >= 0),
  review_reason TEXT,
  received_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS evidence_photos (
  id TEXT PRIMARY KEY,
  receiving_id TEXT NOT NULL REFERENCES receivings(id) ON DELETE CASCADE,
  storage_name TEXT NOT NULL UNIQUE,
  content_hash TEXT NOT NULL CHECK (length(content_hash) = 64),
  mime_type TEXT NOT NULL CHECK (mime_type IN ('image/jpeg', 'image/png')),
  size_bytes INTEGER NOT NULL CHECK (size_bytes > 0),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS certificates (
  record_id TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL UNIQUE REFERENCES batches(id) ON DELETE RESTRICT,
  issue_date TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('CERTIFIED', 'REVOKED')),
  methodology_version TEXT NOT NULL,
  snapshot_json TEXT NOT NULL CHECK (json_valid(snapshot_json)),
  low_kg_co2e REAL NOT NULL CHECK (low_kg_co2e >= 0),
  base_kg_co2e REAL NOT NULL CHECK (base_kg_co2e >= 0),
  high_kg_co2e REAL NOT NULL CHECK (high_kg_co2e >= 0),
  audit_hash TEXT NOT NULL CHECK (length(audit_hash) = 64)
);

CREATE TABLE IF NOT EXISTS items (
  id TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL REFERENCES batches(id) ON DELETE RESTRICT,
  campus_org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  label TEXT NOT NULL,
  category TEXT NOT NULL,
  compatibility_json TEXT NOT NULL CHECK (json_valid(compatibility_json)),
  need_tags_json TEXT NOT NULL CHECK (json_valid(need_tags_json)),
  status TEXT NOT NULL CHECK (status IN ('AVAILABLE', 'CLAIMED', 'RETURN_PENDING', 'DISTRIBUTED', 'DIVERTED')),
  circulation_count INTEGER NOT NULL DEFAULT 0 CHECK (circulation_count >= 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS kiosk_sessions (
  id TEXT PRIMARY KEY,
  campus_org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  token_hash TEXT NOT NULL UNIQUE CHECK (length(token_hash) = 64),
  weekly_key_hash TEXT NOT NULL CHECK (length(weekly_key_hash) = 64),
  mode TEXT NOT NULL CHECK (mode IN ('CATEGORY_KNOWN', 'MYSTERY_SHORTLIST')),
  requested_categories_json TEXT NOT NULL CHECK (json_valid(requested_categories_json)),
  compatibility_json TEXT NOT NULL CHECK (json_valid(compatibility_json)),
  need_tags_json TEXT NOT NULL CHECK (json_valid(need_tags_json)),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS claims (
  id TEXT PRIMARY KEY,
  kiosk_session_id TEXT NOT NULL REFERENCES kiosk_sessions(id) ON DELETE RESTRICT,
  item_id TEXT NOT NULL REFERENCES items(id) ON DELETE RESTRICT,
  claim_method TEXT NOT NULL CHECK (claim_method = 'SPONSORED_FREE'),
  status TEXT NOT NULL CHECK (status IN ('CHECKED_OUT', 'REVEALED', 'KEPT', 'RETURN_PENDING', 'RETURNED')),
  week_key TEXT NOT NULL,
  created_at TEXT NOT NULL,
  revealed_at TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS claim_decisions (
  id TEXT PRIMARY KEY,
  claim_id TEXT NOT NULL UNIQUE REFERENCES claims(id) ON DELETE RESTRICT,
  decision TEXT NOT NULL CHECK (decision IN ('KEEP', 'SWAP', 'RETURN')),
  decided_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS outcomes (
  id TEXT PRIMARY KEY,
  claim_id TEXT NOT NULL UNIQUE REFERENCES claims(id) ON DELETE RESTRICT,
  displacement_answer TEXT NOT NULL CHECK (displacement_answer IN ('YES', 'NO', 'UNSURE')),
  follow_up_outcome TEXT NOT NULL CHECK (follow_up_outcome IN ('IN_USE', 'RETURNING', 'PASSED_ON', 'NO_ANSWER')),
  recorded_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS idempotency_records (
  operation TEXT NOT NULL,
  principal_type TEXT NOT NULL,
  principal_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  request_hash TEXT NOT NULL CHECK (length(request_hash) = 64),
  response_json TEXT NOT NULL CHECK (json_valid(response_json)),
  created_at TEXT NOT NULL,
  PRIMARY KEY (operation, principal_type, principal_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS audit_events (
  sequence INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id TEXT NOT NULL UNIQUE,
  event_type TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  actor_user_id TEXT,
  actor_role TEXT,
  org_id TEXT,
  occurred_at TEXT NOT NULL,
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
  previous_hash TEXT NOT NULL CHECK (length(previous_hash) = 64),
  hash TEXT NOT NULL UNIQUE CHECK (length(hash) = 64)
);

CREATE INDEX IF NOT EXISTS idx_users_org ON users(org_id);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_batches_org_status ON batches(org_id, status);
CREATE INDEX IF NOT EXISTS idx_shipments_status ON shipments(status);
CREATE INDEX IF NOT EXISTS idx_items_campus_status_category ON items(campus_org_id, status, category);
CREATE INDEX IF NOT EXISTS idx_claims_session_created ON claims(kiosk_session_id, created_at);
CREATE INDEX IF NOT EXISTS idx_kiosk_weekly_key ON kiosk_sessions(weekly_key_hash);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_events(entity_type, entity_id);
`;

const SCHEMA_V2_SQL = `
CREATE TABLE IF NOT EXISTS hs_policy_catalog (
  id TEXT PRIMARY KEY,
  hs_code TEXT NOT NULL CHECK (length(hs_code) = 6 AND hs_code NOT GLOB '*[^0-9]*'),
  policy_version TEXT NOT NULL,
  category TEXT NOT NULL,
  baseline_risk TEXT NOT NULL CHECK (baseline_risk IN ('GREEN', 'YELLOW', 'RED')),
  rationale TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL,
  UNIQUE (hs_code, policy_version)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_hs_policy_one_active_code
  ON hs_policy_catalog(hs_code) WHERE active = 1;
CREATE INDEX IF NOT EXISTS idx_hs_policy_version_active
  ON hs_policy_catalog(policy_version, active);

CREATE TABLE IF NOT EXISTS campus_allocations (
  id TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL REFERENCES batches(id) ON DELETE RESTRICT,
  campus_org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  allocated_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  received_by_user_id TEXT REFERENCES users(id) ON DELETE RESTRICT,
  quantity INTEGER NOT NULL CHECK (typeof(quantity) = 'integer' AND quantity BETWEEN 1 AND 500),
  status TEXT NOT NULL CHECK (status IN ('ALLOCATED', 'RECEIVED')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  received_at TEXT,
  CHECK (
    (status = 'ALLOCATED' AND received_by_user_id IS NULL AND received_at IS NULL) OR
    (status = 'RECEIVED' AND received_by_user_id IS NOT NULL AND received_at IS NOT NULL)
  )
);

CREATE TABLE IF NOT EXISTS allocation_items (
  allocation_id TEXT NOT NULL REFERENCES campus_allocations(id) ON DELETE CASCADE,
  item_id TEXT NOT NULL UNIQUE REFERENCES items(id) ON DELETE RESTRICT,
  ordinal INTEGER NOT NULL CHECK (typeof(ordinal) = 'integer' AND ordinal > 0),
  PRIMARY KEY (allocation_id, item_id),
  UNIQUE (allocation_id, ordinal)
);

CREATE INDEX IF NOT EXISTS idx_allocations_batch_status
  ON campus_allocations(batch_id, status);
CREATE INDEX IF NOT EXISTS idx_allocations_campus_status
  ON campus_allocations(campus_org_id, status);
`;

export function seedHsPolicyCatalog(db: DatabaseConnection): void {
  const insert = db.prepare<[
    string,
    string,
    string,
    string,
    string,
    string,
    number,
    string,
  ]>(
    `INSERT OR IGNORE INTO hs_policy_catalog
      (id, hs_code, policy_version, category, baseline_risk, rationale, active, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  for (const policy of HS_POLICY_CATALOG) {
    insert.run(
      policy.id,
      policy.hsCode,
      HS_POLICY_VERSION,
      policy.category,
      policy.baselineRisk,
      policy.rationale,
      1,
      "2026-03-01T00:00:00.000Z",
    );
  }
}

type GlobalDatabaseState = typeof globalThis & {
  __ecoDropsDatabase?: DatabaseConnection;
  __ecoDropsDatabasePath?: string;
};

const globalDatabase = globalThis as GlobalDatabaseState;

export function getDatabasePath(configured = process.env.DATABASE_PATH): string {
  if (configured === ":memory:") return configured;
  return resolve(/*turbopackIgnore: true*/ process.cwd(), configured ?? "./data/eco-drops.db");
}

export function initializeDatabase(db: DatabaseConnection): DatabaseConnection {
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 5000");
  if (!db.memory && !db.readonly) db.pragma("journal_mode = WAL");
  db.exec(SCHEMA_SQL);

  const stored = db.prepare<[], { value: string }>(
    "SELECT value FROM app_meta WHERE key = 'schema_version'",
  ).get()?.value;
  const currentVersion = stored === undefined ? 0 : Number(stored);
  if (!Number.isSafeInteger(currentVersion) || currentVersion < 0) {
    throw new Error(`Invalid EcoDrops schema version: ${stored ?? "missing"}.`);
  }
  if (currentVersion > SCHEMA_VERSION) {
    throw new Error(
      `EcoDrops database schema ${currentVersion} is newer than supported schema ${SCHEMA_VERSION}.`,
    );
  }

  db.transaction(() => {
    // v2 is intentionally additive: existing v1 tables and rows are never rebuilt or deleted.
    db.exec(SCHEMA_V2_SQL);
    seedHsPolicyCatalog(db);
    db.prepare<[string]>(
      `INSERT INTO app_meta (key, value) VALUES ('schema_version', ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    ).run(String(SCHEMA_VERSION));
  }).immediate();
  return db;
}

export function openDatabase(path = getDatabasePath()): DatabaseConnection {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  return initializeDatabase(new BetterSqlite3(path));
}

export function getDatabase(): DatabaseConnection {
  const path = getDatabasePath();
  if (!globalDatabase.__ecoDropsDatabase?.open || globalDatabase.__ecoDropsDatabasePath !== path) {
    if (globalDatabase.__ecoDropsDatabase?.open) globalDatabase.__ecoDropsDatabase.close();
    globalDatabase.__ecoDropsDatabase = openDatabase(path);
    globalDatabase.__ecoDropsDatabasePath = path;
  } else {
    // Development module reloads can retain this handle; rerun idempotent initialization
    // so an already-open v1 connection is upgraded before a new server context uses it.
    initializeDatabase(globalDatabase.__ecoDropsDatabase);
  }
  return globalDatabase.__ecoDropsDatabase;
}

export function closeDatabase(): void {
  if (globalDatabase.__ecoDropsDatabase?.open) globalDatabase.__ecoDropsDatabase.close();
  delete globalDatabase.__ecoDropsDatabase;
  delete globalDatabase.__ecoDropsDatabasePath;
}

export function runInTransaction<T>(db: DatabaseConnection, work: () => T): T {
  return db.transaction(work).immediate();
}
