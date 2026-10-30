# Changelog

All notable releases of **Rettmark Bound Book** (Windows desktop).

## 0.1.5 — 2026-10-30

### Changed
- **Inspection PDF polish:** Printable Inspection view and Export PDF drop instructional/UI copy (how-to blurbs, “click Export…”, “Edits are disabled…”, long electronic-alternate-method boilerplate). Letterhead keeps business name, FFL, form title, operator, line count, and sorted-by-acquisition-date.
- **Header contrast:** Group headers **Acquisitions** (mid green) vs **Dispositions** (charcoal) are clearly contrasting; column subheader rows use a lighter shade of each group. Screen Inspection view matches the PDF.

## 0.1.4 — 2026-10-30

### Changed
- **ATF IOI layout feedback (Albert J. DeSanto):** Inspection view, PDF export, bound-book grid, and CSV/ASCII now follow 27 CFR 478.125(e) Table 2 wording more closely — group headers **Acquisitions** (left) and **Dispositions** (right, darker), with **separate Name and Address** columns instead of a single cramped name+address cell.

## 0.1.3 — 2026-10-29

### Security
- Removed unrestricted `write_binary_file` IPC; inspection PDF writes only into a verified package folder (`MANIFEST.txt` + PDF magic check).
- Dropped unused Tauri `fs` and `opener` plugins and the previous full-filesystem `fs:scope`.
- Bound book DB open no longer accepts a caller-supplied path (local AppData only).
- Export / backup / restore paths reject relative paths and `..` traversal; restore requires `.rfbk`.
- Backup passphrase minimum raised to **12** characters; AES key material zeroized after use.
- Plaintext backup/restore snapshots use app Local AppData `tmp/` and are overwrite-shredded after use; pre-restore safety copies go under `pre-restore/`.
- SAMPLE wipe deletes only `SAMPLE-` serials (not live lines that merely mention the demo note).
- Browser-demo mode is compile-gated to Vite **DEV** only.
- Content Security Policy enabled for the WebView.
- Upgraded `jspdf` to 4.2.1 (clears known critical/high advisories in the previous 3.x line).

## 0.1.2 — 2026-10-28

### Fixed
- **Encrypted backup** failed on Windows because the live SQLite file is locked while the app is open. Backup now snapshots with `VACUUM INTO` a temp file, then writes the AES `.rfbk` to the chosen folder (OneDrive/Google Drive sync OK for the backup copy only). Errors surface clearly if the write fails.
- **Live DB location:** default path is now `%LOCALAPPDATA%\com.rettmark.firearm.boundbook\` (not Roaming). Existing Roaming DBs migrate once into Local AppData. Installed `.exe` was already under `%LOCALAPPDATA%\Rettmark Bound Book\`.
- Backup & license screen shows the live database path so you can confirm it is local.

## 0.1.1 — 2026-10-28

### Fixed / packaging
- Confirmed Windows NSIS (`.exe`) and MSI installers are real installable artifacts (not an empty folder).
- Rebuilt and restaged installers under `rettmark-firearm-releases/` and Desktop with a clearer README.
- Clarified that a successful per-user install places the app in `%LOCALAPPDATA%\Rettmark Bound Book\` and adds a Start Menu / Desktop shortcut named **Rettmark Bound Book**.

### Included from 0.1.0 line
- Local-first A&D bound book (Tauri + SQLite).
- SAMPLE/DEMO book, Inspection mode, **Export for ATF inspection** (PDF + CSV + ASCII + MANIFEST).
- Entry validation and ATF download reminder (Ruling 2016-1).

## 0.1.0 — 2026-10-28

- First Windows Tauri desktop build (`npm run tauri:build`) from branch `cursor/ffl-bound-book-mvp-d014`.
