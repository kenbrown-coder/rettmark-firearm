/**
 * Generates a SAMPLE/DEMO ATF inspection package (PDF + CSV + ASCII + MANIFEST)
 * without requiring the Tauri GUI. Run: node scripts/generate-sample-atf-package.mjs [outdir]
 *
 * Layout: 27 CFR 478.125(e) Table 2 — Acquisitions (left) / Dispositions (right),
 * separate Name and Address columns (ATF IOI DeSanto feedback).
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

const defaultOut = path.join(
  process.env.USERPROFILE || process.env.HOME || root,
  "AppData",
  "Local",
  "Cursor",
  "AgentStores",
  "cursor_agent_stores",
  "bc-27b051df-69a0-47d2-a61c-188daf76fd93",
  "files",
  "media",
  "atf-inspection-package",
);
const outArg = process.argv[2] || defaultOut;

const SAMPLE_NOTE =
  "[SAMPLE/DEMO — fictional data only; not a real A&D record]";

const AD_GROUP = {
  description: "Description of firearm",
  acquisitions: "Acquisitions",
  dispositions: "Dispositions",
};

const AD_COL = {
  manufacturer:
    'Manufacturer, importer (if any), or "privately made firearm" (PMF)',
  model: "Model",
  serialNo: "Serial No.",
  type: "Type",
  caliberOrGauge: "Caliber or gauge",
  receiptDate: "Date",
  acquisitionName: "Name",
  acquisitionAddressOrLicense:
    "Address of nonlicensee; or license No. of licensee",
  dispositionDate: "Date",
  dispositionName: "Name",
  dispositionAddressOrLocator:
    "Address of nonlicensee; license No. of licensee; or Form 4473 transaction No. if such forms filed numerically",
};

function todayMinus(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

function formatAcquisitionName(e) {
  if (e.acquiredFromKind === "opening_inventory") {
    return `${e.acquiredFromName} (opening inventory)`;
  }
  return e.acquiredFromName ?? "";
}

function formatAcquisitionAddressOrLicense(e) {
  switch (e.acquiredFromKind) {
    case "licensee":
      return e.acquiredFromFfl ? `FFL ${e.acquiredFromFfl}` : "";
    case "opening_inventory":
      return "";
    default:
      return e.acquiredFromAddress ?? "";
  }
}

function formatDispositionName(e) {
  if (e.status === "open" || !e.disposedToKind) return "";
  switch (e.disposedToKind) {
    case "form_4473":
    case "book_rollover_ref":
      return "";
    default:
      return e.disposedToName ?? "";
  }
}

function formatDispositionAddressOrLocator(e) {
  if (e.status === "open" || !e.disposedToKind) return "";
  switch (e.disposedToKind) {
    case "form_4473":
      return e.form4473TransactionNumber
        ? `Form 4473 txn No. ${e.form4473TransactionNumber}`
        : "";
    case "licensee":
      return e.disposedToFfl ? `FFL ${e.disposedToFfl}` : "";
    case "book_rollover_ref":
      return e.dispositionReference ?? "";
    default:
      return e.disposedToAddress ?? "";
  }
}

/** Match app PDF (0.1.5+): green Acquisitions vs charcoal Dispositions */
const DESC_FILL = [30, 51, 40];
const DESC_SUB_FILL = [45, 74, 58];
const ACQ_FILL = [61, 107, 82];
const ACQ_SUB_FILL = [79, 129, 100];
const DISP_FILL = [36, 36, 36];
const DISP_SUB_FILL = [64, 64, 64];

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
  "Manufacturer / Importer / PMF",
  "Importer",
  "Model",
  "Serial No.",
  "Type",
  "Caliber or gauge",
  "Acquisition Date",
  "Acquisition Kind",
  "Acquisition Name",
  "Acquisition Address or License No.",
  "Acquisition FFL",
  "Disposition Date",
  "Disposition Kind",
  "Disposition Name",
  "Disposition Address, License No., or Form 4473 Transaction No.",
  "Disposition FFL",
  "Form 4473 Transaction No.",
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
      [e.manufacturer, e.importer].filter(Boolean).join(" / ") || e.manufacturer,
      e.importer,
      e.model,
      e.serialNumber,
      e.firearmType,
      e.caliberOrGauge,
      e.acquisitionDate,
      e.acquiredFromKind,
      formatAcquisitionName(e),
      formatAcquisitionAddressOrLicense(e),
      e.acquiredFromFfl,
      e.dispositionDate,
      e.disposedToKind,
      formatDispositionName(e),
      formatDispositionAddressOrLocator(e),
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
  "Format: 27 CFR 478.125(e) Table 2 dealer A&D (electronic)",
  `FFL: ${license.fflNumber}`,
  `Business: ${license.businessName}`,
  `Operator: ${license.operatorName}`,
  "Sorted by acquisition date",
  "Columns: Description | Acquisitions (Date, Name, Address/License No.) | Dispositions (Date, Name, Address/License No./4473)",
  "SAMPLE/DEMO DATA ONLY — not a real A&D record",
  "---",
];
for (const e of entries) {
  asciiLines.push(
    `L${e.lineNumber}|${e.manufacturer}|${e.importer}|${e.model}|${e.serialNumber}|${e.firearmType}|${e.caliberOrGauge}|AcqDate ${e.acquisitionDate}|AcqName ${formatAcquisitionName(e)}|AcqAddrOrLic ${formatAcquisitionAddressOrLicense(e)}|DispDate ${e.dispositionDate}|DispName ${formatDispositionName(e)}|DispAddrLicOr4473 ${formatDispositionAddressOrLocator(e)}`,
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
  `Operator: ${license.operatorName} · ${entries.length} line(s) · Sorted by acquisition date · SAMPLE/DEMO only`,
  40,
  66,
);
const pageWidth = doc.internal.pageSize.getWidth();
const marginX = 18;
const tableWidth = pageWidth - marginX * 2;

autoTable(doc, {
  startY: 78,
  tableWidth,
  styles: {
    fontSize: 5.5,
    cellPadding: 1.5,
    overflow: "linebreak",
    valign: "top",
  },
  headStyles: { textColor: 255, fontStyle: "bold", halign: "left", overflow: "linebreak" },
  columnStyles: {
    0: { cellWidth: tableWidth * 0.03 },
    1: { cellWidth: tableWidth * 0.12 },
    2: { cellWidth: tableWidth * 0.06 },
    3: { cellWidth: tableWidth * 0.075 },
    4: { cellWidth: tableWidth * 0.055 },
    5: { cellWidth: tableWidth * 0.055 },
    6: { cellWidth: tableWidth * 0.06 },
    7: { cellWidth: tableWidth * 0.085 },
    8: { cellWidth: tableWidth * 0.11 },
    9: { cellWidth: tableWidth * 0.06 },
    10: { cellWidth: tableWidth * 0.08 },
    11: { cellWidth: tableWidth * 0.21 },
  },
  margin: { left: marginX, right: marginX },
  head: [
    [
      { content: "Line", rowSpan: 2, styles: { fillColor: DESC_FILL } },
      {
        content: AD_GROUP.description,
        colSpan: 5,
        styles: { fillColor: DESC_FILL, halign: "center" },
      },
      {
        content: AD_GROUP.acquisitions,
        colSpan: 3,
        styles: { fillColor: ACQ_FILL, halign: "center" },
      },
      {
        content: AD_GROUP.dispositions,
        colSpan: 3,
        styles: { fillColor: DISP_FILL, halign: "center" },
      },
    ],
    [
      { content: AD_COL.manufacturer, styles: { fillColor: DESC_SUB_FILL, fontSize: 5.5 } },
      { content: AD_COL.model, styles: { fillColor: DESC_SUB_FILL } },
      { content: AD_COL.serialNo, styles: { fillColor: DESC_SUB_FILL } },
      { content: AD_COL.type, styles: { fillColor: DESC_SUB_FILL } },
      { content: AD_COL.caliberOrGauge, styles: { fillColor: DESC_SUB_FILL } },
      { content: AD_COL.receiptDate, styles: { fillColor: ACQ_SUB_FILL } },
      { content: AD_COL.acquisitionName, styles: { fillColor: ACQ_SUB_FILL } },
      {
        content: AD_COL.acquisitionAddressOrLicense,
        styles: { fillColor: ACQ_SUB_FILL, fontSize: 5.5 },
      },
      { content: AD_COL.dispositionDate, styles: { fillColor: DISP_SUB_FILL } },
      { content: AD_COL.dispositionName, styles: { fillColor: DISP_SUB_FILL } },
      {
        content: AD_COL.dispositionAddressOrLocator,
        styles: { fillColor: DISP_SUB_FILL, fontSize: 5.5 },
      },
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
    formatAcquisitionName(e),
    formatAcquisitionAddressOrLicense(e),
    e.dispositionDate || "",
    formatDispositionName(e),
    formatDispositionAddressOrLocator(e),
  ]),
});
fs.writeFileSync(pdfPath, Buffer.from(doc.output("arraybuffer")));

const createdAt = new Date().toISOString();
const manifest = [
  "Rettmark Firearms — ATF inspection / premises download package",
  `Created: ${createdAt}`,
  "Format basis: 27 CFR 478.125(e) Table 2; ATF Ruling 2016-1",
  "Layout: Acquisitions (left) / Dispositions (right); separate Name and Address columns",
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
