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

// db.query ko Promise bana diya, taaki delete/update me har query ka
// khatam hone ka wait kar sakein (pehle fire-and-forget tha).
const query = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.query(sql, params, (err, result) => (err ? reject(err) : resolve(result)));
  });

const isRealJobId = (v) => {
  const s = clean(v);
  return s !== "" && s !== "-";
};

// MySQL JSON column ho to driver already parsed object/array deta hai,
// string ho to JSON.parse karna padta hai. Dono case safe.
const safeParseJson = (val, fallback) => {
  if (val === null || val === undefined) return fallback;
  if (typeof val === "object") return val;
  if (typeof val === "string") {
    try { return JSON.parse(val); } catch { return fallback; }
  }
  return fallback;
};

// months input (array / JSON string / plain string) -> clean array
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

// Sirf wahi job_creation rows hatao jinki work_updates me ab koi row nahi bachi.
// (Agar same Job ID ki doosri work row abhi bhi hai to job_creation ko mat chhuo.)
// Note: dono tables ko SQL me aapas me compare nahi karte (collation mismatch ka
// khatra), balki Job IDs parameter ke roop me bhej kar Node me match karte hain.
const removeOrphanJobCreation = async (jobIds) => {
  const ids = [...new Set((jobIds || []).map(clean).filter(isRealJobId))];
  if (ids.length === 0) return;

  const stillUsed = await query(
    "SELECT job_id FROM work_updates WHERE TRIM(job_id) IN (?)",
    [ids]
  );
  const usedKeys = new Set((stillUsed || []).map((r) => clean(r.job_id).toLowerCase()));

  const toRemove = ids.filter((id) => !usedKeys.has(id.toLowerCase()));
  if (toRemove.length === 0) return;

  await query("DELETE FROM job_creation WHERE TRIM(jobId) IN (?)", [toRemove]);
};

/* ======================================
   CELL VALUE UNWRAPPER (formula / rich text / hyperlink)
====================================== */
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

/* ======================================
   STRICT MM-DD-YYYY DATE PARSER
====================================== */
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

/* ======================================
   FRONTEND FORMATTER
====================================== */
const formatDateToMMDDYYYY = (dateVal) => {
  if (!dateVal) return "";
  let strVal = dateVal.toString().trim();
  
  // Agar YYYY-MM-DD format me hai toh usko MM-DD-YYYY me convert karein
  const isoMatch = strVal.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    return `${month}-${day}-${year}`;
  }

  return parseExcelDate(strVal) || strVal;
};

/* ======================================
   PERCENTAGE FORMATTER FOR QC
====================================== */
const formatPercentage = (value) => {
  if (value === null || value === undefined || value === "") return "";
  let str = value.toString().trim();
  if (str === "") return "";
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

/* ======================================
   MONTH HELPERS
====================================== */
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
const fullMonthNameToIndex = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december"
].reduce((acc, m, idx) => {
  acc[m] = idx;
  return acc;
}, {});

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

  // "Oct-2024", "October-2024", "Oct/2024", "Oct 2024", "October 2024"
  m = strVal.match(/^([A-Za-z]+)[\s\-/,]+(\d{4})$/);
  if (m) {
    const key = m[1].toLowerCase();
    const monthIdx = key.length === 3 ? monthNameToIndex[key] : fullMonthNameToIndex[key];
    if (monthIdx !== undefined) {
      return `${monthNames[monthIdx]},${m[2]}`;
    }
  }

  // Last resort: let the JS Date parser try (e.g. "October 2024", "2024/10/01")
  const d = new Date(strVal);
  if (!isNaN(d.getTime())) {
    return `${monthNames[d.getMonth()]},${d.getFullYear()}`;
  }

  // Kuch bhi match na ho to raw value hi return karo (khali/gayab hone se behtar)
  return strVal;
};

const cleanMonthArray = (arr) => {
  if (!Array.isArray(arr)) return [];
  return arr.map(m => formatMonth(m)).filter(Boolean);
};

/* ======================================
   DYNAMIC UOM EXTRACTION (STRICT ECD FILTER)
====================================== */
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

/* ======================================
   HELPER TO FIND FIELD FLEXIBLY IN ROW
====================================== */
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

/* ======================================
   STATE CODE -> FULL STATE
====================================== */
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

/* ======================================
   REGION FROM STATE
====================================== */
const getRegionFromState = (state) => {
  if (!state) return "";
  const found = stateData[state];
  return found ? found.region : "";
};

