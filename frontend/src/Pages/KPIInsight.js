import { API_BASE_URL } from "../config";
import React, { useState, useEffect, useMemo, useCallback, useRef, useLayoutEffect } from "react";
import axios from "axios";
import { FaPlus, FaTimes, FaInfoCircle } from "react-icons/fa";
import "../style/KPIInsight.css";

/* ======================================
   CONSTANTS + HELPERS
====================================== */
const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const BANDS = {
  green: { key: "green", label: "Green", color: "#166534", bg: "#dcfce7", border: "#86efac", dot: "#16a34a" },
  orange: { key: "orange", label: "Orange", color: "#9a3412", bg: "#ffedd5", border: "#fdba74", dot: "#d97706" },
  red: { key: "red", label: "Red", color: "#991b1b", bg: "#fee2e2", border: "#fca5a5", dot: "#dc2626" },
  none: { key: "none", label: "", color: "#64748b", bg: "#f1f5f9", border: "#e2e8f0", dot: "#94a3b8" },
};

const getBand = (val) => {
  if (val === null || val === undefined || val === "" || Number.isNaN(Number(val))) return BANDS.none;
  const v = Number(val);
  if (v >= 90) return BANDS.green;
  if (v >= 80) return BANDS.orange;
  return BANDS.red;
};

// 83.86 -> "83.86%", 70 -> "70%"
const fmtPct = (v) =>
  v === null || v === undefined || Number.isNaN(Number(v)) ? "" : `${Number(Number(v).toFixed(2))}%`;

const avg = (list) => {
  const nums = list.filter((n) => n !== null && n !== undefined && !Number.isNaN(Number(n))).map(Number);
  return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null;
};

const sameScope = (a, b) => String(a || "").trim().toLowerCase() === String(b || "").trim().toLowerCase();

