import type { AvoidedEmissionsEstimate } from "./carbon";
import type { DatabaseConnection } from "./db";
import type {
  ActorContext,
  BatchStatus,
  BatchSummary,
  CampusAllocation,
  CampusSummary,
  CertificateExport,
  ClaimStatus,
  DistributionProgress,
  FollowUpOutcome,
  ItemStatus,
  JsonValue,
  RevealDecision,
  RiskTier,
  ShipmentStatus,
  UserRole,
  VarianceTier,
} from "./domain";
import { DomainError } from "./errors";
import { calculateRemainingAllocationCapacity } from "./workflow";
import type { EcoDropsService } from "./service";

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

interface AllocationRow {
  id: string;
  batchId: string;
  sourceOrganizationId: string;
  sourceOrganizationName: string;
  campusOrganizationId: string;
  campusName: string;
  quantity: number;
  status: CampusAllocation["status"];
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

interface CampusRow {
  id: string;
  name: string;
  slug: string;
  synthetic: number;
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

interface ShipmentEventRow {
  status: ShipmentStatus;
  source: "SIMULATED_CARRIER" | "SIGNED_CARRIER_WEBHOOK";
  occurredAt: string;
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

interface CertificateLookupRow {
  recordId: string;
  status: "CERTIFIED" | "REVOKED";
}

interface AuditTimelineRow {
  sequence: number;
  eventId: string;
  eventType: string;
  entityType: string;
  entityId: string;
  actorRole: UserRole | null;
  organizationId: string | null;
  occurredAt: string;
  previousHash: string;
  hash: string;
}

interface InventoryRow {
  id: string;
  category: string;
  status: ItemStatus;
  circulationCount: number;
}

interface OutcomeRow {
  claimStatus: ClaimStatus;
  itemStatus: ItemStatus;
  circulationCount: number;
  decision: RevealDecision | null;
  followUpOutcome: FollowUpOutcome | null;
}

interface MethodologyRow {
  id: string;
  name: string;
  version: string;
  sourceName: string;
  sourceUrl: string;
  formulaVersion: string;
  assumptionsJson: string;
  active: number;
  createdAt: string;
}

interface FactorRow {
  id: string;
  category: string;
  version: string;
  lowFactor: number;
  baseFactor: number;
  highFactor: number;
  lowDisplacement: number;
  baseDisplacement: number;
  highDisplacement: number;
  lowRetention: number;
  baseRetention: number;
  highRetention: number;
  handlingKgCO2ePerItem: number;
  displacementSampleSize: number;
  retentionSampleSize: number;
}

interface BatchAggregateRow {
  totalBatches: number;
  syntheticBatches: number;
  claimedUnits: number | null;
  claimedWeightKg: number | null;
  verifiedUnits: number | null;
  verifiedWeightKg: number | null;
}

export interface ShipmentReadModel {
  id: string;
  batchId: string;
  trackingReference: string;
  status: ShipmentStatus;
  carrierMode: "SIMULATED" | "WEBHOOK";
  simulated: boolean;
  createdAt: string;
  updatedAt: string;
  events: Array<{
    status: ShipmentStatus;
    source: "SIMULATED_CARRIER" | "SIGNED_CARRIER_WEBHOOK";
    simulated: boolean;
    occurredAt: string;
  }>;
}

export interface ReceivingReadModel {
  id: string;
  batchId: string;
  receivedByUserId: string;
  grossWeightKg: number;
  tareWeightKg: number;
  netWeightKg: number;
  expectedWeightKg: number;
  absoluteVarianceKg: number;
  variancePercent: number;
  varianceTier: VarianceTier;
  sampleScanCount: number;
  verifiedUnits: number;
  reviewReason: string | null;
  evidencePhotoCount: number;
  receivedAt: string;
}

export interface FactorMetadataReadModel {
  id: string;
  category: string;
  version: string;
  factorKgCO2ePerKg: { low: number; base: number; high: number };
  displacementRate: { low: number; base: number; high: number };
  retentionRate: { low: number; base: number; high: number };
  handlingKgCO2ePerItem: number;
  sampleSizes: { displacement: number; retention: number };
}

export interface AuditTimelineEntry {
  sequence: number;
  eventId: string;
  eventType: string;
  entityType: string;
  entityId: string;
  actorRole: UserRole | null;
  organizationId: string | null;
  occurredAt: string;
  previousHash: string;
  hash: string;
}

export interface BatchDetailReadModel {
  batch: BatchSummary;
  shipment: ShipmentReadModel | null;
  receiving: ReceivingReadModel | null;
  certificate: CertificateExport | null;
  estimate: AvoidedEmissionsEstimate;
  factor: FactorMetadataReadModel | null;
  distribution: DistributionProgress;
  allocations: CampusAllocation[];
  recentAuditTimeline: AuditTimelineEntry[];
}

export interface InventoryOutcomeReadModel {
  inventory: {
    total: number;
    byStatus: Record<ItemStatus, number>;
    byCategory: Array<{ category: string; count: number }>;
    totalCirculations: number;
  };
  outcomes: {
    claims: number;
    kept: number;
    returned: number;
    recirculated: number;
    diverted: number;
    unknown: number;
    decisions: { keep: number; swap: number; return: number; pending: number };
    followUps: {
      inUse: number;
      returning: number;
      passedOn: number;
      noAnswer: number;
      notRecorded: number;
    };
  };
}

export interface DisposalComparisonInputsReadModel {
  label: "Illustrative disposal comparison inputs";
  syntheticDemoInputs: boolean;
  unit: "items";
  functionalSurplus: {
    batches: number;
    claimedUnits: number;
    claimedWeightKg: number;
    verifiedUnits: number;
    verifiedWeightKg: number;
    availableItems: number;
    distributedItems: number;
    observedClaims: number;
    observedRetainedFollowUps: number;
    returnedItems: number;
    divertedItems: number;
  };
  disposalCounterfactual: {
    configured: false;
    comparisonUnits: number;
    emissionsFactorKgCO2ePerUnit: null;
    estimatedEmissionsKgCO2e: null;
  };
  notice: string;
}

export interface MethodologyReadModel {
  label: "Estimated avoided emissions methodology";
  formula: string;
  disclosure: string;
  methodologies: Array<{
    id: string;
    name: string;
    version: string;
    sourceName: string;
    sourceUrl: string;
    formulaVersion: string;
    assumptions: JsonValue;
    active: boolean;
    createdAt: string;
    factors: FactorMetadataReadModel[];
  }>;
}

export interface RoleDashboardReadModel {
  dashboard: ReturnType<EcoDropsService["getDashboardSnapshot"]>;
  inventoryAndOutcomes: InventoryOutcomeReadModel;
  recentAuditTimeline: AuditTimelineEntry[];
  disposalComparisonInputs: DisposalComparisonInputsReadModel;
  allocations: CampusAllocation[];
  campuses: CampusSummary[];
}

export interface ReadModelOptions {
  db: DatabaseConnection;
  service: EcoDropsService;
}

const BATCH_SELECT = `SELECT b.id, b.org_id AS organizationId, o.name AS organizationName,
  b.created_by_user_id AS createdByUserId, b.hs_code AS hsCode, b.category, b.quantity,
  b.unit_weight_kg AS unitWeightKg, b.declared_value_cents AS declaredValueCents,
  b.invoice_identifier AS invoiceIdentifier, b.invoice_format_check AS invoiceFormatCheck,
  b.invoice_consistency_check AS invoiceConsistencyCheck,
  b.invoice_plausibility_check AS invoicePlausibilityCheck,
  b.invoice_uniqueness_check AS invoiceUniquenessCheck,
  b.authority_attested AS authorityAttested, b.compliance_attested AS complianceAttested,
  b.status, b.risk_tier AS riskTier, b.risk_rules_version AS riskRulesVersion,
  b.factor_id AS factorId, b.created_at AS createdAt, b.updated_at AS updatedAt
  FROM batches b JOIN organizations o ON o.id = b.org_id`;

const ALLOCATION_SELECT = `SELECT a.id, a.batch_id AS batchId,
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

const AUDIT_SELECT = `SELECT sequence, event_id AS eventId, event_type AS eventType,
  entity_type AS entityType, entity_id AS entityId, actor_role AS actorRole,
  org_id AS organizationId, occurred_at AS occurredAt,
  previous_hash AS previousHash, hash FROM audit_events`;

const FORMULA =
  "max(0, unit_weight_kg × factor_kgCO2e_per_kg × displacement_rate × retention_rate − handling_kgCO2e_per_item) × eligible_units";

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
      format: row.invoiceFormatCheck === 1,
      consistency: row.invoiceConsistencyCheck === 1,
      plausibility: row.invoicePlausibilityCheck === 1,
      uniqueness: row.invoiceUniquenessCheck === 1,
    },
    authorityAttested: row.authorityAttested === 1,
    complianceAttested: row.complianceAttested === 1,
    status: row.status,
    riskTier: row.riskTier,
    riskRulesVersion: row.riskRulesVersion,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
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

function mapFactor(row: FactorRow): FactorMetadataReadModel {
  return {
    id: row.id,
    category: row.category,
    version: row.version,
    factorKgCO2ePerKg: { low: row.lowFactor, base: row.baseFactor, high: row.highFactor },
    displacementRate: {
      low: row.lowDisplacement,
      base: row.baseDisplacement,
      high: row.highDisplacement,
    },
    retentionRate: { low: row.lowRetention, base: row.baseRetention, high: row.highRetention },
    handlingKgCO2ePerItem: row.handlingKgCO2ePerItem,
    sampleSizes: {
      displacement: row.displacementSampleSize,
      retention: row.retentionSampleSize,
    },
  };
}

function parseJson(value: string): JsonValue {
  try {
    return JSON.parse(value) as JsonValue;
  } catch {
    return {};
  }
}

function normalizedLimit(limit: number, maximum = 100): number {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > maximum) {
    throw new DomainError("INVALID_INPUT", `limit must be an integer between 1 and ${maximum}.`);
  }
  return limit;
}

export class EcoDropsReadModels {
  private readonly db: DatabaseConnection;
  private readonly service: EcoDropsService;

  constructor(options: ReadModelOptions) {
    this.db = options.db;
    this.service = options.service;
  }

  listBatches(actor: ActorContext, limit = 50): BatchSummary[] {
    this.assertActor(actor);
    return this.batchRows(actor, normalizedLimit(limit)).map(mapBatch);
  }

  listAllocations(actor: ActorContext, limit = 100): CampusAllocation[] {
    this.assertActor(actor);
    return this.allocationRows(actor, normalizedLimit(limit)).map(mapAllocation);
  }

  getAllocation(actor: ActorContext, allocationId: string): CampusAllocation {
    this.assertActor(actor);
    const row = this.allocationByIdForActor(actor, allocationId);
    if (!row) throw new DomainError("NOT_FOUND", "Campus allocation was not found.");
    return mapAllocation(row);
  }

  listCampuses(actor: ActorContext): CampusSummary[] {
    this.assertActor(actor);
    if (actor.role !== "warehouse_op" && actor.role !== "admin") {
      throw new DomainError("FORBIDDEN", "This role cannot access the campus directory.");
    }
    return this.db.prepare<[], CampusRow>(
      `SELECT id, name, slug, synthetic FROM organizations
        WHERE kind = 'campus' ORDER BY name, id`,
    ).all().map((campus) => ({
      id: campus.id,
      name: campus.name,
      slug: campus.slug,
      synthetic: campus.synthetic === 1,
    }));
  }

  getBatchDetail(actor: ActorContext, batchId: string): BatchDetailReadModel {
    const batch = this.requireBatch(actor, batchId);
    const shipment = this.shipmentForBatch(batch.id);
    const receiving = this.receivingForBatch(batch.id);
    const certificateLookup = this.db.prepare<[string], CertificateLookupRow>(
      "SELECT record_id AS recordId, status FROM certificates WHERE batch_id = ?",
    ).get(batch.id);
    const certificate = certificateLookup?.status === "CERTIFIED"
      ? this.service.getCertificateExport(actor, certificateLookup.recordId)
      : null;

    return {
      batch: mapBatch(batch),
      shipment,
      receiving,
      certificate,
      estimate: this.service.getBatchImpact(actor, batch.id),
      factor: batch.factorId ? this.factorById(batch.factorId) : null,
      distribution: this.distributionForBatch(batch.id),
      allocations: this.allocationRows(actor, 100, batch.id).map(mapAllocation),
      recentAuditTimeline: this.batchAuditTimeline(
        actor,
        batch,
        shipment?.id ?? null,
        receiving?.id ?? null,
        certificate?.recordId ?? null,
      ),
    };
  }

  getRecentAuditTimeline(actor: ActorContext, limit = 25): AuditTimelineEntry[] {
    this.assertActor(actor);
    const bounded = normalizedLimit(limit);
    if (actor.role === "corp_user") {
      return this.db.prepare<[string, number], AuditTimelineRow>(
        `${AUDIT_SELECT} WHERE org_id = ? ORDER BY sequence DESC LIMIT ?`,
      ).all(actor.organizationId, bounded);
    }
    if (actor.role === "campus_admin") {
      return this.db.prepare<[string, string, number], AuditTimelineRow>(
        `${AUDIT_SELECT}
          WHERE org_id = ? OR entity_id IN (
            SELECT id FROM campus_allocations WHERE campus_org_id = ?
          )
          ORDER BY sequence DESC LIMIT ?`,
      ).all(actor.organizationId, actor.organizationId, bounded);
    }
    return this.db.prepare<[number], AuditTimelineRow>(
      `${AUDIT_SELECT} ORDER BY sequence DESC LIMIT ?`,
    ).all(bounded);
  }

  getAggregateInventoryOutcomes(actor: ActorContext): InventoryOutcomeReadModel {
    this.assertActor(actor);
    const items = this.inventoryRows(actor);
    const outcomes = this.outcomeRows(actor);
    const byStatus: Record<ItemStatus, number> = {
      AVAILABLE: 0,
      CLAIMED: 0,
      RETURN_PENDING: 0,
      DISTRIBUTED: 0,
      DIVERTED: 0,
    };
    const categories = new Map<string, number>();
    for (const item of items) {
      byStatus[item.status] += 1;
      categories.set(item.category, (categories.get(item.category) ?? 0) + 1);
    }

    return {
      inventory: {
        total: items.length,
        byStatus,
        byCategory: [...categories.entries()]
          .map(([category, count]) => ({ category, count }))
          .sort((left, right) => left.category.localeCompare(right.category)),
        totalCirculations: items.reduce((total, item) => total + item.circulationCount, 0),
      },
      outcomes: {
        claims: outcomes.length,
        kept: outcomes.filter((row) => row.decision === "KEEP").length,
        returned: outcomes.filter((row) => row.claimStatus === "RETURNED").length,
        recirculated: outcomes.filter((row) => row.circulationCount > 0).length,
        diverted: outcomes.filter((row) => row.itemStatus === "DIVERTED").length,
        unknown: outcomes.filter(
          (row) => row.followUpOutcome === null || row.followUpOutcome === "NO_ANSWER",
        ).length,
        decisions: {
          keep: outcomes.filter((row) => row.decision === "KEEP").length,
          swap: outcomes.filter((row) => row.decision === "SWAP").length,
          return: outcomes.filter((row) => row.decision === "RETURN").length,
          pending: outcomes.filter((row) => row.decision === null).length,
        },
        followUps: {
          inUse: outcomes.filter((row) => row.followUpOutcome === "IN_USE").length,
          returning: outcomes.filter((row) => row.followUpOutcome === "RETURNING").length,
          passedOn: outcomes.filter((row) => row.followUpOutcome === "PASSED_ON").length,
          noAnswer: outcomes.filter((row) => row.followUpOutcome === "NO_ANSWER").length,
          notRecorded: outcomes.filter((row) => row.followUpOutcome === null).length,
        },
      },
    };
  }

  getDisposalComparisonInputs(actor: ActorContext): DisposalComparisonInputsReadModel {
    this.assertActor(actor);
    const aggregate = this.batchAggregate(actor);
    const inventoryAndOutcomes = this.getAggregateInventoryOutcomes(actor);
    const items = inventoryAndOutcomes.inventory.byStatus;
    const outcomes = inventoryAndOutcomes.outcomes;
    const verifiedUnits = aggregate.verifiedUnits ?? 0;

    return {
      label: "Illustrative disposal comparison inputs",
      syntheticDemoInputs:
        aggregate.totalBatches > 0 && aggregate.syntheticBatches === aggregate.totalBatches,
      unit: "items",
      functionalSurplus: {
        batches: aggregate.totalBatches,
        claimedUnits: aggregate.claimedUnits ?? 0,
        claimedWeightKg: aggregate.claimedWeightKg ?? 0,
        verifiedUnits,
        verifiedWeightKg: aggregate.verifiedWeightKg ?? 0,
        availableItems: items.AVAILABLE,
        distributedItems: items.DISTRIBUTED,
        observedClaims: outcomes.claims,
        observedRetainedFollowUps: outcomes.followUps.inUse + outcomes.followUps.passedOn,
        returnedItems: outcomes.returned,
        divertedItems: items.DIVERTED,
      },
      disposalCounterfactual: {
        configured: false,
        comparisonUnits: verifiedUnits,
        emissionsFactorKgCO2ePerUnit: null,
        estimatedEmissionsKgCO2e: null,
      },
      notice:
        "Quantity-only demo inputs. No disposal-emissions factor is configured, so this read model makes no disposal-emissions or climate-benefit claim.",
    };
  }

  getMethodology(actor: ActorContext): MethodologyReadModel {
    this.assertActor(actor);
    const methodologies = this.db.prepare<[], MethodologyRow>(
      `SELECT id, name, version, source_name AS sourceName, source_url AS sourceUrl,
              formula_version AS formulaVersion, assumptions_json AS assumptionsJson,
              active, created_at AS createdAt
         FROM methodologies WHERE active = 1 ORDER BY version DESC`,
    ).all();

    return {
      label: "Estimated avoided emissions methodology",
      formula: FORMULA,
      disclosure:
        "Source families are referenced; category factors, displacement, retention, and handling values remain explicit model assumptions.",
      methodologies: methodologies.map((methodology) => ({
        id: methodology.id,
        name: methodology.name,
        version: methodology.version,
        sourceName: methodology.sourceName,
        sourceUrl: methodology.sourceUrl,
        formulaVersion: methodology.formulaVersion,
        assumptions: parseJson(methodology.assumptionsJson),
        active: methodology.active === 1,
        createdAt: methodology.createdAt,
        factors: this.db.prepare<[string], FactorRow>(
          `SELECT id, category, version, low_factor AS lowFactor, base_factor AS baseFactor,
                  high_factor AS highFactor, low_displacement AS lowDisplacement,
                  base_displacement AS baseDisplacement, high_displacement AS highDisplacement,
                  low_retention AS lowRetention, base_retention AS baseRetention,
                  high_retention AS highRetention,
                  handling_kg_co2e_per_item AS handlingKgCO2ePerItem,
                  displacement_sample_size AS displacementSampleSize,
                  retention_sample_size AS retentionSampleSize
             FROM emission_factors WHERE methodology_id = ? ORDER BY category`,
        ).all(methodology.id).map(mapFactor),
      })),
    };
  }

  getRoleDashboard(actor: ActorContext): RoleDashboardReadModel {
    return {
      dashboard: this.service.getDashboardSnapshot(actor),
      inventoryAndOutcomes: this.getAggregateInventoryOutcomes(actor),
      recentAuditTimeline: this.getRecentAuditTimeline(actor, 20),
      disposalComparisonInputs: this.getDisposalComparisonInputs(actor),
      allocations: this.listAllocations(actor, 100),
      campuses:
        actor.role === "warehouse_op" || actor.role === "admin"
          ? this.listCampuses(actor)
          : [],
    };
  }

  private assertActor(actor: ActorContext): void {
    const stored = this.db.prepare<[string], { organizationId: string; role: UserRole }>(
      "SELECT org_id AS organizationId, role FROM users WHERE id = ?",
    ).get(actor.userId);
    if (!stored || stored.organizationId !== actor.organizationId || stored.role !== actor.role) {
      throw new DomainError("FORBIDDEN", "Actor identity, role, or organization is invalid.");
    }
  }

  private batchRows(actor: ActorContext, limit: number): BatchRow[] {
    if (actor.role === "corp_user") {
      return this.db.prepare<[string, number], BatchRow>(
        `${BATCH_SELECT} WHERE b.org_id = ? ORDER BY b.updated_at DESC LIMIT ?`,
      ).all(actor.organizationId, limit);
    }
    if (actor.role === "campus_admin") {
      return this.db.prepare<[string, string, number], BatchRow>(
        `${BATCH_SELECT} WHERE
          EXISTS (SELECT 1 FROM items i WHERE i.batch_id = b.id AND i.campus_org_id = ?)
          OR EXISTS (
            SELECT 1 FROM campus_allocations a
             WHERE a.batch_id = b.id AND a.campus_org_id = ?
          )
         ORDER BY b.updated_at DESC LIMIT ?`,
      ).all(actor.organizationId, actor.organizationId, limit);
    }
    return this.db.prepare<[number], BatchRow>(
      `${BATCH_SELECT} ORDER BY b.updated_at DESC LIMIT ?`,
    ).all(limit);
  }

  private requireBatch(actor: ActorContext, batchId: string): BatchRow {
    this.assertActor(actor);
    const row = this.db.prepare<[string], BatchRow>(`${BATCH_SELECT} WHERE b.id = ?`).get(batchId);
    if (!row) throw new DomainError("NOT_FOUND", "Batch was not found.");
    if (actor.role === "corp_user" && row.organizationId !== actor.organizationId) {
      throw new DomainError("NOT_FOUND", "Batch was not found.");
    }
    if (actor.role === "campus_admin") {
      const visible = this.db.prepare<[string, string, string, string], { visible: number }>(
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

  private allocationRows(
    actor: ActorContext,
    limit: number,
    batchId?: string,
  ): AllocationRow[] {
    const clauses: string[] = [];
    const parameters: Array<string | number> = [];
    if (actor.role === "corp_user") {
      clauses.push("b.org_id = ?");
      parameters.push(actor.organizationId);
    } else if (actor.role === "campus_admin") {
      clauses.push("a.campus_org_id = ?");
      parameters.push(actor.organizationId);
    }
    if (batchId !== undefined) {
      clauses.push("a.batch_id = ?");
      parameters.push(batchId);
    }
    const where = clauses.length > 0 ? ` WHERE ${clauses.join(" AND ")}` : "";
    parameters.push(limit);
    return this.db.prepare(
      `${ALLOCATION_SELECT}${where} ORDER BY a.created_at DESC, a.id DESC LIMIT ?`,
    ).all(...parameters) as AllocationRow[];
  }

  private allocationByIdForActor(
    actor: ActorContext,
    allocationId: string,
  ): AllocationRow | undefined {
    const clauses = ["a.id = ?"];
    const parameters: string[] = [allocationId];
    if (actor.role === "corp_user") {
      clauses.push("b.org_id = ?");
      parameters.push(actor.organizationId);
    } else if (actor.role === "campus_admin") {
      clauses.push("a.campus_org_id = ?");
      parameters.push(actor.organizationId);
    }
    return this.db.prepare(
      `${ALLOCATION_SELECT} WHERE ${clauses.join(" AND ")}`,
    ).get(...parameters) as AllocationRow | undefined;
  }

  private distributionForBatch(batchId: string): DistributionProgress {
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
    ).get(batchId, batchId, batchId, batchId, batchId);
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

  private shipmentForBatch(batchId: string): ShipmentReadModel | null {
    const row = this.db.prepare<[string], ShipmentRow>(
      `SELECT id, batch_id AS batchId, tracking_reference AS trackingReference, status,
              carrier_mode AS carrierMode, created_at AS createdAt, updated_at AS updatedAt
         FROM shipments WHERE batch_id = ?`,
    ).get(batchId);
    if (!row) return null;
    const events = this.db.prepare<[string], ShipmentEventRow>(
      `SELECT status, source, occurred_at AS occurredAt FROM shipment_events
        WHERE shipment_id = ? ORDER BY occurred_at, rowid`,
    ).all(row.id);
    return {
      ...row,
      simulated: row.carrierMode === "SIMULATED",
      events: events.map((event) => ({
        ...event,
        simulated: event.source === "SIMULATED_CARRIER",
      })),
    };
  }

  private receivingForBatch(batchId: string): ReceivingReadModel | null {
    const row = this.db.prepare<[string], ReceivingRow>(
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
    if (!row) return null;
    return { ...row, variancePercent: row.varianceRatio * 100 };
  }

  private factorById(factorId: string): FactorMetadataReadModel | null {
    const row = this.db.prepare<[string], FactorRow>(
      `SELECT id, category, version, low_factor AS lowFactor, base_factor AS baseFactor,
              high_factor AS highFactor, low_displacement AS lowDisplacement,
              base_displacement AS baseDisplacement, high_displacement AS highDisplacement,
              low_retention AS lowRetention, base_retention AS baseRetention,
              high_retention AS highRetention,
              handling_kg_co2e_per_item AS handlingKgCO2ePerItem,
              displacement_sample_size AS displacementSampleSize,
              retention_sample_size AS retentionSampleSize
         FROM emission_factors WHERE id = ?`,
    ).get(factorId);
    return row ? mapFactor(row) : null;
  }

  private batchAuditTimeline(
    actor: ActorContext,
    batch: BatchRow,
    shipmentId: string | null,
    receivingId: string | null,
    certificateId: string | null,
  ): AuditTimelineEntry[] {
    const campusScope = actor.role === "campus_admin" ? actor.organizationId : null;
    return this.db.prepare<[
      string,
      string,
      string,
      string,
      string,
      string,
      string | null,
      string | null,
    ], AuditTimelineRow>(
      `${AUDIT_SELECT}
        WHERE (org_id = ? AND entity_id IN (?, ?, ?, ?))
           OR entity_id IN (
             SELECT id FROM campus_allocations
              WHERE batch_id = ? AND (? IS NULL OR campus_org_id = ?)
           )
        ORDER BY sequence DESC LIMIT 25`,
    ).all(
      batch.organizationId,
      batch.id,
      shipmentId ?? "",
      receivingId ?? "",
      certificateId ?? "",
      batch.id,
      campusScope,
      campusScope,
    );
  }

  private inventoryRows(actor: ActorContext): InventoryRow[] {
    const select = `SELECT i.id, i.category, i.status,
      i.circulation_count AS circulationCount FROM items i`;
    if (actor.role === "campus_admin") {
      return this.db.prepare<[string], InventoryRow>(
        `${select} WHERE i.campus_org_id = ?`,
      ).all(actor.organizationId);
    }
    if (actor.role === "corp_user") {
      return this.db.prepare<[string], InventoryRow>(
        `${select} JOIN batches b ON b.id = i.batch_id WHERE b.org_id = ?`,
      ).all(actor.organizationId);
    }
    return this.db.prepare<[], InventoryRow>(select).all();
  }

  private outcomeRows(actor: ActorContext): OutcomeRow[] {
    const select = `SELECT c.status AS claimStatus, i.status AS itemStatus,
      i.circulation_count AS circulationCount, d.decision,
      o.follow_up_outcome AS followUpOutcome
      FROM claims c JOIN items i ON i.id = c.item_id
      JOIN batches b ON b.id = i.batch_id
      LEFT JOIN claim_decisions d ON d.claim_id = c.id
      LEFT JOIN outcomes o ON o.claim_id = c.id`;
    if (actor.role === "campus_admin") {
      return this.db.prepare<[string], OutcomeRow>(
        `${select} WHERE i.campus_org_id = ?`,
      ).all(actor.organizationId);
    }
    if (actor.role === "corp_user") {
      return this.db.prepare<[string], OutcomeRow>(
        `${select} WHERE b.org_id = ?`,
      ).all(actor.organizationId);
    }
    return this.db.prepare<[], OutcomeRow>(select).all();
  }

  private batchAggregate(actor: ActorContext): BatchAggregateRow {
    const select = `SELECT COUNT(*) AS totalBatches,
      SUM(CASE WHEN o.synthetic = 1 THEN 1 ELSE 0 END) AS syntheticBatches,
      SUM(b.quantity) AS claimedUnits,
      SUM(b.quantity * b.unit_weight_kg) AS claimedWeightKg,
      SUM(COALESCE(r.verified_units, 0)) AS verifiedUnits,
      SUM(COALESCE(r.verified_units, 0) * b.unit_weight_kg) AS verifiedWeightKg
      FROM batches b JOIN organizations o ON o.id = b.org_id
      LEFT JOIN receivings r ON r.batch_id = b.id`;
    if (actor.role === "corp_user") {
      return this.db.prepare<[string], BatchAggregateRow>(
        `${select} WHERE b.org_id = ?`,
      ).get(actor.organizationId) ?? this.emptyBatchAggregate();
    }
    if (actor.role === "campus_admin") {
      return this.db.prepare<[string, string], BatchAggregateRow>(
        `${select} WHERE
          EXISTS (SELECT 1 FROM items i WHERE i.batch_id = b.id AND i.campus_org_id = ?)
          OR EXISTS (
            SELECT 1 FROM campus_allocations a
             WHERE a.batch_id = b.id AND a.campus_org_id = ?
          )`,
      ).get(actor.organizationId, actor.organizationId) ?? this.emptyBatchAggregate();
    }
    return this.db.prepare<[], BatchAggregateRow>(select).get() ?? this.emptyBatchAggregate();
  }

  private emptyBatchAggregate(): BatchAggregateRow {
    return {
      totalBatches: 0,
      syntheticBatches: 0,
      claimedUnits: 0,
      claimedWeightKg: 0,
      verifiedUnits: 0,
      verifiedWeightKg: 0,
    };
  }
}

export function createReadModels(options: ReadModelOptions): EcoDropsReadModels {
  return new EcoDropsReadModels(options);
}
