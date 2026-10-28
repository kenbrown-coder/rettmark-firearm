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
    wtr.write_record([
        "Line",
        "Status",
        "Manufacturer",
        "Importer",
        "Model",
        "Serial No.",
        "Type",
        "Caliber/Gauge",
        "Acquisition Date",
        "Acquired From Kind",
        "Acquired From Name",
        "Acquired From Address",
        "Acquired From FFL",
        "Disposition Date",
        "Disposed To Kind",
        "Disposed To Name",
        "Disposed To Address",
        "Disposed To FFL",
        "Form 4473 Txn No.",
        "Disposition Reference",
        "Notes",
        "Correction Reason",
        "Entry ID",
    ])?;

    for e in &entries {
        wtr.write_record([
            e.line_number.to_string(),
            e.status.clone(),
            e.manufacturer.clone(),
            e.importer.clone().unwrap_or_default(),
            e.model.clone(),
            e.serial_number.clone(),
            e.firearm_type.clone(),
            e.caliber_or_gauge.clone(),
            e.acquisition_date.clone(),
            e.acquired_from_kind.clone(),
            e.acquired_from_name.clone(),
            e.acquired_from_address.clone().unwrap_or_default(),
            e.acquired_from_ffl.clone().unwrap_or_default(),
            e.disposition_date.clone().unwrap_or_default(),
            e.disposed_to_kind.clone().unwrap_or_default(),
            e.disposed_to_name.clone().unwrap_or_default(),
            e.disposed_to_address.clone().unwrap_or_default(),
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
    writeln!(f, "---")?;
    for e in &entries {
        let from = match e.acquired_from_kind.as_str() {
            "licensee" => format!(
                "{} / FFL {}",
                e.acquired_from_name,
                e.acquired_from_ffl.clone().unwrap_or_default()
            ),
            "opening_inventory" => format!("{} (opening inventory)", e.acquired_from_name),
            _ => format!(
                "{} / {}",
                e.acquired_from_name,
                e.acquired_from_address.clone().unwrap_or_default()
            ),
        };
        let to = if e.status == "open" {
            String::new()
        } else {
            match e.disposed_to_kind.as_deref().unwrap_or("") {
                "form_4473" => format!(
                    "4473# {}",
                    e.form_4473_transaction_number.clone().unwrap_or_default()
                ),
                "licensee" => format!(
                    "{} / FFL {}",
                    e.disposed_to_name.clone().unwrap_or_default(),
                    e.disposed_to_ffl.clone().unwrap_or_default()
                ),
                "book_rollover_ref" => e.disposition_reference.clone().unwrap_or_default(),
                _ => format!(
                    "{} / {}",
                    e.disposed_to_name.clone().unwrap_or_default(),
                    e.disposed_to_address.clone().unwrap_or_default()
                ),
            }
        };
        writeln!(
            f,
            "L{line}|{mfr}|{imp}|{model}|{ser}|{ftype}|{cal}|Acq {adate}|From {from}|Disp {ddate}|To {to}",
            line = e.line_number,
            mfr = e.manufacturer,
            imp = e.importer.clone().unwrap_or_default(),
            model = e.model,
            ser = e.serial_number,
            ftype = e.firearm_type,
            cal = e.caliber_or_gauge,
            adate = e.acquisition_date,
            from = from,
            ddate = e.disposition_date.clone().unwrap_or_default(),
            to = to,
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
    writeln!(m, "Rettmark Firearms — Inspection / OOB export package")?;
    writeln!(m, "Created: {created_at}")?;
    writeln!(m, "Format basis: 27 CFR 478.125(e); ATF Ruling 2016-1")?;
    writeln!(
        m,
        "View: effective (corrected) A&D lines, sorted by acquisition date"
    )?;
    if let Some(lic) = &license {
        writeln!(m, "Business: {}", lic.business_name)?;
        writeln!(m, "FFL: {}", lic.ffl_number)?;
        writeln!(m, "Operator: {}", lic.operator_name)?;
    }
    writeln!(m, "Entry count: {}", csv.entry_count)?;
    writeln!(m, "Files:")?;
    writeln!(m, "  - {}", csv_path.file_name().unwrap().to_string_lossy())?;
    writeln!(
        m,
        "  - {}",
        ascii_path.file_name().unwrap().to_string_lossy()
    )?;
    writeln!(
        m,
        "  - {pdf_name}  (written by app UI if PDF step succeeds)"
    )?;
    writeln!(m)?;
    writeln!(
        m,
        "Disclaimer: ATF does not certify software. Not legal advice. Licensee remains responsible."
    )?;

    db.record_export(
        "inspection_package",
        &dest_dir.display().to_string(),
        csv.entry_count,
        Some("Inspection/OOB package (CSV+ASCII+manifest; PDF via UI)"),
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
