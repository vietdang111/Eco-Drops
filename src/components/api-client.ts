import type { CertificateExport } from "./ecodrops-types";

const API_ROOT = "/api/v1";
const REQUEST_TIMEOUT_MS = 15_000;

interface ErrorEnvelope {
  error?: {
    code?: string;
    message?: string;
    details?: unknown;
  };
}

interface SuccessEnvelope<T> {
  data: T;
}

export class ApiClientError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = "ApiClientError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

async function errorFromResponse(response: Response): Promise<ApiClientError> {
  let payload: ErrorEnvelope = {};
  try {
    payload = (await response.json()) as ErrorEnvelope;
  } catch {
    // Preserve a useful fallback when a proxy or runtime returns a non-JSON error.
  }
  return new ApiClientError(
    response.status,
    payload.error?.code ?? "REQUEST_FAILED",
    payload.error?.message ?? `Request failed with status ${response.status}.`,
    payload.error?.details,
  );
}

export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  if (init.body && !(init.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const timeoutController = new AbortController();
  const timeout = window.setTimeout(() => timeoutController.abort(), REQUEST_TIMEOUT_MS);
  const signal = init.signal
    ? AbortSignal.any([init.signal, timeoutController.signal])
    : timeoutController.signal;

  let response: Response;
  try {
    response = await fetch(`${API_ROOT}${path}`, {
      ...init,
      headers,
      signal,
      credentials: "include",
      cache: "no-store",
    });
  } catch (error) {
    if (timeoutController.signal.aborted) {
      throw new ApiClientError(408, "REQUEST_TIMEOUT", "The request took too long. Please try again.");
    }
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new ApiClientError(0, "NETWORK_ERROR", "EcoDrops could not reach the server. Please try again.");
  } finally {
    window.clearTimeout(timeout);
  }

  if (!response.ok) throw await errorFromResponse(response);
  const envelope = (await response.json()) as SuccessEnvelope<T>;
  return envelope.data;
}

export function postJson<T>(path: string, body?: unknown, headers?: HeadersInit): Promise<T> {
  return apiRequest<T>(path, {
    method: "POST",
    body: body === undefined ? undefined : JSON.stringify(body),
    headers,
  });
}

export function idempotencyKey(operation: string): string {
  return `ecodrops-${operation}-${crypto.randomUUID()}`;
}

function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export async function downloadCertificateJson(recordId: string): Promise<void> {
  const certificate = await apiRequest<CertificateExport>(`/certificates/${encodeURIComponent(recordId)}`);
  saveBlob(
    new Blob([JSON.stringify(certificate, null, 2)], { type: "application/json" }),
    `ecodrops-${recordId}.json`,
  );
}

export async function downloadCertificatePdf(recordId: string): Promise<void> {
  const response = await fetch(`${API_ROOT}/certificates/${encodeURIComponent(recordId)}.pdf`, {
    credentials: "include",
    cache: "no-store",
    headers: { Accept: "application/pdf" },
  });
  if (!response.ok) throw await errorFromResponse(response);
  saveBlob(await response.blob(), `ecodrops-${recordId}.pdf`);
}

export function messageForError(error: unknown): string {
  if (error instanceof ApiClientError) return error.message;
  if (error instanceof Error) return error.message;
  return "Something went wrong. Please try again.";
}
