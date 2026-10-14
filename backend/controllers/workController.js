const db = require("../config/db");
const ExcelJS = require("exceljs");
const fs = require("fs");
const path = require("path");

const stateData = require("../stateCodes");
const countyData = require("../counties.json");

const clean = (v) => {
  if (v === null || v === undefined || v === false) return "";
  return v.toString().trim();
};

const normalize = (v) => clean(v).toUpperCase();

const query = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.query(sql, params, (err, result) => (err ? reject(err) : resolve(result)));
  });

const isRealJobId = (v) => {
  const s = clean(v);
  return s !== "" && s !== "-";
};

/* ======================================
   DOMAIN-SCOPED HELPERS (NEW)
   Same Job ID alag-alag domain (ASE / PERMIT / F2 / PLA ...) me ho sakta hai.
   Isliye identity hamesha (domain + job id) se hogi, sirf job id se nahi.
====================================== */
const domainKey = (v) => clean(v).toUpperCase();
const jobKey = (domain, jobId) => `${domainKey(domain)}|${clean(jobId).toLowerCase()}`;

// job_creation me (jobId + domain) se row dhoondhne ke liye WHERE part
const jcScope = (jobId, domain) => {
  const d = domainKey(domain);
  if (!d) {
    return { where: "TRIM(jobId) = TRIM(?)", params: [jobId] };
  }
  return {
    where:
      "TRIM(jobId) = TRIM(?) AND (UPPER(TRIM(COALESCE(domain,''))) = ? OR TRIM(COALESCE(domain,'')) = '')",
    params: [jobId, d]
  };
};

const safeParseJson = (val, fallback) => {
  if (val === null || val === undefined) return fallback;
  if (typeof val === "object") return val;
  if (typeof val === "string") {
    try { return JSON.parse(val); } catch { return fallback; }
  }
  return fallback;
};
const parseMonthsInput = (months) => {
  let arr = [];
  if (Array.isArray(months)) {
    arr = months;
  } else if (typeof months === "string" && months.trim() !== "") {
    try {
      const temp = JSON.parse(months);
      arr = Array.isArray(temp) ? temp : [months.trim()];
    } catch {
      arr = [months.trim()];
    }
  }
  return cleanMonthArray(arr);
};

// items: [{ jobId, domain }] (purana format: sirf jobId strings bhi chalega)
const removeOrphanJobCreation = async (items) => {
  const seen = new Set();
  const pairs = [];
  (items || []).forEach((it) => {
    const isObj = it && typeof it === "object";
    const jobId = clean(isObj ? it.jobId : it);
    const domain = domainKey(isObj ? it.domain : "");
    if (!isRealJobId(jobId)) return;
    const k = jobKey(domain, jobId);
    if (seen.has(k)) return;
    seen.add(k);
    pairs.push({ jobId, domain });
  });
  if (pairs.length === 0) return;

  for (const { jobId, domain } of pairs) {
    if (domain) {
      const stillUsed = await query(
        "SELECT id FROM work_updates WHERE TRIM(job_id) = TRIM(?) AND UPPER(TRIM(domain)) = ? LIMIT 1",
        [jobId, domain]
      );
      if (stillUsed && stillUsed.length > 0) continue;

      await query(
        "DELETE FROM job_creation WHERE TRIM(jobId) = TRIM(?) AND UPPER(TRIM(COALESCE(domain,''))) = ?",
        [jobId, domain]
      );

      // purani blank-domain row tabhi hatao jab is job id ko koi bhi domain use nahi kar raha
      const anyUse = await query(
        "SELECT id FROM work_updates WHERE TRIM(job_id) = TRIM(?) LIMIT 1",
        [jobId]
      );
      if (!anyUse || anyUse.length === 0) {
        await query(
          "DELETE FROM job_creation WHERE TRIM(jobId) = TRIM(?) AND TRIM(COALESCE(domain,'')) = ''",
          [jobId]
        );
      }
    } else {
      const stillUsed = await query(
        "SELECT id FROM work_updates WHERE TRIM(job_id) = TRIM(?) LIMIT 1",
        [jobId]
      );
      if (stillUsed && stillUsed.length > 0) continue;
      await query("DELETE FROM job_creation WHERE TRIM(jobId) = TRIM(?)", [jobId]);
    }
  }
};

const unwrapCell = (val) => {
  if (val === null || val === undefined) return val;
  if (val instanceof Date) return val;
  if (typeof val === "object") {
    if (Array.isArray(val.richText)) {
      return val.richText.map((t) => (t && t.text ? t.text : "")).join("");
    }
    if (val.text !== undefined) return unwrapCell(val.text);
    if (val.result !== undefined) return unwrapCell(val.result);
    if (val.error) return "";
    return val;
  }
  return val;
};

const parseExcelDate = (value) => {
  if (!value) return null;

  let strVal = value.toString().trim();
  if (/^\d{2}-\d{2}-\d{4}$/.test(strVal)) return strVal;
  const isoMatch = strVal.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    return `${month}-${day}-${year}`;
  }

  let d;
  let useUTC = false;

  if (value instanceof Date) {
    d = value;
    useUTC = true;
  } else if (typeof value === "number" || /^\d{5}(\.\d+)?$/.test(strVal)) {
    d = new Date(Math.round((Number(value) - (25567 + 2)) * 86400 * 1000));
    useUTC = true;
  } else if (/^\d+(\.\d+)?$/.test(strVal)) {
    return strVal;
  } else {
    d = new Date(strVal);
  }

  if (!d || isNaN(d.getTime())) return strVal;

  const year = useUTC ? d.getUTCFullYear() : d.getFullYear();
  const month = String((useUTC ? d.getUTCMonth() : d.getMonth()) + 1).padStart(2, '0');
  const day = String(useUTC ? d.getUTCDate() : d.getDate()).padStart(2, '0');

  return `${month}-${day}-${year}`;
};

const formatDateToMMDDYYYY = (dateVal) => {
  if (!dateVal) return "";
  let strVal = dateVal.toString().trim();

  const isoMatch = strVal.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    return `${month}-${day}-${year}`;
  }

  return parseExcelDate(strVal) || strVal;
};

const isZeroValue = (v) => {
  if (v === null || v === undefined || v === false) return false;
  const s = v.toString().trim().replace(/%$/, "").trim();
  return s !== "" && !isNaN(Number(s)) && Number(s) === 0;
};

