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

// CHANGE: browser/proxy ko cache karne se rokta hai, taaki refresh ke bina hamesha naya data mile
const noCache = (res) => {
  res.set({
    "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
    Pragma: "no-cache",
    Expires: "0",
    "Surrogate-Control": "no-store"
  });
};

const isRealJobId = (v) => {
  const s = clean(v);
  return s !== "" && s !== "-";
};

const domainKey = (v) => clean(v).toUpperCase();
const jobKey = (domain, jobId) => `${domainKey(domain)}|${clean(jobId).toLowerCase()}`;
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

/* ======================================
   SPEED HELPERS (naya)
   - chunkArray: bade array ko chhote tukdon me todta hai (bulk insert / bulk delete ke liye)
   - runLimited: kuchh tasks ek saath (limit ke saath) chalata hai
====================================== */
const chunkArray = (arr, size) => {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};

const runLimited = async (tasks, limit = 10) => {
  if (!tasks || tasks.length === 0) return;
  let idx = 0;
  const workers = Array.from({ length: Math.min(limit, tasks.length) }, async () => {
    while (idx < tasks.length) {
      const my = idx++;
      await tasks[my]();
    }
  });
  await Promise.all(workers);
};

// items: [{ jobId, domain }] (purana format: sirf jobId strings bhi chalega)
// CHANGE (speed): pehle har job ke liye 2-4 queries (TRIM ke saath, sequential) chalti thi.
// Ab sirf 2 SELECT + bulk DELETE (id IN (...)) chalta hai. Logic bilkul wahi hai.
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

  // work_updates me abhi bhi kaun se job id / domain use ho rahe hain (ek hi query me)
  // CHANGE (speed): dono SELECT ek saath chalte hain
  const [usedRows, jcRows] = await Promise.all([
    query("SELECT job_id, domain FROM work_updates WHERE job_id IS NOT NULL"),
    query("SELECT id, jobId, domain FROM job_creation")
  ]);
  const usedExact = new Set();
  const usedAny = new Set();
  (usedRows || []).forEach((r) => {
    const jid = clean(r.job_id);
    if (!jid) return;
    usedAny.add(jid.toLowerCase());
    usedExact.add(jobKey(r.domain, jid));
  });

  const jcByJob = new Map();
  (jcRows || []).forEach((r) => {
    const jid = clean(r.jobId);
    if (!jid) return;
    const lk = jid.toLowerCase();
    if (!jcByJob.has(lk)) jcByJob.set(lk, []);
    jcByJob.get(lk).push({ id: r.id, dk: domainKey(r.domain) });
  });

  const idsToDelete = new Set();

  for (const { jobId, domain } of pairs) {
    const lk = jobId.toLowerCase();
    const list = jcByJob.get(lk) || [];

    if (domain) {
      if (usedExact.has(jobKey(domain, jobId))) continue;

      list.forEach((r) => {
        if (r.dk === domain) idsToDelete.add(r.id);
      });

      // purani blank-domain row tabhi hatao jab is job id ko koi bhi domain use nahi kar raha
      if (!usedAny.has(lk)) {
        list.forEach((r) => {
          if (r.dk === "") idsToDelete.add(r.id);
        });
      }
    } else {
      if (usedAny.has(lk)) continue;
      list.forEach((r) => idsToDelete.add(r.id));
    }
  }

  const ids = Array.from(idsToDelete);
  for (const chunk of chunkArray(ids, 1000)) {
    await query("DELETE FROM job_creation WHERE id IN (?)", [chunk]);
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

    // job_creation me bhi (jobId + domain) se match hoga, sirf jobId se nahi
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
   READ HELPERS (shared)
   CHANGE: getAllWork ka logic yahan nikala gaya hai taaki
   import / create / update / delete ke response me bhi
   latest data wapas bheja ja sake (frontend ko refresh nahi karna padega)
====================================== */
const regionCache = new Map(); // CHANGE (speed): same state ke liye baar-baar loop nahi
const retrieveRegionIfBlank = (state) => {
  const raw = clean(state).toUpperCase();
  if (!raw) return "";
  if (regionCache.has(raw)) return regionCache.get(raw);
  let found = "";
  for (const name of Object.keys(stateData)) {
    const info = stateData[name] || {};
    if (name.toUpperCase() === raw || clean(info.code).toUpperCase() === raw) {
      found = info.region || "";
      break;
    }
  }
  regionCache.set(raw, found);
  return found;
};
const regionForState = retrieveRegionIfBlank;

const isBlank = (v) =>
  v === null || v === undefined || (typeof v === "string" && v.trim() === "");

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
    jobs_delivered: 1, // ek row = hamesha 1 job delivered
    otp: displayOtp(work.otp),
    amdocs_qc: blankIfZero(work.amdocs_qc),
    internal_qc: blankIfZero(work.internal_qc),
    receive_date: formatDateToMMDDYYYY(dateOf(work.receive_date, jc_receive)),
    ecd_date: formatDateToMMDDYYYY(dateOf(work.ecd_date, jc_ecd)),
    submission_date: formatDateToMMDDYYYY(dateOf(work.submission_date, jc_submission)),
    lastUpdate: work.updated_at ? work.updated_at : work.created_at
  };
};

