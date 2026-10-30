use crate::db::AppDb;
use crate::models::{ExportResult, InspectionPackageResult, SearchQuery};
use anyhow::{Context, Result};
use chrono::Utc;
use std::fs::File;
use std::io::Write;
use std::path::{Path, PathBuf};

pub fn export_csv(db: &AppDb, dest: &Path) -> Result<ExportResult> {
    let entries = db.search(SearchQuery {
        correction_view: Some("corrected".into()),
        ..Default::default()
    })?;

    if let Some(parent) = dest.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let mut wtr = csv::Writer::from_path(dest).context("create csv")?;
    // Headers mirror 27 CFR 478.125(e) Table 2 with separate Name vs Address/locator columns
    // (IOI DeSanto layout guidance). Kind/FFL/4473 fields retained for machine readability.
    wtr.write_record([
        "Line",
        "Status",
        "Manufacturer / Importer / PMF",
        "Importer",
        "Model",
        "Serial No.",
        "Type",
        "Caliber or gauge",
        "Acquisition Date",
        "Acquisition Kind",
        "Acquisition Name",
        "Acquisition Address or License No.",
        "Acquisition FFL",
        "Disposition Date",
        "Disposition Kind",
        "Disposition Name",
        "Disposition Address, License No., or Form 4473 Transaction No.",
        "Disposition FFL",
        "Form 4473 Transaction No.",
        "Disposition Reference",
        "Notes",
        "Correction Reason",
        "Entry ID",
    ])?;

    for e in &entries {
        let acq_address_or_license = match e.acquired_from_kind.as_str() {
            "licensee" => e
                .acquired_from_ffl
                .clone()
                .map(|f| format!("FFL {f}"))
                .unwrap_or_default(),
            "opening_inventory" => String::new(),
            _ => e.acquired_from_address.clone().unwrap_or_default(),
        };
        let disp_address_or_locator = if e.status == "open" {
            String::new()
        } else {
            match e.disposed_to_kind.as_deref().unwrap_or("") {
                "form_4473" => e
                    .form_4473_transaction_number
                    .clone()
                    .map(|n| format!("Form 4473 txn No. {n}"))
                    .unwrap_or_default(),
                "licensee" => e
                    .disposed_to_ffl
                    .clone()
                    .map(|f| format!("FFL {f}"))
                    .unwrap_or_default(),
                "book_rollover_ref" => e.disposition_reference.clone().unwrap_or_default(),
                _ => e.disposed_to_address.clone().unwrap_or_default(),
            }
        };
        let manufacturer_importer_pmf = match &e.importer {
            Some(imp) if !imp.is_empty() => format!("{} / {}", e.manufacturer, imp),
            _ => e.manufacturer.clone(),
        };
        wtr.write_record([
            e.line_number.to_string(),
            e.status.clone(),
            manufacturer_importer_pmf,
            e.importer.clone().unwrap_or_default(),
            e.model.clone(),
            e.serial_number.clone(),
            e.firearm_type.clone(),
            e.caliber_or_gauge.clone(),
            e.acquisition_date.clone(),
            e.acquired_from_kind.clone(),
            e.acquired_from_name.clone(),
            acq_address_or_license,
            e.acquired_from_ffl.clone().unwrap_or_default(),
            e.disposition_date.clone().unwrap_or_default(),
            e.disposed_to_kind.clone().unwrap_or_default(),
            e.disposed_to_name.clone().unwrap_or_default(),
            disp_address_or_locator,
            e.disposed_to_ffl.clone().unwrap_or_default(),
            e.form_4473_transaction_number
                .clone()
                .unwrap_or_default(),
            e.disposition_reference.clone().unwrap_or_default(),
            e.notes.clone().unwrap_or_default(),
            e.correction_reason.clone().unwrap_or_default(),
            e.id.to_string(),
        ])?;
    }
    wtr.flush()?;

    let count = entries.len() as i64;
    db.record_export(
        "csv",
        &dest.display().to_string(),
        count,
        Some("ATF Ruling 2016-1 style download — effective (corrected) view"),
    )
}