const formatPercentage = (value) => {
  if (value === null || value === undefined || value === "") return "";
  let str = value.toString().trim();
  if (str === "") return "";
  if (isZeroValue(str)) return "";
  if (str.endsWith("%")) return str;

  let num = Number(str);
  if (!isNaN(num)) {
    if (num > 0 && num <= 1) {
      return `${Number((num * 100).toFixed(2))}%`;
    } else {
      return `${num}%`;
    }
  }
  return str;
};

const cleanOtp = (v) => formatPercentage(v);
const blankIfZero = (v) => (isZeroValue(v) ? "" : v);
const getMonthValue = (row) => {
  for (const key of Object.keys(row)) {
    const k = key.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (k === "month" || k === "monthofservice" || k === "months") {
      return row[key];
    }
  }
  return null;
};

const monthNames = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
];
const monthNameToIndex = monthNames.reduce((acc, m, idx) => {
  acc[m.toLowerCase()] = idx;
  return acc;
}, {});
monthNameToIndex["sept"] = 8; // Excel me "Sept, 2026" likha hai
const fullMonthNameToIndex = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december"
].reduce((acc, m, idx) => {
  acc[m] = idx;
  return acc;
}, {});

// Jab month me sirf naam ho (jaise Lumen sheet: "Feb", "May") tab ye saal lagega.
// Import ke time Excel ke Month column se apne aap set hota hai.
let monthDefaultYear = new Date().getFullYear();

const formatMonth = (value) => {
  if (!value) return null;

  if (value instanceof Date) {
    if (isNaN(value.getTime())) return null;
    return `${monthNames[value.getUTCMonth()]},${value.getUTCFullYear()}`;
  }

  if (typeof value === "number" && value > 20000) {
    const serialDate = new Date(Math.round((value - 25569) * 86400 * 1000));
    if (!isNaN(serialDate.getTime())) {
      return `${monthNames[serialDate.getUTCMonth()]},${serialDate.getUTCFullYear()}`;
    }
  }

  let strVal = String(value).trim();
  if (!strVal) return null;
  if (/^[A-Za-z]{3},\d{4}$/.test(strVal)) return strVal;
  let m = strVal.match(/^(\d{4})-(\d{1,2})(?:-\d{1,2})?$/);
  if (m) {
    const year = m[1];
    const monthIdx = Number(m[2]) - 1;
    if (monthIdx >= 0 && monthIdx <= 11) {
      return `${monthNames[monthIdx]},${year}`;
    }
  }

  // "MM-YYYY" or "MM/YYYY"
  m = strVal.match(/^(\d{1,2})[-/](\d{4})$/);
  if (m) {
    const monthIdx = Number(m[1]) - 1;
    if (monthIdx >= 0 && monthIdx <= 11) {
      return `${monthNames[monthIdx]},${m[2]}`;
    }
  }

  m = strVal.match(/^([A-Za-z]+)[\s\-/,]+(\d{4})$/);
  if (m) {
    const key = m[1].toLowerCase();
    const monthIdx = monthNameToIndex[key] !== undefined ? monthNameToIndex[key] : fullMonthNameToIndex[key];
    if (monthIdx !== undefined) {
      return `${monthNames[monthIdx]},${m[2]}`;
    }
  }

  // sirf month ka naam (bina saal)
  m = strVal.match(/^([A-Za-z]+)\.?$/);
  if (m) {
    const key = m[1].toLowerCase();
    const monthIdx = monthNameToIndex[key] !== undefined ? monthNameToIndex[key] : fullMonthNameToIndex[key];
    if (monthIdx !== undefined) {
      return `${monthNames[monthIdx]},${monthDefaultYear}`;
    }
  }

  const d = new Date(strVal);
  if (!isNaN(d.getTime())) {
    return `${monthNames[d.getMonth()]},${d.getFullYear()}`;
  }
  return strVal;
};

const cleanMonthArray = (arr) => {
  if (!Array.isArray(arr)) return [];
  return arr.map(m => formatMonth(m)).filter(Boolean);
};

const extractUOM = (row) => {
  const uom = {};

  const systemColumns = [
    "sow", "job type", "job_type", "state", "market", "region", "county",
    "month", "month of service", "months", "otp", "amdocs qc", "amdocs_qc", 
    "internal qc", "internal_qc", "job id", "job_id", "jobid", 
    "receive date", "received date", "receive_date", "received_date",
    "ecd date", "ecd_date", "ecd-date", "ecddate", "ecd", "submission date", "submission_date", 
    "current status", "current_status", "production engineers", "production_engineers", 
    "qc engineers", "qc_engineers", "sl no", "sl.no", "sl", "sl.", "sl_no", "slno", 
    "file name", "file_name", "jobs delivered", "jobs_delivered", "domain", "status"
  ];

  Object.keys(row).forEach((key) => {
    if (!key) return;
    
    const compressedKey = key.toString().toLowerCase().replace(/[^a-z0-9]/g, "");
    
    const isSystemCol = systemColumns.some(sys => {
      const cleanSys = sys.toLowerCase().replace(/[^a-z0-9]/g, "");
      return compressedKey === cleanSys;
    });

    if (!isSystemCol) {
      let value = unwrapCell(row[key]);
      if (value !== "" && value !== null && value !== undefined && !(value instanceof Date) && typeof value !== "object") {
        const cleanKeyName = key
          .toString()
          .toLowerCase()
          .replace(/\./g, "")
          .replace(/:/g, "")
          .replace(/\(.*\)/g, "")
          .replace(/\*/g, "")
          .replace(/[\s_]+/g, " ")
          .trim();
        uom[cleanKeyName] = value;
      }
    }
  });

  return uom;
};

const findValueInRow = (row, possibleKeys) => {
  for (const key of Object.keys(row)) {
    const compressedKey = key.toLowerCase().replace(/[^a-z0-9]/g, "");
    for (const pk of possibleKeys) {
      const compressedPk = pk.toLowerCase().replace(/[^a-z0-9]/g, "");
      if (compressedKey === compressedPk) {
        const val = unwrapCell(row[key]);
        if (val === null || val === undefined) return "";
        return val;
      }
    }
  }
  return "";
};

const getStateNameFromCode = (code) => {
  if (!code) return "";
  const input = code.toString().trim().toUpperCase();

  for (const stateName in stateData) {
    if (stateData[stateName].code.toUpperCase() === input) {
      return stateName;
    }
  }

  return "";
};

const getRegionFromState = (state) => {
  if (!state) return "";
  const found = stateData[state];
  return found ? found.region : "";
};

