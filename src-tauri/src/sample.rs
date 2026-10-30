use crate::db::AppDb;
use crate::models::{AcquisitionInput, CorrectionInput, DispositionInput, LicenseInput};
use anyhow::{bail, Result};
use chrono::{Duration, Utc};

pub const SAMPLE_NOTE_TAG: &str = "[SAMPLE/DEMO — fictional data only; not a real A&D record]";
pub const SAMPLE_SERIAL_PREFIX: &str = "SAMPLE-";
pub const DEMO_FFL: &str = "DEMO-NOT-A-REAL-FFL";
pub const DEMO_COUNTERPARTY_FFL: &str = "DEMO-DIST-NOT-REAL";

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SampleDemoStatus {
    pub loaded: bool,
    pub sample_count: i64,
    pub non_sample_count: i64,
}

pub fn status(db: &AppDb) -> Result<SampleDemoStatus> {
    let conn = db.conn.lock().unwrap();
    let sample_count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM bound_book_entry
         WHERE serial_number LIKE ?1 OR IFNULL(notes,'') LIKE ?2",
        rusqlite::params![format!("{SAMPLE_SERIAL_PREFIX}%"), format!("%{SAMPLE_NOTE_TAG}%")],
        |r| r.get(0),
    )?;
    let total: i64 = conn.query_row("SELECT COUNT(*) FROM bound_book_entry", [], |r| r.get(0))?;
    Ok(SampleDemoStatus {
        loaded: sample_count > 0,
        sample_count,
        non_sample_count: total - sample_count,
    })
}

