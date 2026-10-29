use crate::backup;
use crate::db::AppDb;
use crate::export;
use crate::models::*;
use crate::sample::{self, SampleDemoStatus};
use chrono::{DateTime, Duration, Utc};
use std::fs;
use std::path::{Path, PathBuf};
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

/// Live bound book stays on the local machine (`%LOCALAPPDATA%` on Windows), not OneDrive.
/// Legacy Roaming `%APPDATA%` DBs are migrated once into Local on first open.
fn default_db_path(app: &AppHandle) -> Result<PathBuf, String> {
    let local_dir = app
        .path()
        .app_local_data_dir()
        .map_err(|e| e.to_string())?;
    fs::create_dir_all(&local_dir).map_err(|e| format!("create local app data dir: {e}"))?;
    let local_db = local_dir.join("bound-book.sqlite");

    if !local_db.exists() {
        if let Ok(roaming_dir) = app.path().app_data_dir() {
            let legacy = roaming_dir.join("bound-book.sqlite");
            if legacy.exists() {
                migrate_sqlite_to_local(&legacy, &local_db)?;
            }
        }
    }

    Ok(local_db)
}

fn migrate_sqlite_to_local(legacy: &Path, local_db: &Path) -> Result<(), String> {
    if let Some(parent) = local_db.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let conn = rusqlite::Connection::open(legacy)
        .map_err(|e| format!("open legacy Roaming DB for migrate: {e}"))?;
    conn.execute_batch("PRAGMA wal_checkpoint(TRUNCATE);")
        .map_err(|e| format!("checkpoint legacy DB: {e}"))?;
    let dest_sql = local_db.display().to_string().replace('\'', "''");
    let _ = fs::remove_file(local_db);
    conn.execute_batch(&format!("VACUUM INTO '{dest_sql}';"))
        .map_err(|e| format!("migrate DB to Local AppData (VACUUM INTO): {e}"))?;
    drop(conn);

    let archived = legacy.with_extension("sqlite.migrated-from-roaming");
    let _ = fs::rename(legacy, &archived);
    remove_sidecar_files(legacy);
    Ok(())
}

/// Consistent snapshot of the open DB into `dest` (Windows-safe; avoids reading a locked .sqlite).
fn snapshot_db_to(db: &AppDb, dest: &Path) -> Result<(), String> {
    if let Some(parent) = dest.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let _ = fs::remove_file(dest);
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    conn.execute_batch("PRAGMA wal_checkpoint(TRUNCATE);")
        .map_err(|e| format!("wal checkpoint before backup: {e}"))?;
    let dest_sql = dest.display().to_string().replace('\'', "''");
    conn.execute_batch(&format!("VACUUM INTO '{dest_sql}';"))
        .map_err(|e| format!("snapshot database for backup: {e}"))?;
    Ok(())
}

fn backup_is_due(last_backup_at: &Option<String>) -> bool {
    match last_backup_at {
        None => true,
        Some(s) => match DateTime::parse_from_rfc3339(s) {
            Ok(dt) => Utc::now() - dt.with_timezone(&Utc) > Duration::hours(24),
            Err(_) => true,
        },
    }
}

/// Local-system floor under Ruling 2016-1 is at least semiannual premises download/print.
fn atf_download_is_due(last_atf_export_at: &Option<String>) -> bool {
    match last_atf_export_at {
        None => true,
        Some(s) => match DateTime::parse_from_rfc3339(s) {
            Ok(dt) => Utc::now() - dt.with_timezone(&Utc) > Duration::days(183),
            Err(_) => true,
        },
    }
}

