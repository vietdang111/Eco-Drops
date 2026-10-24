import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import {
  SESSION_COOKIE_NAME,
  type SessionCookieDescriptor,
  type SessionIdentity,
} from "./auth";
import type { CertificateExport, JsonValue } from "./domain";
import { DomainError, toErrorEnvelope } from "./errors";
import {
  MAX_EVIDENCE_BYTES,
  MAX_INVOICE_BYTES,
  type CreateBatchInput,
  type ReceiveBatchInput,
} from "./schemas";
import {
  assertSameOrigin,
  type AuthenticationResult,
  type EcoDropsService,
} from "./service";

const JSON_CONTENT_TYPE = /^application\/(?:[a-z0-9!#$&^_.+-]+\+)?json(?:\s*;|$)/i;
const PDF_CONTENT_TYPE = "application/pdf";
const SAMPLE_INVOICE_TITLE = "EcoDrops Synthetic Sample Invoice DEMO-INV-2026-0042";
const MULTIPART_CONTENT_TYPE = /^multipart\/form-data(?:\s*;|$)/i;
const SYNTHETIC_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

const SECURITY_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
  "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
} as const;

export type UploadSource = "UPLOADED" | "SYNTHETIC_DEMO";

export interface ParsedBatchRequest {
  input: CreateBatchInput;
  invoiceSource: UploadSource;
}

export interface ParsedReceivingRequest {
  input: ReceiveBatchInput;
  evidenceSource: UploadSource;
}

export function jsonData(data: unknown, status = 200): NextResponse {
  return NextResponse.json(
    { data },
    { status, headers: { ...SECURITY_HEADERS, Vary: "Cookie, Origin" } },
  );
}

export function jsonError(error: unknown): NextResponse {
  if (
    error instanceof Error &&
    "code" in error &&
    typeof error.code === "string" &&
    (error.code.startsWith("SQLITE_BUSY") || error.code.startsWith("SQLITE_LOCKED"))
  ) {
    return NextResponse.json(
      {
        error: {
          code: "TEMPORARILY_UNAVAILABLE",
          message: "EcoDrops is finishing another update. Please retry in a moment.",
        },
      },
      {
        status: 503,
        headers: { ...SECURITY_HEADERS, "Retry-After": "1", Vary: "Cookie, Origin" },
      },
    );
  }

  const status = error instanceof DomainError ? error.httpStatus : 500;
  return NextResponse.json(
    toErrorEnvelope(error),
    { status, headers: { ...SECURITY_HEADERS, Vary: "Cookie, Origin" } },
  );
}

export function jsonNotFound(): NextResponse {
  return NextResponse.json(
    { error: { code: "NOT_FOUND", message: "API route was not found." } },
    { status: 404, headers: SECURITY_HEADERS },
  );
}

export function jsonMethodNotAllowed(allowedMethods: readonly string[]): NextResponse {
  return NextResponse.json(
    { error: { code: "METHOD_NOT_ALLOWED", message: "HTTP method is not allowed for this route." } },
    {
      status: 405,
      headers: { ...SECURITY_HEADERS, Allow: allowedMethods.join(", ") },
    },
  );
}

export function requireSession(request: NextRequest, service: EcoDropsService): SessionIdentity {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!token) throw new DomainError("AUTHENTICATION_REQUIRED", "A valid session is required.");
  return service.authenticate(token);
}

export function requireSessionToken(request: NextRequest): string {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!token) throw new DomainError("AUTHENTICATION_REQUIRED", "A valid session is required.");
  return token;
}

export function requireSameOrigin(request: NextRequest, applicationOrigin: string): void {
  assertSameOrigin(request.headers.get("origin"), applicationOrigin);
}

export function authenticationData(result: AuthenticationResult): {
  user: AuthenticationResult["user"];
  sessionId: string;
  expiresAt: string;
} {
  return { user: result.user, sessionId: result.sessionId, expiresAt: result.expiresAt };
}

export function setSessionCookie(
  response: NextResponse,
  cookie: SessionCookieDescriptor,
): NextResponse {
  response.cookies.set(cookie.name, cookie.value, {
    httpOnly: cookie.httpOnly,
    sameSite: cookie.sameSite,
    secure: cookie.secure,
    path: cookie.path,
    maxAge: cookie.maxAge,
  });
  return response;
}

