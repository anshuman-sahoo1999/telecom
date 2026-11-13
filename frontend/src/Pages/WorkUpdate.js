import { API_BASE_URL } from "../config";
import React, { useState, useEffect, useRef } from "react";
import axios from "axios";
import ExcelJS from "exceljs";

import {
  FileSpreadsheet,
  X,
  Eye,
  Trash2,
  UploadCloud,
} from "lucide-react";

import "../style/workupdate.css";
/* ======================================
   DATE + TIME DIKHANE KE HELPERS
   Server date "MM-DD-YYYY" ya "MM-DD-YYYY HH:mm" (24 ghante) bhejta hai.
   Pehle yahan time kat jata tha (sirf date bachti thi). Ab date ke side me time dikhta hai.
====================================== */
const pad2 = (n) => String(n).padStart(2, "0");

// 24 ghante (17, 53) -> "5:53 PM"
const to12Hour = (h, m) => {
  const hh = Number(h);
  return `${hh % 12 || 12}:${pad2(m)} ${hh >= 12 ? "PM" : "AM"}`;
};

const TIME_CHIP_STYLE =
  "display:inline-block;margin-left:8px;padding:1px 8px;border-radius:999px;" +
  "background:#e0e7ff;color:#3730a3;font-size:12px;font-weight:600;white-space:nowrap";

const dateWithTimeHtml = (dateText, time12) =>
  time12
    ? `${dateText}<span style="${TIME_CHIP_STYLE}">${time12}</span>`
    : dateText;

const formatDateForView = (val) => {
  if (!val) return "";
  const str = val.toString().replace(/ /g, " ").trim();

  // Server ka format: "MM-DD-YYYY" ya "MM-DD-YYYY HH:mm"
  let m = str.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})(?:[ T]+(\d{1,2}):(\d{2}))?/);
  if (m) {
    const dateText = `${m[3]}-${pad2(m[1])}-${pad2(m[2])}`;
    // 00:00 ka matlab "time diya hi nahi gaya"
    const hasTime = m[4] !== undefined && !(Number(m[4]) === 0 && Number(m[5]) === 0);
    return dateWithTimeHtml(dateText, hasTime ? to12Hour(m[4], m[5]) : "");
  }

  // Purani rows: "YYYY-MM-DD" ya "YYYY-MM-DD HH:mm" (ISO + Z wali string ka time bharosemand nahi, use ignore)
  m = str.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ ]+(\d{1,2}):(\d{2}))?/);
  if (m) {
    const hasTime = m[4] !== undefined && !(Number(m[4]) === 0 && Number(m[5]) === 0);
    return dateWithTimeHtml(`${m[1]}-${m[2]}-${m[3]}`, hasTime ? to12Hour(m[4], m[5]) : "");
  }

  const d = new Date(str);
  if (!isNaN(d.getTime())) return d.toISOString().split("T")[0];

  return str;
};

// Server har row ke saath ye extra fields bhi bhejta hai. Inka time already date ke saath judd chuka hai,
// isliye inhe alag column ki tarah nahi dikhana.
const VIEW_HIDDEN_KEYS = new Set([
  "receive_time",
  "ecd_time",
  "submission_time",
  "receive_date_display",
  "ecd_date_display",
  "submission_date_display",
]);

// Upload se pehle wale preview me Excel ki date/time cell ko Excel jaisa dikhata hai.
// ExcelJS dates ko UTC me deta hai, isliye UTC getters (local timezone se din nahi khisakta).
//  - sirf time wali cell (Excel me 1899 ki date banti hai)  -> "9:00 PM"
//  - date + time                                             -> "11/03/2026 3:32 AM"
//  - sirf date                                               -> "11/03/2026"
const formatExcelDateCell = (d) => {
  if (isNaN(d.getTime())) return "";
  // Excel ke float error se 10:59:59.99 jaisa na bane, isliye nazdeeki minute tak round
  const t = new Date(Math.round(d.getTime() / 60000) * 60000);
  const h = t.getUTCHours();
  const mi = t.getUTCMinutes();
  const time12 = `${h % 12 || 12}:${pad2(mi)} ${h >= 12 ? "PM" : "AM"}`;

  if (t.getUTCFullYear() < 1950) return time12;

  const dateText = `${pad2(t.getUTCMonth() + 1)}/${pad2(t.getUTCDate())}/${t.getUTCFullYear()}`;
  return h === 0 && mi === 0 ? dateText : `${dateText} ${time12}`;
};

