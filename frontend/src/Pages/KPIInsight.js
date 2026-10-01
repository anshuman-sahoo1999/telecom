import { API_BASE_URL } from "../config";
import React, { useState, useEffect, useMemo, useCallback, useRef, useLayoutEffect } from "react";
import axios from "axios";
import { FaPlus, FaTimes, FaInfoCircle, FaEdit, FaTrashAlt, FaFileExcel, FaChevronDown, FaUndo } from "react-icons/fa";
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

const sameScope = (a, b) => String(a || "").trim().toLowerCase() === String(b || "").trim().toLowerCase();
const mk = (y, m) => `${y}-${m}`; // month key e.g. "2026-3"
const colKeyOf = (r) => `${r.domain}||${String(r.scope || "").trim().toLowerCase()}`;
const escHtml = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const byDomainScope = (a, b) => a.domain.localeCompare(b.domain) || String(a.scope || "").localeCompare(String(b.scope || ""));

// Quality input ko clean karta hai. Invalid ho to null (change ignore).
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

/* ======================================
   MONTH / YEAR MULTI SELECT DROPDOWN
====================================== */
function MonthPicker({ years, selected, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

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
      <button type="button" className="kpiq-select kpiq-picker-btn" onClick={() => setOpen((v) => !v)}>
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
        (r) => r.year === Number(year) && r.month === Number(month) && r.domain === domain && sameScope(r.scope, scope)
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
    const raw = sanitizeQuality(e.target.value);
    if (raw === null) return;
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
    <div className="kpiq-overlay" onClick={() => { if (!saving) onClose(); }}>
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
    </div>
  );
}

