#[cfg(test)]
mod tests {
    use crate::db::AppDb;
    use crate::models::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_db() -> AppDb {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let path = std::env::temp_dir().join(format!("rettmark-test-{nanos}.sqlite"));
        AppDb::open(path).expect("open test db")
    }

    #[test]
    fn acquisition_disposition_and_correction() {
        let db = temp_db();
        db.upsert_license(LicenseInput {
            ffl_number: "1-XX-XXX-XX-XX-12345".into(),
            business_name: "Rettmark Firearms".into(),
            premises_notes: None,
            forms_4473_filed_numerically: true,
            operator_name: "Ken Brown".into(),
        })
        .unwrap();

        let acq = db
            .add_acquisition(AcquisitionInput {
                manufacturer: "Glock".into(),
                importer: None,
                model: "19".into(),
                serial_number: "ABC123".into(),
                firearm_type: "Pistol".into(),
                caliber_or_gauge: "9mm".into(),
                acquisition_date: "2026-10-01".into(),
                acquired_from_kind: "licensee".into(),
                acquired_from_name: "Distributor LLC".into(),
                acquired_from_address: None,
                acquired_from_ffl: Some("1-XX-XXX-XX-XX-99999".into()),
                notes: None,
            })
            .unwrap();
        assert_eq!(acq.line_number, 1);
        assert_eq!(acq.status, "open");

        let disposed = db
            .record_disposition(DispositionInput {
                entry_id: acq.id,
                disposition_date: "2026-10-05".into(),
                disposed_to_kind: "form_4473".into(),
                disposed_to_name: None,
                disposed_to_address: None,
                disposed_to_ffl: None,
                form_4473_transaction_number: Some("4473-1001".into()),
                disposition_reference: None,
                notes: None,
            })
            .unwrap();
        assert_eq!(disposed.status, "disposed");

        let corrected = db
            .correct_entry(CorrectionInput {
                entry_id: disposed.id,
                reason: "Fix serial typo".into(),
                manufacturer: "Glock".into(),
                importer: None,
                model: "19".into(),
                serial_number: "ABC124".into(),
                firearm_type: "Pistol".into(),
                caliber_or_gauge: "9mm".into(),
                acquisition_date: "2026-10-01".into(),
                acquired_from_kind: "licensee".into(),
                acquired_from_name: "Distributor LLC".into(),
                acquired_from_address: None,
                acquired_from_ffl: Some("1-XX-XXX-XX-XX-99999".into()),
                disposition_date: Some("2026-10-05".into()),
                disposed_to_kind: Some("form_4473".into()),
                disposed_to_name: None,
                disposed_to_address: None,
                disposed_to_ffl: None,
                form_4473_transaction_number: Some("4473-1001".into()),
                disposition_reference: None,
                notes: None,
            })
            .unwrap();

        assert_eq!(corrected.serial_number, "ABC124");
        assert!(!corrected.is_original_version);
        assert!(corrected.is_effective);

        let original = db.get_entry(disposed.id).unwrap().unwrap();
        assert!(!original.is_effective);
        assert_eq!(original.superseded_by_entry_id, Some(corrected.id));

        let effective = db
            .search(SearchQuery {
                serial: Some("ABC124".into()),
                correction_view: Some("corrected".into()),
                ..Default::default()
            })
            .unwrap();
        assert_eq!(effective.len(), 1);

        let both = db
            .search(SearchQuery {
                correction_view: Some("both".into()),
                ..Default::default()
            })
            .unwrap();
        assert_eq!(both.len(), 2);

        let package_dir = std::env::temp_dir().join(format!(
            "rettmark-inspection-test-{}",
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let pkg = crate::export::export_inspection_package(&db, &package_dir).unwrap();
        assert!(std::path::Path::new(&pkg.csv_path).exists());
        assert!(std::path::Path::new(&pkg.ascii_path).exists());
        assert!(std::path::Path::new(&pkg.manifest_path).exists());
        assert_eq!(pkg.entry_count, 1);
    }

    #[test]
    fn disposition_before_acquisition_allowed_as_soft_case() {
        let db = temp_db();
        db.upsert_license(LicenseInput {
            ffl_number: "DEMO-NOT-A-REAL-FFL".into(),
            business_name: "Rettmark Firearms (SAMPLE/DEMO)".into(),
            premises_notes: None,
            forms_4473_filed_numerically: true,
            operator_name: "Ken Brown".into(),
        })
        .unwrap();
        let acq = db
            .add_acquisition(AcquisitionInput {
                manufacturer: "Glock".into(),
                importer: None,
                model: "19".into(),
                serial_number: "SOFT-DATE-1".into(),
                firearm_type: "Pistol".into(),
                caliber_or_gauge: "9mm".into(),
                acquisition_date: "2026-10-10".into(),
                acquired_from_kind: "opening_inventory".into(),
                acquired_from_name: "Opening".into(),
                acquired_from_address: None,
                acquired_from_ffl: None,
                notes: None,
            })
            .unwrap();
        let disposed = db
            .record_disposition(DispositionInput {
                entry_id: acq.id,
                disposition_date: "2026-10-01".into(),
                disposed_to_kind: "form_4473".into(),
                disposed_to_name: None,
                disposed_to_address: None,
                disposed_to_ffl: None,
                form_4473_transaction_number: Some("4473-soft".into()),
                disposition_reference: None,
                notes: None,
            })
            .unwrap();
        assert_eq!(disposed.status, "disposed");
        assert_eq!(disposed.disposition_date.as_deref(), Some("2026-10-01"));
    }

    #[test]
    fn sample_demo_load_and_wipe() {
        let db = temp_db();
        let loaded = crate::sample::load_sample_demo(&db).unwrap();
        assert!(loaded.loaded);
        assert!(loaded.sample_count >= 5);
        let open: i64 = db
            .search(crate::models::SearchQuery {
                open_only: Some(true),
                correction_view: Some("corrected".into()),
                ..Default::default()
            })
            .unwrap()
            .len() as i64;
        assert!(open >= 2);
        let wiped = crate::sample::wipe_sample_demo(&db).unwrap();
        assert!(!wiped.loaded);
        assert_eq!(wiped.sample_count, 0);
    }
}
