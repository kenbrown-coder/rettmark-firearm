//! Smoke-test encrypted backup without the GUI.
//! Usage: smoke_backup <db-sqlite-path> <dest-folder> <passphrase>

use std::env;
use std::path::PathBuf;
use std::process;

fn main() {
    let mut args = env::args().skip(1);
    let db = args
        .next()
        .map(PathBuf::from)
        .unwrap_or_else(|| {
            PathBuf::from(env::var("LOCALAPPDATA").unwrap_or_default())
                .join("com.rettmark.firearm.boundbook")
                .join("bound-book.sqlite")
        });
    let folder = args
        .next()
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from(r"C:\Users\kbrow\Rettmark-Bound-Book-Backups"));
    let pass = args.next().unwrap_or_else(|| "smoke-test-passphrase".into());

    match rettmark_firearm_lib::smoke_encrypted_backup(&db, &folder, &pass) {
        Ok(path) => {
            println!("OK {}", path.display());
            if let Ok(meta) = std::fs::metadata(&path) {
                println!("bytes={}", meta.len());
            }
        }
        Err(e) => {
            eprintln!("FAIL {e}");
            process::exit(1);
        }
    }
}
