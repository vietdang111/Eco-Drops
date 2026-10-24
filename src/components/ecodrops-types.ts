export type UserRole = "corp_user" | "warehouse_op" | "campus_admin" | "admin";
export type BatchStatus =
  | "DRAFT"
  | "PENDING_VERIFICATION"
  | "BLOCKED"
  | "IN_TRANSIT"
  | "DELIVERED"
  | "RECEIVED"
  | "UNDER_REVIEW"
  | "REJECTED"
  | "CERTIFIED"
  | "DISTRIBUTING"
  | "CLOSED";
export type RiskTier = "GREEN" | "YELLOW" | "RED";
export type VarianceTier = "PASS" | "REVIEW" | "REJECT";
export type HsPolicyDecision = "ELIGIBLE" | "REVIEW" | "BLOCKED";
export type AllocationStatus = "ALLOCATED" | "RECEIVED";
export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export interface HsPolicyCatalogEntry {
  hsCode: string;
  category: string;
  baselineRisk: RiskTier;
  policyDecision: HsPolicyDecision;
  policyVersion: string;
  rationale: string;
  active: true;
  requiresComplianceAttestation: boolean;
  notice: string;
}

export interface CampusSummary {
  id: string;
  name: string;
  slug: string;
  synthetic: boolean;
}

