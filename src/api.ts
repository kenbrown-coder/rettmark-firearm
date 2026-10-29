import { invoke } from "@tauri-apps/api/core";
import { browserDemoApi, isBrowserDemo } from "./browserDemo";
import type {
  AcquisitionInput,
  BackupResult,
  BackupSettings,
  BoundBookEntry,
  CorrectionInput,
  DbStatus,
  DispositionInput,
  ExportResult,
  License,
  LicenseInput,
  RestoreResult,
  SampleDemoStatus,
  SearchQuery,
} from "./types";

export { formatFromWhom, formatToWhom } from "./boundBookFormat";

export interface InspectionPackageResult {
  directory: string;
  csvPath: string;
  asciiPath: string;
  manifestPath: string;
  entryCount: number;
  createdAt: string;
}

const useDemo = () => isBrowserDemo();

export const api = {
  getDbStatus: () =>
    useDemo() ? browserDemoApi.getDbStatus() : invoke<DbStatus>("get_db_status"),
  openOrCreateDb: () =>
    useDemo()
      ? browserDemoApi.openOrCreateDb()
      : invoke<DbStatus>("open_or_create_db"),
  getLicense: () =>
    useDemo() ? browserDemoApi.getLicense() : invoke<License | null>("get_license"),
  saveLicense: (input: LicenseInput) =>
    useDemo()
      ? browserDemoApi.saveLicense(input)
      : invoke<License>("save_license", { input }),
  searchEntries: (query: SearchQuery) =>
    useDemo()
      ? browserDemoApi.searchEntries(query)
      : invoke<BoundBookEntry[]>("search_entries", { query }),
  addAcquisition: (input: AcquisitionInput) =>
    useDemo()
      ? browserDemoApi.addAcquisition(input)
      : invoke<BoundBookEntry>("add_acquisition", { input }),
  recordDisposition: (input: DispositionInput) =>
    useDemo()
      ? browserDemoApi.recordDisposition(input)
      : invoke<BoundBookEntry>("record_disposition", { input }),
  correctEntry: (input: CorrectionInput) =>
    useDemo()
      ? browserDemoApi.correctEntry(input)
      : invoke<BoundBookEntry>("correct_entry", { input }),
  getEntry: (id: number) =>
    useDemo()
      ? browserDemoApi.getEntry(id)
      : invoke<BoundBookEntry | null>("get_entry", { id }),
  getBackupSettings: () =>
    useDemo()
      ? browserDemoApi.getBackupSettings()
      : invoke<BackupSettings>("get_backup_settings"),
  setBackupFolder: (folder: string) =>
    useDemo()
      ? browserDemoApi.setBackupFolder(folder)
      : invoke<void>("set_backup_folder", { folder }),
  setBackupPassphrase: (passphrase: string) =>
    useDemo()
      ? browserDemoApi.setBackupPassphrase()
      : invoke<void>("set_backup_passphrase", { passphrase }),
  runEncryptedBackup: (passphrase: string, folder?: string | null) =>
    useDemo()
      ? browserDemoApi.runEncryptedBackup()
      : invoke<BackupResult>("run_encrypted_backup", {
          passphrase,
          folder: folder ?? null,
        }),
  restoreFromBackup: (backupPath: string, passphrase: string) =>
    useDemo()
      ? browserDemoApi.restoreFromBackup()
      : invoke<RestoreResult>("restore_from_backup", { backupPath, passphrase }),
  exportCsv: (destPath: string) =>
    useDemo()
      ? browserDemoApi.exportCsv(destPath)
      : invoke<ExportResult>("export_csv", { destPath }),
  exportAscii: (destPath: string) =>
    useDemo()
      ? browserDemoApi.exportAscii(destPath)
      : invoke<ExportResult>("export_ascii", { destPath }),
  exportInspectionPackage: (destDir: string) =>
    useDemo()
      ? browserDemoApi.exportInspectionPackage(destDir)
      : invoke<InspectionPackageResult>("export_inspection_package", { destDir }),
  writeInspectionPdf: (packageDir: string, dataBase64: string) =>
    useDemo()
      ? browserDemoApi.writeInspectionPdf()
      : invoke<string>("write_inspection_pdf", { packageDir, dataBase64 }),
  listEntriesForPrint: (correctionView?: string) =>
    useDemo()
      ? browserDemoApi.listEntriesForPrint()
      : invoke<BoundBookEntry[]>("list_entries_for_print", {
          correctionView: correctionView ?? "corrected",
        }),
  findOpenBySerial: (serial: string) =>
    useDemo()
      ? browserDemoApi.findOpenBySerial(serial)
      : invoke<BoundBookEntry[]>("find_open_by_serial", { serial }),
  getSampleDemoStatus: () =>
    useDemo()
      ? browserDemoApi.getSampleDemoStatus()
      : invoke<SampleDemoStatus>("get_sample_demo_status"),
  loadSampleDemo: () =>
    useDemo()
      ? browserDemoApi.loadSampleDemo()
      : invoke<SampleDemoStatus>("load_sample_demo"),
  wipeSampleDemo: () =>
    useDemo()
      ? browserDemoApi.wipeSampleDemo()
      : invoke<SampleDemoStatus>("wipe_sample_demo"),
};
