import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { open, save } from "@tauri-apps/plugin-dialog";
import { api, formatFromWhom, formatToWhom } from "./api";
import {
  acquisitionWarnings,
  dispositionWarnings,
  hasErrors,
  type FieldErrors,
  validateAcquisition,
  validateDisposition,
} from "./entryValidation";
import { InspectionView } from "./InspectionView";
import { buildBoundBookPdf } from "./printPdf";
import type {
  BoundBookEntry,
  License,
  Panel,
  SearchQuery,
} from "./types";
import "./App.css";

function FieldError({ errors, name }: { errors: FieldErrors; name: string }) {
  const msg = errors[name];
  if (!msg) return null;
  return <span className="field-error">{msg}</span>;
}

function fieldClass(errors: FieldErrors, name: string, extra = "") {
  return ["field", extra, errors[name] ? "has-error" : ""].filter(Boolean).join(" ");
}

const FIREARM_TYPES = [
  "Pistol",
  "Revolver",
  "Rifle",
  "Shotgun",
  "Receiver",
  "Frame",
  "Other",
  "Antique",
];

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export default function App() {
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [license, setLicense] = useState<License | null>(null);
  const [entries, setEntries] = useState<BoundBookEntry[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [panel, setPanel] = useState<Panel>("book");
  const [dbPath, setDbPath] = useState("");
  const [openCount, setOpenCount] = useState(0);
  const [query, setQuery] = useState<SearchQuery>({
    correctionView: "corrected",
  });
  const [backupFolder, setBackupFolder] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [passphraseConfirm, setPassphraseConfirm] = useState("");
  const [lastBackupAt, setLastBackupAt] = useState<string | null>(null);
  const [lastExportAt, setLastExportAt] = useState<string | null>(null);
  const [backupDue, setBackupDue] = useState(true);
  const [atfDownloadDue, setAtfDownloadDue] = useState(true);
  const [corrErrors, setCorrErrors] = useState<FieldErrors>({});
  const [showBackupModal, setShowBackupModal] = useState(false);
  const [modalPassphrase, setModalPassphrase] = useState("");
  const [restorePath, setRestorePath] = useState("");
  const [restorePassphrase, setRestorePassphrase] = useState("");
  const [confirmRestore, setConfirmRestore] = useState(false);
  const [acqFromKind, setAcqFromKind] = useState("licensee");
  const [dispToKind, setDispToKind] = useState("form_4473");
  const [sampleLoaded, setSampleLoaded] = useState(false);
  const [sampleCount, setSampleCount] = useState(0);
  const [acqErrors, setAcqErrors] = useState<FieldErrors>({});
  const [dispErrors, setDispErrors] = useState<FieldErrors>({});
  const [acqWarnings, setAcqWarnings] = useState<string[]>([]);
  const [dispWarnings, setDispWarnings] = useState<string[]>([]);
  const [acqWarnAck, setAcqWarnAck] = useState(false);
  const [dispWarnAck, setDispWarnAck] = useState(false);

  const selected = useMemo(
    () => entries.find((e) => e.id === selectedId) ?? null,
    [entries, selectedId],
  );

  const applyBackupSettings = useCallback(
    (backup: Awaited<ReturnType<typeof api.getBackupSettings>> | null) => {
      if (!backup) return;
      setBackupFolder(backup.backupFolder ?? "");
      setLastBackupAt(backup.lastBackupAt ?? null);
      setLastExportAt(backup.lastAtfExportAt ?? null);
      setBackupDue(backup.backupDue);
      setAtfDownloadDue(backup.atfDownloadDue);
    },
    [],
  );

  const refresh = useCallback(
    async (q?: SearchQuery) => {
      const [lic, list, backup, sample] = await Promise.all([
        api.getLicense(),
        api.searchEntries(q ?? query),
        api.getBackupSettings().catch(() => null),
        api.getSampleDemoStatus().catch(() => null),
      ]);
      setLicense(lic);
      setEntries(list);
      setOpenCount(list.filter((e) => e.status === "open" && e.isEffective).length);
      applyBackupSettings(backup);
      if (sample) {
        setSampleLoaded(sample.loaded);
        setSampleCount(sample.sampleCount);
      }
      if (!lic) setPanel("setup");
    },
    [query, applyBackupSettings],
  );

  useEffect(() => {
    (async () => {
      try {
        setBusy(true);
        const status = await api.openOrCreateDb();
        setDbPath(status.path);
        await refresh({ correctionView: "corrected" });
        setReady(true);
      } catch (e) {
        setError(String(e));
      } finally {
        setBusy(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function pickBackupFolder() {
    setError(null);
    try {
      const selectedFolder = await open({
        directory: true,
        multiple: false,
        title: "Choose backup folder (OneDrive or Google Drive sync folder)",
      });
      if (typeof selectedFolder === "string" && selectedFolder) {
        setBackupFolder(selectedFolder);
        await api.setBackupFolder(selectedFolder);
        setNotice(`Backup folder set: ${selectedFolder}`);
      }
    } catch (err) {
      setError(String(err));
    }
  }

  async function pickRestoreFile() {
    setError(null);
    try {
      const file = await open({
        multiple: false,
        title: "Open encrypted bound-book backup",
        filters: [{ name: "Rettmark backup", extensions: ["rfbk"] }],
      });
      if (typeof file === "string" && file) {
        setRestorePath(file);
      }
    } catch (err) {
      setError(String(err));
    }
  }

  async function runSearch(e?: FormEvent) {
    e?.preventDefault();
    setError(null);
    try {
      setBusy(true);
      const list = await api.searchEntries(query);
      setEntries(list);
      setOpenCount(list.filter((row) => row.status === "open" && row.isEffective).length);
      setPanel("book");
      setNotice(`Showing ${list.length} line(s).`);
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleSetup(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setError(null);
    try {
      setBusy(true);
      const lic = await api.saveLicense({
        fflNumber: String(fd.get("fflNumber") || ""),
        businessName: String(fd.get("businessName") || ""),
        premisesNotes: String(fd.get("premisesNotes") || "") || null,
        forms4473FiledNumerically: fd.get("forms4473") === "on",
        operatorName: String(fd.get("operatorName") || "Ken Brown"),
      });
      setLicense(lic);
      setPanel("book");
      setNotice(
        "License saved. Next: record an Acquisition (receipt) line — same columns as the paper book.",
      );
      await refresh();
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleAcquire(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    const values = {
      manufacturer: String(fd.get("manufacturer") || ""),
      model: String(fd.get("model") || ""),
      serialNumber: String(fd.get("serialNumber") || ""),
      firearmType: String(fd.get("firearmType") || ""),
      caliberOrGauge: String(fd.get("caliberOrGauge") || ""),
      acquisitionDate: String(fd.get("acquisitionDate") || ""),
      acquiredFromKind: String(fd.get("acquiredFromKind") || acqFromKind),
      acquiredFromName: String(fd.get("acquiredFromName") || ""),
      acquiredFromAddress: String(fd.get("acquiredFromAddress") || ""),
      acquiredFromFfl: String(fd.get("acquiredFromFfl") || ""),
    };
    const errors = validateAcquisition(values);
    setAcqErrors(errors);
    if (hasErrors(errors)) {
      setError("Fix required fields before saving the acquisition line.");
      return;
    }

    setError(null);
    try {
      setBusy(true);
      const dupes = await api.findOpenBySerial(values.serialNumber);
      const warnings = acquisitionWarnings(
        values,
        dupes.map((d) => `line ${d.lineNumber}`),
      );
      setAcqWarnings(warnings);
      if (warnings.length > 0 && !acqWarnAck) {
        setError(null);
        setNotice(null);
        return;
      }

      const entry = await api.addAcquisition({
        manufacturer: values.manufacturer,
        importer: String(fd.get("importer") || "") || null,
        model: values.model,
        serialNumber: values.serialNumber,
        firearmType: values.firearmType,
        caliberOrGauge: values.caliberOrGauge,
        acquisitionDate: values.acquisitionDate,
        acquiredFromKind: values.acquiredFromKind,
        acquiredFromName: values.acquiredFromName,
        acquiredFromAddress: values.acquiredFromAddress || null,
        acquiredFromFfl: values.acquiredFromFfl || null,
        notes: String(fd.get("notes") || "") || null,
      });
      setSelectedId(entry.id);
      setAcqErrors({});
      setAcqWarnings([]);
      setAcqWarnAck(false);
      setNotice(
        `Line ${entry.lineNumber} acquired. When sold, select it and open Disposition.`,
      );
      form.reset();
      setAcqFromKind("licensee");
      await refresh();
      setPanel("book");
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleDispose(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!selected) {
      setError("Select an open acquisition line first.");
      return;
    }
    const fd = new FormData(e.currentTarget);
    const values = {
      dispositionDate: String(fd.get("dispositionDate") || ""),
      disposedToKind: String(fd.get("disposedToKind") || dispToKind),
      disposedToName: String(fd.get("disposedToName") || ""),
      disposedToAddress: String(fd.get("disposedToAddress") || ""),
      disposedToFfl: String(fd.get("disposedToFfl") || ""),
      form4473TransactionNumber: String(fd.get("form4473TransactionNumber") || ""),
      dispositionReference: String(fd.get("dispositionReference") || ""),
      acquisitionDate: selected.acquisitionDate,
    };
    const errors = validateDisposition(values);
    setDispErrors(errors);
    if (hasErrors(errors)) {
      setError("Fix required disposition fields before saving.");
      return;
    }

    const warnings = dispositionWarnings(values);
    setDispWarnings(warnings);
    if (warnings.length > 0 && !dispWarnAck) {
      setError(null);
      return;
    }

    setError(null);
    try {
      setBusy(true);
      await api.recordDisposition({
        entryId: selected.id,
        dispositionDate: values.dispositionDate,
        disposedToKind: values.disposedToKind,
        disposedToName: values.disposedToName || null,
        disposedToAddress: values.disposedToAddress || null,
        disposedToFfl: values.disposedToFfl || null,
        form4473TransactionNumber: values.form4473TransactionNumber || null,
        dispositionReference: values.dispositionReference || null,
        notes: String(fd.get("notes") || "") || null,
      });
      setDispErrors({});
      setDispWarnings([]);
      setDispWarnAck(false);
      setNotice(`Disposition recorded on line ${selected.lineNumber}.`);
      await refresh();
      setPanel("book");
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleCorrect(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!selected) {
      setError("Select the effective line to correct.");
      return;
    }
    const fd = new FormData(e.currentTarget);
    const reason = String(fd.get("reason") || "");
    const acqValues = {
      manufacturer: String(fd.get("manufacturer") || ""),
      model: String(fd.get("model") || ""),
      serialNumber: String(fd.get("serialNumber") || ""),
      firearmType: String(fd.get("firearmType") || ""),
      caliberOrGauge: String(fd.get("caliberOrGauge") || ""),
      acquisitionDate: String(fd.get("acquisitionDate") || ""),
      acquiredFromKind: String(fd.get("acquiredFromKind") || ""),
      acquiredFromName: String(fd.get("acquiredFromName") || ""),
      acquiredFromAddress: String(fd.get("acquiredFromAddress") || ""),
      acquiredFromFfl: String(fd.get("acquiredFromFfl") || ""),
    };
    const dispositionDate = String(fd.get("dispositionDate") || "");
    const disposedToKind = String(fd.get("disposedToKind") || "");
    let errors = validateAcquisition(acqValues);
    if (!reason.trim()) {
      errors = { ...errors, reason: "Correction reason is required (2016-1 method a)." };
    }
    if (dispositionDate.trim()) {
      if (!disposedToKind.trim()) {
        errors = { ...errors, disposedToKind: "Disposed lines need a disposition kind." };
      } else {
        errors = {
          ...errors,
          ...validateDisposition({
            dispositionDate,
            disposedToKind,
            disposedToName: String(fd.get("disposedToName") || ""),
            disposedToAddress: String(fd.get("disposedToAddress") || ""),
            disposedToFfl: String(fd.get("disposedToFfl") || ""),
            form4473TransactionNumber: String(fd.get("form4473TransactionNumber") || ""),
            dispositionReference: String(fd.get("dispositionReference") || ""),
            acquisitionDate: acqValues.acquisitionDate,
          }),
        };
      }
    }
    setCorrErrors(errors);
    if (hasErrors(errors)) {
      setError("Fix required fields before saving the correction.");
      return;
    }

    setError(null);
    try {
      setBusy(true);
      const entry = await api.correctEntry({
        entryId: selected.id,
        reason,
        manufacturer: acqValues.manufacturer,
        importer: String(fd.get("importer") || "") || null,
        model: acqValues.model,
        serialNumber: acqValues.serialNumber,
        firearmType: acqValues.firearmType,
        caliberOrGauge: acqValues.caliberOrGauge,
        acquisitionDate: acqValues.acquisitionDate,
        acquiredFromKind: acqValues.acquiredFromKind,
        acquiredFromName: acqValues.acquiredFromName,
        acquiredFromAddress: acqValues.acquiredFromAddress || null,
        acquiredFromFfl: acqValues.acquiredFromFfl || null,
        dispositionDate: dispositionDate || null,
        disposedToKind: disposedToKind || null,
        disposedToName: String(fd.get("disposedToName") || "") || null,
        disposedToAddress: String(fd.get("disposedToAddress") || "") || null,
        disposedToFfl: String(fd.get("disposedToFfl") || "") || null,
        form4473TransactionNumber:
          String(fd.get("form4473TransactionNumber") || "") || null,
        dispositionReference: String(fd.get("dispositionReference") || "") || null,
        notes: String(fd.get("notes") || "") || null,
      });
      setSelectedId(entry.id);
      setCorrErrors({});
      setNotice(
        `Correction saved for line ${entry.lineNumber}. Original retained (2016-1 method a).`,
      );
      await refresh();
      setPanel("book");
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  async function exportCsv() {
    setError(null);
    try {
      const dest = await save({
        defaultPath: `rettmark-ad-${todayISO()}.csv`,
        filters: [{ name: "CSV", extensions: ["csv"] }],
      });
      if (!dest) return;
      setBusy(true);
      const result = await api.exportCsv(dest);
      setLastExportAt(result.createdAt);
      setAtfDownloadDue(false);
      setNotice(`CSV export written (${result.entryCount} lines): ${result.path}`);
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  async function exportAscii() {
    setError(null);
    try {
      const dest = await save({
        defaultPath: `rettmark-ad-${todayISO()}.txt`,
        filters: [{ name: "Text", extensions: ["txt"] }],
      });
      if (!dest) return;
      setBusy(true);
      const result = await api.exportAscii(dest);
      setLastExportAt(result.createdAt);
      setAtfDownloadDue(false);
      setNotice(`ASCII download written (${result.entryCount} lines): ${result.path}`);
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  async function exportPdf() {
    setError(null);
    try {
      setBusy(true);
      const list = await api.listEntriesForPrint("corrected");
      const doc = buildBoundBookPdf(license, list);
      doc.save(`rettmark-ad-${todayISO()}.pdf`);
      setNotice(`PDF generated for ${list.length} lines (print/save locally).`);
      setLastExportAt(new Date().toISOString());
      setAtfDownloadDue(false);
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  async function exportInspectionPackage() {
    setError(null);
    try {
      const parent = await open({
        directory: true,
        multiple: false,
        title: "Choose folder for inspection / OOB export package",
      });
      if (typeof parent !== "string" || !parent) return;
      setBusy(true);
      const pkg = await api.exportInspectionPackage(parent);
      const list = await api.listEntriesForPrint("corrected");
      const doc = buildBoundBookPdf(license, list);
      const dataUri = doc.output("datauristring");
      const base64 = dataUri.split(",")[1] ?? "";
      const pdfName = pkg.csvPath.replace(/\.csv$/i, ".pdf");
      await api.writeBinaryFile(pdfName, base64);
      setLastExportAt(pkg.createdAt);
      setAtfDownloadDue(false);
      setNotice(
        `ATF inspection package written (${pkg.entryCount} lines): ${pkg.directory} (PDF + CSV + ASCII + MANIFEST)`,
      );
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  async function openInspection() {
    setError(null);
    try {
      setBusy(true);
      const list = await api.listEntriesForPrint("corrected");
      setEntries(list);
      setPanel("inspect");
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  async function loadSampleDemo() {
    setError(null);
    try {
      setBusy(true);
      const status = await api.loadSampleDemo();
      setSampleLoaded(status.loaded);
      setSampleCount(status.sampleCount);
      await refresh({ correctionView: "corrected" });
      setPanel("book");
      setNotice(
        `Loaded ${status.sampleCount} SAMPLE/DEMO row(s) — fictional only. Open inventory, Inspection, or Export to click through; Wipe sample when done.`,
      );
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  async function wipeSampleDemo() {
    setError(null);
    try {
      setBusy(true);
      const status = await api.wipeSampleDemo();
      setSampleLoaded(status.loaded);
      setSampleCount(status.sampleCount);
      setSelectedId(null);
      await refresh({ correctionView: "corrected" });
      setNotice("SAMPLE/DEMO lines removed. License profile left in place.");
      setPanel("book");
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  async function startSampleDemoProfile() {
    setError(null);
    try {
      setBusy(true);
      await api.saveLicense({
        fflNumber: "DEMO-NOT-A-REAL-FFL",
        businessName: "Rettmark Firearms (SAMPLE/DEMO)",
        premisesNotes:
          "SAMPLE/DEMO license profile — replace with real FFL before production use",
        forms4473FiledNumerically: true,
        operatorName: "Ken Brown",
      });
      const status = await api.loadSampleDemo();
      setSampleLoaded(status.loaded);
      setSampleCount(status.sampleCount);
      await refresh({ correctionView: "corrected" });
      setPanel("book");
      setNotice(
        "SAMPLE/DEMO book ready: 2 open lines, disposed lines, and one correction. Not a real A&D record.",
      );
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  async function saveBackupSettings(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      if (passphrase) {
        if (passphrase !== passphraseConfirm) {
          setError("Passphrase confirmation does not match.");
          return;
        }
        await api.setBackupPassphrase(passphrase);
      }
      if (backupFolder.trim()) {
        await api.setBackupFolder(backupFolder.trim());
      }
      setNotice("Backup settings saved. Passphrase is not stored in plaintext.");
      setPassphrase("");
      setPassphraseConfirm("");
    } catch (err) {
      setError(String(err));
    }
  }

  async function doEncryptedBackup(pass: string) {
    if (pass.trim().length < 8) {
      setError("Enter the backup passphrase (min 8 characters) to encrypt.");
      return;
    }
    if (!backupFolder.trim()) {
      setError("Choose a backup folder first (OneDrive or Google Drive sync path).");
      setPanel("settings");
      setShowBackupModal(false);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await api.runEncryptedBackup(pass, backupFolder.trim());
      setLastBackupAt(result.createdAt);
      setBackupDue(false);
      setNotice(`Encrypted backup written (${result.bytes} bytes): ${result.path}`);
      setPassphrase("");
      setPassphraseConfirm("");
      setModalPassphrase("");
      setShowBackupModal(false);
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  async function runBackup(e: FormEvent) {
    e.preventDefault();
    await doEncryptedBackup(passphrase);
  }

  async function runModalBackup(e: FormEvent) {
    e.preventDefault();
    await doEncryptedBackup(modalPassphrase);
  }

  async function runRestore(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!restorePath.trim()) {
      setError("Choose a .rfbk backup file to restore.");
      return;
    }
    if (!confirmRestore) {
      setError("Check the confirmation box — restore replaces the live bound book.");
      return;
    }
    try {
      setBusy(true);
      const result = await api.restoreFromBackup(restorePath.trim(), restorePassphrase);
      setDbPath(result.path);
      setSelectedId(null);
      setRestorePassphrase("");
      setConfirmRestore(false);
      await refresh({ correctionView: "corrected" });
      setNotice(
        `Restored ${result.entryCount} effective line(s).` +
          (result.safetyCopyPath
            ? ` Previous book saved as safety copy: ${result.safetyCopyPath}`
            : ""),
      );
      setPanel("book");
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  if (!ready && !error) {
    return (
      <div className="setup-hero">
        <h1>Rettmark Firearms</h1>
        <p>Opening local bound book…</p>
      </div>
    );
  }

  if (!license || panel === "setup") {
    return (
      <div className="app-shell">
        <div className="setup-hero">
          <h1>Rettmark Firearms</h1>
          <p>
            First-run setup for the Type 01 dealer Acquisition &amp; Disposition book
            (§ 478.125(e)). One license, one user, records stay on this computer.
          </p>
          <ol className="setup-steps">
            <li>
              Fastest: <strong>Try SAMPLE/DEMO book</strong> (fictional lines — wipe anytime)
            </li>
            <li>Or enter your real FFL profile below and add live acquisitions</li>
            <li>Use Inspection + Export package, then Backup to your Drive folder</li>
          </ol>
          {error && <div className="status-line error">{error}</div>}
          <div className="form-actions" style={{ marginTop: "1rem" }}>
            <button
              className="btn"
              type="button"
              disabled={busy}
              onClick={() => void startSampleDemoProfile()}
            >
              Try SAMPLE/DEMO book
            </button>
          </div>
          <p className="lede" style={{ marginTop: "1rem" }}>
            Or set up your real license profile:
          </p>
          <form onSubmit={handleSetup} className="form-grid" style={{ marginTop: "0.5rem" }}>
            <div className="field wide">
              <label htmlFor="businessName">Business name</label>
              <input
                id="businessName"
                name="businessName"
                required
                defaultValue="Rettmark Firearms"
              />
            </div>
            <div className="field">
              <label htmlFor="fflNumber">FFL number</label>
              <input
                id="fflNumber"
                name="fflNumber"
                required
                placeholder="1-XX-XXX-XX-XX-XXXXX"
              />
            </div>
            <div className="field">
              <label htmlFor="operatorName">Operator</label>
              <input
                id="operatorName"
                name="operatorName"
                required
                defaultValue="Ken Brown"
              />
            </div>
            <div className="field wide">
              <label htmlFor="premisesNotes">Premises notes</label>
              <input id="premisesNotes" name="premisesNotes" placeholder="Licensed premises" />
            </div>
            <div className="field wide">
              <label htmlFor="forms4473" className="checkbox-label">
                <input id="forms4473" name="forms4473" type="checkbox" defaultChecked /> Forms
                4473 filed numerically (use 4473 txn # on disposition when provided)
              </label>
            </div>
            <div className="form-actions">
              <button className="btn" type="submit" disabled={busy}>
                Open bound book
              </button>
              {license && (
                <button
                  className="btn secondary"
                  type="button"
                  onClick={() => setPanel("book")}
                >
                  Cancel
                </button>
              )}
            </div>
          </form>
        </div>
        <p className="disclaimer">
          ATF does not certify or endorse software. This tool is not legal advice. The FFL remains
          responsible for accurate records under 27 CFR Part 478 and ATF Ruling 2016-1.
        </p>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand-block">
          <h1 className="brand">{license.businessName}</h1>
          <p className="brand-sub">
            Firearms Acquisition &amp; Disposition Bound Book · FFL {license.fflNumber}
          </p>
        </div>
        <div className="meta-strip">
          <span>
            <strong>{entries.length}</strong> lines shown
          </span>
          <span>
            <strong>{openCount}</strong> open
          </span>
          <span title={dbPath}>Local SQLite</span>
          {lastBackupAt ? (
            <span>
              Last backup: <strong>{new Date(lastBackupAt).toLocaleString()}</strong>
            </span>
          ) : (
            <span>
              Last backup: <strong>never</strong>
            </span>
          )}
          <button
            type="button"
            className="btn"
            onClick={() => {
              setError(null);
              setShowBackupModal(true);
            }}
          >
            Backup now
          </button>
        </div>
      </header>

      {sampleLoaded && (
        <div className="sample-banner no-print" role="status">
          <div>
            <strong>SAMPLE/DEMO data loaded</strong> ({sampleCount} row(s)). Fictional serials and
            FFLs only — not a real A&amp;D record. Wipe before entering production lines.
          </div>
          <div className="backup-banner-actions">
            <button
              type="button"
              className="btn secondary"
              onClick={() => void openInspection()}
            >
              Inspection
            </button>
            <button
              type="button"
              className="btn danger"
              disabled={busy}
              onClick={() => void wipeSampleDemo()}
            >
              Wipe sample data
            </button>
          </div>
        </div>
      )}

      {backupDue && (
        <div className="backup-banner no-print" role="status">
          <div>
            <strong>Backup due.</strong>{" "}
            {lastBackupAt
              ? "Last encrypted backup was more than 24 hours ago."
              : "No encrypted backup yet — set a Drive folder and run one today."}{" "}
            Ruling 2016-1 expects a daily backup habit against loss.
          </div>
          <div className="backup-banner-actions">
            <button
              type="button"
              className="btn"
              onClick={() => {
                setError(null);
                setShowBackupModal(true);
              }}
            >
              Backup now
            </button>
            <button
              type="button"
              className="btn secondary"
              onClick={() => setPanel("settings")}
            >
              Backup settings
            </button>
          </div>
        </div>
      )}

      {atfDownloadDue && (
        <div className="atf-banner no-print" role="status">
          <div>
            <strong>Premises download/print due.</strong>{" "}
            {lastExportAt
              ? "Last ATF-style export was more than ~6 months ago."
              : "No unencrypted premises download/print recorded yet."}{" "}
            For local systems, Ruling 2016-1 expects at least a semiannual download/print (and
            print on ATF request within 24 hours). Keep the file on this PC or a USB stick.
          </div>
          <div className="backup-banner-actions">
            <button
              type="button"
              className="btn"
              onClick={() => void openInspection()}
            >
              Inspection / export
            </button>
            <button
              type="button"
              className="btn secondary"
              onClick={() => setPanel("export")}
            >
              Print / export
            </button>
          </div>
        </div>
      )}

      <nav className="nav no-print">
        {(
          [
            ["book", "Bound book"],
            ["acquire", "Acquisition"],
            ["dispose", "Disposition"],
            ["correct", "Correct"],
            ["inspect", "Inspection"],
            ["export", "Print / export"],
            ["settings", "Backup & license"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={panel === id ? "active" : ""}
            onClick={() => {
              if (id === "inspect") void openInspection();
              else setPanel(id);
            }}
          >
            {label}
          </button>
        ))}
      </nav>

      <main className="main">
        {error && <div className="status-line error">{error}</div>}
        {notice && !error && <div className="status-line">{notice}</div>}

        {panel === "book" && (
          <section className="panel">
            <h2>Bound book</h2>
            <p className="lede">
              Columns mirror 27 CFR 478.125(e). Open lines (no disposition) are highlighted.
              Corrections never erase the original entry.
            </p>
            <form className="toolbar no-print" onSubmit={runSearch}>
              <div className="field">
                <label htmlFor="serial">Serial</label>
                <input
                  id="serial"
                  value={query.serial ?? ""}
                  onChange={(e) => setQuery({ ...query, serial: e.target.value })}
                />
              </div>
              <div className="field">
                <label htmlFor="manufacturer">Mfr / importer</label>
                <input
                  id="manufacturer"
                  value={query.manufacturer ?? ""}
                  onChange={(e) => setQuery({ ...query, manufacturer: e.target.value })}
                />
              </div>
              <div className="field">
                <label htmlFor="name">Name</label>
                <input
                  id="name"
                  value={query.name ?? ""}
                  onChange={(e) => setQuery({ ...query, name: e.target.value })}
                />
              </div>
              <div className="field">
                <label htmlFor="address">Address</label>
                <input
                  id="address"
                  value={query.address ?? ""}
                  onChange={(e) => setQuery({ ...query, address: e.target.value })}
                />
              </div>
              <div className="field">
                <label htmlFor="form4473">4473 txn #</label>
                <input
                  id="form4473"
                  value={query.form4473 ?? ""}
                  onChange={(e) => setQuery({ ...query, form4473: e.target.value })}
                />
              </div>
              <div className="field">
                <label htmlFor="from">Acq. from</label>
                <input
                  id="from"
                  type="date"
                  value={query.acquisitionDateFrom ?? ""}
                  onChange={(e) =>
                    setQuery({ ...query, acquisitionDateFrom: e.target.value })
                  }
                />
              </div>
              <div className="field">
                <label htmlFor="to">Acq. to</label>
                <input
                  id="to"
                  type="date"
                  value={query.acquisitionDateTo ?? ""}
                  onChange={(e) =>
                    setQuery({ ...query, acquisitionDateTo: e.target.value })
                  }
                />
              </div>
              <div className="field">
                <label htmlFor="view">Correction view</label>
                <select
                  id="view"
                  value={query.correctionView ?? "corrected"}
                  onChange={(e) =>
                    setQuery({
                      ...query,
                      correctionView: e.target.value as SearchQuery["correctionView"],
                    })
                  }
                >
                  <option value="corrected">Corrected (effective)</option>
                  <option value="original">Originals only</option>
                  <option value="both">Both (lineage)</option>
                </select>
              </div>
              <div className="field">
                <label htmlFor="openOnly">Stock</label>
                <select
                  id="openOnly"
                  value={query.openOnly ? "1" : "0"}
                  onChange={(e) =>
                    setQuery({ ...query, openOnly: e.target.value === "1" })
                  }
                >
                  <option value="0">All lines</option>
                  <option value="1">Open inventory only</option>
                </select>
              </div>
              <button className="btn" type="submit" disabled={busy}>
                Search
              </button>
            </form>

            {entries.length === 0 ? (
              <div className="empty-book no-print">
                <h3>Book is empty</h3>
                <p>
                  Load a few fictional SAMPLE/DEMO lines to click through open inventory,
                  disposition, inspection, and export — or enter a real acquisition like the paper
                  book.
                </p>
                <div className="form-actions">
                  <button
                    className="btn"
                    type="button"
                    disabled={busy}
                    onClick={() => void loadSampleDemo()}
                  >
                    Load SAMPLE/DEMO book
                  </button>
                  <button className="btn secondary" type="button" onClick={() => setPanel("acquire")}>
                    Add first acquisition
                  </button>
                  <button
                    className="btn secondary"
                    type="button"
                    onClick={() => setPanel("settings")}
                  >
                    Set up backup folder
                  </button>
                </div>
              </div>
            ) : (
              <div className="book-scroll">
                <table className="book-table">
                  <thead>
                    <tr>
                      <th>Line</th>
                      <th>Manufacturer / Importer</th>
                      <th>Model</th>
                      <th>Serial No.</th>
                      <th>Type</th>
                      <th>Caliber</th>
                      <th>Acq. date</th>
                      <th>From whom received</th>
                      <th>Disp. date</th>
                      <th>Name / address / FFL / 4473</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map((e) => (
                      <tr
                        key={e.id}
                        className={[
                          e.status === "open" && e.isEffective ? "open" : "",
                          !e.isEffective ? "superseded" : "",
                          selectedId === e.id ? "selected" : "",
                          e.serialNumber.startsWith("SAMPLE-") ? "sample-row" : "",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                        onClick={() => setSelectedId(e.id)}
                      >
                        <td>{e.lineNumber}</td>
                        <td>
                          {e.manufacturer}
                          {e.importer ? ` / ${e.importer}` : ""}
                        </td>
                        <td>{e.model}</td>
                        <td className="serial">{e.serialNumber}</td>
                        <td>{e.firearmType}</td>
                        <td>{e.caliberOrGauge}</td>
                        <td>{e.acquisitionDate}</td>
                        <td>{formatFromWhom(e)}</td>
                        <td>{e.dispositionDate ?? ""}</td>
                        <td>{formatToWhom(e)}</td>
                        <td>
                          <span
                            className={`badge ${
                              !e.isEffective
                                ? "superseded"
                                : e.status === "open"
                                  ? ""
                                  : "disposed"
                            }`}
                          >
                            {!e.isEffective
                              ? "superseded"
                              : e.status === "open"
                                ? "open"
                                : "disposed"}
                          </span>
                          {e.correctionReason ? (
                            <div style={{ marginTop: 4, fontSize: "0.75rem" }}>
                              Corr: {e.correctionReason}
                            </div>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {selected && selected.status === "open" && selected.isEffective && (
              <div className="quick-actions no-print">
                Selected line {selected.lineNumber} (
                <span className="serial">{selected.serialNumber}</span>) is open.
                <button className="btn" type="button" onClick={() => setPanel("dispose")}>
                  Record disposition
                </button>
              </div>
            )}
          </section>
        )}

        {panel === "acquire" && (
          <section className="panel">
            <h2>Acquisition (receipt)</h2>
            <p className="lede">
              Enter description of firearm and from whom received. Due by close of next business
              day (or up to 7 days with a qualifying commercial record).
            </p>
            <form
              onSubmit={handleAcquire}
              onChange={() => {
                if (Object.keys(acqErrors).length) setAcqErrors({});
                if (acqWarnings.length) {
                  setAcqWarnings([]);
                  setAcqWarnAck(false);
                }
              }}
            >
              <div className="form-grid">
                <div className={fieldClass(acqErrors, "manufacturer")}>
                  <label>Manufacturer (or PMF)</label>
                  <input name="manufacturer" placeholder="or privately made firearm" />
                  <FieldError errors={acqErrors} name="manufacturer" />
                </div>
                <div className="field">
                  <label>Importer (if any)</label>
                  <input name="importer" />
                </div>
                <div className={fieldClass(acqErrors, "model")}>
                  <label>Model</label>
                  <input name="model" />
                  <FieldError errors={acqErrors} name="model" />
                </div>
                <div className={fieldClass(acqErrors, "serialNumber")}>
                  <label>Serial No.</label>
                  <input name="serialNumber" className="serial" />
                  <FieldError errors={acqErrors} name="serialNumber" />
                </div>
                <div className={fieldClass(acqErrors, "firearmType")}>
                  <label>Type</label>
                  <select name="firearmType" defaultValue="Pistol">
                    {FIREARM_TYPES.map((t) => (
                      <option key={t}>{t}</option>
                    ))}
                  </select>
                  <FieldError errors={acqErrors} name="firearmType" />
                </div>
                <div className={fieldClass(acqErrors, "caliberOrGauge")}>
                  <label>Caliber or gauge</label>
                  <input name="caliberOrGauge" />
                  <FieldError errors={acqErrors} name="caliberOrGauge" />
                </div>
                <div className={fieldClass(acqErrors, "acquisitionDate")}>
                  <label>Date of receipt</label>
                  <input name="acquisitionDate" type="date" defaultValue={todayISO()} />
                  <FieldError errors={acqErrors} name="acquisitionDate" />
                </div>
                <div className={fieldClass(acqErrors, "acquiredFromKind")}>
                  <label>From whom (kind)</label>
                  <select
                    name="acquiredFromKind"
                    value={acqFromKind}
                    onChange={(e) => {
                      setAcqFromKind(e.target.value);
                      setAcqErrors({});
                      setAcqWarnings([]);
                      setAcqWarnAck(false);
                    }}
                  >
                    <option value="nonlicensee">Nonlicensee (name + address)</option>
                    <option value="licensee">Licensee (name + FFL)</option>
                    <option value="opening_inventory">Opening inventory</option>
                    <option value="other">Other</option>
                  </select>
                  <FieldError errors={acqErrors} name="acquiredFromKind" />
                </div>
                <div className={fieldClass(acqErrors, "acquiredFromName", "wide")}>
                  <label>Name</label>
                  <input name="acquiredFromName" />
                  <FieldError errors={acqErrors} name="acquiredFromName" />
                </div>
                {(acqFromKind === "nonlicensee" || acqFromKind === "other") && (
                  <div className={fieldClass(acqErrors, "acquiredFromAddress", "wide")}>
                    <label>Address (required for nonlicensee)</label>
                    <input name="acquiredFromAddress" />
                    <FieldError errors={acqErrors} name="acquiredFromAddress" />
                  </div>
                )}
                {(acqFromKind === "licensee" || acqFromKind === "other") && (
                  <div className={fieldClass(acqErrors, "acquiredFromFfl")}>
                    <label>FFL number (required for licensee)</label>
                    <input name="acquiredFromFfl" />
                    <FieldError errors={acqErrors} name="acquiredFromFfl" />
                  </div>
                )}
                {acqFromKind === "opening_inventory" && (
                  <input type="hidden" name="acquiredFromAddress" value="" />
                )}
                {acqFromKind === "nonlicensee" && (
                  <input type="hidden" name="acquiredFromFfl" value="" />
                )}
                <div className="field wide">
                  <label>Notes (optional)</label>
                  <input name="notes" />
                </div>
              </div>
              {acqWarnings.length > 0 && (
                <div className="soft-warnings">
                  <strong>Soft warning — review before saving</strong>
                  <ul>
                    {acqWarnings.map((w) => (
                      <li key={w}>{w}</li>
                    ))}
                  </ul>
                  <label>
                    <input
                      type="checkbox"
                      checked={acqWarnAck}
                      onChange={(e) => setAcqWarnAck(e.target.checked)}
                    />
                    I reviewed the warning(s) — save anyway
                  </label>
                </div>
              )}
              <div className="form-actions">
                <button
                  className="btn"
                  type="submit"
                  disabled={busy || (acqWarnings.length > 0 && !acqWarnAck)}
                >
                  Commit acquisition line
                </button>
              </div>
            </form>
          </section>
        )}

        {panel === "dispose" && (
          <section className="panel">
            <h2>Disposition</h2>
            <p className="lede">
              Select an open line in the bound book, then complete disposition columns. Not later
              than 7 days after the transaction. Default for retail transfers: Form 4473
              transaction number when 4473s are filed numerically.
            </p>
            {!selected || selected.status !== "open" || !selected.isEffective ? (
              <div className="status-line">
                Select an <strong>open</strong> line on the Bound book tab first.
                <div className="form-actions">
                  <button className="btn secondary" type="button" onClick={() => setPanel("book")}>
                    Go to bound book
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="status-line">
                  Line {selected.lineNumber}: {selected.manufacturer} {selected.model} ·{" "}
                  <span className="serial">{selected.serialNumber}</span>
                </div>
                <form
                  onSubmit={handleDispose}
                  onChange={() => {
                    if (Object.keys(dispErrors).length) setDispErrors({});
                    if (dispWarnings.length) {
                      setDispWarnings([]);
                      setDispWarnAck(false);
                    }
                  }}
                >
                  <div className="form-grid">
                    <div className={fieldClass(dispErrors, "dispositionDate")}>
                      <label>Date of disposition</label>
                      <input
                        name="dispositionDate"
                        type="date"
                        defaultValue={todayISO()}
                      />
                      <FieldError errors={dispErrors} name="dispositionDate" />
                    </div>
                    <div className={fieldClass(dispErrors, "disposedToKind")}>
                      <label>To whom (kind)</label>
                      <select
                        name="disposedToKind"
                        value={dispToKind}
                        onChange={(e) => {
                          setDispToKind(e.target.value);
                          setDispErrors({});
                          setDispWarnings([]);
                          setDispWarnAck(false);
                        }}
                      >
                        <option value="form_4473">Form 4473 transaction #</option>
                        <option value="nonlicensee">Nonlicensee (name + address)</option>
                        <option value="licensee">Licensee (name + FFL)</option>
                        <option value="book_rollover_ref">Book rollover reference</option>
                        <option value="other">Other</option>
                      </select>
                      <FieldError errors={dispErrors} name="disposedToKind" />
                    </div>
                    {dispToKind === "form_4473" && (
                      <div className={fieldClass(dispErrors, "form4473TransactionNumber")}>
                        <label>4473 transaction No.</label>
                        <input name="form4473TransactionNumber" />
                        <FieldError errors={dispErrors} name="form4473TransactionNumber" />
                      </div>
                    )}
                    {(dispToKind === "nonlicensee" ||
                      dispToKind === "licensee" ||
                      dispToKind === "other") && (
                      <div className={fieldClass(dispErrors, "disposedToName")}>
                        <label>Name</label>
                        <input name="disposedToName" />
                        <FieldError errors={dispErrors} name="disposedToName" />
                      </div>
                    )}
                    {(dispToKind === "nonlicensee" || dispToKind === "other") && (
                      <div className={fieldClass(dispErrors, "disposedToAddress", "wide")}>
                        <label>Address</label>
                        <input name="disposedToAddress" />
                        <FieldError errors={dispErrors} name="disposedToAddress" />
                      </div>
                    )}
                    {(dispToKind === "licensee" || dispToKind === "other") && (
                      <div className={fieldClass(dispErrors, "disposedToFfl")}>
                        <label>FFL number</label>
                        <input name="disposedToFfl" />
                        <FieldError errors={dispErrors} name="disposedToFfl" />
                      </div>
                    )}
                    {dispToKind === "book_rollover_ref" && (
                      <div className={fieldClass(dispErrors, "dispositionReference", "wide")}>
                        <label>Rollover reference</label>
                        <input name="dispositionReference" />
                        <FieldError errors={dispErrors} name="dispositionReference" />
                      </div>
                    )}
                    <div className="field wide">
                      <label>Notes</label>
                      <input name="notes" />
                    </div>
                  </div>
                  {dispWarnings.length > 0 && (
                    <div className="soft-warnings">
                      <strong>Soft warning — review before saving</strong>
                      <ul>
                        {dispWarnings.map((w) => (
                          <li key={w}>{w}</li>
                        ))}
                      </ul>
                      <label>
                        <input
                          type="checkbox"
                          checked={dispWarnAck}
                          onChange={(e) => setDispWarnAck(e.target.checked)}
                        />
                        I reviewed the warning(s) — save anyway
                      </label>
                    </div>
                  )}
                  <div className="form-actions">
                    <button
                      className="btn"
                      type="submit"
                      disabled={busy || (dispWarnings.length > 0 && !dispWarnAck)}
                    >
                      Record disposition
                    </button>
                  </div>
                </form>
              </>
            )}
          </section>
        )}

        {panel === "correct" && (
          <section className="panel">
            <h2>Correct entry</h2>
            <p className="lede">
              ATF Ruling 2016-1 method (a): the original row stays immutable; a linked correction
              becomes the effective line. Provide a reason.
            </p>
            {!selected || !selected.isEffective ? (
              <div className="status-line">
                Select the effective line to correct from the Bound book tab.
              </div>
            ) : (
              <form
                onSubmit={handleCorrect}
                onChange={() => {
                  if (Object.keys(corrErrors).length) setCorrErrors({});
                }}
              >
                <div className="form-grid">
                  <div className={fieldClass(corrErrors, "reason", "wide")}>
                    <label>Reason for correction</label>
                    <input name="reason" placeholder="e.g. transposed serial digit" />
                    <FieldError errors={corrErrors} name="reason" />
                  </div>
                  <div className={fieldClass(corrErrors, "manufacturer")}>
                    <label>Manufacturer</label>
                    <input name="manufacturer" defaultValue={selected.manufacturer} />
                    <FieldError errors={corrErrors} name="manufacturer" />
                  </div>
                  <div className="field">
                    <label>Importer</label>
                    <input name="importer" defaultValue={selected.importer ?? ""} />
                  </div>
                  <div className={fieldClass(corrErrors, "model")}>
                    <label>Model</label>
                    <input name="model" defaultValue={selected.model} />
                    <FieldError errors={corrErrors} name="model" />
                  </div>
                  <div className={fieldClass(corrErrors, "serialNumber")}>
                    <label>Serial No.</label>
                    <input
                      name="serialNumber"
                      defaultValue={selected.serialNumber}
                      className="serial"
                    />
                    <FieldError errors={corrErrors} name="serialNumber" />
                  </div>
                  <div className={fieldClass(corrErrors, "firearmType")}>
                    <label>Type</label>
                    <input name="firearmType" defaultValue={selected.firearmType} />
                    <FieldError errors={corrErrors} name="firearmType" />
                  </div>
                  <div className={fieldClass(corrErrors, "caliberOrGauge")}>
                    <label>Caliber</label>
                    <input name="caliberOrGauge" defaultValue={selected.caliberOrGauge} />
                    <FieldError errors={corrErrors} name="caliberOrGauge" />
                  </div>
                  <div className={fieldClass(corrErrors, "acquisitionDate")}>
                    <label>Acquisition date</label>
                    <input
                      name="acquisitionDate"
                      type="date"
                      defaultValue={selected.acquisitionDate}
                    />
                    <FieldError errors={corrErrors} name="acquisitionDate" />
                  </div>
                  <div className={fieldClass(corrErrors, "acquiredFromKind")}>
                    <label>Acquired from kind</label>
                    <select
                      name="acquiredFromKind"
                      defaultValue={selected.acquiredFromKind}
                    >
                      <option value="nonlicensee">nonlicensee</option>
                      <option value="licensee">licensee</option>
                      <option value="opening_inventory">opening_inventory</option>
                      <option value="other">other</option>
                    </select>
                    <FieldError errors={corrErrors} name="acquiredFromKind" />
                  </div>
                  <div className={fieldClass(corrErrors, "acquiredFromName")}>
                    <label>Acquired from name</label>
                    <input
                      name="acquiredFromName"
                      defaultValue={selected.acquiredFromName}
                    />
                    <FieldError errors={corrErrors} name="acquiredFromName" />
                  </div>
                  <div className={fieldClass(corrErrors, "acquiredFromAddress", "wide")}>
                    <label>Acquired from address</label>
                    <input
                      name="acquiredFromAddress"
                      defaultValue={selected.acquiredFromAddress ?? ""}
                    />
                    <FieldError errors={corrErrors} name="acquiredFromAddress" />
                  </div>
                  <div className={fieldClass(corrErrors, "acquiredFromFfl")}>
                    <label>Acquired from FFL</label>
                    <input
                      name="acquiredFromFfl"
                      defaultValue={selected.acquiredFromFfl ?? ""}
                    />
                    <FieldError errors={corrErrors} name="acquiredFromFfl" />
                  </div>
                  <div className={fieldClass(corrErrors, "dispositionDate")}>
                    <label>Disposition date</label>
                    <input
                      name="dispositionDate"
                      type="date"
                      defaultValue={selected.dispositionDate ?? ""}
                    />
                    <FieldError errors={corrErrors} name="dispositionDate" />
                  </div>
                  <div className={fieldClass(corrErrors, "disposedToKind")}>
                    <label>Disposed to kind</label>
                    <select
                      name="disposedToKind"
                      defaultValue={selected.disposedToKind ?? ""}
                    >
                      <option value="">(open — no disposition)</option>
                      <option value="form_4473">form_4473</option>
                      <option value="nonlicensee">nonlicensee</option>
                      <option value="licensee">licensee</option>
                      <option value="book_rollover_ref">book_rollover_ref</option>
                      <option value="other">other</option>
                    </select>
                    <FieldError errors={corrErrors} name="disposedToKind" />
                  </div>
                  <div className={fieldClass(corrErrors, "disposedToName")}>
                    <label>Disposed to name</label>
                    <input
                      name="disposedToName"
                      defaultValue={selected.disposedToName ?? ""}
                    />
                    <FieldError errors={corrErrors} name="disposedToName" />
                  </div>
                  <div className={fieldClass(corrErrors, "disposedToAddress", "wide")}>
                    <label>Disposed to address</label>
                    <input
                      name="disposedToAddress"
                      defaultValue={selected.disposedToAddress ?? ""}
                    />
                    <FieldError errors={corrErrors} name="disposedToAddress" />
                  </div>
                  <div className={fieldClass(corrErrors, "disposedToFfl")}>
                    <label>Disposed to FFL</label>
                    <input name="disposedToFfl" defaultValue={selected.disposedToFfl ?? ""} />
                    <FieldError errors={corrErrors} name="disposedToFfl" />
                  </div>
                  <div className={fieldClass(corrErrors, "form4473TransactionNumber")}>
                    <label>4473 txn #</label>
                    <input
                      name="form4473TransactionNumber"
                      defaultValue={selected.form4473TransactionNumber ?? ""}
                    />
                    <FieldError errors={corrErrors} name="form4473TransactionNumber" />
                  </div>
                  <div className={fieldClass(corrErrors, "dispositionReference", "wide")}>
                    <label>Disposition reference</label>
                    <input
                      name="dispositionReference"
                      defaultValue={selected.dispositionReference ?? ""}
                    />
                    <FieldError errors={corrErrors} name="dispositionReference" />
                  </div>
                  <div className="field wide">
                    <label>Notes</label>
                    <input name="notes" defaultValue={selected.notes ?? ""} />
                  </div>
                </div>
                <div className="form-actions">
                  <button className="btn" type="submit" disabled={busy}>
                    Save correction (keep original)
                  </button>
                </div>
              </form>
            )}
          </section>
        )}

        {panel === "inspect" && (
          <InspectionView
            license={license}
            entries={entries}
            busy={busy}
            onPrint={() => window.print()}
            onExportPackage={() => void exportInspectionPackage()}
          />
        )}

        {panel === "export" && (
          <section className="panel">
            <h2>Print / export</h2>
            <p className="lede">
              Produce an unencrypted premises download sorted by acquisition date. Keep the last
              download until the next (Ruling 2016-1). Prefer at least semiannual for local
              systems; print on ATF request within 24 hours. For a full handoff folder, use the
              ATF inspection package (unencrypted PDF + CSV + ASCII).
            </p>
            <div className="form-actions">
              <button
                className="btn"
                type="button"
                onClick={() => void exportInspectionPackage()}
                disabled={busy}
              >
                Export for ATF inspection
              </button>
              <button className="btn secondary" type="button" onClick={exportPdf} disabled={busy}>
                Save PDF only
              </button>
              <button
                className="btn secondary"
                type="button"
                onClick={() => void openInspection()}
              >
                Open inspection mode
              </button>
              <button className="btn secondary" type="button" onClick={exportCsv} disabled={busy}>
                Export CSV
              </button>
              <button className="btn secondary" type="button" onClick={exportAscii} disabled={busy}>
                Export ASCII (.txt)
              </button>
            </div>
            {lastExportAt && (
              <p className="lede" style={{ marginTop: "1rem" }}>
                Last ATF-style export: {new Date(lastExportAt).toLocaleString()}
              </p>
            )}
          </section>
        )}

        {panel === "settings" && (
          <section className="panel">
            <h2>Backup &amp; license</h2>
            <p className="lede">
              Live bound book stays on this PC under Local AppData (not OneDrive). The encrypted
              backup (<code>.rfbk</code>) is the copy you put in a OneDrive or Google Drive sync
              folder. Choose the folder below, enter a passphrase (8+ characters), then run backup.
            </p>
            {dbPath && (
              <p className="lede">
                Live database (local): <code>{dbPath}</code>
              </p>
            )}

            <h3 className="subhead">SAMPLE/DEMO book</h3>
            <p className="lede">
              One-click fictional A&amp;D lines (serials prefixed <code>SAMPLE-</code>, fake FFLs).
              Includes open inventory, 4473 disposition, licensee transfer, and a correction. Will
              not load into a book that already has non-sample lines.
            </p>
            <div className="form-actions">
              <button
                className="btn secondary"
                type="button"
                disabled={busy}
                onClick={() => void loadSampleDemo()}
              >
                {sampleLoaded ? "Reload SAMPLE/DEMO book" : "Load SAMPLE/DEMO book"}
              </button>
              <button
                className="btn danger"
                type="button"
                disabled={busy || !sampleLoaded}
                onClick={() => void wipeSampleDemo()}
              >
                Wipe sample data
              </button>
            </div>
            <form onSubmit={saveBackupSettings}>
              <div className="form-grid">
                <div className="field wide">
                  <label>Backup folder</label>
                  <div className="path-row">
                    <input
                      value={backupFolder}
                      onChange={(e) => setBackupFolder(e.target.value)}
                      placeholder="Choose your OneDrive or Google Drive sync folder"
                      readOnly
                    />
                    <button className="btn secondary" type="button" onClick={pickBackupFolder}>
                      Choose folder…
                    </button>
                  </div>
                </div>
                <div className="field">
                  <label>New passphrase marker</label>
                  <input
                    type="password"
                    value={passphrase}
                    onChange={(e) => setPassphrase(e.target.value)}
                    placeholder="min 8 characters"
                    autoComplete="new-password"
                  />
                </div>
                <div className="field">
                  <label>Confirm passphrase</label>
                  <input
                    type="password"
                    value={passphraseConfirm}
                    onChange={(e) => setPassphraseConfirm(e.target.value)}
                    autoComplete="new-password"
                  />
                </div>
              </div>
              <div className="form-actions">
                <button className="btn secondary" type="submit">
                  Save backup settings
                </button>
              </div>
            </form>
            <form onSubmit={runBackup} style={{ marginTop: "1rem" }}>
              <div className="form-grid">
                <div className="field">
                  <label>Passphrase for this backup</label>
                  <input
                    type="password"
                    value={passphrase}
                    onChange={(e) => setPassphrase(e.target.value)}
                    required
                    autoComplete="current-password"
                  />
                </div>
              </div>
              <div className="form-actions">
                <button className="btn" type="submit" disabled={busy}>
                  Run encrypted backup now
                </button>
              </div>
            </form>

            <h3 className="subhead">Restore from encrypted backup</h3>
            <p className="lede">
              Opens a <code>.rfbk</code> file, decrypts with your passphrase, and replaces the live
              book. The current database is copied first as a safety file
              (<code>bound-book.pre-restore-*.sqlite</code>).
            </p>
            <form onSubmit={runRestore}>
              <div className="form-grid">
                <div className="field wide">
                  <label>Backup file</label>
                  <div className="path-row">
                    <input
                      value={restorePath}
                      onChange={(e) => setRestorePath(e.target.value)}
                      placeholder="Select a .rfbk file"
                      readOnly
                    />
                    <button className="btn secondary" type="button" onClick={pickRestoreFile}>
                      Open .rfbk…
                    </button>
                  </div>
                </div>
                <div className="field">
                  <label>Passphrase</label>
                  <input
                    type="password"
                    value={restorePassphrase}
                    onChange={(e) => setRestorePassphrase(e.target.value)}
                    required
                    autoComplete="current-password"
                  />
                </div>
                <div className="field wide">
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={confirmRestore}
                      onChange={(e) => setConfirmRestore(e.target.checked)}
                    />{" "}
                    I understand this replaces the live bound book (a safety copy is kept)
                  </label>
                </div>
              </div>
              <div className="form-actions">
                <button className="btn danger" type="submit" disabled={busy}>
                  Restore from backup
                </button>
              </div>
            </form>

            <p className="lede" style={{ marginTop: "1rem" }}>
              Database path: <span className="serial">{dbPath}</span>
            </p>
            <div className="form-actions">
              <button className="btn secondary" type="button" onClick={() => setPanel("setup")}>
                Edit license profile
              </button>
            </div>
          </section>
        )}
      </main>

      {showBackupModal && (
        <div className="modal-backdrop no-print" role="dialog" aria-modal="true">
          <div className="modal">
            <h2>Encrypted backup</h2>
            <p>
              Writes an AES-encrypted <code>.rfbk</code> into your sync folder. Enter the
              passphrase you use for backups (not stored in plaintext).
            </p>
            {!backupFolder.trim() && (
              <div className="status-line error">
                No backup folder yet.{" "}
                <button
                  type="button"
                  className="linkish"
                  onClick={() => {
                    setShowBackupModal(false);
                    setPanel("settings");
                  }}
                >
                  Choose folder first
                </button>
              </div>
            )}
            <form onSubmit={runModalBackup}>
              <div className="field">
                <label>Folder</label>
                <input value={backupFolder || "(not set)"} readOnly />
              </div>
              <div className="field">
                <label>Passphrase</label>
                <input
                  type="password"
                  value={modalPassphrase}
                  onChange={(e) => setModalPassphrase(e.target.value)}
                  required
                  minLength={8}
                  autoFocus
                  autoComplete="current-password"
                />
              </div>
              <div className="form-actions">
                <button className="btn" type="submit" disabled={busy || !backupFolder.trim()}>
                  Backup now
                </button>
                <button
                  className="btn secondary"
                  type="button"
                  onClick={() => setShowBackupModal(false)}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <p className="disclaimer">
        Disclaimer: ATF does not certify or endorse commercial software. This application is a
        recordkeeping aid for Rettmark Firearms and is not legal advice. The licensee remains
        responsible for compliance with the Gun Control Act, 27 CFR Part 478, and ATF Ruling
        2016-1. Have counsel review before relying on this as the electronic A&amp;D record of
        record.
      </p>
    </div>
  );
}
