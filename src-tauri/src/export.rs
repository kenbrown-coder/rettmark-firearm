use crate::db::AppDb;
use crate::models::{ExportResult, SearchQuery};
use anyhow::{Context, Result};
use std::fs::File;
use std::io::Write;
use std::path::Path;

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
