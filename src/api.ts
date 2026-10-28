import { invoke } from "@tauri-apps/api/core";
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

export const api = {
  getDbStatus: () => invoke<DbStatus>("get_db_status"),
  openOrCreateDb: (customPath?: string | null) =>
    invoke<DbStatus>("open_or_create_db", { customPath: customPath ?? null }),
  getLicense: () => invoke<License | null>("get_license"),
  saveLicense: (input: LicenseInput) => invoke<License>("save_license", { input }),
  searchEntries: (query: SearchQuery) =>
    invoke<BoundBookEntry[]>("search_entries", { query }),
  addAcquisition: (input: AcquisitionInput) =>
    invoke<BoundBookEntry>("add_acquisition", { input }),
  recordDisposition: (input: DispositionInput) =>
    invoke<BoundBookEntry>("record_disposition", { input }),
  correctEntry: (input: CorrectionInput) =>
    invoke<BoundBookEntry>("correct_entry", { input }),
  getEntry: (id: number) => invoke<BoundBookEntry | null>("get_entry", { id }),
  getBackupSettings: () => invoke<BackupSettings>("get_backup_settings"),
  setBackupFolder: (folder: string) =>
    invoke<void>("set_backup_folder", { folder }),
  setBackupPassphrase: (passphrase: string) =>
    invoke<void>("set_backup_passphrase", { passphrase }),
  runEncryptedBackup: (passphrase: string, folder?: string | null) =>
    invoke<BackupResult>("run_encrypted_backup", {
      passphrase,
      folder: folder ?? null,
    }),
  restoreFromBackup: (backupPath: string, passphrase: string) =>
    invoke<RestoreResult>("restore_from_backup", { backupPath, passphrase }),
  exportCsv: (destPath: string) =>
    invoke<ExportResult>("export_csv", { destPath }),
  exportAscii: (destPath: string) =>
    invoke<ExportResult>("export_ascii", { destPath }),
  exportInspectionPackage: (destDir: string) =>
    invoke<InspectionPackageResult>("export_inspection_package", { destDir }),
  writeBinaryFile: (destPath: string, dataBase64: string) =>
    invoke<void>("write_binary_file", { destPath, dataBase64 }),
  listEntriesForPrint: (correctionView?: string) =>
    invoke<BoundBookEntry[]>("list_entries_for_print", {
      correctionView: correctionView ?? "corrected",
    }),
  findOpenBySerial: (serial: string) =>
    invoke<BoundBookEntry[]>("find_open_by_serial", { serial }),
  getSampleDemoStatus: () => invoke<SampleDemoStatus>("get_sample_demo_status"),
  loadSampleDemo: () => invoke<SampleDemoStatus>("load_sample_demo"),
  wipeSampleDemo: () => invoke<SampleDemoStatus>("wipe_sample_demo"),
};
