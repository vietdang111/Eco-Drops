import { randomBytes, randomUUID } from "node:crypto";
import { z } from "zod";
import {
  appendAuditEvent,
  canonicalJson,
  sha256Hex,
  verifyAuditChain,
  type AuditVerificationResult,
} from "./audit";
import {
  createSession,
  hashPassword,
  hashSessionToken,
  persistSession,
  resolveSession,
  revokeSession,
  sessionCookie,
  verifyPassword,
  assertRole,
  type SessionCookieDescriptor,
  type SessionIdentity,
} from "./auth";
import {
  calculateAvoidedEmissions,
  type AvoidedEmissionsEstimate,
  type CarbonCalculationInput,
} from "./carbon";
import {
  getDatabase,
  HS_POLICY_NOTICE,
  runInTransaction,
  type DatabaseConnection,
} from "./db";
import type {
  ActorContext,
  AllocationMutationResult,
  AllocationReceiptResult,
  AllocationStatus,
  BatchStatus,
  BatchSummary,
  CampusAllocation,
  CertificateExport,
  ClaimResult,
  ClaimStatus,
  DashboardSnapshot,
  DisplacementAnswer,
  FollowUpOutcome,
  HsPolicyCatalogEntry,
  InvoiceChecks,
  ItemStatus,
  JsonPrimitive,
  JsonValue,
  KioskMode,
  KioskSessionCredentials,
  MatchedItem,
  OutcomeAggregate,
  PublicCertificateProjection,
  RevealedClaim,
  RevealDecision,
  RiskTier,
  SafeUser,
  ShipmentStatus,
  UserRole,
  VarianceTier,
} from "./domain";
import { DomainError, isSqliteConstraintError } from "./errors";
import {
  advanceShipmentSchema,
  certifyBatchSchema,
  checkoutSchema,
  createBatchSchema,
  createCampusAllocationSchema,
  createShipmentSchema,
  dropBackSchema,
  loginSchema,
  matchKioskSchema,
  receiveBatchSchema,
  receiveCampusAllocationSchema,
  recordDecisionSchema,
  recordSurveySchema,
  revealClaimSchema,
  signupCorporateSchema,
  startKioskSessionSchema,
  submitBatchSchema,
  type AdvanceShipmentInput,
  type CertifyBatchInput,
  type CheckoutInput,
  type CreateBatchInput,
  type CreateCampusAllocationInput,
  type CreateShipmentInput,
  type DropBackInput,
  type LoginInput,
  type ReceiveBatchInput,
  type ReceiveCampusAllocationInput,
  type RecordDecisionInput,
  type RecordSurveyInput,
  type RevealClaimInput,
  type SignupCorporateInput,
  type StartKioskSessionInput,
  type SubmitBatchInput,
} from "./schemas";
import {
  assertBatchTransition,
  assertCertificationGates,
  assertSubmissionGate,
  assessBatchRisk,
  calculateRemainingAllocationCapacity,
  calculateVerifiedUnits,
  classifyWeightVariance,
} from "./workflow";

const ESTIMATE_DISCLAIMER =
  "This is an estimated avoided-emissions record, not a carbon credit, offset, Scope 3 deduction, tax record, or third-party audit.";
const KIOSK_TTL_SECONDS = 30 * 60;
const DEFAULT_WEEKLY_CLAIM_CAP = 1;

interface BatchRow {
  id: string;
  organizationId: string;
  organizationName: string;
  createdByUserId: string;
  hsCode: string;
  category: string;
  quantity: number;
  unitWeightKg: number;
  declaredValueCents: number;
  invoiceIdentifier: string;
  invoiceFormatCheck: number;
  invoiceConsistencyCheck: number;
  invoicePlausibilityCheck: number;
  invoiceUniquenessCheck: number;
  authorityAttested: number;
  complianceAttested: number;
  status: BatchStatus;
  riskTier: RiskTier | null;
  riskRulesVersion: string | null;
  factorId: string | null;
  createdAt: string;
  updatedAt: string;
}

interface FactorRow {
  factorId: string;
  category: string;
  factorVersion: string;
  methodologySource: string;
  methodologyVersion: string;
  formulaVersion: string;
  lowFactor: number;
  baseFactor: number;
  highFactor: number;
  lowDisplacement: number;
  baseDisplacement: number;
  highDisplacement: number;
  lowRetention: number;
  baseRetention: number;
  highRetention: number;
  handling: number;
  displacementSampleSize: number;
  retentionSampleSize: number;
}

interface HsPolicyRow {
  id: string;
  hsCode: string;
  policyVersion: string;
  category: string;
  baselineRisk: RiskTier;
  rationale: string;
  active: number;
}

interface AllocationRow {
  id: string;
  batchId: string;
  sourceOrganizationId: string;
  sourceOrganizationName: string;
  campusOrganizationId: string;
  campusName: string;
  quantity: number;
  status: AllocationStatus;
  allocatedByUserId: string;
  receivedByUserId: string | null;
  category: string;
  itemCount: number;
  createdAt: string;
  updatedAt: string;
  receivedAt: string | null;
}

interface DistributionRow {
  verifiedUnits: number;
  existingItemCount: number;
  pendingAllocationQuantity: number;
  receivedAllocationQuantity: number;
  totalAllocationQuantity: number;
}

interface ShipmentRow {
  id: string;
  batchId: string;
  trackingReference: string;
  status: ShipmentStatus;
  carrierMode: "SIMULATED" | "WEBHOOK";
  createdAt: string;
  updatedAt: string;
}

interface ReceivingRow {
  id: string;
  batchId: string;
  receivedByUserId: string;
  grossWeightKg: number;
  tareWeightKg: number;
  netWeightKg: number;
  expectedWeightKg: number;
  absoluteVarianceKg: number;
  varianceRatio: number;
  varianceTier: VarianceTier;
  sampleScanCount: number;
  verifiedUnits: number;
  reviewReason: string | null;
  receivedAt: string;
  evidencePhotoCount: number;
}

interface CertificateRow {
  recordId: string;
  batchId: string;
  issueDate: string;
  status: "CERTIFIED" | "REVOKED";
  methodologyVersion: string;
  snapshotJson: string;
  lowKgCO2e: number;
  baseKgCO2e: number;
  highKgCO2e: number;
  auditHash: string;
}

interface KioskRow {
  id: string;
  campusOrganizationId: string;
  tokenHash: string;
  weeklyKeyHash: string;
  mode: KioskMode;
  requestedCategoriesJson: string;
  compatibilityJson: string;
  needTagsJson: string;
  createdAt: string;
  expiresAt: string;
}

interface ItemRow {
  id: string;
  batchId: string;
  campusOrganizationId: string;
  label: string;
  category: string;
  compatibilityJson: string;
  needTagsJson: string;
  status: ItemStatus;
  circulationCount: number;
}

interface ClaimItemRow {
  claimId: string;
  kioskSessionId: string;
  itemId: string;
  claimStatus: ClaimStatus;
  claimMethod: "SPONSORED_FREE";
  claimCreatedAt: string;
  itemStatus: ItemStatus;
  label: string;
  category: string;
  compatibilityJson: string;
}

interface IdempotencyRow {
  requestHash: string;
  responseJson: string;
}

interface UserAuthRow {
  id: string;
  organizationId: string;
  organizationName: string;
  email: string;
  passwordHash: string;
  role: UserRole;
}

interface OutcomeRow {
  claimStatus: ClaimStatus;
  itemStatus: ItemStatus;
  circulationCount: number;
  decision: RevealDecision | null;
  followUpOutcome: FollowUpOutcome | null;
}

export interface EcoDropsServiceOptions {
  db?: DatabaseConnection;
  now?: () => Date;
  id?: () => string;
  demoMode?: boolean;
  kioskTtlSeconds?: number;
  weeklyClaimCap?: number;
}

export interface AuthenticationResult {
  user: SafeUser;
  actor: ActorContext;
  sessionId: string;
  expiresAt: string;
  token: string;
  cookie: SessionCookieDescriptor;
}

export interface ShipmentResult {
  id: string;
  batchId: string;
  trackingReference: string;
  status: ShipmentStatus;
  simulated: boolean;
  updatedAt: string;
}

export interface ReceivingResult {
  id: string;
  batchId: string;
  netWeightKg: number;
  expectedWeightKg: number;
  variancePercent: number;
  varianceTier: VarianceTier;
  verifiedUnits: number;
  batchStatus: BatchStatus;
  evidencePhotoCount: number;
  receivedAt: string;
}

export interface DecisionResult {
  claimId: string;
  itemId: string;
  decision: RevealDecision;
  claimStatus: ClaimStatus;
  itemStatus: ItemStatus;
  recordedAt: string;
}

export interface SurveyResult {
  claimId: string;
  displacementAnswer: DisplacementAnswer;
  followUpOutcome: FollowUpOutcome;
  recordedAt: string;
}

export interface DropBackResult {
  claimId: string;
  itemId: string;
  claimStatus: "RETURNED";
  itemStatus: "AVAILABLE";
  circulationCount: number;
  returnedAt: string;
}

export interface DemoResetResult {
  synthetic: true;
  organizations: number;
  users: number;
  batches: number;
  items: number;
  password: string;
}

function parseInput<S extends z.ZodType>(schema: S, input: unknown): z.output<S> {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new DomainError("INVALID_INPUT", "Request validation failed.", {
      issues: result.error.issues.map((issue) => ({ path: issue.path, message: issue.message })),
    });
  }
  return result.data;
}

function bool(value: number): boolean {
  return value === 1;
}

function parseJson<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function toJsonValue(value: unknown): JsonValue {
  return JSON.parse(canonicalJson(value)) as JsonValue;
}

function batchSelect(): string {
  return `SELECT b.id, b.org_id AS organizationId, o.name AS organizationName,
                 b.created_by_user_id AS createdByUserId, b.hs_code AS hsCode,
                 b.category, b.quantity, b.unit_weight_kg AS unitWeightKg,
                 b.declared_value_cents AS declaredValueCents,
                 b.invoice_identifier AS invoiceIdentifier,
                 b.invoice_format_check AS invoiceFormatCheck,
                 b.invoice_consistency_check AS invoiceConsistencyCheck,
                 b.invoice_plausibility_check AS invoicePlausibilityCheck,
                 b.invoice_uniqueness_check AS invoiceUniquenessCheck,
                 b.authority_attested AS authorityAttested,
                 b.compliance_attested AS complianceAttested,
                 b.status, b.risk_tier AS riskTier, b.risk_rules_version AS riskRulesVersion,
                 b.factor_id AS factorId, b.created_at AS createdAt, b.updated_at AS updatedAt
            FROM batches b JOIN organizations o ON o.id = b.org_id`;
}