export interface CampusAllocation {
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

export interface DistributionProgress {
  verifiedUnits: number;
  existingItemCount: number;
  pendingAllocationQuantity: number;
  receivedAllocationQuantity: number;
  totalAllocationQuantity: number;
  remainingCapacity: number;
  fullyDistributed: boolean;
}

export interface AllocationMutationResult {
  allocation: CampusAllocation;
  distribution: DistributionProgress;
  batchStatus: BatchStatus;
}

export interface AllocationReceiptResult extends AllocationMutationResult {
  itemsCreated: number;
  itemIds: string[];
}

export interface SafeUser {
  id: string;
  organizationId: string;
  organizationName: string;
  email: string;
  role: UserRole;
}

export interface SessionData {
  user: SafeUser;
  sessionId: string;
  expiresAt: string;
}

export interface BatchSummary {
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
  invoiceChecks: {
    format: boolean;
    consistency: boolean;
    plausibility: boolean;
    uniqueness: boolean;
  };
  authorityAttested: boolean;
  complianceAttested: boolean;
  status: BatchStatus;
  riskTier: RiskTier | null;
  riskRulesVersion: string | null;
  createdAt: string;
  updatedAt: string;
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

export interface ScenarioEstimate {
  factorKgCO2ePerKg: number;
  displacementRate: number;
  retentionRate: number;
  handlingKgCO2ePerItem: number;
  embodiedNewKgCO2ePerItem: number;
  estimatedAvoidedEmissionsKgCO2ePerItem: number;
  estimatedAvoidedEmissionsKgCO2e: number;
}

export interface AvoidedEmissionsEstimate {
  label: "Estimated avoided emissions";
  verified: boolean;
  eligibleUnits: number;
  unitWeightKg: number;
  methodologySource: string;
  methodologyVersion: string;
  factorVersion: string;
  formulaVersion: string;
  formula: string;
  sampleSizes: { displacement: number; retention: number };
  scenarios: Record<"low" | "base" | "high", ScenarioEstimate>;
}

export interface ShipmentReadModel {
  id: string;
  batchId: string;
  trackingReference: string;
  status: "CREATED" | "IN_TRANSIT" | "DELIVERED";
  carrierMode: "SIMULATED" | "WEBHOOK";
  simulated: boolean;
  createdAt: string;
  updatedAt: string;
  events: Array<{
    status: "CREATED" | "IN_TRANSIT" | "DELIVERED";
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

export interface CertificateExport {
  recordId: string;
  issueDate: string;
  status: "CERTIFIED" | "REVOKED";
  methodologyVersion: string;
  auditHash: string;
  batchId: string;
  label: "Estimated avoided emissions";
  lowKgCO2e: number;
  baseKgCO2e: number;
  highKgCO2e: number;
  snapshot: JsonValue;
  disclaimer: string;
}

export interface FactorMetadata {
  id: string;
  category: string;
  version: string;
  factorKgCO2ePerKg: Record<"low" | "base" | "high", number>;
  displacementRate: Record<"low" | "base" | "high", number>;
  retentionRate: Record<"low" | "base" | "high", number>;
  handlingKgCO2ePerItem: number;
  sampleSizes: { displacement: number; retention: number };
}

export interface BatchDetail {
  batch: BatchSummary;
  shipment: ShipmentReadModel | null;
  receiving: ReceivingReadModel | null;
  certificate: CertificateExport | null;
  estimate: AvoidedEmissionsEstimate;
  factor: FactorMetadata | null;
  distribution: DistributionProgress;
  allocations: CampusAllocation[];
  recentAuditTimeline: AuditTimelineEntry[];
}

export interface InventoryAndOutcomes {
  inventory: {
    total: number;
    byStatus: Record<"AVAILABLE" | "CLAIMED" | "RETURN_PENDING" | "DISTRIBUTED" | "DIVERTED", number>;
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
    followUps: { inUse: number; returning: number; passedOn: number; noAnswer: number; notRecorded: number };
  };
}

export interface DisposalComparisonInputs {
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

export interface DashboardReadModel {
  dashboard: {
    generatedAt: string;
    scope: "organization" | "warehouse" | "platform";
    counts: {
      batches: number;
      pendingWarehouse: number;
      certified: number;
      availableItems: number;
      claims: number;
    };
    outcomes: { kept: number; returned: number; recirculated: number; diverted: number; unknown: number };
    recentBatches: BatchSummary[];
  };
  inventoryAndOutcomes: InventoryAndOutcomes;
  recentAuditTimeline: AuditTimelineEntry[];
  disposalComparisonInputs: DisposalComparisonInputs;
  allocations: CampusAllocation[];
  campuses: CampusSummary[];
}

export interface WorkspaceResponse {
  user: SafeUser;
  sessionId: string;
  expiresAt: string;
  dashboard: DashboardReadModel;
  batches: BatchSummary[];
  allocations: CampusAllocation[];
  campuses: CampusSummary[];
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
    factors: FactorMetadata[];
  }>;
}

export interface AuditVerification {
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

export type KioskMode = "CATEGORY_KNOWN" | "MYSTERY_SHORTLIST";
export interface KioskSession {
  sessionId: string;
  token: string;
  expiresAt: string;
  mode: KioskMode;
  weekKey: string;
  weeklyClaimCap: number;
  weeklyClaimsUsed: number;
  weeklyClaimsRemaining: number;
}
export interface MatchedItem {
  itemId: string;
  displayLabel: string;
  category: string | null;
  mystery: boolean;
  compatibility: Record<string, JsonPrimitive>;
  needTags: string[];
}
export interface ClaimResult {
  claimId: string;
  itemId: string;
  status: "CHECKED_OUT" | "REVEALED" | "KEPT" | "RETURN_PENDING" | "RETURNED";
  claimMethod: "SPONSORED_FREE";
  createdAt: string;
}
export interface RevealedClaim extends ClaimResult {
  category: string;
  itemLabel: string;
  compatibility: Record<string, JsonPrimitive>;
}
export interface DecisionResult {
  claimId: string;
  itemId: string;
  decision: "KEEP" | "SWAP" | "RETURN";
  claimStatus: "KEPT" | "RETURN_PENDING";
  itemStatus: "DISTRIBUTED" | "RETURN_PENDING";
  recordedAt: string;
}
export interface PublicCertificate {
  recordId: string;
  issueDate: string;
  status: "CERTIFIED" | "REVOKED";
  methodologyVersion: string;
  auditHash: string;
}
