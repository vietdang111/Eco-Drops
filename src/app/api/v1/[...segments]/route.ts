import type { NextRequest } from "next/server";
import { getServerContext, type EcoDropsServerContext } from "@/lib/bootstrap";
import {
  authenticationData,
  clearSessionCookie,
  createCertificatePdf,
  jsonData,
  jsonError,
  jsonMethodNotAllowed,
  jsonNotFound,
  parseBatchRequest,
  parseReceivingRequest,
  pdfResponse,
  readJsonObject,
  requireIdempotencyKey,
  requireIdentifier,
  requireSameOrigin,
  requireSession,
  requireSessionToken,
  setSessionCookie,
} from "@/lib/server-context";
import type {
  CertifyBatchInput,
  CheckoutInput,
  CreateCampusAllocationInput,
  CreateShipmentInput,
  DropBackInput,
  LoginInput,
  ReceiveCampusAllocationInput,
  RecordDecisionInput,
  RecordSurveyInput,
  RevealClaimInput,
  SignupCorporateInput,
  StartKioskSessionInput,
  SubmitBatchInput,
} from "@/lib/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ segments: string[] }>;
}

type SupportedMethod = "GET" | "POST";

function exact(segments: readonly string[], ...expected: string[]): boolean {
  return segments.length === expected.length && expected.every((part, index) => segments[index] === part);
}

function methodsForRoute(segments: readonly string[]): readonly SupportedMethod[] | null {
  if (exact(segments, "batches")) return ["GET", "POST"];

  const staticRoutes: Array<{ path: string[]; methods: SupportedMethod[] }> = [
    { path: ["auth", "signup"], methods: ["POST"] },
    { path: ["auth", "login"], methods: ["POST"] },
    { path: ["auth", "logout"], methods: ["POST"] },
    { path: ["auth", "session"], methods: ["GET"] },
    { path: ["dashboard"], methods: ["GET"] },
    { path: ["workspace"], methods: ["GET"] },
    { path: ["audit", "verify"], methods: ["GET"] },
    { path: ["methodology"], methods: ["GET"] },
    { path: ["allocations"], methods: ["GET"] },
    { path: ["campuses"], methods: ["GET"] },
    { path: ["shipments"], methods: ["POST"] },
    { path: ["receivings"], methods: ["POST"] },
    { path: ["demo", "reset"], methods: ["POST"] },
    { path: ["admin", "reset"], methods: ["POST"] },
    { path: ["kiosk", "sessions"], methods: ["POST"] },
    { path: ["kiosk", "matches"], methods: ["POST"] },
    { path: ["kiosk", "checkout"], methods: ["POST"] },
    { path: ["kiosk", "reveal"], methods: ["POST"] },
    { path: ["kiosk", "decision"], methods: ["POST"] },
    { path: ["kiosk", "survey"], methods: ["POST"] },
    { path: ["kiosk", "drop-back"], methods: ["POST"] },
  ];
  const staticRoute = staticRoutes.find((route) => exact(segments, ...route.path));
  if (staticRoute) return staticRoute.methods;

  if (segments[0] === "batches" && segments.length === 2) return ["GET"];
  if (segments[0] === "batches" && segments.length === 3) {
    if (segments[2] === "impact") return ["GET"];
    if (segments[2] === "submit" || segments[2] === "certify" || segments[2] === "allocations") {
      return ["POST"];
    }
  }
  if (segments[0] === "catalog" && segments[1] === "hs-codes" && segments.length === 3) {
    return ["GET"];
  }
  if (segments[0] === "allocations" && segments.length === 2) return ["GET"];
  if (segments[0] === "allocations" && segments.length === 3 && segments[2] === "receive") {
    return ["POST"];
  }
  if (
    segments.length === 4 &&
    segments[0] === "demo" &&
    segments[1] === "shipments" &&
    segments[3] === "advance"
  ) {
    return ["POST"];
  }
  if (segments[0] === "certificates" && segments.length === 2) return ["GET"];
  if (segments[0] === "certificates" && segments.length === 3 && segments[2] === "pdf") {
    return ["GET"];
  }
  if (segments[0] === "public" && segments[1] === "certificates" && segments.length === 3) {
    return ["GET"];
  }
  return null;
}