/* ======================================
   EDIT POPUP (ek month ki saari entries)
====================================== */
function EditMonthModal({ period, entries, onClose, onSaved, onReload }) {
  const [items, setItems] = useState(() =>
    entries.map((e) => ({
      id: e.id,
      domain: e.domain,
      scope: e.scope || "",
      orig: Number(e.quality),
      q: String(Number(e.quality)),
      removed: false,
    }))
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape" && !saving) onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, saving]);

  const patch = (id, change) => {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...change } : i)));
    setError("");
  };

  const handleChange = (id, value) => {
    const raw = sanitizeQuality(value);
    if (raw === null) return;
    patch(id, { q: raw });
  };

  const active = items.filter((i) => !i.removed);
  const changed = active.filter((i) => i.q !== "" && i.q !== "." && Number(i.q) !== i.orig);
  const removed = items.filter((i) => i.removed);

  const handleSave = async () => {
    if (saving) return;
    const empty = active.find((i) => i.q === "" || i.q === ".");
    if (empty) return setError(`Enter Quality % for ${empty.domain}${empty.scope ? ` - ${empty.scope}` : ""}`);
    if (changed.length === 0 && removed.length === 0) return onClose();

    setSaving(true);
    setError("");
    const jobs = [
      ...changed.map((i) => axios.put(`${API_BASE_URL}/api/kpi-insight/${i.id}`, { quality: Number(i.q) })),
      ...removed.map((i) => axios.delete(`${API_BASE_URL}/api/kpi-insight/${i.id}`)),
    ];
    const results = await Promise.allSettled(jobs);
    const failed = results.find((r) => r.status === "rejected");
    if (failed) {
      setError(failed.reason?.response?.data?.message || failed.reason?.message || "Some changes could not be saved");
      setSaving(false);
      onReload();
      return;
    }
    const parts = [];
    if (changed.length) parts.push(`${changed.length} updated`);
    if (removed.length) parts.push(`${removed.length} deleted`);
    onSaved(`Saved: ${parts.join(", ")}`);
  };

  return (
    <div className="kpiq-overlay" onClick={() => { if (!saving) onClose(); }}>
      <div className="kpiq-modal wide" onClick={(e) => e.stopPropagation()}>
        <div className="kpiq-modal-head">
          <h3>Edit - {MONTH_NAMES[period.month - 1]} {period.year}</h3>
          <button type="button" className="kpiq-x" aria-label="Close" onClick={onClose} disabled={saving}>
            <FaTimes />
          </button>
        </div>

        <div className="kpiq-modal-body">
          <div className="kpiq-edit-list">
            {items.map((i) => {
              const b = getBand(i.q === "" || i.q === "." ? null : Number(i.q));
              return (
                <div key={i.id} className={`kpiq-edit-row ${i.removed ? "removed" : ""}`}>
                  <div className="kpiq-edit-name">
                    <b>{i.domain}</b>
                    {i.scope && <span>{i.scope}</span>}
                  </div>
                  <div className="kpiq-edit-input">
                    <input
                      className="kpiq-input"
                      type="text"
                      inputMode="decimal"
                      autoComplete="off"
                      value={i.q}
                      disabled={i.removed || saving}
                      onChange={(e) => handleChange(i.id, e.target.value)}
                      style={{
                        fontWeight: 700,
                        color: b.color,
                        background: b.bg,
                        borderColor: b.border,
                      }}
                    />
                    <span className="kpiq-suffix">%</span>
                  </div>
                  <button
                    type="button"
                    className={`kpiq-icon ${i.removed ? "undo" : "del"}`}
                    title={i.removed ? "Undo" : "Remove"}
                    aria-label={i.removed ? "Undo remove" : "Remove"}
                    disabled={saving}
                    onClick={() => patch(i.id, { removed: !i.removed })}
                  >
                    {i.removed ? <FaUndo /> : <FaTrashAlt />}
                  </button>
                </div>
              );
            })}
          </div>

          {removed.length > 0 && (
            <div className="kpiq-hint">{removed.length} entr{removed.length > 1 ? "ies" : "y"} will be deleted when you save.</div>
          )}
          {error && <div className="kpiq-err">{error}</div>}
        </div>

        <div className="kpiq-modal-foot">
          <button type="button" className="kpiq-btn ghost" onClick={onClose} disabled={saving}>Cancel</button>
          <button type="button" className="kpiq-btn" onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ======================================
   DELETE CONFIRM POPUP (poori month row)
====================================== */
function ConfirmDelete({ period, count, busy, onCancel, onConfirm }) {
  return (
    <div className="kpiq-overlay confirm" onClick={() => { if (!busy) onCancel(); }}>
      <div className="kpiq-modal small" onClick={(e) => e.stopPropagation()}>
        <div className="kpiq-modal-head danger">
          <h3>Delete Month Data</h3>
          <button type="button" className="kpiq-x" aria-label="Close" onClick={onCancel} disabled={busy}>
            <FaTimes />
          </button>
        </div>
        <div className="kpiq-modal-body">
          <div style={{ fontSize: 14, color: "#0f172a", lineHeight: 1.5 }}>
            Are you sure you want to delete all <b>{count}</b> entr{count > 1 ? "ies" : "y"} of{" "}
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
    </div>
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
  const [modal, setModal] = useState(null); // null | { type: "create" } | { type: "edit", period }
  const [deleteTarget, setDeleteTarget] = useState(null); // period
  const [deleting, setDeleting] = useState(false);
  const [toast, setToast] = useState(null);

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

  const handleCreated = (data, y, m) => {
    setModal(null);
    setToast({ type: "success", text: data.message || "Saved successfully" });
    setSelected((prev) => new Set(prev).add(mk(y, m)));
    loadAll();
  };

  const handleEdited = (text) => {
    setModal(null);
    setToast({ type: "success", text });
    loadAll();
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
          ? { type: "error", text: `${failed} entr${failed > 1 ? "ies" : "y"} could not be deleted` }
          : { type: "success", text: "Deleted successfully" }
      );
      setDeleteTarget(null);
      await loadAll();
    } finally {
      setDeleting(false);
    }
  };

  /* ---------- Generate Excel (table jaisa, colours ke saath, Action column nahi) ---------- */
  const generateExcel = () => {
    if (!view.cols.length || !view.periods.length) return;

    const headStyle =
      "background:#0f4a63;color:#ffffff;font-weight:bold;text-align:center;vertical-align:middle;border:1px solid #cbd5e1;";
    let html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="utf-8"/>
<!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet><x:Name>Quality Rating</x:Name><x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions></x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]-->
</head><body><table border="1" style="border-collapse:collapse;font-family:Calibri,Arial,sans-serif;font-size:11pt;">`;

    html += `<colgroup><col width="150">${view.cols.map(() => '<col width="110">').join("")}</colgroup>`;
    html += `<tr><th rowspan="2" style="${headStyle}">JOB Completed Month</th><th colspan="${view.cols.length}" style="${headStyle}">Domain</th></tr>`;
    html += `<tr>${view.cols
      .map(
        (c) =>
          `<th style="${headStyle}">${escHtml(c.domain)}${c.scope ? `<br/><span style="font-size:9pt;">${escHtml(c.scope)}</span>` : ""}</th>`
      )
      .join("")}</tr>`;

    view.periods.forEach((p) => {
      html += `<tr><td style="font-weight:bold;text-align:left;border:1px solid #cbd5e1;">${MONTH_NAMES[p.month - 1]} ${p.year}</td>`;
      view.cols.forEach((c) => {
        const r = view.cell[`${p.k}|${c.key}`];
        if (!r) {
          html += `<td style="border:1px solid #cbd5e1;"></td>`;
        } else {
          const b = getBand(r.quality);
          html += `<td style="background:${b.bg};color:${b.color};font-weight:bold;text-align:center;border:1px solid ${b.border};mso-number-format:'0.00%';">${Number(r.quality) / 100}</td>`;
        }
      });
      html += `</tr>`;
    });
    html += `</table></body></html>`;

    const first = view.periods[0];
    const last = view.periods[view.periods.length - 1];
    const label = (p) => `${MONTH_NAMES[p.month - 1]}${p.year}`;
    const fileName =
      first.k === last.k ? `KPI_Quality_Rating_${label(first)}.xls` : `KPI_Quality_Rating_${label(first)}_to_${label(last)}.xls`;

    const blob = new Blob(["\ufeff", html], { type: "application/vnd.ms-excel;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setToast({ type: "success", text: "Excel generated" });
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
      <h2 className="kpiq-title"> KPI Insight</h2>

      <div className="kpiq-top">
        <div className="kpiq-field">
          <label className="kpiq-label">Choose Month, Year</label>
          <MonthPicker years={yearList} selected={selected} onChange={setSelected} />
        </div>

        <div className="kpiq-actions">
          <button
            type="button"
            className="kpiq-btn excel"
            onClick={generateExcel}
            disabled={loading || view.cols.length === 0}
            title="Generate Excel of the table"
          >
            <FaFileExcel /> Generate
          </button>
          <button type="button" className="kpiq-btn" onClick={() => setModal({ type: "create" })}>
            <FaPlus /> Create
          </button>
        </div>
      </div>

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
                  <th className="stickyCol" rowSpan={2} style={{ minWidth: 150 }}>JOB Completed Month</th>
                  <th colSpan={view.cols.length}>Domain</th>
                  <th className="stickyRight" rowSpan={2} style={{ minWidth: 150 }}>Action</th>
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
                {view.periods.map((p) => (
                  <tr key={p.k}>
                    <td className="stickyCol">{MONTH_NAMES[p.month - 1]} {p.year}</td>
                    {view.cols.map((c) => {
                      const r = view.cell[`${p.k}|${c.key}`];
                      return <td key={c.key}>{r ? pill(r.quality) : ""}</td>;
                    })}
                    <td className="stickyRight">
                      <div className="kpiq-act-wrap">
                        <button type="button" className="kpiq-act edit" onClick={() => setModal({ type: "edit", period: p })}>
                          <FaEdit /> Edit
                        </button>
                        <button type="button" className="kpiq-act del" onClick={() => setDeleteTarget(p)}>
                          <FaTrashAlt /> Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
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

      {modal?.type === "edit" && (
        <EditMonthModal
          period={modal.period}
          entries={entriesOf(modal.period)}
          onClose={() => setModal(null)}
          onSaved={handleEdited}
          onReload={loadAll}
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