/* ======================================
   COUNTY -> STATE
====================================== */
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

/* ======================================
   HELPER SYNC TO JOB CREATION
====================================== */
const helperSyncToJobCreation = (data) => {
  return new Promise((resolve) => {
    const newJobId = clean(data.cleanJobId);
    if (!newJobId || newJobId === "-") return resolve();
    const cleanSingleM = formatMonth(data.month);

    const checkSql = `
      SELECT id, jobId FROM job_creation 
      WHERE TRIM(jobId) = TRIM(?) 
      LIMIT 1
    `;

    db.query(checkSql, [newJobId], (err, rows) => {
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
   IMPORT EXCEL
====================================== */
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

        // Poori khaali row (sirf formatting wali) skip karo
        const hasAnyValue = Object.values(obj).some((v) => {
          if (v === null || v === undefined) return false;
          return v.toString().trim() !== "";
        });

        if (hasAnyValue) {
          rows.push(obj);
        }
      });

      totalRows += rows.length;

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];

        await new Promise((resolve) => {
          try {
            const domain = normalize(sheetName); 
            const sow = clean(findValueInRow(row, ["SOW"]));
            const jobType = normalize(findValueInRow(row, ["Job Type", "job_type", "job-type"]));
            const jobIdVal = clean(findValueInRow(row, ["Job ID", "job_id", "jobId", "job-id"]));
            
            const otpVal = clean(findValueInRow(row, ["OTP"]));
            const currentStatusVal = clean(findValueInRow(row, ["Current Status", "current_status", "current-status"]));
            const productionEngineersVal = clean(findValueInRow(row, ["Production Engineers", "production_engineers"]));
            const qcEngineersVal = clean(findValueInRow(row, ["QC Engineers", "qc_engineers"]));
            
            const amdocsQcVal = formatPercentage(findValueInRow(row, ["Amdocs QC", "amdocs_qc"]));
            const internalQcVal = formatPercentage(findValueInRow(row, ["Internal QC", "internal_qc"]));
            
            const receiveDateVal = parseExcelDate(findValueInRow(row, ["Receive Date", "receive_date", "receive-date", "received date", "received_date"]));
            const ecdDateVal = parseExcelDate(findValueInRow(row, ["ECD Date", "ecd_date", "ecd-date", "ecddate", "ECD"]));
            const submissionDateVal = parseExcelDate(findValueInRow(row, ["Submission Date", "submission_date", "submission-date"]));

            let rawLocation = clean(
              findValueInRow(row, ["State", "Market", "Region"])
            );

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

            const stateFromCode = getStateNameFromCode(formattedLocation);

            if (stateFromCode) {
              state = stateFromCode;
              region = getRegionFromState(state);
            } else {
              const matchedState = Object.keys(stateData).find(
                s => s.toLowerCase() === formattedLocation.toLowerCase()
              );

              if (matchedState) {
                state = matchedState;
                region = getRegionFromState(state);
              }
            }

            if (!state) {
              const countyResult = getStateFromCounty(formattedLocation);

              if (countyResult.state) {
                county = countyResult.county;
                state = countyResult.state;
                region = getRegionFromState(state);
              }
            }

            const month = formatMonth(getMonthValue(row));
            const uom = extractUOM(row);

            const insertNewRow = () => {
              const insertSql = `
                INSERT INTO work_updates
                (file_name, months, domain, sow, job_type, region, state, county, uom, otp, current_status, production_engineers, qc_engineers, amdocs_qc, internal_qc, jobs_delivered, job_id, receive_date, ecd_date, submission_date)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)
              `;

              db.query(
                insertSql,
                [
                  req.file.originalname,
                  JSON.stringify(month ? [month] : []),
                  domain,
                  sow,
                  jobType,
                  region,
                  state,
                  county,
                  JSON.stringify(uom),
                  otpVal,
                  currentStatusVal,
                  productionEngineersVal,
                  qcEngineersVal,
                  amdocsQcVal,
                  internalQcVal,
                  jobIdVal || null,
                  receiveDateVal,
                  ecdDateVal,
                  submissionDateVal
                ],
                (err3) => {
                  if (err3) {
                    failed++;
                    return resolve();
                  }

                  if (jobIdVal && jobIdVal !== "-") {
                    helperSyncToJobCreation({
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
                    }).then(() => {
                      success++;
                      resolve();
                    });
                  } else {
                    success++;
                    resolve();
                  }
                }
              );
            };

            if (jobIdVal && jobIdVal !== "-") {
              const checkSql = `SELECT id, months, uom, jobs_delivered FROM work_updates WHERE TRIM(job_id) = TRIM(?) LIMIT 1`;
              
              db.query(checkSql, [jobIdVal], (err, results) => {
                if (err) {
                  failed++;
                  return resolve();
                }

                if (results.length > 0) {
                  const existing = results[0];
                  let existingMonths = [];
                  let existingUOM = {};

                  existingMonths = safeParseJson(existing.months, []);
                  existingUOM = safeParseJson(existing.uom, {});
                  if (!Array.isArray(existingMonths)) existingMonths = existingMonths ? [existingMonths] : [];
                  if (!existingUOM || typeof existingUOM !== "object" || Array.isArray(existingUOM)) existingUOM = {};

                  const newMonth = month ? String(month).trim() : null;
                  if (newMonth && !existingMonths.includes(newMonth)) {
                    existingMonths.push(newMonth);
                  }

                  const mergedUOM = { ...existingUOM, ...uom };
                  const newJobsDelivered = (Number(existing.jobs_delivered) || 0) + 1;

                  const updateSql = `
                    UPDATE work_updates
                    SET months = ?, uom = ?, otp = COALESCE(NULLIF(?, ''), otp), current_status = COALESCE(NULLIF(?, ''), current_status), production_engineers = COALESCE(NULLIF(?, ''), production_engineers), qc_engineers = COALESCE(NULLIF(?, ''), qc_engineers), amdocs_qc = COALESCE(NULLIF(?, ''), amdocs_qc), internal_qc = COALESCE(NULLIF(?, ''), internal_qc), jobs_delivered = ?, receive_date = COALESCE(?, receive_date), ecd_date = COALESCE(?, ecd_date), submission_date = COALESCE(?, submission_date), updated_at = CURRENT_TIMESTAMP
                    WHERE id = ?
                  `;

                  db.query(
                    updateSql,
                    [
                      JSON.stringify(existingMonths),
                      JSON.stringify(mergedUOM),
                      otpVal,
                      currentStatusVal,
                      productionEngineersVal,
                      qcEngineersVal,
                      amdocsQcVal,
                      internalQcVal,
                      newJobsDelivered,
                      receiveDateVal,
                      ecdDateVal,
                      submissionDateVal,
                      existing.id
                    ],
                    (err2) => {
                      if (err2) {
                        failed++;
                        return resolve();
                      }

                      helperSyncToJobCreation({
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
                      }).then(() => {
                        success++;
                        resolve();
                      });
                    }
                  );
                } else {
                  insertNewRow();
                }
              });
            } else {
              insertNewRow();
            }

          } catch (e) {
            failed++;
            resolve();
          }
        });
      }
    }

    return res.json({
      message: "Excel imported successfully in proper order",
      totalRows,
      insertedOrUpdated: success,
      failed
    });

  } catch (err) {
    return res.status(500).json({
      message: "Import failed",
      error: err.message
    });
  }
};

