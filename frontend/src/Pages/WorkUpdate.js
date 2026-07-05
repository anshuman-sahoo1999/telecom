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

  // ✅ DELETE SUCCESS TOAST
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
      const buffer = evt.target.result;

      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(buffer);

      const sheets = workbook.worksheets.map((ws) => ws.name);

      setSheetNames(sheets);

      const html = {};

      workbook.worksheets.forEach((ws) => {
        let table = "<table border='1' style='border-collapse:collapse;width:100%'>";

        const colCount = ws.columnCount;

        ws.eachRow((row, rowNumber) => {

          table += "<tr>";

          for (let col = 1; col <= colCount; col++) {

            let val = row.getCell(col).value;

            // date fix
            if (val instanceof Date) {
              const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
              val = `${months[val.getMonth()]}-${val.getFullYear()}`;
            }

            if (rowNumber === 1) {
              table += `<th style="padding:8px !important;background-color:#f2f2f2 !important;color:#fff !important;font-weight:600">${val ?? ""}</th>`;
            } else {
              table += `<td style="padding:6px">${val ?? ""}</td>`;
            }
          }

          table += "</tr>";
        });

        table += "</table>";

        html[ws.name] = table;
      });

      setTempWorkbook(html);
      setUploadActiveSheet(sheets[0]);
      setExcelFile(file);
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

      // 🔥 DASHBOARD AUTO REFRESH
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

      if (!window.confirm("Delete file?")) return;

      await axios.delete(
        `http://localhost:5000/api/work/delete-file/${fileName}`
      );

      fetchData();

      // ✅ NICE DELETE TOAST
      setDeleteMsg(true);
      setTimeout(() => setDeleteMsg(false), 2000);

    } catch (err) {
      console.log(err);
      alert("Delete failed");
    }
  };

  /* ================= VIEW FILE ================= */

  const handleView = async (item) => {
    try {
      const fileName = item.file_name;

      // Same file click => close preview
      if (selectedFile === fileName) {
        setSelectedFile(null);
        return;
      }

      const res = await axios.get(
        `http://localhost:5000/api/work/file/${fileName}`
      );

      const data = res.data || [];

      const grouped = {};

      data.forEach((row) => {
        const sheet = row.domain || "Sheet";
        if (!grouped[sheet]) grouped[sheet] = [];
        grouped[sheet].push(row);
      });

      const htmlSheets = {};

   Object.keys(grouped).forEach((sheet) => {

  const rows = grouped[sheet];

  let table = "<table border='1' style='border-collapse:collapse;width:100%'>";

  if (rows.length > 0) {

    const keys = Object.keys(rows[0]);

    // 🔥 HEADER (ONLY ONCE)
    table += "<tr style='background:#f2f2f2;font-weight:bold'>";

    keys.forEach((key) => {
      table += `<th style="padding:8px;text-align:left">${key}</th>`;
    });

    table += "</tr>";

    // 🔥 DATA ROWS
    rows.forEach((row) => {
      table += "<tr>";

      keys.forEach((k) => {
        let val = row[k];

        if (val instanceof Date) {
          const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
          val = `${months[val.getMonth()]}-${val.getFullYear()}`;
        }

        table += `<td style="padding:6px">${val ?? ""}</td>`;
      });

      table += "</tr>";
    });
  }

  table += "</table>";

  htmlSheets[sheet] = table;
});
      setViewWorkbook(htmlSheets);

      const sheets = Object.keys(htmlSheets);

      setViewSheetNames(sheets);
      setViewActiveSheet(sheets[0]);

      setSelectedFile(fileName);

    } catch (err) {
      console.log(err);
      alert("View failed");
    }
  };

  /* ================= UNIQUE FILES ================= */

  const uniqueImports = Array.from(
    new Map(imports.map((i) => [i.file_name, i])).values()
  );

  return (
    <div className="excel-page">

      <h2 className="page-title">Excel Upload System</h2>

      {/* ✅ IMPORT SUCCESS */}
      {successMsg && (
        <div className="success-toast">✅ Import Successful</div>
      )}

      {/* ✅ DELETE SUCCESS (NEW) */}
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

        {/* UPLOAD MODAL */}
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

        {/* POPUP */}
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