# Rettmark Firearms — Digital FFL A&D Bound Book

Local-first desktop app for **Rettmark Firearms** (Ken Brown) to keep the dealer Acquisition & Disposition “bound book” electronically: same columns as the paper book under [27 CFR 478.125(e)](https://www.ecfr.gov/current/title-27/chapter-II/subchapter-B/part-478/subpart-H/section-478.125), with search, non-destructive corrections, print/export, and encrypted offsite backup.

**Stack:** Tauri 2 · React · TypeScript · Vite · SQLite

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
- **Inspection mode** (read-only paper-column view) and one-click **inspection package** (PDF + CSV + ASCII + MANIFEST)
- **Encrypted backup** (AES-256-GCM + Argon2id passphrase) to a user-chosen sync folder (OneDrive or Google Drive), with restore

**Out of scope for v1:** e4473, POS, multi-user/roles, multi-FFL, NFA/gunsmith books, cloud SaaS hosting.

### Working assumptions (defaults while Ken reviews)

- **License:** Type 01 dealer A&D only (no gunsmithing / NFA books in v1)
- **Cutover:** Electronic going forward — no paper-book import yet
- **Disposition:** Form 4473 transaction number is the default retail path when provided / when 4473s are filed numerically
- **Users:** Single operator (Ken Brown / Rettmark Firearms)
- **Sync folder:** Ken chooses whichever OneDrive or Google Drive path he already uses

---

## Prerequisites

- [Node.js](https://nodejs.org/) 20+ and npm
- [Rust](https://rustup.rs/) stable (for Tauri)
- Linux: WebKitGTK 4.1 and related Tauri system deps (see [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/))
- macOS / Windows: standard Tauri desktop toolchain

---

## Run locally (development)

```bash
git clone https://github.com/kenbrown-coder/rettmark-firearm.git
cd rettmark-firearm
git checkout cursor/ffl-bound-book-mvp-d014   # or pull the open PR branch
npm install
npm run tauri:dev
```

This starts the Vite UI and opens the Tauri desktop window. The SQLite file is created under the app data directory (shown in **Backup & license**).

Frontend-only (UI without native commands — useful for layout checks only):

```bash
npm run dev
```

Tests / build smoke:

```bash
npm test
npm run build
cd src-tauri && cargo test
```

Production build:

```bash
npm run tauri:build
```

---

## First 10 minutes (sample acquisition + disposition)

1. Run `npm run tauri:dev` and wait for the window.
2. On first launch, confirm **Rettmark Firearms**, enter your **FFL number**, leave **Forms 4473 filed numerically** checked, click **Open bound book**.
3. Empty book → click **Add first acquisition**.
4. Fill a sample receipt, for example:
   - Manufacturer: `Glock`
   - Model: `19`
   - Serial: `DEMO-001`
   - Type: `Pistol`
   - Caliber: `9mm`
   - Date: today
   - From whom: **Licensee** — name `Sample Distributor`, FFL `1-XX-XXX-XX-XX-99999`
5. Click **Commit acquisition line**. The bound book shows an **open** (highlighted) line.
6. Click that line → **Record disposition** (or open **Disposition**).
7. Keep **Form 4473 transaction #**, enter e.g. `4473-1001`, date today → **Record disposition**.
8. Open **Inspection** for a read-only paper-style view; optionally **Export inspection package** (PDF + CSV + ASCII) to a folder.
9. Click **Backup now** (or **Backup & license** → **Choose folder…**) and write an encrypted `.rfbk` to your Drive sync folder.

You now have one closed A&D line, an inspection view, and (if step 9 succeeded) an offsite encrypted copy.

---

## Backup setup (Two copies)

1. Open **Backup & license** (or click **Backup now** in the header).
2. Click **Choose folder…** and pick a folder that syncs with OneDrive or Google Drive.
3. Choose a strong **passphrase** (8+ characters). The passphrase is **not** stored in plaintext; enter it each time you run a backup.
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

1. First launch → enter FFL / business profile  
2. **Acquisition** → add receipt lines  
3. **Bound book** → select an open line → **Disposition**  
4. Mistakes → **Correct** (original retained)  
5. **Print / export** → PDF, print, CSV, or ASCII  
6. **Backup & license** → encrypted copy to Drive folder  

---

## Compliance notes (product intent)

| Topic | Approach in this MVP |
| --- | --- |
| Columns | Mirror § 478.125(e) description / receipt / disposition |
| Corrections | Immutable original + linked correction entry; views: original / corrected / both |
| Search | Serial, acq. date range, mfr/importer, name, address, 4473 txn # |
| Download/print | PDF + CSV + ASCII; acquisition-date sort |
| Hosting | Local SQLite (premises); encrypted file backup ≠ live cloud host |
| Partition | Single license / single user |

Have counsel confirm your cutover plan (paper vs electronic going forward) before relying on this as the sole A&D record.

---

## Repository layout

```
src/                 React UI (bound-book grid, forms, export)
src-tauri/           Tauri shell, SQLite, backup encryption, CSV/ASCII export
```
