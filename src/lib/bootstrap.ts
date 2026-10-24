import type { DatabaseConnection } from "./db";
import { getDatabase, getDatabasePath } from "./db";
import { createReadModels, type EcoDropsReadModels } from "./read-models";
import { createEcoDropsService, type EcoDropsService } from "./service";

const SERVER_CONTEXT_VERSION = "hs-catalog-allocations-v2";
const BUSINESS_TABLES = [
  "organizations",
  "users",
  "sessions",
  "methodologies",
  "emission_factors",
  "batches",
  "shipments",
  "shipment_events",
  "receivings",
  "evidence_photos",
  "certificates",
  "campus_allocations",
  "allocation_items",
  "items",
  "kiosk_sessions",
  "claims",
  "claim_decisions",
  "outcomes",
  "idempotency_records",
  "audit_events",
] as const;

export interface EcoDropsServerContext {
  db: DatabaseConnection;
  service: EcoDropsService;
  readModels: EcoDropsReadModels;
  applicationOrigin: string;
  demoMode: boolean;
  demoSeeded: boolean;
}

type GlobalBootstrapState = typeof globalThis & {
  __ecoDropsBootstrapPromises?: Map<string, Promise<EcoDropsServerContext>>;
};

const globalBootstrap = globalThis as GlobalBootstrapState;

/**
 * Demo behavior is opt-in everywhere except an unset local-development environment.
 * Production may enable explicit simulator routes with DEMO_MODE=true, but bootstrap
 * still never seeds there.
 */
export function isDemoModeEnabled(): boolean {
  if (process.env.DEMO_MODE === undefined) return process.env.NODE_ENV !== "production";
  return process.env.DEMO_MODE === "true";
}

export function getApplicationOrigin(): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL;
  if (!configured && process.env.NODE_ENV === "production") {
    throw new Error("NEXT_PUBLIC_APP_URL must be configured in production.");
  }

  const url = new URL(configured ?? "http://localhost:3000");
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("NEXT_PUBLIC_APP_URL must use HTTP or HTTPS.");
  }
  return url.origin;
}

export function isBusinessDatabaseEmpty(db: DatabaseConnection): boolean {
  return BUSINESS_TABLES.every((table) => {
    const row = db.prepare<[], { present: number }>(`SELECT 1 AS present FROM ${table} LIMIT 1`).get();
    return row === undefined;
  });
}

async function createServerContext(): Promise<EcoDropsServerContext> {
  const db = getDatabase();
  const demoMode = isDemoModeEnabled();
  const canAutoSeed = demoMode && process.env.NODE_ENV !== "production";
  let demoSeeded = false;

  if (canAutoSeed && isBusinessDatabaseEmpty(db)) {
    const { seedDatabase } = await import("./seed");
    await seedDatabase(db, { clear: false });
    demoSeeded = true;
  }

  const service = createEcoDropsService({ db, demoMode });
  const readModels = createReadModels({ db, service });
  return {
    db,
    service,
    readModels,
    applicationOrigin: getApplicationOrigin(),
    demoMode,
    demoSeeded,
  };
}

/**
 * Initializes schema/service/read models and, for a genuinely empty local demo DB,
 * seeds once. The process-global promise also deduplicates concurrent Next requests
 * and development module reloads.
 */
export async function getServerContext(): Promise<EcoDropsServerContext> {
  const demoMode = isDemoModeEnabled();
  const key = [
    SERVER_CONTEXT_VERSION,
    getDatabasePath(),
    process.env.NODE_ENV ?? "development",
    demoMode ? "demo" : "non-demo",
    process.env.NEXT_PUBLIC_APP_URL ?? "",
  ].join("|");
  const promises = globalBootstrap.__ecoDropsBootstrapPromises ??= new Map();
  const existing = promises.get(key);
  if (existing) return existing;

  const pending = createServerContext();
  promises.set(key, pending);
  try {
    return await pending;
  } catch (error) {
    if (promises.get(key) === pending) promises.delete(key);
    throw error;
  }
}
