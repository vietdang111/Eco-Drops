import { z } from "zod";
import {
  DISPLACEMENT_ANSWERS,
  FOLLOW_UP_OUTCOMES,
  KIOSK_MODES,
  REVEAL_DECISIONS,
  USER_ROLES,
} from "./domain";

export const MAX_INVOICE_BYTES = 10 * 1024 * 1024;
export const MAX_EVIDENCE_BYTES = 5 * 1024 * 1024;

export const strongPasswordSchema = z
  .string()
  .min(12, "Password must contain at least 12 characters.")
  .max(128, "Password must contain at most 128 characters.")
  .regex(/[a-z]/, "Password must contain a lowercase letter.")
  .regex(/[A-Z]/, "Password must contain an uppercase letter.")
  .regex(/[0-9]/, "Password must contain a number.")
  .regex(/[^A-Za-z0-9]/, "Password must contain a symbol.");

const idSchema = z.string().trim().min(1).max(128);
const categorySchema = z.string().trim().min(2).max(80);
const idempotencyKeySchema = z.string().trim().min(8).max(200);
const scalarAnswerSchema = z.union([z.string().max(100), z.number().finite(), z.boolean(), z.null()]);
const compatibilitySchema = z
  .record(z.string().trim().min(1).max(60), scalarAnswerSchema)
  .refine((value) => Object.keys(value).length <= 20, "Compatibility can contain at most 20 answers.");
const needTagsSchema = z
  .array(z.string().trim().min(1).max(60))
  .max(12)
  .refine((tags) => new Set(tags.map((tag) => tag.toLowerCase())).size === tags.length, {
    message: "Need tags must be unique.",
  });