export function clearSessionCookie(response: NextResponse): NextResponse {
  response.cookies.set(SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
    expires: new Date(0),
  });
  return response;
}

export async function readJsonObject<T extends object = Record<string, unknown>>(
  request: NextRequest,
  options: { allowEmpty?: boolean } = {},
): Promise<T> {
  const contentType = request.headers.get("content-type") ?? "";
  const text = await request.text();
  if (!text.trim()) {
    if (options.allowEmpty) return {} as T;
    throw new DomainError("INVALID_INPUT", "Request body must contain a JSON object.");
  }
  if (!JSON_CONTENT_TYPE.test(contentType)) {
    throw new DomainError("INVALID_INPUT", "Content-Type must be application/json.");
  }

  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new DomainError("INVALID_INPUT", "Request body contains malformed JSON.");
  }
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new DomainError("INVALID_INPUT", "Request body must contain a JSON object.");
  }
  return value as T;
}

export function requireIdempotencyKey(request: NextRequest): string {
  const key = request.headers.get("idempotency-key")?.trim();
  if (!key) {
    throw new DomainError("INVALID_INPUT", "An Idempotency-Key header is required.");
  }
  return key;
}

export function requireIdentifier(value: string | undefined, label: string): string {
  const identifier = value?.trim();
  if (!identifier || identifier.length > 128) {
    throw new DomainError("INVALID_INPUT", `${label} is invalid.`);
  }
  return identifier;
}

function requiredString(value: unknown, name: string): string {
  if (typeof value !== "string") {
    throw new DomainError("INVALID_INPUT", `${name} must be a string.`);
  }
  return value;
}

function requiredNumber(value: unknown, name: string): number {
  const number = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  if (!Number.isFinite(number)) {
    throw new DomainError("INVALID_INPUT", `${name} must be a finite number.`);
  }
  return number;
}

function booleanValue(value: unknown): boolean {
  return value === true || value === "true" || value === "1" || value === "on";
}

function isMultipart(request: NextRequest): boolean {
  return MULTIPART_CONTENT_TYPE.test(request.headers.get("content-type") ?? "");
}

function isFile(value: FormDataEntryValue | null): value is File {
  return value !== null && typeof value !== "string" && typeof value.arrayBuffer === "function";
}

async function readFormData(request: NextRequest): Promise<FormData> {
  try {
    return await request.formData();
  } catch {
    throw new DomainError("INVALID_INPUT", "Request body contains malformed multipart data.");
  }
}

async function createSyntheticInvoice(seed: string): Promise<Uint8Array<ArrayBuffer>> {
  const fingerprint = createHash("sha256").update(seed).digest("hex").slice(0, 24);
  const pdf = await PDFDocument.create();
  const fixedDate = new Date("2000-01-01T00:00:00.000Z");
  pdf.setTitle("Synthetic EcoDrops Demo Invoice");
  pdf.setAuthor("EcoDrops synthetic demo generator");
  pdf.setSubject("Synthetic demonstration input; not a supplier document");
  pdf.setCreationDate(fixedDate);
  pdf.setModificationDate(fixedDate);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const page = pdf.addPage([612, 792]);
  page.drawText("SYNTHETIC DEMO INVOICE", {
    x: 54,
    y: 710,
    size: 22,
    font: bold,
    color: rgb(0.7, 0.08, 0.08),
  });
  page.drawText("Built in for local EcoDrops workflow demonstrations.", {
    x: 54,
    y: 670,
    size: 12,
    font,
  });
  page.drawText("This is not a supplier document and has not been authenticated.", {
    x: 54,
    y: 648,
    size: 12,
    font,
  });
  page.drawText(`Synthetic reference: ${fingerprint}`, { x: 54, y: 610, size: 11, font });
  return Uint8Array.from(await pdf.save({ useObjectStreams: false }));
}

