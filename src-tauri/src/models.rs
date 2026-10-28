use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct License {
    pub id: i64,
    pub ffl_number: String,
    pub business_name: String,
    pub premises_notes: Option<String>,
    pub forms_4473_filed_numerically: bool,
    pub operator_name: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LicenseInput {
    pub ffl_number: String,
    pub business_name: String,
    pub premises_notes: Option<String>,
    pub forms_4473_filed_numerically: bool,
    pub operator_name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BoundBookEntry {
    pub id: i64,
    pub line_number: i64,
    pub status: String,
    pub manufacturer: String,
    pub importer: Option<String>,
    pub model: String,
    pub serial_number: String,
    pub firearm_type: String,
    pub caliber_or_gauge: String,
    pub acquisition_date: String,
    pub acquired_from_kind: String,
    pub acquired_from_name: String,
    pub acquired_from_address: Option<String>,
    pub acquired_from_ffl: Option<String>,
    pub disposition_date: Option<String>,
    pub disposed_to_kind: Option<String>,
    pub disposed_to_name: Option<String>,
    pub disposed_to_address: Option<String>,
    pub disposed_to_ffl: Option<String>,
    pub form_4473_transaction_number: Option<String>,
    pub disposition_reference: Option<String>,
    pub notes: Option<String>,
    pub created_at: String,
    pub created_by: String,
    pub supersedes_entry_id: Option<i64>,
    pub superseded_by_entry_id: Option<i64>,
    pub correction_reason: Option<String>,
    pub is_original_version: bool,
    pub is_effective: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AcquisitionInput {
    pub manufacturer: String,
    pub importer: Option<String>,
    pub model: String,
    pub serial_number: String,
    pub firearm_type: String,
    pub caliber_or_gauge: String,
    pub acquisition_date: String,
    pub acquired_from_kind: String,
    pub acquired_from_name: String,
    pub acquired_from_address: Option<String>,
    pub acquired_from_ffl: Option<String>,
    pub notes: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DispositionInput {
    pub entry_id: i64,
    pub disposition_date: String,
    pub disposed_to_kind: String,
    pub disposed_to_name: Option<String>,
    pub disposed_to_address: Option<String>,
    pub disposed_to_ffl: Option<String>,
    pub form_4473_transaction_number: Option<String>,
    pub disposition_reference: Option<String>,
    pub notes: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CorrectionInput {
    pub entry_id: i64,
    pub reason: String,
    pub manufacturer: String,
    pub importer: Option<String>,
    pub model: String,
    pub serial_number: String,
    pub firearm_type: String,
    pub caliber_or_gauge: String,
    pub acquisition_date: String,
    pub acquired_from_kind: String,
    pub acquired_from_name: String,
    pub acquired_from_address: Option<String>,
    pub acquired_from_ffl: Option<String>,
    pub disposition_date: Option<String>,
    pub disposed_to_kind: Option<String>,
    pub disposed_to_name: Option<String>,
    pub disposed_to_address: Option<String>,
    pub disposed_to_ffl: Option<String>,
    pub form_4473_transaction_number: Option<String>,
    pub disposition_reference: Option<String>,
    pub notes: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct SearchQuery {
    pub serial: Option<String>,
    pub manufacturer: Option<String>,
    pub name: Option<String>,
    pub address: Option<String>,
    pub form_4473: Option<String>,
    pub acquisition_date_from: Option<String>,
    pub acquisition_date_to: Option<String>,
    /// original | corrected | both
    pub correction_view: Option<String>,
    pub open_only: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupSettings {
    pub passphrase_set: bool,
    pub backup_folder: Option<String>,
    pub last_backup_at: Option<String>,
    pub last_atf_export_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupResult {
    pub path: String,
    pub created_at: String,
    pub bytes: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportResult {
    pub path: String,
    pub kind: String,
    pub entry_count: i64,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DbStatus {
    pub path: String,
    pub initialized: bool,
    pub entry_count: i64,
    pub open_count: i64,
}
