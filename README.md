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
- **Encrypted backup** (AES-256-GCM + Argon2id passphrase) to a user-chosen sync folder (OneDrive or Google Drive)

**Out of scope for v1:** e4473, POS, multi-user/roles, multi-FFL, NFA/gunsmith books, cloud SaaS hosting.

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
npm install
npm run tauri:dev
```

This starts the Vite UI and opens the Tauri desktop window. The SQLite file is created under the app data directory (shown in **Backup & license**).

Frontend-only (UI without native commands — useful for layout checks only):

```bash
npm run dev
```

Production build:

```bash
npm run tauri:build
```

---

## Backup setup (Two copies)

1. Open **Backup & license**.
2. Set **Backup folder path** to a folder that syncs with OneDrive or Google Drive (example: `~/OneDrive/Rettmark-Backups` or `~/Google Drive/Rettmark-Backups`).
3. Choose a strong **passphrase** (8+ characters). The passphrase is **not** stored in plaintext; enter it each time you run a backup.
4. Click **Run encrypted backup now**.

The app writes a `.rfbk` file: Argon2id-derived key + AES-256-GCM ciphertext of the SQLite database. Cloud sync then copies the already-encrypted file.

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
