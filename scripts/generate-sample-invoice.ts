import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

const OUTPUT = resolve(process.cwd(), "public/ecodrops-sample-invoice.pdf");

async function main(): Promise<void> {
  const pdf = await PDFDocument.create();
  const fixedDate = new Date("2026-10-24T12:00:00.000Z");
  pdf.setTitle("EcoDrops Synthetic Sample Invoice DEMO-INV-2026-0042");
  pdf.setAuthor("EcoDrops Hackathon Demo");
  pdf.setSubject("Synthetic surplus-stock invoice for testing only");
  pdf.setKeywords(["synthetic", "demo", "invoice", "EcoDrops", "DEMO-INV-2026-0042"]);
  pdf.setCreationDate(fixedDate);
  pdf.setModificationDate(fixedDate);

  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const page = pdf.addPage([612, 792]);
  const pine = rgb(0.047, 0.161, 0.133);
  const green = rgb(0.79, 0.98, 0.24);
  const ink = rgb(0.09, 0.2, 0.17);
  const muted = rgb(0.38, 0.45, 0.42);
  const line = rgb(0.79, 0.81, 0.77);
  const coral = rgb(0.88, 0.26, 0.18);

  page.drawRectangle({ x: 0, y: 704, width: 612, height: 88, color: pine });
  page.drawCircle({ x: 54, y: 748, size: 18, color: green });
  page.drawCircle({ x: 54, y: 752, size: 7, color: pine });
  page.drawText("EcoDrops", { x: 82, y: 742, size: 21, font: bold, color: rgb(1, 1, 0.97) });
  page.drawText("SYNTHETIC SAMPLE INVOICE", { x: 353, y: 746, size: 10, font: bold, color: green });
  page.drawText("For software demonstration only", { x: 405, y: 730, size: 8, font: regular, color: rgb(0.83, 0.89, 0.86) });

  page.drawText("SURPLUS STOCK INVOICE", { x: 44, y: 653, size: 26, font: bold, color: ink });
  page.drawText("DEMO-INV-2026-0042", { x: 44, y: 629, size: 13, font: regular, color: muted });

  const detailRows: Array<[string, string, number]> = [
    ["ISSUE DATE", "October 24, 2026", 44],
    ["SUPPLIER", "Synthetic Circular Co.", 220],
    ["SHIP TO", "EcoDrops Demo Warehouse", 398],
  ];
  for (const [label, value, x] of detailRows) {
    page.drawText(label, { x, y: 588, size: 7, font: bold, color: muted });
    page.drawText(value, { x, y: 570, size: 10, font: regular, color: ink });
  }

  page.drawLine({ start: { x: 44, y: 535 }, end: { x: 568, y: 535 }, thickness: 1, color: ink });
  const headers = [
    ["DESCRIPTION", 44], ["HS CODE", 278], ["QTY", 358], ["UNIT WT.", 411], ["UNIT VALUE", 477],
  ] as const;
  for (const [label, x] of headers) page.drawText(label, { x, y: 516, size: 7, font: bold, color: muted });
  page.drawLine({ start: { x: 44, y: 504 }, end: { x: 568, y: 504 }, thickness: 0.7, color: line });

  page.drawText("USB-C 65W power adapters", { x: 44, y: 477, size: 11, font: bold, color: ink });
  page.drawText("Functional open-box corporate surplus", { x: 44, y: 461, size: 8, font: regular, color: muted });
  page.drawText("850440", { x: 278, y: 474, size: 10, font: regular, color: ink });
  page.drawText("80", { x: 358, y: 474, size: 10, font: regular, color: ink });
  page.drawText("0.22 kg", { x: 411, y: 474, size: 10, font: regular, color: ink });
  page.drawText("$30.00", { x: 477, y: 474, size: 10, font: regular, color: ink });
  page.drawLine({ start: { x: 44, y: 438 }, end: { x: 568, y: 438 }, thickness: 0.7, color: line });

  page.drawText("Declared shipment weight", { x: 337, y: 399, size: 8, font: regular, color: muted });
  page.drawText("17.60 kg", { x: 506, y: 399, size: 9, font: bold, color: ink });
  page.drawText("DECLARED TOTAL", { x: 337, y: 368, size: 9, font: bold, color: ink });
  page.drawText("$2,400.00", { x: 493, y: 365, size: 14, font: bold, color: ink });

  page.drawRectangle({ x: 44, y: 246, width: 524, height: 84, color: rgb(0.95, 0.96, 0.9) });
  page.drawText("SURPLUS AUTHORITY STATEMENT", { x: 59, y: 306, size: 8, font: bold, color: ink });
  page.drawText("The supplier represents that it owns these functional goods and is authorized", { x: 59, y: 284, size: 9, font: regular, color: ink });
  page.drawText("to transfer them for reuse. Product safety remains subject to receiving review.", { x: 59, y: 268, size: 9, font: regular, color: ink });

  page.drawText("Matching EcoDrops intake values", { x: 44, y: 204, size: 10, font: bold, color: ink });
  page.drawText("Category: electronics   |   HS code: 850440   |   Quantity: 80", { x: 44, y: 184, size: 9, font: regular, color: muted });
  page.drawText("Unit weight: 0.22 kg   |   Declared value: $2,400   |   Reference: DEMO-INV-2026-0042", { x: 44, y: 166, size: 9, font: regular, color: muted });

  page.drawLine({ start: { x: 44, y: 116 }, end: { x: 568, y: 116 }, thickness: 1, color: coral });
  page.drawText("SYNTHETIC DEMO DOCUMENT — NOT A COMMERCIAL, CUSTOMS, OR TAX INVOICE", { x: 44, y: 94, size: 8, font: bold, color: coral });
  page.drawText("Generated deterministically by scripts/generate-sample-invoice.ts", { x: 44, y: 73, size: 7, font: regular, color: muted });

  await mkdir(resolve(process.cwd(), "public"), { recursive: true });
  await writeFile(OUTPUT, await pdf.save({ useObjectStreams: false }));
  console.info(`Generated ${OUTPUT}`);
}

main().catch((error: unknown) => {
  console.error("Failed to generate the sample invoice.", error);
  process.exitCode = 1;
});
