import type { BoundBookEntry } from "./types";

export function formatFromWhom(e: BoundBookEntry): string {
  switch (e.acquiredFromKind) {
    case "licensee":
      return `${e.acquiredFromName} — FFL ${e.acquiredFromFfl ?? ""}`.trim();
    case "opening_inventory":
      return `${e.acquiredFromName} (opening inventory)`;
    default:
      return [e.acquiredFromName, e.acquiredFromAddress].filter(Boolean).join(" — ");
  }
}

export function formatToWhom(e: BoundBookEntry): string {
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

export function paperColumns(e: BoundBookEntry) {
  return {
    line: e.lineNumber,
    manufacturerImporter: [e.manufacturer, e.importer].filter(Boolean).join(" / "),
    model: e.model,
    serial: e.serialNumber,
    type: e.firearmType,
    caliber: e.caliberOrGauge,
    acquisitionDate: e.acquisitionDate,
    fromWhom: formatFromWhom(e),
    dispositionDate: e.dispositionDate ?? "",
    toWhom: formatToWhom(e),
  };
}