export default function WorkUpdate({ refreshDashboard }) {
  const [excelFile, setExcelFile] = useState(null);
  const [imports, setImports] = useState([]);

  const [tempWorkbook, setTempWorkbook] = useState({});
  const [sheetNames, setSheetNames] = useState([]);
  const [uploadActiveSheet, setUploadActiveSheet] = useState("");

  const [loading, setLoading] = useState(false);
  const [showPopup, setShowPopup] = useState(false);
  const [successMsg, setSuccessMsg] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);

  // DELETE SUCCESS TOAST
  const [deleteMsg, setDeleteMsg] = useState(false);
  const [deleteText, setDeleteText] = useState("File Deleted Successfully");

  // DELETE CONFIRM POPUP (browser confirm ki jagah)
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deletingFiles, setDeletingFiles] = useState([]); // jin files ka delete chal raha hai

  // ERROR / INFO TOAST (browser alert ki jagah)
  const [toast, setToast] = useState(null); // { text, type }
  const toastTimer = useRef(null);

  // INLINE VIEW STATES
  const [viewWorkbook, setViewWorkbook] = useState({});
  const [viewSheetNames, setViewSheetNames] = useState([]);
  const [viewActiveSheet, setViewActiveSheet] = useState("");
  const fileInputRef = useRef(null);

  const showToast = (text, type = "error") => {
    setToast({ text, type });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3000);
  };

  useEffect(() => {
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);

  /* ================= FETCH FILE LIST ================= */
  const fetchData = async () => {
    try {
      const res = await axios.get(`${API_BASE_URL}/api/work/all`);
      setImports(res.data || []);
    } catch (err) {
      console.log(err);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  /* ================= FILE UPLOAD ================= */
  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();

    reader.onload = async (evt) => {
      try {
        const buffer = evt.target.result;

        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(buffer);

        const sheets = workbook.worksheets.map((ws) => ws.name);
        setSheetNames(sheets);

        const html = {};

        workbook.worksheets.forEach((ws) => {
          const rowCount = Math.min(ws.actualRowCount || ws.rowCount, 1000);
          const colCount = Math.min(ws.columnCount || 50, 50);

          let tableRows = ["<table border='1' style='border-collapse:collapse;width:100%'>"];

          for (let rowNumber = 1; rowNumber <= rowCount; rowNumber++) {
            const row = ws.getRow(rowNumber);
            
            if (!row.values || row.values.length === 0) continue;

            tableRows.push("<tr>");
            for (let col = 1; col <= colCount; col++) {
              let val = row.getCell(col).value;

              if (val instanceof Date) {
                val = formatExcelDateCell(val);
              } else if (val && typeof val === "object") {
                if (Array.isArray(val.richText)) {
                  val = val.richText.map((t) => (t && t.text ? t.text : "")).join("");
                } else if (val.text !== undefined) {
                  val = val.text;
                } else if (val.result !== undefined) {
                  val = val.result;
                } else if (val.error) {
                  val = "";
                }
              }

              if (rowNumber === 1) {
                tableRows.push(`<th style="padding:8px !important;background-color:#f2f2f2 !important;color:#333 !important;font-weight:600">${val ?? ""}</th>`);
              } else {
                tableRows.push(`<td style="padding:6px">${val ?? ""}</td>`);
              }
            }
            tableRows.push("</tr>");
          }

          tableRows.push("</table>");
          html[ws.name] = tableRows.join("");
        });

        setTempWorkbook(html);
        setUploadActiveSheet(sheets[0]);
        setExcelFile(file);
      } catch (err) {
        console.error("Error parsing Excel file:", err);
        showToast("Failed to read the Excel file. The file might be corrupted.");
        removeFile();
      }
    };

    reader.readAsArrayBuffer(file);
  };

  const removeFile = () => {
    setExcelFile(null);
    setTempWorkbook({});
    setSheetNames([]);
    setUploadActiveSheet("");

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleImport = async () => {
    if (!excelFile) return showToast("Please select a file first.", "info");

    try {
      setLoading(true);

      const formData = new FormData();
      formData.append("file", excelFile);

      const res = await axios.post(
        `${API_BASE_URL}/api/work/import-excel`,
        formData,
        { headers: { "Content-Type": "multipart/form-data" } }
      );

      setSuccessMsg(true);
      setTimeout(() => setSuccessMsg(false), 2000);

      removeFile();
      setShowPopup(false);

      // server ne latest data bhej diya ho to wahi use karo (extra request nahi)
      if (res && res.data && Array.isArray(res.data.data)) {
        setImports(res.data.data);
      } else {
        fetchData();
      }

      if (refreshDashboard) {
        refreshDashboard();
      }
    } catch (err) {
      console.log(err);
      setShowPopup(false);
      showToast(
        (err.response && err.response.data && err.response.data.message) ||
          "Import failed. Please try again."
      );
    } finally {
      setLoading(false);
    }
  };

  /* ================= DELETE FILE ================= */
  // Step 1: Delete button dabane par apna popup khulta hai (browser confirm nahi)
  const handleDelete = (item) => {
    const fileName = item && item.file_name;
    if (!fileName) return showToast("File name is missing.", "info");
    setDeleteTarget(item);
  };

  // Step 2: popup me "Yes, Delete" dabane par asli delete
  // CHANGE: popup turant band hota hai aur us file ki row par "Deleting..." dikhta hai
  // CHANGE: server badi file ko tukdon me delete karta hai (Vercel time-limit ki wajah se);
  //         jab tak server done:true na bheje, ye dobara call karta rehta hai
  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const fileName = deleteTarget.file_name;

    setDeleteTarget(null);
    setDeletingFiles((prev) => [...prev, fileName]);

    try {
      // file name me space, #, %, + jaise characters ho to bhi delete chale
      const url = `${API_BASE_URL}/api/work/delete-file/${encodeURIComponent(fileName)}?lite=1`;

      let totalDeleted = 0;
      let done = false;
      let rounds = 0;

      while (!done && rounds < 500) {
        rounds += 1;
        const res = await axios.delete(url);
        const body = (res && res.data) || {};
        const removed = Number(body.deletedCount) || 0;
        totalDeleted += removed;
        done = body.done !== false; // purana server done nahi bhejta -> done maano

        // kuchh delete hi nahi hua aur done bhi nahi -> atke nahi, ruk jao
        if (!done && removed === 0) {
          throw new Error("Delete is not making progress");
        }
      }

      if (selectedFile === fileName) setSelectedFile(null);

      // list se wahi file turant hata do (poora data dobara fetch karne ki zaroorat nahi)
      setImports((prev) => prev.filter((r) => r.file_name !== fileName));

      setDeleteText(
        `File "${fileName}" deleted successfully (${totalDeleted} record${totalDeleted === 1 ? "" : "s"} removed).`
      );
      setDeleteMsg(true);
      setTimeout(() => setDeleteMsg(false), 2500);

      if (refreshDashboard) {
        refreshDashboard();
      }
    } catch (err) {
      console.log(err);
      const body = err.response && err.response.data;
      const detail = body && (body.error || body.code);
      showToast(
        ((body && body.message) || "Could not delete the file. Please try again.") +
          (detail ? ` (${detail})` : "")
      );
      // adha delete hua ho to list sach dikhaye
      fetchData();
    } finally {
      setDeletingFiles((prev) => prev.filter((n) => n !== fileName));
    }
  };

  /* ================= VIEW FILE DATA (EXACT EXCEL ORDER) ================= */
  const handleView = async (item) => {
    try {
      const fileName = item.file_name;

      if (selectedFile === fileName) {
        setSelectedFile(null);
        return;
      }

      let data = [];
      try {
        const res = await axios.get(
          `${API_BASE_URL}/api/work/file/${encodeURIComponent(fileName)}`
        );
        data = res.data || [];
      } catch (err) {
        console.log(err);
      }

      const manualEntries = imports.filter(
        (row) => !row.file_name || row.file_name.trim() === ""
      );

      const combinedData = [...data, ...manualEntries];

      const grouped = {};
      combinedData.forEach((row) => {
        const sheet = row.domain || "General Domain";
        if (!grouped[sheet]) grouped[sheet] = [];
        grouped[sheet].push(row);
      });

      const htmlSheets = {};

      const standardOrder = [
        "sl_no", "sow", "job_id", "market", "region", "job_type", 
        "footage", "splice_count", "receive_date", "ecd_date", 
        "submission_date", "current_status", "production_engineers", 
        "qc_engineers", "otp", "internal_qc", "amdocs_qc", "months", "uom"
      ];

      Object.keys(grouped).forEach((sheet) => {
        const rows = grouped[sheet];
        let tableRows = ["<table border='1' style='border-collapse:collapse;width:100%'>"];

        if (rows.length > 0) {
          const allKeysSet = new Set();
          rows.forEach((r) => {
            Object.keys(r).forEach((k) => {
              if (
                k !== 'id' && k !== 'created_at' && k !== 'updated_at' && k !== 'file_name' &&
                !VIEW_HIDDEN_KEYS.has(k)
              ) {
                allKeysSet.add(k);
              }
            });
          });

          const rawKeys = Array.from(allKeysSet);
          const orderedKeys = standardOrder.filter(k => rawKeys.includes(k));
          rawKeys.forEach(k => {
            if (!orderedKeys.includes(k)) orderedKeys.push(k);
          });

          tableRows.push("<tr style='background:#f2f2f2;font-weight:bold'>");
          orderedKeys.forEach((key) => {
            const formattedHeader = key.replace(/_/g, " ").toUpperCase();
            tableRows.push(`<th style="padding:8px;text-align:left;">${formattedHeader}</th>`);
          });
          tableRows.push("</tr>");

          rows.forEach((row) => {
            tableRows.push("<tr>");
            orderedKeys.forEach((k) => {
              let val = row[k];

              if (k === "months") {
                try {
                  const parsed = typeof val === "string" ? JSON.parse(val) : val;
                  val = Array.isArray(parsed) ? parsed.join(", ") : parsed;
                } catch (e) {
                  val = val || "";
                }
              } else if (k === "uom") {
                try {
                  const parsed = typeof val === "string" ? JSON.parse(val) : val;
                  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
                    val = Object.entries(parsed)
                      .map(([prop, num]) => `${prop}: ${num}`)
                      .join(", ");
                  }
                } catch (e) {
                  val = val || "";
                }
              } else if (["receive_date", "ecd_date", "submission_date"].includes(k)) {
                val = formatDateForView(val);
              }

              tableRows.push(`<td style="padding:6px">${val ?? ""}</td>`);
            });
            tableRows.push("</tr>");
          });
        }

        tableRows.push("</table>");
        htmlSheets[sheet] = tableRows.join("");
      });

      setViewWorkbook(htmlSheets);

      const sheets = Object.keys(htmlSheets);
      setViewSheetNames(sheets);
      setViewActiveSheet(sheets[0] || "");
      setSelectedFile(fileName);
    } catch (err) {
      console.log(err);
      showToast("Could not open the file preview. Please try again.");
    }
  };

  const validImports = imports.filter(
    (i) => i.file_name && i.file_name.trim() !== ""
  );

  const uniqueImports = Array.from(
    new Map(validImports.map((i) => [i.file_name, i])).values()
  );

  return (
    <div className="excel-page">
      <h2 className="page-titled">Data Upload </h2>

      {successMsg && (
        <div className="success-toast">✅ Import Successful</div>
      )}

      {deleteMsg && (
        <div className="success-toast" style={{ background: "#ff4d4f" }}>
          🗑️ {deleteText}
        </div>
      )}

      {toast && (
        <div
          className="success-toast"
          style={{
            background: toast.type === "info" ? "#faad14" : "#ff4d4f",
          }}
        >
          {toast.type === "info" ? "ℹ️" : "⚠️"} {toast.text}
        </div>
      )}

      <div className="excel-card">
        <div className="top-header">
          <div>
            <h2>Excel Workshop</h2>
            <p>Upload Excel → Save → View</p>
          </div>

          <label className="upload-btn">
            <UploadCloud size={16} />
            Upload Excel
            <input
              type="file"
              hidden
              accept=".xlsx,.xls"
              ref={fileInputRef}
              onChange={handleFileUpload}
            />
          </label>
        </div>

        <div className="import-list">
          <h3>Database Records ({uniqueImports.length})</h3>

          {uniqueImports.length === 0 ? (
            <div className="empty-box">No Excel Uploaded</div>
          ) : (
            uniqueImports.map((item, index) => (
              <React.Fragment key={index}>
                <div className="import-card">
                  <div className="left">
                    <FileSpreadsheet size={18} />
                    <span>{item.file_name}</span>
                  </div>

                  <div className="btn-group">
                    <button
                      className="view-btn"
                      disabled={deletingFiles.includes(item.file_name)}
                      onClick={() => handleView(item)}
                    >
                      <Eye size={14} /> View
                    </button>

                    <button
                      className="delete-btn"
                      disabled={deletingFiles.includes(item.file_name)}
                      onClick={() => handleDelete(item)}
                    >
                      <Trash2 size={14} />{" "}
                      {deletingFiles.includes(item.file_name) ? "Deleting..." : "Delete"}
                    </button>
                  </div>
                </div>

                {selectedFile === item.file_name && (
                  <div className="inline-view-section">
                    <div className="inline-header">
                      <h3>Excel Preview</h3>

                      <button
                        className="close-btn"
                        onClick={() => setSelectedFile(null)}
                      >
                        <X size={18} />
                      </button>
                    </div>

                    {viewSheetNames.length > 0 && (
                      <div className="sheet-tabs">
                        {viewSheetNames.map((sheet) => (
                          <button
                            key={sheet}
                            className={viewActiveSheet === sheet ? "active" : ""}
                            onClick={() => setViewActiveSheet(sheet)}
                          >
                            {sheet}
                          </button>
                        ))}
                      </div>
                    )}

                    <div
                      className="modal-preview"
                      dangerouslySetInnerHTML={{
                        __html: viewWorkbook[viewActiveSheet] || "",
                      }}
                    />
                  </div>
                )}
              </React.Fragment>
            ))
          )}
        </div>

        {excelFile && (
          <div className="excel-modal-overlay">
            <div className="excel-modal">
              <div className="modal-header">
                <div className="header-left">
                  <FileSpreadsheet size={18} />
                  <span>{excelFile.name}</span>
                </div>

                <button onClick={removeFile}>
                  <X size={18} />
                </button>
              </div>

              <div className="modal-body">
                {sheetNames.length > 0 && (
                  <div className="sheet-tabs">
                    {sheetNames.map((sheet) => (
                      <button
                        key={sheet}
                        className={uploadActiveSheet === sheet ? "active" : ""}
                        onClick={() => setUploadActiveSheet(sheet)}
                      >
                        {sheet}
                      </button>
                    ))}
                  </div>
                )}

                <div
                  className="modal-preview"
                  dangerouslySetInnerHTML={{
                    __html: tempWorkbook[uploadActiveSheet] || "",
                  }}
                />
              </div>

              <div className="modal-actions">
                <button
                  className="import-btn"
                  disabled={loading}
                  onClick={() => setShowPopup(true)}
                >
                  {loading ? "Importing..." : "Import Excel"}
                </button>
              </div>
            </div>
          </div>
        )}

        {showPopup && (
          <div className="popup">
            <div className="popup-box">
              <h3>Do you want to save this Excel?</h3>

              <div className="popup-actions">
                <button disabled={loading} onClick={() => setShowPopup(false)}>
                  Cancel
                </button>
                <button disabled={loading} onClick={handleImport}>
                  {loading ? "Saving..." : "Yes Save"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* DELETE CONFIRM POPUP - browser confirm ki jagah */}
        {deleteTarget && (
          <div className="popup">
            <div className="popup-box">
              <h3>Delete this file?</h3>
              <p style={{ margin: "8px 0 16px", wordBreak: "break-all" }}>
                {deleteTarget.file_name}
              </p>

              <div className="popup-actions">
                <button onClick={() => setDeleteTarget(null)}>Cancel</button>
                <button onClick={confirmDelete}>Yes, Delete</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
