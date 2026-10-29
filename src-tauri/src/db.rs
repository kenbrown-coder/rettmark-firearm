use crate::models::*;
use anyhow::{bail, Context, Result};
use chrono::Utc;
use rusqlite::{params, Connection, OptionalExtension};
use std::path::{Path, PathBuf};
use std::sync::Mutex;

pub struct AppDb {
    pub conn: Mutex<Connection>,
    pub path: PathBuf,
}

impl AppDb {
    pub fn open(path: PathBuf) -> Result<Self> {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let conn = Connection::open(&path).context("open sqlite")?;
        conn.execute_batch(
            "
            PRAGMA foreign_keys = ON;
            PRAGMA journal_mode = WAL;
            ",
        )?;
        let db = Self {
            conn: Mutex::new(conn),
            path,
        };
        db.migrate()?;
        Ok(db)
    }

    fn migrate(&self) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute_batch(
            r#"
            CREATE TABLE IF NOT EXISTS license (
              id INTEGER PRIMARY KEY CHECK (id = 1),
              ffl_number TEXT NOT NULL,
              business_name TEXT NOT NULL,
              premises_notes TEXT,
              forms_4473_filed_numerically INTEGER NOT NULL DEFAULT 0,
              operator_name TEXT NOT NULL DEFAULT 'Ken Brown',
              created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS bound_book_entry (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              line_number INTEGER NOT NULL,
              status TEXT NOT NULL,
              manufacturer TEXT NOT NULL,
              importer TEXT,
              model TEXT NOT NULL,
              serial_number TEXT NOT NULL,
              firearm_type TEXT NOT NULL,
              caliber_or_gauge TEXT NOT NULL,
              acquisition_date TEXT NOT NULL,
              acquired_from_kind TEXT NOT NULL,
              acquired_from_name TEXT NOT NULL,
              acquired_from_address TEXT,
              acquired_from_ffl TEXT,
              disposition_date TEXT,
              disposed_to_kind TEXT,
              disposed_to_name TEXT,
              disposed_to_address TEXT,
              disposed_to_ffl TEXT,
              form_4473_transaction_number TEXT,
              disposition_reference TEXT,
              notes TEXT,
              created_at TEXT NOT NULL,
              created_by TEXT NOT NULL,
              supersedes_entry_id INTEGER,
              superseded_by_entry_id INTEGER,
              correction_reason TEXT,
              is_original_version INTEGER NOT NULL DEFAULT 1,
              is_effective INTEGER NOT NULL DEFAULT 1
            );

            CREATE INDEX IF NOT EXISTS idx_bbe_serial ON bound_book_entry(serial_number);
            CREATE INDEX IF NOT EXISTS idx_bbe_acq_date ON bound_book_entry(acquisition_date);
            CREATE INDEX IF NOT EXISTS idx_bbe_effective ON bound_book_entry(is_effective);
            CREATE INDEX IF NOT EXISTS idx_bbe_line ON bound_book_entry(line_number);

            CREATE TABLE IF NOT EXISTS audit_event (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              at TEXT NOT NULL,
              action TEXT NOT NULL,
              entity_type TEXT NOT NULL,
              entity_id INTEGER,
              detail_json TEXT,
              actor TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS app_settings (
              key TEXT PRIMARY KEY,
              value TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS export_artifact (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              kind TEXT NOT NULL,
              created_at TEXT NOT NULL,
              path TEXT NOT NULL,
              entry_count INTEGER NOT NULL,
              notes TEXT
            );
            "#,
        )?;
        Ok(())
    }

    pub fn status(&self) -> Result<DbStatus> {
        let conn = self.conn.lock().unwrap();
        let initialized: bool = conn
            .query_row(
                "SELECT COUNT(*) FROM license WHERE id = 1",
                [],
                |r| Ok(r.get::<_, i64>(0)? > 0),
            )
            .unwrap_or(false);
        let entry_count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM bound_book_entry WHERE is_effective = 1",
                [],
                |r| r.get(0),
            )
            .unwrap_or(0);
        let open_count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM bound_book_entry WHERE is_effective = 1 AND status = 'open'",
                [],
                |r| r.get(0),
            )
            .unwrap_or(0);
        Ok(DbStatus {
            path: self.path.display().to_string(),
            initialized,
            entry_count,
            open_count,
        })
    }