async function invoiceBytes(
  upload: FormDataEntryValue | null,
  synthetic: boolean,
  demoMode: boolean,
  syntheticSeed: string,
): Promise<{ bytes: Uint8Array<ArrayBuffer>; source: UploadSource }> {
  if (isFile(upload)) {
    if (synthetic) {
      throw new DomainError("INVALID_INPUT", "Choose either an uploaded invoice or the synthetic demo invoice.");
    }
    if (upload.type !== PDF_CONTENT_TYPE) {
      throw new DomainError("INVALID_INPUT", "Invoice upload must use application/pdf.");
    }
    if (upload.size < 1 || upload.size > MAX_INVOICE_BYTES) {
      throw new DomainError("INVALID_INPUT", `Invoice must contain 1 to ${MAX_INVOICE_BYTES} bytes.`);
    }
    return { bytes: new Uint8Array(await upload.arrayBuffer()), source: "UPLOADED" };
  }
  if (!synthetic) {
    throw new DomainError("INVALID_INPUT", "An invoice file or syntheticInvoice=true is required.");
  }
  if (!demoMode) {
    throw new DomainError("DEMO_MODE_DISABLED", "Synthetic demo invoices are unavailable outside demo mode.");
  }
  return { bytes: await createSyntheticInvoice(syntheticSeed), source: "SYNTHETIC_DEMO" };
}

async function assertSyntheticSampleInvoice(
  bytes: Uint8Array,
  values: {
    hsCode: string;
    category?: string;
    quantity: number;
    unitWeightKg: number;
    declaredValueCents: number;
    invoiceIdentifier: string;
  },
): Promise<void> {
  let title: string | undefined;
  try {
    const pdf = await PDFDocument.load(bytes, { ignoreEncryption: true });
    title = pdf.getTitle();
  } catch {
    throw new DomainError("INVALID_INPUT", "The bundled sample invoice is not a readable PDF.");
  }

  if (title !== SAMPLE_INVOICE_TITLE) {
    throw new DomainError("INVALID_INPUT", "The uploaded file is not the bundled EcoDrops sample invoice.");
  }

  const expected = {
    hsCode: "850440",
    category: "electronics",
    quantity: 80,
    unitWeightKg: 0.22,
    declaredValueCents: 240_000,
    invoiceIdentifier: "DEMO-INV-2026-0042",
  };
  const mismatches = Object.entries(expected)
    .filter(([key, value]) => values[key as keyof typeof values] !== value)
    .map(([key]) => key);
  if (mismatches.length > 0) {
    throw new DomainError(
      "INVALID_INPUT",
      "The sample invoice values no longer match the PDF.",
      { mismatches, expected },
    );
  }
}

export async function parseBatchRequest(
  request: NextRequest,
  options: { demoMode: boolean; syntheticSeed: string },
): Promise<ParsedBatchRequest> {
  let fields: Record<string, unknown>;
  let upload: FormDataEntryValue | null = null;

  if (isMultipart(request)) {
    const form = await readFormData(request);
    fields = Object.fromEntries(form.entries());
    upload = form.get("invoice");
  } else {
    fields = await readJsonObject(request);
  }

  const authorityAttested = booleanValue(fields.authorityAttested);
  if (!authorityAttested) {
    throw new DomainError("INVALID_INPUT", "authorityAttested must be true.");
  }
  const hsCode = requiredString(fields.hsCode, "hsCode");
  const category = fields.category === undefined
    ? undefined
    : requiredString(fields.category, "category");
  const quantity = requiredNumber(fields.quantity, "quantity");
  const unitWeightKg = requiredNumber(fields.unitWeightKg, "unitWeightKg");
  const declaredValueCents = requiredNumber(fields.declaredValueCents, "declaredValueCents");
  const invoiceIdentifier = requiredString(fields.invoiceIdentifier, "invoiceIdentifier");
  const synthetic = booleanValue(fields.syntheticInvoice);
  const syntheticSample = booleanValue(fields.syntheticSample);
  if (syntheticSample && !options.demoMode) {
    throw new DomainError("DEMO_MODE_DISABLED", "The bundled sample invoice is unavailable outside demo mode.");
  }
  const invoice = await invoiceBytes(
    upload,
    synthetic,
    options.demoMode,
    `${options.syntheticSeed}:${invoiceIdentifier}`,
  );

  if (syntheticSample) {
    if (invoice.source !== "UPLOADED") {
      throw new DomainError("INVALID_INPUT", "The bundled sample must be submitted as a PDF upload.");
    }
    await assertSyntheticSampleInvoice(invoice.bytes, {
      hsCode,
      category,
      quantity,
      unitWeightKg,
      declaredValueCents,
      invoiceIdentifier,
    });
  }

  return {
    input: {
      hsCode,
      category,
      quantity,
      unitWeightKg,
      declaredValueCents,
      invoiceIdentifier,
      authorityAttested: true,
      invoice: { mimeType: PDF_CONTENT_TYPE, bytes: invoice.bytes },
    },
    invoiceSource: syntheticSample ? "SYNTHETIC_DEMO" : invoice.source,
  };
}