function mapBatch(row: BatchRow): BatchSummary {
  return {
    id: row.id,
    organizationId: row.organizationId,
    organizationName: row.organizationName,
    createdByUserId: row.createdByUserId,
    hsCode: row.hsCode,
    category: row.category,
    quantity: row.quantity,
    unitWeightKg: row.unitWeightKg,
    declaredValueCents: row.declaredValueCents,
    invoiceIdentifier: row.invoiceIdentifier,
    invoiceChecks: {
      format: bool(row.invoiceFormatCheck),
      consistency: bool(row.invoiceConsistencyCheck),
      plausibility: bool(row.invoicePlausibilityCheck),
      uniqueness: bool(row.invoiceUniquenessCheck),
    },
    authorityAttested: bool(row.authorityAttested),
    complianceAttested: bool(row.complianceAttested),
    status: row.status,
    riskTier: row.riskTier,
    riskRulesVersion: row.riskRulesVersion,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapHsPolicy(row: HsPolicyRow): HsPolicyCatalogEntry {
  return {
    hsCode: row.hsCode,
    category: row.category,
    baselineRisk: row.baselineRisk,
    policyDecision:
      row.baselineRisk === "RED" ? "BLOCKED" : row.baselineRisk === "YELLOW" ? "REVIEW" : "ELIGIBLE",
    policyVersion: row.policyVersion,
    rationale: row.rationale,
    active: true,
    requiresComplianceAttestation: row.baselineRisk === "YELLOW",
    notice: HS_POLICY_NOTICE,
  };
}

function allocationSelect(): string {
  return `SELECT a.id, a.batch_id AS batchId,
                 b.org_id AS sourceOrganizationId, source.name AS sourceOrganizationName,
                 a.campus_org_id AS campusOrganizationId, campus.name AS campusName,
                 a.quantity, a.status, a.allocated_by_user_id AS allocatedByUserId,
                 a.received_by_user_id AS receivedByUserId, b.category,
                 (SELECT COUNT(*) FROM allocation_items ai WHERE ai.allocation_id = a.id) AS itemCount,
                 a.created_at AS createdAt, a.updated_at AS updatedAt, a.received_at AS receivedAt
            FROM campus_allocations a
            JOIN batches b ON b.id = a.batch_id
            JOIN organizations source ON source.id = b.org_id
            JOIN organizations campus ON campus.id = a.campus_org_id`;
}

function mapAllocation(row: AllocationRow): CampusAllocation {
  return {
    id: row.id,
    batchId: row.batchId,
    sourceOrganizationId: row.sourceOrganizationId,
    sourceOrganizationName: row.sourceOrganizationName,
    campusOrganizationId: row.campusOrganizationId,
    campusName: row.campusName,
    quantity: row.quantity,
    status: row.status,
    allocatedByUserId: row.allocatedByUserId,
    receivedByUserId: row.receivedByUserId,
    category: row.category,
    itemCount: row.itemCount,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    receivedAt: row.receivedAt,
  };
}

function defaultLabelPrefix(category: string): string {
  const safeCategory = category
    .replace(/[^\p{L}\p{N} ._&()'\/-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
  return `EcoDrops ${safeCategory || "Item"}`.slice(0, 80);
}

function isPdf(bytes: Uint8Array): boolean {
  return bytes.byteLength >= 5 && Buffer.from(bytes.subarray(0, 5)).toString("ascii") === "%PDF-";
}

function hasImageSignature(mimeType: "image/jpeg" | "image/png", bytes: Uint8Array): boolean {
  if (mimeType === "image/jpeg") {
    return bytes.byteLength >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  return bytes.byteLength >= png.length && png.every((byte, index) => bytes[index] === byte);
}

function isoWeekKey(date: Date): string {
  const target = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = target.getUTCDay() || 7;
  target.setUTCDate(target.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((target.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${target.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

function sameScalar(left: JsonPrimitive | undefined, right: JsonPrimitive): boolean {
  return left === right;
}

export class EcoDropsService {
  readonly db: DatabaseConnection;
  private readonly clock: () => Date;
  private readonly createId: () => string;
  private readonly demoMode: boolean;
  private readonly kioskTtlSeconds: number;
  private readonly weeklyClaimCap: number;

  constructor(options: EcoDropsServiceOptions = {}) {
    this.db = options.db ?? getDatabase();
    this.clock = options.now ?? (() => new Date());
    this.createId = options.id ?? randomUUID;
    this.demoMode = options.demoMode ?? process.env.DEMO_MODE === "true";
    this.kioskTtlSeconds = options.kioskTtlSeconds ?? KIOSK_TTL_SECONDS;
    this.weeklyClaimCap = options.weeklyClaimCap ?? (this.demoMode ? 3 : DEFAULT_WEEKLY_CLAIM_CAP);
  }

  authenticate(rawToken: string): SessionIdentity {
    return resolveSession(this.db, rawToken, this.clock());
  }

  getHsCodePolicy(actor: ActorContext, hsCode: string): HsPolicyCatalogEntry {
    this.assertActor(actor, ["corp_user", "warehouse_op", "campus_admin", "admin"]);
    if (!/^\d{6}$/.test(hsCode)) {
      throw new DomainError("INVALID_INPUT", "HS code must contain exactly six digits.");
    }
    const policy = this.activeHsPolicy(hsCode);
    if (!policy) {
      throw new DomainError("NOT_FOUND", "No active HS policy is configured for this code.", {
        hsCode,
        policyDecision: "BLOCKED",
      });
    }
    return mapHsPolicy(policy);
  }

  async signupCorporate(input: SignupCorporateInput): Promise<AuthenticationResult> {
    const parsed = parseInput(signupCorporateSchema, input);
    const now = this.clock();
    const nowIso = now.toISOString();
    const passwordHash = await hashPassword(parsed.password);
    const organizationId = this.createId();
    const userId = this.createId();
    const session = createSession(now);
    const slugStem = parsed.organizationName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 50) || "organization";
    const slug = `${slugStem}-${organizationId.replace(/-/g, "").slice(0, 8)}`;
    const actor: ActorContext = { userId, organizationId, role: "corp_user" };

    try {
      runInTransaction(this.db, () => {
        this.db.prepare<[string, string, string, number, string]>(
          "INSERT INTO organizations (id, name, slug, kind, synthetic, created_at) VALUES (?, ?, ?, 'corporate', ?, ?)",
        ).run(organizationId, parsed.organizationName, slug, 0, nowIso);
        this.db.prepare<[string, string, string, string, string, number, string]>(
          "INSERT INTO users (id, org_id, email, password_hash, role, synthetic, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
        ).run(userId, organizationId, parsed.email, passwordHash, "corp_user", 0, nowIso);
        persistSession(this.db, userId, session);
        appendAuditEvent(this.db, {
          eventType: "CORPORATE_ACCOUNT_CREATED",
          entityType: "organization",
          entityId: organizationId,
          actor,
          occurredAt: nowIso,
          payload: { userId, role: "corp_user" },
        });
      });
    } catch (error) {
      if (isSqliteConstraintError(error)) {
        throw new DomainError("DUPLICATE", "An account with this email already exists.");
      }
      throw error;
    }

    const user: SafeUser = {
      id: userId,
      organizationId,
      organizationName: parsed.organizationName,
      email: parsed.email,
      role: "corp_user",
    };
    return {
      user,
      actor,
      sessionId: session.id,
      expiresAt: session.expiresAt,
      token: session.rawToken,
      cookie: sessionCookie(session),
    };
  }

  async login(input: LoginInput): Promise<AuthenticationResult> {
    const parsed = parseInput(loginSchema, input);
    const row = this.db.prepare<[string], UserAuthRow>(
      `SELECT u.id, u.org_id AS organizationId, o.name AS organizationName, u.email,
              u.password_hash AS passwordHash, u.role
         FROM users u JOIN organizations o ON o.id = u.org_id
        WHERE u.email = ?`,
    ).get(parsed.email);
    if (!row || !(await verifyPassword(parsed.password, row.passwordHash))) {
      throw new DomainError("INVALID_CREDENTIALS", "Email or password is incorrect.");
    }

    const now = this.clock();
    const session = createSession(now);
    const actor: ActorContext = {
      userId: row.id,
      organizationId: row.organizationId,
      role: row.role,
    };
    runInTransaction(this.db, () => {
      persistSession(this.db, row.id, session);
      appendAuditEvent(this.db, {
        eventType: "SESSION_CREATED",
        entityType: "session",
        entityId: session.id,
        actor,
        occurredAt: now.toISOString(),
        payload: { expiresAt: session.expiresAt },
      });
    });

    return {
      user: {
        id: row.id,
        organizationId: row.organizationId,
        organizationName: row.organizationName,
        email: row.email,
        role: row.role,
      },
      actor,
      sessionId: session.id,
      expiresAt: session.expiresAt,
      token: session.rawToken,
      cookie: sessionCookie(session),
    };
  }

  logout(rawToken: string): void {
    const identity = this.authenticate(rawToken);
    const now = this.clock();
    runInTransaction(this.db, () => {
      if (!revokeSession(this.db, rawToken, now)) {
        throw new DomainError("AUTHENTICATION_REQUIRED", "The session is no longer active.");
      }
      appendAuditEvent(this.db, {
        eventType: "SESSION_REVOKED",
        entityType: "session",
        entityId: identity.sessionId,
        actor: identity.actor,
        occurredAt: now.toISOString(),
        payload: {},
      });
    });
  }

  createBatch(actor: ActorContext, input: CreateBatchInput): BatchSummary {
    this.assertActor(actor, ["corp_user"]);
    const parsed = parseInput(createBatchSchema, input);
    const policy = this.activeHsPolicy(parsed.hsCode);
    if (!policy) {
      throw new DomainError(
        "BUSINESS_GATE_FAILED",
        "This HS code is not present in the active policy catalog and therefore fails closed.",
        { hsCode: parsed.hsCode, policyDecision: "BLOCKED" },
      );
    }
    if (
      parsed.category !== undefined &&
      parsed.category.toLocaleLowerCase() !== policy.category.toLocaleLowerCase()
    ) {
      throw new DomainError(
        "INVALID_INPUT",
        "The legacy category does not match the authoritative HS catalog category.",
        {
          hsCode: parsed.hsCode,
          providedCategory: parsed.category,
          derivedCategory: policy.category,
        },
      );
    }
    const now = this.clock().toISOString();
    const invoiceFormatCheck = isPdf(parsed.invoice.bytes);
    if (!invoiceFormatCheck) {
      throw new DomainError("INVALID_INPUT", "Invoice content does not have a valid PDF signature.");
    }
    const invoiceHash = sha256Hex(parsed.invoice.bytes);
    if (this.db.prepare<[string]>("SELECT 1 FROM batches WHERE invoice_hash = ?").get(invoiceHash)) {
      throw new DomainError("DUPLICATE", "This invoice file was already uploaded.");
    }
    const invoiceChecks: InvoiceChecks = {
      format: true,
      consistency: parsed.invoiceIdentifier.trim().length > 0,
      plausibility: parsed.declaredValueCents / parsed.quantity <= 10_000_000,
      uniqueness: true,
    };
    const factor = this.factorForCategory(policy.category);
    const batchId = this.createId();
    const storageName = `${this.createId().replace(/-/g, "")}.pdf`;

    try {
      return runInTransaction(this.db, () => {
        this.db.prepare<[
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
          number,
          string,
          number,
          number,
          number,
          number,
          number,
          string,
          string,
          string,
        ]>(
          `INSERT INTO batches
            (id, org_id, created_by_user_id, hs_code, category, quantity, unit_weight_kg,
             declared_value_cents, invoice_identifier, invoice_hash, invoice_mime_type,
             invoice_size_bytes, invoice_storage_name, invoice_format_check,
             invoice_consistency_check, invoice_plausibility_check, invoice_uniqueness_check,
             authority_attested, status, factor_id, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'application/pdf', ?, ?, ?, ?, ?, ?, ?, 'DRAFT', ?, ?, ?)`,
        ).run(
          batchId,
          actor.organizationId,
          actor.userId,
          parsed.hsCode,
          policy.category,
          parsed.quantity,
          parsed.unitWeightKg,
          parsed.declaredValueCents,
          parsed.invoiceIdentifier,
          invoiceHash,
          parsed.invoice.bytes.byteLength,
          storageName,
          1,
          invoiceChecks.consistency ? 1 : 0,
          invoiceChecks.plausibility ? 1 : 0,
          1,
          1,
          factor.factorId,
          now,
          now,
        );
        appendAuditEvent(this.db, {
          eventType: "BATCH_CREATED",
          entityType: "batch",
          entityId: batchId,
          actor,
          occurredAt: now,
          payload: {
            hsCode: parsed.hsCode,
            category: policy.category,
            hsPolicyVersion: policy.policyVersion,
            hsBaselineRisk: policy.baselineRisk,
            hsPolicyRationale: policy.rationale,
            hsPolicyNotice: HS_POLICY_NOTICE,
            quantity: parsed.quantity,
            unitWeightKg: parsed.unitWeightKg,
            invoiceChecks: toJsonValue(invoiceChecks),
          },
        });
        return mapBatch(this.requireBatch(actor, batchId));
      });
    } catch (error) {
      if (error instanceof DomainError) throw error;
      if (isSqliteConstraintError(error)) {
        throw new DomainError("DUPLICATE", "Invoice hash or identifier is already registered.");
      }
      throw error;
    }
  }

  submitBatch(actor: ActorContext, input: SubmitBatchInput): BatchSummary {
    this.assertActor(actor, ["corp_user", "admin"]);
    const parsed = parseInput(submitBatchSchema, input);
    const now = this.clock().toISOString();

    return runInTransaction(this.db, () => {
      const row = this.requireBatch(actor, parsed.batchId);
      if (row.status !== "DRAFT") {
        throw new DomainError("ILLEGAL_TRANSITION", "Only draft batches can be submitted.");
      }
      const policy = this.activeHsPolicy(row.hsCode);
      const risk = assessBatchRisk({
        // The legacy stored category is display history only; HS policy is authoritative.
        category: policy?.category ?? "unmapped hs policy",
        quantity: row.quantity,
        unitWeightKg: row.unitWeightKg,
        declaredValueCents: row.declaredValueCents,
        authorityAttested: bool(row.authorityAttested),
        invoiceChecks: {
          format: bool(row.invoiceFormatCheck),
          consistency: bool(row.invoiceConsistencyCheck),
          plausibility: bool(row.invoicePlausibilityCheck),
          uniqueness: bool(row.invoiceUniquenessCheck),
        },
        baselineRisk: policy?.baselineRisk ?? "RED",
        baselineReasons: [
          policy?.rationale ?? "HS code is absent from the active policy catalog and fails closed",
        ],
        policyVersion: policy?.policyVersion ?? "hs-policy-unmapped",
      });
      assertSubmissionGate(risk.tier, parsed.complianceAttested);
      const nextStatus: BatchStatus = risk.tier === "RED" ? "BLOCKED" : "PENDING_VERIFICATION";
      assertBatchTransition(row.status, nextStatus);
      this.db.prepare<[string, string, string, number, string, string, string]>(
        `UPDATE batches SET status = ?, risk_tier = ?, risk_rules_version = ?,
                            compliance_attested = ?, risk_reasons_json = ?, updated_at = ?
          WHERE id = ?`,
      ).run(
        nextStatus,
        risk.tier,
        risk.rulesVersion,
        parsed.complianceAttested ? 1 : 0,
        canonicalJson(risk.reasons),
        now,
        row.id,
      );
      appendAuditEvent(this.db, {
        eventType: risk.tier === "RED" ? "BATCH_BLOCKED" : "BATCH_SUBMITTED",
        entityType: "batch",
        entityId: row.id,
        actor,
        occurredAt: now,
        payload: {
          previousStatus: row.status,
          status: nextStatus,
          riskTier: risk.tier,
          riskRulesVersion: risk.rulesVersion,
          riskReasons: risk.reasons,
          hsCode: row.hsCode,
          hsPolicyVersion: policy?.policyVersion ?? null,
          hsBaselineRisk: policy?.baselineRisk ?? "RED",
          hsPolicyKnown: policy !== undefined,
          complianceAttested: parsed.complianceAttested,
        },
      });
      return mapBatch(this.requireBatch(actor, row.id));
    });
  }

  getBatchImpact(actor: ActorContext, batchId: string): AvoidedEmissionsEstimate {
    const row = this.requireBatch(actor, batchId);
    const receiving = this.receivingForBatch(batchId);
    const eligibleUnits = receiving?.verifiedUnits ?? row.quantity;
    return calculateAvoidedEmissions(
      this.carbonInput(row, eligibleUnits),
      ["CERTIFIED", "DISTRIBUTING", "CLOSED"].includes(row.status),
    );
  }

  createShipment(actor: ActorContext, input: CreateShipmentInput): ShipmentResult {
    this.assertActor(actor, ["corp_user", "admin"]);
    const parsed = parseInput(createShipmentSchema, input);
    const now = this.clock().toISOString();
    const shipmentId = this.createId();
    const trackingReference = `ECO-${this.createId().replace(/-/g, "").slice(0, 14).toUpperCase()}`;
    const carrierMode = this.demoMode ? "SIMULATED" : "WEBHOOK";
    const eventSource = this.demoMode ? "SIMULATED_CARRIER" : "SIGNED_CARRIER_WEBHOOK";

    return runInTransaction(this.db, () => {
      const batch = this.requireBatch(actor, parsed.batchId);
      if (batch.riskTier === "RED") {
        throw new DomainError("BUSINESS_GATE_FAILED", "Red-tier batches cannot be shipped.");
      }
      assertBatchTransition(batch.status, "IN_TRANSIT");
      this.db.prepare<[string, string, string, string, string, string]>(
        `INSERT INTO shipments
          (id, batch_id, tracking_reference, status, carrier_mode, created_at, updated_at)
         VALUES (?, ?, ?, 'IN_TRANSIT', ?, ?, ?)`,
      ).run(shipmentId, batch.id, trackingReference, carrierMode, now, now);
      this.db.prepare<[string, string, string, string]>(
        `INSERT INTO shipment_events (id, shipment_id, status, source, occurred_at, payload_json)
         VALUES (?, ?, 'CREATED', ?, ?, '{}')`,
      ).run(this.createId(), shipmentId, eventSource, now);
      this.db.prepare<[string, string, string, string]>(
        `INSERT INTO shipment_events (id, shipment_id, status, source, occurred_at, payload_json)
         VALUES (?, ?, 'IN_TRANSIT', ?, ?, '{}')`,
      ).run(this.createId(), shipmentId, eventSource, now);
      this.db.prepare<[string, string, string]>(
        "UPDATE batches SET status = 'IN_TRANSIT', updated_at = ? WHERE id = ? AND status = ?",
      ).run(now, batch.id, batch.status);
      appendAuditEvent(this.db, {
        eventType: "SHIPMENT_CREATED",
        entityType: "shipment",
        entityId: shipmentId,
        actor,
        organizationId: batch.organizationId,
        occurredAt: now,
        payload: {
          batchId: batch.id,
          trackingReference,
          status: "IN_TRANSIT",
          simulated: this.demoMode,
        },
      });
      return {
        id: shipmentId,
        batchId: batch.id,
        trackingReference,
        status: "IN_TRANSIT",
        simulated: this.demoMode,
        updatedAt: now,
      };
    });
  }

  advanceShipmentSimulation(actor: ActorContext, input: AdvanceShipmentInput): ShipmentResult {
    if (!this.demoMode) {
      throw new DomainError("DEMO_MODE_DISABLED", "Shipment simulation is unavailable outside demo mode.");
    }
    this.assertActor(actor, ["corp_user", "warehouse_op", "admin"]);
    const parsed = parseInput(advanceShipmentSchema, input);
    return this.deliverShipment(actor, parsed.shipmentId, "SIMULATED_CARRIER");
  }

  recordSignedCarrierDelivery(actor: ActorContext, input: AdvanceShipmentInput): ShipmentResult {
    this.assertActor(actor, ["warehouse_op", "admin"]);
    const parsed = parseInput(advanceShipmentSchema, input);
    return this.deliverShipment(actor, parsed.shipmentId, "SIGNED_CARRIER_WEBHOOK");
  }

  receiveBatch(actor: ActorContext, input: ReceiveBatchInput): ReceivingResult {
    this.assertActor(actor, ["warehouse_op", "admin"]);
    const parsed = parseInput(receiveBatchSchema, input);
    parsed.evidencePhotos.forEach((photo) => {
      if (!hasImageSignature(photo.mimeType, photo.bytes)) {
        throw new DomainError("INVALID_INPUT", `Evidence content does not match ${photo.mimeType}.`);
      }
    });
    const now = this.clock().toISOString();
    const receivingId = this.createId();

    return runInTransaction(this.db, () => {
      const batch = this.requireBatch(actor, parsed.batchId);
      if (batch.status !== "DELIVERED") {
        throw new DomainError("ILLEGAL_TRANSITION", "Only delivered batches can be received.");
      }
      if (this.receivingForBatch(batch.id)) {
        throw new DomainError("DUPLICATE", "This batch already has a receiving record.");
      }
      const netWeightKg = parsed.grossWeightKg - parsed.tareWeightKg;
      const expectedWeightKg = batch.quantity * batch.unitWeightKg;
      const variance = classifyWeightVariance(expectedWeightKg, netWeightKg);
      const verifiedUnits = calculateVerifiedUnits(batch.quantity, netWeightKg, batch.unitWeightKg);
      const nextStatus: BatchStatus =
        variance.tier === "PASS" ? "RECEIVED" : variance.tier === "REVIEW" ? "UNDER_REVIEW" : "REJECTED";
      assertBatchTransition(batch.status, nextStatus);

      this.db.prepare<[
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
        string,
      ]>(
        `INSERT INTO receivings
          (id, batch_id, received_by_user_id, gross_weight_kg, tare_weight_kg, net_weight_kg,
           expected_weight_kg, absolute_variance_kg, variance_ratio, variance_tier,
           sample_scan_count, verified_units, received_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        receivingId,
        batch.id,
        actor.userId,
        parsed.grossWeightKg,
        parsed.tareWeightKg,
        netWeightKg,
        expectedWeightKg,
        variance.absoluteVarianceKg,
        variance.varianceRatio,
        variance.tier,
        parsed.sampleScanCount,
        verifiedUnits,
        now,
      );

      for (const photo of parsed.evidencePhotos) {
        const extension = photo.mimeType === "image/png" ? "png" : "jpg";
        this.db.prepare<[string, string, string, string, string, number, string]>(
          `INSERT INTO evidence_photos
            (id, receiving_id, storage_name, content_hash, mime_type, size_bytes, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        ).run(
          this.createId(),
          receivingId,
          `${this.createId().replace(/-/g, "")}.${extension}`,
          sha256Hex(photo.bytes),
          photo.mimeType,
          photo.bytes.byteLength,
          now,
        );
      }
      this.db.prepare<[string, string, string]>(
        "UPDATE batches SET status = ?, updated_at = ? WHERE id = ?",
      ).run(nextStatus, now, batch.id);
      appendAuditEvent(this.db, {
        eventType: "BATCH_RECEIVED",
        entityType: "batch",
        entityId: batch.id,
        actor,
        organizationId: batch.organizationId,
        occurredAt: now,
        payload: {
          previousStatus: batch.status,
          status: nextStatus,
          grossWeightKg: parsed.grossWeightKg,
          tareWeightKg: parsed.tareWeightKg,
          netWeightKg,
          expectedWeightKg,
          variancePercent: variance.variancePercent,
          varianceTier: variance.tier,
          sampleScanCount: parsed.sampleScanCount,
          verifiedUnits,
          evidencePhotoCount: parsed.evidencePhotos.length,
          scaleSimulated: this.demoMode,
        },
      });

      return {
        id: receivingId,
        batchId: batch.id,
        netWeightKg,
        expectedWeightKg,
        variancePercent: variance.variancePercent,
        varianceTier: variance.tier,
        verifiedUnits,
        batchStatus: nextStatus,
        evidencePhotoCount: parsed.evidencePhotos.length,
        receivedAt: now,
      };
    });
  }

  certifyBatch(actor: ActorContext, input: CertifyBatchInput): CertificateExport {
    this.assertActor(actor, ["warehouse_op", "admin"]);
    const parsed = parseInput(certifyBatchSchema, input);
    const now = this.clock().toISOString();
    const recordId = `ECD-${this.createId().replace(/-/g, "").slice(0, 16).toUpperCase()}`;

    return runInTransaction(this.db, () => {
      const batch = this.requireBatch(actor, parsed.batchId);
      const receiving = this.receivingForBatch(batch.id);
      if (!receiving) {
        throw new DomainError("BUSINESS_GATE_FAILED", "A receiving record is required before certification.");
      }
      assertCertificationGates({
        status: batch.status,
        riskTier: batch.riskTier,
        complianceAttested: bool(batch.complianceAttested),
        uploaderUserId: batch.createdByUserId,
        approverUserId: actor.userId,
        varianceTier: receiving.varianceTier,
        evidencePhotoCount: receiving.evidencePhotoCount,
        sampleScanCount: receiving.sampleScanCount,
        reviewReason: parsed.reviewReason,
      });
      assertBatchTransition(batch.status, "CERTIFIED");
      const estimate = calculateAvoidedEmissions(
        this.carbonInput(batch, receiving.verifiedUnits),
        true,
      );
      const snapshot = toJsonValue({
        ...estimate,
        claimedUnits: batch.quantity,
        verifiedUnits: receiving.verifiedUnits,
        receiving: {
          netWeightKg: receiving.netWeightKg,
          expectedWeightKg: receiving.expectedWeightKg,
          varianceRatio: receiving.varianceRatio,
          varianceTier: receiving.varianceTier,
          sampleScanCount: receiving.sampleScanCount,
          evidencePhotoCount: receiving.evidencePhotoCount,
        },
      });
      if (receiving.varianceTier === "REVIEW") {
        this.db.prepare<[string | null, string]>("UPDATE receivings SET review_reason = ? WHERE id = ?").run(
          parsed.reviewReason ?? null,
          receiving.id,
        );
      }
      this.db.prepare<[string, string]>(
        "UPDATE batches SET status = 'CERTIFIED', updated_at = ? WHERE id = ?",
      ).run(now, batch.id);
      const event = appendAuditEvent(this.db, {
        eventType: "BATCH_CERTIFIED",
        entityType: "certificate",
        entityId: recordId,
        actor,
        organizationId: batch.organizationId,
        occurredAt: now,
        payload: {
          batchId: batch.id,
          recordId,
          verifiedUnits: receiving.verifiedUnits,
          methodologyVersion: estimate.methodologyVersion,
          lowKgCO2e: estimate.scenarios.low.estimatedAvoidedEmissionsKgCO2e,
          baseKgCO2e: estimate.scenarios.base.estimatedAvoidedEmissionsKgCO2e,
          highKgCO2e: estimate.scenarios.high.estimatedAvoidedEmissionsKgCO2e,
        },
      });
      this.db.prepare<[
        string,
        string,
        string,
        string,
        string,
        number,
        number,
        number,
        string,
      ]>(
        `INSERT INTO certificates
          (record_id, batch_id, issue_date, status, methodology_version, snapshot_json,
           low_kg_co2e, base_kg_co2e, high_kg_co2e, audit_hash)
         VALUES (?, ?, ?, 'CERTIFIED', ?, ?, ?, ?, ?, ?)`,
      ).run(
        recordId,
        batch.id,
        now,
        estimate.methodologyVersion,
        canonicalJson(snapshot),
        estimate.scenarios.low.estimatedAvoidedEmissionsKgCO2e,
        estimate.scenarios.base.estimatedAvoidedEmissionsKgCO2e,
        estimate.scenarios.high.estimatedAvoidedEmissionsKgCO2e,
        event.hash,
      );
      return this.certificateExportByRecordId(recordId);
    });
  }

  createCampusAllocation(
    actor: ActorContext,
    input: CreateCampusAllocationInput,
  ): AllocationMutationResult {
    this.assertActor(actor, ["warehouse_op", "admin"]);
    const parsed = parseInput(createCampusAllocationSchema, input);
    const now = this.clock().toISOString();

    return runInTransaction(this.db, () => {
      const batch = this.requireBatch(actor, parsed.batchId);
      const certificate = this.db.prepare<[string], { status: string }>(
        "SELECT status FROM certificates WHERE batch_id = ?",
      ).get(batch.id);
      if (certificate?.status !== "CERTIFIED") {
        throw new DomainError(
          "BUSINESS_GATE_FAILED",
          "A certified impact record is required before campus allocation.",
        );
      }
      const campus = this.db.prepare<[string], { kind: string }>(
        "SELECT kind FROM organizations WHERE id = ?",
      ).get(parsed.campusOrganizationId);
      if (!campus || campus.kind !== "campus") {
        throw new DomainError("NOT_FOUND", "Campus organization was not found.");
      }

      const requestHash = sha256Hex(canonicalJson({
        campusOrganizationId: parsed.campusOrganizationId,
        quantity: parsed.quantity,
      }));
      const replay = this.idempotencyReplay<AllocationMutationResult>(
        "create_allocation",
        "batch",
        batch.id,
        parsed.idempotencyKey,
        requestHash,
      );
      if (replay) return replay;
      if (batch.status !== "CERTIFIED" && batch.status !== "DISTRIBUTING") {
        throw new DomainError(
          "ILLEGAL_TRANSITION",
          "Only certified or distributing batches can be allocated.",
        );
      }

      const before = this.distributionForBatch(batch.id);
      if (parsed.quantity > before.remainingCapacity) {
        throw new DomainError(
          "BUSINESS_GATE_FAILED",
          "Allocation quantity exceeds the batch's remaining verified capacity.",
          {
            requestedQuantity: parsed.quantity,
            verifiedUnits: before.verifiedUnits,
            existingItemCount: before.existingItemCount,
            pendingAllocationQuantity: before.pendingAllocationQuantity,
            remainingCapacity: before.remainingCapacity,
          },
        );
      }

      const allocationId = this.createId();
      this.db.prepare<[string, string, string, string, number, string, string]>(
        `INSERT INTO campus_allocations
          (id, batch_id, campus_org_id, allocated_by_user_id, quantity, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 'ALLOCATED', ?, ?)`,
      ).run(
        allocationId,
        batch.id,
        parsed.campusOrganizationId,
        actor.userId,
        parsed.quantity,
        now,
        now,
      );

      let batchStatus = batch.status;
      if (batch.status === "CERTIFIED") {
        assertBatchTransition(batch.status, "DISTRIBUTING");
        this.db.prepare<[string, string]>(
          "UPDATE batches SET status = 'DISTRIBUTING', updated_at = ? WHERE id = ?",
        ).run(now, batch.id);
        batchStatus = "DISTRIBUTING";
      }

      const allocation = this.allocationRow(allocationId);
      if (!allocation) throw new Error("Allocation insert did not produce a readable row.");
      const response: AllocationMutationResult = {
        allocation: mapAllocation(allocation),
        distribution: this.distributionForBatch(batch.id),
        batchStatus,
      };
      this.storeIdempotency(
        "create_allocation",
        "batch",
        batch.id,
        parsed.idempotencyKey,
        requestHash,
        response,
        now,
      );
      appendAuditEvent(this.db, {
        eventType: "CAMPUS_ALLOCATION_CREATED",
        entityType: "campus_allocation",
        entityId: allocationId,
        actor,
        organizationId: batch.organizationId,
        occurredAt: now,
        payload: {
          batchId: batch.id,
          campusOrganizationId: parsed.campusOrganizationId,
          quantity: parsed.quantity,
          previousBatchStatus: batch.status,
          batchStatus,
          remainingCapacity: response.distribution.remainingCapacity,
        },
      });
      return response;
    });
  }

  receiveCampusAllocation(
    actor: ActorContext,
    input: ReceiveCampusAllocationInput,
  ): AllocationReceiptResult {
    this.assertActor(actor, ["campus_admin"]);
    const parsed = parseInput(receiveCampusAllocationSchema, input);
    const now = this.clock().toISOString();

    return runInTransaction(this.db, () => {
      const allocation = this.allocationRow(parsed.allocationId);
      if (!allocation || allocation.campusOrganizationId !== actor.organizationId) {
        throw new DomainError("NOT_FOUND", "Campus allocation was not found.");
      }
      const labelPrefix = parsed.labelPrefix ?? defaultLabelPrefix(allocation.category);
      const requestHash = sha256Hex(canonicalJson({
        labelPrefix,
        compatibility: parsed.compatibility,
        needTags: parsed.needTags,
      }));
      const replay = this.idempotencyReplay<AllocationReceiptResult>(
        "receive_allocation",
        "campus_allocation",
        allocation.id,
        parsed.idempotencyKey,
        requestHash,
      );
      if (replay) return replay;
      if (allocation.status !== "ALLOCATED") {
        throw new DomainError("ILLEGAL_TRANSITION", "Only an allocated shipment can be received by campus.");
      }
      if (allocation.itemCount !== 0) {
        throw new DomainError(
          "BUSINESS_GATE_FAILED",
          "Allocation already has materialized items and cannot be received again.",
        );
      }

      const batch = this.requireBatch(actor, allocation.batchId);
      if (batch.status !== "DISTRIBUTING") {
        throw new DomainError(
          "ILLEGAL_TRANSITION",
          "Campus receipt requires a distributing batch.",
        );
      }

      const itemIds: string[] = [];
      const width = Math.max(2, String(allocation.quantity).length);
      for (let index = 1; index <= allocation.quantity; index += 1) {
        const itemId = this.createId();
        itemIds.push(itemId);
        this.db.prepare<[
          string,
          string,
          string,
          string,
          string,
          string,
          string,
          string,
          string,
        ]>(
          `INSERT INTO items
            (id, batch_id, campus_org_id, label, category, compatibility_json, need_tags_json,
             status, circulation_count, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'AVAILABLE', 0, ?, ?)`,
        ).run(
          itemId,
          batch.id,
          allocation.campusOrganizationId,
          `${labelPrefix} ${String(index).padStart(width, "0")}`,
          batch.category,
          canonicalJson(parsed.compatibility),
          canonicalJson(parsed.needTags),
          now,
          now,
        );
        this.db.prepare<[string, string, number]>(
          "INSERT INTO allocation_items (allocation_id, item_id, ordinal) VALUES (?, ?, ?)",
        ).run(allocation.id, itemId, index);
      }

      this.db.prepare<[string, string, string, string]>(
        `UPDATE campus_allocations
            SET status = 'RECEIVED', received_by_user_id = ?, received_at = ?, updated_at = ?
          WHERE id = ? AND status = 'ALLOCATED'`,
      ).run(actor.userId, now, now, allocation.id);

      const distribution = this.distributionForBatch(batch.id);
      let batchStatus: BatchStatus = "DISTRIBUTING";
      if (
        distribution.existingItemCount === distribution.verifiedUnits &&
        distribution.pendingAllocationQuantity === 0
      ) {
        assertBatchTransition(batch.status, "CLOSED");
        this.db.prepare<[string, string]>(
          "UPDATE batches SET status = 'CLOSED', updated_at = ? WHERE id = ?",
        ).run(now, batch.id);
        batchStatus = "CLOSED";
      }

      const received = this.allocationRow(allocation.id);
      if (!received) throw new Error("Received allocation did not produce a readable row.");
      const response: AllocationReceiptResult = {
        allocation: mapAllocation(received),
        distribution,
        batchStatus,
        itemsCreated: itemIds.length,
        itemIds,
      };
      this.storeIdempotency(
        "receive_allocation",
        "campus_allocation",
        allocation.id,
        parsed.idempotencyKey,
        requestHash,
        response,
        now,
      );
      appendAuditEvent(this.db, {
        eventType: "CAMPUS_ALLOCATION_RECEIVED",
        entityType: "campus_allocation",
        entityId: allocation.id,
        actor,
        organizationId: batch.organizationId,
        occurredAt: now,
        payload: {
          batchId: batch.id,
          campusOrganizationId: allocation.campusOrganizationId,
          quantity: allocation.quantity,
          itemsCreated: itemIds.length,
          category: batch.category,
          batchStatus,
        },
      });
      return response;
    });
  }

  getCertificateExport(actor: ActorContext, recordId: string): CertificateExport {
    const certificate = this.certificateRow(recordId);
    if (!certificate || certificate.status !== "CERTIFIED") {
      throw new DomainError("NOT_FOUND", "Certified impact record was not found.");
    }
    this.requireBatch(actor, certificate.batchId);
    return this.certificateExportByRecordId(recordId);
  }

  getPublicCertificate(recordId: string): PublicCertificateProjection {
    const row = this.db.prepare<[string], PublicCertificateProjection>(
      `SELECT record_id AS recordId, issue_date AS issueDate, status,
              methodology_version AS methodologyVersion, audit_hash AS auditHash
         FROM certificates WHERE record_id = ? AND status = 'CERTIFIED'`,
    ).get(recordId);
    if (!row) throw new DomainError("NOT_FOUND", "Public verification record was not found.");
    // Deliberately return only the five fields approved for the public projection.
    return {
      recordId: row.recordId,
      issueDate: row.issueDate,
      status: row.status,
      methodologyVersion: row.methodologyVersion,
      auditHash: row.auditHash,
    };
  }

  getDashboardSnapshot(actor: ActorContext): DashboardSnapshot {
    this.assertActor(actor, ["corp_user", "warehouse_op", "campus_admin", "admin"]);
    const generatedAt = this.clock().toISOString();
    const batches = this.batchesForActor(actor);
    const items = this.itemsForActor(actor);
    const outcomes = this.outcomesForActor(actor);
    const claimCount = outcomes.length;
    const aggregate: OutcomeAggregate = {
      kept: outcomes.filter((row) => row.decision === "KEEP").length,
      returned: outcomes.filter((row) => row.claimStatus === "RETURNED").length,
      recirculated: outcomes.filter((row) => row.circulationCount > 0).length,
      diverted: outcomes.filter((row) => row.itemStatus === "DIVERTED").length,
      unknown: outcomes.filter((row) => row.followUpOutcome === null || row.followUpOutcome === "NO_ANSWER").length,
    };
    return {
      generatedAt,
      scope: actor.role === "admin" ? "platform" : actor.role === "warehouse_op" ? "warehouse" : "organization",
      counts: {
        batches: batches.length,
        pendingWarehouse: batches.filter((batch) =>
          ["PENDING_VERIFICATION", "IN_TRANSIT", "DELIVERED", "RECEIVED", "UNDER_REVIEW"].includes(batch.status),
        ).length,
        certified: batches.filter((batch) => ["CERTIFIED", "DISTRIBUTING", "CLOSED"].includes(batch.status)).length,
        availableItems: items.filter((item) => item.status === "AVAILABLE").length,
        claims: claimCount,
      },
      outcomes: aggregate,
      recentBatches: batches.slice(0, 10).map(mapBatch),
    };
  }

  startKioskSession(input: StartKioskSessionInput): KioskSessionCredentials {
    const parsed = parseInput(startKioskSessionSchema, input);
    const organization = this.db.prepare<[string], { kind: string }>(
      "SELECT kind FROM organizations WHERE id = ?",
    ).get(parsed.campusOrganizationId);
    if (!organization || organization.kind !== "campus") {
      throw new DomainError("NOT_FOUND", "Campus kiosk was not found.");
    }
    const now = this.clock();
    const expiresAt = new Date(now.getTime() + this.kioskTtlSeconds * 1_000).toISOString();
    const token = randomBytes(32).toString("base64url");
    const sessionId = this.createId();
    const weeklyKeyHash = sha256Hex(parsed.weeklyClaimToken ?? token);
    const weekKey = isoWeekKey(now);
    const weeklyClaimsUsed = this.db.prepare<[string, string], { count: number }>(
      `SELECT COUNT(*) AS count FROM claims c
        JOIN kiosk_sessions ks ON ks.id = c.kiosk_session_id
       WHERE ks.weekly_key_hash = ? AND c.week_key = ?`,
    ).get(weeklyKeyHash, weekKey)?.count ?? 0;

    runInTransaction(this.db, () => {
      this.db.prepare<[string, string, string, string, string, string, string, string, string, string]>(
        `INSERT INTO kiosk_sessions
          (id, campus_org_id, token_hash, weekly_key_hash, mode, requested_categories_json,
           compatibility_json, need_tags_json, created_at, expires_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        sessionId,
        parsed.campusOrganizationId,
        hashSessionToken(token),
        weeklyKeyHash,
        parsed.mode,
        canonicalJson(parsed.requestedCategories),
        canonicalJson(parsed.compatibility),
        canonicalJson(parsed.needTags),
        now.toISOString(),
        expiresAt,
      );
      appendAuditEvent(this.db, {
        eventType: "ANONYMOUS_KIOSK_SESSION_STARTED",
        entityType: "kiosk_session",
        entityId: sessionId,
        organizationId: parsed.campusOrganizationId,
        occurredAt: now.toISOString(),
        payload: {
          mode: parsed.mode,
          requestedCategories: parsed.requestedCategories,
          expiresAt,
        },
      });
    });

    return {
      sessionId,
      token,
      expiresAt,
      mode: parsed.mode,
      weekKey,
      weeklyClaimCap: this.weeklyClaimCap,
      weeklyClaimsUsed,
      weeklyClaimsRemaining: Math.max(0, this.weeklyClaimCap - weeklyClaimsUsed),
    };
  }

  matchKioskItems(input: { token: string }): MatchedItem[] {
    const parsed = parseInput(matchKioskSchema, input);
    const session = this.requireKioskSession(parsed.token);
    const items = this.db.prepare<[string], ItemRow>(
      `SELECT id, batch_id AS batchId, campus_org_id AS campusOrganizationId, label, category,
              compatibility_json AS compatibilityJson, need_tags_json AS needTagsJson,
              status, circulation_count AS circulationCount
         FROM items WHERE campus_org_id = ? AND status = 'AVAILABLE' ORDER BY id`,
    ).all(session.campusOrganizationId);
    const matches = items.filter((item) => this.itemMatchesSession(item, session));
    const limited = session.mode === "MYSTERY_SHORTLIST" ? matches.slice(0, 3) : matches.slice(0, 20);

    return limited.map((item, index) => {
      const compatibility = parseJson<Record<string, JsonPrimitive>>(item.compatibilityJson, {});
      const needTags = parseJson<string[]>(item.needTagsJson, []);
      if (session.mode === "MYSTERY_SHORTLIST") {
        return {
          itemId: item.id,
          displayLabel: `Mystery compatible option ${index + 1}`,
          category: null,
          mystery: true,
          compatibility: {},
          needTags: [],
        };
      }
      return {
        itemId: item.id,
        displayLabel: item.label,
        category: item.category,
        mystery: false,
        compatibility,
        needTags,
      };
    });
  }

  checkoutKioskItem(input: CheckoutInput): ClaimResult {
    const parsed = parseInput(checkoutSchema, input);
    const now = this.clock();
    return runInTransaction(this.db, () => {
      const session = this.requireKioskSession(parsed.token);
      const requestHash = sha256Hex(canonicalJson({ itemId: parsed.itemId }));
      const replay = this.idempotencyReplay<ClaimResult>(
        "checkout",
        "kiosk_session",
        session.id,
        parsed.idempotencyKey,
        requestHash,
      );
      if (replay) return replay;

      const item = this.itemRow(parsed.itemId);
      if (!item || item.campusOrganizationId !== session.campusOrganizationId || item.status !== "AVAILABLE") {
        throw new DomainError("NOT_FOUND", "A compatible in-stock item was not found.");
      }
      if (!this.itemMatchesSession(item, session)) {
        throw new DomainError("BUSINESS_GATE_FAILED", "The selected item does not match this kiosk session.");
      }
      const weekKey = isoWeekKey(now);
      const weeklyClaims = this.db.prepare<[string, string], { count: number }>(
        `SELECT COUNT(*) AS count FROM claims c
          JOIN kiosk_sessions ks ON ks.id = c.kiosk_session_id
         WHERE ks.weekly_key_hash = ? AND c.week_key = ?`,
      ).get(session.weeklyKeyHash, weekKey)?.count ?? 0;
      if (weeklyClaims >= this.weeklyClaimCap) {
        throw new DomainError(
          "BUSINESS_GATE_FAILED",
          `The anonymous weekly claim cap of ${this.weeklyClaimCap} has been reached.`,
          { weekKey, weeklyClaimCap: this.weeklyClaimCap, weeklyClaimsUsed: weeklyClaims, weeklyClaimsRemaining: 0 },
        );
      }

      const claimId = this.createId();
      const nowIso = now.toISOString();
      const update = this.db.prepare<[string, string]>(
        "UPDATE items SET status = 'CLAIMED', updated_at = ? WHERE id = ? AND status = 'AVAILABLE'",
      ).run(nowIso, item.id);
      if (update.changes !== 1) throw new DomainError("IDEMPOTENCY_CONFLICT", "Item is no longer available.");
      this.db.prepare<[string, string, string, string, string, string]>(
        `INSERT INTO claims
          (id, kiosk_session_id, item_id, claim_method, status, week_key, created_at, updated_at)
         VALUES (?, ?, ?, 'SPONSORED_FREE', 'CHECKED_OUT', ?, ?, ?)`,
      ).run(claimId, session.id, item.id, weekKey, nowIso, nowIso);
      const response: ClaimResult = {
        claimId,
        itemId: item.id,
        status: "CHECKED_OUT",
        claimMethod: "SPONSORED_FREE",
        createdAt: nowIso,
      };
      this.storeIdempotency("checkout", "kiosk_session", session.id, parsed.idempotencyKey, requestHash, response, nowIso);
      appendAuditEvent(this.db, {
        eventType: "SPONSORED_ITEM_CHECKED_OUT",
        entityType: "claim",
        entityId: claimId,
        organizationId: session.campusOrganizationId,
        occurredAt: nowIso,
        payload: { itemId: item.id, claimMethod: "SPONSORED_FREE", paymentSimulated: this.demoMode },
      });
      return response;
    });
  }

  revealClaim(input: RevealClaimInput): RevealedClaim {
    const parsed = parseInput(revealClaimSchema, input);
    const now = this.clock().toISOString();
    return runInTransaction(this.db, () => {
      const session = this.requireKioskSession(parsed.token);
      const requestHash = sha256Hex(canonicalJson({ claimId: parsed.claimId }));
      const replay = this.idempotencyReplay<RevealedClaim>(
        "reveal",
        "kiosk_session",
        session.id,
        parsed.idempotencyKey,
        requestHash,
      );
      if (replay) return replay;
      const claim = this.claimItemRow(parsed.claimId, session.id);
      if (!claim) throw new DomainError("NOT_FOUND", "Claim was not found.");
      if (claim.claimStatus !== "CHECKED_OUT") {
        throw new DomainError("ILLEGAL_TRANSITION", "Only a checked-out claim can be revealed.");
      }
      this.db.prepare<[string, string, string]>(
        "UPDATE claims SET status = 'REVEALED', revealed_at = ?, updated_at = ? WHERE id = ?",
      ).run(now, now, claim.claimId);
      const response: RevealedClaim = {
        claimId: claim.claimId,
        itemId: claim.itemId,
        status: "REVEALED",
        claimMethod: claim.claimMethod,
        createdAt: claim.claimCreatedAt,
        category: claim.category,
        itemLabel: claim.label,
        compatibility: parseJson<Record<string, JsonPrimitive>>(claim.compatibilityJson, {}),
      };
      this.storeIdempotency("reveal", "kiosk_session", session.id, parsed.idempotencyKey, requestHash, response, now);
      appendAuditEvent(this.db, {
        eventType: "CLAIM_REVEALED",
        entityType: "claim",
        entityId: claim.claimId,
        organizationId: session.campusOrganizationId,
        occurredAt: now,
        payload: { itemId: claim.itemId },
      });
      return response;
    });
  }

  recordRevealDecision(input: RecordDecisionInput): DecisionResult {
    const parsed = parseInput(recordDecisionSchema, input);
    const now = this.clock().toISOString();
    return runInTransaction(this.db, () => {
      const session = this.requireKioskSession(parsed.token);
      const requestHash = sha256Hex(canonicalJson({ claimId: parsed.claimId, decision: parsed.decision }));
      const replay = this.idempotencyReplay<DecisionResult>(
        "decision",
        "kiosk_session",
        session.id,
        parsed.idempotencyKey,
        requestHash,
      );
      if (replay) return replay;
      const claim = this.claimItemRow(parsed.claimId, session.id);
      if (!claim) throw new DomainError("NOT_FOUND", "Claim was not found.");
      if (claim.claimStatus !== "REVEALED") {
        throw new DomainError("ILLEGAL_TRANSITION", "A decision can only follow reveal.");
      }
      if (this.db.prepare<[string]>("SELECT 1 FROM claim_decisions WHERE claim_id = ?").get(claim.claimId)) {
        throw new DomainError("DUPLICATE", "This reveal decision was already recorded.");
      }

      const claimStatus: ClaimStatus = parsed.decision === "KEEP" ? "KEPT" : "RETURN_PENDING";
      const itemStatus: ItemStatus = parsed.decision === "KEEP" ? "DISTRIBUTED" : "RETURN_PENDING";
      this.db.prepare<[string, string, string, string]>(
        "INSERT INTO claim_decisions (id, claim_id, decision, decided_at) VALUES (?, ?, ?, ?)",
      ).run(this.createId(), claim.claimId, parsed.decision, now);
      this.db.prepare<[string, string, string]>(
        "UPDATE claims SET status = ?, updated_at = ? WHERE id = ?",
      ).run(claimStatus, now, claim.claimId);
      this.db.prepare<[string, string, string]>(
        "UPDATE items SET status = ?, updated_at = ? WHERE id = ?",
      ).run(itemStatus, now, claim.itemId);
      const response: DecisionResult = {
        claimId: claim.claimId,
        itemId: claim.itemId,
        decision: parsed.decision,
        claimStatus,
        itemStatus,
        recordedAt: now,
      };
      this.storeIdempotency("decision", "kiosk_session", session.id, parsed.idempotencyKey, requestHash, response, now);
      appendAuditEvent(this.db, {
        eventType: "REVEAL_DECISION_RECORDED",
        entityType: "claim",
        entityId: claim.claimId,
        organizationId: session.campusOrganizationId,
        occurredAt: now,
        payload: { itemId: claim.itemId, decision: parsed.decision, claimStatus, itemStatus },
      });
      return response;
    });
  }

  recordOutcomeSurvey(input: RecordSurveyInput): SurveyResult {
    const parsed = parseInput(recordSurveySchema, input);
    const now = this.clock().toISOString();
    return runInTransaction(this.db, () => {
      const session = this.requireKioskSession(parsed.token);
      const requestHash = sha256Hex(
        canonicalJson({
          claimId: parsed.claimId,
          displacementAnswer: parsed.displacementAnswer,
          followUpOutcome: parsed.followUpOutcome,
        }),
      );
      const replay = this.idempotencyReplay<SurveyResult>(
        "outcome_survey",
        "kiosk_session",
        session.id,
        parsed.idempotencyKey,
        requestHash,
      );
      if (replay) return replay;
      const claim = this.claimItemRow(parsed.claimId, session.id);
      if (!claim) throw new DomainError("NOT_FOUND", "Claim was not found.");
      if (claim.claimStatus === "CHECKED_OUT") {
        throw new DomainError("ILLEGAL_TRANSITION", "Outcome surveys require a revealed claim.");
      }
      if (this.db.prepare<[string]>("SELECT 1 FROM outcomes WHERE claim_id = ?").get(claim.claimId)) {
        throw new DomainError("DUPLICATE", "An outcome was already recorded for this claim.");
      }
      this.db.prepare<[string, string, string, string, string]>(
        `INSERT INTO outcomes (id, claim_id, displacement_answer, follow_up_outcome, recorded_at)
         VALUES (?, ?, ?, ?, ?)`,
      ).run(this.createId(), claim.claimId, parsed.displacementAnswer, parsed.followUpOutcome, now);
      const response: SurveyResult = {
        claimId: claim.claimId,
        displacementAnswer: parsed.displacementAnswer,
        followUpOutcome: parsed.followUpOutcome,
        recordedAt: now,
      };
      this.storeIdempotency(
        "outcome_survey",
        "kiosk_session",
        session.id,
        parsed.idempotencyKey,
        requestHash,
        response,
        now,
      );
      appendAuditEvent(this.db, {
        eventType: "OUTCOME_RECORDED",
        entityType: "claim",
        entityId: claim.claimId,
        organizationId: session.campusOrganizationId,
        occurredAt: now,
        payload: {
          displacementAnswer: parsed.displacementAnswer,
          followUpOutcome: parsed.followUpOutcome,
          noAnswerCountedAsRetained: false,
        },
      });
      return response;
    });
  }

  dropBackItem(input: DropBackInput): DropBackResult {
    const parsed = parseInput(dropBackSchema, input);
    const now = this.clock().toISOString();
    return runInTransaction(this.db, () => {
      const session = this.requireKioskSession(parsed.token);
      const requestHash = sha256Hex(canonicalJson({ claimId: parsed.claimId }));
      const replay = this.idempotencyReplay<DropBackResult>(
        "dropback",
        "kiosk_session",
        session.id,
        parsed.idempotencyKey,
        requestHash,
      );
      if (replay) return replay;
      const claim = this.claimItemRow(parsed.claimId, session.id);
      if (!claim) throw new DomainError("NOT_FOUND", "Claim was not found.");
      const decision = this.db.prepare<[string], { decision: RevealDecision }>(
        "SELECT decision FROM claim_decisions WHERE claim_id = ?",
      ).get(claim.claimId)?.decision;
      if (claim.claimStatus !== "RETURN_PENDING" || (decision !== "RETURN" && decision !== "SWAP")) {
        throw new DomainError("ILLEGAL_TRANSITION", "Only returned or swapped items can be dropped back.");
      }
      this.db.prepare<[string, string]>(
        "UPDATE claims SET status = 'RETURNED', updated_at = ? WHERE id = ?",
      ).run(now, claim.claimId);
      this.db.prepare<[string, string]>(
        `UPDATE items SET status = 'AVAILABLE', circulation_count = circulation_count + 1,
                          updated_at = ? WHERE id = ?`,
      ).run(now, claim.itemId);
      const circulationCount = this.db.prepare<[string], { count: number }>(
        "SELECT circulation_count AS count FROM items WHERE id = ?",
      ).get(claim.itemId)?.count ?? 0;
      const response: DropBackResult = {
        claimId: claim.claimId,
        itemId: claim.itemId,
        claimStatus: "RETURNED",
        itemStatus: "AVAILABLE",
        circulationCount,
        returnedAt: now,
      };
      this.storeIdempotency("dropback", "kiosk_session", session.id, parsed.idempotencyKey, requestHash, response, now);
      appendAuditEvent(this.db, {
        eventType: "ITEM_DROPPED_BACK",
        entityType: "item",
        entityId: claim.itemId,
        organizationId: session.campusOrganizationId,
        occurredAt: now,
        payload: {
          claimId: claim.claimId,
          sameItemIdentity: true,
          status: "AVAILABLE",
          circulationCount,
        },
      });
      return response;
    });
  }

  verifyAudit(actor: ActorContext): AuditVerificationResult {
    this.assertActor(actor, ["warehouse_op", "admin"]);
    return verifyAuditChain(this.db);
  }

  async resetDemo(actor: ActorContext): Promise<DemoResetResult> {
    this.assertActor(actor, ["admin"]);
    if (!this.demoMode) {
      throw new DomainError("DEMO_MODE_DISABLED", "Demo reset is unavailable outside demo mode.");
    }
    const { seedDatabase } = await import("./seed");
    return seedDatabase(this.db, { clear: true });
  }

  private assertActor(actor: ActorContext, allowedRoles: readonly UserRole[]): void {
    const stored = this.db.prepare<[string], { organizationId: string; role: UserRole }>(
      "SELECT org_id AS organizationId, role FROM users WHERE id = ?",
    ).get(actor.userId);
    if (
      !stored ||
      stored.organizationId !== actor.organizationId ||
      stored.role !== actor.role
    ) {
      throw new DomainError("FORBIDDEN", "Actor identity, role, or organization is invalid.");
    }
    assertRole(actor, allowedRoles);
  }

  private requireBatch(actor: ActorContext, batchId: string): BatchRow {
    this.assertActor(actor, ["corp_user", "warehouse_op", "campus_admin", "admin"]);
    const row = this.db.prepare<[string], BatchRow>(`${batchSelect()} WHERE b.id = ?`).get(batchId);
    if (!row) throw new DomainError("NOT_FOUND", "Batch was not found.");
    if (actor.role === "corp_user" && row.organizationId !== actor.organizationId) {
      throw new DomainError("NOT_FOUND", "Batch was not found.");
    }
    if (actor.role === "campus_admin") {
      const visible = this.db.prepare<[string, string, string, string]>(
        `SELECT 1 AS visible
          WHERE EXISTS (
            SELECT 1 FROM items WHERE batch_id = ? AND campus_org_id = ?
          ) OR EXISTS (
            SELECT 1 FROM campus_allocations WHERE batch_id = ? AND campus_org_id = ?
          )`,
      ).get(batchId, actor.organizationId, batchId, actor.organizationId);
      if (!visible) throw new DomainError("NOT_FOUND", "Batch was not found.");
    }
    return row;
  }

  private activeHsPolicy(hsCode: string): HsPolicyRow | undefined {
    return this.db.prepare<[string], HsPolicyRow>(
      `SELECT id, hs_code AS hsCode, policy_version AS policyVersion, category,
              baseline_risk AS baselineRisk, rationale, active
         FROM hs_policy_catalog WHERE hs_code = ? AND active = 1`,
    ).get(hsCode);
  }

  private allocationRow(allocationId: string): AllocationRow | undefined {
    return this.db.prepare<[string], AllocationRow>(
      `${allocationSelect()} WHERE a.id = ?`,
    ).get(allocationId);
  }

  private distributionForBatch(batchId: string): AllocationMutationResult["distribution"] {
    const row = this.db.prepare<[string, string, string, string, string], DistributionRow>(
      `SELECT COALESCE(r.verified_units, 0) AS verifiedUnits,
              (SELECT COUNT(*) FROM items i WHERE i.batch_id = ?) AS existingItemCount,
              COALESCE((SELECT SUM(a.quantity) FROM campus_allocations a
                         WHERE a.batch_id = ? AND a.status = 'ALLOCATED'), 0)
                AS pendingAllocationQuantity,
              COALESCE((SELECT SUM(a.quantity) FROM campus_allocations a
                         WHERE a.batch_id = ? AND a.status = 'RECEIVED'), 0)
                AS receivedAllocationQuantity,
              COALESCE((SELECT SUM(a.quantity) FROM campus_allocations a
                         WHERE a.batch_id = ?), 0) AS totalAllocationQuantity
         FROM batches b LEFT JOIN receivings r ON r.batch_id = b.id
        WHERE b.id = ?`,
    ).get(batchId, batchId, batchId, batchId, batchId) as DistributionRow | undefined;
    if (!row) throw new DomainError("NOT_FOUND", "Batch was not found.");
    const remainingCapacity = calculateRemainingAllocationCapacity(
      row.verifiedUnits,
      row.existingItemCount,
      row.pendingAllocationQuantity,
    );
    return {
      ...row,
      remainingCapacity,
      fullyDistributed:
        row.verifiedUnits > 0 &&
        row.existingItemCount === row.verifiedUnits &&
        row.pendingAllocationQuantity === 0,
    };
  }

  private factorForCategory(category: string): FactorRow {
    const row = this.db.prepare<[string, string], FactorRow>(
      `SELECT ef.id AS factorId, ef.category, ef.version AS factorVersion,
              m.source_name AS methodologySource, m.version AS methodologyVersion,
              m.formula_version AS formulaVersion,
              ef.low_factor AS lowFactor, ef.base_factor AS baseFactor, ef.high_factor AS highFactor,
              ef.low_displacement AS lowDisplacement, ef.base_displacement AS baseDisplacement,
              ef.high_displacement AS highDisplacement, ef.low_retention AS lowRetention,
              ef.base_retention AS baseRetention, ef.high_retention AS highRetention,
              ef.handling_kg_co2e_per_item AS handling,
              ef.displacement_sample_size AS displacementSampleSize,
              ef.retention_sample_size AS retentionSampleSize
         FROM emission_factors ef JOIN methodologies m ON m.id = ef.methodology_id
        WHERE m.active = 1 AND lower(ef.category) IN (lower(?), 'other')
        ORDER BY CASE WHEN lower(ef.category) = lower(?) THEN 0 ELSE 1 END LIMIT 1`,
    ).get(category, category);
    if (!row) {
      throw new DomainError("BUSINESS_GATE_FAILED", "No active methodology factor is configured.");
    }
    return row;
  }

  private carbonInput(batch: BatchRow, eligibleUnits: number): CarbonCalculationInput {
    const factor = batch.factorId
      ? this.db.prepare<[string], FactorRow>(
          `SELECT ef.id AS factorId, ef.category, ef.version AS factorVersion,
                  m.source_name AS methodologySource, m.version AS methodologyVersion,
                  m.formula_version AS formulaVersion,
                  ef.low_factor AS lowFactor, ef.base_factor AS baseFactor, ef.high_factor AS highFactor,
                  ef.low_displacement AS lowDisplacement, ef.base_displacement AS baseDisplacement,
                  ef.high_displacement AS highDisplacement, ef.low_retention AS lowRetention,
                  ef.base_retention AS baseRetention, ef.high_retention AS highRetention,
                  ef.handling_kg_co2e_per_item AS handling,
                  ef.displacement_sample_size AS displacementSampleSize,
                  ef.retention_sample_size AS retentionSampleSize
             FROM emission_factors ef JOIN methodologies m ON m.id = ef.methodology_id
            WHERE ef.id = ? AND m.active = 1`,
        ).get(batch.factorId)
      : undefined;
    const selected = factor ?? this.factorForCategory(
      this.activeHsPolicy(batch.hsCode)?.category ?? "other",
    );
    return {
      unitWeightKg: batch.unitWeightKg,
      eligibleUnits,
      methodologySource: selected.methodologySource,
      methodologyVersion: selected.methodologyVersion,
      factorVersion: selected.factorVersion,
      formulaVersion: selected.formulaVersion,
      scenarios: {
        low: {
          factorKgCO2ePerKg: selected.lowFactor,
          displacementRate: selected.lowDisplacement,
          retentionRate: selected.lowRetention,
          handlingKgCO2ePerItem: selected.handling,
        },
        base: {
          factorKgCO2ePerKg: selected.baseFactor,
          displacementRate: selected.baseDisplacement,
          retentionRate: selected.baseRetention,
          handlingKgCO2ePerItem: selected.handling,
        },
        high: {
          factorKgCO2ePerKg: selected.highFactor,
          displacementRate: selected.highDisplacement,
          retentionRate: selected.highRetention,
          handlingKgCO2ePerItem: selected.handling,
        },
      },
      sampleSizes: {
        displacement: selected.displacementSampleSize,
        retention: selected.retentionSampleSize,
      },
    };
  }

  private receivingForBatch(batchId: string): ReceivingRow | undefined {
    return this.db.prepare<[string], ReceivingRow>(
      `SELECT r.id, r.batch_id AS batchId, r.received_by_user_id AS receivedByUserId,
              r.gross_weight_kg AS grossWeightKg, r.tare_weight_kg AS tareWeightKg,
              r.net_weight_kg AS netWeightKg, r.expected_weight_kg AS expectedWeightKg,
              r.absolute_variance_kg AS absoluteVarianceKg, r.variance_ratio AS varianceRatio,
              r.variance_tier AS varianceTier, r.sample_scan_count AS sampleScanCount,
              r.verified_units AS verifiedUnits, r.review_reason AS reviewReason,
              r.received_at AS receivedAt, COUNT(ep.id) AS evidencePhotoCount
         FROM receivings r LEFT JOIN evidence_photos ep ON ep.receiving_id = r.id
        WHERE r.batch_id = ? GROUP BY r.id`,
    ).get(batchId);
  }

  private deliverShipment(
    actor: ActorContext,
    shipmentId: string,
    source: "SIMULATED_CARRIER" | "SIGNED_CARRIER_WEBHOOK",
  ): ShipmentResult {
    const now = this.clock().toISOString();
    return runInTransaction(this.db, () => {
      const shipment = this.db.prepare<[string], ShipmentRow>(
        `SELECT id, batch_id AS batchId, tracking_reference AS trackingReference, status,
                carrier_mode AS carrierMode, created_at AS createdAt, updated_at AS updatedAt
           FROM shipments WHERE id = ?`,
      ).get(shipmentId);
      if (!shipment) throw new DomainError("NOT_FOUND", "Shipment was not found.");
      const batch = this.requireBatch(actor, shipment.batchId);
      if (shipment.status !== "IN_TRANSIT") {
        throw new DomainError("ILLEGAL_TRANSITION", "Only an in-transit shipment can be delivered.");
      }
      assertBatchTransition(batch.status, "DELIVERED");
      this.db.prepare<[string, string]>(
        "UPDATE shipments SET status = 'DELIVERED', updated_at = ? WHERE id = ?",
      ).run(now, shipment.id);
      this.db.prepare<[string, string, string, string]>(
        `INSERT INTO shipment_events (id, shipment_id, status, source, occurred_at, payload_json)
         VALUES (?, ?, 'DELIVERED', ?, ?, '{}')`,
      ).run(this.createId(), shipment.id, source, now);
      this.db.prepare<[string, string]>(
        "UPDATE batches SET status = 'DELIVERED', updated_at = ? WHERE id = ?",
      ).run(now, batch.id);
      appendAuditEvent(this.db, {
        eventType: "SHIPMENT_STATUS_CHANGED",
        entityType: "shipment",
        entityId: shipment.id,
        actor,
        organizationId: batch.organizationId,
        occurredAt: now,
        payload: {
          batchId: batch.id,
          previousStatus: shipment.status,
          status: "DELIVERED",
          source,
          simulated: source === "SIMULATED_CARRIER",
        },
      });
      return {
        id: shipment.id,
        batchId: batch.id,
        trackingReference: shipment.trackingReference,
        status: "DELIVERED",
        simulated: source === "SIMULATED_CARRIER",
        updatedAt: now,
      };
    });
  }

  private certificateRow(recordId: string): CertificateRow | undefined {
    return this.db.prepare<[string], CertificateRow>(
      `SELECT record_id AS recordId, batch_id AS batchId, issue_date AS issueDate, status,
              methodology_version AS methodologyVersion, snapshot_json AS snapshotJson,
              low_kg_co2e AS lowKgCO2e, base_kg_co2e AS baseKgCO2e,
              high_kg_co2e AS highKgCO2e, audit_hash AS auditHash
         FROM certificates WHERE record_id = ?`,
    ).get(recordId);
  }

  private certificateExportByRecordId(recordId: string): CertificateExport {
    const row = this.certificateRow(recordId);
    if (!row || row.status !== "CERTIFIED") {
      throw new DomainError("NOT_FOUND", "Certified impact record was not found.");
    }
    return {
      recordId: row.recordId,
      batchId: row.batchId,
      issueDate: row.issueDate,
      status: row.status,
      methodologyVersion: row.methodologyVersion,
      auditHash: row.auditHash,
      label: "Estimated avoided emissions",
      lowKgCO2e: row.lowKgCO2e,
      baseKgCO2e: row.baseKgCO2e,
      highKgCO2e: row.highKgCO2e,
      snapshot: parseJson<JsonValue>(row.snapshotJson, {}),
      disclaimer: ESTIMATE_DISCLAIMER,
    };
  }

  private batchesForActor(actor: ActorContext): BatchRow[] {
    if (actor.role === "corp_user") {
      return this.db.prepare<[string], BatchRow>(
        `${batchSelect()} WHERE b.org_id = ? ORDER BY b.updated_at DESC`,
      ).all(actor.organizationId);
    }
    if (actor.role === "campus_admin") {
      return this.db.prepare<[string, string], BatchRow>(
        `${batchSelect()} WHERE
          EXISTS (SELECT 1 FROM items i WHERE i.batch_id = b.id AND i.campus_org_id = ?)
          OR EXISTS (
            SELECT 1 FROM campus_allocations a
             WHERE a.batch_id = b.id AND a.campus_org_id = ?
          )
         ORDER BY b.updated_at DESC`,
      ).all(actor.organizationId, actor.organizationId);
    }
    return this.db.prepare<[], BatchRow>(`${batchSelect()} ORDER BY b.updated_at DESC`).all();
  }

  private itemsForActor(actor: ActorContext): ItemRow[] {
    const select = `SELECT i.id, i.batch_id AS batchId, i.campus_org_id AS campusOrganizationId,
                           i.label, i.category, i.compatibility_json AS compatibilityJson,
                           i.need_tags_json AS needTagsJson, i.status,
                           i.circulation_count AS circulationCount FROM items i`;
    if (actor.role === "campus_admin") {
      return this.db.prepare<[string], ItemRow>(`${select} WHERE i.campus_org_id = ?`).all(actor.organizationId);
    }
    if (actor.role === "corp_user") {
      return this.db.prepare<[string], ItemRow>(
        `${select} JOIN batches b ON b.id = i.batch_id WHERE b.org_id = ?`,
      ).all(actor.organizationId);
    }
    return this.db.prepare<[], ItemRow>(select).all();
  }

  private outcomesForActor(actor: ActorContext): OutcomeRow[] {
    const select = `SELECT c.status AS claimStatus, i.status AS itemStatus,
                           i.circulation_count AS circulationCount, d.decision,
                           o.follow_up_outcome AS followUpOutcome
                      FROM claims c JOIN items i ON i.id = c.item_id
                      JOIN batches b ON b.id = i.batch_id
                      LEFT JOIN claim_decisions d ON d.claim_id = c.id
                      LEFT JOIN outcomes o ON o.claim_id = c.id`;
    if (actor.role === "campus_admin") {
      return this.db.prepare<[string], OutcomeRow>(`${select} WHERE i.campus_org_id = ?`).all(actor.organizationId);
    }
    if (actor.role === "corp_user") {
      return this.db.prepare<[string], OutcomeRow>(`${select} WHERE b.org_id = ?`).all(actor.organizationId);
    }
    return this.db.prepare<[], OutcomeRow>(select).all();
  }

  private requireKioskSession(rawToken: string): KioskRow {
    const tokenHash = hashSessionToken(rawToken);
    const row = this.db.prepare<[string], KioskRow>(
      `SELECT id, campus_org_id AS campusOrganizationId, token_hash AS tokenHash,
              weekly_key_hash AS weeklyKeyHash, mode,
              requested_categories_json AS requestedCategoriesJson,
              compatibility_json AS compatibilityJson, need_tags_json AS needTagsJson,
              created_at AS createdAt, expires_at AS expiresAt
         FROM kiosk_sessions WHERE token_hash = ?`,
    ).get(tokenHash);
    if (!row || new Date(row.expiresAt).getTime() <= this.clock().getTime()) {
      throw new DomainError("SESSION_EXPIRED", "Anonymous kiosk session is invalid or expired.");
    }
    return row;
  }

  private itemRow(itemId: string): ItemRow | undefined {
    return this.db.prepare<[string], ItemRow>(
      `SELECT id, batch_id AS batchId, campus_org_id AS campusOrganizationId, label, category,
              compatibility_json AS compatibilityJson, need_tags_json AS needTagsJson,
              status, circulation_count AS circulationCount FROM items WHERE id = ?`,
    ).get(itemId);
  }

  private itemMatchesSession(item: ItemRow, session: KioskRow): boolean {
    const requested = parseJson<string[]>(session.requestedCategoriesJson, []).map((category) => category.toLowerCase());
    if (!requested.includes(item.category.toLowerCase())) return false;
    const answers = parseJson<Record<string, JsonPrimitive>>(session.compatibilityJson, {});
    const requirements = parseJson<Record<string, JsonPrimitive>>(item.compatibilityJson, {});
    if (!Object.entries(requirements).every(([key, required]) => sameScalar(answers[key], required))) return false;
    const requestedNeeds = new Set(parseJson<string[]>(session.needTagsJson, []).map((tag) => tag.toLowerCase()));
    const itemNeeds = parseJson<string[]>(item.needTagsJson, []).map((tag) => tag.toLowerCase());
    return requestedNeeds.size === 0 || itemNeeds.some((tag) => requestedNeeds.has(tag));
  }

  private claimItemRow(claimId: string, kioskSessionId: string): ClaimItemRow | undefined {
    return this.db.prepare<[string, string], ClaimItemRow>(
      `SELECT c.id AS claimId, c.kiosk_session_id AS kioskSessionId, c.item_id AS itemId,
              c.status AS claimStatus, c.claim_method AS claimMethod, c.created_at AS claimCreatedAt,
              i.status AS itemStatus, i.label, i.category,
              i.compatibility_json AS compatibilityJson
         FROM claims c JOIN items i ON i.id = c.item_id
        WHERE c.id = ? AND c.kiosk_session_id = ?`,
    ).get(claimId, kioskSessionId);
  }

  private idempotencyReplay<T>(
    operation: string,
    principalType: string,
    principalId: string,
    key: string,
    requestHash: string,
  ): T | null {
    const row = this.db.prepare<[string, string, string, string], IdempotencyRow>(
      `SELECT request_hash AS requestHash, response_json AS responseJson
         FROM idempotency_records
        WHERE operation = ? AND principal_type = ? AND principal_id = ? AND idempotency_key = ?`,
    ).get(operation, principalType, principalId, key);
    if (!row) return null;
    if (row.requestHash !== requestHash) {
      throw new DomainError(
        "IDEMPOTENCY_CONFLICT",
        "The idempotency key was already used with a different request.",
      );
    }
    return JSON.parse(row.responseJson) as T;
  }

  private storeIdempotency(
    operation: string,
    principalType: string,
    principalId: string,
    key: string,
    requestHash: string,
    response: unknown,
    createdAt: string,
  ): void {
    this.db.prepare<[string, string, string, string, string, string, string]>(
      `INSERT INTO idempotency_records
        (operation, principal_type, principal_id, idempotency_key, request_hash, response_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(operation, principalType, principalId, key, requestHash, canonicalJson(response), createdAt);
  }
}

export function createEcoDropsService(options: EcoDropsServiceOptions = {}): EcoDropsService {
  return new EcoDropsService(options);
}

export function assertSameOrigin(requestOrigin: string | null, configuredApplicationUrl: string): void {
  let expectedOrigin: string;
  try {
    expectedOrigin = new URL(configuredApplicationUrl).origin;
  } catch {
    throw new DomainError("INVALID_INPUT", "Configured application URL is invalid.");
  }
  if (!requestOrigin) {
    throw new DomainError("FORBIDDEN", "Mutation requests must include an Origin header.");
  }
  try {
    if (new URL(requestOrigin).origin !== expectedOrigin) {
      throw new DomainError("FORBIDDEN", "Cross-origin mutation request was rejected.");
    }
  } catch (error) {
    if (error instanceof DomainError) throw error;
    throw new DomainError("FORBIDDEN", "Mutation request origin is invalid.");
  }
}