const getStateFromCounty = (countyName) => {
  if (!countyName) return { county: "", state: "" };

  const input = countyName.toString().toLowerCase().replace("county", "").trim();

  for (const item of countyData) {
    const geo = item.GeographicAreaName;
    if (!geo) continue;

    const parts = geo.split(",");
    const countyPart = parts[0]?.replace("County", "").trim().toLowerCase();
    const statePart = parts[1]?.trim();

    if (countyPart === input) {
      return {
        county: parts[0]?.replace("County", "").trim(),
        state: statePart
      };
    }
  }

  return { county: countyName, state: "" };
};

const helperSyncToJobCreation = (data) => {
  return new Promise((resolve) => {
    const newJobId = clean(data.cleanJobId);
    if (!newJobId || newJobId === "-") return resolve();
    const jcDomain = domainKey(data.domain);
    const cleanSingleM = formatMonth(data.month);
    data = {
      ...data,
      otp: cleanOtp(data.otp),
      amdocsQc: blankIfZero(data.amdocsQc),
      internalQc: blankIfZero(data.internalQc)
    };

    // FIX: job_creation me bhi (jobId + domain) se match hoga, sirf jobId se nahi
    let checkSql;
    let checkParams;
    if (jcDomain) {
      checkSql = `
        SELECT id, jobId FROM job_creation 
        WHERE TRIM(jobId) = TRIM(?)
          AND (UPPER(TRIM(COALESCE(domain,''))) = ? OR TRIM(COALESCE(domain,'')) = '')
        ORDER BY (UPPER(TRIM(COALESCE(domain,''))) = ?) DESC
        LIMIT 1
      `;
      checkParams = [newJobId, jcDomain, jcDomain];
    } else {
      checkSql = `
        SELECT id, jobId FROM job_creation 
        WHERE TRIM(jobId) = TRIM(?) 
        LIMIT 1
      `;
      checkParams = [newJobId];
    }

    db.query(checkSql, checkParams, (err, rows) => {
      if (err) {
        console.error("Error checking job_creation:", err.message);
        return resolve();
      }

      if (rows && rows.length > 0) {
        const targetId = rows[0].id;
        const updateSql = `
          UPDATE job_creation
          SET domain = COALESCE(NULLIF(?, ''), domain),
              market = COALESCE(NULLIF(?, ''), market),
              month = COALESCE(?, month),
              receiveDate = COALESCE(?, receiveDate),
              ecdDate = COALESCE(?, ecdDate),
              submissionDate = COALESCE(?, submissionDate),
              otp = COALESCE(NULLIF(?, ''), otp),
              amdocsQc = COALESCE(NULLIF(?, ''), amdocsQc),
              internalQc = COALESCE(NULLIF(?, ''), internalQc),
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `;
        db.query(updateSql, [
          data.domain,
          data.market,
          cleanSingleM,
          data.receiveDate,
          data.ecdDate,
          data.submissionDate,
          data.otp,
          data.amdocsQc,
          data.internalQc,
          targetId
        ], (upErr) => {
          if (upErr) console.error("Error updating job_creation:", upErr.message);
          resolve();
        });
      } else {
        const insertSql = `
          INSERT INTO job_creation (domain, market, jobId, month, receiveDate, ecdDate, submissionDate, otp, amdocsQc, internalQc)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
        db.query(insertSql, [
          data.domain,
          data.market,
          newJobId,
          cleanSingleM,
          data.receiveDate,
          data.ecdDate,
          data.submissionDate,
          data.otp,
          data.amdocsQc,
          data.internalQc
        ], (inErr) => {
          if (inErr) console.error("Error inserting job_creation:", inErr.message);
          resolve();
        });
      }
    });
  });
};

/* ======================================
   FAST IMPORT HELPERS (NEW)
====================================== */

// Excel row -> clean record (purana logic as-is, bas ek jagah)
const buildRecord = (row, sheetName) => {
  const domain = normalize(sheetName);
  const rawLocation =
    clean(findValueInRow(row, ["State"])) ||
    clean(findValueInRow(row, ["Market"])) ||
    clean(findValueInRow(row, ["Region"]));

  let state = "", county = "", region = "";
  const formattedLocation = rawLocation.toLowerCase().split(" ")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");

  const stateFromCode = getStateNameFromCode(formattedLocation);
  if (stateFromCode) {
    state = stateFromCode;
    region = getRegionFromState(state);
  } else {
    const matchedState = Object.keys(stateData).find(
      (s) => s.toLowerCase() === formattedLocation.toLowerCase()
    );
    if (matchedState) {
      state = matchedState;
      region = getRegionFromState(state);
    }
  }
  if (!state) {
    const c = getStateFromCounty(formattedLocation);
    if (c.state) {
      county = c.county;
      state = c.state;
      region = getRegionFromState(state);
    }
  }
  if (!region) region = clean(findValueInRow(row, ["Region"]));

  return {
    domain,
    sow: clean(findValueInRow(row, ["SOW"])),
    jobType: normalize(findValueInRow(row, ["Job Type", "job_type", "job-type"])),
    jobId: clean(findValueInRow(row, ["Job ID", "job_id", "jobId", "job-id"])),
    otp: cleanOtp(findValueInRow(row, ["OTP"])),
    status: clean(findValueInRow(row, ["Current Status", "current_status", "current-status"])),
    prod: clean(findValueInRow(row, ["Production Engineers", "production_engineers"])),
    qc: clean(findValueInRow(row, ["QC Engineers", "qc_engineers"])),
    amdocs: formatPercentage(findValueInRow(row, ["Amdocs QC", "amdocs_qc"])),
    internal: formatPercentage(findValueInRow(row, ["Internal QC", "internal_qc"])),
    recv: parseExcelDate(findValueInRow(row, ["Receive Date", "receive_date", "receive-date", "received date", "received_date"])),
    ecd: parseExcelDate(findValueInRow(row, ["ECD Date", "ecd_date", "ecd-date", "ecddate", "ECD"])),
    sub: parseExcelDate(findValueInRow(row, ["Submission Date", "submission_date", "submission-date"])),
    state, county, region,
    month: formatMonth(getMonthValue(row)),
    uom: extractUOM(row)
  };
};

const chunk = (arr, n) => {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
};
const keep = (oldV, newV) => (clean(newV) !== "" ? newV : oldV);   // COALESCE(NULLIF(new,''), old)
const keepDate = (oldV, newV) => (newV ? newV : oldV);              // COALESCE(new, old)

const importExcel = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: "Excel file required" });

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(req.file.buffer);

    let failed = 0;
    let totalRows = 0;
    monthDefaultYear = new Date().getFullYear();

    /* ---------- 1) Excel parse + record banao ---------- */
    const records = [];
    for (const worksheet of workbook.worksheets) {
      const rows = [];
      const headers = [];
      const headerRow = worksheet.getRow(1);
      const totalColumns = headerRow.cellCount || worksheet.columnCount;

      for (let col = 1; col <= totalColumns; col++) {
        const cellVal = unwrapCell(headerRow.getCell(col).value);
        headers[col] = cellVal ? cellVal.toString().trim() : "";
      }

      worksheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return;
        const obj = {};
        for (let col = 1; col <= totalColumns; col++) {
          if (headers[col]) obj[headers[col]] = unwrapCell(row.getCell(col).value);
        }
        const hasAny = Object.values(obj).some(
          (v) => v !== null && v !== undefined && v.toString().trim() !== ""
        );
        if (hasAny) rows.push(obj);
      });

      totalRows += rows.length;

      const yearHit = rows.map((r) => {
        const v = getMonthValue(r);
        if (v instanceof Date) return v.getUTCFullYear();
        const mm = String(v === null || v === undefined ? "" : v).match(/(\d{4})/);
        return mm ? Number(mm[1]) : null;
      }).find(Boolean);
      if (yearHit) monthDefaultYear = yearHit;

      for (const r of rows) {
        try { records.push(buildRecord(r, worksheet.name)); }
        catch { failed++; }
      }
    }

    /* ---------- 2) DB ek baar load (2 queries total) ---------- */
    const existingWork = await query(
      "SELECT id, job_id, domain, months, uom FROM work_updates WHERE job_id IS NOT NULL AND TRIM(job_id) <> ''"
    );
    const workState = new Map(); // key -> state
    existingWork.forEach((r) => {
      workState.set(jobKey(r.domain, r.job_id), {
        id: r.id,
        months: (() => { const m = safeParseJson(r.months, []); return Array.isArray(m) ? m : (m ? [m] : []); })(),
        uom: (() => { const u = safeParseJson(r.uom, {}); return u && typeof u === "object" && !Array.isArray(u) ? u : {}; })(),
        patch: null
      });
    });

    const existingJc = await query("SELECT id, jobId, domain FROM job_creation");
    const jcExact = new Map();
    const jcBlank = new Map();
    existingJc.forEach((r) => {
      if (!isRealJobId(r.jobId)) return;
      if (domainKey(r.domain)) jcExact.set(jobKey(r.domain, r.jobId), r.id);
      else jcBlank.set(clean(r.jobId).toLowerCase(), r.id);
    });

    /* ---------- 3) Memory me merge (same job+domain ki duplicate rows bhi merge) ---------- */
    const newRows = [];            // bina job id wali rows -> seedhi insert
    const pendingNew = new Map();  // key -> naya record (insert hone wala)
    const jcState = new Map();     // key -> job_creation final state

    for (const rec of records) {
      const realId = isRealJobId(rec.jobId);

      if (!realId) { newRows.push(rec); continue; }

      const key = jobKey(rec.domain, rec.jobId);

      // ---- work_updates ----
      let st = workState.get(key);
      if (st) {
        if (rec.month && !st.months.includes(rec.month)) st.months.push(rec.month);
        st.uom = { ...st.uom, ...rec.uom };
        const p = st.patch || (st.patch = {});
        p.otp = keep(p.otp, rec.otp);
        p.status = keep(p.status, rec.status);
        p.prod = keep(p.prod, rec.prod);
        p.qc = keep(p.qc, rec.qc);
        p.amdocs = keep(p.amdocs, rec.amdocs);
        p.internal = keep(p.internal, rec.internal);
        p.recv = keepDate(p.recv, rec.recv);
        p.ecd = keepDate(p.ecd, rec.ecd);
        p.sub = keepDate(p.sub, rec.sub);
      } else {
        const p = pendingNew.get(key);
        if (p) {
          if (rec.month && !p.months.includes(rec.month)) p.months.push(rec.month);
          p.uom = { ...p.uom, ...rec.uom };
          p.otp = keep(p.otp, rec.otp);
          p.status = keep(p.status, rec.status);
          p.prod = keep(p.prod, rec.prod);
          p.qc = keep(p.qc, rec.qc);
          p.amdocs = keep(p.amdocs, rec.amdocs);
          p.internal = keep(p.internal, rec.internal);
          p.recv = keepDate(p.recv, rec.recv);
          p.ecd = keepDate(p.ecd, rec.ecd);
          p.sub = keepDate(p.sub, rec.sub);
        } else {
          pendingNew.set(key, { ...rec, months: rec.month ? [rec.month] : [], uom: { ...rec.uom } });
        }
      }

      // ---- job_creation ----
      const market = rec.state || rec.region;
      let j = jcState.get(key);
      if (!j) {
        const id = jcExact.get(key) || jcBlank.get(rec.jobId.toLowerCase()) || null;
        j = { id, domain: rec.domain, jobId: rec.jobId, market: "", month: null,
              recv: null, ecd: null, sub: null, otp: "", amdocs: "", internal: "" };
        jcState.set(key, j);
      }
      j.market = keep(j.market, market);
      j.month = rec.month || j.month;
      j.recv = keepDate(j.recv, rec.recv);
      j.ecd = keepDate(j.ecd, rec.ecd);
      j.sub = keepDate(j.sub, rec.sub);
      j.otp = keep(j.otp, rec.otp);
      j.amdocs = keep(j.amdocs, blankIfZero(rec.amdocs));
      j.internal = keep(j.internal, blankIfZero(rec.internal));
    }

    /* ---------- 4) Bulk write ---------- */
    const fileName = req.file.originalname;
    let success = 0;

    // 4a) work_updates INSERT (500 rows ek query me)
    const toInsert = [
      ...newRows.map((r) => ({ ...r, months: r.month ? [r.month] : [] })),
      ...pendingNew.values()
    ];
    for (const part of chunk(toInsert, 500)) {
      const values = part.map((r) => [
        fileName, JSON.stringify(r.months), r.domain, r.sow, r.jobType,
        r.region, r.state, r.county, JSON.stringify(r.uom),
        r.otp, r.status, r.prod, r.qc, r.amdocs, r.internal,
        1, r.jobId || null, r.recv, r.ecd, r.sub
      ]);
      try {
        await query(
          `INSERT INTO work_updates
           (file_name, months, domain, sow, job_type, region, state, county, uom, otp, current_status, production_engineers, qc_engineers, amdocs_qc, internal_qc, jobs_delivered, job_id, receive_date, ecd_date, submission_date)
           VALUES ?`,
          [values]
        );
        success += part.length;
      } catch (e) {
        console.error("bulk insert failed:", e.message);
        failed += part.length;
      }
    }

    // 4b) work_updates UPDATE (primary key se -> fast)
    const updates = [...workState.values()].filter((s) => s.patch);
    for (const part of chunk(updates, 20)) {
      await Promise.all(part.map(async (s) => {
        const p = s.patch;
        try {
          await query(
            `UPDATE work_updates SET months = ?, uom = ?,
               otp = COALESCE(NULLIF(?, ''), otp),
               current_status = COALESCE(NULLIF(?, ''), current_status),
               production_engineers = COALESCE(NULLIF(?, ''), production_engineers),
               qc_engineers = COALESCE(NULLIF(?, ''), qc_engineers),
               amdocs_qc = COALESCE(NULLIF(?, ''), amdocs_qc),
               internal_qc = COALESCE(NULLIF(?, ''), internal_qc),
               jobs_delivered = 1,
               receive_date = COALESCE(?, receive_date),
               ecd_date = COALESCE(?, ecd_date),
               submission_date = COALESCE(?, submission_date),
               updated_at = CURRENT_TIMESTAMP
             WHERE id = ?`,
            [JSON.stringify(s.months), JSON.stringify(s.uom),
             p.otp || "", p.status || "", p.prod || "", p.qc || "",
             p.amdocs || "", p.internal || "",
             p.recv || null, p.ecd || null, p.sub || null, s.id]
          );
          success++;
        } catch (e) { failed++; }
      }));
    }

    // 4c) job_creation: naye rows bulk insert, purane id se update
    const jcAll = [...jcState.values()];
    const jcNew = jcAll.filter((j) => !j.id);
    const jcOld = jcAll.filter((j) => j.id);

    for (const part of chunk(jcNew, 500)) {
      const values = part.map((j) => [
        j.domain, j.market, j.jobId, j.month, j.recv, j.ecd, j.sub,
        j.otp, j.amdocs, j.internal
      ]);
      try {
        await query(
          `INSERT INTO job_creation (domain, market, jobId, month, receiveDate, ecdDate, submissionDate, otp, amdocsQc, internalQc) VALUES ?`,
          [values]
        );
      } catch (e) { console.error("jc bulk insert failed:", e.message); }
    }

    for (const part of chunk(jcOld, 20)) {
      await Promise.all(part.map((j) =>
        query(
          `UPDATE job_creation
           SET domain = COALESCE(NULLIF(?, ''), domain),
               market = COALESCE(NULLIF(?, ''), market),
               month = COALESCE(?, month),
               receiveDate = COALESCE(?, receiveDate),
               ecdDate = COALESCE(?, ecdDate),
               submissionDate = COALESCE(?, submissionDate),
               otp = COALESCE(NULLIF(?, ''), otp),
               amdocsQc = COALESCE(NULLIF(?, ''), amdocsQc),
               internalQc = COALESCE(NULLIF(?, ''), internalQc),
               updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`,
          [j.domain, j.market, j.month, j.recv, j.ecd, j.sub, j.otp, j.amdocs, j.internal, j.id]
        ).catch((e) => console.error("jc update failed:", e.message))
      ));
    }

    return res.json({
      message: "Excel imported successfully in proper order",
      totalRows,
      insertedOrUpdated: success,
      failed
    });
  } catch (err) {
    return res.status(500).json({ message: "Import failed", error: err.message });
  }
};

const pick = (obj, ...keys) => {
  for (const k of keys) {
    if (obj && obj[k] !== undefined) return obj[k];
  }
  return undefined;
};

const isBlank = (v) =>
  v === null || v === undefined || (typeof v === "string" && v.trim() === "");

const flatText = (v) => (Array.isArray(v) ? v.join(", ") : v);

const createWork = async (req, res) => {
  const b = req.body || {};
  const months = pick(b, "months", "month");
  const domain = pick(b, "domain");
  const sow = pick(b, "sow");
  const job_type = pick(b, "job_type", "jobType");
  const region = pick(b, "region");
  const state = pick(b, "state", "market");
  const county = pick(b, "county");
  const uom = pick(b, "uom");
  const otp = pick(b, "otp", "internalOtp");
  const current_status = pick(b, "current_status", "currentStatus");
  const production_engineers = pick(b, "production_engineers");
  const qc_engineers = pick(b, "qc_engineers");
  const internal_qc = pick(b, "internal_qc", "internalQc");
  const amdocs_qc = pick(b, "amdocs_qc", "amdocsQc");
  const job_id = pick(b, "job_id", "jobId");
  const receive_date = pick(b, "receive_date", "receiveDate", "receivedDate");
  const ecd_date = pick(b, "ecd_date", "ecdDate");
  const submission_date = pick(b, "submission_date", "submissionDate");

  const fixedDomain = normalize(domain);
  const fixedJobType = normalize(job_type);
  const cleanJobId = clean(job_id);

  const formattedInternalQc = formatPercentage(internal_qc);
  const formattedAmdocsQc = formatPercentage(amdocs_qc);

  const formattedReceiveDate = parseExcelDate(receive_date);
  const formattedEcdDate = parseExcelDate(ecd_date);
  const formattedSubmissionDate = parseExcelDate(submission_date);

  const parsedMonths = parseMonthsInput(months);
  const firstMonth = parsedMonths.length > 0 ? parsedMonths[0] : null;

  const uomObj = uom && typeof uom === "object" ? uom : safeParseJson(uom, null);
  const hasUom = uomObj && typeof uomObj === "object" && Object.keys(uomObj).length > 0;

  try {
    let existingId = null;
    if (isRealJobId(cleanJobId)) {
      // FIX: same Job ID alag domain me ho to alag row; sirf same domain me hi merge hoga
      const rows = fixedDomain
        ? await query(
            "SELECT id FROM work_updates WHERE TRIM(job_id) = TRIM(?) AND UPPER(TRIM(domain)) = ? LIMIT 1",
            [cleanJobId, fixedDomain]
          )
        : await query(
            "SELECT id FROM work_updates WHERE TRIM(job_id) = TRIM(?) LIMIT 1",
            [cleanJobId]
          );
      if (rows && rows.length > 0) existingId = rows[0].id;
    }

    let workId = existingId;

    if (existingId) {
      await query(
        `UPDATE work_updates
         SET months = COALESCE(?, months),
             domain = COALESCE(NULLIF(?, ''), domain),
             sow = COALESCE(NULLIF(?, ''), sow),
             job_type = COALESCE(NULLIF(?, ''), job_type),
             region = COALESCE(NULLIF(?, ''), region),
             state = COALESCE(NULLIF(?, ''), state),
             county = COALESCE(NULLIF(?, ''), county),
             uom = COALESCE(?, uom),
             otp = COALESCE(NULLIF(?, ''), otp),
             current_status = COALESCE(NULLIF(?, ''), current_status),
             production_engineers = COALESCE(NULLIF(?, ''), production_engineers),
             qc_engineers = COALESCE(NULLIF(?, ''), qc_engineers),
             internal_qc = COALESCE(NULLIF(?, ''), internal_qc),
             amdocs_qc = COALESCE(NULLIF(?, ''), amdocs_qc),
             jobs_delivered = 1,
             receive_date = COALESCE(?, receive_date),
             ecd_date = COALESCE(?, ecd_date),
             submission_date = COALESCE(?, submission_date),
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [
          parsedMonths.length > 0 ? JSON.stringify(parsedMonths) : null,
          fixedDomain,
          clean(flatText(sow)),
          fixedJobType,
          clean(region),
          clean(state),
          clean(county),
          hasUom ? JSON.stringify(uomObj) : null,
          cleanOtp(otp),
          clean(current_status),
          clean(flatText(production_engineers)),
          clean(flatText(qc_engineers)),
          formattedInternalQc,
          formattedAmdocsQc,
          formattedReceiveDate,
          formattedEcdDate,
          formattedSubmissionDate,
          existingId
        ]
      );
    } else {
      const result = await query(
        `INSERT INTO work_updates
         (months, domain, sow, job_type, region, state, county, uom, otp, current_status, production_engineers, qc_engineers, internal_qc, amdocs_qc, jobs_delivered, job_id, receive_date, ecd_date, submission_date)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)`,
        [
          JSON.stringify(parsedMonths),
          fixedDomain,
          clean(flatText(sow)),
          fixedJobType,
          clean(region),
          clean(state),
          clean(county),
          JSON.stringify(hasUom ? uomObj : {}),
          cleanOtp(otp),
          clean(current_status),
          clean(flatText(production_engineers)),
          clean(flatText(qc_engineers)),
          formattedInternalQc,
          formattedAmdocsQc,
          cleanJobId,
          formattedReceiveDate,
          formattedEcdDate,
          formattedSubmissionDate
        ]
      );
      workId = result.insertId;
    }

    await helperSyncToJobCreation({
      domain: fixedDomain,
      market: clean(state) || clean(region),
      cleanJobId,
      month: firstMonth,
      receiveDate: formattedReceiveDate,
      ecdDate: formattedEcdDate,
      submissionDate: formattedSubmissionDate,
      otp: cleanOtp(otp),
      amdocsQc: formattedAmdocsQc,
      internalQc: formattedInternalQc
    });

    return res.json({
      message: "Work added and synced successfully",
      id: workId
    });
  } catch (err) {
    console.error("createWork error:", err.message);
    return res.status(500).json({ message: "Save failed", error: err.message });
  }
};

const updateWork = async (req, res) => {
  const { id } = req.params;
  const b = req.body || {};
  const monthsRaw = pick(b, "months", "month");
  const domain = pick(b, "domain");
  const sow = pick(b, "sow");
  const job_type = pick(b, "job_type", "jobType");
  const region = pick(b, "region");
  const state = pick(b, "state", "market");
  const county = pick(b, "county");
  const uom = pick(b, "uom");
  const job_id = pick(b, "job_id", "jobId");
  const current_status = pick(b, "current_status", "currentStatus");
  const production_engineers = pick(b, "production_engineers");
  const qc_engineers = pick(b, "qc_engineers");
  const otp = pick(b, "otp", "internalOtp");
  const internal_qc = pick(b, "internal_qc", "internalQc");
  const amdocs_qc = pick(b, "amdocs_qc", "amdocsQc");
  const receive_date = pick(b, "receive_date", "receiveDate", "receivedDate");
  const ecd_date = pick(b, "ecd_date", "ecdDate");
  const submission_date = pick(b, "submission_date", "submissionDate");

  const has = (v) => v !== undefined;

  const sets = [];
  const vals = [];
  const setCol = (col, val) => {
    sets.push(`${col} = ?`);
    vals.push(val);
  };

  let parsedMonths = [];
  if (has(monthsRaw)) {
    parsedMonths = parseMonthsInput(monthsRaw);
    if (parsedMonths.length > 0) setCol("months", JSON.stringify(parsedMonths));
  }
  const latestMonth = parsedMonths.length > 0 ? parsedMonths[parsedMonths.length - 1] : null;

  if (has(domain)) setCol("domain", normalize(domain));
  if (has(sow)) setCol("sow", flatText(sow));
  if (has(job_type)) setCol("job_type", normalize(job_type));
  if (has(region)) setCol("region", region);
  if (has(state)) setCol("state", state);
  if (has(county)) setCol("county", county);
  if (has(uom)) setCol("uom", JSON.stringify(uom || {}));
  // Ek row = hamesha 1 job delivered (frontend jo bhi bheje, hamesha 1 save hoga)
  setCol("jobs_delivered", 1);
  if (has(current_status)) setCol("current_status", clean(current_status));
  if (has(production_engineers)) setCol("production_engineers", clean(production_engineers));
  if (has(qc_engineers)) setCol("qc_engineers", clean(qc_engineers));
  if (has(otp)) setCol("otp", cleanOtp(otp));

  const formattedInternalQc = has(internal_qc) ? formatPercentage(internal_qc) : "";
  const formattedAmdocsQc = has(amdocs_qc) ? formatPercentage(amdocs_qc) : "";
  if (has(internal_qc)) setCol("internal_qc", formattedInternalQc);
  if (has(amdocs_qc)) setCol("amdocs_qc", formattedAmdocsQc);

  const clearedTextCols = [];
  if (has(otp) && cleanOtp(otp) === "") clearedTextCols.push("otp");
  if (has(amdocs_qc) && formattedAmdocsQc === "") clearedTextCols.push("amdocsQc");
  if (has(internal_qc) && formattedInternalQc === "") clearedTextCols.push("internalQc");

  const clearedDateCols = []; 
  const dateVals = { receiveDate: null, ecdDate: null, submissionDate: null };

  if (has(receive_date)) {
    dateVals.receiveDate = parseExcelDate(receive_date);
    setCol("receive_date", dateVals.receiveDate);
    if (dateVals.receiveDate === null) clearedDateCols.push("receiveDate");
  }
  if (has(ecd_date)) {
    dateVals.ecdDate = parseExcelDate(ecd_date);
    setCol("ecd_date", dateVals.ecdDate);
    if (dateVals.ecdDate === null) clearedDateCols.push("ecdDate");
  }
  if (has(submission_date)) {
    dateVals.submissionDate = parseExcelDate(submission_date);
    setCol("submission_date", dateVals.submissionDate);
    if (dateVals.submissionDate === null) clearedDateCols.push("submissionDate");
  }

  try {
    const oldRows = await query("SELECT job_id, domain, state, region FROM work_updates WHERE id = ?", [id]);
    if (!oldRows || oldRows.length === 0) {
      return res.status(404).json({ message: "Record not found", error: "No work row with this id" });
    }
    const oldJobId = clean(oldRows[0].job_id);
    const oldDomain = domainKey(oldRows[0].domain);
    const newJobId = has(job_id) ? clean(job_id) : oldJobId;
    // FIX: domain body me na aaye to purani row ka domain use hoga (job_creation sahi domain me sync ho)
    const jcDomain = has(domain) ? normalize(domain) : oldDomain;
    if (has(job_id)) setCol("job_id", newJobId);

    sets.push("updated_at = CURRENT_TIMESTAMP");
    const result = await query(
      `UPDATE work_updates SET ${sets.join(", ")} WHERE id = ?`,
      [...vals, id]
    );
    const jobIdChanged =
      isRealJobId(oldJobId) && oldJobId.toLowerCase() !== newJobId.toLowerCase();

    if (jobIdChanged) {
      const oldScope = jcScope(oldJobId, oldDomain);
      if (isRealJobId(newJobId)) {
        const newScope = jcScope(newJobId, jcDomain);
        const newExists = await query(
          `SELECT id FROM job_creation WHERE ${newScope.where} LIMIT 1`,
          newScope.params
        );
        if (newExists && newExists.length > 0) {
          await query(`DELETE FROM job_creation WHERE ${oldScope.where}`, oldScope.params);
        } else {
          await query(
            `UPDATE job_creation SET jobId = ?, updated_at = CURRENT_TIMESTAMP WHERE ${oldScope.where}`,
            [newJobId, ...oldScope.params]
          );
        }
      } else {
        await query(`DELETE FROM job_creation WHERE ${oldScope.where}`, oldScope.params);
      }
    }

    if (isRealJobId(newJobId)) {
      const curScope = jcScope(newJobId, jcDomain);

      for (const col of clearedDateCols) {
        await query(
          `UPDATE job_creation SET ${col} = NULL WHERE ${curScope.where}`,
          curScope.params
        );
      }

      for (const col of clearedTextCols) {
        await query(
          `UPDATE job_creation SET ${col} = '' WHERE ${curScope.where}`,
          curScope.params
        );
      }

      await helperSyncToJobCreation({
        domain: jcDomain,
        market: clean(state) || clean(region),
        cleanJobId: newJobId,
        month: latestMonth,
        receiveDate: dateVals.receiveDate,
        ecdDate: dateVals.ecdDate,
        submissionDate: dateVals.submissionDate,
        otp: has(otp) ? cleanOtp(otp) : "",
        amdocsQc: formattedAmdocsQc,
        internalQc: formattedInternalQc
      });
    }

    return res.json({
      message: "Updated successfully and synced to Job Creation",
      result
    });
  } catch (err) {
    console.error("updateWork error:", err.message);
    return res.status(500).json({
      message: "Update failed",
      error: err.message
    });
  }
};

const regionForState = (state) => {
  const raw = clean(state).toUpperCase();
  if (!raw) return "";
  for (const name of Object.keys(stateData)) {
    const info = stateData[name] || {};
    if (name.toUpperCase() === raw || clean(info.code).toUpperCase() === raw) {
      return info.region || "";
    }
  }
  return "";
};

const displayOtp = (v) => cleanOtp(v);

const mapWorkRow = (row) => {
  const { jc_month, jc_receive, jc_ecd, jc_submission, ...work } = row;
  if (isBlank(work.region)) {
    const derived = regionForState(work.state);
    if (derived) work.region = derived;
  }

  let monthsArr = safeParseJson(work.months, []);
  if (!Array.isArray(monthsArr)) monthsArr = monthsArr ? [monthsArr] : [];
  monthsArr = cleanMonthArray(monthsArr);
  if (monthsArr.length === 0 && !isBlank(jc_month)) {
    monthsArr = cleanMonthArray([jc_month]);
  }

  const displayMonth = monthsArr.length > 0 ? monthsArr[monthsArr.length - 1] : "";
  const dateOf = (own, fallback) => (isBlank(own) ? fallback : own);

  return {
    ...work,
    month: displayMonth,
    months: monthsArr,
    uom: safeParseJson(work.uom, {}),
    jobs_delivered: 1, // FIX: ek row = hamesha 1 job delivered
    otp: displayOtp(work.otp),
    amdocs_qc: blankIfZero(work.amdocs_qc),
    internal_qc: blankIfZero(work.internal_qc),
    receive_date: formatDateToMMDDYYYY(dateOf(work.receive_date, jc_receive)),
    ecd_date: formatDateToMMDDYYYY(dateOf(work.ecd_date, jc_ecd)),
    submission_date: formatDateToMMDDYYYY(dateOf(work.submission_date, jc_submission)),
    lastUpdate: work.updated_at ? work.updated_at : work.created_at
  };
};

const getAllWork = async (req, res) => {
  try {
    const workRows = await query("SELECT *, updated_at FROM work_updates ORDER BY id ASC");
    const jcMap = new Map();
    try {
      const jcRows = await query(
        "SELECT jobId, domain, month, receiveDate, ecdDate, submissionDate FROM job_creation"
      );
      (jcRows || []).forEach((r) => {
        if (!isRealJobId(r.jobId)) return;
        // FIX: fallback bhi (domain + jobId) se, taaki dusre domain ki date/month na aaye
        const k = jobKey(r.domain, r.jobId);
        const prev = jcMap.get(k) || {};
        jcMap.set(k, {
          jc_month: !isBlank(prev.jc_month) ? prev.jc_month : r.month,
          jc_receive: !isBlank(prev.jc_receive) ? prev.jc_receive : r.receiveDate,
          jc_ecd: !isBlank(prev.jc_ecd) ? prev.jc_ecd : r.ecdDate,
          jc_submission: !isBlank(prev.jc_submission) ? prev.jc_submission : r.submissionDate
        });
      });
    } catch (jcErr) {
      console.error("getAllWork: job_creation fallback load failed:", jcErr.message);
    }

    const data = (workRows || []).map((row) => {
      const fb =
        jcMap.get(jobKey(row.domain, row.job_id)) ||
        jcMap.get(jobKey("", row.job_id)) || // purani blank-domain rows
        {};
      return mapWorkRow({ ...row, ...fb });
    });

    return res.json(data);
  } catch (err) {
    return res.status(500).json(err);
  }
};

const getFileData = (req, res) => {
  const fileName = req.params.fileName;
  const sql = `SELECT * FROM work_updates WHERE file_name = ? ORDER BY id ASC`;

  db.query(sql, [fileName], (err, rows) => {
    if (err) return res.status(500).json(err);
    if (!rows.length) return res.status(404).json({ message: "No data found for this file" });

    const cleaned = rows.map((row) => {
      const { created_at, updated_at, file_name, id, ...rest } = row;
      return {
        ...rest,
        jobs_delivered: 1, // FIX: ek row = hamesha 1 job delivered
        otp: displayOtp(rest.otp),
        amdocs_qc: blankIfZero(rest.amdocs_qc),
        internal_qc: blankIfZero(rest.internal_qc),
        receive_date: formatDateToMMDDYYYY(rest.receive_date),
        ecd_date: formatDateToMMDDYYYY(rest.ecd_date),
        submission_date: formatDateToMMDDYYYY(rest.submission_date)
      };
    });

    res.json(cleaned);
  });
};

// FIX: SUM(jobs_delivered) ki jagah COUNT(*) -> har row = 1 job
const getDomainStats = (req, res) => {
  db.query(
    `SELECT domain, COUNT(*) AS jobs_delivered FROM work_updates GROUP BY domain`,
    (err, rows) => {
      if (err) return res.status(500).json(err);
      res.json(rows);
    }
  );
};

const getJobTypeStats = (req, res) => {
  db.query(
    `SELECT job_type AS job_type, COUNT(*) AS jobs_delivered FROM work_updates GROUP BY job_type ORDER BY jobs_delivered DESC`,
    (err, rows) => {
      if (err) return res.status(500).json(err);
      res.json(rows);
    }
  );
};

const getMonthWiseReport = (req, res) => {
  db.query("SELECT * FROM work_updates ORDER BY id ASC", (err, rows) => {
    if (err) return res.status(500).json([]);
    const formatted = rows.map(r => ({
      ...r,
      jobs_delivered: 1, // FIX: ek row = hamesha 1 job delivered
      otp: displayOtp(r.otp),
      amdocs_qc: blankIfZero(r.amdocs_qc),
      internal_qc: blankIfZero(r.internal_qc),
      receive_date: formatDateToMMDDYYYY(r.receive_date),
      ecd_date: formatDateToMMDDYYYY(r.ecd_date),
      submission_date: formatDateToMMDDYYYY(r.submission_date)
    }));
    res.json(formatted);
  });
};

const getStateWiseJobs = (req, res) => {
  db.query(
    `SELECT state, domain, COUNT(*) AS jobs_delivered FROM work_updates GROUP BY state, domain`,
    (err, rows) => {
      if (err) return res.status(500).json(err);

      const result = {};
      rows.forEach((row) => {
        if (!result[row.state]) result[row.state] = {};
        result[row.state][row.domain] = row.jobs_delivered;
      });

      res.json(result);
    }
  );
};

const getDomainLastUpdate = (req, res) => {
  const sql = `SELECT domain, MAX(updated_at) AS lastUpdate FROM work_updates GROUP BY domain`;

  db.query(sql, (err, rows) => {
    if (err) return res.status(500).json({ message: "Failed to fetch last update" });
    res.json(rows);
  });
};

/* ======================================
   DELETE FUNCTIONS
====================================== */
const deleteWork = async (req, res) => {
  const workId = req.params.id;

  try {
    const rows = await query("SELECT job_id, domain FROM work_updates WHERE id = ?", [workId]);
    const jobId = rows && rows.length > 0 ? clean(rows[0].job_id) : "";
    const domain = rows && rows.length > 0 ? domainKey(rows[0].domain) : "";

    await query("DELETE FROM work_updates WHERE id = ?", [workId]);
    await removeOrphanJobCreation([{ jobId, domain }]);

    return res.json({ message: "Deleted from both Work Controller and Job Creation successfully" });
  } catch (err) {
    console.error("deleteWork error:", err.message);
    return res.status(500).json({ message: "Delete failed", error: err.message });
  }
};

const deleteFile = async (req, res) => {
  const fileName = req.params.fileName;

  try {
    const rows = await query("SELECT job_id, domain FROM work_updates WHERE file_name = ?", [fileName]);
    const items = (rows || [])
      .map((r) => ({ jobId: clean(r.job_id), domain: domainKey(r.domain) }))
      .filter((r) => isRealJobId(r.jobId));

    await query("DELETE FROM work_updates WHERE file_name = ?", [fileName]);

    await removeOrphanJobCreation(items);

    return res.json({ message: "File and related jobs deleted successfully from both places" });
  } catch (err) {
    console.error("deleteFile error:", err.message);
    return res.status(500).json({ message: "Delete failed", error: err.message });
  }
};

const clearWork = async (req, res) => {
  try {
    await query("DELETE FROM work_updates");
    await query("DELETE FROM job_creation");

    return res.json({ message: "All data cleared from both places" });
  } catch (err) {
    console.error("clearWork error:", err.message);
    return res.status(500).json({ message: "Clear failed", error: err.message });
  }
};

/* ======================================
   AUTO FIX: purani rows ko 1 karo (server start par apne aap chalega)
   Manual SQL ki zaroorat nahi.
====================================== */
const fixOldJobsDelivered = async () => {
  try {
    const result = await query(
      "UPDATE work_updates SET jobs_delivered = 1 WHERE jobs_delivered IS NULL OR jobs_delivered <> 1"
    );
    console.log(
      `jobs_delivered auto-fix done. Rows fixed: ${result && result.affectedRows !== undefined ? result.affectedRows : 0}`
    );
  } catch (err) {
    console.error("jobs_delivered auto-fix failed:", err.message);
  }
};
fixOldJobsDelivered();

/* ======================================
   MODULE EXPORTS
====================================== */
module.exports = {
  importExcel,
  createWork,
  getAllWork,
  getFileData,
  getDomainStats,
  getJobTypeStats,
  getMonthWiseReport,
  getStateWiseJobs,
  getDomainLastUpdate,
  updateWork,
  updateJob: updateWork,
  deleteWork,
  deleteFile,
  clearWork
};
