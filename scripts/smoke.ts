import { openDatabase } from "../src/lib/db";
import { DEMO_ORGANIZATIONS, DEMO_PASSWORD, DEMO_TIMESTAMP, seedDatabase } from "../src/lib/seed";
import { createEcoDropsService } from "../src/lib/service";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const PDF = new TextEncoder().encode("%PDF-1.4\n% Synthetic smoke-test invoice\n%%EOF");
const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);

async function main(): Promise<void> {
  const db = openDatabase(":memory:");
  let sequence = 0;
  try {
    await seedDatabase(db, { clear: true });
    const service = createEcoDropsService({
      db,
      demoMode: true,
      now: () => new Date(DEMO_TIMESTAMP),
      id: () => `smoke-${String(++sequence).padStart(4, "0")}`,
    });

    const corporate = await service.login({ email: "corp@demo.ecodrops.local", password: DEMO_PASSWORD });
    const draft = service.createBatch(corporate.actor, {
      hsCode: "847130",
      category: "electronics",
      quantity: 10,
      unitWeightKg: 1.2,
      declaredValueCents: 300_000,
      invoiceIdentifier: "SMOKE-INVOICE-001",
      authorityAttested: true,
      invoice: { mimeType: "application/pdf", bytes: PDF },
    });
    const submitted = service.submitBatch(corporate.actor, { batchId: draft.id, complianceAttested: true });
    assert(submitted.status === "PENDING_VERIFICATION", "Smoke batch did not pass intake.");
    const shipment = service.createShipment(corporate.actor, { batchId: draft.id });
    const delivered = service.advanceShipmentSimulation(corporate.actor, { shipmentId: shipment.id });
    assert(delivered.status === "DELIVERED", "Smoke shipment was not delivered.");

    const warehouse = await service.login({ email: "warehouse@demo.ecodrops.local", password: DEMO_PASSWORD });
    const receiving = service.receiveBatch(warehouse.actor, {
      batchId: draft.id,
      grossWeightKg: 14,
      tareWeightKg: 2,
      sampleScanCount: 3,
      evidencePhotos: [{ mimeType: "image/png", bytes: PNG }],
    });
    assert(receiving.varianceTier === "PASS" && receiving.verifiedUnits === 10, "Receiving reconciliation failed.");
    const certificate = service.certifyBatch(warehouse.actor, { batchId: draft.id });
    const publicRecord = service.getPublicCertificate(certificate.recordId);
    assert(Object.keys(publicRecord).sort().join(",") === "auditHash,issueDate,methodologyVersion,recordId,status", "Public projection leaked fields.");

    const allocation = service.createCampusAllocation(warehouse.actor, {
      batchId: draft.id,
      campusOrganizationId: DEMO_ORGANIZATIONS.campus,
      quantity: receiving.verifiedUnits,
      idempotencyKey: "smoke-allocation-0001",
    });
    assert(allocation.batchStatus === "DISTRIBUTING", "Certified batch was not allocated to campus.");
    const campus = await service.login({ email: "campus@demo.ecodrops.local", password: DEMO_PASSWORD });
    const receipt = service.receiveCampusAllocation(campus.actor, {
      allocationId: allocation.allocation.id,
      labelPrefix: "Smoke USB-C Adapter",
      compatibility: { connector: "usb-c" },
      needTags: ["coursework", "remote-learning"],
      idempotencyKey: "smoke-campus-receipt-0001",
    });
    assert(receipt.itemsCreated === 10 && receipt.batchStatus === "CLOSED", "Campus receipt did not close exact distribution capacity.");

    const kiosk = service.startKioskSession({
      campusOrganizationId: DEMO_ORGANIZATIONS.campus,
      mode: "CATEGORY_KNOWN",
      requestedCategories: ["electronics"],
      compatibility: { connector: "usb-c" },
      needTags: ["coursework"],
      weeklyClaimToken: "smoke-anonymous-weekly-token-0001",
    });
    const matches = service.matchKioskItems({ token: kiosk.token });
    const matched = matches.find((item) => receipt.itemIds.includes(item.itemId));
    assert(matched, "Kiosk did not expose an item after campus receipt.");
    const claim = service.checkoutKioskItem({ token: kiosk.token, itemId: matched.itemId, idempotencyKey: "smoke-checkout-0001" });
    const replay = service.checkoutKioskItem({ token: kiosk.token, itemId: matched.itemId, idempotencyKey: "smoke-checkout-0001" });
    assert(replay.claimId === claim.claimId, "Checkout was not idempotent.");
    service.revealClaim({ token: kiosk.token, claimId: claim.claimId, idempotencyKey: "smoke-reveal-0001" });
    service.recordRevealDecision({ token: kiosk.token, claimId: claim.claimId, decision: "KEEP", idempotencyKey: "smoke-decision-0001" });
    service.recordOutcomeSurvey({ token: kiosk.token, claimId: claim.claimId, displacementAnswer: "YES", followUpOutcome: "IN_USE", idempotencyKey: "smoke-survey-0001" });

    const audit = service.verifyAudit(warehouse.actor);
    assert(audit.valid, "Audit chain did not verify after the complete smoke flow.");
    console.info(JSON.stringify({
      result: "PASS",
      batch: { id: draft.id, status: "CLOSED", verifiedUnits: receiving.verifiedUnits },
      shipment: delivered.status,
      certificate: publicRecord,
      campusDistribution: {
        allocationId: allocation.allocation.id,
        itemsCreated: receipt.itemsCreated,
        status: receipt.batchStatus,
      },
      kiosk: { matchedItem: matched.itemId, claimId: claim.claimId, decision: "KEEP" },
      audit: { valid: audit.valid, checkedEvents: audit.checkedEvents, headHash: audit.headHash },
    }, null, 2));
  } finally {
    db.close();
  }
}

main().catch((error: unknown) => {
  console.error("EcoDrops smoke test failed.", error);
  process.exitCode = 1;
});
