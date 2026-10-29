mod backup;
mod commands;
mod db;
#[cfg(test)]
mod db_tests;
mod export;
mod models;
mod sample;

use commands::DbState;
use std::sync::Mutex;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .manage(DbState(Mutex::new(None)))
        .invoke_handler(tauri::generate_handler![
            commands::get_db_status,
            commands::open_or_create_db,
            commands::get_license,
            commands::save_license,
            commands::search_entries,
            commands::add_acquisition,
            commands::record_disposition,
            commands::correct_entry,
            commands::get_entry,
            commands::get_backup_settings,
            commands::set_backup_folder,
            commands::set_backup_passphrase,
            commands::run_encrypted_backup,
            commands::restore_from_backup,
            commands::export_csv,
            commands::export_ascii,
            commands::export_inspection_package,
            commands::write_binary_file,
            commands::list_entries_for_print,
            commands::find_open_by_serial,
            commands::get_sample_demo_status,
            commands::load_sample_demo,
            commands::wipe_sample_demo,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

/// Smoke / tooling: snapshot a DB and write an encrypted `.rfbk` (Windows-safe).
pub fn smoke_encrypted_backup(
    db_path: &std::path::Path,
    dest_folder: &std::path::Path,
    passphrase: &str,
) -> Result<std::path::PathBuf, String> {
    use chrono::Utc;
    use std::fs;

    if passphrase.trim().len() < 8 {
        return Err("Passphrase must be at least 8 characters".into());
    }
    fs::create_dir_all(dest_folder).map_err(|e| e.to_string())?;
    let db = db::AppDb::open(db_path.to_path_buf()).map_err(|e| e.to_string())?;
    let stamp = Utc::now().format("%Y%m%d-%H%M%S");
    let snap = std::env::temp_dir().join(format!("rettmark-smoke-snap-{stamp}.sqlite"));
    let dest = dest_folder.join(format!("rettmark-bound-book-{stamp}.rfbk"));
    {
        let conn = db.conn.lock().map_err(|e| e.to_string())?;
        conn.execute_batch("PRAGMA wal_checkpoint(TRUNCATE);")
            .map_err(|e| e.to_string())?;
        let dest_sql = snap.display().to_string().replace('\'', "''");
        let _ = fs::remove_file(&snap);
        conn.execute_batch(&format!("VACUUM INTO '{dest_sql}';"))
            .map_err(|e| format!("snapshot: {e}"))?;
    }
    let _bytes =
        backup::encrypt_file_to(&snap, &dest, passphrase.trim()).map_err(|e| e.to_string())?;
    let _ = fs::remove_file(&snap);
    if !dest.exists() {
        return Err(format!("backup missing at {}", dest.display()));
    }
    Ok(dest)
}
