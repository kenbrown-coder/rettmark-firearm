import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import type { BoundBookEntry, License } from "./types";
import {
  AD_COL,
  AD_GROUP,
  formatAcquisitionAddressOrLicense,
  formatAcquisitionName,
  formatDispositionAddressOrLocator,
  formatDispositionName,
} from "./boundBookFormat";

/** Description of firearm — deep forest */
const DESC_FILL: [number, number, number] = [30, 51, 40];
const DESC_SUB_FILL: [number, number, number] = [45, 74, 58];
/** Acquisitions — clear mid green (left) */
const ACQ_FILL: [number, number, number] = [61, 107, 82];
const ACQ_SUB_FILL: [number, number, number] = [79, 129, 100];
/** Dispositions — charcoal (right), strong contrast vs green */
const DISP_FILL: [number, number, number] = [36, 36, 36];
const DISP_SUB_FILL: [number, number, number] = [64, 64, 64];

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

  const metaParts: string[] = [];
  if (license?.operatorName) metaParts.push(`Operator: ${license.operatorName}`);
  if (license?.forms4473FiledNumerically) metaParts.push("Forms 4473 filed numerically");
  metaParts.push(`${entries.length} line(s)`);
  metaParts.push("Sorted by acquisition date");
  doc.setFontSize(8);
  doc.text(metaParts.join(" · "), 40, 66);

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
        {
          content: AD_COL.manufacturer,
          styles: { fillColor: DESC_SUB_FILL, fontSize: 5.5 },
        },
        { content: AD_COL.model, styles: { fillColor: DESC_SUB_FILL } },
        { content: AD_COL.serialNo, styles: { fillColor: DESC_SUB_FILL } },
        { content: AD_COL.type, styles: { fillColor: DESC_SUB_FILL } },
        { content: AD_COL.caliberOrGauge, styles: { fillColor: DESC_SUB_FILL } },
        { content: AD_COL.receiptDate, styles: { fillColor: ACQ_SUB_FILL } },
        {
          content: AD_COL.acquisitionName,
          styles: { fillColor: ACQ_SUB_FILL },
        },
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
      e.dispositionDate ?? "",
      formatDispositionName(e),
      formatDispositionAddressOrLocator(e),
    ]),
  });

  return doc;
}