async function evidencePhotos(
  uploads: FormDataEntryValue[],
  synthetic: boolean,
  demoMode: boolean,
): Promise<{
  photos: ReceiveBatchInput["evidencePhotos"];
  source: UploadSource;
}> {
  if (uploads.length > 0) {
    if (synthetic) {
      throw new DomainError("INVALID_INPUT", "Choose either uploaded evidence or synthetic demo evidence.");
    }
    const photos: ReceiveBatchInput["evidencePhotos"] = [];
    for (const upload of uploads) {
      if (!isFile(upload)) {
        throw new DomainError("INVALID_INPUT", "Every evidence entry must be an image file.");
      }
      if (upload.type !== "image/jpeg" && upload.type !== "image/png") {
        throw new DomainError("INVALID_INPUT", "Evidence must use image/jpeg or image/png.");
      }
      if (upload.size < 1 || upload.size > MAX_EVIDENCE_BYTES) {
        throw new DomainError("INVALID_INPUT", `Each evidence image must contain 1 to ${MAX_EVIDENCE_BYTES} bytes.`);
      }
      photos.push({
        mimeType: upload.type,
        bytes: new Uint8Array(await upload.arrayBuffer()),
      });
    }
    return { photos, source: "UPLOADED" };
  }
  if (!synthetic) {
    throw new DomainError("INVALID_INPUT", "Evidence images or syntheticEvidence=true are required.");
  }
  if (!demoMode) {
    throw new DomainError("DEMO_MODE_DISABLED", "Synthetic receiving evidence is unavailable outside demo mode.");
  }
  return {
    photos: [{ mimeType: "image/png", bytes: new Uint8Array(SYNTHETIC_PNG) }],
    source: "SYNTHETIC_DEMO",
  };
}

export async function parseReceivingRequest(
  request: NextRequest,
  options: { demoMode: boolean },
): Promise<ParsedReceivingRequest> {
  let fields: Record<string, unknown>;
  let uploads: FormDataEntryValue[] = [];

  if (isMultipart(request)) {
    const form = await readFormData(request);
    fields = Object.fromEntries(form.entries());
    uploads = form.getAll("evidence");
    if (uploads.length === 0) uploads = form.getAll("evidencePhotos");
  } else {
    fields = await readJsonObject(request);
  }

  const evidence = await evidencePhotos(
    uploads,
    booleanValue(fields.syntheticEvidence),
    options.demoMode,
  );
  return {
    input: {
      batchId: requiredString(fields.batchId, "batchId"),
      grossWeightKg: requiredNumber(fields.grossWeightKg, "grossWeightKg"),
      tareWeightKg: requiredNumber(fields.tareWeightKg, "tareWeightKg"),
      sampleScanCount: requiredNumber(fields.sampleScanCount, "sampleScanCount"),
      evidencePhotos: evidence.photos,
    },
    evidenceSource: evidence.source,
  };
}

function jsonRecord(value: JsonValue | undefined): Record<string, JsonValue> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, JsonValue>
    : null;
}

