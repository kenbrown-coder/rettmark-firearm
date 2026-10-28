use crate::backup;
use crate::db::AppDb;
use crate::export;
use crate::models::*;
use chrono::Utc;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{AppHandle, Manager, State};

pub struct DbState(pub Mutex<Option<AppDb>>);

fn with_db<T, F>(state: &DbState, f: F) -> Result<T, String>
where
    F: FnOnce(&AppDb) -> Result<T, String>,
{
    let guard = state.0.lock().map_err(|e| e.to_string())?;
    let db = guard.as_ref().ok_or_else(|| {
        "Database not open. Create or open a bound book first.".to_string()
    })?;
    f(db)
}

fn default_db_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?;
    Ok(dir.join("bound-book.sqlite"))
}

#[tauri::command]
pub fn get_db_status(state: State<'_, DbState>, app: AppHandle) -> Result<DbStatus, String> {
    let guard = state.0.lock().map_err(|e| e.to_string())?;
    if let Some(db) = guard.as_ref() {
        return db.status().map_err(|e| e.to_string());
    }
    let path = default_db_path(&app)?;
    Ok(DbStatus {
        path: path.display().to_string(),
        initialized: false,
        entry_count: 0,
        open_count: 0,
    })
}

#[tauri::command]
pub fn open_or_create_db(
    state: State<'_, DbState>,
    app: AppHandle,
    custom_path: Option<String>,
) -> Result<DbStatus, String> {
    let path = match custom_path {
        Some(p) if !p.trim().is_empty() => PathBuf::from(p),
        _ => default_db_path(&app)?,
    };
    let db = AppDb::open(path).map_err(|e| e.to_string())?;
    let status = db.status().map_err(|e| e.to_string())?;
    let mut guard = state.0.lock().map_err(|e| e.to_string())?;
    *guard = Some(db);
    Ok(status)
}

#[tauri::command]
pub fn get_license(state: State<'_, DbState>) -> Result<Option<License>, String> {
    with_db(&state, |db| db.get_license().map_err(|e| e.to_string()))
}

#[tauri::command]
pub fn save_license(
    state: State<'_, DbState>,
    input: LicenseInput,
) -> Result<License, String> {
    with_db(&state, |db| db.upsert_license(input).map_err(|e| e.to_string()))
}

#[tauri::command]
pub fn search_entries(
    state: State<'_, DbState>,
    query: SearchQuery,
) -> Result<Vec<BoundBookEntry>, String> {
    with_db(&state, |db| db.search(query).map_err(|e| e.to_string()))
}

#[tauri::command]
pub fn add_acquisition(
    state: State<'_, DbState>,
    input: AcquisitionInput,
) -> Result<BoundBookEntry, String> {
    with_db(&state, |db| {
        db.add_acquisition(input).map_err(|e| e.to_string())
    })
}

#[tauri::command]
pub fn record_disposition(
    state: State<'_, DbState>,
    input: DispositionInput,
) -> Result<BoundBookEntry, String> {
    with_db(&state, |db| {
        db.record_disposition(input).map_err(|e| e.to_string())
    })
}

#[tauri::command]
pub fn correct_entry(
    state: State<'_, DbState>,
    input: CorrectionInput,
) -> Result<BoundBookEntry, String> {
    with_db(&state, |db| db.correct_entry(input).map_err(|e| e.to_string()))
}

#[tauri::command]
pub fn get_entry(state: State<'_, DbState>, id: i64) -> Result<Option<BoundBookEntry>, String> {
    with_db(&state, |db| db.get_entry(id).map_err(|e| e.to_string()))
}

#[tauri::command]
pub fn get_backup_settings(state: State<'_, DbState>) -> Result<BackupSettings, String> {
    with_db(&state, |db| {
        let passphrase_set = db
            .get_setting("backup_passphrase_hash")
            .map_err(|e| e.to_string())?
            .is_some();
        Ok(BackupSettings {
            passphrase_set,
            backup_folder: db
                .get_setting("backup_folder")
                .map_err(|e| e.to_string())?,
            last_backup_at: db
                .get_setting("last_backup_at")
                .map_err(|e| e.to_string())?,
            last_atf_export_at: db
                .get_setting("last_atf_export_at")
                .map_err(|e| e.to_string())?,
        })
    })
}

#[tauri::command]
pub fn set_backup_folder(state: State<'_, DbState>, folder: String) -> Result<(), String> {
    with_db(&state, |db| {
        db.set_setting("backup_folder", folder.trim())
            .map_err(|e| e.to_string())
    })
}

#[tauri::command]
pub fn set_backup_passphrase(state: State<'_, DbState>, passphrase: String) -> Result<(), String> {
    if passphrase.trim().len() < 8 {
        return Err("Passphrase must be at least 8 characters".into());
    }
    // Marker only — passphrase is re-entered for each backup (not persisted in plaintext).
    let _ = passphrase;
    with_db(&state, |db| {
        db.set_setting("backup_passphrase_hash", "configured")
            .map_err(|e| e.to_string())?;
        Ok(())
    })
}

#[tauri::command]
pub fn run_encrypted_backup(
    state: State<'_, DbState>,
    passphrase: String,
    folder: Option<String>,
) -> Result<BackupResult, String> {
    with_db(&state, |db| {
        let folder = folder
            .filter(|s| !s.trim().is_empty())
            .or_else(|| db.get_setting("backup_folder").ok().flatten())
            .ok_or_else(|| {
                "Choose a backup folder (OneDrive or Google Drive sync path)".to_string()
            })?;
        let stamp = Utc::now().format("%Y%m%d-%H%M%S");
        let dest = PathBuf::from(&folder).join(format!("rettmark-bound-book-{stamp}.rfbk"));
        // Checkpoint WAL so the backup file is consistent
        {
            let conn = db.conn.lock().map_err(|e| e.to_string())?;
            conn.execute_batch("PRAGMA wal_checkpoint(TRUNCATE);")
                .map_err(|e| e.to_string())?;
        }
        let bytes = backup::encrypt_file_to(db.db_path(), &dest, passphrase.trim())
            .map_err(|e| e.to_string())?;
        let created_at = Utc::now().to_rfc3339();
        db.set_setting("backup_folder", &folder)
            .map_err(|e| e.to_string())?;
        db.set_setting("last_backup_at", &created_at)
            .map_err(|e| e.to_string())?;
        db.record_export(
            "backup",
            &dest.display().to_string(),
            0,
            Some("AES-256-GCM encrypted SQLite backup"),
        )
        .map_err(|e| e.to_string())?;
        Ok(BackupResult {
            path: dest.display().to_string(),
            created_at,
            bytes,
        })
    })
}

#[tauri::command]
pub fn export_csv(state: State<'_, DbState>, dest_path: String) -> Result<ExportResult, String> {
    with_db(&state, |db| {
        export::export_csv(db, &PathBuf::from(dest_path)).map_err(|e| e.to_string())
    })
}

#[tauri::command]
pub fn export_ascii(state: State<'_, DbState>, dest_path: String) -> Result<ExportResult, String> {
    with_db(&state, |db| {
        export::export_ascii(db, &PathBuf::from(dest_path)).map_err(|e| e.to_string())
    })
}

#[tauri::command]
pub fn list_entries_for_print(
    state: State<'_, DbState>,
    correction_view: Option<String>,
) -> Result<Vec<BoundBookEntry>, String> {
    with_db(&state, |db| {
        db.search(SearchQuery {
            correction_view: correction_view.or_else(|| Some("corrected".into())),
            ..Default::default()
        })
        .map_err(|e| e.to_string())
    })
}