const labelPrefixSchema = z
  .string()
  .trim()
  .min(2)
  .max(80)
  .regex(/^[\p{L}\p{N}][\p{L}\p{N} ._&()'\/-]*$/u, "Label prefix contains unsupported characters.");

export const actorContextSchema = z.object({
  userId: idSchema,
  organizationId: idSchema,
  role: z.enum(USER_ROLES),
});

export const signupCorporateSchema = z.object({
  organizationName: z.string().trim().min(2).max(120),
  email: z.string().trim().toLowerCase().email().max(254),
  password: strongPasswordSchema,
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(1).max(128),
});

const invoiceUploadSchema = z.object({
  mimeType: z.literal("application/pdf"),
  bytes: z.instanceof(Uint8Array).refine((bytes) => bytes.byteLength > 0, "Invoice is empty.").refine(
    (bytes) => bytes.byteLength <= MAX_INVOICE_BYTES,
    `Invoice cannot exceed ${MAX_INVOICE_BYTES} bytes.`,
  ),
});

export const createBatchSchema = z.object({
  hsCode: z.string().regex(/^\d{6}$/, "HS code must contain exactly six digits."),
  // Accepted for legacy clients only. The service derives and stores the catalog category.
  category: categorySchema.optional(),
  quantity: z.number().int().positive().max(1_000_000),
  unitWeightKg: z.number().finite().positive().max(100_000),
  declaredValueCents: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  invoiceIdentifier: z.string().trim().min(1).max(120),
  authorityAttested: z.literal(true),
  invoice: invoiceUploadSchema,
});

export const submitBatchSchema = z.object({
  batchId: idSchema,
  complianceAttested: z.boolean().default(false),
});

export const createShipmentSchema = z.object({ batchId: idSchema });
export const advanceShipmentSchema = z.object({ shipmentId: idSchema });

export const createCampusAllocationSchema = z.object({
  batchId: idSchema,
  campusOrganizationId: idSchema,
  quantity: z.number().int().positive().max(500),
  idempotencyKey: idempotencyKeySchema,
});

export const receiveCampusAllocationSchema = z.object({
  allocationId: idSchema,
  labelPrefix: labelPrefixSchema.optional(),
  compatibility: compatibilitySchema.default({}),
  needTags: needTagsSchema.default([]),
  idempotencyKey: idempotencyKeySchema,
});

const evidenceUploadSchema = z.object({
  mimeType: z.enum(["image/jpeg", "image/png"]),
  bytes: z.instanceof(Uint8Array).refine((bytes) => bytes.byteLength > 0, "Evidence photo is empty.").refine(
    (bytes) => bytes.byteLength <= MAX_EVIDENCE_BYTES,
    `Evidence photo cannot exceed ${MAX_EVIDENCE_BYTES} bytes.`,
  ),
});

export const receiveBatchSchema = z
  .object({
    batchId: idSchema,
    grossWeightKg: z.number().finite().positive(),
    tareWeightKg: z.number().finite().nonnegative(),
    sampleScanCount: z.number().int().positive().max(1_000_000),
    evidencePhotos: z.array(evidenceUploadSchema).min(1).max(8),
  })
  .refine((input) => input.grossWeightKg > input.tareWeightKg, {
    message: "Gross weight must be greater than tare weight.",
    path: ["grossWeightKg"],
  });

export const certifyBatchSchema = z.object({
  batchId: idSchema,
  reviewReason: z.string().trim().min(8).max(500).optional(),
});

export const startKioskSessionSchema = z.object({
  campusOrganizationId: idSchema,
  mode: z.enum(KIOSK_MODES),
  requestedCategories: z.array(categorySchema).min(1).max(3),
  compatibility: compatibilitySchema,
  needTags: needTagsSchema.default([]),
  weeklyClaimToken: z.string().min(16).max(256).optional(),
});

export const kioskTokenSchema = z.string().min(32).max(256);
export const matchKioskSchema = z.object({ token: kioskTokenSchema });

export const checkoutSchema = z.object({
  token: kioskTokenSchema,
  itemId: idSchema,
  idempotencyKey: idempotencyKeySchema,
});

export const revealClaimSchema = z.object({
  token: kioskTokenSchema,
  claimId: idSchema,
  idempotencyKey: idempotencyKeySchema,
});

export const recordDecisionSchema = z.object({
  token: kioskTokenSchema,
  claimId: idSchema,
  decision: z.enum(REVEAL_DECISIONS),
  idempotencyKey: idempotencyKeySchema,
});

export const recordSurveySchema = z.object({
  token: kioskTokenSchema,
  claimId: idSchema,
  displacementAnswer: z.enum(DISPLACEMENT_ANSWERS),
  followUpOutcome: z.enum(FOLLOW_UP_OUTCOMES),
  idempotencyKey: idempotencyKeySchema,
});

export const dropBackSchema = z.object({
  token: kioskTokenSchema,
  claimId: idSchema,
  idempotencyKey: idempotencyKeySchema,
});

export type SignupCorporateInput = z.infer<typeof signupCorporateSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type CreateBatchInput = z.infer<typeof createBatchSchema>;
export type SubmitBatchInput = z.input<typeof submitBatchSchema>;
export type CreateShipmentInput = z.infer<typeof createShipmentSchema>;
export type AdvanceShipmentInput = z.infer<typeof advanceShipmentSchema>;
export type CreateCampusAllocationInput = z.infer<typeof createCampusAllocationSchema>;
export type ReceiveCampusAllocationInput = z.input<typeof receiveCampusAllocationSchema>;
export type ReceiveBatchInput = z.infer<typeof receiveBatchSchema>;
export type CertifyBatchInput = z.infer<typeof certifyBatchSchema>;
export type StartKioskSessionInput = z.input<typeof startKioskSessionSchema>;
export type CheckoutInput = z.infer<typeof checkoutSchema>;
export type RevealClaimInput = z.infer<typeof revealClaimSchema>;
export type RecordDecisionInput = z.infer<typeof recordDecisionSchema>;
export type RecordSurveyInput = z.infer<typeof recordSurveySchema>;
export type DropBackInput = z.infer<typeof dropBackSchema>;
