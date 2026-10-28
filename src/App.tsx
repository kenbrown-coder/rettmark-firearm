import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { save } from "@tauri-apps/plugin-dialog";
import { api, formatFromWhom, formatToWhom } from "./api";
import { buildBoundBookPdf } from "./printPdf";
import type {
  BoundBookEntry,
  License,
  Panel,
  SearchQuery,
} from "./types";
import "./App.css";

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

  const selected = useMemo(
    () => entries.find((e) => e.id === selectedId) ?? null,
    [entries, selectedId],
  );

  const refresh = useCallback(async (q?: SearchQuery) => {
    const [lic, list, backup] = await Promise.all([
      api.getLicense(),
      api.searchEntries(q ?? query),
      api.getBackupSettings().catch(() => null),
    ]);
    setLicense(lic);
    setEntries(list);
    setOpenCount(list.filter((e) => e.status === "open" && e.isEffective).length);
    if (backup) {
      setBackupFolder(backup.backupFolder ?? "");
      setLastBackupAt(backup.lastBackupAt ?? null);
      setLastExportAt(backup.lastAtfExportAt ?? null);
    }
    if (!lic) setPanel("setup");
  }, [query]);

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
      setNotice("License profile saved. Bound book is ready.");
      await refresh();
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleAcquire(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setError(null);
    try {
      setBusy(true);
      const entry = await api.addAcquisition({
        manufacturer: String(fd.get("manufacturer") || ""),
        importer: String(fd.get("importer") || "") || null,
        model: String(fd.get("model") || ""),
        serialNumber: String(fd.get("serialNumber") || ""),
        firearmType: String(fd.get("firearmType") || ""),
        caliberOrGauge: String(fd.get("caliberOrGauge") || ""),
        acquisitionDate: String(fd.get("acquisitionDate") || ""),
        acquiredFromKind: String(fd.get("acquiredFromKind") || ""),
        acquiredFromName: String(fd.get("acquiredFromName") || ""),
        acquiredFromAddress: String(fd.get("acquiredFromAddress") || "") || null,
        acquiredFromFfl: String(fd.get("acquiredFromFfl") || "") || null,
        notes: String(fd.get("notes") || "") || null,
      });
      setSelectedId(entry.id);
      setNotice(`Acquisition line ${entry.lineNumber} recorded.`);
      e.currentTarget.reset();
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
    setError(null);
    try {
      setBusy(true);
      await api.recordDisposition({
        entryId: selected.id,
        dispositionDate: String(fd.get("dispositionDate") || ""),
        disposedToKind: String(fd.get("disposedToKind") || ""),
        disposedToName: String(fd.get("disposedToName") || "") || null,
        disposedToAddress: String(fd.get("disposedToAddress") || "") || null,
        disposedToFfl: String(fd.get("disposedToFfl") || "") || null,
        form4473TransactionNumber:
          String(fd.get("form4473TransactionNumber") || "") || null,
        dispositionReference: String(fd.get("dispositionReference") || "") || null,
        notes: String(fd.get("notes") || "") || null,
      });
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
    setError(null);
    try {
      setBusy(true);
      const entry = await api.correctEntry({
        entryId: selected.id,
        reason: String(fd.get("reason") || ""),
        manufacturer: String(fd.get("manufacturer") || ""),
        importer: String(fd.get("importer") || "") || null,
        model: String(fd.get("model") || ""),
        serialNumber: String(fd.get("serialNumber") || ""),
        firearmType: String(fd.get("firearmType") || ""),
        caliberOrGauge: String(fd.get("caliberOrGauge") || ""),
        acquisitionDate: String(fd.get("acquisitionDate") || ""),
        acquiredFromKind: String(fd.get("acquiredFromKind") || ""),
        acquiredFromName: String(fd.get("acquiredFromName") || ""),
        acquiredFromAddress: String(fd.get("acquiredFromAddress") || "") || null,
        acquiredFromFfl: String(fd.get("acquiredFromFfl") || "") || null,
        dispositionDate: String(fd.get("dispositionDate") || "") || null,
        disposedToKind: String(fd.get("disposedToKind") || "") || null,
        disposedToName: String(fd.get("disposedToName") || "") || null,
        disposedToAddress: String(fd.get("disposedToAddress") || "") || null,
        disposedToFfl: String(fd.get("disposedToFfl") || "") || null,
        form4473TransactionNumber:
          String(fd.get("form4473TransactionNumber") || "") || null,
        dispositionReference: String(fd.get("dispositionReference") || "") || null,
        notes: String(fd.get("notes") || "") || null,
      });
      setSelectedId(entry.id);
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

  async function runBackup(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      if (passphrase.trim().length < 8) {
        setError("Enter the backup passphrase (min 8 characters) to encrypt.");
        return;
      }
      setBusy(true);
      const result = await api.runEncryptedBackup(
        passphrase,
        backupFolder.trim() || null,
      );
      setLastBackupAt(result.createdAt);
      setNotice(
        `Encrypted backup written (${result.bytes} bytes): ${result.path}`,
      );
      setPassphrase("");
      setPassphraseConfirm("");
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
            Set up the single-license dealer Acquisition &amp; Disposition book
            (§ 478.125(e)). Data stays on this computer.
          </p>
          {error && <div className="status-line error">{error}</div>}
          <form onSubmit={handleSetup} className="form-grid" style={{ marginTop: "1.25rem" }}>
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
              <input id="fflNumber" name="fflNumber" required placeholder="1-XX-XXX-XX-XX-XXXXX" />
            </div>
            <div className="field">
              <label htmlFor="operatorName">Operator</label>
              <input id="operatorName" name="operatorName" required defaultValue="Ken Brown" />
            </div>
            <div className="field wide">
              <label htmlFor="premisesNotes">Premises notes</label>
              <input id="premisesNotes" name="premisesNotes" placeholder="Licensed premises" />
            </div>
            <div className="field wide">
              <label htmlFor="forms4473">
                <input id="forms4473" name="forms4473" type="checkbox" /> Forms 4473 filed
                numerically (allows 4473 txn # in lieu of address)
              </label>
            </div>
            <div className="form-actions">
              <button className="btn" type="submit" disabled={busy}>
                Open bound book
              </button>
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
          {lastBackupAt && (
            <span>
              Last backup: <strong>{new Date(lastBackupAt).toLocaleString()}</strong>
            </span>
          )}
        </div>
      </header>

      <nav className="nav no-print">
        {(
          [
            ["book", "Bound book"],
            ["acquire", "Acquisition"],
            ["dispose", "Disposition"],
            ["correct", "Correct"],
            ["export", "Print / export"],
            ["settings", "Backup & license"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={panel === id ? "active" : ""}
            onClick={() => setPanel(id)}
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
                  {entries.length === 0 && (
                    <tr>
                      <td colSpan={11} style={{ padding: "1.5rem", color: "var(--ink-muted)" }}>
                        No entries yet. Record an acquisition to begin the book.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {panel === "acquire" && (
          <section className="panel">
            <h2>Acquisition (receipt)</h2>
            <p className="lede">
              Enter description of firearm and from whom received. Due by close of next business
              day (or up to 7 days with a qualifying commercial record).
            </p>
            <form onSubmit={handleAcquire}>
              <div className="form-grid">
                <div className="field">
                  <label>Manufacturer (or PMF)</label>
                  <input name="manufacturer" required placeholder="or privately made firearm" />
                </div>
                <div className="field">
                  <label>Importer (if any)</label>
                  <input name="importer" />
                </div>
                <div className="field">
                  <label>Model</label>
                  <input name="model" required />
                </div>
                <div className="field">
                  <label>Serial No.</label>
                  <input name="serialNumber" required className="serial" />
                </div>
                <div className="field">
                  <label>Type</label>
                  <select name="firearmType" required defaultValue="Pistol">
                    {FIREARM_TYPES.map((t) => (
                      <option key={t}>{t}</option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label>Caliber or gauge</label>
                  <input name="caliberOrGauge" required />
                </div>
                <div className="field">
                  <label>Date of receipt</label>
                  <input name="acquisitionDate" type="date" required defaultValue={todayISO()} />
                </div>
                <div className="field">
                  <label>From whom (kind)</label>
                  <select name="acquiredFromKind" required defaultValue="licensee">
                    <option value="nonlicensee">Nonlicensee (name + address)</option>
                    <option value="licensee">Licensee (name + FFL)</option>
                    <option value="opening_inventory">Opening inventory</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div className="field wide">
                  <label>Name</label>
                  <input name="acquiredFromName" required />
                </div>
                <div className="field wide">
                  <label>Address (nonlicensee)</label>
                  <input name="acquiredFromAddress" />
                </div>
                <div className="field">
                  <label>FFL number (licensee)</label>
                  <input name="acquiredFromFfl" />
                </div>
                <div className="field wide">
                  <label>Notes (optional)</label>
                  <input name="notes" />
                </div>
              </div>
              <div className="form-actions">
                <button className="btn" type="submit" disabled={busy}>
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
              than 7 days after the transaction.
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
                <form onSubmit={handleDispose}>
                  <div className="form-grid">
                    <div className="field">
                      <label>Date of disposition</label>
                      <input
                        name="dispositionDate"
                        type="date"
                        required
                        defaultValue={todayISO()}
                      />
                    </div>
                    <div className="field">
                      <label>To whom (kind)</label>
                      <select name="disposedToKind" required defaultValue="form_4473">
                        <option value="form_4473">Form 4473 transaction #</option>
                        <option value="nonlicensee">Nonlicensee (name + address)</option>
                        <option value="licensee">Licensee (name + FFL)</option>
                        <option value="book_rollover_ref">Book rollover reference</option>
                        <option value="other">Other</option>
                      </select>
                    </div>
                    <div className="field">
                      <label>4473 transaction No.</label>
                      <input name="form4473TransactionNumber" />
                    </div>
                    <div className="field">
                      <label>Name</label>
                      <input name="disposedToName" />
                    </div>
                    <div className="field wide">
                      <label>Address</label>
                      <input name="disposedToAddress" />
                    </div>
                    <div className="field">
                      <label>FFL number</label>
                      <input name="disposedToFfl" />
                    </div>
                    <div className="field wide">
                      <label>Rollover / other reference</label>
                      <input name="dispositionReference" />
                    </div>
                    <div className="field wide">
                      <label>Notes</label>
                      <input name="notes" />
                    </div>
                  </div>
                  <div className="form-actions">
                    <button className="btn" type="submit" disabled={busy}>
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
              <form onSubmit={handleCorrect}>
                <div className="form-grid">
                  <div className="field wide">
                    <label>Reason for correction</label>
                    <input name="reason" required placeholder="e.g. transposed serial digit" />
                  </div>
                  <div className="field">
                    <label>Manufacturer</label>
                    <input name="manufacturer" required defaultValue={selected.manufacturer} />
                  </div>
                  <div className="field">
                    <label>Importer</label>
                    <input name="importer" defaultValue={selected.importer ?? ""} />
                  </div>
                  <div className="field">
                    <label>Model</label>
                    <input name="model" required defaultValue={selected.model} />
                  </div>
                  <div className="field">
                    <label>Serial No.</label>
                    <input
                      name="serialNumber"
                      required
                      defaultValue={selected.serialNumber}
                      className="serial"
                    />
                  </div>
                  <div className="field">
                    <label>Type</label>
                    <input name="firearmType" required defaultValue={selected.firearmType} />
                  </div>
                  <div className="field">
                    <label>Caliber</label>
                    <input
                      name="caliberOrGauge"
                      required
                      defaultValue={selected.caliberOrGauge}
                    />
                  </div>
                  <div className="field">
                    <label>Acquisition date</label>
                    <input
                      name="acquisitionDate"
                      type="date"
                      required
                      defaultValue={selected.acquisitionDate}
                    />
                  </div>
                  <div className="field">
                    <label>Acquired from kind</label>
                    <input
                      name="acquiredFromKind"
                      required
                      defaultValue={selected.acquiredFromKind}
                    />
                  </div>
                  <div className="field">
                    <label>Acquired from name</label>
                    <input
                      name="acquiredFromName"
                      required
                      defaultValue={selected.acquiredFromName}
                    />
                  </div>
                  <div className="field wide">
                    <label>Acquired from address</label>
                    <input
                      name="acquiredFromAddress"
                      defaultValue={selected.acquiredFromAddress ?? ""}
                    />
                  </div>
                  <div className="field">
                    <label>Acquired from FFL</label>
                    <input
                      name="acquiredFromFfl"
                      defaultValue={selected.acquiredFromFfl ?? ""}
                    />
                  </div>
                  <div className="field">
                    <label>Disposition date</label>
                    <input
                      name="dispositionDate"
                      type="date"
                      defaultValue={selected.dispositionDate ?? ""}
                    />
                  </div>
                  <div className="field">
                    <label>Disposed to kind</label>
                    <input
                      name="disposedToKind"
                      defaultValue={selected.disposedToKind ?? ""}
                    />
                  </div>
                  <div className="field">
                    <label>Disposed to name</label>
                    <input
                      name="disposedToName"
                      defaultValue={selected.disposedToName ?? ""}
                    />
                  </div>
                  <div className="field wide">
                    <label>Disposed to address</label>
                    <input
                      name="disposedToAddress"
                      defaultValue={selected.disposedToAddress ?? ""}
                    />
                  </div>
                  <div className="field">
                    <label>Disposed to FFL</label>
                    <input name="disposedToFfl" defaultValue={selected.disposedToFfl ?? ""} />
                  </div>
                  <div className="field">
                    <label>4473 txn #</label>
                    <input
                      name="form4473TransactionNumber"
                      defaultValue={selected.form4473TransactionNumber ?? ""}
                    />
                  </div>
                  <div className="field wide">
                    <label>Disposition reference</label>
                    <input
                      name="dispositionReference"
                      defaultValue={selected.dispositionReference ?? ""}
                    />
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

        {panel === "export" && (
          <section className="panel">
            <h2>Print / export</h2>
            <p className="lede">
              Produce an unencrypted premises download sorted by acquisition date. Keep the last
              download until the next (Ruling 2016-1). Prefer at least semiannual for local
              systems; print on ATF request within 24 hours.
            </p>
            <div className="form-actions">
              <button className="btn" type="button" onClick={exportPdf} disabled={busy}>
                Save PDF bound book
              </button>
              <button className="btn secondary" type="button" onClick={() => window.print()}>
                Print this view
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
              Live copy: local SQLite on this PC. Second copy: AES-encrypted backup file written to
              a folder you choose (OneDrive or Google Drive sync folder). Encrypt in-app before the
              file lands in the sync folder.
            </p>
            <form onSubmit={saveBackupSettings}>
              <div className="form-grid">
                <div className="field wide">
                  <label>Backup folder path</label>
                  <input
                    value={backupFolder}
                    onChange={(e) => setBackupFolder(e.target.value)}
                    placeholder="/path/to/OneDrive/Rettmark-Backups"
                  />
                </div>
                <div className="field">
                  <label>New passphrase</label>
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