function requestedLimit(request: NextRequest, fallback: number): number {
  const raw = request.nextUrl.searchParams.get("limit");
  return raw === null ? fallback : Number(raw);
}

async function getResponse(
  request: NextRequest,
  segments: readonly string[],
  context: EcoDropsServerContext,
): Promise<Response> {
  const { service, readModels } = context;

  if (exact(segments, "auth", "session")) {
    const identity = requireSession(request, service);
    return jsonData({
      user: identity.user,
      sessionId: identity.sessionId,
      expiresAt: identity.expiresAt,
    });
  }

  if (exact(segments, "workspace")) {
    const identity = requireSession(request, service);
    const dashboard = readModels.getRoleDashboard(identity.actor);
    return jsonData({
      user: identity.user,
      sessionId: identity.sessionId,
      expiresAt: identity.expiresAt,
      dashboard,
      batches: readModels.listBatches(identity.actor, 100),
      allocations: dashboard.allocations,
      campuses: dashboard.campuses,
    });
  }

  if (exact(segments, "dashboard")) {
    const identity = requireSession(request, service);
    return jsonData(readModels.getRoleDashboard(identity.actor));
  }

  if (exact(segments, "batches")) {
    const identity = requireSession(request, service);
    return jsonData({ batches: readModels.listBatches(identity.actor, requestedLimit(request, 50)) });
  }

  if (segments[0] === "batches" && segments.length === 2) {
    const identity = requireSession(request, service);
    const batchId = requireIdentifier(segments[1], "Batch ID");
    return jsonData(readModels.getBatchDetail(identity.actor, batchId));
  }

  if (segments[0] === "batches" && segments[2] === "impact" && segments.length === 3) {
    const identity = requireSession(request, service);
    const batchId = requireIdentifier(segments[1], "Batch ID");
    return jsonData(service.getBatchImpact(identity.actor, batchId));
  }

  if (exact(segments, "audit", "verify")) {
    const identity = requireSession(request, service);
    return jsonData(service.verifyAudit(identity.actor));
  }

  if (exact(segments, "methodology")) {
    const identity = requireSession(request, service);
    return jsonData(readModels.getMethodology(identity.actor));
  }

  if (segments[0] === "catalog" && segments[1] === "hs-codes" && segments.length === 3) {
    const identity = requireSession(request, service);
    const hsCode = requireIdentifier(segments[2], "HS code");
    return jsonData(service.getHsCodePolicy(identity.actor, hsCode));
  }

  if (exact(segments, "allocations")) {
    const identity = requireSession(request, service);
    return jsonData({
      allocations: readModels.listAllocations(identity.actor, requestedLimit(request, 100)),
    });
  }

  if (segments[0] === "allocations" && segments.length === 2) {
    const identity = requireSession(request, service);
    const allocationId = requireIdentifier(segments[1], "Allocation ID");
    return jsonData(readModels.getAllocation(identity.actor, allocationId));
  }

  if (exact(segments, "campuses")) {
    const identity = requireSession(request, service);
    return jsonData({ campuses: readModels.listCampuses(identity.actor) });
  }

  if (segments[0] === "public" && segments[1] === "certificates" && segments.length === 3) {
    const recordId = requireIdentifier(segments[2], "Record ID");
    const record = service.getPublicCertificate(recordId);
    // Keep this explicit even though the service already allowlists the projection.
    return jsonData({
      recordId: record.recordId,
      issueDate: record.issueDate,
      status: record.status,
      methodologyVersion: record.methodologyVersion,
      auditHash: record.auditHash,
    });
  }

  if (segments[0] === "certificates" && segments.length >= 2) {
    const identity = requireSession(request, service);
    const suffixPdf = segments.length === 2 && segments[1]?.endsWith(".pdf");
    const rawRecordId = suffixPdf ? segments[1]?.slice(0, -4) : segments[1];
    const recordId = requireIdentifier(rawRecordId, "Record ID");
    const certificate = service.getCertificateExport(identity.actor, recordId);
    if (suffixPdf || (segments.length === 3 && segments[2] === "pdf")) {
      const verificationUrl = `${context.applicationOrigin}/verify/${encodeURIComponent(recordId)}`;
      return pdfResponse(await createCertificatePdf(certificate, verificationUrl), recordId);
    }
    return jsonData(certificate);
  }

  return jsonNotFound();
}

