import { API_BASE_URL } from "../config";
import React, { useState, useEffect, useMemo, useCallback, useRef, useLayoutEffect } from "react";
import axios from "axios";
import { FaPlus, FaTimes, FaInfoCircle, FaEdit, FaTrashAlt, FaFileExcel, FaChevronDown, FaCheck } from "react-icons/fa";
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
  v === null || v === undefined || v === "" || Number.isNaN(Number(v)) ? "" : `${Number(Number(v).toFixed(2))}%`;

const sameScope = (a, b) => String(a || "").trim().toLowerCase() === String(b || "").trim().toLowerCase();
const mk = (y, m) => `${y}-${m}`; // month key e.g. "2026-3"
const colKeyOf = (r) => `${String(r.domain || "").trim().toUpperCase()}||${String(r.scope || "").trim().toLowerCase()}`;
const byDomainScope = (a, b) =>
  String(a.domain || "").localeCompare(String(b.domain || "")) || String(a.scope || "").localeCompare(String(b.scope || ""));

// Cleans quality input. Returns null if invalid (change is ignored).
const sanitizeQuality = (value) => {
  let raw = String(value).replace(/%/g, "").replace(/[^0-9.]/g, "");
  const firstDot = raw.indexOf(".");
  if (firstDot !== -1) raw = raw.slice(0, firstDot + 1) + raw.slice(firstDot + 1).replace(/\./g, "");
  let [intPart, decPart] = raw.split(".");
  if (intPart.length > 3) return null;
  if (decPart !== undefined && decPart.length > 2) return null;
  if (intPart.length > 1) intPart = intPart.replace(/^0+(?=\d)/, "");
  raw = decPart !== undefined ? `${intPart}.${decPart}` : intPart;
  if (raw !== "" && raw !== "." && Number(raw) > 100) return null;
  return raw;
};

// "." -> "", "85." -> "85" (used on blur)
const normalizeQuality = (raw) => {
  if (raw === "." ) return "";
  if (raw.endsWith(".")) return raw.slice(0, -1);
  return raw;
};

/* ======================================
   OVERLAY (closes only if mousedown AND click both happen on the backdrop,
   so selecting text inside an input and releasing outside doesn't close it)
====================================== */
function Overlay({ className = "kpiq-overlay", disabled, onClose, children }) {
  const downOnBackdrop = useRef(false);
  return (
    <div
      className={className}
      onMouseDown={(e) => {
        downOnBackdrop.current = e.target === e.currentTarget;
      }}
      onClick={(e) => {
        if (downOnBackdrop.current && e.target === e.currentTarget && !disabled) onClose();
        downOnBackdrop.current = false;
      }}
    >
      {children}
    </div>
  );
}

