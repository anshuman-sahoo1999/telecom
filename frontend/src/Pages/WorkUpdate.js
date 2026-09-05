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

  // INLINE VIEW STATES
  const [viewWorkbook, setViewWorkbook] = useState({});
  const [viewSheetNames, setViewSheetNames] = useState([]);
  const [viewActiveSheet, setViewActiveSheet] = useState("");
  const fileInputRef = useRef(null);

  /* ================= FETCH FILE LIST ================= */
  const fetchData = async () => {
    try {
      const res = await axios.get("http://localhost:5000/api/work/all");
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
                const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
                val = `${months[val.getMonth()]}-${val.getFullYear()}`;
              }

              if (val && typeof val === "object" && val.text) {
                val = val.text;
              }

              if (val && typeof val === "object" && val.result !== undefined) {
                val = val.result;
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
        alert("Failed to parse Excel file. The file might be corrupted.");
        removeFile();
      }
    };

    reader.readAsArrayBuffer(file);
  };

  /* ================= REMOVE FILE ================= */
  const removeFile = () => {
    setExcelFile(null);
    setTempWorkbook({});
    setSheetNames([]);
    setUploadActiveSheet("");

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  /* ================= IMPORT EXCEL ================= */
  const handleImport = async () => {
    if (!excelFile) return alert("Select file");

    try {
      setLoading(true);

      const formData = new FormData();
      formData.append("file", excelFile);

      await axios.post(
        "http://localhost:5000/api/work/import-excel",
        formData,
        { headers: { "Content-Type": "multipart/form-data" } }
      );

      setSuccessMsg(true);
      setTimeout(() => setSuccessMsg(false), 2000);

      removeFile();
      setShowPopup(false);
      fetchData();

      if (refreshDashboard) {
        refreshDashboard();
      }
    } catch (err) {
      console.log(err);
      alert("Import Failed");
    } finally {
      setLoading(false);
    }
  };

  /* ================= DELETE FILE ================= */
  const handleDelete = async (item) => {
    try {
      const fileName = item.file_name;
      if (!fileName) return alert("File missing");

      if (!window.confirm(`Delete file "${fileName}"?`)) return;

      await axios.delete(
        `http://localhost:5000/api/work/delete-file/${fileName}`
      );

      fetchData();

      setDeleteMsg(true);
      setTimeout(() => setDeleteMsg(false), 2000);
    } catch (err) {
      console.log(err);
      alert("Delete failed");
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
          `http://localhost:5000/api/work/file/${fileName}`
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
              if (k !== 'id' && k !== 'created_at' && k !== 'updated_at' && k !== 'file_name') {
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
                if (val) {
                  const d = new Date(val);
                  if (!isNaN(d)) {
                    val = d.toISOString().split('T')[0];
                  }
                } else {
                  val = "";
                }
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
      alert("View failed");
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
          🗑️ File Deleted Successfully
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
                      onClick={() => handleView(item)}
                    >
                      <Eye size={14} /> View
                    </button>

                    <button
                      className="delete-btn"
                      onClick={() => handleDelete(item)}
                    >
                      <Trash2 size={14} /> Delete
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
                <button onClick={() => setShowPopup(false)}>Cancel</button>
                <button onClick={handleImport}>Yes Save</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
