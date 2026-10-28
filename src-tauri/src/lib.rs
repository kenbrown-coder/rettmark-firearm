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