    pub fn get_setting(&self, key: &str) -> Result<Option<String>> {
        let conn = self.conn.lock().unwrap();
        let val = conn
            .query_row(
                "SELECT value FROM app_settings WHERE key = ?1",
                params![key],
                |r| r.get(0),
            )
            .optional()?;
        Ok(val)
    }

    pub fn set_setting(&self, key: &str, value: &str) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO app_settings(key, value) VALUES(?1, ?2)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            params![key, value],
        )?;
        Ok(())
    }

    pub fn audit(
        &self,
        action: &str,
        entity_type: &str,
        entity_id: Option<i64>,
        detail: Option<&str>,
        actor: &str,
    ) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO audit_event(at, action, entity_type, entity_id, detail_json, actor)
             VALUES(?1, ?2, ?3, ?4, ?5, ?6)",
            params![
                Utc::now().to_rfc3339(),
                action,
                entity_type,
                entity_id,
                detail,
                actor
            ],
        )?;
        Ok(())
    }

    pub fn get_license(&self) -> Result<Option<License>> {
        let conn = self.conn.lock().unwrap();
        let lic = conn
            .query_row(
                "SELECT id, ffl_number, business_name, premises_notes,
                        forms_4473_filed_numerically, operator_name, created_at
                 FROM license WHERE id = 1",
                [],
                |r| {
                    Ok(License {
                        id: r.get(0)?,
                        ffl_number: r.get(1)?,
                        business_name: r.get(2)?,
                        premises_notes: r.get(3)?,
                        forms_4473_filed_numerically: r.get::<_, i64>(4)? != 0,
                        operator_name: r.get(5)?,
                        created_at: r.get(6)?,
                    })
                },
            )
            .optional()?;
        Ok(lic)
    }

    pub fn upsert_license(&self, input: LicenseInput) -> Result<License> {
        let now = Utc::now().to_rfc3339();
        {
            let conn = self.conn.lock().unwrap();
            conn.execute(
                "INSERT INTO license(id, ffl_number, business_name, premises_notes,
                    forms_4473_filed_numerically, operator_name, created_at)
                 VALUES(1, ?1, ?2, ?3, ?4, ?5, ?6)
                 ON CONFLICT(id) DO UPDATE SET
                    ffl_number = excluded.ffl_number,
                    business_name = excluded.business_name,
                    premises_notes = excluded.premises_notes,
                    forms_4473_filed_numerically = excluded.forms_4473_filed_numerically,
                    operator_name = excluded.operator_name",
                params![
                    input.ffl_number.trim(),
                    input.business_name.trim(),
                    input.premises_notes,
                    if input.forms_4473_filed_numerically {
                        1
                    } else {
                        0
                    },
                    input.operator_name.trim(),
                    now,
                ],
            )?;
        }
        self.audit(
            "upsert_license",
            "license",
            Some(1),
            None,
            &input.operator_name,
        )?;
        self.get_license()?.context("license missing after upsert")
    }

    fn operator_name(&self) -> String {
        self.get_license()
            .ok()
            .flatten()
            .map(|l| l.operator_name)
            .unwrap_or_else(|| "Ken Brown".into())
    }

    fn map_entry(r: &rusqlite::Row<'_>) -> rusqlite::Result<BoundBookEntry> {
        Ok(BoundBookEntry {
            id: r.get(0)?,
            line_number: r.get(1)?,
            status: r.get(2)?,
            manufacturer: r.get(3)?,
            importer: r.get(4)?,
            model: r.get(5)?,
            serial_number: r.get(6)?,
            firearm_type: r.get(7)?,
            caliber_or_gauge: r.get(8)?,
            acquisition_date: r.get(9)?,
            acquired_from_kind: r.get(10)?,
            acquired_from_name: r.get(11)?,
            acquired_from_address: r.get(12)?,
            acquired_from_ffl: r.get(13)?,
            disposition_date: r.get(14)?,
            disposed_to_kind: r.get(15)?,
            disposed_to_name: r.get(16)?,
            disposed_to_address: r.get(17)?,
            disposed_to_ffl: r.get(18)?,
            form_4473_transaction_number: r.get(19)?,
            disposition_reference: r.get(20)?,
            notes: r.get(21)?,
            created_at: r.get(22)?,
            created_by: r.get(23)?,
            supersedes_entry_id: r.get(24)?,
            superseded_by_entry_id: r.get(25)?,
            correction_reason: r.get(26)?,
            is_original_version: r.get::<_, i64>(27)? != 0,
            is_effective: r.get::<_, i64>(28)? != 0,
        })
    }

    const ENTRY_COLS: &'static str = "id, line_number, status, manufacturer, importer, model,
        serial_number, firearm_type, caliber_or_gauge, acquisition_date, acquired_from_kind,
        acquired_from_name, acquired_from_address, acquired_from_ffl, disposition_date,
        disposed_to_kind, disposed_to_name, disposed_to_address, disposed_to_ffl,
        form_4473_transaction_number, disposition_reference, notes, created_at, created_by,
        supersedes_entry_id, superseded_by_entry_id, correction_reason, is_original_version,
        is_effective";

    pub fn get_entry(&self, id: i64) -> Result<Option<BoundBookEntry>> {
        let conn = self.conn.lock().unwrap();
        let sql = format!(
            "SELECT {} FROM bound_book_entry WHERE id = ?1",
            Self::ENTRY_COLS
        );
        let entry = conn
            .query_row(&sql, params![id], Self::map_entry)
            .optional()?;
        Ok(entry)
    }

    pub fn search(&self, q: SearchQuery) -> Result<Vec<BoundBookEntry>> {
        let view = q.correction_view.as_deref().unwrap_or("corrected");
        let mut sql = format!("SELECT {} FROM bound_book_entry WHERE 1=1", Self::ENTRY_COLS);
        let mut vals: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();

        match view {
            "original" => sql.push_str(" AND is_original_version = 1"),
            "both" => {}
            _ => sql.push_str(" AND is_effective = 1"), // corrected / default
        }

        if q.open_only.unwrap_or(false) {
            sql.push_str(" AND status = 'open' AND is_effective = 1");
        }
        if let Some(ref s) = q.serial {
            if !s.trim().is_empty() {
                vals.push(Box::new(format!("%{}%", s.trim())));
                sql.push_str(&format!(" AND serial_number LIKE ?{}", vals.len()));
            }
        }
        if let Some(ref s) = q.manufacturer {
            if !s.trim().is_empty() {
                vals.push(Box::new(format!("%{}%", s.trim())));
                let n = vals.len();
                sql.push_str(&format!(
                    " AND (manufacturer LIKE ?{n} OR IFNULL(importer,'') LIKE ?{n})"
                ));
            }
        }
        if let Some(ref s) = q.name {
            if !s.trim().is_empty() {
                vals.push(Box::new(format!("%{}%", s.trim())));
                let n = vals.len();
                sql.push_str(&format!(
                    " AND (acquired_from_name LIKE ?{n} OR IFNULL(disposed_to_name,'') LIKE ?{n})"
                ));
            }
        }
        if let Some(ref s) = q.address {
            if !s.trim().is_empty() {
                vals.push(Box::new(format!("%{}%", s.trim())));
                let n = vals.len();
                sql.push_str(&format!(
                    " AND (IFNULL(acquired_from_address,'') LIKE ?{n} OR IFNULL(disposed_to_address,'') LIKE ?{n})"
                ));
            }
        }
        if let Some(ref s) = q.form_4473 {
            if !s.trim().is_empty() {
                vals.push(Box::new(format!("%{}%", s.trim())));
                sql.push_str(&format!(
                    " AND IFNULL(form_4473_transaction_number,'') LIKE ?{}",
                    vals.len()
                ));
            }
        }
        if let Some(ref s) = q.acquisition_date_from {
            if !s.trim().is_empty() {
                vals.push(Box::new(s.trim().to_string()));
                sql.push_str(&format!(" AND acquisition_date >= ?{}", vals.len()));
            }
        }
        if let Some(ref s) = q.acquisition_date_to {
            if !s.trim().is_empty() {
                vals.push(Box::new(s.trim().to_string()));
                sql.push_str(&format!(" AND acquisition_date <= ?{}", vals.len()));
            }
        }

        sql.push_str(" ORDER BY acquisition_date ASC, line_number ASC, id ASC");

        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(&sql)?;
        let params_refs: Vec<&dyn rusqlite::types::ToSql> =
            vals.iter().map(|v| v.as_ref()).collect();
        let rows = stmt.query_map(params_refs.as_slice(), Self::map_entry)?;
        let mut out = Vec::new();
        for row in rows {
            out.push(row?);
        }
        Ok(out)
    }

    pub fn add_acquisition(&self, input: AcquisitionInput) -> Result<BoundBookEntry> {
        self.validate_acquisition(&input)?;
        let actor = self.operator_name();
        let now = Utc::now().to_rfc3339();
        let id = {
            let conn = self.conn.lock().unwrap();
            let next_line: i64 = conn.query_row(
                "SELECT IFNULL(MAX(line_number), 0) + 1 FROM bound_book_entry",
                [],
                |r| r.get(0),
            )?;
            conn.execute(
                "INSERT INTO bound_book_entry(
                    line_number, status, manufacturer, importer, model, serial_number,
                    firearm_type, caliber_or_gauge, acquisition_date, acquired_from_kind,
                    acquired_from_name, acquired_from_address, acquired_from_ffl, notes,
                    created_at, created_by, is_original_version, is_effective
                 ) VALUES(?1,'open',?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,1,1)",
                params![
                    next_line,
                    input.manufacturer.trim(),
                    empty_to_none(input.importer),
                    input.model.trim(),
                    input.serial_number.trim(),
                    input.firearm_type.trim(),
                    input.caliber_or_gauge.trim(),
                    input.acquisition_date.trim(),
                    input.acquired_from_kind.trim(),
                    input.acquired_from_name.trim(),
                    empty_to_none(input.acquired_from_address),
                    empty_to_none(input.acquired_from_ffl),
                    empty_to_none(input.notes),
                    now,
                    actor,
                ],
            )?;
            conn.last_insert_rowid()
        };
        self.audit(
            "add_acquisition",
            "bound_book_entry",
            Some(id),
            Some(&input.serial_number),
            &actor,
        )?;
        self.get_entry(id)?.context("entry missing")
    }

    fn validate_acquisition(&self, input: &AcquisitionInput) -> Result<()> {
        if input.manufacturer.trim().is_empty() {
            bail!("Manufacturer is required (or “privately made firearm” / PMF)");
        }
        if input.model.trim().is_empty() {
            bail!("Model is required");
        }
        if input.serial_number.trim().is_empty() {
            bail!("Serial number is required");
        }
        if input.firearm_type.trim().is_empty() {
            bail!("Type is required");
        }
        if input.caliber_or_gauge.trim().is_empty() {
            bail!("Caliber or gauge is required");
        }
        if input.acquisition_date.trim().is_empty() {
            bail!("Date of receipt is required");
        }
        if input.acquired_from_name.trim().is_empty() {
            bail!("Name (from whom received) is required");
        }
        match input.acquired_from_kind.as_str() {
            "nonlicensee" => {
                if input
                    .acquired_from_address
                    .as_ref()
                    .map(|s| s.trim().is_empty())
                    .unwrap_or(true)
                {
                    bail!("Nonlicensee acquisition requires name and address");
                }
            }
            "licensee" => {
                if input
                    .acquired_from_ffl
                    .as_ref()
                    .map(|s| s.trim().is_empty())
                    .unwrap_or(true)
                {
                    bail!("Licensee acquisition requires FFL number");
                }
            }
            "opening_inventory" => {}
            "other" => {
                let no_addr = input
                    .acquired_from_address
                    .as_ref()
                    .map(|s| s.trim().is_empty())
                    .unwrap_or(true);
                let no_ffl = input
                    .acquired_from_ffl
                    .as_ref()
                    .map(|s| s.trim().is_empty())
                    .unwrap_or(true);
                if no_addr && no_ffl {
                    bail!("Other acquisition requires an address and/or FFL number");
                }
            }
            _ => bail!("Invalid acquired_from_kind"),
        }
        Ok(())
    }

    pub fn record_disposition(&self, input: DispositionInput) -> Result<BoundBookEntry> {
        let existing = self
            .get_entry(input.entry_id)?
            .context("Entry not found")?;
        if !existing.is_effective {
            bail!("Cannot dispose a superseded entry; correct the effective line");
        }
        if existing.status != "open" {
            bail!("Entry is already disposed");
        }
        if input.disposition_date.trim().is_empty() {
            bail!("Disposition date is required");
        }
        // Disposition-before-acquisition is a soft warning in the UI (unusual, not blocked).
        Self::validate_disposition_fields(
            &input.disposed_to_kind,
            &input.disposed_to_name,
            &input.disposed_to_address,
            &input.disposed_to_ffl,
            &input.form_4473_transaction_number,
            &input.disposition_reference,
        )?;

        let actor = self.operator_name();
        let date_warning = input.disposition_date.trim() < existing.acquisition_date.as_str();
        {
            let conn = self.conn.lock().unwrap();
            conn.execute(
                "UPDATE bound_book_entry SET
                    status = 'disposed',
                    disposition_date = ?1,
                    disposed_to_kind = ?2,
                    disposed_to_name = ?3,
                    disposed_to_address = ?4,
                    disposed_to_ffl = ?5,
                    form_4473_transaction_number = ?6,
                    disposition_reference = ?7,
                    notes = COALESCE(?8, notes)
                 WHERE id = ?9",
                params![
                    input.disposition_date.trim(),
                    input.disposed_to_kind.trim(),
                    empty_to_none(input.disposed_to_name),
                    empty_to_none(input.disposed_to_address),
                    empty_to_none(input.disposed_to_ffl),
                    empty_to_none(input.form_4473_transaction_number),
                    empty_to_none(input.disposition_reference),
                    empty_to_none(input.notes),
                    input.entry_id,
                ],
            )?;
        }
        // Note: disposition fills blank columns on the same line (like paper).
        // Corrections that change content use method (a) via correct_entry.
        let detail = if date_warning {
            Some(format!(
                "{{\"warning\":\"disposition_before_acquisition\",\"acq\":\"{}\",\"disp\":\"{}\"}}",
                existing.acquisition_date,
                input.disposition_date.trim()
            ))
        } else {
            None
        };
        self.audit(
            "record_disposition",
            "bound_book_entry",
            Some(input.entry_id),
            detail.as_deref(),
            &actor,
        )?;
        self.get_entry(input.entry_id)?.context("entry missing")
    }

    fn validate_disposition_fields(
        kind: &str,
        name: &Option<String>,
        address: &Option<String>,
        ffl: &Option<String>,
        form_4473: &Option<String>,
        reference: &Option<String>,
    ) -> Result<()> {
        let empty = |v: &Option<String>| v.as_ref().map(|s| s.trim().is_empty()).unwrap_or(true);
        match kind {
            "nonlicensee" => {
                if empty(name) || empty(address) {
                    bail!("Nonlicensee disposition requires name and address (or use Form 4473 txn #)");
                }
            }
            "licensee" => {
                if empty(name) {
                    bail!("Licensee disposition requires name");
                }
                if empty(ffl) {
                    bail!("Licensee disposition requires FFL number");
                }
            }
            "form_4473" => {
                if empty(form_4473) {
                    bail!("Form 4473 disposition requires transaction number");
                }
            }
            "book_rollover_ref" => {
                if empty(reference) {
                    bail!("Book rollover requires a reference to the subsequent entry");
                }
            }
            "other" => {
                if empty(name) {
                    bail!("Other disposition requires a name");
                }
                if empty(address) && empty(ffl) && empty(form_4473) && empty(reference) {
                    bail!(
                        "Other disposition requires address, FFL, 4473 txn #, or a reference"
                    );
                }
            }
            _ => bail!("Invalid disposed_to_kind"),
        }
        Ok(())
    }

    /// Effective open lines with the same serial (case-sensitive trim match).
    pub fn find_open_by_serial(&self, serial: &str) -> Result<Vec<BoundBookEntry>> {
        let serial = serial.trim();
        if serial.is_empty() {
            return Ok(vec![]);
        }
        let conn = self.conn.lock().unwrap();
        let sql = format!(
            "SELECT {} FROM bound_book_entry
             WHERE is_effective = 1 AND status = 'open' AND serial_number = ?1
             ORDER BY line_number ASC",
            Self::ENTRY_COLS
        );
        let mut stmt = conn.prepare(&sql)?;
        let rows = stmt.query_map(params![serial], Self::map_entry)?;
        let mut out = Vec::new();
        for row in rows {
            out.push(row?);
        }
        Ok(out)
    }

    pub fn correct_entry(&self, input: CorrectionInput) -> Result<BoundBookEntry> {
        if input.reason.trim().is_empty() {
            bail!("Correction reason is required (ATF Ruling 2016-1 method a)");
        }
        let old = self
            .get_entry(input.entry_id)?
            .context("Entry not found")?;
        if !old.is_effective {
            bail!("Can only correct the effective version of a line");
        }

        let acq = AcquisitionInput {
            manufacturer: input.manufacturer.clone(),
            importer: input.importer.clone(),
            model: input.model.clone(),
            serial_number: input.serial_number.clone(),
            firearm_type: input.firearm_type.clone(),
            caliber_or_gauge: input.caliber_or_gauge.clone(),
            acquisition_date: input.acquisition_date.clone(),
            acquired_from_kind: input.acquired_from_kind.clone(),
            acquired_from_name: input.acquired_from_name.clone(),
            acquired_from_address: input.acquired_from_address.clone(),
            acquired_from_ffl: input.acquired_from_ffl.clone(),
            notes: input.notes.clone(),
        };
        self.validate_acquisition(&acq)?;

        let status = if input.disposition_date.as_ref().map(|s| !s.trim().is_empty()).unwrap_or(false)
        {
            "disposed"
        } else {
            "open"
        };
        if status == "disposed" {
            let kind = input
                .disposed_to_kind
                .as_deref()
                .unwrap_or("")
                .trim()
                .to_string();
            if kind.is_empty() {
                bail!("Disposed lines require a disposition kind");
            }
            Self::validate_disposition_fields(
                &kind,
                &input.disposed_to_name,
                &input.disposed_to_address,
                &input.disposed_to_ffl,
                &input.form_4473_transaction_number,
                &input.disposition_reference,
            )?;
        }
        let actor = self.operator_name();
        let now = Utc::now().to_rfc3339();

        let new_id = {
            let conn = self.conn.lock().unwrap();
            let tx = conn.unchecked_transaction()?;
            tx.execute(
                "UPDATE bound_book_entry SET is_effective = 0, status = CASE
                    WHEN status = 'open' THEN 'superseded'
                    ELSE status
                 END WHERE id = ?1",
                params![old.id],
            )?;
            tx.execute(
                "INSERT INTO bound_book_entry(
                    line_number, status, manufacturer, importer, model, serial_number,
                    firearm_type, caliber_or_gauge, acquisition_date, acquired_from_kind,
                    acquired_from_name, acquired_from_address, acquired_from_ffl,
                    disposition_date, disposed_to_kind, disposed_to_name, disposed_to_address,
                    disposed_to_ffl, form_4473_transaction_number, disposition_reference, notes,
                    created_at, created_by, supersedes_entry_id, correction_reason,
                    is_original_version, is_effective
                 ) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18,?19,?20,?21,?22,?23,?24,?25,0,1)",
                params![
                    old.line_number,
                    status,
                    input.manufacturer.trim(),
                    empty_to_none(input.importer),
                    input.model.trim(),
                    input.serial_number.trim(),
                    input.firearm_type.trim(),
                    input.caliber_or_gauge.trim(),
                    input.acquisition_date.trim(),
                    input.acquired_from_kind.trim(),
                    input.acquired_from_name.trim(),
                    empty_to_none(input.acquired_from_address),
                    empty_to_none(input.acquired_from_ffl),
                    empty_to_none(input.disposition_date),
                    empty_to_none(input.disposed_to_kind),
                    empty_to_none(input.disposed_to_name),
                    empty_to_none(input.disposed_to_address),
                    empty_to_none(input.disposed_to_ffl),
                    empty_to_none(input.form_4473_transaction_number),
                    empty_to_none(input.disposition_reference),
                    empty_to_none(input.notes),
                    now,
                    actor,
                    old.id,
                    input.reason.trim(),
                ],
            )?;
            let new_id = tx.last_insert_rowid();
            tx.execute(
                "UPDATE bound_book_entry SET superseded_by_entry_id = ?1 WHERE id = ?2",
                params![new_id, old.id],
            )?;
            tx.commit()?;
            new_id
        };

        self.audit(
            "correct_entry",
            "bound_book_entry",
            Some(new_id),
            Some(&format!(
                "{{\"supersedes\":{},\"reason\":{}}}",
                old.id,
                serde_json::to_string(&input.reason).unwrap_or_default()
            )),
            &actor,
        )?;
        self.get_entry(new_id)?.context("entry missing")
    }

    pub fn record_export(
        &self,
        kind: &str,
        path: &str,
        entry_count: i64,
        notes: Option<&str>,
    ) -> Result<ExportResult> {
        let created_at = Utc::now().to_rfc3339();
        {
            let conn = self.conn.lock().unwrap();
            conn.execute(
                "INSERT INTO export_artifact(kind, created_at, path, entry_count, notes)
                 VALUES(?1,?2,?3,?4,?5)",
                params![kind, created_at, path, entry_count, notes],
            )?;
        }
        if kind == "atf_download" || kind == "csv" || kind == "pdf" {
            self.set_setting("last_atf_export_at", &created_at)?;
        }
        if kind == "backup" {
            self.set_setting("last_backup_at", &created_at)?;
        }
        Ok(ExportResult {
            path: path.to_string(),
            kind: kind.to_string(),
            entry_count,
            created_at,
        })
    }

    pub fn db_path(&self) -> &Path {
        &self.path
    }
}

fn empty_to_none(v: Option<String>) -> Option<String> {
    v.and_then(|s| {
        let t = s.trim().to_string();
        if t.is_empty() {
            None
        } else {
            Some(t)
        }
    })
}
