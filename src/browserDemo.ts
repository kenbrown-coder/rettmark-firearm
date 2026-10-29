/**
 * In-browser demo store so `npm run dev` can show SAMPLE/DEMO data
 * without Tauri (for walkthrough capture / layout). Not used in production Tauri.
 */
import type {
  AcquisitionInput,
  BackupSettings,
  BoundBookEntry,
  CorrectionInput,
  DbStatus,
  DispositionInput,
  ExportResult,
  License,
  LicenseInput,
  SampleDemoStatus,
  SearchQuery,
} from "./types";
import type { InspectionPackageResult } from "./api";

const SAMPLE_NOTE =
  "[SAMPLE/DEMO — fictional data only; not a real A&D record]";

let license: License | null = null;
let entries: BoundBookEntry[] = [];
let nextId = 1;
let backupFolder: string | null = null;
let lastBackupAt: string | null = null;
let lastAtfExportAt: string | null = null;

function todayMinus(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

function seedSample() {
  license = {
    id: 1,
    fflNumber: "DEMO-NOT-A-REAL-FFL",
    businessName: "Rettmark Firearms (SAMPLE/DEMO)",
    premisesNotes:
      "SAMPLE/DEMO license profile — replace with real FFL before production use",
    forms4473FiledNumerically: true,
    operatorName: "Ken Brown",
    createdAt: new Date().toISOString(),
  };
  entries = [];
  nextId = 1;

  const push = (
    partial: Pick<
      BoundBookEntry,
      | "status"
      | "manufacturer"
      | "model"
      | "serialNumber"
      | "firearmType"
      | "caliberOrGauge"
      | "acquisitionDate"
      | "acquiredFromKind"
      | "acquiredFromName"
    > &
      Partial<BoundBookEntry> & { lineNumber: number },
  ) => {
    const e: BoundBookEntry = {
      id: nextId++,
      importer: null,
      acquiredFromAddress: null,
      acquiredFromFfl: null,
      dispositionDate: null,
      disposedToKind: null,
      disposedToName: null,
      disposedToAddress: null,
      disposedToFfl: null,
      form4473TransactionNumber: null,
      dispositionReference: null,
      notes: SAMPLE_NOTE,
      createdAt: new Date().toISOString(),
      createdBy: "Ken Brown",
      supersedesEntryId: null,
      supersededByEntryId: null,
      correctionReason: null,
      isOriginalVersion: true,
      isEffective: true,
      ...partial,
    };
    entries.push(e);
    return e;
  };

  push({
    lineNumber: 1,
    status: "open",
    manufacturer: "Glock",
    model: "19 Gen5",
    serialNumber: "SAMPLE-P19-001",
    firearmType: "Pistol",
    caliberOrGauge: "9mm",
    acquisitionDate: todayMinus(12),
    acquiredFromKind: "licensee",
    acquiredFromName: "SAMPLE Demo Distributors LLC",
    acquiredFromFfl: "DEMO-DIST-NOT-REAL",
    isOriginalVersion: true,
    isEffective: true,
  });
  push({
    lineNumber: 2,
    status: "open",
    manufacturer: "Ruger",
    model: "American Rifle",
    serialNumber: "SAMPLE-RIF-002",
    firearmType: "Rifle",
    caliberOrGauge: "308 Win",
    acquisitionDate: todayMinus(30),
    acquiredFromKind: "opening_inventory",
    acquiredFromName: "SAMPLE Opening Inventory",
    isOriginalVersion: true,
    isEffective: true,
  });
  push({
    lineNumber: 3,
    status: "disposed",
    manufacturer: "Smith & Wesson",
    model: "M&P Shield",
    serialNumber: "SAMPLE-P9-003",
    firearmType: "Pistol",
    caliberOrGauge: "9mm",
    acquisitionDate: todayMinus(20),
    acquiredFromKind: "licensee",
    acquiredFromName: "SAMPLE Demo Distributors LLC",
    acquiredFromFfl: "DEMO-DIST-NOT-REAL",
    dispositionDate: todayMinus(5),
    disposedToKind: "form_4473",
    form4473TransactionNumber: "SAMPLE-4473-1001",
    isOriginalVersion: true,
    isEffective: true,
  });
  push({
    lineNumber: 4,
    status: "disposed",
    manufacturer: "Remington",
    model: "870",
    serialNumber: "SAMPLE-SG-004",
    firearmType: "Shotgun",
    caliberOrGauge: "12 ga",
    acquisitionDate: todayMinus(25),
    acquiredFromKind: "nonlicensee",
    acquiredFromName: "SAMPLE Jane Q. Public",
    acquiredFromAddress: "100 Demo Street, Sampletown, ST 00000",
    dispositionDate: todayMinus(8),
    disposedToKind: "licensee",
    disposedToName: "SAMPLE Other Dealer Inc",
    disposedToFfl: "DEMO-OTHER-DEALER",
    isOriginalVersion: true,
    isEffective: true,
  });
  const orig = push({
    lineNumber: 5,
    status: "superseded",
    manufacturer: "privately made firearm",
    model: "SAMPLE PMF Pistol",
    serialNumber: "SAMPLE-PMF-005X",
    firearmType: "Pistol",
    caliberOrGauge: "9mm",
    acquisitionDate: todayMinus(15),
    acquiredFromKind: "nonlicensee",
    acquiredFromName: "SAMPLE Alex Maker",
    acquiredFromAddress: "200 Fiction Ave, Demo City, ST 00000",
    isOriginalVersion: true,
    isEffective: false,
  });
  const corr = push({
    lineNumber: 5,
    status: "open",
    manufacturer: "privately made firearm",
    model: "SAMPLE PMF Pistol",
    serialNumber: "SAMPLE-PMF-005",
    firearmType: "Pistol",
    caliberOrGauge: "9mm",
    acquisitionDate: todayMinus(15),
    acquiredFromKind: "nonlicensee",
    acquiredFromName: "SAMPLE Alex Maker",
    acquiredFromAddress: "200 Fiction Ave, Demo City, ST 00000",
    isOriginalVersion: false,
    isEffective: true,
    supersedesEntryId: orig.id,
    correctionReason: "SAMPLE/DEMO: fix transposed serial digit",
  });
  orig.supersededByEntryId = corr.id;
}

export function isBrowserDemo(): boolean {
  return typeof window !== "undefined" && !(window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
}

function filterEntries(query: SearchQuery): BoundBookEntry[] {
  const view = query.correctionView ?? "corrected";
  let list = [...entries];
  if (view === "corrected") list = list.filter((e) => e.isEffective);
  else if (view === "original") list = list.filter((e) => e.isOriginalVersion);
  if (query.openOnly) list = list.filter((e) => e.status === "open" && e.isEffective);
  if (query.serial?.trim()) {
    const s = query.serial.trim().toLowerCase();
    list = list.filter((e) => e.serialNumber.toLowerCase().includes(s));
  }
  return list.sort((a, b) => {
    const d = a.acquisitionDate.localeCompare(b.acquisitionDate);
    return d !== 0 ? d : a.lineNumber - b.lineNumber;
  });
}

export const browserDemoApi = {
  getDbStatus: async (): Promise<DbStatus> => ({
    path: "(browser demo — not Tauri SQLite)",
    initialized: !!license,
    entryCount: entries.filter((e) => e.isEffective).length,
    openCount: entries.filter((e) => e.status === "open" && e.isEffective).length,
  }),
  openOrCreateDb: async () => {
    maybeAutoloadSample();
    return browserDemoApi.getDbStatus();
  },
  getLicense: async () => license,
  saveLicense: async (input: LicenseInput): Promise<License> => {
    license = {
      id: 1,
      fflNumber: input.fflNumber,
      businessName: input.businessName,
      premisesNotes: input.premisesNotes ?? null,
      forms4473FiledNumerically: input.forms4473FiledNumerically,
      operatorName: input.operatorName,
      createdAt: license?.createdAt ?? new Date().toISOString(),
    };
    return license;
  },
  searchEntries: async (query: SearchQuery) => filterEntries(query),
  addAcquisition: async (input: AcquisitionInput): Promise<BoundBookEntry> => {
    const lineNumber = Math.max(0, ...entries.map((e) => e.lineNumber)) + 1;
    const e: BoundBookEntry = {
      id: nextId++,
      lineNumber,
      status: "open",
      manufacturer: input.manufacturer,
      importer: input.importer ?? null,
      model: input.model,
      serialNumber: input.serialNumber,
      firearmType: input.firearmType,
      caliberOrGauge: input.caliberOrGauge,
      acquisitionDate: input.acquisitionDate,
      acquiredFromKind: input.acquiredFromKind,
      acquiredFromName: input.acquiredFromName,
      acquiredFromAddress: input.acquiredFromAddress ?? null,
      acquiredFromFfl: input.acquiredFromFfl ?? null,
      dispositionDate: null,
      disposedToKind: null,
      disposedToName: null,
      disposedToAddress: null,
      disposedToFfl: null,
      form4473TransactionNumber: null,
      dispositionReference: null,
      notes: input.notes ?? null,
      createdAt: new Date().toISOString(),
      createdBy: "Ken Brown",
      supersedesEntryId: null,
      supersededByEntryId: null,
      correctionReason: null,
      isOriginalVersion: true,
      isEffective: true,
    };
    entries.push(e);
    return e;
  },
  recordDisposition: async (input: DispositionInput): Promise<BoundBookEntry> => {
    const e = entries.find((x) => x.id === input.entryId);
    if (!e) throw new Error("Entry not found");
    e.status = "disposed";
    e.dispositionDate = input.dispositionDate;
    e.disposedToKind = input.disposedToKind;
    e.disposedToName = input.disposedToName ?? null;
    e.disposedToAddress = input.disposedToAddress ?? null;
    e.disposedToFfl = input.disposedToFfl ?? null;
    e.form4473TransactionNumber = input.form4473TransactionNumber ?? null;
    e.dispositionReference = input.dispositionReference ?? null;
    return e;
  },
  correctEntry: async (_input: CorrectionInput): Promise<BoundBookEntry> => {
    throw new Error("Correction not implemented in browser demo");
  },
  getEntry: async (id: number) => entries.find((e) => e.id === id) ?? null,
  getBackupSettings: async (): Promise<BackupSettings> => ({
    passphraseSet: false,
    backupFolder,
    lastBackupAt,
    lastAtfExportAt,
    backupDue: true,
    atfDownloadDue: true,
  }),
  setBackupFolder: async (folder: string) => {
    backupFolder = folder;
  },
  setBackupPassphrase: async () => {},
  runEncryptedBackup: async () => {
    throw new Error("Backup requires the Tauri desktop app");
  },
  restoreFromBackup: async () => {
    throw new Error("Restore requires the Tauri desktop app");
  },
  exportCsv: async (destPath: string): Promise<ExportResult> => ({
    path: destPath,
    kind: "csv",
    entryCount: filterEntries({ correctionView: "corrected" }).length,
    createdAt: new Date().toISOString(),
  }),
  exportAscii: async (destPath: string): Promise<ExportResult> => ({
    path: destPath,
    kind: "atf_download",
    entryCount: filterEntries({ correctionView: "corrected" }).length,
    createdAt: new Date().toISOString(),
  }),
  exportInspectionPackage: async (destDir: string): Promise<InspectionPackageResult> => {
    const createdAt = new Date().toISOString();
    lastAtfExportAt = createdAt;
    const n = filterEntries({ correctionView: "corrected" }).length;
    return {
      directory: `${destDir}/rettmark-inspection-demo`,
      csvPath: `${destDir}/rettmark-inspection-demo/rettmark-ad.csv`,
      asciiPath: `${destDir}/rettmark-inspection-demo/rettmark-ad.txt`,
      manifestPath: `${destDir}/rettmark-inspection-demo/MANIFEST.txt`,
      entryCount: n,
      createdAt,
    };
  },
  writeBinaryFile: async () => {},
  listEntriesForPrint: async () => filterEntries({ correctionView: "corrected" }),
  findOpenBySerial: async (serial: string) =>
    entries.filter(
      (e) => e.isEffective && e.status === "open" && e.serialNumber === serial.trim(),
    ),
  getSampleDemoStatus: async (): Promise<SampleDemoStatus> => {
    const sampleCount = entries.filter(
      (e) => e.serialNumber.startsWith("SAMPLE-") || (e.notes ?? "").includes("SAMPLE/DEMO"),
    ).length;
    return {
      loaded: sampleCount > 0,
      sampleCount,
      nonSampleCount: entries.length - sampleCount,
    };
  },
  loadSampleDemo: async () => {
    seedSample();
    return browserDemoApi.getSampleDemoStatus();
  },
  wipeSampleDemo: async () => {
    entries = entries.filter(
      (e) =>
        !(e.serialNumber.startsWith("SAMPLE-") || (e.notes ?? "").includes("SAMPLE/DEMO")),
    );
    return browserDemoApi.getSampleDemoStatus();
  },
};

/** Auto-seed sample book for walkthrough capture when ?demo=1 or always in browser. */
export function maybeAutoloadSample() {
  if (isBrowserDemo() && entries.length === 0) {
    seedSample();
  }
}