pub fn export_ascii(db: &AppDb, dest: &Path) -> Result<ExportResult> {
    let license = db.get_license()?;
    let entries = db.search(SearchQuery {
        correction_view: Some("corrected".into()),
        ..Default::default()
    })?;

    if let Some(parent) = dest.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let mut f = File::create(dest)?;
    writeln!(
        f,
        "Rettmark Firearms — Firearms Acquisition & Disposition Record"
    )?;
    writeln!(f, "Format: 27 CFR 478.125(e) dealer A&D (electronic)")?;
    if let Some(lic) = &license {
        writeln!(f, "FFL: {}", lic.ffl_number)?;
        writeln!(f, "Business: {}", lic.business_name)?;
        writeln!(f, "Operator: {}", lic.operator_name)?;
    }
    writeln!(f, "Sorted by acquisition date")?;
    writeln!(
        f,
        "Columns: Description | Acquisitions (Date, Name, Address/License No.) | Dispositions (Date, Name, Address/License No./4473)"
    )?;
    writeln!(f, "---")?;
    for e in &entries {
        let acq_name = if e.acquired_from_kind == "opening_inventory" {
            format!("{} (opening inventory)", e.acquired_from_name)
        } else {
            e.acquired_from_name.clone()
        };
        let acq_addr = match e.acquired_from_kind.as_str() {
            "licensee" => e
                .acquired_from_ffl
                .clone()
                .map(|f| format!("FFL {f}"))
                .unwrap_or_default(),
            "opening_inventory" => String::new(),
            _ => e.acquired_from_address.clone().unwrap_or_default(),
        };
        let (disp_name, disp_addr) = if e.status == "open" {
            (String::new(), String::new())
        } else {
            match e.disposed_to_kind.as_deref().unwrap_or("") {
                "form_4473" => (
                    String::new(),
                    e.form_4473_transaction_number
                        .clone()
                        .map(|n| format!("Form 4473 txn No. {n}"))
                        .unwrap_or_default(),
                ),
                "licensee" => (
                    e.disposed_to_name.clone().unwrap_or_default(),
                    e.disposed_to_ffl
                        .clone()
                        .map(|f| format!("FFL {f}"))
                        .unwrap_or_default(),
                ),
                "book_rollover_ref" => (
                    String::new(),
                    e.disposition_reference.clone().unwrap_or_default(),
                ),
                _ => (
                    e.disposed_to_name.clone().unwrap_or_default(),
                    e.disposed_to_address.clone().unwrap_or_default(),
                ),
            }
        };
        writeln!(
            f,
            "L{line}|{mfr}|{imp}|{model}|{ser}|{ftype}|{cal}|AcqDate {adate}|AcqName {acq_name}|AcqAddrOrLic {acq_addr}|DispDate {ddate}|DispName {disp_name}|DispAddrLicOr4473 {disp_addr}",
            line = e.line_number,
            mfr = e.manufacturer,
            imp = e.importer.clone().unwrap_or_default(),
            model = e.model,
            ser = e.serial_number,
            ftype = e.firearm_type,
            cal = e.caliber_or_gauge,
            adate = e.acquisition_date,
            acq_name = acq_name,
            acq_addr = acq_addr,
            ddate = e.disposition_date.clone().unwrap_or_default(),
            disp_name = disp_name,
            disp_addr = disp_addr,
        )?;
    }
    let count = entries.len() as i64;
    db.record_export(
        "atf_download",
        &dest.display().to_string(),
        count,
        Some("ASCII text download for premises / OOB path"),
    )
}

/// Writes CSV + ASCII + MANIFEST into `dest_dir` for inspection / OOB handoff.
/// PDF is added by the UI into the same folder.
pub fn export_inspection_package(db: &AppDb, dest_dir: &Path) -> Result<InspectionPackageResult> {
    std::fs::create_dir_all(dest_dir).context("create inspection package directory")?;
    let stamp = dest_dir
        .file_name()
        .and_then(|s| s.to_str())
        .and_then(|s| s.strip_prefix("rettmark-inspection-"))
        .map(|s| s.to_string())
        .unwrap_or_else(|| Utc::now().format("%Y%m%d-%H%M%S").to_string());
    let csv_path = dest_dir.join(format!("rettmark-ad-{stamp}.csv"));
    let ascii_path = dest_dir.join(format!("rettmark-ad-{stamp}.txt"));
    let pdf_name = format!("rettmark-ad-{stamp}.pdf");
    let manifest_path = dest_dir.join("MANIFEST.txt");

    let csv = export_csv(db, &csv_path)?;
    let ascii = export_ascii(db, &ascii_path)?;
    let license = db.get_license()?;
    let created_at = Utc::now().to_rfc3339();

    let mut m = File::create(&manifest_path)?;
    writeln!(m, "Rettmark Firearms — ATF inspection / premises download package")?;
    writeln!(m, "Created: {created_at}")?;
    writeln!(m, "Format basis: 27 CFR 478.125(e); ATF Ruling 2016-1")?;
    writeln!(
        m,
        "Contents: unencrypted PDF (paper columns), CSV, and ASCII text of dealer A&D"
    )?;
    writeln!(
        m,
        "View: effective (corrected) A&D lines, sorted by acquisition date"
    )?;
    writeln!(
        m,
        "Use: print or provide this folder for ATF inspection / premises download"
    )?;
    if let Some(lic) = &license {
        writeln!(m, "Business: {}", lic.business_name)?;
        writeln!(m, "FFL: {}", lic.ffl_number)?;
        writeln!(m, "Operator: {}", lic.operator_name)?;
    }
    writeln!(m, "Entry count: {}", csv.entry_count)?;
    writeln!(m, "Encryption: NONE (unencrypted premises / inspection download)")?;
    writeln!(m, "Files:")?;
    writeln!(
        m,
        "  - {pdf_name}  (unencrypted PDF — paper § 478.125(e) columns; primary file for ATF)"
    )?;
    writeln!(
        m,
        "  - {}  (CSV of full effective A&D)",
        csv_path.file_name().unwrap().to_string_lossy()
    )?;
    writeln!(
        m,
        "  - {}  (ASCII/text of full effective A&D)",
        ascii_path.file_name().unwrap().to_string_lossy()
    )?;
    writeln!(m, "  - MANIFEST.txt  (this file)")?;
    writeln!(m)?;
    writeln!(
        m,
        "What to give ATF: the PDF is the usual presentation copy; include CSV/ASCII if requested."
    )?;
    writeln!(
        m,
        "Disclaimer: ATF does not certify software. Not legal advice. Licensee remains responsible."
    )?;

    db.record_export(
        "inspection_package",
        &dest_dir.display().to_string(),
        csv.entry_count,
        Some("ATF inspection package (unencrypted PDF via UI + CSV + ASCII + MANIFEST)"),
    )?;
    db.set_setting("last_atf_export_at", &created_at)?;

    let _ = ascii;
    Ok(InspectionPackageResult {
        directory: dest_dir.display().to_string(),
        csv_path: csv_path.display().to_string(),
        ascii_path: ascii_path.display().to_string(),
        manifest_path: manifest_path.display().to_string(),
        entry_count: csv.entry_count,
        created_at,
    })
}

pub fn package_dir_with_stamp(base: &Path) -> PathBuf {
    let stamp = Utc::now().format("%Y%m%d-%H%M%S");
    base.join(format!("rettmark-inspection-{stamp}"))
}
