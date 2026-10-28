import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import type { BoundBookEntry, License } from "./types";
import { formatFromWhom, formatToWhom } from "./boundBookFormat";

export function buildBoundBookPdf(
  license: License | null,
  entries: BoundBookEntry[],
): jsPDF {
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "letter" });
  const title = license?.businessName ?? "Rettmark Firearms";
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text("Firearms Acquisition and Disposition Record", 40, 36);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(`${title}${license?.fflNumber ? `  ·  FFL ${license.fflNumber}` : ""}`, 40, 52);
  doc.setFontSize(8);
  doc.text(
    "Dealer A&D columns per 27 CFR 478.125(e). Electronic alternate method: ATF Ruling 2016-1. Not ATF-certified software.",
    40,
    66,
  );

  autoTable(doc, {
    startY: 78,
    styles: { fontSize: 7, cellPadding: 3, overflow: "linebreak" },
    headStyles: { fillColor: [40, 40, 40], textColor: 255, fontStyle: "bold" },
    columnStyles: {
      0: { cellWidth: 28 },
      1: { cellWidth: 70 },
      2: { cellWidth: 50 },
      3: { cellWidth: 55 },
      4: { cellWidth: 62 },
      5: { cellWidth: 40 },
      6: { cellWidth: 40 },
      7: { cellWidth: 48 },
      8: { cellWidth: 110 },
      9: { cellWidth: 48 },
      10: { cellWidth: 110 },
    },
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
      e.dispositionDate ?? "",
      formatToWhom(e),
    ]),
  });

  return doc;
}