/* ======================================
   CREATE POPUP
====================================== */
function CreateModal({ currentYear, defaultMonth, domainList, rows, onClose, onSaved }) {
  const [month, setMonth] = useState(defaultMonth);
  const [domain, setDomain] = useState("");
  const [scope, setScope] = useState("");
  const [qRaw, setQRaw] = useState("");
  const [showInfo, setShowInfo] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const qRef = useRef(null);
  const caretRef = useRef(null);
  const infoRef = useRef(null);

  const scopesForDomain = useMemo(() => {
    const d = domainList.find((x) => x.domain === domain);
    return d ? d.scopes : [];
  }, [domainList, domain]);

  const qualityNumber = qRaw === "" || qRaw === "." ? null : Number(qRaw);
  const band = getBand(qualityNumber);

  // Same month + domain + scope pehle se bhara hai?
  const existing = useMemo(() => {
    if (!domain) return null;
    return (
      rows.find(
        (r) => r.year === currentYear && r.month === Number(month) && r.domain === domain && sameScope(r.scope, scope)
      ) || null
    );
  }, [rows, currentYear, month, domain, scope]);

  // Esc se band
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape" && !saving) onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, saving]);

  // i icon popup ke bahar click par band
  useEffect(() => {
    if (!showInfo) return;
    const onDown = (e) => {
      if (infoRef.current && !infoRef.current.contains(e.target)) setShowInfo(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [showInfo]);

  // "%" hamesha digits ke baad rahe, cursor % ke andar na jaye
  useLayoutEffect(() => {
    const el = qRef.current;
    if (!el || document.activeElement !== el) return;
    const pos = caretRef.current === null ? qRaw.length : Math.min(caretRef.current, qRaw.length);
    el.setSelectionRange(pos, pos);
  }, [qRaw]);

  const handleDomainChange = (e) => {
    setDomain(e.target.value);
    setScope(""); // domain badle to scope reset
    setError("");
  };

  const handleQualityChange = (e) => {
    let raw = e.target.value.replace(/%/g, "").replace(/[^0-9.]/g, "");
    const firstDot = raw.indexOf(".");
    if (firstDot !== -1) raw = raw.slice(0, firstDot + 1) + raw.slice(firstDot + 1).replace(/\./g, "");
    let [intPart, decPart] = raw.split(".");
    if (intPart.length > 3) return;
    if (decPart !== undefined && decPart.length > 2) return;
    if (intPart.length > 1) intPart = intPart.replace(/^0+(?=\d)/, "");
    raw = decPart !== undefined ? `${intPart}.${decPart}` : intPart;
    if (raw !== "" && raw !== "." && Number(raw) > 100) return;
    caretRef.current = Math.min(e.target.selectionStart ?? raw.length, raw.length);
    setQRaw(raw);
    setError("");
  };

  const clampCaret = () => {
    const el = qRef.current;
    if (!el) return;
    const max = qRaw.length;
    if ((el.selectionStart ?? 0) > max || (el.selectionEnd ?? 0) > max) {
      el.setSelectionRange(Math.min(el.selectionStart ?? 0, max), Math.min(el.selectionEnd ?? 0, max));
    }
  };

  const handleSubmit = async () => {
    if (saving) return;
    if (!domain) return setError("Please choose a domain");
    if (scopesForDomain.length > 0 && !scope) return setError("Please choose a scope");
    if (qualityNumber === null || Number.isNaN(qualityNumber)) return setError("Please enter Quality %");
    if (qualityNumber < 0 || qualityNumber > 100) return setError("Quality % must be between 0 and 100");

    try {
      setSaving(true);
      setError("");
      const res = await axios.post(`${API_BASE_URL}/api/kpi-insight`, {
        year: currentYear,
        month: Number(month),
        domain,
        scope,
        quality: qualityNumber,
      });
      onSaved(res.data || {}, Number(month));
    } catch (err) {
      setError(err?.response?.data?.message || err.message || "Failed to save");
      setSaving(false);
    }
  };

  return (
    <div className="kpiq-overlay" onClick={() => { if (!saving) onClose(); }}>
      <div className="kpiq-modal" onClick={(e) => e.stopPropagation()}>
        <div className="kpiq-modal-head">
          <h3>Create Quality Rating</h3>
          <button type="button" className="kpiq-x" aria-label="Close" onClick={onClose} disabled={saving}>
            <FaTimes />
          </button>
        </div>

        <div className="kpiq-modal-body">
          {/* Choose Month */}
          <div className="kpiq-field">
            <label className="kpiq-label">Choose Month</label>
            <select className="kpiq-select" value={month} onChange={(e) => { setMonth(Number(e.target.value)); setError(""); }}>
              {MONTH_NAMES.map((m, i) => (
                <option key={m} value={i + 1}>{m} - {currentYear}</option>
              ))}
            </select>
          </div>

          {/* Choose Domain */}
          <div className="kpiq-field">
            <label className="kpiq-label">Choose Domain</label>
            <select className="kpiq-select" value={domain} onChange={handleDomainChange}>
              <option value="">Select domain</option>
              {domainList.map((d) => (
                <option key={d.domain} value={d.domain}>{d.domain}</option>
              ))}
            </select>
          </div>

          {/* Choose Scope (domain wise) */}
          <div className="kpiq-field">
            <label className="kpiq-label">Choose Scope</label>
            <select
              className="kpiq-select"
              value={scope}
              onChange={(e) => { setScope(e.target.value); setError(""); }}
              disabled={!domain || scopesForDomain.length === 0}
            >
              {!domain && <option value="">Select domain first</option>}
              {domain && scopesForDomain.length === 0 && <option value="">No scope for this domain</option>}
              {domain && scopesForDomain.length > 0 && <option value="">Select scope</option>}
              {scopesForDomain.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          {/* Enter Quality % + i icon */}
          <div className="kpiq-field">
            <div style={{ display: "flex", alignItems: "center" }}>
              <label className="kpiq-label">Enter Quality %</label>
              <span className="kpiq-info-wrap" ref={infoRef}>
                <button
                  type="button"
                  className="kpiq-info-btn"
                  aria-label="Quality % colour guide"
                  title="Quality % colour guide"
                  onClick={() => setShowInfo((v) => !v)}
                >
                  <FaInfoCircle />
                </button>
                {showInfo && (
                  <div className="kpiq-info-pop">
                    <div className="kpiq-info-row" style={{ color: BANDS.green.color }}>
                      <span className="dot" style={{ width: 12, height: 12, borderRadius: 3, background: BANDS.green.dot, display: "inline-block" }} />
                      90% - 100% = Green
                    </div>
                    <div className="kpiq-info-row" style={{ color: BANDS.orange.color }}>
                      <span className="dot" style={{ width: 12, height: 12, borderRadius: 3, background: BANDS.orange.dot, display: "inline-block" }} />
                      80% - 90% = Orange
                    </div>
                    <div className="kpiq-info-row" style={{ color: BANDS.red.color }}>
                      <span className="dot" style={{ width: 12, height: 12, borderRadius: 3, background: BANDS.red.dot, display: "inline-block" }} />
                      Below 80% = Red
                    </div>
                  </div>
                )}
              </span>
            </div>
            <div className="kpiq-quality-row">
              <input
                ref={qRef}
                className="kpiq-input"
                type="text"
                inputMode="decimal"
                autoComplete="off"
                placeholder="e.g. 85%"
                value={qRaw === "" ? "" : `${qRaw}%`}
                onChange={handleQualityChange}
                onClick={clampCaret}
                onKeyUp={clampCaret}
                onKeyDown={(e) => { if (e.key === "Enter") handleSubmit(); }}
                style={{
                  fontWeight: 700,
                  color: band.key === "none" ? "#0f172a" : band.color,
                  borderColor: band.key === "none" ? undefined : band.dot,
                  background: band.key === "none" ? "#fff" : band.bg,
                }}
              />
              {band.key !== "none" && (
                <span
                  className="kpiq-pill"
                  style={{ color: band.color, background: band.bg, borderColor: band.border }}
                >
                  {band.label}
                </span>
              )}
            </div>
          </div>

          {existing && (
            <div className="kpiq-hint">
              Already entered: {fmtPct(existing.quality)}. Submit will update it.
            </div>
          )}
          {error && <div className="kpiq-err">{error}</div>}
        </div>

        <div className="kpiq-modal-foot">
          <button type="button" className="kpiq-btn ghost" onClick={onClose} disabled={saving}>Cancel</button>
          <button type="button" className="kpiq-btn" onClick={handleSubmit} disabled={saving}>
            {saving ? "Saving..." : "Submit"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ======================================
   MAIN PAGE
====================================== */
export default function KPIInsight({ domains = [] }) {
  // Year hamesha current year (2026 -> 2027 apne aap)
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;

  const [rows, setRows] = useState([]);
  const [options, setOptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [filter, setFilter] = useState({ year: null, month: 0 }); // year null = current year, month 0 = all months
  const [showCreate, setShowCreate] = useState(false);
  const [toast, setToast] = useState(null);

  const effectiveYear = filter.year === null ? currentYear : filter.year;

  const loadAll = useCallback(async () => {
    try {
      setLoadError("");
      const [rowsRes, optRes] = await Promise.all([
        axios.get(`${API_BASE_URL}/api/kpi-insight`),
        axios.get(`${API_BASE_URL}/api/kpi-insight/options`),
      ]);
      setRows(Array.isArray(rowsRes.data) ? rowsRes.data : []);
      setOptions(Array.isArray(optRes.data?.domains) ? optRes.data.domains : []);
    } catch (err) {
      setLoadError(err?.response?.data?.message || err.message || "Failed to load data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  // Toast 3.5 sec me hat jaye
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  // Domain dropdown: API (master + Excel + saved) + dashboard ke domains
  const domainList = useMemo(() => {
    const map = new Map();
    options.forEach((o) => map.set(o.domain, { domain: o.domain, scopes: o.scopes || [] }));
    (domains || []).forEach((d) => {
      const key = String(d || "").trim().toUpperCase();
      if (key && !map.has(key)) map.set(key, { domain: key, scopes: [] });
    });
    return [...map.values()].sort((a, b) => a.domain.localeCompare(b.domain));
  }, [options, domains]);

  // Filter dropdown ke years: current year + data wale baaki years
  const yearList = useMemo(() => {
    const set = new Set([currentYear]);
    rows.forEach((r) => set.add(r.year));
    return [...set].sort((a, b) => b - a);
  }, [rows, currentYear]);

  // Table data (Excel jaisa: rows = month, columns = domain + scope)
  const view = useMemo(() => {
    const yearRows = rows.filter(
      (r) => r.year === effectiveYear && (filter.month === 0 || r.month === filter.month)
    );

    const colMap = new Map();
    yearRows.forEach((r) => {
      const key = `${r.domain}||${String(r.scope || "").trim().toLowerCase()}`;
      if (!colMap.has(key)) colMap.set(key, { key, domain: r.domain, scope: r.scope || "" });
    });
    const cols = [...colMap.values()].sort(
      (a, b) => a.domain.localeCompare(b.domain) || a.scope.localeCompare(b.scope)
    );

    const months = [...new Set(yearRows.map((r) => r.month))].sort((a, b) => a - b);

    const cell = {};
    yearRows.forEach((r) => {
      const key = `${r.domain}||${String(r.scope || "").trim().toLowerCase()}`;
      cell[`${r.month}|${key}`] = r.quality;
    });

    const rowTotals = {};
    months.forEach((m) => {
      rowTotals[m] = avg(cols.map((c) => cell[`${m}|${c.key}`]));
    });
    const colTotals = {};
    cols.forEach((c) => {
      colTotals[c.key] = avg(months.map((m) => cell[`${m}|${c.key}`]));
    });
    const grand = avg(yearRows.map((r) => r.quality));

    return { cols, months, cell, rowTotals, colTotals, grand };
  }, [rows, effectiveYear, filter.month]);

  const handleFilterChange = (e) => {
    const [y, m] = e.target.value.split("|").map(Number);
    setFilter({ year: y === currentYear ? null : y, month: m });
  };

  const handleSaved = (data, savedMonth) => {
    setShowCreate(false);
    setToast({ type: "success", text: data.message || "Saved successfully" });
    // Naya data table me dikhe: filter me current year + saved month (ya all months) rakho
    setFilter((prev) =>
      prev.year === null && (prev.month === 0 || prev.month === savedMonth) ? prev : { year: null, month: 0 }
    );
    loadAll();
  };

  const pill = (value, extra = {}) => {
    const b = getBand(value);
    return (
      <span className="kpiq-pill" style={{ color: b.color, background: b.bg, borderColor: b.border, ...extra }}>
        {fmtPct(value)}
      </span>
    );
  };

  const defaultModalMonth = filter.month !== 0 && effectiveYear === currentYear ? filter.month : currentMonth;

  return (
    <div className="kpiq-page">
      <h2 className="kpiq-title">💡 KPI Insight</h2>

      {/* Left: Choose Month, Year | Right: Create */}
      <div className="kpiq-top">
        <div className="kpiq-field">
          <label className="kpiq-label">Choose Month, Year</label>
          <select className="kpiq-select" value={`${effectiveYear}|${filter.month}`} onChange={handleFilterChange}>
            {yearList.map((y) => (
              <optgroup key={y} label={String(y)}>
                <option value={`${y}|0`}>All Months - {y}</option>
                {MONTH_NAMES.map((m, i) => (
                  <option key={m} value={`${y}|${i + 1}`}>{m} - {y}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>

        <button type="button" className="kpiq-btn" onClick={() => setShowCreate(true)}>
          <FaPlus /> Create
        </button>
      </div>

      {/* Quality Rating table (Excel jaisa) */}
      <div className="kpiq-card">
        <div className="kpiq-card-head">Quality Rating</div>

        {loading ? (
          <div className="kpiq-empty">Loading...</div>
        ) : loadError ? (
          <div className="kpiq-empty">
            <div style={{ color: "#dc2626", fontWeight: 700, marginBottom: 10 }}>{loadError}</div>
            <button type="button" className="kpiq-btn" onClick={() => { setLoading(true); loadAll(); }}>Retry</button>
          </div>
        ) : view.cols.length === 0 ? (
          <div className="kpiq-empty">No Quality Rating data for this selection. Click Create to add.</div>
        ) : (
          <div className="kpiq-scroll">
            <table className="kpiq-table">
              <thead>
                <tr>
                  <th className="stickyCol" rowSpan={2} style={{ minWidth: 150 }}>JOB Completed Month</th>
                  <th colSpan={view.cols.length + 1}>Domain</th>
                </tr>
                <tr className="second">
                  {view.cols.map((c) => (
                    <th key={c.key}>
                      {c.domain}
                      {c.scope && <span className="kpiq-colScope">{c.scope}</span>}
                    </th>
                  ))}
                  <th>Total Result</th>
                </tr>
              </thead>
              <tbody>
                {view.months.map((m) => (
                  <tr key={m}>
                    <td className="stickyCol">{MONTH_NAMES[m - 1]}</td>
                    {view.cols.map((c) => {
                      const v = view.cell[`${m}|${c.key}`];
                      return <td key={c.key}>{v === undefined ? "" : pill(v)}</td>;
                    })}
                    <td>{view.rowTotals[m] === null ? "" : pill(view.rowTotals[m])}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td className="stickyCol">Total Result</td>
                  {view.cols.map((c) => (
                    <td key={c.key}>{view.colTotals[c.key] === null ? "" : pill(view.colTotals[c.key])}</td>
                  ))}
                  <td>{view.grand === null ? "" : pill(view.grand)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      <div className="kpiq-legend">
        <span><span className="dot" style={{ background: BANDS.green.dot }} />90% - 100% Green</span>
        <span><span className="dot" style={{ background: BANDS.orange.dot }} />80% - 90% Orange</span>
        <span><span className="dot" style={{ background: BANDS.red.dot }} />Below 80% Red</span>
        <span style={{ fontWeight: 500 }}>Total Result = average of the entered values.</span>
      </div>

      {showCreate && (
        <CreateModal
          currentYear={currentYear}
          defaultMonth={defaultModalMonth}
          domainList={domainList}
          rows={rows}
          onClose={() => setShowCreate(false)}
          onSaved={handleSaved}
        />
      )}

      {toast && (
        <div className="kpiq-toast" style={{ background: toast.type === "error" ? "#dc2626" : "#16a34a" }}>
          <span>{toast.text}</span>
          <button type="button" className="kpiq-x" aria-label="Close" onClick={() => setToast(null)}>
            <FaTimes />
          </button>
        </div>
      )}
    </div>
  );
}
