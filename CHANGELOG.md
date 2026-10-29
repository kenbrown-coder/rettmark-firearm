# Changelog

All notable releases of **Rettmark Bound Book** (Windows desktop).

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
