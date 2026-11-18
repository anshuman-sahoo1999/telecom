const crypto = require("crypto");
const ExcelJS = require("exceljs");
const db = require("../config/db");

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

const KEYS = COLUMNS.map((c) => c.key);
// shown as whole-number % in the Excel export (value stays numeric, e.g. 0.84 -> 84%)
const PERCENT_KEYS = ["otp", "final_otp", "qc_rating", "no_of_returns", "final_no_of_returns"];
const REQUIRED_HEADERS = ["ID", "Domain"];

const norm = (s) => String(s === null || s === undefined ? "" : s).toLowerCase().replace(/[^a-z0-9]/g, "");
const HEADER_LOOKUP = Object.fromEntries(COLUMNS.map((c) => [norm(c.header), c]));

/* ---------- promise wrapper over db.query(sql, params, cb) ---------- */
const q = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.query(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)));
  });

/* ---------- table creation (once per server instance) ---------- */
let tableReady = null;
const ensureTable = () => {
  if (!tableReady) {
    tableReady = (async () => {
      await q(`
        CREATE TABLE IF NOT EXISTS raw_data (
          id SERIAL PRIMARY KEY,
          file_name TEXT NOT NULL,
          import_batch TEXT,
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
      await q(`ALTER TABLE raw_data ADD COLUMN IF NOT EXISTS import_batch TEXT`);
      await q(`CREATE INDEX IF NOT EXISTS idx_raw_data_domain ON raw_data (domain)`);
      await q(`CREATE INDEX IF NOT EXISTS idx_raw_data_file ON raw_data (file_name)`);
      await q(`CREATE INDEX IF NOT EXISTS idx_raw_data_ext_id ON raw_data (ext_id)`);
    })().catch((e) => {
      tableReady = null; // retry on the next request
      throw e;
    });
  }
  return tableReady;
};

/* ---------- cell helpers ---------- */
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
    else if (v.result !== undefined) v = v.result; // formula
    else if (v.text !== undefined) v = v.text; // hyperlink
    else return null; // error cell etc.
  }
  if (v instanceof Date) return v;
  if (v && typeof v === "object") return null;
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
  const n = raw instanceof Date ? NaN : Number(raw);
  if (Number.isNaN(n)) return null; // e.g. "N/A" in a numeric column
  return type === "int" ? Math.round(n) : n;
};

/* DB row -> API row (NUMERIC/BIGINT come back as strings from pg) */
const toApiRow = (row) => {
  const out = {};
  COLUMNS.forEach((c) => {
    const v = row[c.key];
    if (v === null || v === undefined) out[c.key] = null;
    else if (c.type === "int" || c.type === "num") out[c.key] = Number(v);
    else out[c.key] = v;
  });
  return out;
};

/* ======================================================
   POST /api/rawdata/import-excel      (multipart field: "file")

   - Header names are matched by name, so column order / extra
     columns in the Excel do not matter.
   - Rows are inserted first under a new batch id; only after
     that succeeds, older rows with the same ID are removed.
     If anything fails, the new rows are rolled back and the
     existing data stays untouched.
====================================================== */
exports.importExcel = async (req, res) => {
  let batch = null;
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: "Excel file is required" });
    }
    if (!/\.(xlsx|xlsm)$/i.test(req.file.originalname || "")) {
      return res.status(400).json({ success: false, message: "Only .xlsx files are supported" });
    }
    await ensureTable();

    const wb = new ExcelJS.Workbook();
    try {
      await wb.xlsx.load(req.file.buffer);
    } catch (e) {
      return res.status(400).json({ success: false, message: "The file could not be read. It may be corrupted." });
    }
    const ws = wb.worksheets[0];
    if (!ws) {
      return res.status(400).json({ success: false, message: "No worksheet found in the Excel file" });
    }

    // header row -> column definition
    const map = {};
    ws.getRow(1).eachCell({ includeEmpty: false }, (cell, col) => {
      const def = HEADER_LOOKUP[norm(cellValue(cell))];
      if (def && !Object.values(map).includes(def)) map[col] = def;
    });
    const found = Object.values(map).map((d) => d.key);
    const missing = COLUMNS.filter((c) => !found.includes(c.key)).map((c) => c.header);
    if (REQUIRED_HEADERS.some((h) => missing.includes(h))) {
      return res.status(400).json({
        success: false,
        message: "This does not look like an Ecometrix raw file. Missing columns: " + missing.join(", "),
      });
    }

    // data rows
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

    const fileName = req.file.originalname;
    batch = crypto.randomUUID();

    // 1) insert the new rows (500 rows per query)
    const BATCH = 500;
    for (let i = 0; i < records.length; i += BATCH) {
      const part = records.slice(i, i + BATCH);
      const params = [];
      const valuesSql = part.map((rec) => {
        params.push(fileName, batch);
        KEYS.forEach((k) => params.push(rec[k] === undefined ? null : rec[k]));
        return "(" + new Array(KEYS.length + 2).fill("?").join(",") + ")";
      });
      // ON CONFLICT DO NOTHING keeps the db wrapper from appending RETURNING id
      await q(
        `INSERT INTO raw_data (file_name, import_batch, ${KEYS.join(",")}) VALUES ${valuesSql.join(",")} ON CONFLICT DO NOTHING`,
        params
      );
    }

    // 2) replace: remove OLD rows that have the same ID
    const ids = [...new Set(records.map((r) => r.ext_id).filter((x) => x !== null))];
    let replaced = 0;
    for (let i = 0; i < ids.length; i += 1000) {
      const chunk = ids.slice(i, i + 1000);
      const ph = chunk.map(() => "?").join(",");
      const r = await q(
        `DELETE FROM raw_data WHERE ext_id IN (${ph}) AND (import_batch IS NULL OR import_batch <> ?)`,
        [...chunk, batch]
      );
      replaced += r.affectedRows || 0;
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
    if (batch) {
      // roll back the rows of this import
      try {
        await q(`DELETE FROM raw_data WHERE import_batch = ?`, [batch]);
      } catch (e) {
        console.error("Raw data rollback error:", e.message);
      }
    }
    if (!res.headersSent) {
      res.status(500).json({ success: false, message: err.message || "Import failed" });
    }
  }
};

/* GET /api/rawdata/files  ->  imported file list */
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

/* GET /api/rawdata/file/:fileName  ->  all rows of one imported file (View) */
exports.getFileData = async (req, res) => {
  try {
    await ensureTable();
    const rows = await q(
      `SELECT ${KEYS.join(", ")} FROM raw_data WHERE file_name = ? ORDER BY id ASC`,
      [req.params.fileName]
    );
    res.json({
      success: true,
      columns: COLUMNS.map(({ header, key }) => ({ header, key })),
      total: rows.length,
      data: rows.map(toApiRow),
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

/* GET /api/rawdata/domains  ->  domain dropdown values */
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

/* shared by report + export */
const fetchRows = async (domain) => {
  await ensureTable();
  const hasDomain = domain && domain !== "ALL";
  const rows = await q(
    `SELECT ${KEYS.join(", ")} FROM raw_data ${hasDomain ? "WHERE domain = ?" : ""} ORDER BY id ASC`,
    hasDomain ? [String(domain)] : []
  );
  return rows.map(toApiRow);
};

/* GET /api/rawdata?domain=JPA|ALL  ->  columns + rows */
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

/* GET /api/rawdata/export/excel?domain=JPA|ALL  ->  .xlsx download */
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
        o[c.key] = r[c.key] === null || r[c.key] === undefined ? "" : r[c.key];
      });
      ws.addRow(o);
    });

    // percent columns -> "0%" number format
    const pctCols = COLUMNS.map((c, i) => (PERCENT_KEYS.includes(c.key) ? i + 1 : 0)).filter(Boolean);
    ws.eachRow((row, n) => {
      if (n === 1) return;
      pctCols.forEach((ci) => {
        row.getCell(ci).numFmt = "0%";
      });
    });

    const head = ws.getRow(1);
    head.font = { bold: true, color: { argb: "FFFFFFFF" } };
    head.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    head.height = 30;
    head.eachCell((c) => {
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E3A8A" } };
    });
    ws.views = [{ state: "frozen", ySplit: 1 }];
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: COLUMNS.length } };

    const label = !domain || domain === "ALL" ? "All_Domains" : String(domain).replace(/[^\w-]+/g, "_");
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="Raw_Data_Report_${label}.xlsx"`);
    await wb.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error("Raw data export error:", err);
    if (!res.headersSent) res.status(500).json({ success: false, message: err.message });
  }
};
