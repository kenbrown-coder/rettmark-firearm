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
  SearchQuery,
} from "./types";

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
  listEntriesForPrint: (correctionView?: string) =>
    invoke<BoundBookEntry[]>("list_entries_for_print", {
      correctionView: correctionView ?? "corrected",
    }),
};

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
