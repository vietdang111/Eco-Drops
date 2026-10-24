export const USER_ROLES = ["corp_user", "warehouse_op", "campus_admin", "admin"] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const ORGANIZATION_KINDS = ["corporate", "warehouse", "campus", "platform"] as const;
export type OrganizationKind = (typeof ORGANIZATION_KINDS)[number];

export const BATCH_STATUSES = [
  "DRAFT",
  "PENDING_VERIFICATION",
  "BLOCKED",
  "IN_TRANSIT",
  "DELIVERED",
  "RECEIVED",
  "UNDER_REVIEW",
  "REJECTED",
  "CERTIFIED",
  "DISTRIBUTING",
  "CLOSED",
] as const;
export type BatchStatus = (typeof BATCH_STATUSES)[number];

export const RISK_TIERS = ["GREEN", "YELLOW", "RED"] as const;
export type RiskTier = (typeof RISK_TIERS)[number];

export const VARIANCE_TIERS = ["PASS", "REVIEW", "REJECT"] as const;
export type VarianceTier = (typeof VARIANCE_TIERS)[number];

export const SHIPMENT_STATUSES = ["CREATED", "IN_TRANSIT", "DELIVERED"] as const;
export type ShipmentStatus = (typeof SHIPMENT_STATUSES)[number];

export const KIOSK_MODES = ["CATEGORY_KNOWN", "MYSTERY_SHORTLIST"] as const;
export type KioskMode = (typeof KIOSK_MODES)[number];

export const ITEM_STATUSES = ["AVAILABLE", "CLAIMED", "RETURN_PENDING", "DISTRIBUTED", "DIVERTED"] as const;
export type ItemStatus = (typeof ITEM_STATUSES)[number];

export const ALLOCATION_STATUSES = ["ALLOCATED", "RECEIVED"] as const;
export type AllocationStatus = (typeof ALLOCATION_STATUSES)[number];

export type HsPolicyDecision = "ELIGIBLE" | "REVIEW" | "BLOCKED";

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

export const CLAIM_STATUSES = ["CHECKED_OUT", "REVEALED", "KEPT", "RETURN_PENDING", "RETURNED"] as const;
export type ClaimStatus = (typeof CLAIM_STATUSES)[number];

export const REVEAL_DECISIONS = ["KEEP", "SWAP", "RETURN"] as const;
export type RevealDecision = (typeof REVEAL_DECISIONS)[number];

export const FOLLOW_UP_OUTCOMES = ["IN_USE", "RETURNING", "PASSED_ON", "NO_ANSWER"] as const;
export type FollowUpOutcome = (typeof FOLLOW_UP_OUTCOMES)[number];

export const DISPLACEMENT_ANSWERS = ["YES", "NO", "UNSURE"] as const;
export type DisplacementAnswer = (typeof DISPLACEMENT_ANSWERS)[number];

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export interface ActorContext {
  userId: string;
  organizationId: string;
  role: UserRole;
}

export interface SafeUser {
  id: string;
  organizationId: string;
  organizationName: string;
  email: string;
  role: UserRole;
}

export interface InvoiceChecks {
  format: boolean;
  consistency: boolean;
  plausibility: boolean;
  uniqueness: boolean;
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
  invoiceChecks: InvoiceChecks;
  authorityAttested: boolean;
  complianceAttested: boolean;
  status: BatchStatus;
  riskTier: RiskTier | null;
  riskRulesVersion: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PublicCertificateProjection {
  recordId: string;
  issueDate: string;
  status: "CERTIFIED" | "REVOKED";
  methodologyVersion: string;
  auditHash: string;
}

export interface CertificateExport extends PublicCertificateProjection {
  batchId: string;
  label: "Estimated avoided emissions";
  lowKgCO2e: number;
  baseKgCO2e: number;
  highKgCO2e: number;
  snapshot: JsonValue;
  disclaimer: string;
}

export interface KioskSessionCredentials {
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
  status: ClaimStatus;
  claimMethod: "SPONSORED_FREE";
  createdAt: string;
}

export interface RevealedClaim extends ClaimResult {
  category: string;
  itemLabel: string;
  compatibility: Record<string, JsonPrimitive>;
}

export interface OutcomeAggregate {
  kept: number;
  returned: number;
  recirculated: number;
  diverted: number;
  unknown: number;
}

export interface DashboardSnapshot {
  generatedAt: string;
  scope: "organization" | "warehouse" | "platform";
  counts: {
    batches: number;
    pendingWarehouse: number;
    certified: number;
    availableItems: number;
    claims: number;
  };
  outcomes: OutcomeAggregate;
  recentBatches: BatchSummary[];
}
