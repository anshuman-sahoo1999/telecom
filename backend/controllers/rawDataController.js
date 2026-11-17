const ExcelJS = require("exceljs");
const db = require("../config/db");

/* ======================================================
   RAW DATA  (Ecometrix raw file)
   Table: raw_data  (PostgreSQL / NeonDB)
   - Upload page  -> importExcel, getFiles, deleteFile
   - Report page  -> getDomains, getRawData, exportExcel
====================================================== */

// Excel header  ->  DB column  (type: text | int | num | date)
const COLUMNS = [
  { header: "ID", key: "ext_id", type: "int" },
  { header: "EWO", key: "ewo", type: "text" },
  { header: "SOW", key: "sow", type: "text" },
  { header: "Project", key: "project", type: "text" },
  { header: "Domain", key: "domain", type: "text" },
  { header: "Region", key: "region", type: "text" },
  { header: "Market", key: "market", type: "text" },
  { header: "Job Type", key: "job_type", type: "text" },
  { header: "Vendor", key: "vendor", type: "text" },
  { header: "Job Completed Month", key: "job_completed_month", type: "int" },
  { header: "Job Completed Week", key: "job_completed_week", type: "int" },
  { header: "OTP", key: "otp", type: "num" },
  { header: "Vendor QC Correction OTP", key: "vendor_qc_correction_otp", type: "text" },
  { header: "Final OTP", key: "final_otp", type: "num" },
  { header: "QC Rating", key: "qc_rating", type: "num" },
  { header: "No. of Returns", key: "no_of_returns", type: "num" },
  { header: "Final No. of Returns", key: "final_no_of_returns", type: "num" },
  { header: "Vendor Assigned Date", key: "vendor_assigned_date", type: "date" },
  { header: "Job Assigned Week", key: "job_assigned_week", type: "int" },
  { header: "Submitted From Vendor Date", key: "submitted_from_vendor_date", type: "date" },
  { header: "Vendor Amdocs ECD", key: "vendor_amdocs_ecd", type: "date" },
  { header: "ATT Submission Date", key: "att_submission_date", type: "date" },
  { header: "Quality Iteration Sum", key: "quality_iteration_sum", type: "num" },
  { header: "Remarks", key: "remarks", type: "text" },
];

const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
const HEADER_LOOKUP = Object.fromEntries(COLUMNS.map((c) => [norm(c.header), c]));

/* ---------- small promise wrapper over db.query(sql, params, cb) ---------- */
const q = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.query(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)));
  });

let tableReady = null;
const ensureTable = () => {
  if (!tableReady) {
    tableReady = (async () => {
      await q(`
        CREATE TABLE IF NOT EXISTS raw_data (
          id SERIAL PRIMARY KEY,
          file_name TEXT NOT NULL,
          ext_id BIGINT,
          ewo TEXT, sow TEXT, project TEXT, domain TEXT, region TEXT, market TEXT,
          job_type TEXT, vendor TEXT,
          job_completed_month INT, job_completed_week INT,
          otp NUMERIC, vendor_qc_correction_otp TEXT, final_otp NUMERIC,
          qc_rating NUMERIC, no_of_returns NUMERIC, final_no_of_returns NUMERIC,
          vendor_assigned_date TEXT, job_assigned_week INT,
          submitted_from_vendor_date TEXT, vendor_amdocs_ecd TEXT,
          att_submission_date TEXT, quality_iteration_sum NUMERIC, remarks TEXT,
          created_at TIMESTAMP DEFAULT NOW()
        )`);
      await q(`CREATE INDEX IF NOT EXISTS idx_raw_data_domain ON raw_data (domain)`);
      await q(`CREATE INDEX IF NOT EXISTS idx_raw_data_file ON raw_data (file_name)`);
    })().catch((e) => {
      tableReady = null; // retry on the next request
      throw e;
    });
  }
  return tableReady;
};

