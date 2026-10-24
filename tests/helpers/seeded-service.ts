import { openDatabase, type DatabaseConnection } from "../../src/lib/db";
import type { ActorContext, KioskSessionCredentials } from "../../src/lib/domain";
import {
  DEMO_ORGANIZATIONS,
  DEMO_TIMESTAMP,
  DEMO_USERS,
  seedDatabase,
} from "../../src/lib/seed";
import {
  createEcoDropsService,
  type EcoDropsService,
} from "../../src/lib/service";
import { createReadModels, type EcoDropsReadModels } from "../../src/lib/read-models";

export const corporateActor: ActorContext = {
  userId: DEMO_USERS.corporate.id,
  organizationId: DEMO_ORGANIZATIONS.corporate,
  role: "corp_user",
};

export const warehouseActor: ActorContext = {
  userId: DEMO_USERS.warehouse.id,
  organizationId: DEMO_ORGANIZATIONS.warehouse,
  role: "warehouse_op",
};

export const campusActor: ActorContext = {
  userId: DEMO_USERS.campus.id,
  organizationId: DEMO_ORGANIZATIONS.campus,
  role: "campus_admin",
};

export const adminActor: ActorContext = {
  userId: DEMO_USERS.admin.id,
  organizationId: DEMO_ORGANIZATIONS.platform,
  role: "admin",
};

export interface SeededServiceHarness {
  db: DatabaseConnection;
  service: EcoDropsService;
  readModels: EcoDropsReadModels;
}

export async function createSeededServiceHarness(
  weeklyClaimCap = 1,
): Promise<SeededServiceHarness> {
  const db = openDatabase(":memory:");
  await seedDatabase(db, { clear: true });
  let sequence = 0;
  const service = createEcoDropsService({
    db,
    demoMode: true,
    now: () => new Date(DEMO_TIMESTAMP),
    id: () => `test-id-${++sequence}`,
    weeklyClaimCap,
  });
  const readModels = createReadModels({ db, service });
  return { db, service, readModels };
}

export function startCompatibleKioskSession(
  service: EcoDropsService,
  weeklyClaimToken: string,
): KioskSessionCredentials {
  return service.startKioskSession({
    campusOrganizationId: DEMO_ORGANIZATIONS.campus,
    mode: "CATEGORY_KNOWN",
    requestedCategories: ["electronics"],
    compatibility: { connector: "usb-c" },
    needTags: ["coursework"],
    weeklyClaimToken,
  });
}
