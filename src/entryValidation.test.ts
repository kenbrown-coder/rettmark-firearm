import { describe, expect, it } from "vitest";
import {
  acquisitionWarnings,
  dispositionWarnings,
  hasErrors,
  validateAcquisition,
  validateDisposition,
} from "./entryValidation";

const goodAcq = {
  manufacturer: "Glock",
  model: "19",
  serialNumber: "ABC",
  firearmType: "Pistol",
  caliberOrGauge: "9mm",
  acquisitionDate: "2026-10-01",
  acquiredFromKind: "licensee",
  acquiredFromName: "Dist",
  acquiredFromAddress: "",
  acquiredFromFfl: "1-23",
};

describe("validateAcquisition", () => {
  it("requires firearm description fields", () => {
    const errors = validateAcquisition({ ...goodAcq, manufacturer: "", serialNumber: "" });
    expect(errors.manufacturer).toBeTruthy();
    expect(errors.serialNumber).toBeTruthy();
    expect(hasErrors(errors)).toBe(true);
  });

  it("requires address for nonlicensee", () => {
    const errors = validateAcquisition({
      ...goodAcq,
      acquiredFromKind: "nonlicensee",
      acquiredFromFfl: "",
      acquiredFromAddress: "",
    });
    expect(errors.acquiredFromAddress).toBeTruthy();
  });

  it("requires FFL for licensee", () => {
    const errors = validateAcquisition({ ...goodAcq, acquiredFromFfl: "" });
    expect(errors.acquiredFromFfl).toBeTruthy();
  });

  it("passes a complete licensee acquisition", () => {
    expect(hasErrors(validateAcquisition(goodAcq))).toBe(false);
  });

  it("rejects other acquisition with neither address nor FFL", () => {
    const errors = validateAcquisition({
      ...goodAcq,
      acquiredFromKind: "other",
      acquiredFromFfl: "",
      acquiredFromAddress: "",
    });
    expect(errors.acquiredFromAddress).toBeTruthy();
  });
});

describe("validateDisposition", () => {
  it("requires 4473 txn # for form_4473", () => {
    const errors = validateDisposition({
      dispositionDate: "2026-10-05",
      disposedToKind: "form_4473",
      disposedToName: "",
      disposedToAddress: "",
      disposedToFfl: "",
      form4473TransactionNumber: "",
      dispositionReference: "",
    });
    expect(errors.form4473TransactionNumber).toBeTruthy();
  });

  it("requires name+address for nonlicensee", () => {
    const errors = validateDisposition({
      dispositionDate: "2026-10-05",
      disposedToKind: "nonlicensee",
      disposedToName: "",
      disposedToAddress: "",
      disposedToFfl: "",
      form4473TransactionNumber: "",
      dispositionReference: "",
    });
    expect(errors.disposedToName).toBeTruthy();
    expect(errors.disposedToAddress).toBeTruthy();
  });

  it("rejects other disposition without locator fields", () => {
    const errors = validateDisposition({
      dispositionDate: "2026-10-05",
      disposedToKind: "other",
      disposedToName: "Someone",
      disposedToAddress: "",
      disposedToFfl: "",
      form4473TransactionNumber: "",
      dispositionReference: "",
    });
    expect(errors.disposedToAddress).toBeTruthy();
  });
});

describe("soft warnings", () => {
  it("warns on duplicate open serial", () => {
    const w = acquisitionWarnings(goodAcq, ["line 1"]);
    expect(w[0]).toMatch(/already appears/);
  });

  it("warns when disposition precedes acquisition", () => {
    const w = dispositionWarnings({
      dispositionDate: "2026-09-01",
      disposedToKind: "form_4473",
      disposedToName: "",
      disposedToAddress: "",
      disposedToFfl: "",
      form4473TransactionNumber: "1",
      dispositionReference: "",
      acquisitionDate: "2026-10-01",
    });
    expect(w[0]).toMatch(/before acquisition/);
  });
});
