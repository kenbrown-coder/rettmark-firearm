export interface License {
  id: number;
  fflNumber: string;
  businessName: string;
  premisesNotes?: string | null;
  forms4473FiledNumerically: boolean;
  operatorName: string;
  createdAt: string;
}

export interface LicenseInput {
  fflNumber: string;
  businessName: string;
  premisesNotes?: string | null;
  forms4473FiledNumerically: boolean;
  operatorName: string;
}

export interface BoundBookEntry {
  id: number;
  lineNumber: number;
  status: string;
  manufacturer: string;
  importer?: string | null;
  model: string;
  serialNumber: string;
  firearmType: string;
  caliberOrGauge: string;
  acquisitionDate: string;
  acquiredFromKind: string;
  acquiredFromName: string;
  acquiredFromAddress?: string | null;
  acquiredFromFfl?: string | null;
  dispositionDate?: string | null;
  disposedToKind?: string | null;
  disposedToName?: string | null;
  disposedToAddress?: string | null;
  disposedToFfl?: string | null;
  form4473TransactionNumber?: string | null;
  dispositionReference?: string | null;
  notes?: string | null;
  createdAt: string;
  createdBy: string;
  supersedesEntryId?: number | null;
  supersededByEntryId?: number | null;
  correctionReason?: string | null;
  isOriginalVersion: boolean;
  isEffective: boolean;
}

export interface AcquisitionInput {
  manufacturer: string;
  importer?: string | null;
  model: string;
  serialNumber: string;
  firearmType: string;
  caliberOrGauge: string;
  acquisitionDate: string;
  acquiredFromKind: string;
  acquiredFromName: string;
  acquiredFromAddress?: string | null;
  acquiredFromFfl?: string | null;
  notes?: string | null;
}

export interface DispositionInput {
  entryId: number;
  dispositionDate: string;
  disposedToKind: string;
  disposedToName?: string | null;
  disposedToAddress?: string | null;
  disposedToFfl?: string | null;
  form4473TransactionNumber?: string | null;
  dispositionReference?: string | null;
  notes?: string | null;
}

export interface CorrectionInput {
  entryId: number;
  reason: string;
  manufacturer: string;
  importer?: string | null;
  model: string;
  serialNumber: string;
  firearmType: string;
  caliberOrGauge: string;
  acquisitionDate: string;
  acquiredFromKind: string;
  acquiredFromName: string;
  acquiredFromAddress?: string | null;
  acquiredFromFfl?: string | null;
  dispositionDate?: string | null;
  disposedToKind?: string | null;
  disposedToName?: string | null;
  disposedToAddress?: string | null;
  disposedToFfl?: string | null;
  form4473TransactionNumber?: string | null;
  dispositionReference?: string | null;
  notes?: string | null;
}

export interface SearchQuery {
  serial?: string;
  manufacturer?: string;
  name?: string;
  address?: string;
  form4473?: string;
  acquisitionDateFrom?: string;
  acquisitionDateTo?: string;
  correctionView?: "original" | "corrected" | "both";
  openOnly?: boolean;
}

export interface BackupSettings {
  passphraseSet: boolean;
  backupFolder?: string | null;
  lastBackupAt?: string | null;
  lastAtfExportAt?: string | null;
  backupDue: boolean;
}

export interface BackupResult {
  path: string;
  createdAt: string;
  bytes: number;
}

export interface RestoreResult {
  path: string;
  safetyCopyPath?: string | null;
  entryCount: number;
  openCount: number;
  restoredAt: string;
}

export interface ExportResult {
  path: string;
  kind: string;
  entryCount: number;
  createdAt: string;
}

export interface DbStatus {
  path: string;
  initialized: boolean;
  entryCount: number;
  openCount: number;
}

export type Panel =
  | "book"
  | "acquire"
  | "dispose"
  | "correct"
  | "inspect"
  | "export"
  | "settings"
  | "setup";