/* ======================================
   SMALL HELPERS FOR CREATE / UPDATE
====================================== */
// Body se pehli defined value lo (snake_case ya camelCase dono chalein)
const pick = (obj, ...keys) => {
  for (const k of keys) {
    if (obj && obj[k] !== undefined) return obj[k];
  }
  return undefined;
};

const isBlank = (v) =>
  v === null || v === undefined || (typeof v === "string" && v.trim() === "");

const flatText = (v) => (Array.isArray(v) ? v.join(", ") : v);

/* ======================================
   CREATE WORK
====================================== */
const createWork = async (req, res) => {
  const b = req.body || {};

  // snake_case aur camelCase (month / jobId / submissionDate ...) dono accept
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
  const jobs_delivered = pick(b, "jobs_delivered");
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
    if (cleanJobId) {
      const rows = await query(
        "SELECT id FROM work_updates WHERE TRIM(job_id) = TRIM(?) LIMIT 1",
        [cleanJobId]
      );
      if (rows && rows.length > 0) existingId = rows[0].id;
    }

    let workId = existingId;

    if (existingId) {
      // Job pehle se hai -> sirf wahi fields badlo jo aayi hain.
      // (Pehle months "[]" aur baaki fields khaali hokar Report se month/date gayab ho jate the.)
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
             jobs_delivered = COALESCE(?, jobs_delivered),
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
          clean(otp),
          clean(current_status),
          clean(flatText(production_engineers)),
          clean(flatText(qc_engineers)),
          formattedInternalQc,
          formattedAmdocsQc,
          jobs_delivered !== undefined && jobs_delivered !== null && jobs_delivered !== ""
            ? Number(jobs_delivered) || 1
            : null,
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
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          JSON.stringify(parsedMonths),
          fixedDomain,
          clean(flatText(sow)),
          fixedJobType,
          clean(region),
          clean(state),
          clean(county),
          JSON.stringify(hasUom ? uomObj : {}),
          clean(otp),
          clean(current_status),
          clean(flatText(production_engineers)),
          clean(flatText(qc_engineers)),
          formattedInternalQc,
          formattedAmdocsQc,
          Number(jobs_delivered || 1),
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
      otp: clean(otp),
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

/* ======================================
   UPDATE WORK
   Sirf wahi fields badalti hai jo request me aayi hain.
   (Job History se update aane par months / dates ab mitte nahi.)
   Date/field ko jaanbujh kar khaali (null / "") bhejo to wo clear hoti hai.
====================================== */
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
  const jobs_delivered = pick(b, "jobs_delivered");
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

  // Month: khaali / na aaye to purana month rakho
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
  if (has(jobs_delivered)) setCol("jobs_delivered", Number(jobs_delivered || 0));
  if (has(current_status)) setCol("current_status", clean(current_status));
  if (has(production_engineers)) setCol("production_engineers", clean(production_engineers));
  if (has(qc_engineers)) setCol("qc_engineers", clean(qc_engineers));
  if (has(otp)) setCol("otp", clean(otp));

  const formattedInternalQc = has(internal_qc) ? formatPercentage(internal_qc) : "";
  const formattedAmdocsQc = has(amdocs_qc) ? formatPercentage(amdocs_qc) : "";
  if (has(internal_qc)) setCol("internal_qc", formattedInternalQc);
  if (has(amdocs_qc)) setCol("amdocs_qc", formattedAmdocsQc);

  const clearedDateCols = []; // job_creation me bhi clear karne wali date columns
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

    // Job ID na aaye to wahi purani Job ID maani jayegi
    const newJobId = has(job_id) ? clean(job_id) : oldJobId;
    if (has(job_id)) setCol("job_id", newJobId);

    sets.push("updated_at = CURRENT_TIMESTAMP");
    const result = await query(
      `UPDATE work_updates SET ${sets.join(", ")} WHERE id = ?`,
      [...vals, id]
    );

    // Job ID badli -> job_creation ki purani row rename karo (orphan na bane)
    const jobIdChanged =
      isRealJobId(oldJobId) && oldJobId.toLowerCase() !== newJobId.toLowerCase();

    if (jobIdChanged) {
      if (isRealJobId(newJobId)) {
        const newExists = await query(
          "SELECT id FROM job_creation WHERE TRIM(jobId) = TRIM(?) LIMIT 1",
          [newJobId]
        );
        if (newExists && newExists.length > 0) {
          await query("DELETE FROM job_creation WHERE TRIM(jobId) = TRIM(?)", [oldJobId]);
        } else {
          await query(
            "UPDATE job_creation SET jobId = ?, updated_at = CURRENT_TIMESTAMP WHERE TRIM(jobId) = TRIM(?)",
            [newJobId, oldJobId]
          );
        }
      } else {
        await query("DELETE FROM job_creation WHERE TRIM(jobId) = TRIM(?)", [oldJobId]);
      }
    }

    if (isRealJobId(newJobId)) {
      // Report me jo date clear ki gayi, wo job_creation me bhi clear ho
      // (warna getAllWork ka fallback purani date wapas dikha deta)
      for (const col of clearedDateCols) {
        await query(
          `UPDATE job_creation SET ${col} = NULL WHERE TRIM(jobId) = TRIM(?)`,
          [newJobId]
        );
      }

      await helperSyncToJobCreation({
        domain: has(domain) ? normalize(domain) : "",
        market: clean(state) || clean(region),
        cleanJobId: newJobId,
        month: latestMonth,
        receiveDate: dateVals.receiveDate,
        ecdDate: dateVals.ecdDate,
        submissionDate: dateVals.submissionDate,
        otp: has(otp) ? clean(otp) : "",
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

/* ======================================
   GETTERS (Formatted to MM-DD-YYYY for Frontend)
====================================== */
const mapWorkRow = (row) => {
  const { jc_month, jc_receive, jc_ecd, jc_submission, ...work } = row;

  let monthsArr = safeParseJson(work.months, []);
  if (!Array.isArray(monthsArr)) monthsArr = monthsArr ? [monthsArr] : [];
  monthsArr = cleanMonthArray(monthsArr);

  // work_updates me month khaali hai par Job Creation me hai -> wahi dikhao
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
    receive_date: formatDateToMMDDYYYY(dateOf(work.receive_date, jc_receive)),
    ecd_date: formatDateToMMDDYYYY(dateOf(work.ecd_date, jc_ecd)),
    submission_date: formatDateToMMDDYYYY(dateOf(work.submission_date, jc_submission)),
    lastUpdate: work.updated_at ? work.updated_at : work.created_at
  };
};

const getAllWork = async (req, res) => {
  try {
    const workRows = await query("SELECT *, updated_at FROM work_updates ORDER BY id ASC");

    // Job Creation ki month / dates alag query se laate hain aur Node me jodte hain
    // (SQL join nahi, taaki collation ki wajah se query kabhi fail na ho).
    // Ye Job Creation data sirf fallback hai: agar work_updates me month/date khaali
    // reh gayi ho to Report me wahi dikhe jo Job History me dikhta hai.
    const jcMap = new Map();
    try {
      const jcRows = await query(
        "SELECT jobId, month, receiveDate, ecdDate, submissionDate FROM job_creation"
      );
      (jcRows || []).forEach((r) => {
        const k = clean(r.jobId).toLowerCase();
        if (!isRealJobId(k)) return;
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
      const fb = jcMap.get(clean(row.job_id).toLowerCase()) || {};
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
        receive_date: formatDateToMMDDYYYY(rest.receive_date),
        ecd_date: formatDateToMMDDYYYY(rest.ecd_date),
        submission_date: formatDateToMMDDYYYY(rest.submission_date)
      };
    });

    res.json(cleaned);
  });
};

const getDomainStats = (req, res) => {
  db.query(
    `SELECT domain, SUM(jobs_delivered) AS jobs_delivered FROM work_updates GROUP BY domain`,
    (err, rows) => {
      if (err) return res.status(500).json(err);
      res.json(rows);
    }
  );
};

const getJobTypeStats = (req, res) => {
  db.query(
    `SELECT job_type AS job_type, SUM(jobs_delivered) AS jobs_delivered FROM work_updates GROUP BY job_type ORDER BY jobs_delivered DESC`,
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
      receive_date: formatDateToMMDDYYYY(r.receive_date),
      ecd_date: formatDateToMMDDYYYY(r.ecd_date),
      submission_date: formatDateToMMDDYYYY(r.submission_date)
    }));
    res.json(formatted);
  });
};

