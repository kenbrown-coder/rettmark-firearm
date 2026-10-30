import { useMemo, useState } from "react";
import type { BoundBookEntry, License } from "./types";
import { AD_COL, AD_GROUP, paperColumns } from "./boundBookFormat";

const PAGE_SIZE = 20;

type Props = {
  license: License;
  entries: BoundBookEntry[];
  onPrint: () => void;
  onExportPackage: () => void;
  busy?: boolean;
};

export function InspectionView({
  license,
  entries,
  onPrint,
  onExportPackage,
  busy,
}: Props) {
  const [page, setPage] = useState(0);
  const effective = useMemo(
    () => entries.filter((e) => e.isEffective).sort((a, b) => {
      const d = a.acquisitionDate.localeCompare(b.acquisitionDate);
      return d !== 0 ? d : a.lineNumber - b.lineNumber;
    }),
    [entries],
  );
  const pageCount = Math.max(1, Math.ceil(effective.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const slice = effective.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  const tableHead = (
    <thead>
      <tr className="group-head-row">
        <th rowSpan={2} className="th-line">
          Line
        </th>
        <th colSpan={5} className="th-description">
          {AD_GROUP.description}
        </th>
        <th colSpan={3} className="th-acquisitions">
          {AD_GROUP.acquisitions}
        </th>
        <th colSpan={3} className="th-dispositions">
          {AD_GROUP.dispositions}
        </th>
      </tr>
      <tr className="subhead-row">
        <th className="th-description-sub">{AD_COL.manufacturer}</th>
        <th className="th-description-sub">{AD_COL.model}</th>
        <th className="th-description-sub">{AD_COL.serialNo}</th>
        <th className="th-description-sub">{AD_COL.type}</th>
        <th className="th-description-sub">{AD_COL.caliberOrGauge}</th>
        <th className="th-acq-sub">{AD_COL.receiptDate}</th>
        <th className="th-acq-sub">{AD_COL.acquisitionName}</th>
        <th className="th-acq-sub">{AD_COL.acquisitionAddressOrLicense}</th>
        <th className="th-disp-sub">{AD_COL.dispositionDate}</th>
        <th className="th-disp-sub">{AD_COL.dispositionName}</th>
        <th className="th-disp-sub">{AD_COL.dispositionAddressOrLocator}</th>
      </tr>
    </thead>
  );

  const renderRow = (e: BoundBookEntry, keyPrefix = "") => {
    const c = paperColumns(e);
    return (
      <tr key={`${keyPrefix}${e.id}`} className={e.status === "open" ? "open" : ""}>
        <td>{c.line}</td>
        <td>{c.manufacturerImporter}</td>
        <td>{c.model}</td>
        <td className="serial">{c.serial}</td>
        <td>{c.type}</td>
        <td>{c.caliber}</td>
        <td>{c.acquisitionDate}</td>
        <td>{c.acquisitionName}</td>
        <td>{c.acquisitionAddressOrLicense}</td>
        <td>{c.dispositionDate}</td>
        <td>{c.dispositionName}</td>
        <td>{c.dispositionAddressOrLocator}</td>
      </tr>
    );
  };

  return (
    <section className="panel inspection-panel">
      <div className="inspection-head">
        <div>
          <h2>Inspection mode</h2>
          <p className="lede">
            Read-only view of the effective bound book in § 478.125(e) Table 2 column order —
            <strong> Acquisitions</strong> on the left, dark-header <strong>Dispositions</strong> on
            the right, with Name and Address in separate columns. Use for ATF inspection
            presentation or printing. For the digital file inspectors commonly receive, click{" "}
            <strong>Export for ATF inspection</strong> (unencrypted PDF + CSV + ASCII). Edits are
            disabled here — return to Bound book / Acquisition / Disposition to change records.
          </p>
        </div>
        <div className="form-actions no-print">
          <button className="btn" type="button" onClick={onExportPackage} disabled={busy}>
            Export for ATF inspection
          </button>
          <button className="btn secondary" type="button" onClick={onPrint}>
            Print inspection view
          </button>
        </div>
      </div>

      <div className="inspection-letterhead">
        <div className="inspection-title">Firearms Acquisition and Disposition Record</div>
        <div>
          <strong>{license.businessName}</strong>
          {license.fflNumber ? ` · FFL ${license.fflNumber}` : ""}
        </div>
        <div className="muted">
          Dealer A&amp;D — 27 CFR 478.125(e) Table 2 · Electronic alternate method ATF Ruling
          2016-1 · Effective (corrected) lines · Sorted by acquisition date
        </div>
        <div className="muted">
          Operator: {license.operatorName}
          {license.forms4473FiledNumerically
            ? " · Forms 4473 filed numerically"
            : ""}
          {" · "}
          {effective.length} line(s)
        </div>
      </div>

      <div className="pager no-print">
        <button
          type="button"
          className="btn secondary"
          disabled={safePage <= 0}
          onClick={() => setPage((p) => Math.max(0, p - 1))}
        >
          Previous page
        </button>
        <span>
          Page {safePage + 1} of {pageCount}
        </span>
        <button
          type="button"
          className="btn secondary"
          disabled={safePage >= pageCount - 1}
          onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
        >
          Next page
        </button>
      </div>

      <div className="book-scroll inspection-scroll">
        <table className="book-table inspection-table">
          {tableHead}
          <tbody>
            {slice.map((e) => renderRow(e))}
            {effective.length === 0 && (
              <tr>
                <td colSpan={12} style={{ padding: "1.25rem", color: "var(--ink-muted)" }}>
                  No effective bound-book lines to present.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Print-all table: shown only when printing */}
      <div className="print-only-all">
        <table className="book-table inspection-table">
          {tableHead}
          <tbody>{effective.map((e) => renderRow(e, "print-"))}</tbody>
        </table>
      </div>
    </section>
  );
}
