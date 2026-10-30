import type { BoundBookEntry } from "./types";

/** Group / column labels aligned to 27 CFR 478.125(e) Table 2 + IOI DeSanto layout notes. */
export const AD_GROUP = {
  description: "Description of firearm",
  acquisitions: "Acquisitions",
  dispositions: "Dispositions",
} as const;

export const AD_COL = {
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
} as const;

/** Short CSV / ASCII header names that still mirror the regulation fields. */
export const AD_CSV = {
  manufacturer: "Manufacturer / Importer / PMF",
  model: "Model",
  serialNo: "Serial No.",
  type: "Type",
  caliberOrGauge: "Caliber or gauge",
  acquisitionDate: "Acquisition Date",
  acquisitionName: "Acquisition Name",
  acquisitionAddressOrLicenseNo: "Acquisition Address or License No.",
  dispositionDate: "Disposition Date",
  dispositionName: "Disposition Name",
  dispositionAddressLicenseOr4473:
    "Disposition Address, License No., or Form 4473 Transaction No.",
} as const;

/** Acquisition “Name” cell — party name only (not address / FFL). */
export function formatAcquisitionName(e: BoundBookEntry): string {
  if (e.acquiredFromKind === "opening_inventory") {
    return `${e.acquiredFromName} (opening inventory)`;
  }
  return e.acquiredFromName ?? "";
}

/**
 * Acquisition address / license No. cell.
 * Nonlicensee → address; licensee → license No.; opening inventory → blank.
 */
export function formatAcquisitionAddressOrLicense(e: BoundBookEntry): string {
  switch (e.acquiredFromKind) {
    case "licensee":
      return e.acquiredFromFfl ? `FFL ${e.acquiredFromFfl}` : "";
    case "opening_inventory":
      return "";
    default:
      return e.acquiredFromAddress ?? "";
  }
}

/** Disposition “Name” cell — blank for Form 4473 / book-rollover refs. */
export function formatDispositionName(e: BoundBookEntry): string {
  if (e.status === "open" || !e.disposedToKind) return "";
  switch (e.disposedToKind) {
    case "form_4473":
    case "book_rollover_ref":
      return "";
    default:
      return e.disposedToName ?? "";
  }
}

/**
 * Disposition address / license No. / Form 4473 transaction No. cell
 * (Table 2 disposition locator column).
 */
export function formatDispositionAddressOrLocator(e: BoundBookEntry): string {
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

/** Combined “from whom” for compact UI/search (name + address/license). */
export function formatFromWhom(e: BoundBookEntry): string {
  return [formatAcquisitionName(e), formatAcquisitionAddressOrLicense(e)]
    .filter(Boolean)
    .join(" — ");
}

/** Combined “to whom” for compact UI/search. */
export function formatToWhom(e: BoundBookEntry): string {
  return [formatDispositionName(e), formatDispositionAddressOrLocator(e)]
    .filter(Boolean)
    .join(" — ");
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
    acquisitionName: formatAcquisitionName(e),
    acquisitionAddressOrLicense: formatAcquisitionAddressOrLicense(e),
    fromWhom: formatFromWhom(e),
    dispositionDate: e.dispositionDate ?? "",
    dispositionName: formatDispositionName(e),
    dispositionAddressOrLocator: formatDispositionAddressOrLocator(e),
    toWhom: formatToWhom(e),
  };
}
