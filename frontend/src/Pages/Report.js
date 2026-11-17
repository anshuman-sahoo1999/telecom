import { API_BASE_URL } from "../config";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import * as XLSX from "xlsx-js-style";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import "../style/report.css";

/* ==========================================================================
   Report page  (Admin / MIS / TeamLead  ->  /…-dashboard/report)
   Data  : GET    /api/work/report/monthwise
   Edit  : PUT    /api/work/update/:id
   Delete: DELETE /api/work/delete/:id
   Dates : Receive / ECD / Submission date ke side me time (Excel jaisa "9.00 PM")
   ========================================================================== */

const PAGE_SIZE = 25;

// ---------- small helpers ----------
const pad2 = (n) => String(n).padStart(2, "0");
const text = (v) => (v === null || v === undefined ? "" : String(v).trim());
const norm = (v) => text(v).toLowerCase();

// 24 ghante "17:53" -> Excel jaisa "5.53 PM"
const to12h = (t) => {
  const m = text(t).match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return "";
  const h = Number(m[1]);
  return `${h % 12 || 12}.${m[2]} ${h >= 12 ? "PM" : "AM"}`;
};

// Stored value "MM-DD-YYYY" ya "MM-DD-YYYY HH:mm"  ->  { date, time }
// 00:00 tabhi time hai jab "HH:mm" saath likha ho (import me Time column se aaya).
const splitStored = (value) => {
  const s = text(value);
  const m = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})(?:[ T]+(\d{1,2}):(\d{2}))?/);
  if (!m) return { date: s, time: "" };
  return {
    date: `${pad2(m[1])}-${pad2(m[2])}-${m[3]}`,
    time: m[4] !== undefined ? `${pad2(m[4])}:${m[5]}` : "",
  };
};

// "MM-DD-YYYY" -> "YYYY-MM-DD"  (<input type="date"> ke liye)
const toInputDate = (mmddyyyy) => {
  const m = text(mmddyyyy).match(/^(\d{2})-(\d{2})-(\d{4})$/);
  return m ? `${m[3]}-${m[1]}-${m[2]}` : "";
};

// months: JSON string ya array -> ["Dec,2025", ...]
const parseMonths = (value) => {
  if (Array.isArray(value)) return value.filter(Boolean).map(String);
  const s = text(value);
  if (!s) return [];
  try {
    const parsed = JSON.parse(s);
    if (Array.isArray(parsed)) return parsed.filter(Boolean).map(String);
    return parsed ? [String(parsed)] : [];
  } catch (e) {
    return [s];
  }
};

const monthLabel = (row) => {
  const list = parseMonths(row.months);
  return list.length ? list[list.length - 1] : text(row.month);
};

const parsePercent = (val) => {
  const n = parseFloat(text(val).replace("%", ""));
  if (isNaN(n)) return null;
  return n > 0 && n <= 1 ? Math.round(n * 100) : Math.round(n);
};

// Table / export dono ke liye "date, time" ka text
const dateTimeText = (row, key) => {
  const display = row[`${key}_display`];
  if (display) return display;
  const { date, time } = splitStored(row[key]);
  return time ? `${date}, ${to12h(time)}` : date;
};

const COLUMNS = [
  { key: "month", label: "Month", get: monthLabel },
  { key: "domain", label: "Domain", get: (r) => text(r.domain) },
  { key: "job_id", label: "Job ID", get: (r) => text(r.job_id) },
  { key: "job_type", label: "Job Type", get: (r) => text(r.job_type) },
  { key: "region", label: "Region", get: (r) => text(r.region) },
  { key: "state", label: "State", get: (r) => text(r.state) },
  { key: "county", label: "County", get: (r) => text(r.county) },
  { key: "production_engineers", label: "Production Engineer", get: (r) => text(r.production_engineers) },
  { key: "qc_engineers", label: "QC Engineer", get: (r) => text(r.qc_engineers) },
  { key: "receive_date", label: "Receive Date", get: (r) => dateTimeText(r, "receive_date"), dateTime: true },
  { key: "ecd_date", label: "ECD Date", get: (r) => dateTimeText(r, "ecd_date"), dateTime: true },
  { key: "submission_date", label: "Submission Date", get: (r) => dateTimeText(r, "submission_date"), dateTime: true },
  { key: "otp", label: "OTP", get: (r) => text(r.otp) },
  { key: "internal_qc", label: "Internal QC", get: (r) => text(r.internal_qc) },
  { key: "amdocs_qc", label: "Amdocs QC", get: (r) => text(r.amdocs_qc) },
];