const getStateWiseJobs = (req, res) => {
  db.query(
    `SELECT state, domain, SUM(jobs_delivered) AS jobs_delivered FROM work_updates GROUP BY state, domain`,
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
    const rows = await query("SELECT job_id FROM work_updates WHERE id = ?", [workId]);
    const jobId = rows && rows.length > 0 ? clean(rows[0].job_id) : "";

    await query("DELETE FROM work_updates WHERE id = ?", [workId]);

    // Ab job_creation ka delete bhi COMPLETE hone ke baad hi response jayega.
    // Pehle response pehle chala jata tha aur frontend turant Job History
    // dobara load kar leta tha, isliye purani row dikh jati thi (aur agar
    // delete fail hota to error bhi chhup jata tha).
    // (sirf tab jab us Job ID ki koi aur work row bachi na ho)
    await removeOrphanJobCreation([jobId]);

    return res.json({ message: "Deleted from both Work Controller and Job Creation successfully" });
  } catch (err) {
    console.error("deleteWork error:", err.message);
    return res.status(500).json({ message: "Delete failed", error: err.message });
  }
};

const deleteFile = async (req, res) => {
  const fileName = req.params.fileName;

  try {
    const rows = await query("SELECT job_id FROM work_updates WHERE file_name = ?", [fileName]);
    const jobIds = [
      ...new Set((rows || []).map((r) => clean(r.job_id)).filter(isRealJobId))
    ];

    await query("DELETE FROM work_updates WHERE file_name = ?", [fileName]);

    await removeOrphanJobCreation(jobIds);

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
