import { readFile } from "node:fs/promises";
import { NextRequest } from "next/server";
import { beforeAll, describe, expect, it } from "vitest";
import { getServerContext } from "../../src/lib/bootstrap";
import { GET, POST } from "../../src/app/api/v1/[...segments]/route";

const ORIGIN = "http://localhost:3000";

function routeContext(...segments: string[]) {
  return { params: Promise.resolve({ segments }) };
}

function getRequest(path: string, headers: HeadersInit = {}) {
  return new NextRequest(`${ORIGIN}/api/v1/${path}`, { headers });
}

function postRequest(path: string, body: unknown, headers: HeadersInit = {}) {
  return new NextRequest(`${ORIGIN}/api/v1/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: ORIGIN, ...headers },
    body: JSON.stringify(body),
  });
}

async function body(response: Response): Promise<Record<string, unknown>> {
  return response.json() as Promise<Record<string, unknown>>;
}

function currentIsoWeekKey(date = new Date()): string {
  const target = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = target.getUTCDay() || 7;
  target.setUTCDate(target.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((target.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${target.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

beforeAll(() => {
  process.env.DATABASE_PATH = ":memory:";
  process.env.DEMO_MODE = "true";
  process.env.NEXT_PUBLIC_APP_URL = ORIGIN;
});

describe("Next API error boundary", () => {
  it("serializes missing authentication as a 401 JSON envelope", async () => {
    const response = await GET(getRequest("auth/session"), routeContext("auth", "session"));

    expect(response.status).toBe(401);
    expect(await body(response)).toEqual({
      error: {
        code: "AUTHENTICATION_REQUIRED",
        message: "A valid session is required.",
      },
    });
  });

  it("serializes a missing public record as a 404 JSON envelope", async () => {
    const response = await GET(
      getRequest("public/certificates/ECD-MISSING"),
      routeContext("public", "certificates", "ECD-MISSING"),
    );

    expect(response.status).toBe(404);
    expect(await body(response)).toMatchObject({
      error: { code: "NOT_FOUND", message: "Public verification record was not found." },
    });
  });

  it("serializes same-origin validation failures as 400 rather than a bare 500", async () => {
    const response = await POST(
      postRequest("kiosk/matches", {}),
      routeContext("kiosk", "matches"),
    );

    expect(response.status).toBe(400);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(await body(response)).toMatchObject({ error: { code: "INVALID_INPUT" } });
  });

  it("creates a new isolated corporate workspace and secure session", async () => {
    const response = await POST(
      postRequest("auth/signup", {
        organizationName: "Route Test Circular",
        email: "route-test@demo.ecodrops.local",
        password: "RouteTest!2026",
      }),
      routeContext("auth", "signup"),
    );

    expect(response.status).toBe(201);
    expect(response.headers.get("set-cookie")).toContain("ecodrops_session=");
    expect(await body(response)).toMatchObject({
      data: {
        user: {
          email: "route-test@demo.ecodrops.local",
          organizationName: "Route Test Circular",
          role: "corp_user",
        },
      },
    });
  });

  it("returns a useful duplicate-email conflict for the seeded account", async () => {
    const response = await POST(
      postRequest("auth/signup", {
        organizationName: "Duplicate Demo Organization",
        email: "corp@demo.ecodrops.local",
        password: "DemoPass!2026",
      }),
      routeContext("auth", "signup"),
    );

    expect(response.status).toBe(409);
    expect(await body(response)).toEqual({
      error: {
        code: "DUPLICATE",
        message: "An account with this email already exists.",
      },
    });
  });

  it("accepts the committed sample PDF with its matching intake values", async () => {
    const loginResponse = await POST(
      postRequest("auth/login", {
        email: "corp@demo.ecodrops.local",
        password: "DemoPass!2026",
      }),
      routeContext("auth", "login"),
    );
    const cookie = loginResponse.headers.get("set-cookie")?.split(";", 1)[0];
    expect(loginResponse.status).toBe(200);
    expect(cookie).toBeTruthy();

    const pdf = await readFile(new URL("../../public/ecodrops-sample-invoice.pdf", import.meta.url));
    expect(pdf.subarray(0, 5).toString("ascii")).toBe("%PDF-");
    const form = new FormData();
    form.set("hsCode", "850440");
    form.set("category", "electronics");
    form.set("quantity", "80");
    form.set("unitWeightKg", "0.22");
    form.set("declaredValueCents", "240000");
    form.set("invoiceIdentifier", "DEMO-INV-2026-0042");
    form.set("authorityAttested", "true");
    form.set("syntheticSample", "true");
    form.set("invoice", new File([pdf], "ecodrops-sample-invoice.pdf", { type: "application/pdf" }));

    const request = new NextRequest(`${ORIGIN}/api/v1/batches`, {
      method: "POST",
      headers: { Origin: ORIGIN, Cookie: cookie ?? "" },
      body: form,
    });
    const response = await POST(request, routeContext("batches"));

    expect(response.status).toBe(201);
    expect(await body(response)).toMatchObject({
      data: {
        hsCode: "850440",
        category: "electronics",
        quantity: 80,
        unitWeightKg: 0.22,
        declaredValueCents: 240000,
        invoiceIdentifier: "DEMO-INV-2026-0042",
        status: "DRAFT",
        inputProvenance: { invoice: "SYNTHETIC_DEMO", clearlySynthetic: true },
      },
    });
  });

  it("returns a structured 422 when the three-claim demo cap is reached", async () => {
    const sessionResponse = await POST(
      postRequest("kiosk/sessions", {
        campusOrganizationId: "org-synthetic-campus",
        mode: "CATEGORY_KNOWN",
        requestedCategories: ["electronics"],
        compatibility: { connector: "usb-c" },
        needTags: ["coursework"],
        weeklyClaimToken: "api-route-cap-regression-token",
      }),
      routeContext("kiosk", "sessions"),
    );
    expect(sessionResponse.status).toBe(201);
    const sessionEnvelope = await body(sessionResponse) as {
      data: { sessionId: string; token: string; weeklyClaimCap: number };
    };
    expect(sessionEnvelope.data.weeklyClaimCap).toBe(3);

    const { db } = await getServerContext();
    const now = new Date().toISOString();
    for (let index = 0; index < 3; index += 1) {
      db.prepare(
        `INSERT INTO claims
          (id, kiosk_session_id, item_id, claim_method, status, week_key, created_at, updated_at)
         VALUES (?, ?, 'item-synthetic-002', 'SPONSORED_FREE', 'KEPT', ?, ?, ?)`,
      ).run(`api-cap-existing-${index}`, sessionEnvelope.data.sessionId, currentIsoWeekKey(), now, now);
    }

    const response = await POST(
      postRequest(
        "kiosk/checkout",
        { token: sessionEnvelope.data.token, itemId: "item-synthetic-001" },
        { "Idempotency-Key": "api-route-cap-checkout-0001" },
      ),
      routeContext("kiosk", "checkout"),
    );

    expect(response.status).toBe(422);
    expect(await body(response)).toMatchObject({
      error: {
        code: "BUSINESS_GATE_FAILED",
        details: { weeklyClaimCap: 3, weeklyClaimsUsed: 3, weeklyClaimsRemaining: 0 },
      },
    });
  });

  it("serves the protected public-safe HS lookup", async () => {
    const loginResponse = await POST(
      postRequest("auth/login", {
        email: "corp@demo.ecodrops.local",
        password: "DemoPass!2026",
      }),
      routeContext("auth", "login"),
    );
    const cookie = loginResponse.headers.get("set-cookie")?.split(";", 1)[0] ?? "";
    const response = await GET(
      getRequest("catalog/hs-codes/850440", { Cookie: cookie }),
      routeContext("catalog", "hs-codes", "850440"),
    );

    expect(response.status).toBe(200);
    expect(await body(response)).toMatchObject({
      data: {
        hsCode: "850440",
        category: "electronics",
        baselineRisk: "YELLOW",
        policyDecision: "REVIEW",
        requiresComplianceAttestation: true,
        policyVersion: "hs-policy-2026.1",
      },
    });
  });

  it("allocates through the API, exposes campus workspace visibility, and receives idempotently", async () => {
    const warehouseLogin = await POST(
      postRequest("auth/login", {
        email: "warehouse@demo.ecodrops.local",
        password: "DemoPass!2026",
      }),
      routeContext("auth", "login"),
    );
    const warehouseCookie = warehouseLogin.headers.get("set-cookie")?.split(";", 1)[0] ?? "";
    const campuses = await GET(
      getRequest("campuses", { Cookie: warehouseCookie }),
      routeContext("campuses"),
    );
    expect(campuses.status).toBe(200);
    expect(await body(campuses)).toMatchObject({
      data: { campuses: [{ id: "org-synthetic-campus", name: "Synthetic Demo Campus" }] },
    });

    const allocationRequest = postRequest(
      "batches/batch-synthetic-certified/allocations",
      { campusOrganizationId: "org-synthetic-campus", quantity: 1 },
      { Cookie: warehouseCookie, "Idempotency-Key": "api-allocation-0001" },
    );
    const allocated = await POST(
      allocationRequest,
      routeContext("batches", "batch-synthetic-certified", "allocations"),
    );
    expect(allocated.status).toBe(201);
    const allocatedEnvelope = await body(allocated) as {
      data: { allocation: { id: string; status: string; itemCount: number }; batchStatus: string };
    };
    expect(allocatedEnvelope.data).toMatchObject({
      allocation: { status: "ALLOCATED", itemCount: 0 },
      batchStatus: "DISTRIBUTING",
    });

    const replay = await POST(
      postRequest(
        "batches/batch-synthetic-certified/allocations",
        { campusOrganizationId: "org-synthetic-campus", quantity: 1 },
        { Cookie: warehouseCookie, "Idempotency-Key": "api-allocation-0001" },
      ),
      routeContext("batches", "batch-synthetic-certified", "allocations"),
    );
    expect(await body(replay)).toEqual(allocatedEnvelope);

    const campusLogin = await POST(
      postRequest("auth/login", {
        email: "campus@demo.ecodrops.local",
        password: "DemoPass!2026",
      }),
      routeContext("auth", "login"),
    );
    const campusCookie = campusLogin.headers.get("set-cookie")?.split(";", 1)[0] ?? "";
    const workspace = await GET(
      getRequest("workspace", { Cookie: campusCookie }),
      routeContext("workspace"),
    );
    const workspaceEnvelope = await body(workspace) as {
      data: { allocations: Array<{ id: string }>; batches: Array<{ id: string }> };
    };
    expect(workspace.status).toBe(200);
    expect(workspaceEnvelope.data.allocations.map((entry) => entry.id))
      .toContain(allocatedEnvelope.data.allocation.id);
    expect(workspaceEnvelope.data.batches.map((entry) => entry.id))
      .toContain("batch-synthetic-certified");

    const receiptBody = {
      labelPrefix: "API Campus Adapter",
      compatibility: { connector: "usb-c" },
      needTags: ["coursework"],
    };
    const receiptPath = `allocations/${allocatedEnvelope.data.allocation.id}/receive`;
    const received = await POST(
      postRequest(receiptPath, receiptBody, {
        Cookie: campusCookie,
        "Idempotency-Key": "api-receipt-0001",
      }),
      routeContext("allocations", allocatedEnvelope.data.allocation.id, "receive"),
    );
    expect(received.status).toBe(201);
    const receivedEnvelope = await body(received);
    expect(receivedEnvelope).toMatchObject({
      data: {
        itemsCreated: 1,
        batchStatus: "DISTRIBUTING",
        allocation: { status: "RECEIVED", itemCount: 1, category: "electronics" },
      },
    });
    const receivedReplay = await POST(
      postRequest(receiptPath, receiptBody, {
        Cookie: campusCookie,
        "Idempotency-Key": "api-receipt-0001",
      }),
      routeContext("allocations", allocatedEnvelope.data.allocation.id, "receive"),
    );
    expect(await body(receivedReplay)).toEqual(receivedEnvelope);
  });
});