fn remove_sidecar_files(db_path: &Path) {
    let wal = PathBuf::from(format!("{}-wal", db_path.display()));
    let shm = PathBuf::from(format!("{}-shm", db_path.display()));
    let _ = fs::remove_file(wal);
    let _ = fs::remove_file(shm);
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
        let last_backup_at = db
            .get_setting("last_backup_at")
            .map_err(|e| e.to_string())?;
        let last_atf_export_at = db
            .get_setting("last_atf_export_at")
            .map_err(|e| e.to_string())?;
        let backup_due = backup_is_due(&last_backup_at);
        let atf_download_due = atf_download_is_due(&last_atf_export_at);
        Ok(BackupSettings {
            passphrase_set,
            backup_folder: db
                .get_setting("backup_folder")
                .map_err(|e| e.to_string())?,
            last_backup_at,
            last_atf_export_at,
            backup_due,
            atf_download_due,
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
    if passphrase.trim().len() < 8 {
        return Err("Passphrase must be at least 8 characters".into());
    }
    with_db(&state, |db| {
        let folder = folder
            .filter(|s| !s.trim().is_empty())
            .or_else(|| db.get_setting("backup_folder").ok().flatten())
            .ok_or_else(|| {
                "Choose a backup folder first (OneDrive or Google Drive sync path)".to_string()
            })?;
        let folder = folder.trim().to_string();
        let folder_path = PathBuf::from(&folder);
        if !folder_path.exists() {
            fs::create_dir_all(&folder_path).map_err(|e| {
                format!("Could not create backup folder '{folder}': {e}")
            })?;
        }
        if !folder_path.is_dir() {
            return Err(format!("Backup path is not a folder: {folder}"));
        }

        let stamp = Utc::now().format("%Y%m%d-%H%M%S");
        let dest = folder_path.join(format!("rettmark-bound-book-{stamp}.rfbk"));
        // Windows locks the live .sqlite while the app is open — snapshot via VACUUM INTO first.
        let snap = std::env::temp_dir().join(format!("rettmark-backup-snap-{stamp}.sqlite"));
        snapshot_db_to(db, &snap)?;
        let bytes = backup::encrypt_file_to(&snap, &dest, passphrase.trim()).map_err(|e| {
            let _ = fs::remove_file(&snap);
            format!("Encrypted backup failed: {e}")
        })?;
        let _ = fs::remove_file(&snap);

        if !dest.exists() {
            return Err(format!(
                "Backup reported success but file was not found at {}",
                dest.display()
            ));
        }

        let created_at = Utc::now().to_rfc3339();
        db.set_setting("backup_folder", &folder)
            .map_err(|e| e.to_string())?;
        db.set_setting("last_backup_at", &created_at)
            .map_err(|e| e.to_string())?;
        db.set_setting("backup_passphrase_hash", "configured")
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

/// Decrypt a `.rfbk` backup and replace the live DB.
/// Safety: current live DB is copied beside it before replacement.
#[tauri::command]
pub fn restore_from_backup(
    state: State<'_, DbState>,
    app: AppHandle,
    backup_path: String,
    passphrase: String,
) -> Result<RestoreResult, String> {
    if passphrase.trim().len() < 8 {
        return Err("Passphrase must be at least 8 characters".into());
    }
    let backup_path = PathBuf::from(backup_path.trim());
    if !backup_path.exists() {
        return Err("Backup file not found".into());
    }

    let live_path = {
        let guard = state.0.lock().map_err(|e| e.to_string())?;
        if let Some(db) = guard.as_ref() {
            // Flush WAL before we close
            let conn = db.conn.lock().map_err(|e| e.to_string())?;
            let _ = conn.execute_batch("PRAGMA wal_checkpoint(TRUNCATE);");
            db.db_path().to_path_buf()
        } else {
            default_db_path(&app)?
        }
    };

    let stamp = Utc::now().format("%Y%m%d-%H%M%S");
    let parent = live_path
        .parent()
        .map(Path::to_path_buf)
        .unwrap_or_else(|| PathBuf::from("."));
    let temp_decrypted = parent.join(format!("restore-temp-{stamp}.sqlite"));

    backup::decrypt_file_to(&backup_path, &temp_decrypted, passphrase.trim())
        .map_err(|e| e.to_string())?;

    if !backup::looks_like_sqlite(&temp_decrypted).map_err(|e| e.to_string())? {
        let _ = fs::remove_file(&temp_decrypted);
        return Err("Decrypted file is not a SQLite database".into());
    }

    // Validate schema without enabling WAL on the temp file
    {
        let probe = rusqlite::Connection::open(&temp_decrypted).map_err(|e| {
            let _ = fs::remove_file(&temp_decrypted);
            e.to_string()
        })?;
        let ok: bool = probe
            .query_row(
                "SELECT COUNT(*) > 0 FROM sqlite_master WHERE type='table' AND name='bound_book_entry'",
                [],
                |r| r.get(0),
            )
            .unwrap_or(false);
        if !ok {
            drop(probe);
            let _ = fs::remove_file(&temp_decrypted);
            return Err("Backup is not a Rettmark bound-book database".into());
        }
    }

    // Close live connection so we can replace the file
    {
        let mut guard = state.0.lock().map_err(|e| e.to_string())?;
        *guard = None;
    }

    let mut safety_copy_path: Option<String> = None;
    if live_path.exists() {
        let safety = parent.join(format!("bound-book.pre-restore-{stamp}.sqlite"));
        fs::copy(&live_path, &safety).map_err(|e| {
            format!("Could not create safety copy of current book before restore: {e}")
        })?;
        safety_copy_path = Some(safety.display().to_string());
    }

    remove_sidecar_files(&live_path);
    fs::copy(&temp_decrypted, &live_path)
        .map_err(|e| format!("Could not replace live database: {e}"))?;
    let _ = fs::remove_file(&temp_decrypted);
    remove_sidecar_files(&live_path);

    let db = AppDb::open(live_path.clone()).map_err(|e| e.to_string())?;
    let status = db.status().map_err(|e| e.to_string())?;
    let restored_at = Utc::now().to_rfc3339();
    db.audit(
        "restore_from_backup",
        "database",
        None,
        Some(&format!(
            "{{\"from\":{},\"safety\":{}}}",
            serde_json::to_string(&backup_path.display().to_string()).unwrap_or_default(),
            serde_json::to_string(&safety_copy_path).unwrap_or_default()
        )),
        "Ken Brown",
    )
    .map_err(|e| e.to_string())?;

    {
        let mut guard = state.0.lock().map_err(|e| e.to_string())?;
        *guard = Some(db);
    }

    Ok(RestoreResult {
        path: live_path.display().to_string(),
        safety_copy_path,
        entry_count: status.entry_count,
        open_count: status.open_count,
        restored_at,
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
pub fn export_inspection_package(
    state: State<'_, DbState>,
    dest_dir: String,
) -> Result<InspectionPackageResult, String> {
    with_db(&state, |db| {
        let base = PathBuf::from(dest_dir.trim());
        let package_dir = export::package_dir_with_stamp(&base);
        export::export_inspection_package(db, &package_dir).map_err(|e| e.to_string())
    })
}

#[tauri::command]
pub fn write_binary_file(dest_path: String, data_base64: String) -> Result<(), String> {
    use base64::Engine;
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(data_base64.trim())
        .map_err(|e| format!("invalid base64: {e}"))?;
    let path = PathBuf::from(dest_path);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(path, bytes).map_err(|e| e.to_string())
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

#[tauri::command]
pub fn find_open_by_serial(
    state: State<'_, DbState>,
    serial: String,
) -> Result<Vec<BoundBookEntry>, String> {
    with_db(&state, |db| {
        db.find_open_by_serial(&serial).map_err(|e| e.to_string())
    })
}

#[tauri::command]
pub fn get_sample_demo_status(state: State<'_, DbState>) -> Result<SampleDemoStatus, String> {
    with_db(&state, |db| sample::status(db).map_err(|e| e.to_string()))
}

#[tauri::command]
pub fn load_sample_demo(state: State<'_, DbState>) -> Result<SampleDemoStatus, String> {
    with_db(&state, |db| {
        sample::load_sample_demo(db).map_err(|e| e.to_string())
    })
}

#[tauri::command]
pub fn wipe_sample_demo(state: State<'_, DbState>) -> Result<SampleDemoStatus, String> {
    with_db(&state, |db| {
        sample::wipe_sample_demo(db).map_err(|e| e.to_string())
    })
}