const DATE_FIELDS = ["receive_date", "ecd_date", "submission_date"];

// ---------- date + time cell ----------
const DateTimeCell = ({ value }) => {
  const { date, time } = splitStored(value);
  if (!date) return <span>-</span>;
  return (
    <>
      {date}
      {time ? <span className="time-chip">{to12h(time)}</span> : null}
    </>
  );
};

export default function Report() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [fDomain, setFDomain] = useState("");
  const [fMonth, setFMonth] = useState("");
  const [fState, setFState] = useState("");
  const [fType, setFType] = useState("");
  const [search, setSearch] = useState("");

  const [page, setPage] = useState(1);
  const [pageInput, setPageInput] = useState("1");

  const [exportOpen, setExportOpen] = useState(false);

  const [editId, setEditId] = useState(null);
  const [draft, setDraft] = useState({});
  const [busy, setBusy] = useState(false);

  // ---------- load ----------
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await axios.get(`${API_BASE_URL}/api/work/report/monthwise`);
      setRows(Array.isArray(res.data) ? res.data : []);
    } catch (e) {
      console.error("Report load failed:", e);
      setError("Report load nahi ho paya. Thodi der baad dobara try karo.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // ---------- filter options ----------
  const options = useMemo(() => {
    const uniq = (list) => [...new Set(list.filter(Boolean))].sort((a, b) => a.localeCompare(b));
    return {
      domains: uniq(rows.map((r) => text(r.domain))),
      months: uniq(rows.map(monthLabel)),
      states: uniq(rows.map((r) => text(r.state))),
      types: uniq(rows.map((r) => text(r.job_type))),
    };
  }, [rows]);

  const filtered = useMemo(() => {
    const q = norm(search);
    return rows.filter((r) => {
      if (fDomain && norm(r.domain) !== norm(fDomain)) return false;
      if (fMonth && norm(monthLabel(r)) !== norm(fMonth)) return false;
      if (fState && norm(r.state) !== norm(fState)) return false;
      if (fType && norm(r.job_type) !== norm(fType)) return false;
      if (q && !norm(r.job_id).includes(q)) return false;
      return true;
    });
  }, [rows, fDomain, fMonth, fState, fType, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));

  // filter badalne par page 1 par
  useEffect(() => {
    setPage(1);
  }, [fDomain, fMonth, fState, fType, search]);

  // page range ke bahar na jaye
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  useEffect(() => {
    setPageInput(String(page));
  }, [page]);

  const pageRows = useMemo(
    () => filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [filtered, page]
  );

  const lastUpdate = useMemo(() => {
    const dates = rows
      .map((r) => r.updated_at || r.created_at)
      .filter(Boolean)
      .map((d) => new Date(String(d).replace(/^"|"$/g, "")))
      .filter((d) => !isNaN(d.getTime()));
    if (!dates.length) return null;
    return new Date(Math.max(...dates.map((d) => d.getTime())));
  }, [rows]);

  // ---------- edit / delete ----------
  const startEdit = (row) => {
    const next = {
      otp: text(row.otp),
      internal_qc: text(row.internal_qc),
      amdocs_qc: text(row.amdocs_qc),
    };
    DATE_FIELDS.forEach((f) => {
      const { date, time } = splitStored(row[f]);
      next[f] = toInputDate(date);
      next[`${f.replace("_date", "")}_time`] = time;
    });
    setDraft(next);
    setEditId(row.id);
  };

  const cancelEdit = () => {
    setEditId(null);
    setDraft({});
  };

  const saveEdit = async (row) => {
    if (busy) return;
    setBusy(true);
    try {
      const payload = {
        otp: draft.otp,
        internal_qc: draft.internal_qc,
        amdocs_qc: draft.amdocs_qc,
        receive_date: draft.receive_date || "",
        receive_time: draft.receive_time || "",
        ecd_date: draft.ecd_date || "",
        ecd_time: draft.ecd_time || "",
        submission_date: draft.submission_date || "",
        submission_time: draft.submission_time || "",
      };
      await axios.put(`${API_BASE_URL}/api/work/update/${row.id}`, payload);
      cancelEdit();
      await load();
    } catch (e) {
      console.error("Report update failed:", e);
      window.alert("Update nahi ho paya. Dobara try karo.");
    } finally {
      setBusy(false);
    }
  };

  const deleteRow = async (row) => {
    if (busy) return;
    if (!window.confirm(`Job ${text(row.job_id) || row.id} delete karna hai?`)) return;
    setBusy(true);
    try {
      await axios.delete(`${API_BASE_URL}/api/work/delete/${row.id}`);
      await load();
    } catch (e) {
      console.error("Report delete failed:", e);
      window.alert("Delete nahi ho paya. Dobara try karo.");
    } finally {
      setBusy(false);
    }
  };

  // ---------- export ----------
  const exportExcel = () => {
    setExportOpen(false);
    const data = filtered.map((r) => {
      const o = {};
      COLUMNS.forEach((c) => {
        o[c.label] = c.get(r);
      });
      return o;
    });
    const ws = XLSX.utils.json_to_sheet(data);
    ws["!cols"] = COLUMNS.map((c) => ({ wch: c.dateTime ? 22 : 16 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Report");
    XLSX.writeFile(wb, `Report_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const exportPdf = () => {
    setExportOpen(false);
    const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a3" });
    doc.setFontSize(16);
    doc.text("Report", 40, 36);
    autoTable(doc, {
      startY: 52,
      head: [COLUMNS.map((c) => c.label)],
      body: filtered.map((r) => COLUMNS.map((c) => c.get(r))),
      styles: { fontSize: 7, cellPadding: 3 },
      headStyles: { fillColor: [79, 70, 229] },
    });
    doc.save(`Report_${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  // ---------- render helpers ----------
  const setDraftField = (key, value) => setDraft((d) => ({ ...d, [key]: value }));

  const renderQc = (value) => {
    const v = text(value);
    if (!v) return "-";
    const pct = parsePercent(v);
    if (pct === null) return v;
    const up = pct >= 90;
    return (
      <span className={`qc-trend ${up ? "up" : "down"}`}>
        <span className="qc-arrow">{up ? "▲" : "▼"}</span>
        <span className="qc-value">{v}</span>
      </span>
    );
  };

  const smallInput = { padding: "6px 8px", fontSize: 12, width: 90 };

  const renderDateEdit = (field) => {
    const timeKey = `${field.replace("_date", "")}_time`;
    return (
      <div className="datetime-edit">
        <input
          type="date"
          value={draft[field] || ""}
          onChange={(e) => setDraftField(field, e.target.value)}
        />
        <input
          type="time"
          value={draft[timeKey] || ""}
          onChange={(e) => setDraftField(timeKey, e.target.value)}
        />
      </div>
    );
  };

  const goToPage = (value) => {
    const n = parseInt(value, 10);
    if (isNaN(n)) {
      setPageInput(String(page));
      return;
    }
    setPage(Math.min(Math.max(1, n), totalPages));
    setPageInput(String(Math.min(Math.max(1, n), totalPages)));
  };

  const colCount = COLUMNS.length + 2;

  return (
    <div className="report-wrapper" style={{ padding: 24 }}>
      <h2 className="title">Report</h2>

      <div className="export-box">
        <button type="button" className="export-btn" onClick={() => setExportOpen((o) => !o)}>
          Export ▾
        </button>
        {exportOpen && (
          <div className="export-dropdown">
            <button type="button" onClick={exportExcel}>Export to Excel</button>
            <button type="button" onClick={exportPdf}>Export to PDF</button>
          </div>
        )}
      </div>

      <div className="filters">
        <div className="left-filters">
          <div className="filter-group">
            <label>Domain</label>
            <select value={fDomain} onChange={(e) => setFDomain(e.target.value)}>
              <option value="">All</option>
              {options.domains.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>
          <div className="filter-group">
            <label>Month</label>
            <select value={fMonth} onChange={(e) => setFMonth(e.target.value)}>
              <option value="">All</option>
              {options.months.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>
          <div className="filter-group">
            <label>State</label>
            <select value={fState} onChange={(e) => setFState(e.target.value)}>
              <option value="">All</option>
              {options.states.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
          <div className="filter-group">
            <label>Job Type</label>
            <select value={fType} onChange={(e) => setFType(e.target.value)}>
              <option value="">All</option>
              {options.types.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="right-filters">
          <div className="filter-group">
            <label>Search Job ID</label>
            <input
              type="text"
              placeholder="Job ID"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
      </div>

      {error && (
        <div className="table-update-info">
          <p>{error}</p>
        </div>
      )}

      <div className="table-responsive-container">
        <table className="table">
          <thead>
            <tr>
              <th>#</th>
              {COLUMNS.map((c) => (
                <th key={c.key}>{c.label}</th>
              ))}
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td className="no-data" colSpan={colCount}>Loading...</td>
              </tr>
            ) : pageRows.length === 0 ? (
              <tr>
                <td className="no-data" colSpan={colCount}>No data found</td>
              </tr>
            ) : (
              pageRows.map((r, i) => {
                const editing = editId === r.id;
                const otpMissing = text(r.otp) === "";
                return (
                  <tr key={r.id} className={otpMissing ? "row-missing-otp" : ""}>
                    <td>{(page - 1) * PAGE_SIZE + i + 1}</td>

                    {COLUMNS.map((c) => {
                      if (c.dateTime) {
                        return (
                          <td key={c.key}>
                            {editing ? renderDateEdit(c.key) : <DateTimeCell value={r[c.key]} />}
                          </td>
                        );
                      }
                      if (c.key === "otp") {
                        return (
                          <td key={c.key} className={!editing && otpMissing ? "cell-missing" : ""}>
                            {editing ? (
                              <input
                                type="text"
                                style={smallInput}
                                value={draft.otp || ""}
                                onChange={(e) => setDraftField("otp", e.target.value)}
                              />
                            ) : otpMissing ? (
                              "-"
                            ) : (
                              text(r.otp)
                            )}
                          </td>
                        );
                      }
                      if (c.key === "internal_qc" || c.key === "amdocs_qc") {
                        return (
                          <td key={c.key}>
                            {editing ? (
                              <input
                                type="text"
                                style={smallInput}
                                value={draft[c.key] || ""}
                                onChange={(e) => setDraftField(c.key, e.target.value)}
                              />
                            ) : c.key === "amdocs_qc" ? (
                              renderQc(r.amdocs_qc)
                            ) : (
                              text(r.internal_qc) || "-"
                            )}
                          </td>
                        );
                      }
                      return <td key={c.key}>{c.get(r) || "-"}</td>;
                    })}

                    <td>
                      <div className="action-buttons">
                        {editing ? (
                          <>
                            <button type="button" className="save-btn" disabled={busy} onClick={() => saveEdit(r)}>
                              Save
                            </button>
                            <button type="button" className="cancel-btn" disabled={busy} onClick={cancelEdit}>
                              Cancel
                            </button>
                          </>
                        ) : (
                          <>
                            <button type="button" className="edit-btn" disabled={busy} onClick={() => startEdit(r)}>
                              Edit
                            </button>
                            <button type="button" className="delete-btn" disabled={busy} onClick={() => deleteRow(r)}>
                              Delete
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="pagination">
        <span>
          {filtered.length} records &nbsp;|&nbsp; Page {page} of {totalPages}
        </span>
        <button type="button" disabled={page <= 1} onClick={() => setPage(1)}>
          « First
        </button>
        <button type="button" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
          ‹ Prev
        </button>
        <input
          className="page-input"
          type="text"
          value={pageInput}
          onChange={(e) => setPageInput(e.target.value)}
          onBlur={(e) => goToPage(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") goToPage(e.target.value);
          }}
        />
        <button type="button" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>
          Next ›
        </button>
        <button type="button" disabled={page >= totalPages} onClick={() => setPage(totalPages)}>
          Last »
        </button>
      </div>

      {lastUpdate && (
        <div className="last-update">
          Last updated: {lastUpdate.toLocaleDateString()} {lastUpdate.toLocaleTimeString()}
        </div>
      )}
    </div>
  );
}
