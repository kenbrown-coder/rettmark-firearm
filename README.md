# Rettmark Firearms — Digital FFL A&D Bound Book

Local-first desktop app for **Rettmark Firearms** (Ken Brown) to keep the dealer Acquisition & Disposition “bound book” electronically: same columns as the paper book under [27 CFR 478.125(e)](https://www.ecfr.gov/current/title-27/chapter-II/subchapter-B/part-478/subpart-H/section-478.125), with search, non-destructive corrections, print/export, and encrypted offsite backup.

**Stack:** Tauri 2 · React · TypeScript · Vite · SQLite  
**Primary target:** Windows 10/11 premises PC (WebView2)

---

## Disclaimer

**ATF does not certify or endorse commercial software.** This application is a recordkeeping aid, **not legal advice**, and not a substitute for reading the regulations or consulting a firearms-compliance attorney. The FFL remains responsible for accurate, timely, and inspection-ready records under the Gun Control Act, 27 CFR Part 478, and [ATF Ruling 2016-1](https://www.atf.gov/firearms/docs/ruling/2016-1-requirements-keep-firearms-records-electronically).

---

## What this MVP does

- Create/open a **local SQLite** bound-book database on the premises PC
- **License setup** (FFL #, business name, 4473 numeric-filing flag)
- **Acquisition** lines with firearm description + from-whom fields
- **Disposition** on an open line (address / FFL / Form 4473 txn #)
- **Search** by serial, manufacturer/importer, name, address, 4473 #, acquisition date range; open-inventory filter; original / corrected / both views
- **Corrections** without destroying the original (Ruling 2016-1 method a)
- **Print / PDF / CSV / ASCII** export in acquisition-date order
- **Inspection mode** (read-only paper-column view) and **Export for ATF inspection** (unencrypted PDF + CSV + ASCII + MANIFEST)
- **SAMPLE/DEMO book** — one-click fictional lines (clearly marked); wipe anytime
- **Encrypted backup** (AES-256-GCM + Argon2id passphrase) to a user-chosen sync folder (OneDrive or Google Drive), with restore

**Out of scope for v1:** e4473, POS, multi-user/roles, multi-FFL, NFA/gunsmith books, cloud SaaS hosting.

### Working assumptions (defaults while Ken reviews)

- **License:** Type 01 dealer A&D only (no gunsmithing / NFA books in v1)
- **Cutover:** Electronic going forward — no paper-book import yet
- **Disposition:** Form 4473 transaction number is the default retail path when provided / when 4473s are filed numerically
- **Users:** Single operator (Ken Brown / Rettmark Firearms)
- **Sync folder:** Ken chooses whichever OneDrive or Google Drive path he already uses

---

## Windows prerequisites (recommended)

Install these on the shop PC before the first run:

1. **[Node.js 20 LTS or newer](https://nodejs.org/)** (includes npm).  
   Confirm in PowerShell: `node -v` and `npm -v`.
2. **[Rust (rustup)](https://rustup.rs/)** — install `stable` toolchain for `x86_64-pc-windows-msvc`.  
   Confirm: `rustc -V` and `cargo -V`.
3. **Microsoft C++ Build Tools** (needed to compile Tauri/native deps):  
   - [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/)  
   - Select workload **“Desktop development with C++”** (MSVC + Windows SDK).
4. **WebView2 Runtime** — usually already on Windows 10/11. If the app window fails to open, install the [Evergreen WebView2 Runtime](https://developer.microsoft.com/microsoft-edge/webview2/).
5. Optional but helpful: [Git for Windows](https://git-scm.com/download/win).

Full Tauri notes: [Tauri 2 — Prerequisites (Windows)](https://v2.tauri.app/start/prerequisites/#windows).

### macOS / Linux (secondary)

- macOS: Xcode CLT + Rust + Node  
- Linux: WebKitGTK 4.1 and related packages per [Tauri Linux prerequisites](https://v2.tauri.app/start/prerequisites/#linux)

---

## Run on Windows (development)

In **PowerShell** or **Command Prompt**:

```powershell
git clone https://github.com/kenbrown-coder/rettmark-firearm.git
cd rettmark-firearm
git checkout cursor/ffl-bound-book-mvp-d014
npm install
npm run tauri:dev
```

First `tauri:dev` compiles Rust and can take several minutes. A desktop window titled **Rettmark Firearms — A&D Bound Book** should open. The SQLite file lives under the Windows app data directory (path shown in **Backup & license**).

Frontend-only (layout only — native DB/backup commands will not work in a plain browser):

```powershell
npm run dev
```

### Release build on Windows (on Ken’s PC)

Cross-compiling Windows installers from Linux CI/this cloud agent is **not** how we ship for Ken. Build on the Windows machine:

```powershell
npm run tauri:build
```

Artifacts typically land under:

`src-tauri\target\release\bundle\`  
(e.g. `.msi` / NSIS `.exe` depending on Tauri bundle config)

This cloud environment produced **Linux** `.deb` / `.rpm` / `.AppImage` only — use those for Linux smoke, not for the shop PC.

### Tests / smoke

```powershell
npm test
npm run build
cd src-tauri
cargo test
```

---

## First 10 minutes

### Fastest path (SAMPLE/DEMO)

1. `npm run tauri:dev` and wait for the window.
2. On first launch click **Try SAMPLE/DEMO book** (fictional FFL + lines — not a real record).
3. Bound book shows open (highlighted) and disposed SAMPLE lines; banner says SAMPLE/DEMO.
4. Click an **open** line → **Record disposition** (or browse **Disposition**).
5. Open **Inspection** → optionally **Export inspection package** to a folder.
6. **Backup now** → **Choose folder…** (OneDrive/Google Drive) → passphrase → backup.
7. When finished exploring: **Wipe sample data** (banner or **Backup & license**).

### Live book path

1. Enter your real FFL profile → **Open bound book**.
2. **Acquisition** → commit a receipt line (or start from empty-book CTA).
3. Select open line → **Disposition** (4473 txn # by default when applicable).
4. **Inspection** / export package; set backup folder and run encrypted backup.

Do **not** mix SAMPLE/DEMO rows into a book that already has real lines — the app refuses to load demo into a non-sample book. Wipe sample first, or use a fresh install/profile.

---

## Backup setup (Two copies)

1. Open **Backup & license** (or click **Backup now** in the header).
2. Click **Choose folder…** and pick a folder that syncs with OneDrive or Google Drive.
3. Choose a strong **passphrase** (12+ characters). The passphrase is **not** stored in plaintext; enter it each time you run a backup.
4. Click **Run encrypted backup now** (or use the **Backup now** dialog).

The app writes a `.rfbk` file: Argon2id-derived key + AES-256-GCM ciphertext of the SQLite database. Cloud sync then copies the already-encrypted file.

A **Backup due** banner appears if there has never been a backup or the last one is older than ~24 hours (manual reminder until scheduled backup ships).

### Restore from `.rfbk`

1. **Backup & license** → **Open .rfbk…**
2. Enter the passphrase used when that backup was created
3. Confirm you understand the live book will be replaced
4. Restore — the previous live DB is kept as `bound-book.pre-restore-*.sqlite` beside the app data file

**Ops reminder (2016-1):** keep a daily backup habit against loss; also keep an unencrypted premises download/print on a cadence (at least semiannually for local systems) and be able to print current records on request.

---

## Typical workflow

1. First launch → SAMPLE/DEMO **or** real FFL profile  
2. **Acquisition** → add receipt lines  
3. **Bound book** → select an open line → **Disposition**  
4. Mistakes → **Correct** (original retained)  
5. **Inspection** / **Print / export** → package, PDF, CSV, or ASCII  
6. **Backup & license** → encrypted copy to Drive folder  

---

## Compliance notes (product intent)

| Topic | Approach in this MVP |
| --- | --- |
| Columns | Mirror § 478.125(e) description / receipt / disposition |
| Corrections | Immutable original + linked correction entry; views: original / corrected / both |
| Search | Serial, acq. date range, mfr/importer, name, address, 4473 txn # |
| Download/print | PDF + CSV + ASCII; acquisition-date sort; inspection package |
| Hosting | Local SQLite (premises); encrypted file backup ≠ live cloud host |
| Partition | Single license / single user |

Have counsel confirm your cutover plan before relying on this as the sole A&D record.

---

## Repository layout

```
src/                 React UI (bound-book grid, forms, export, inspection)
src-tauri/           Tauri shell, SQLite, backup encryption, CSV/ASCII export, sample demo
```
