import { API_BASE_URL } from "../config";
import React, { useState, useEffect, useRef, useCallback } from "react";
import axios from "axios";
import ExcelJS from "exceljs";
import { FileSpreadsheet, UploadCloud, Trash2, X } from "lucide-react";
import "../style/rawdata.css";

const PREVIEW_ROWS = 100;
const pad = (n) => String(n).padStart(2, "0");

const cellToText = (v) => {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) {
    if (isNaN(v.getTime())) return "";
    return `${v.getUTCFullYear()}-${pad(v.getUTCMonth() + 1)}-${pad(v.getUTCDate())} ${pad(
      v.getUTCHours()
    )}:${pad(v.getUTCMinutes())}:${pad(v.getUTCSeconds())}`;
  }
  if (typeof v === "object") {
    if (Array.isArray(v.richText)) return v.richText.map((t) => t.text || "").join("");
    if (v.result !== undefined) return cellToText(v.result);
    if (v.text !== undefined) return String(v.text);
    return "";
  }
  return String(v);
};

export default function RawDataUpload() {
  const [files, setFiles] = useState([]);
  const [loadingList, setLoadingList] = useState(true);

  const [excelFile, setExcelFile] = useState(null);
  const [preview, setPreview] = useState({ headers: [], rows: [], total: 0 });
  const [parsing, setParsing] = useState(false);

  const [saving, setSaving] = useState(false);
  const [confirmSave, setConfirmSave] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(null);

  const [toast, setToast] = useState(null);
  const timer = useRef(null);
  const inputRef = useRef(null);

  const showToast = (text, type = "err") => {
    setToast({ text, type });
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(null), 3500);
  };
  useEffect(() => () => clearTimeout(timer.current), []);

  const fetchFiles = useCallback(async () => {
    try {
      const res = await axios.get(`${API_BASE_URL}/api/rawdata/files`);
      setFiles(res.data?.data || []);
    } catch (e) {
      showToast("Could not load the uploaded files.");
    } finally {
      setLoadingList(false);
    }
  }, []);

  useEffect(() => {
    fetchFiles();
  }, [fetchFiles]);

  const clearSelection = () => {
    setExcelFile(null);
    setPreview({ headers: [], rows: [], total: 0 });
    setConfirmSave(false);
    if (inputRef.current) inputRef.current.value = "";
  };

  /* ---- choose file -> preview in the browser ---- */
  const handleChoose = async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    if (!/\.(xlsx|xlsm)$/i.test(file.name)) {
      showToast("Please upload an .xlsx file only.");
      if (inputRef.current) inputRef.current.value = "";
      return;
    }
    setParsing(true);
    try {
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(await file.arrayBuffer());
      const ws = wb.worksheets[0];
      if (!ws) throw new Error("no sheet");

      const colCount = Math.min(ws.columnCount || 30, 40);
      const headers = [];
      for (let c = 1; c <= colCount; c++) headers.push(cellToText(ws.getRow(1).getCell(c).value));

      const rows = [];
      let total = 0;
      ws.eachRow({ includeEmpty: false }, (row, n) => {
        if (n === 1) return;
        total += 1;
        if (rows.length < PREVIEW_ROWS) {
          const r = [];
          for (let c = 1; c <= colCount; c++) r.push(cellToText(row.getCell(c).value));
          rows.push(r);
        }
      });

      setPreview({ headers, rows, total });
      setExcelFile(file);
    } catch (err) {
      console.error(err);
      showToast("Could not read the Excel file. The file may be corrupted.");
      clearSelection();
    } finally {
      setParsing(false);
    }
  };

  /* ---- import (backend) ---- */
  const handleImport = async () => {
    if (!excelFile) return;
    setSaving(true);
    try {
      const fd = new FormData();
      fd.append("file", excelFile);
      const res = await axios.post(`${API_BASE_URL}/api/rawdata/import-excel`, fd);
      const d = res.data || {};
      showToast(
        `${d.inserted} rows imported successfully` + (d.replaced ? ` (${d.replaced} existing rows replaced)` : ""),
        "ok"
      );
      clearSelection();
      fetchFiles();
    } catch (err) {
      setConfirmSave(false);
      showToast(err.response?.data?.message || "Import failed. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  /* ---- delete ---- */
  const handleDelete = async () => {
    const name = deleteTarget.file_name;
    setDeleteTarget(null);
    setDeleting(name);
    try {
      const res = await axios.delete(`${API_BASE_URL}/api/rawdata/file/${encodeURIComponent(name)}`);
      setFiles((p) => p.filter((f) => f.file_name !== name));
      showToast(`"${name}" deleted successfully (${res.data?.deletedCount ?? 0} rows removed).`, "ok");
    } catch (err) {
      showToast(err.response?.data?.message || "Could not delete the file.");
    } finally {
      setDeleting(null);
    }
  };

  return (
    <div className="rd-page">
      <h2 className="rd-title">Raw Data Upload</h2>

      {toast && <div className={`rd-toast ${toast.type}`}>{toast.text}</div>}

      <div className="rd-card">
        <div className="rd-head">
          <div>
            <h2>Import Ecometrix Raw File</h2>
            <p>Upload Excel → Preview → Import</p>
          </div>
          <label className="rd-btn" style={{ cursor: "pointer" }}>
            <UploadCloud size={16} />
            {parsing ? "Reading..." : "Upload Excel"}
            <input
              ref={inputRef}
              type="file"
              hidden
              accept=".xlsx,.xlsm"
              onChange={handleChoose}
              disabled={parsing}
            />
          </label>
        </div>

        <div className="rd-list">
          <h3>Imported Files ({files.length})</h3>
          {loadingList ? (
            <div className="rd-empty">Loading...</div>
          ) : files.length === 0 ? (
            <div className="rd-empty">No Excel file has been imported yet</div>
          ) : (
            files.map((f) => (
              <div className="rd-file" key={f.file_name}>
                <div className="l">
                  <FileSpreadsheet size={18} />
                  <span>
                    {f.file_name}
                    <small>
                      {f.total_rows} rows
                      {f.uploaded_at ? ` • ${new Date(f.uploaded_at).toLocaleString()}` : ""}
                    </small>
                  </span>
                </div>
                <button
                  className="rd-btn red sm"
                  disabled={deleting === f.file_name}
                  onClick={() => setDeleteTarget(f)}
                >
                  <Trash2 size={14} /> {deleting === f.file_name ? "Deleting..." : "Delete"}
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      {/* PREVIEW + IMPORT */}
      {excelFile && (
        <div className="rd-overlay">
          <div className="rd-modal">
            <div className="rd-modal-h">
              <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <FileSpreadsheet size={18} /> {excelFile.name}
              </span>
              <button onClick={clearSelection} aria-label="Close">
                <X size={18} />
              </button>
            </div>
            <div className="rd-modal-b">
              <div className="rd-tablewrap">
                <table className="rd-table">
                  <thead>
                    <tr>
                      {preview.headers.map((h, i) => (
                        <th key={i}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.rows.map((r, i) => (
                      <tr key={i}>
                        {r.map((c, j) => (
                          <td key={j}>{c}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="rd-modal-f">
              <span className="rd-note">
                Total {preview.total} rows
                {preview.total > PREVIEW_ROWS ? ` (showing first ${PREVIEW_ROWS} in preview)` : ""}
              </span>
              <button className="rd-btn gray" onClick={clearSelection} disabled={saving}>
                Cancel
              </button>
              <button className="rd-btn green" onClick={() => setConfirmSave(true)} disabled={saving}>
                {saving ? "Importing..." : "Import Excel"}
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmSave && (
        <div className="rd-overlay" style={{ zIndex: 2100 }}>
          <div className="rd-confirm">
            <h3>Do you want to save this Excel?</h3>
            <p>Existing rows with the same ID will be replaced.</p>
            <div className="a">
              <button className="rd-btn gray" disabled={saving} onClick={() => setConfirmSave(false)}>
                Cancel
              </button>
              <button className="rd-btn green" disabled={saving} onClick={handleImport}>
                {saving ? "Saving..." : "Yes, Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div className="rd-overlay" style={{ zIndex: 2100 }}>
          <div className="rd-confirm">
            <h3>Delete this file?</h3>
            <p>{deleteTarget.file_name}</p>
            <div className="a">
              <button className="rd-btn gray" onClick={() => setDeleteTarget(null)}>
                Cancel
              </button>
              <button className="rd-btn red" onClick={handleDelete}>
                Yes, Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