async function postResponse(
  request: NextRequest,
  segments: readonly string[],
  context: EcoDropsServerContext,
): Promise<Response> {
  const { service } = context;

  if (exact(segments, "auth", "signup")) {
    const input = await readJsonObject<SignupCorporateInput>(request);
    const result = await service.signupCorporate(input);
    return setSessionCookie(jsonData(authenticationData(result), 201), result.cookie);
  }

  if (exact(segments, "auth", "login")) {
    const input = await readJsonObject<LoginInput>(request);
    const result = await service.login(input);
    return setSessionCookie(jsonData(authenticationData(result)), result.cookie);
  }

  if (exact(segments, "auth", "logout")) {
    const token = requireSessionToken(request);
    service.logout(token);
    return clearSessionCookie(jsonData({ loggedOut: true }));
  }

  if (exact(segments, "batches")) {
    const identity = requireSession(request, service);
    const parsed = await parseBatchRequest(request, {
      demoMode: context.demoMode,
      syntheticSeed: `${identity.actor.organizationId}:${identity.actor.userId}`,
    });
    const batch = service.createBatch(identity.actor, parsed.input);
    return jsonData({
      ...batch,
      inputProvenance: {
        invoice: parsed.invoiceSource,
        clearlySynthetic: parsed.invoiceSource === "SYNTHETIC_DEMO",
      },
    }, 201);
  }

  if (segments[0] === "batches" && segments[2] === "submit" && segments.length === 3) {
    const identity = requireSession(request, service);
    const batchId = requireIdentifier(segments[1], "Batch ID");
    const body = await readJsonObject<Omit<SubmitBatchInput, "batchId">>(request, { allowEmpty: true });
    return jsonData(service.submitBatch(identity.actor, {
      batchId,
      complianceAttested: body.complianceAttested,
    }));
  }

  if (exact(segments, "shipments")) {
    const identity = requireSession(request, service);
    const input = await readJsonObject<CreateShipmentInput>(request);
    return jsonData(service.createShipment(identity.actor, input), 201);
  }

  if (
    segments.length === 4 &&
    segments[0] === "demo" &&
    segments[1] === "shipments" &&
    segments[3] === "advance"
  ) {
    const identity = requireSession(request, service);
    const shipmentId = requireIdentifier(segments[2], "Shipment ID");
    return jsonData(service.advanceShipmentSimulation(identity.actor, { shipmentId }));
  }

  if (exact(segments, "receivings")) {
    const identity = requireSession(request, service);
    const parsed = await parseReceivingRequest(request, { demoMode: context.demoMode });
    const receiving = service.receiveBatch(identity.actor, parsed.input);
    return jsonData({
      ...receiving,
      inputProvenance: {
        evidence: parsed.evidenceSource,
        clearlySynthetic: parsed.evidenceSource === "SYNTHETIC_DEMO",
        scale: context.demoMode ? "SIMULATED_DEMO" : "REPORTED_INPUT",
      },
    }, 201);
  }

  if (segments[0] === "batches" && segments[2] === "certify" && segments.length === 3) {
    const identity = requireSession(request, service);
    const batchId = requireIdentifier(segments[1], "Batch ID");
    const body = await readJsonObject<Omit<CertifyBatchInput, "batchId">>(request, { allowEmpty: true });
    return jsonData(service.certifyBatch(identity.actor, {
      batchId,
      reviewReason: body.reviewReason,
    }), 201);
  }

  if (segments[0] === "batches" && segments[2] === "allocations" && segments.length === 3) {
    const identity = requireSession(request, service);
    const batchId = requireIdentifier(segments[1], "Batch ID");
    const body = await readJsonObject<Omit<CreateCampusAllocationInput, "batchId" | "idempotencyKey">>(request);
    return jsonData(service.createCampusAllocation(identity.actor, {
      ...body,
      batchId,
      idempotencyKey: requireIdempotencyKey(request),
    }), 201);
  }

  if (segments[0] === "allocations" && segments[2] === "receive" && segments.length === 3) {
    const identity = requireSession(request, service);
    const allocationId = requireIdentifier(segments[1], "Allocation ID");
    const body = await readJsonObject<Omit<ReceiveCampusAllocationInput, "allocationId" | "idempotencyKey">>(request, {
      allowEmpty: true,
    });
    return jsonData(service.receiveCampusAllocation(identity.actor, {
      ...body,
      allocationId,
      idempotencyKey: requireIdempotencyKey(request),
    }), 201);
  }

  if (exact(segments, "demo", "reset") || exact(segments, "admin", "reset")) {
    const identity = requireSession(request, service);
    const result = await service.resetDemo(identity.actor);
    // Reset removes every old session, including the caller's session.
    return clearSessionCookie(jsonData(result));
  }

  if (exact(segments, "kiosk", "sessions")) {
    const input = await readJsonObject<StartKioskSessionInput>(request);
    return jsonData(service.startKioskSession(input), 201);
  }

  if (exact(segments, "kiosk", "matches")) {
    const input = await readJsonObject<{ token: string }>(request);
    return jsonData({ items: service.matchKioskItems(input) });
  }

  if (exact(segments, "kiosk", "checkout")) {
    const body = await readJsonObject<Omit<CheckoutInput, "idempotencyKey">>(request);
    return jsonData(service.checkoutKioskItem({
      ...body,
      idempotencyKey: requireIdempotencyKey(request),
    }), 201);
  }

  if (exact(segments, "kiosk", "reveal")) {
    const body = await readJsonObject<Omit<RevealClaimInput, "idempotencyKey">>(request);
    return jsonData(service.revealClaim({
      ...body,
      idempotencyKey: requireIdempotencyKey(request),
    }));
  }

  if (exact(segments, "kiosk", "decision")) {
    const body = await readJsonObject<Omit<RecordDecisionInput, "idempotencyKey">>(request);
    return jsonData(service.recordRevealDecision({
      ...body,
      idempotencyKey: requireIdempotencyKey(request),
    }));
  }

  if (exact(segments, "kiosk", "survey")) {
    const body = await readJsonObject<Omit<RecordSurveyInput, "idempotencyKey">>(request);
    return jsonData(service.recordOutcomeSurvey({
      ...body,
      idempotencyKey: requireIdempotencyKey(request),
    }));
  }

  if (exact(segments, "kiosk", "drop-back")) {
    const body = await readJsonObject<Omit<DropBackInput, "idempotencyKey">>(request);
    return jsonData(service.dropBackItem({
      ...body,
      idempotencyKey: requireIdempotencyKey(request),
    }));
  }

  return jsonNotFound();
}

async function handleRequest(request: NextRequest, routeContext: RouteContext): Promise<Response> {
  try {
    const { segments = [] } = await routeContext.params;
    const allowedMethods = methodsForRoute(segments);
    if (!allowedMethods) return jsonNotFound();
    if (!allowedMethods.includes(request.method as SupportedMethod)) {
      return jsonMethodNotAllowed(allowedMethods);
    }

    const context = await getServerContext();
    if (request.method === "POST") {
      requireSameOrigin(request, context.applicationOrigin);
      const response = await postResponse(request, segments, context);
      return response;
    }
    const response = await getResponse(request, segments, context);
    return response;
  } catch (error) {
    return jsonError(error);
  }
}

export const GET = handleRequest;
export const POST = handleRequest;
export const PUT = handleRequest;
export const PATCH = handleRequest;
export const DELETE = handleRequest;
export const OPTIONS = handleRequest;