/* ---------- cell cleaning ---------- */
const pad = (n) => String(n).padStart(2, "0");
const fmtDate = (d) =>
  `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ` +
  `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;

const cellValue = (cell) => {
  let v = cell.value;
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v;
  if (typeof v === "object") {
    if (Array.isArray(v.richText)) v = v.richText.map((t) => t.text || "").join("");
    else if (v.result !== undefined) v = v.result;
    else if (v.text !== undefined) v = v.text;
    else if (v.error) return null;
  }
  if (v instanceof Date) return v;
  if (typeof v === "string") {
    v = v.trim();
    return v === "" ? null : v;
  }
  return v;
};

const clean = (raw, type) => {
  if (raw === null || raw === undefined) return null;
  if (type === "text") return raw instanceof Date ? fmtDate(raw) : String(raw);
  if (type === "date") {
    if (raw instanceof Date) return isNaN(raw.getTime()) ? null : fmtDate(raw);
    return String(raw);
  }
  const n = Number(raw);
  if (Number.isNaN(n)) return null;
  return type === "int" ? Math.round(n) : n;
};

/* ======================================================
   POST /api/rawdata/import-excel   (multipart: file)
   If the same ID already exists in the DB, the old record is
   replaced (no duplicates across uploads).
====================================================== */
exports.importExcel = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: "Excel file is required" });
    }
    await ensureTable();

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(req.file.buffer);
    const ws = wb.worksheets[0];
    if (!ws) return res.status(400).json({ success: false, message: "No worksheet found in the Excel file" });

    // header row -> column mapping (column order / extra columns do not matter)
    const map = {};
    ws.getRow(1).eachCell((cell, col) => {
      const def = HEADER_LOOKUP[norm(cellValue(cell))];
      if (def) map[col] = def;
    });
    const found = Object.values(map).map((d) => d.key);
    const missing = COLUMNS.filter((c) => !found.includes(c.key)).map((c) => c.header);
    if (!found.includes("ext_id") || !found.includes("domain")) {
      return res.status(400).json({
        success: false,
        message: "This does not look like an Ecometrix raw file. Missing columns: " + missing.join(", "),
      });
    }

    const fileName = req.file.originalname;
    const records = [];
    ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rowNumber === 1) return;
      const rec = {};
      let hasData = false;
      Object.entries(map).forEach(([col, def]) => {
        const val = clean(cellValue(row.getCell(Number(col))), def.type);
        rec[def.key] = val;
        if (val !== null) hasData = true;
      });
      if (hasData) records.push(rec);
    });

    if (!records.length) {
      return res.status(400).json({ success: false, message: "No data rows found in the Excel file" });
    }

    // Remove old records with the same ID (replace behaviour)
    const ids = [...new Set(records.map((r) => r.ext_id).filter((x) => x !== null))];
    let replaced = 0;
    for (let i = 0; i < ids.length; i += 1000) {
      const chunk = ids.slice(i, i + 1000);
      const ph = chunk.map(() => "?").join(",");
      const r = await q(`DELETE FROM raw_data WHERE ext_id IN (${ph})`, chunk);
      replaced += r.affectedRows || 0;
    }

    // Bulk insert (500 rows / query)
    const keys = COLUMNS.map((c) => c.key);
    const BATCH = 500;
    for (let i = 0; i < records.length; i += BATCH) {
      const part = records.slice(i, i + BATCH);
      const params = [];
      const rowsSql = part.map((rec) => {
        params.push(fileName);
        keys.forEach((k) => params.push(rec[k] === undefined ? null : rec[k]));
        return "(" + new Array(keys.length + 1).fill("?").join(",") + ")";
      });
      // ON CONFLICT DO NOTHING: the db wrapper then does not append RETURNING id
      await q(
        `INSERT INTO raw_data (file_name, ${keys.join(",")}) VALUES ${rowsSql.join(",")} ON CONFLICT DO NOTHING`,
        params
      );
    }

    res.json({
      success: true,
      message: "Import successful",
      fileName,
      inserted: records.length,
      replaced,
      missingColumns: missing,
    });
  } catch (err) {
    console.error("Raw data import error:", err);
    res.status(500).json({ success: false, message: err.message || "Import failed" });
  }
};

/* GET /api/rawdata/files  -> uploaded file list */
exports.getFiles = async (req, res) => {
  try {
    await ensureTable();
    const rows = await q(
      `SELECT file_name, COUNT(*) AS total_rows, MAX(created_at) AS uploaded_at
         FROM raw_data GROUP BY file_name ORDER BY MAX(created_at) DESC`
    );
    res.json({
      success: true,
      data: rows.map((r) => ({
        file_name: r.file_name,
        total_rows: Number(r.total_rows),
        uploaded_at: r.uploaded_at,
      })),
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/* DELETE /api/rawdata/file/:fileName */
exports.deleteFile = async (req, res) => {
  try {
    await ensureTable();
    const r = await q(`DELETE FROM raw_data WHERE file_name = ?`, [req.params.fileName]);
    res.json({ success: true, deletedCount: r.affectedRows || 0 });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/* GET /api/rawdata/domains  -> domain dropdown */
exports.getDomains = async (req, res) => {
  try {
    await ensureTable();
    const rows = await q(
      `SELECT domain, COUNT(*) AS total FROM raw_data
        WHERE domain IS NOT NULL AND domain <> '' GROUP BY domain ORDER BY domain`
    );
    res.json({
      success: true,
      data: rows.map((r) => ({ domain: r.domain, total: Number(r.total) })),
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/* shared query for report + export */
const fetchRows = async (domain) => {
  await ensureTable();
  const cols = COLUMNS.map((c) => c.key).join(", ");
  const hasDomain = domain && domain !== "ALL";
  return q(
    `SELECT ${cols} FROM raw_data ${hasDomain ? "WHERE domain = ?" : ""} ORDER BY id ASC`,
    hasDomain ? [domain] : []
  );
};

/* GET /api/rawdata?domain=JPA|ALL  -> table data + column list */
exports.getRawData = async (req, res) => {
  try {
    const rows = await fetchRows(req.query.domain);
    res.json({
      success: true,
      columns: COLUMNS.map(({ header, key }) => ({ header, key })),
      total: rows.length,
      data: rows,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/* GET /api/rawdata/export/excel?domain=JPA|ALL  -> .xlsx download */
exports.exportExcel = async (req, res) => {
  try {
    const domain = req.query.domain;
    const rows = await fetchRows(domain);

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Raw Data Report");
    ws.columns = COLUMNS.map((c) => ({
      header: c.header,
      key: c.key,
      width: Math.max(14, c.header.length + 4),
    }));
    rows.forEach((r) => {
      const o = {};
      COLUMNS.forEach((c) => {
        const v = r[c.key];
        o[c.key] = v === null || v === undefined ? "" : c.type === "num" || c.type === "int" ? Number(v) : v;
      });
      ws.addRow(o);
    });

    const head = ws.getRow(1);
    head.font = { bold: true, color: { argb: "FFFFFFFF" } };
    head.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    head.height = 30;
    head.eachCell((c) => {
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E3A8A" } };
      c.border = { bottom: { style: "thin", color: { argb: "FF93C5FD" } } };
    });
    ws.views = [{ state: "frozen", ySplit: 1 }];
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: COLUMNS.length } };

    const label = !domain || domain === "ALL" ? "All_Domains" : String(domain).replace(/[^\w-]+/g, "_");
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader("Content-Disposition", `attachment; filename="Raw_Data_Report_${label}.xlsx"`);
    await wb.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error("Raw data export error:", err);
    if (!res.headersSent) res.status(500).json({ success: false, message: err.message });
  }
};
