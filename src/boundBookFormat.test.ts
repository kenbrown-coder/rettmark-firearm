import { describe, expect, it } from "vitest";
import {
  AD_COL,
  AD_GROUP,
  formatAcquisitionAddressOrLicense,
  formatAcquisitionName,
  formatDispositionAddressOrLocator,
  formatDispositionName,
  formatFromWhom,
  formatToWhom,
  paperColumns,
} from "./boundBookFormat";
import type { BoundBookEntry } from "./types";

function entry(partial: Partial<BoundBookEntry>): BoundBookEntry {
  return {
    id: 1,
    lineNumber: 1,
    status: "open",
    manufacturer: "Glock",
    importer: null,
    model: "19",
    serialNumber: "ABC123",
    firearmType: "Pistol",
    caliberOrGauge: "9mm",
    acquisitionDate: "2026-10-01",
    acquiredFromKind: "licensee",
    acquiredFromName: "Distributor LLC",
    acquiredFromAddress: null,
    acquiredFromFfl: "1-XX-XXX-XX-XX-99999",
    dispositionDate: null,
    disposedToKind: null,
    disposedToName: null,
    disposedToAddress: null,
    disposedToFfl: null,
    form4473TransactionNumber: null,
    dispositionReference: null,
    notes: null,
    createdAt: "2026-10-01T00:00:00Z",
    createdBy: "Ken Brown",
    supersedesEntryId: null,
    supersededByEntryId: null,
    correctionReason: null,
    isOriginalVersion: true,
    isEffective: true,
    ...partial,
  };
}

describe("boundBookFormat", () => {
  it("exposes Table 2 group labels Acquisitions / Dispositions", () => {
    expect(AD_GROUP.acquisitions).toBe("Acquisitions");
    expect(AD_GROUP.dispositions).toBe("Dispositions");
    expect(AD_COL.serialNo).toBe("Serial No.");
    expect(AD_COL.caliberOrGauge).toBe("Caliber or gauge");
  });

  it("separates licensee acquisition name from license No.", () => {
    const e = entry({});
    expect(formatAcquisitionName(e)).toBe("Distributor LLC");
    expect(formatAcquisitionAddressOrLicense(e)).toBe("FFL 1-XX-XXX-XX-XX-99999");
    expect(formatFromWhom(e)).toContain("FFL 1-XX-XXX-XX-XX-99999");
  });

  it("separates nonlicensee acquisition name from address", () => {
    const e = entry({
      acquiredFromKind: "nonlicensee",
      acquiredFromName: "Jane Doe",
      acquiredFromAddress: "1 Main St",
      acquiredFromFfl: null,
    });
    expect(formatAcquisitionName(e)).toBe("Jane Doe");
    expect(formatAcquisitionAddressOrLicense(e)).toBe("1 Main St");
    expect(formatFromWhom(e)).toBe("Jane Doe — 1 Main St");
  });

  it("puts Form 4473 txn No. in disposition locator column, not name", () => {
    const e = entry({
      status: "disposed",
      disposedToKind: "form_4473",
      form4473TransactionNumber: "4473-1001",
      dispositionDate: "2026-10-05",
    });
    expect(formatDispositionName(e)).toBe("");
    expect(formatDispositionAddressOrLocator(e)).toBe(
      "Form 4473 txn No. 4473-1001",
    );
    expect(formatToWhom(e)).toBe("Form 4473 txn No. 4473-1001");
  });

  it("separates licensee disposition name from FFL", () => {
    const e = entry({
      status: "disposed",
      disposedToKind: "licensee",
      disposedToName: "Other Dealer",
      disposedToFfl: "2-YY-YYY-YY-YY-11111",
      dispositionDate: "2026-10-05",
    });
    expect(formatDispositionName(e)).toBe("Other Dealer");
    expect(formatDispositionAddressOrLocator(e)).toBe("FFL 2-YY-YYY-YY-YY-11111");
  });

  it("leaves open disposition blank", () => {
    expect(formatDispositionName(entry({ status: "open" }))).toBe("");
    expect(formatDispositionAddressOrLocator(entry({ status: "open" }))).toBe("");
    expect(formatToWhom(entry({ status: "open" }))).toBe("");
  });

  it("builds paper columns with separate name and address fields", () => {
    const cols = paperColumns(
      entry({
        acquiredFromKind: "nonlicensee",
        acquiredFromName: "Jane Doe",
        acquiredFromAddress: "1 Main St",
        acquiredFromFfl: null,
      }),
    );
    expect(cols.serial).toBe("ABC123");
    expect(cols.manufacturerImporter).toBe("Glock");
    expect(cols.acquisitionName).toBe("Jane Doe");
    expect(cols.acquisitionAddressOrLicense).toBe("1 Main St");
    expect(cols.toWhom).toBe("");
  });
});