pub fn load_sample_demo(db: &AppDb) -> Result<SampleDemoStatus> {
    let current = status(db)?;
    if current.non_sample_count > 0 {
        bail!(
            "This book already has {} non-sample line(s). Wipe sample data only works for SAMPLE/DEMO rows; refuse to mix demo into a live book. Export/backup first, or use a fresh DB.",
            current.non_sample_count
        );
    }
    if current.sample_count > 0 {
        wipe_sample_demo(db)?;
    }

    if db.get_license()?.is_none() {
        db.upsert_license(LicenseInput {
            ffl_number: DEMO_FFL.into(),
            business_name: "Rettmark Firearms (SAMPLE/DEMO)".into(),
            premises_notes: Some(
                "SAMPLE/DEMO license profile — replace with real FFL before production use"
                    .into(),
            ),
            forms_4473_filed_numerically: true,
            operator_name: "Ken Brown".into(),
        })?;
    }

    let today = Utc::now().date_naive();
    let d = |days_ago: i64| (today - Duration::days(days_ago)).format("%Y-%m-%d").to_string();

    // 1) Open pistol — still in inventory
    db.add_acquisition(AcquisitionInput {
        manufacturer: "Glock".into(),
        importer: None,
        model: "19 Gen5".into(),
        serial_number: format!("{SAMPLE_SERIAL_PREFIX}P19-001"),
        firearm_type: "Pistol".into(),
        caliber_or_gauge: "9mm".into(),
        acquisition_date: d(12),
        acquired_from_kind: "licensee".into(),
        acquired_from_name: "SAMPLE Demo Distributors LLC".into(),
        acquired_from_address: None,
        acquired_from_ffl: Some(DEMO_COUNTERPARTY_FFL.into()),
        notes: Some(SAMPLE_NOTE_TAG.into()),
    })?;

    // 2) Open rifle — opening inventory
    db.add_acquisition(AcquisitionInput {
        manufacturer: "Ruger".into(),
        importer: None,
        model: "American Rifle".into(),
        serial_number: format!("{SAMPLE_SERIAL_PREFIX}RIF-002"),
        firearm_type: "Rifle".into(),
        caliber_or_gauge: "308 Win".into(),
        acquisition_date: d(30),
        acquired_from_kind: "opening_inventory".into(),
        acquired_from_name: "SAMPLE Opening Inventory".into(),
        acquired_from_address: None,
        acquired_from_ffl: None,
        notes: Some(SAMPLE_NOTE_TAG.into()),
    })?;

    // 3) Disposed via Form 4473
    let sold = db.add_acquisition(AcquisitionInput {
        manufacturer: "Smith & Wesson".into(),
        importer: None,
        model: "M&P Shield".into(),
        serial_number: format!("{SAMPLE_SERIAL_PREFIX}P9-003"),
        firearm_type: "Pistol".into(),
        caliber_or_gauge: "9mm".into(),
        acquisition_date: d(20),
        acquired_from_kind: "licensee".into(),
        acquired_from_name: "SAMPLE Demo Distributors LLC".into(),
        acquired_from_address: None,
        acquired_from_ffl: Some(DEMO_COUNTERPARTY_FFL.into()),
        notes: Some(SAMPLE_NOTE_TAG.into()),
    })?;
    db.record_disposition(DispositionInput {
        entry_id: sold.id,
        disposition_date: d(5),
        disposed_to_kind: "form_4473".into(),
        disposed_to_name: None,
        disposed_to_address: None,
        disposed_to_ffl: None,
        form_4473_transaction_number: Some("SAMPLE-4473-1001".into()),
        disposition_reference: None,
        notes: Some(SAMPLE_NOTE_TAG.into()),
    })?;

    // 4) Disposed to fictional licensee
    let xfer = db.add_acquisition(AcquisitionInput {
        manufacturer: "Remington".into(),
        importer: None,
        model: "870".into(),
        serial_number: format!("{SAMPLE_SERIAL_PREFIX}SG-004"),
        firearm_type: "Shotgun".into(),
        caliber_or_gauge: "12 ga".into(),
        acquisition_date: d(25),
        acquired_from_kind: "nonlicensee".into(),
        acquired_from_name: "SAMPLE Jane Q. Public".into(),
        acquired_from_address: Some("100 Demo Street, Sampletown, ST 00000".into()),
        acquired_from_ffl: None,
        notes: Some(SAMPLE_NOTE_TAG.into()),
    })?;
    db.record_disposition(DispositionInput {
        entry_id: xfer.id,
        disposition_date: d(8),
        disposed_to_kind: "licensee".into(),
        disposed_to_name: Some("SAMPLE Other Dealer Inc".into()),
        disposed_to_address: None,
        disposed_to_ffl: Some("DEMO-OTHER-DEALER".into()),
        form_4473_transaction_number: None,
        disposition_reference: None,
        notes: Some(SAMPLE_NOTE_TAG.into()),
    })?;

    // 5) Corrected serial (method a) — starts wrong, then corrected
    let typo = db.add_acquisition(AcquisitionInput {
        manufacturer: "privately made firearm".into(),
        importer: None,
        model: "SAMPLE PMF Pistol".into(),
        serial_number: format!("{SAMPLE_SERIAL_PREFIX}PMF-005X"),
        firearm_type: "Pistol".into(),
        caliber_or_gauge: "9mm".into(),
        acquisition_date: d(15),
        acquired_from_kind: "nonlicensee".into(),
        acquired_from_name: "SAMPLE Alex Maker".into(),
        acquired_from_address: Some("200 Fiction Ave, Demo City, ST 00000".into()),
        acquired_from_ffl: None,
        notes: Some(SAMPLE_NOTE_TAG.into()),
    })?;
    db.correct_entry(CorrectionInput {
        entry_id: typo.id,
        reason: "SAMPLE/DEMO: fix transposed serial digit".into(),
        manufacturer: "privately made firearm".into(),
        importer: None,
        model: "SAMPLE PMF Pistol".into(),
        serial_number: format!("{SAMPLE_SERIAL_PREFIX}PMF-005"),
        firearm_type: "Pistol".into(),
        caliber_or_gauge: "9mm".into(),
        acquisition_date: d(15),
        acquired_from_kind: "nonlicensee".into(),
        acquired_from_name: "SAMPLE Alex Maker".into(),
        acquired_from_address: Some("200 Fiction Ave, Demo City, ST 00000".into()),
        acquired_from_ffl: None,
        disposition_date: None,
        disposed_to_kind: None,
        disposed_to_name: None,
        disposed_to_address: None,
        disposed_to_ffl: None,
        form_4473_transaction_number: None,
        disposition_reference: None,
        notes: Some(SAMPLE_NOTE_TAG.into()),
    })?;

    db.set_setting("sample_demo_loaded", "1")?;
    db.audit(
        "load_sample_demo",
        "bound_book_entry",
        None,
        Some("{\"tag\":\"SAMPLE/DEMO\"}"),
        &db.get_license()?
            .map(|l| l.operator_name)
            .unwrap_or_else(|| "Ken Brown".into()),
    )?;
    status(db)
}

pub fn wipe_sample_demo(db: &AppDb) -> Result<SampleDemoStatus> {
    let before = status(db)?;
    if before.sample_count == 0 {
        db.set_setting("sample_demo_loaded", "0")?;
        return Ok(before);
    }
    {
        let conn = db.conn.lock().unwrap();
        // Only delete SAMPLE- serials — never wipe live lines that merely mention the demo note.
        conn.execute(
            "DELETE FROM bound_book_entry WHERE serial_number LIKE ?1",
            rusqlite::params![format!("{SAMPLE_SERIAL_PREFIX}%")],
        )?;
    }
    db.set_setting("sample_demo_loaded", "0")?;
    db.audit(
        "wipe_sample_demo",
        "bound_book_entry",
        None,
        Some(&format!("{{\"removed\":{}}}", before.sample_count)),
        &db.get_license()?
            .map(|l| l.operator_name)
            .unwrap_or_else(|| "Ken Brown".into()),
    )?;
    status(db)
}