function printable(value: JsonValue | undefined): string {
  if (value === undefined || value === null) return "not available";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function pdfSafe(text: string): string {
  return text.replace(/[^\x20-\x7E]/g, "?");
}

function wrapLine(text: string, width = 88): string[] {
  const words = pdfSafe(text).split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    if (!word) continue;
    if (!line) line = word;
    else if (`${line} ${word}`.length <= width) line += ` ${word}`;
    else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines.length > 0 ? lines : [""];
}

export async function createCertificatePdf(
  certificate: CertificateExport,
  publicVerificationUrl: string,
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`EcoDrops impact record ${certificate.recordId}`);
  pdf.setAuthor("EcoDrops");
  pdf.setSubject("Estimated avoided emissions record");
  pdf.setProducer("EcoDrops using pdf-lib");
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let page = pdf.addPage([595.28, 841.89]);
  let y = 790;

  const draw = (text: string, options: { bold?: boolean; size?: number; gap?: number } = {}): void => {
    const size = options.size ?? 10;
    const gap = options.gap ?? 5;
    for (const line of wrapLine(text, size >= 16 ? 62 : 88)) {
      if (y < 55) {
        page = pdf.addPage([595.28, 841.89]);
        y = 790;
      }
      page.drawText(line, {
        x: 48,
        y,
        size,
        font: options.bold ? bold : font,
        color: rgb(0.08, 0.12, 0.11),
      });
      y -= size + gap;
    }
  };

  draw("EcoDrops Certified Impact Record", { bold: true, size: 20, gap: 8 });
  draw("Estimated avoided emissions", { bold: true, size: 14, gap: 8 });
  draw(`Record ID: ${certificate.recordId}`);
  draw(`Batch ID: ${certificate.batchId}`);
  draw(`Issue date: ${certificate.issueDate}`);
  draw(`Status: ${certificate.status}`);
  draw(`Audit hash: ${certificate.auditHash}`);
  y -= 8;
  draw("Estimated avoided emissions (kgCO2e)", { bold: true, size: 12 });
  draw(`Low: ${certificate.lowKgCO2e}`);
  draw(`Base: ${certificate.baseKgCO2e}`);
  draw(`High: ${certificate.highKgCO2e}`);

  const snapshot = jsonRecord(certificate.snapshot);
  const sampleSizes = jsonRecord(snapshot?.sampleSizes);
  y -= 8;
  draw("Snapshot inputs and methodology", { bold: true, size: 12 });
  draw(`Eligible units: ${printable(snapshot?.eligibleUnits)}`);
  draw(`Unit weight (kg): ${printable(snapshot?.unitWeightKg)}`);
  draw(`Methodology source: ${printable(snapshot?.methodologySource)}`);
  draw(`Methodology version: ${certificate.methodologyVersion}`);
  draw(`Factor version: ${printable(snapshot?.factorVersion)}`);
  draw(`Formula version: ${printable(snapshot?.formulaVersion)}`);
  draw(`Formula: ${printable(snapshot?.formula)}`);
  draw(`Displacement sample size: ${printable(sampleSizes?.displacement)}`);
  draw(`Retention sample size: ${printable(sampleSizes?.retention)}`);

  const scenarios = jsonRecord(snapshot?.scenarios);
  for (const scenarioName of ["low", "base", "high"] as const) {
    const scenario = jsonRecord(scenarios?.[scenarioName]);
    if (!scenario) continue;
    y -= 5;
    draw(`${scenarioName.toUpperCase()} scenario assumptions`, { bold: true });
    draw(`Factor (kgCO2e/kg): ${printable(scenario.factorKgCO2ePerKg)}`);
    draw(`Displacement rate: ${printable(scenario.displacementRate)}`);
    draw(`Retention rate: ${printable(scenario.retentionRate)}`);
    draw(`Handling (kgCO2e/item): ${printable(scenario.handlingKgCO2ePerItem)}`);
  }

  y -= 8;
  draw(`Public verification: ${publicVerificationUrl}`, { bold: true });
  y -= 5;
  draw(certificate.disclaimer);
  draw("Uploaded documents are consistency-checked and physically reconciled; they are not authenticated by this record.");
  return pdf.save();
}

export function pdfResponse(bytes: Uint8Array, recordId: string): NextResponse {
  const safeRecordId = recordId.replace(/[^A-Za-z0-9_-]/g, "-");
  return new NextResponse(Buffer.from(bytes), {
    status: 200,
    headers: {
      ...SECURITY_HEADERS,
      "Content-Type": PDF_CONTENT_TYPE,
      "Content-Disposition": `attachment; filename="ecodrops-${safeRecordId}.pdf"`,
      Vary: "Cookie, Origin",
    },
  });
}
