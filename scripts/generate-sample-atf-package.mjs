/**
 * Generates a SAMPLE/DEMO ATF inspection package (PDF + CSV + ASCII + MANIFEST)
 * without requiring the Tauri GUI. Run: node scripts/generate-sample-atf-package.mjs [outdir]
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { jsPDF } = require("jspdf");
const autoTable = require("jspdf-autotable").default || require("jspdf-autotable");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const outArg =
  process.argv[2] ||
  "/cursor/stores/bc-27b051df-69a0-47d2-a61c-188daf76fd93/media/atf-inspection-package";

const SAMPLE_NOTE =
  "[SAMPLE/DEMO — fictional data only; not a real A&D record]";

function todayMinus(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

function formatFromWhom(e) {
  switch (e.acquiredFromKind) {
    case "licensee":
      return `${e.acquiredFromName} — FFL ${e.acquiredFromFfl ?? ""}`.trim();
    case "opening_inventory":
      return `${e.acquiredFromName} (opening inventory)`;
    default:
      return [e.acquiredFromName, e.acquiredFromAddress].filter(Boolean).join(" — ");
  }
}

function formatToWhom(e) {
  if (e.status === "open" || !e.disposedToKind) return "";
  switch (e.disposedToKind) {
    case "form_4473":
      return `4473 # ${e.form4473TransactionNumber ?? ""}`;
    case "licensee":
      return `${e.disposedToName ?? ""} — FFL ${e.disposedToFfl ?? ""}`.trim();
    case "book_rollover_ref":
      return e.dispositionReference ?? "";
    default:
      return [e.disposedToName, e.disposedToAddress].filter(Boolean).join(" — ");
  }
}

const license = {
  businessName: "Rettmark Firearms (SAMPLE/DEMO)",
  fflNumber: "DEMO-NOT-A-REAL-FFL",
  operatorName: "Ken Brown",
};

const entries = [
  {
    lineNumber: 2,
    status: "open",
    manufacturer: "Ruger",
    importer: "",
    model: "American Rifle",
    serialNumber: "SAMPLE-RIF-002",
    firearmType: "Rifle",
    caliberOrGauge: "308 Win",
    acquisitionDate: todayMinus(30),
    acquiredFromKind: "opening_inventory",
    acquiredFromName: "SAMPLE Opening Inventory",
    acquiredFromAddress: "",
    acquiredFromFfl: "",
    dispositionDate: "",
    disposedToKind: "",
    disposedToName: "",
    disposedToAddress: "",
    disposedToFfl: "",
    form4473TransactionNumber: "",
    dispositionReference: "",
    notes: SAMPLE_NOTE,
    correctionReason: "",
    id: 2,
  },
  {
    lineNumber: 4,
    status: "disposed",
    manufacturer: "Remington",
    importer: "",
    model: "870",
    serialNumber: "SAMPLE-SG-004",
    firearmType: "Shotgun",
    caliberOrGauge: "12 ga",
    acquisitionDate: todayMinus(25),
    acquiredFromKind: "nonlicensee",
    acquiredFromName: "SAMPLE Jane Q. Public",
    acquiredFromAddress: "100 Demo Street, Sampletown, ST 00000",
    acquiredFromFfl: "",
    dispositionDate: todayMinus(8),
    disposedToKind: "licensee",
    disposedToName: "SAMPLE Other Dealer Inc",
    disposedToAddress: "",
    disposedToFfl: "DEMO-OTHER-DEALER",
    form4473TransactionNumber: "",
    dispositionReference: "",
    notes: SAMPLE_NOTE,
    correctionReason: "",
    id: 4,
  },
  {
    lineNumber: 3,
    status: "disposed",
    manufacturer: "Smith & Wesson",
    importer: "",
    model: "M&P Shield",
    serialNumber: "SAMPLE-P9-003",
    firearmType: "Pistol",
    caliberOrGauge: "9mm",
    acquisitionDate: todayMinus(20),
    acquiredFromKind: "licensee",
    acquiredFromName: "SAMPLE Demo Distributors LLC",
    acquiredFromAddress: "",
    acquiredFromFfl: "DEMO-DIST-NOT-REAL",
    dispositionDate: todayMinus(5),
    disposedToKind: "form_4473",
    disposedToName: "",
    disposedToAddress: "",
    disposedToFfl: "",
    form4473TransactionNumber: "SAMPLE-4473-1001",
    dispositionReference: "",
    notes: SAMPLE_NOTE,
    correctionReason: "",
    id: 3,
  },
  {
    lineNumber: 5,
    status: "open",
    manufacturer: "privately made firearm",
    importer: "",
    model: "SAMPLE PMF Pistol",
    serialNumber: "SAMPLE-PMF-005",
    firearmType: "Pistol",
    caliberOrGauge: "9mm",
    acquisitionDate: todayMinus(15),
    acquiredFromKind: "nonlicensee",
    acquiredFromName: "SAMPLE Alex Maker",
    acquiredFromAddress: "200 Fiction Ave, Demo City, ST 00000",
    acquiredFromFfl: "",
    dispositionDate: "",
    disposedToKind: "",
    disposedToName: "",
    disposedToAddress: "",
    disposedToFfl: "",
    form4473TransactionNumber: "",
    dispositionReference: "",
    notes: SAMPLE_NOTE,
    correctionReason: "SAMPLE/DEMO: fix transposed serial digit",
    id: 6,
  },
  {
    lineNumber: 1,
    status: "open",
    manufacturer: "Glock",
    importer: "",
    model: "19 Gen5",
    serialNumber: "SAMPLE-P19-001",
    firearmType: "Pistol",
    caliberOrGauge: "9mm",
    acquisitionDate: todayMinus(12),
    acquiredFromKind: "licensee",
    acquiredFromName: "SAMPLE Demo Distributors LLC",
    acquiredFromAddress: "",
    acquiredFromFfl: "DEMO-DIST-NOT-REAL",
    dispositionDate: "",
    disposedToKind: "",
    disposedToName: "",
    disposedToAddress: "",
    disposedToFfl: "",
    form4473TransactionNumber: "",
    dispositionReference: "",
    notes: SAMPLE_NOTE,
    correctionReason: "",
    id: 1,
  },
].sort((a, b) => {
  const d = a.acquisitionDate.localeCompare(b.acquisitionDate);
  return d !== 0 ? d : a.lineNumber - b.lineNumber;
});

fs.mkdirSync(outArg, { recursive: true });

const csvPath = path.join(outArg, "rettmark-ad-SAMPLE.csv");
const asciiPath = path.join(outArg, "rettmark-ad-SAMPLE.txt");
const pdfPath = path.join(outArg, "rettmark-ad-SAMPLE.pdf");
const manifestPath = path.join(outArg, "MANIFEST.txt");

const csvHeader = [
  "Line",
  "Status",
  "Manufacturer",
  "Importer",
  "Model",
  "Serial No.",
  "Type",
  "Caliber/Gauge",
  "Acquisition Date",
  "Acquired From Kind",
  "Acquired From Name",
  "Acquired From Address",
  "Acquired From FFL",
  "Disposition Date",
  "Disposed To Kind",
  "Disposed To Name",
  "Disposed To Address",
  "Disposed To FFL",
  "Form 4473 Txn No.",
  "Disposition Reference",
  "Notes",
  "Correction Reason",
  "Entry ID",
];

function csvEscape(v) {
  const s = String(v ?? "");
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

const csvBody = entries
  .map((e) =>
    [
      e.lineNumber,
      e.status,
      e.manufacturer,
      e.importer,
      e.model,
      e.serialNumber,
      e.firearmType,
      e.caliberOrGauge,
      e.acquisitionDate,
      e.acquiredFromKind,
      e.acquiredFromName,
      e.acquiredFromAddress,
      e.acquiredFromFfl,
      e.dispositionDate,
      e.disposedToKind,
      e.disposedToName,
      e.disposedToAddress,
      e.disposedToFfl,
      e.form4473TransactionNumber,
      e.dispositionReference,
      e.notes,
      e.correctionReason,
      e.id,
    ]
      .map(csvEscape)
      .join(","),
  )
  .join("\n");

fs.writeFileSync(csvPath, `${csvHeader.join(",")}\n${csvBody}\n`, "utf8");

const asciiLines = [
  "Rettmark Firearms — Firearms Acquisition & Disposition Record",
  "Format: 27 CFR 478.125(e) dealer A&D (electronic)",
  `FFL: ${license.fflNumber}`,
  `Business: ${license.businessName}`,
  `Operator: ${license.operatorName}`,
  "Sorted by acquisition date",
  "SAMPLE/DEMO DATA ONLY — not a real A&D record",
  "---",
];
for (const e of entries) {
  asciiLines.push(
    `L${e.lineNumber}|${e.manufacturer}|${e.importer}|${e.model}|${e.serialNumber}|${e.firearmType}|${e.caliberOrGauge}|Acq ${e.acquisitionDate}|From ${formatFromWhom(e)}|Disp ${e.dispositionDate}|To ${formatToWhom(e)}`,
  );
}
fs.writeFileSync(asciiPath, asciiLines.join("\n") + "\n", "utf8");

const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "letter" });
doc.setFont("helvetica", "bold");
doc.setFontSize(14);
doc.text("Firearms Acquisition and Disposition Record", 40, 36);
doc.setFont("helvetica", "normal");
doc.setFontSize(10);
doc.text(`${license.businessName}  ·  FFL ${license.fflNumber}`, 40, 52);
doc.setFontSize(8);
doc.text(
  "Dealer A&D columns per 27 CFR 478.125(e). Electronic alternate method: ATF Ruling 2016-1. SAMPLE/DEMO only — not ATF-certified software.",
  40,
  66,
);
autoTable(doc, {
  startY: 78,
  styles: { fontSize: 7, cellPadding: 3, overflow: "linebreak" },
  headStyles: { fillColor: [40, 40, 40], textColor: 255, fontStyle: "bold" },
  head: [
    [
      "Line",
      "Manufacturer / Importer",
      "Model",
      "Serial No.",
      "Type",
      "Caliber",
      "Acq. Date",
      "Receipt",
      "From Whom Received",
      "Disp. Date",
      "Disposition / To Whom",
    ],
  ],
  body: entries.map((e) => [
    String(e.lineNumber),
    [e.manufacturer, e.importer].filter(Boolean).join(" / "),
    e.model,
    e.serialNumber,
    e.firearmType,
    e.caliberOrGauge,
    e.acquisitionDate,
    e.acquiredFromKind,
    formatFromWhom(e),
    e.dispositionDate || "",
    formatToWhom(e),
  ]),
});
fs.writeFileSync(pdfPath, Buffer.from(doc.output("arraybuffer")));

const createdAt = new Date().toISOString();
const manifest = [
  "Rettmark Firearms — ATF inspection / premises download package",
  `Created: ${createdAt}`,
  "Format basis: 27 CFR 478.125(e); ATF Ruling 2016-1",
  "Contents: unencrypted PDF (paper columns), CSV, and ASCII text of dealer A&D",
  "View: effective (corrected) A&D lines, sorted by acquisition date",
  "Use: print or provide this folder for ATF inspection / premises download",
  `Business: ${license.businessName}`,
  `FFL: ${license.fflNumber}`,
  `Operator: ${license.operatorName}`,
  `Entry count: ${entries.length}`,
  "SAMPLE/DEMO DATA ONLY — fictional serials and FFLs; not a real A&D record",
  "Files:",
  "  - rettmark-ad-SAMPLE.pdf",
  "  - rettmark-ad-SAMPLE.csv",
  "  - rettmark-ad-SAMPLE.txt",
  "  - MANIFEST.txt",
  "",
  "Disclaimer: ATF does not certify software. Not legal advice. Licensee remains responsible.",
  "",
].join("\n");
fs.writeFileSync(manifestPath, manifest, "utf8");

console.log(JSON.stringify({ outArg, files: fs.readdirSync(outArg), entryCount: entries.length }, null, 2));
void root;
