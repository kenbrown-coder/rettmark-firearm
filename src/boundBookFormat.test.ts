import { describe, expect, it } from "vitest";
import { formatFromWhom, formatToWhom, paperColumns } from "./boundBookFormat";
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
  it("formats licensee acquisition", () => {
    expect(formatFromWhom(entry({}))).toContain("FFL 1-XX-XXX-XX-XX-99999");
  });

  it("formats nonlicensee acquisition with address", () => {
    expect(
      formatFromWhom(
        entry({
          acquiredFromKind: "nonlicensee",
          acquiredFromName: "Jane Doe",
          acquiredFromAddress: "1 Main St",
          acquiredFromFfl: null,
        }),
      ),
    ).toBe("Jane Doe — 1 Main St");
  });

  it("formats 4473 disposition", () => {
    expect(
      formatToWhom(
        entry({
          status: "disposed",
          disposedToKind: "form_4473",
          form4473TransactionNumber: "4473-1001",
          dispositionDate: "2026-10-05",
        }),
      ),
    ).toBe("4473 # 4473-1001");
  });

  it("leaves open disposition blank", () => {
    expect(formatToWhom(entry({ status: "open" }))).toBe("");
  });

  it("builds paper columns for inspection view", () => {
    const cols = paperColumns(entry({}));
    expect(cols.serial).toBe("ABC123");
    expect(cols.manufacturerImporter).toBe("Glock");
    expect(cols.toWhom).toBe("");
  });
});