/* ======================================
   MONTH / YEAR MULTI SELECT DROPDOWN
====================================== */
function MonthPicker({ years, selected, onChange, disabled }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);

  const toggleMonth = (y, m) => {
    const next = new Set(selected);
    const k = mk(y, m);
    if (next.has(k)) next.delete(k);
    else next.add(k);
    onChange(next);
  };

  const toggleYear = (y) => {
    const keys = MONTH_NAMES.map((_, i) => mk(y, i + 1));
    const all = keys.every((k) => selected.has(k));
    const next = new Set(selected);
    keys.forEach((k) => (all ? next.delete(k) : next.add(k)));
    onChange(next);
  };

  const selectAll = () => {
    const next = new Set();
    years.forEach((y) => MONTH_NAMES.forEach((_, i) => next.add(mk(y, i + 1))));
    onChange(next);
  };

  const summary = useMemo(() => {
    const list = [...selected].map((k) => k.split("-").map(Number));
    if (!list.length) return "Select month(s)";
    const ys = [...new Set(list.map((x) => x[0]))];
    if (ys.length === 1) {
      const ms = list.map((x) => x[1]).sort((a, b) => a - b);
      if (ms.length === 12) return `All Months - ${ys[0]}`;
      if (ms.length <= 3) return `${ms.map((m) => MONTH_NAMES[m - 1]).join(", ")} - ${ys[0]}`;
      return `${ms.length} months - ${ys[0]}`;
    }
    return `${list.length} months selected`;
  }, [selected]);

  return (
    <div className="kpiq-picker" ref={ref}>
      <button
        type="button"
        className="kpiq-select kpiq-picker-btn"
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
        title={disabled ? "Finish editing first" : undefined}
      >
        <span>{summary}</span>
        <FaChevronDown className={`kpiq-chev ${open ? "open" : ""}`} />
      </button>

      {open && (
        <div className="kpiq-picker-pop">
          <div className="kpiq-picker-actions">
            <button type="button" onClick={selectAll}>Select all</button>
            <button type="button" onClick={() => onChange(new Set())}>Clear</button>
          </div>

          <div className="kpiq-picker-list">
            {years.map((y) => {
              const keys = MONTH_NAMES.map((_, i) => mk(y, i + 1));
              const count = keys.filter((k) => selected.has(k)).length;
              return (
                <div key={y} className="kpiq-picker-year">
                  <label className="kpiq-check kpiq-check-year">
                    <input
                      type="checkbox"
                      checked={count === 12}
                      ref={(el) => { if (el) el.indeterminate = count > 0 && count < 12; }}
                      onChange={() => toggleYear(y)}
                    />
                    <span>All Months - {y}</span>
                  </label>
                  <div className="kpiq-picker-months">
                    {MONTH_NAMES.map((name, i) => (
                      <label key={name} className="kpiq-check">
                        <input
                          type="checkbox"
                          checked={selected.has(mk(y, i + 1))}
                          onChange={() => toggleMonth(y, i + 1)}
                        />
                        <span>{name}</span>
                      </label>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/* ======================================
   CREATE POPUP
====================================== */
function CreateModal({ years, defaultYear, defaultMonth, domainList, rows, onClose, onSaved }) {
  const [year, setYear] = useState(defaultYear);
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

  const existing = useMemo(() => {
    if (!domain) return null;
    return (
      rows.find(
        (r) =>
          r.year === Number(year) &&
          r.month === Number(month) &&
          String(r.domain || "").trim().toUpperCase() === String(domain).trim().toUpperCase() &&
          sameScope(r.scope, scope)
      ) || null
    );
  }, [rows, year, month, domain, scope]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape" && !saving) onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, saving]);

  useEffect(() => {
    if (!showInfo) return;
    const onDown = (e) => {
      if (infoRef.current && !infoRef.current.contains(e.target)) setShowInfo(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [showInfo]);

  useLayoutEffect(() => {
    const el = qRef.current;
    if (!el || document.activeElement !== el) return;
    const pos = caretRef.current === null ? qRaw.length : Math.min(caretRef.current, qRaw.length);
    el.setSelectionRange(pos, pos);
  }, [qRaw]);

  const handleDomainChange = (e) => {
    setDomain(e.target.value);
    setScope("");
    setError("");
  };

  const handleQualityChange = (e) => {
    const input = e.target.value;
    let next;

    // User pressed Backspace while caret was after the "%": delete the last digit instead
    const deletedPercent =
      qRaw !== "" &&
      e.nativeEvent?.inputType === "deleteContentBackward" &&
      !input.includes("%") &&
      input.length === qRaw.length;

    if (deletedPercent) {
      next = qRaw.slice(0, -1);
      caretRef.current = next.length;
    } else {
      next = sanitizeQuality(input);
      if (next === null) return;
      caretRef.current = Math.min(e.target.selectionStart ?? next.length, next.length);
    }
    setQRaw(next);
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
        year: Number(year),
        month: Number(month),
        domain,
        scope,
        quality: qualityNumber,
      });
      onSaved(res.data || {}, Number(year), Number(month));
    } catch (err) {
      setError(err?.response?.data?.message || err.message || "Failed to save");
      setSaving(false);
    }
  };

  return (
    <Overlay disabled={saving} onClose={onClose}>
      <div className="kpiq-modal" onClick={(e) => e.stopPropagation()}>
        <div className="kpiq-modal-head">
          <h3>Create Quality Rating</h3>
          <button type="button" className="kpiq-x" aria-label="Close" onClick={onClose} disabled={saving}>
            <FaTimes />
          </button>
        </div>

        <div className="kpiq-modal-body">
          <div className="kpiq-row2">
            <div className="kpiq-field">
              <label className="kpiq-label">Choose Month</label>
              <select className="kpiq-select" value={month} onChange={(e) => { setMonth(Number(e.target.value)); setError(""); }}>
                {MONTH_NAMES.map((m, i) => (
                  <option key={m} value={i + 1}>{m}</option>
                ))}
              </select>
            </div>
            <div className="kpiq-field">
              <label className="kpiq-label">Choose Year</label>
              <select className="kpiq-select" value={year} onChange={(e) => { setYear(Number(e.target.value)); setError(""); }}>
                {years.map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="kpiq-field">
            <label className="kpiq-label">Choose Domain</label>
            <select className="kpiq-select" value={domain} onChange={handleDomainChange}>
              <option value="">Select domain</option>
              {domainList.map((d) => (
                <option key={d.domain} value={d.domain}>{d.domain}</option>
              ))}
            </select>
          </div>

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
                    {["green", "orange", "red"].map((k) => (
                      <div key={k} className="kpiq-info-row" style={{ color: BANDS[k].color }}>
                        <span style={{ width: 12, height: 12, borderRadius: 3, background: BANDS[k].dot, display: "inline-block" }} />
                        {k === "green" ? "90% - 100% = Green" : k === "orange" ? "80% - 90% = Orange" : "Below 80% = Red"}
                      </div>
                    ))}
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
                onBlur={() => setQRaw((v) => normalizeQuality(v))}
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
                <span className="kpiq-pill" style={{ color: band.color, background: band.bg, borderColor: band.border }}>
                  {band.label}
                </span>
              )}
            </div>
          </div>

          {existing && (
            <div className="kpiq-hint">Already entered: {fmtPct(existing.quality)}. Submit will update it.</div>
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
    </Overlay>
  );
}

/* ======================================
   DELETE CONFIRM POPUP (whole month row)
====================================== */
function ConfirmDelete({ period, count, busy, onCancel, onConfirm }) {
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape" && !busy) onCancel();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [busy, onCancel]);

  return (
    <Overlay className="kpiq-overlay confirm" disabled={busy} onClose={onCancel}>
      <div className="kpiq-modal small" onClick={(e) => e.stopPropagation()}>
        <div className="kpiq-modal-head danger">
          <h3>Delete Month Data</h3>
          <button type="button" className="kpiq-x" aria-label="Close" onClick={onCancel} disabled={busy}>
            <FaTimes />
          </button>
        </div>
        <div className="kpiq-modal-body">
          <div style={{ fontSize: 14, color: "#0f172a", lineHeight: 1.5 }}>
            Are you sure you want to delete all <b>{count}</b> {count === 1 ? "entry" : "entries"} of{" "}
            <b>{MONTH_NAMES[period.month - 1]} {period.year}</b>? This cannot be undone.
          </div>
        </div>
        <div className="kpiq-modal-foot">
          <button type="button" className="kpiq-btn ghost" onClick={onCancel} disabled={busy}>Cancel</button>
          <button type="button" className="kpiq-btn danger" onClick={onConfirm} disabled={busy}>
            {busy ? "Deleting..." : "Delete"}
          </button>
        </div>
      </div>
    </Overlay>
  );
}

/* ======================================
   MAIN PAGE
====================================== */
export default function KPIInsight({ domains = [] }) {
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;

  const [rows, setRows] = useState([]);
  const [options, setOptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [selected, setSelected] = useState(
    () => new Set(MONTH_NAMES.map((_, i) => mk(currentYear, i + 1)))
  );
  const [modal, setModal] = useState(null); // null | { type: "create" }
  const [editing, setEditing] = useState(null); // { k, period, drafts, saving, error }
  const [exporting, setExporting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null); // period
  const [deleting, setDeleting] = useState(false);
  const [toast, setToast] = useState(null);

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Only the latest request is allowed to update state (avoids out-of-order responses)
  const loadSeq = useRef(0);
  const loadAll = useCallback(async () => {
    const seq = ++loadSeq.current;
    try {
      const [rowsRes, optRes] = await Promise.all([
        axios.get(`${API_BASE_URL}/api/kpi-insight`),
        axios.get(`${API_BASE_URL}/api/kpi-insight/options`),
      ]);
      if (!mountedRef.current || seq !== loadSeq.current) return;
      setLoadError("");
      setRows(Array.isArray(rowsRes.data) ? rowsRes.data : []);
      setOptions(Array.isArray(optRes.data?.domains) ? optRes.data.domains : []);
    } catch (err) {
      if (!mountedRef.current || seq !== loadSeq.current) return;
      setLoadError(err?.response?.data?.message || err.message || "Failed to load data");
    } finally {
      if (mountedRef.current && seq === loadSeq.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  const domainList = useMemo(() => {
    const map = new Map();
    options.forEach((o) => map.set(o.domain, { domain: o.domain, scopes: o.scopes || [] }));
    (domains || []).forEach((d) => {
      const key = String(d || "").trim().toUpperCase();
      if (key && !map.has(key)) map.set(key, { domain: key, scopes: [] });
    });
    return [...map.values()].sort((a, b) => a.domain.localeCompare(b.domain));
  }, [options, domains]);

  const yearList = useMemo(() => {
    const set = new Set([currentYear]);
    rows.forEach((r) => set.add(r.year));
    return [...set].sort((a, b) => b - a);
  }, [rows, currentYear]);

  const modalYears = useMemo(() => {
    const set = new Set([currentYear - 1, currentYear, currentYear + 1]);
    rows.forEach((r) => set.add(r.year));
    return [...set].sort((a, b) => b - a);
  }, [rows, currentYear]);

  // Table: rows = Month + Year, columns = domain + scope
  const view = useMemo(() => {
    const yearRows = rows.filter((r) => selected.has(mk(r.year, r.month)));

    const colMap = new Map();
    yearRows.forEach((r) => {
      const key = colKeyOf(r);
      if (!colMap.has(key)) colMap.set(key, { key, domain: r.domain, scope: r.scope || "" });
    });
    const cols = [...colMap.values()].sort(byDomainScope);

    const periodMap = new Map();
    yearRows.forEach((r) => {
      const k = mk(r.year, r.month);
      if (!periodMap.has(k)) periodMap.set(k, { k, year: r.year, month: r.month });
    });
    const periods = [...periodMap.values()].sort((a, b) => a.year - b.year || a.month - b.month);

    const cell = {};
    yearRows.forEach((r) => {
      cell[`${mk(r.year, r.month)}|${colKeyOf(r)}`] = r;
    });

    return { cols, periods, cell };
  }, [rows, selected]);

  const entriesOf = useCallback(
    (p) => rows.filter((r) => r.year === p.year && r.month === p.month).sort(byDomainScope),
    [rows]
  );

  // If the row being edited disappears (e.g. data reloaded), leave edit mode
  useEffect(() => {
    if (editing && !editing.saving && !view.periods.some((p) => p.k === editing.k)) setEditing(null);
  }, [view.periods, editing]);

  const handleCreated = (data, y, m) => {
    setModal(null);
    setToast({ type: "success", text: data.message || "Saved successfully" });
    setSelected((prev) => new Set(prev).add(mk(y, m)));
    loadAll();
  };

  /* ---------- Inline row edit ---------- */
  const startEdit = (p) => {
    const drafts = {};
    view.cols.forEach((c) => {
      const r = view.cell[`${p.k}|${c.key}`];
      drafts[c.key] = r ? String(Number(r.quality)) : "";
    });
    setEditing({ k: p.k, period: p, drafts, saving: false, error: "" });
  };

  const cancelEdit = () => setEditing(null);

  const changeDraft = (colKey, value) => {
    const raw = sanitizeQuality(value);
    if (raw === null) return;
    setEditing((e) => (e ? { ...e, drafts: { ...e.drafts, [colKey]: raw }, error: "" } : e));
  };

  const blurDraft = (colKey) => {
    setEditing((e) =>
      e ? { ...e, drafts: { ...e.drafts, [colKey]: normalizeQuality(e.drafts[colKey] ?? "") } } : e
    );
  };

  const saveEdit = async () => {
    if (!editing || editing.saving) return;
    const { period, drafts } = editing;
    const jobs = [];
    let invalid = false;
    view.cols.forEach((c) => {
      const old = view.cell[`${period.k}|${c.key}`];
      const raw = normalizeQuality(drafts[c.key] ?? "");
      if (old) {
        if (raw === "") jobs.push(axios.delete(`${API_BASE_URL}/api/kpi-insight/${old.id}`));
        else if (Number(raw) !== Number(old.quality)) {
          jobs.push(axios.put(`${API_BASE_URL}/api/kpi-insight/${old.id}`, { quality: Number(raw) }));
        }
      } else if (raw !== "") {
        jobs.push(
          axios.post(`${API_BASE_URL}/api/kpi-insight`, {
            year: period.year,
            month: period.month,
            domain: c.domain,
            scope: c.scope,
            quality: Number(raw),
          })
        );
      }
    });
    if (invalid) return setEditing((e) => (e ? { ...e, error: "Enter a valid Quality %" } : e));
    if (jobs.length === 0) return setEditing(null);

    setEditing((e) => (e ? { ...e, saving: true, error: "" } : e));
    const results = await Promise.allSettled(jobs);
    const failed = results.find((r) => r.status === "rejected");
    await loadAll();
    if (!mountedRef.current) return;
    if (failed) {
      const msg = failed.reason?.response?.data?.message || failed.reason?.message || "Some changes could not be saved";
      setEditing((e) => (e ? { ...e, saving: false, error: msg } : e));
    } else {
      setEditing(null);
      setToast({ type: "success", text: "Row updated" });
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget || deleting) return;
    const list = entriesOf(deleteTarget);
    try {
      setDeleting(true);
      const results = await Promise.allSettled(
        list.map((e) => axios.delete(`${API_BASE_URL}/api/kpi-insight/${e.id}`))
      );
      const failed = results.filter((r) => r.status === "rejected").length;
      setToast(
        failed
          ? { type: "error", text: `${failed} ${failed === 1 ? "entry" : "entries"} could not be deleted` }
          : { type: "success", text: "Deleted successfully" }
      );
      setDeleteTarget(null);
      await loadAll();
    } finally {
      if (mountedRef.current) setDeleting(false);
    }
  };

  /* ---------- Generate Excel (.xlsx, same as table, colour by %, no Action column) ---------- */
  const generateExcel = async () => {
    if (!view.cols.length || !view.periods.length || exporting) return;
    let ExcelJS;
    try {
      setExporting(true);
      try {
        const mod = await import("exceljs/dist/exceljs.min.js");
        ExcelJS = mod.default || mod;
      } catch (importErr) {
        console.error(importErr);
        setToast({ type: "error", text: "Excel library missing. Run: npm install exceljs" });
        return;
      }

      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet("Quality Rating");

      const argb = (hex) => `FF${hex.replace("#", "").toUpperCase()}`;
      const side = (hex) => ({ style: "thin", color: { argb: argb(hex) } });
      const box = (hex) => ({ top: side(hex), left: side(hex), bottom: side(hex), right: side(hex) });
      const center = { horizontal: "center", vertical: "middle", wrapText: true };
      const lastCol = view.cols.length + 1;

      ws.getCell(1, 1).value = "JOB Completed Month";
      ws.mergeCells(1, 1, 2, 1);
      ws.getCell(1, 2).value = "Domain";
      if (lastCol > 2) ws.mergeCells(1, 2, 1, lastCol);
      view.cols.forEach((c, i) => {
        ws.getCell(2, i + 2).value = c.scope ? `${c.domain}\n${c.scope}` : c.domain;
      });
      for (let r = 1; r <= 2; r++) {
        for (let c = 1; c <= lastCol; c++) {
          const cell = ws.getCell(r, c);
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F4A63" } };
          cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
          cell.alignment = center;
          cell.border = box("#CBD5E1");
        }
      }
      ws.getRow(2).height = 34;

      view.periods.forEach((p, ri) => {
        const rowNo = ri + 3;
        const label = ws.getCell(rowNo, 1);
        label.value = `${MONTH_NAMES[p.month - 1]} ${p.year}`;
        label.font = { bold: true };
        label.alignment = { horizontal: "left", vertical: "middle" };
        label.border = box("#CBD5E1");

        view.cols.forEach((c, ci) => {
          const cell = ws.getCell(rowNo, ci + 2);
          const r = view.cell[`${p.k}|${c.key}`];
          if (!r) {
            cell.border = box("#CBD5E1");
            return;
          }
          const q = Number(Number(r.quality).toFixed(2));
          const b = getBand(q);
          const decimals = (String(q).split(".")[1] || "").length;
          cell.value = Math.round(q * 100) / 10000;
          cell.numFmt = decimals === 0 ? "0%" : decimals === 1 ? "0.0%" : "0.00%";
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(b.bg) } };
          cell.font = { bold: true, color: { argb: argb(b.color) } };
          cell.alignment = center;
          cell.border = box(b.border);
        });
      });

      ws.getColumn(1).width = 22;
      for (let c = 2; c <= lastCol; c++) ws.getColumn(c).width = 18;
      ws.views = [{ state: "frozen", xSplit: 1, ySplit: 2 }];

      const first = view.periods[0];
      const last = view.periods[view.periods.length - 1];
      const tag = (p) => `${MONTH_NAMES[p.month - 1]}${p.year}`;
      const fileName =
        first.k === last.k
          ? `KPI_Quality_Rating_${tag(first)}.xlsx`
          : `KPI_Quality_Rating_${tag(first)}_to_${tag(last)}.xlsx`;

      const buffer = await wb.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setToast({ type: "success", text: "Excel generated" });
    } catch (err) {
      console.error(err);
      setToast({ type: "error", text: "Could not generate Excel" });
    } finally {
      if (mountedRef.current) setExporting(false);
    }
  };

  const pill = (value) => {
    const b = getBand(value);
    return (
      <span className="kpiq-pill" style={{ color: b.color, background: b.bg, borderColor: b.border }}>
        {fmtPct(value)}
      </span>
    );
  };

  return (
    <div className="kpiq-page">
      <h2 className="kpiq-title">KPI Insight</h2>

      <div className="kpiq-top">
        <div className="kpiq-field">
          <label className="kpiq-label">Choose Month, Year</label>
          <MonthPicker years={yearList} selected={selected} onChange={setSelected} disabled={!!editing} />
        </div>

        <div className="kpiq-actions">
          <button
            type="button"
            className="kpiq-btn excel"
            onClick={generateExcel}
            disabled={loading || exporting || view.cols.length === 0}
            title="Generate Excel of the table"
          >
            <FaFileExcel /> {exporting ? "Generating..." : "Generate"}
          </button>
          <button type="button" className="kpiq-btn" onClick={() => setModal({ type: "create" })} disabled={!!editing}>
            <FaPlus /> Create
          </button>
        </div>
      </div>

      <div className="kpiq-card">
        <div className="kpiq-card-head">Quality Rating</div>

        {editing && (
          <div className="kpiq-edit-note">
            <span>
              Editing {MONTH_NAMES[editing.period.month - 1]} {editing.period.year}: change a value, fill an empty box to add, or clear a box to remove it. Then click Save.
            </span>
            {editing.error && <span className="kpiq-err">{editing.error}</span>}
          </div>
        )}

        {loading ? (
          <div className="kpiq-empty">Loading...</div>
        ) : loadError && rows.length === 0 ? (
          <div className="kpiq-empty">
            <div style={{ color: "#dc2626", fontWeight: 700, marginBottom: 10 }}>{loadError}</div>
            <button type="button" className="kpiq-btn" onClick={() => { setLoading(true); loadAll(); }}>Retry</button>
          </div>
        ) : view.cols.length === 0 ? (
          <div className="kpiq-empty">
            {selected.size === 0
              ? "Please select at least one month."
              : "No Quality Rating data for this selection. Click Create to add."}
          </div>
        ) : (
          <div className="kpiq-scroll">
            <table className="kpiq-table">
              <thead>
                <tr className="first">
                  <th className="stickyCol" rowSpan={2}>JOB Completed Month</th>
                  <th colSpan={view.cols.length}>Domain</th>
                  <th className="stickyRight" rowSpan={2}>Action</th>
                </tr>
                <tr className="second">
                  {view.cols.map((c) => (
                    <th key={c.key}>
                      {c.domain}
                      {c.scope && <span className="kpiq-colScope">{c.scope}</span>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {view.periods.map((p) => {
                  const isEdit = !!editing && editing.k === p.k;
                  return (
                    <tr key={p.k} className={isEdit ? "editing" : ""}>
                      <td className="stickyCol">{MONTH_NAMES[p.month - 1]} {p.year}</td>
                      {view.cols.map((c) => {
                        if (isEdit) {
                          const raw = editing.drafts[c.key] ?? "";
                          const b = getBand(raw === "" || raw === "." ? null : Number(raw));
                          return (
                            <td key={c.key}>
                              <div className="kpiq-cell-edit">
                                <input
                                  className="kpiq-cell-input"
                                  type="text"
                                  inputMode="decimal"
                                  autoComplete="off"
                                  placeholder="-"
                                  aria-label={`${c.domain} ${c.scope}`.trim()}
                                  value={raw}
                                  disabled={editing.saving}
                                  onChange={(e) => changeDraft(c.key, e.target.value)}
                                  onBlur={() => blurDraft(c.key)}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") saveEdit();
                                    if (e.key === "Escape") cancelEdit();
                                  }}
                                  style={b.key === "none" ? undefined : { color: b.color, background: b.bg, borderColor: b.border }}
                                />
                                <span className="kpiq-cell-pct">%</span>
                              </div>
                            </td>
                          );
                        }
                        const r = view.cell[`${p.k}|${c.key}`];
                        return <td key={c.key}>{r ? pill(r.quality) : ""}</td>;
                      })}
                      <td className="stickyRight">
                        <div className="kpiq-act-wrap">
                          {isEdit ? (
                            <>
                              <button type="button" className="kpiq-act save" onClick={saveEdit} disabled={editing.saving} title="Save">
                                <FaCheck /> <span className="kpiq-act-txt">{editing.saving ? "Saving..." : "Save"}</span>
                              </button>
                              <button type="button" className="kpiq-act cancel" onClick={cancelEdit} disabled={editing.saving} title="Cancel">
                                <FaTimes /> <span className="kpiq-act-txt">Cancel</span>
                              </button>
                            </>
                          ) : (
                            <>
                              <button type="button" className="kpiq-act edit" onClick={() => startEdit(p)} disabled={!!editing} title="Edit" aria-label="Edit row">
                                <FaEdit />
                              </button>
                              <button type="button" className="kpiq-act del" onClick={() => setDeleteTarget(p)} disabled={!!editing} title="Delete" aria-label="Delete row">
                                <FaTrashAlt />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="kpiq-legend">
        <span><span className="dot" style={{ background: BANDS.green.dot }} />90% - 100% Green</span>
        <span><span className="dot" style={{ background: BANDS.orange.dot }} />80% - 90% Orange</span>
        <span><span className="dot" style={{ background: BANDS.red.dot }} />Below 80% Red</span>
      </div>

      {modal?.type === "create" && (
        <CreateModal
          years={modalYears}
          defaultYear={currentYear}
          defaultMonth={currentMonth}
          domainList={domainList}
          rows={rows}
          onClose={() => setModal(null)}
          onSaved={handleCreated}
        />
      )}

      {deleteTarget && (
        <ConfirmDelete
          period={deleteTarget}
          count={entriesOf(deleteTarget).length}
          busy={deleting}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={confirmDelete}
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