const buildAllWork = async () => {
  const workRows = await query("SELECT *, updated_at FROM work_updates ORDER BY id ASC");
  const jcMap = new Map();
  try {
    const jcRows = await query(
      "SELECT jobId, domain, month, receiveDate, ecdDate, submissionDate FROM job_creation"
    );
    (jcRows || []).forEach((r) => {
      if (!isRealJobId(r.jobId)) return;
      // fallback bhi (domain + jobId) se, taaki dusre domain ki date/month na aaye
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
    console.error("buildAllWork: job_creation fallback load failed:", jcErr.message);
  }

  return (workRows || []).map((row) => {
    const fb =
      jcMap.get(jobKey(row.domain, row.job_id)) ||
      jcMap.get(jobKey("", row.job_id)) || // purani blank-domain rows
      {};
    return mapWorkRow({ ...row, ...fb });
  });
};

// Mutation ke baad latest data laane ki koshish; fail ho to null (main response na toote)
const tryBuildAllWork = async () => {
  try {
    return await buildAllWork();
  } catch (e) {
    console.error("tryBuildAllWork failed:", e.message);
    return null;
  }
};

/* ======================================
   IMPORT EXCEL
   CHANGE (speed): pehle har row par 3-4 queries sequentially chalti thi.
   Ab:
     1) existing work_updates + job_creation ek baar me memory me load
     2) saari rows memory me merge (same Job ID + domain => ek hi row, months/uom merge)
     3) end me bulk INSERT (500 rows ek query me) + parallel UPDATE
   Logic / merge rules bilkul purane jaise hain.
====================================== */
const WORK_INSERT_COLS = [
  "file_name", "months", "domain", "sow", "job_type", "region", "state", "county", "uom",
  "otp", "current_status", "production_engineers", "qc_engineers", "amdocs_qc", "internal_qc",
  "jobs_delivered", "job_id", "receive_date", "ecd_date", "submission_date"
];

const JC_INSERT_COLS = [
  "domain", "market", "jobId", "month", "receiveDate", "ecdDate", "submissionDate",
  "otp", "amdocsQc", "internalQc"
];

const importExcel = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "Excel file required" });
    }

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(req.file.buffer);

    let success = 0;
    let failed = 0;
    let totalRows = 0;

    const sourceFile = req.file.originalname;

    // har import ki shuruaat me default saal reset
    monthDefaultYear = new Date().getFullYear();

    /* ---------- 1) Existing data ek baar me memory me ---------- */
    const existingWork = new Map(); // jobKey(domain, jobId) -> { id, months, uom }
    const existingWorkRows = await query(
      "SELECT id, job_id, domain, months, uom FROM work_updates WHERE job_id IS NOT NULL ORDER BY id ASC"
    );
    (existingWorkRows || []).forEach((r) => {
      if (!isRealJobId(r.job_id)) return;
      const k = jobKey(r.domain, r.job_id);
      if (!existingWork.has(k)) {
        existingWork.set(k, { id: r.id, months: r.months, uom: r.uom });
      }
    });

    const jcExact = new Map(); // jobKey(domain, jobId) -> id
    const jcBlank = new Map(); // lowercase jobId -> id (blank domain wali purani rows)
    const jcAny = new Map(); // lowercase jobId -> id
    const existingJcRows = await query("SELECT id, jobId, domain FROM job_creation ORDER BY id ASC");
    (existingJcRows || []).forEach((r) => {
      const jid = clean(r.jobId);
      if (!jid) return;
      const lk = jid.toLowerCase();
      const dk = domainKey(r.domain);
      if (dk) {
        const k = jobKey(dk, jid);
        if (!jcExact.has(k)) jcExact.set(k, r.id);
      } else if (!jcBlank.has(lk)) {
        jcBlank.set(lk, r.id);
      }
      if (!jcAny.has(lk)) jcAny.set(lk, r.id);
    });

    /* ---------- 2) Rows ko memory me merge karne ke helpers ---------- */
    const workStates = []; // order me
    const workStateByKey = new Map();
    const locCache = new Map();

    const newWorkState = (base, existing) => {
      let existingMonths = [];
      let existingUOM = {};
      if (existing) {
        existingMonths = safeParseJson(existing.months, []);
        existingUOM = safeParseJson(existing.uom, {});
        if (!Array.isArray(existingMonths)) existingMonths = existingMonths ? [existingMonths] : [];
        if (!existingUOM || typeof existingUOM !== "object" || Array.isArray(existingUOM)) existingUOM = {};
      }
      return {
        id: existing ? existing.id : null,
        isInsert: !existing,
        base,
        months: existingMonths,
        uom: existingUOM,
        fields: {
          otp: "",
          current_status: "",
          production_engineers: "",
          qc_engineers: "",
          amdocs_qc: "",
          internal_qc: "",
          receive_date: null,
          ecd_date: null,
          submission_date: null
        },
        rows: 0,
        failed: false,
        jcItems: []
      };
    };

    const mergeWorkState = (st, d) => {
      const newMonth = d.month ? String(d.month).trim() : null;
      if (newMonth && !st.months.includes(newMonth)) st.months.push(newMonth);
      st.uom = { ...st.uom, ...d.uom };

      // COALESCE(NULLIF(?, ''), old) wali logic: naya khali ho to purana rahega
      ["otp", "current_status", "production_engineers", "qc_engineers", "amdocs_qc", "internal_qc"].forEach((f) => {
        if (d[f] !== "" && d[f] !== null && d[f] !== undefined) st.fields[f] = d[f];
      });
      // COALESCE(?, old) wali logic
      ["receive_date", "ecd_date", "submission_date"].forEach((f) => {
        if (d[f] !== null && d[f] !== undefined && d[f] !== "") st.fields[f] = d[f];
      });
    };

    /* job_creation ki memory state */
    const jcStates = new Map(); // jobKey -> state
    const jcOrder = [];

    const syncJc = (d) => {
      const jid = clean(d.cleanJobId);
      if (!jid || jid === "-") return;
      const dk = domainKey(d.domain);
      const lk = jid.toLowerCase();
      const k = jobKey(dk, jid);

      let st = jcStates.get(k);
      if (!st) {
        let targetId = null;
        if (dk) {
          if (jcExact.has(k)) {
            targetId = jcExact.get(k);
          } else if (jcBlank.has(lk)) {
            targetId = jcBlank.get(lk);
            jcBlank.delete(lk); // is blank row par ab is domain ka haq ho gaya
          }
        } else if (jcAny.has(lk)) {
          targetId = jcAny.get(lk);
        }
        st = {
          id: targetId,
          jobId: jid,
          domain: dk,
          market: "",
          month: null,
          receiveDate: null,
          ecdDate: null,
          submissionDate: null,
          otp: "",
          amdocsQc: "",
          internalQc: ""
        };
        jcStates.set(k, st);
        jcOrder.push(st);
      }

      const otp = cleanOtp(d.otp);
      const amdocsQc = blankIfZero(d.amdocsQc);
      const internalQc = blankIfZero(d.internalQc);
      const month = formatMonth(d.month);

      if (dk) st.domain = dk;
      if (!isBlank(d.market)) st.market = d.market;
      if (month !== null && month !== undefined) st.month = month;
      if (d.receiveDate !== null && d.receiveDate !== undefined) st.receiveDate = d.receiveDate;
      if (d.ecdDate !== null && d.ecdDate !== undefined) st.ecdDate = d.ecdDate;
      if (d.submissionDate !== null && d.submissionDate !== undefined) st.submissionDate = d.submissionDate;
      if (!isBlank(otp)) st.otp = otp;
      if (!isBlank(amdocsQc)) st.amdocsQc = amdocsQc;
      if (!isBlank(internalQc)) st.internalQc = internalQc;
    };

    /* ---------- Sheets padho aur rows memory me merge karo ---------- */
    for (const worksheet of workbook.worksheets) {
      const sheetName = worksheet.name;
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
          const headerName = headers[col];
          if (headerName) {
            obj[headerName] = unwrapCell(row.getCell(col).value);
          }
        }
        const hasAnyValue = Object.values(obj).some((v) => {
          if (v === null || v === undefined) return false;
          return v.toString().trim() !== "";
        });

        if (hasAnyValue) {
          rows.push(obj);
        }
      });

      totalRows += rows.length;

      // Month column me saal mile to use default bana lo (sirf "Feb"/"May" wali rows ke liye)
      const yearHit = rows
        .map((r) => {
          const v = getMonthValue(r);
          if (v instanceof Date) return v.getUTCFullYear();
          const mm = String(v === null || v === undefined ? "" : v).match(/(\d{4})/);
          return mm ? Number(mm[1]) : null;
        })
        .find(Boolean);
      if (yearHit) monthDefaultYear = yearHit;

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];

        try {
          const domain = normalize(sheetName);
          const sow = clean(findValueInRow(row, ["SOW"]));
          const jobType = normalize(findValueInRow(row, ["Job Type", "job_type", "job-type"]));
          const jobIdVal = clean(findValueInRow(row, ["Job ID", "job_id", "jobId", "job-id"]));

          const otpVal = cleanOtp(findValueInRow(row, ["OTP"]));
          const currentStatusVal = clean(findValueInRow(row, ["Current Status", "current_status", "current-status"]));
          const productionEngineersVal = clean(findValueInRow(row, ["Production Engineers", "production_engineers"]));
          const qcEngineersVal = clean(findValueInRow(row, ["QC Engineers", "qc_engineers"]));

          const amdocsQcVal = formatPercentage(findValueInRow(row, ["Amdocs QC", "amdocs_qc"]));
          const internalQcVal = formatPercentage(findValueInRow(row, ["Internal QC", "internal_qc"]));

          const receiveDateVal = parseExcelDate(findValueInRow(row, ["Receive Date", "receive_date", "receive-date", "received date", "received_date"]));
          const ecdDateVal = parseExcelDate(findValueInRow(row, ["ECD Date", "ecd_date", "ecd-date", "ecddate", "ECD"]));
          const submissionDateVal = parseExcelDate(findValueInRow(row, ["Submission Date", "submission_date", "submission-date"]));

          // State -> Market -> Region ke order me pehli non-empty value
          let rawLocation =
            clean(findValueInRow(row, ["State"])) ||
            clean(findValueInRow(row, ["Market"])) ||
            clean(findValueInRow(row, ["Region"]));

          let state = "";
          let county = "";
          let region = "";

          const formattedLocation = rawLocation
            .toString()
            .trim()
            .toLowerCase()
            .split(" ")
            .map(w => w.charAt(0).toUpperCase() + w.slice(1))
            .join(" ");

          // CHANGE (speed): same location baar-baar dhundhne ki jagah cache
          let loc = locCache.get(formattedLocation);
          if (!loc) {
            loc = { state: "", county: "", region: "" };

            const stateFromCode = getStateNameFromCode(formattedLocation);

            if (stateFromCode) {
              loc.state = stateFromCode;
              loc.region = getRegionFromState(loc.state);
            } else {
              const matchedState = Object.keys(stateData).find(
                s => s.toLowerCase() === formattedLocation.toLowerCase()
              );

              if (matchedState) {
                loc.state = matchedState;
                loc.region = getRegionFromState(loc.state);
              }
            }

            if (!loc.state) {
              const countyResult = getStateFromCounty(formattedLocation);

              if (countyResult.state) {
                loc.county = countyResult.county;
                loc.state = countyResult.state;
                loc.region = getRegionFromState(loc.state);
              }
            }
            locCache.set(formattedLocation, loc);
          }
          state = loc.state;
          county = loc.county;
          region = loc.region;

          // Agar state se region nahi mila to Excel ka Region column use karo
          if (!region) {
            const sheetRegion = clean(findValueInRow(row, ["Region"]));
            if (sheetRegion) region = sheetRegion;
          }

          const month = formatMonth(getMonthValue(row));
          const uom = extractUOM(row);

          const hasJob = isRealJobId(jobIdVal);
          const wKey = hasJob ? jobKey(domain, jobIdVal) : null;

          let st = hasJob ? workStateByKey.get(wKey) : null;
          if (!st) {
            const existing = hasJob ? existingWork.get(wKey) : null;
            st = newWorkState(
              {
                domain,
                sow,
                job_type: jobType,
                region,
                state,
                county,
                job_id: jobIdVal || null
              },
              existing
            );
            workStates.push(st);
            if (hasJob) workStateByKey.set(wKey, st);
          }

          mergeWorkState(st, {
            month,
            uom,
            otp: otpVal,
            current_status: currentStatusVal,
            production_engineers: productionEngineersVal,
            qc_engineers: qcEngineersVal,
            amdocs_qc: amdocsQcVal,
            internal_qc: internalQcVal,
            receive_date: receiveDateVal,
            ecd_date: ecdDateVal,
            submission_date: submissionDateVal
          });
          st.rows++;

          if (hasJob) {
            st.jcItems.push({
              domain,
              market: state || region,
              cleanJobId: jobIdVal,
              month,
              otp: otpVal,
              amdocsQc: amdocsQcVal,
              internalQc: internalQcVal,
              receiveDate: receiveDateVal,
              ecdDate: ecdDateVal,
              submissionDate: submissionDateVal
            });
          }
        } catch (e) {
          console.error("Import row error:", e.message);
          failed++;
        }
      }
    }

    /* ---------- 3a) work_updates: bulk INSERT ---------- */
    const toInsertValues = (st) => [
      sourceFile,
      JSON.stringify(st.months),
      st.base.domain,
      st.base.sow,
      st.base.job_type,
      st.base.region,
      st.base.state,
      st.base.county,
      JSON.stringify(st.uom),
      st.fields.otp,
      st.fields.current_status,
      st.fields.production_engineers,
      st.fields.qc_engineers,
      st.fields.amdocs_qc,
      st.fields.internal_qc,
      1,
      st.base.job_id,
      st.fields.receive_date,
      st.fields.ecd_date,
      st.fields.submission_date
    ];

    const insertStates = workStates.filter((s) => s.isInsert);
    const updateStates = workStates.filter((s) => !s.isInsert);

    const workInsertSql = `INSERT INTO work_updates (${WORK_INSERT_COLS.join(", ")}) VALUES ?`;
    const workInsertOneSql = `INSERT INTO work_updates (${WORK_INSERT_COLS.join(", ")}) VALUES (${WORK_INSERT_COLS.map(() => "?").join(", ")})`;

    for (const chunk of chunkArray(insertStates, 500)) {
      try {
        await query(workInsertSql, [chunk.map(toInsertValues)]);
      } catch (bulkErr) {
        console.error("Import bulk insert failed, row-by-row try kar rahe hain:", bulkErr.message);
        for (const st of chunk) {
          try {
            await query(workInsertOneSql, toInsertValues(st));
          } catch (oneErr) {
            console.error("Import insert failed:", oneErr.message);
            st.failed = true;
            failed += st.rows;
          }
        }
      }
    }

    /* ---------- 3b) work_updates: UPDATE (parallel) ---------- */
    // file_name naye upload wali file ka set hota hai, taaki naya upload file list me turant dikhe
    const workUpdateSql = `
      UPDATE work_updates
      SET file_name = ?, months = ?, uom = ?, otp = COALESCE(NULLIF(?, ''), otp), current_status = COALESCE(NULLIF(?, ''), current_status), production_engineers = COALESCE(NULLIF(?, ''), production_engineers), qc_engineers = COALESCE(NULLIF(?, ''), qc_engineers), amdocs_qc = COALESCE(NULLIF(?, ''), amdocs_qc), internal_qc = COALESCE(NULLIF(?, ''), internal_qc), jobs_delivered = ?, receive_date = COALESCE(?, receive_date), ecd_date = COALESCE(?, ecd_date), submission_date = COALESCE(?, submission_date), updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `;

    await runLimited(
      updateStates.map((st) => async () => {
        try {
          await query(workUpdateSql, [
            sourceFile,
            JSON.stringify(st.months),
            JSON.stringify(st.uom),
            st.fields.otp,
            st.fields.current_status,
            st.fields.production_engineers,
            st.fields.qc_engineers,
            st.fields.amdocs_qc,
            st.fields.internal_qc,
            1, // Ek row = hamesha 1 job delivered
            st.fields.receive_date,
            st.fields.ecd_date,
            st.fields.submission_date,
            st.id
          ]);
        } catch (err2) {
          console.error("Import update failed:", err2.message);
          st.failed = true;
          failed += st.rows;
        }
      }),
      10
    );

    /* ---------- 4) job_creation sync (sirf unke liye jinka work row save hua) ---------- */
    workStates.forEach((st) => {
      if (st.failed) return;
      success += st.rows;
      st.jcItems.forEach((item) => syncJc(item));
    });

    const jcInsertStates = jcOrder.filter((s) => s.id === null);
    const jcUpdateStates = jcOrder.filter((s) => s.id !== null);

    const jcToValues = (s) => [
      s.domain,
      s.market,
      s.jobId,
      s.month,
      s.receiveDate,
      s.ecdDate,
      s.submissionDate,
      s.otp,
      s.amdocsQc,
      s.internalQc
    ];
    const jcInsertSql = `INSERT INTO job_creation (${JC_INSERT_COLS.join(", ")}) VALUES ?`;
    const jcInsertOneSql = `INSERT INTO job_creation (${JC_INSERT_COLS.join(", ")}) VALUES (${JC_INSERT_COLS.map(() => "?").join(", ")})`;

    for (const chunk of chunkArray(jcInsertStates, 500)) {
      try {
        await query(jcInsertSql, [chunk.map(jcToValues)]);
      } catch (bulkErr) {
        console.error("job_creation bulk insert failed, row-by-row try kar rahe hain:", bulkErr.message);
        for (const s of chunk) {
          try {
            await query(jcInsertOneSql, jcToValues(s));
          } catch (oneErr) {
            console.error("Error inserting job_creation:", oneErr.message);
          }
        }
      }
    }

    const jcUpdateSql = `
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

    await runLimited(
      jcUpdateStates.map((s) => async () => {
        try {
          await query(jcUpdateSql, [
            s.domain,
            s.market,
            s.month,
            s.receiveDate,
            s.ecdDate,
            s.submissionDate,
            s.otp,
            s.amdocsQc,
            s.internalQc,
            s.id
          ]);
        } catch (upErr) {
          console.error("Error updating job_creation:", upErr.message);
        }
      }),
      10
    );

    // CHANGE: latest data bhi response me bhejo + no-cache
    const data = await tryBuildAllWork();
    noCache(res);
    return res.json({
      message: "Excel imported successfully in proper order",
      totalRows,
      insertedOrUpdated: success,
      failed,
      fileName: req.file.originalname,
      data
    });

  } catch (err) {
    return res.status(500).json({
      message: "Import failed",
      error: err.message
    });
  }
};

const pick = (obj, ...keys) => {
  for (const k of keys) {
    if (obj && obj[k] !== undefined) return obj[k];
  }
  return undefined;
};

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
      // same Job ID alag domain me ho to alag row; sirf same domain me hi merge hoga
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

    const data = await tryBuildAllWork();
    noCache(res);
    return res.json({
      message: "Work added and synced successfully",
      id: workId,
      data
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
    // domain body me na aaye to purani row ka domain use hoga (job_creation sahi domain me sync ho)
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

    const data = await tryBuildAllWork();
    noCache(res);
    return res.json({
      message: "Updated successfully and synced to Job Creation",
      result,
      data
    });
  } catch (err) {
    console.error("updateWork error:", err.message);
    return res.status(500).json({
      message: "Update failed",
      error: err.message
    });
  }
};

const getAllWork = async (req, res) => {
  try {
    const data = await buildAllWork();
    noCache(res); // CHANGE
    return res.json(data);
  } catch (err) {
    return res.status(500).json(err);
  }
};

const getFileData = (req, res) => {
  const fileName = req.params.fileName;
  const sql = `SELECT * FROM work_updates WHERE file_name = ? ORDER BY id ASC`;
  noCache(res); // CHANGE

  db.query(sql, [fileName], (err, rows) => {
    if (err) return res.status(500).json(err);
    if (!rows.length) return res.status(404).json({ message: "No data found for this file" });

    const cleaned = rows.map((row) => {
      const { created_at, updated_at, file_name, id, ...rest } = row;
      return {
        ...rest,
        jobs_delivered: 1, // ek row = hamesha 1 job delivered
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

// SUM(jobs_delivered) ki jagah COUNT(*) -> har row = 1 job
const getDomainStats = (req, res) => {
  noCache(res); // CHANGE
  db.query(
    `SELECT domain, COUNT(*) AS jobs_delivered FROM work_updates GROUP BY domain`,
    (err, rows) => {
      if (err) return res.status(500).json(err);
      res.json(rows);
    }
  );
};

const getJobTypeStats = (req, res) => {
  noCache(res); // CHANGE
  db.query(
    `SELECT job_type AS job_type, COUNT(*) AS jobs_delivered FROM work_updates GROUP BY job_type ORDER BY jobs_delivered DESC`,
    (err, rows) => {
      if (err) return res.status(500).json(err);
      res.json(rows);
    }
  );
};

const getMonthWiseReport = (req, res) => {
  noCache(res); // CHANGE
  db.query("SELECT * FROM work_updates ORDER BY id ASC", (err, rows) => {
    if (err) return res.status(500).json([]);
    const formatted = rows.map(r => ({
      ...r,
      jobs_delivered: 1, // ek row = hamesha 1 job delivered
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
  noCache(res); // CHANGE
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
  noCache(res); // CHANGE
  const sql = `SELECT domain, MAX(updated_at) AS lastUpdate FROM work_updates GROUP BY domain`;

  db.query(sql, (err, rows) => {
    if (err) return res.status(500).json({ message: "Failed to fetch last update" });
    res.json(rows);
  });
};

/* ======================================
   DELETE FUNCTIONS
   CHANGE: delete ke baad latest data response me aata hai
   CHANGE (speed): removeOrphanJobCreation bulk me chalta hai
   CHANGE (safe): agar bulk cleanup fail ho to purane tareeke (job-by-job) se cleanup hota hai,
   aur cleanup me dikkat aaye tab bhi asli delete fail nahi hota.
====================================== */

// Purana (job-by-job) cleanup - sirf backup ke taur par, agar bulk wala fail ho
const removeOrphanJobCreationLegacy = async (items) => {
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

// Bulk try -> fail ho to legacy try -> dono fail ho to sirf log (delete response na toote)
const safeRemoveOrphanJobCreation = async (items) => {
  try {
    await removeOrphanJobCreation(items);
    return true;
  } catch (bulkErr) {
    console.error("Bulk job_creation cleanup failed, legacy try kar rahe hain:", bulkErr.message);
    try {
      await removeOrphanJobCreationLegacy(items);
      return true;
    } catch (legacyErr) {
      console.error("Legacy job_creation cleanup bhi fail:", legacyErr.message);
      return false;
    }
  }
};

const deleteWork = async (req, res) => {
  const workId = req.params.id;

  try {
    const rows = await query("SELECT job_id, domain FROM work_updates WHERE id = ?", [workId]);
    const found = rows && rows.length > 0;
    const jobId = found ? clean(rows[0].job_id) : "";
    const domain = found ? domainKey(rows[0].domain) : "";

    await query("DELETE FROM work_updates WHERE id = ?", [workId]);
    const cleanupOk = await safeRemoveOrphanJobCreation([{ jobId, domain }]);

    const data = await tryBuildAllWork();
    noCache(res);
    return res.json({
      success: true,
      message: found
        ? "Record deleted successfully."
        : "Record was already deleted.",
      id: workId,
      jobCreationCleaned: cleanupOk,
      data
    });
  } catch (err) {
    console.error("deleteWork error:", err.message);
    return res.status(500).json({
      success: false,
      message: "Could not delete the record. Please try again.",
      error: err.message
    });
  }
};

const deleteFile = async (req, res) => {
  const fileName = req.params.fileName;
  // CHANGE (speed): ?lite=1 bhejne par poora data wapas nahi banta/bheja jata (bahut fast)
  const lite = req.query && (req.query.lite === "1" || req.query.lite === "true");
  const t0 = Date.now();

  try {
    const rows = await query("SELECT job_id, domain FROM work_updates WHERE file_name = ?", [fileName]);
    const items = (rows || [])
      .map((r) => ({ jobId: clean(r.job_id), domain: domainKey(r.domain) }))
      .filter((r) => isRealJobId(r.jobId));
    const t1 = Date.now();

    const delResult = await query("DELETE FROM work_updates WHERE file_name = ?", [fileName]);
    const deletedCount =
      delResult && delResult.affectedRows !== undefined ? delResult.affectedRows : (rows || []).length;
    const t2 = Date.now();

    const cleanupOk = await safeRemoveOrphanJobCreation(items);
    const t3 = Date.now();

    const data = lite ? undefined : await tryBuildAllWork();
    const t4 = Date.now();

    console.log(
      `deleteFile timing(ms): select=${t1 - t0} delete=${t2 - t1} cleanup=${t3 - t2} rebuild=${t4 - t3} total=${t4 - t0} rows=${deletedCount}`
    );

    noCache(res);
    return res.json({
      success: true,
      message: `File "${fileName}" deleted successfully (${deletedCount} record${deletedCount === 1 ? "" : "s"} removed).`,
      fileName,
      deletedCount,
      jobCreationCleaned: cleanupOk,
      ...(lite ? {} : { data })
    });
  } catch (err) {
    console.error("deleteFile error:", err.message);
    return res.status(500).json({
      success: false,
      message: "Could not delete the file. Please try again.",
      error: err.message
    });
  }
};

const clearWork = async (req, res) => {
  try {
    await query("DELETE FROM work_updates");
    await query("DELETE FROM job_creation");

    noCache(res);
    return res.json({ success: true, message: "All data cleared successfully.", data: [] });
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
   AUTO INDEX (speed): file_name par index, taaki file delete / file data fast ho.
   Agar index pehle se hai (ya column type allow nahi karta) to chupchap ignore ho jata hai.
====================================== */
const ensureIndexes = async () => {
  try {
    await query("CREATE INDEX idx_work_updates_file_name ON work_updates (file_name(191))");
    console.log("Index idx_work_updates_file_name created");
  } catch (err) {
    // ER_DUP_KEYNAME = index pehle se maujood hai, ye normal hai
    if (err && err.code !== "ER_DUP_KEYNAME") {
      console.log("Index skip:", err.message);
    }
  }
};
ensureIndexes();

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
