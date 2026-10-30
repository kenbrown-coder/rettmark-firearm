/** § 478.125(e) required-field checks + soft warnings for live A&D entry. */

export type FieldErrors = Record<string, string>;

export type AcquisitionValues = {
  manufacturer: string;
  model: string;
  serialNumber: string;
  firearmType: string;
  caliberOrGauge: string;
  acquisitionDate: string;
  acquiredFromKind: string;
  acquiredFromName: string;
  acquiredFromAddress: string;
  acquiredFromFfl: string;
};

export type DispositionValues = {
  dispositionDate: string;
  disposedToKind: string;
  disposedToName: string;
  disposedToAddress: string;
  disposedToFfl: string;
  form4473TransactionNumber: string;
  dispositionReference: string;
  acquisitionDate?: string;
};

function blank(s: string | null | undefined): boolean {
  return !s || !s.trim();
}

export function validateAcquisition(v: AcquisitionValues): FieldErrors {
  const errors: FieldErrors = {};
  if (blank(v.manufacturer)) {
    errors.manufacturer = "Manufacturer is required (or “privately made firearm” / PMF).";
  }
  if (blank(v.model)) errors.model = "Model is required.";
  if (blank(v.serialNumber)) errors.serialNumber = "Serial number is required.";
  if (blank(v.firearmType)) errors.firearmType = "Type is required.";
  if (blank(v.caliberOrGauge)) errors.caliberOrGauge = "Caliber or gauge is required.";
  if (blank(v.acquisitionDate)) errors.acquisitionDate = "Date of receipt is required.";
  if (blank(v.acquiredFromName)) errors.acquiredFromName = "Name (from whom received) is required.";

  switch (v.acquiredFromKind) {
    case "nonlicensee":
      if (blank(v.acquiredFromAddress)) {
        errors.acquiredFromAddress =
          "Nonlicensee acquisition requires name and address.";
      }
      break;
    case "licensee":
      if (blank(v.acquiredFromFfl)) {
        errors.acquiredFromFfl = "Licensee acquisition requires FFL number.";
      }
      break;
    case "opening_inventory":
      break;
    case "other":
      // Still need a usable locator beyond name (address and/or FFL).
      if (blank(v.acquiredFromAddress) && blank(v.acquiredFromFfl)) {
        errors.acquiredFromAddress =
          "“Other” acquisition needs an address and/or FFL number (do not leave both blank).";
      }
      break;
    default:
      errors.acquiredFromKind = "Select how the firearm was received.";
  }
  return errors;
}

export function validateDisposition(v: DispositionValues): FieldErrors {
  const errors: FieldErrors = {};
  if (blank(v.dispositionDate)) {
    errors.dispositionDate = "Date of disposition is required.";
  }
  switch (v.disposedToKind) {
    case "nonlicensee":
      if (blank(v.disposedToName)) {
        errors.disposedToName = "Nonlicensee disposition requires name.";
      }
      if (blank(v.disposedToAddress)) {
        errors.disposedToAddress = "Nonlicensee disposition requires address.";
      }
      break;
    case "licensee":
      if (blank(v.disposedToFfl)) {
        errors.disposedToFfl = "Licensee disposition requires FFL number.";
      }
      if (blank(v.disposedToName)) {
        errors.disposedToName = "Licensee disposition requires name.";
      }
      break;
    case "form_4473":
      if (blank(v.form4473TransactionNumber)) {
        errors.form4473TransactionNumber =
          "Form 4473 disposition requires a transaction number.";
      }
      break;
    case "book_rollover_ref":
      if (blank(v.dispositionReference)) {
        errors.dispositionReference =
          "Book rollover requires a reference to the subsequent entry.";
      }
      break;
    case "other":
      if (blank(v.disposedToName)) {
        errors.disposedToName = "“Other” disposition requires a name.";
      }
      if (
        blank(v.disposedToAddress) &&
        blank(v.disposedToFfl) &&
        blank(v.form4473TransactionNumber) &&
        blank(v.dispositionReference)
      ) {
        errors.disposedToAddress =
          "“Other” disposition needs address, FFL, 4473 txn #, or a reference — at least one.";
      }
      break;
    default:
      errors.disposedToKind = "Select disposition kind.";
  }
  return errors;
}

export function acquisitionWarnings(
  v: AcquisitionValues,
  openDuplicateSerials: string[],
): string[] {
  const warnings: string[] = [];
  const serial = v.serialNumber.trim();
  if (serial && openDuplicateSerials.length > 0) {
    warnings.push(
      `Serial “${serial}” already appears on ${openDuplicateSerials.length} open inventory line(s). Confirm this is intentional (e.g. distinct frame/receiver) before saving.`,
    );
  }
  return warnings;
}

export function dispositionWarnings(v: DispositionValues): string[] {
  const warnings: string[] = [];
  if (
    !blank(v.dispositionDate) &&
    !blank(v.acquisitionDate) &&
    v.dispositionDate < (v.acquisitionDate ?? "")
  ) {
    warnings.push(
      `Disposition date (${v.dispositionDate}) is before acquisition date (${v.acquisitionDate}). Unusual for a bound-book line — confirm before saving.`,
    );
  }
  return warnings;
}

export function hasErrors(errors: FieldErrors): boolean {
  return Object.keys(errors).length > 0;
}
