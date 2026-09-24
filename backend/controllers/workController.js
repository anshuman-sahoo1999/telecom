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

        if (Object.keys(obj).length > 0) {
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

                  try { existingMonths = JSON.parse(existing.months || "[]"); } catch { existingMonths = []; }
                  try { existingUOM = JSON.parse(existing.uom || "{}"); } catch { existingUOM = {}; }

                  const newMonth = month ? String(month).trim() : null;
                  if (newMonth && !existingMonths.includes(newMonth)) {
                    existingMonths.push(newMonth);
                  }

                  const mergedUOM = { ...existingUOM, ...uom };
                  const newJobsDelivered = (Number(existing.jobs_delivered) || 0) + 1;

                  const updateSql = `
                    UPDATE work_updates
                    SET months = ?, uom = ?, otp = ?, current_status = ?, production_engineers = ?, qc_engineers = ?, amdocs_qc = ?, internal_qc = ?, jobs_delivered = ?, receive_date = COALESCE(?, receive_date), ecd_date = COALESCE(?, ecd_date), submission_date = COALESCE(?, submission_date), updated_at = CURRENT_TIMESTAMP
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
   CREATE WORK
====================================== */
const createWork = (req, res) => {
  const {
    months,
    domain,
    sow,
    job_type,
    region,
    state,
    county,
    uom,
    otp,
    current_status,
    production_engineers,
    qc_engineers,
    internal_qc,
    amdocs_qc,
    jobs_delivered,
    job_id,
    receive_date,
    ecd_date,
    submission_date
  } = req.body;

  const fixedDomain = normalize(domain);
  const fixedJobType = normalize(job_type);
  const cleanJobId = clean(job_id);

  const formattedInternalQc = formatPercentage(internal_qc);
  const formattedAmdocsQc = formatPercentage(amdocs_qc);
  
  const formattedReceiveDate = parseExcelDate(receive_date);
  const formattedEcdDate = parseExcelDate(ecd_date);
  const formattedSubmissionDate = parseExcelDate(submission_date);
  
  let parsedMonths = [];
  if (Array.isArray(months)) {
    parsedMonths = months;
  } else if (typeof months === "string" && months.trim() !== "") {
    try { parsedMonths = JSON.parse(months); } catch { parsedMonths = [months]; }
  }
  parsedMonths = cleanMonthArray(parsedMonths);
  const firstMonth = parsedMonths.length > 0 ? parsedMonths[0] : null;

  const checkSql = cleanJobId ? `SELECT id FROM work_updates WHERE TRIM(job_id) = TRIM(?) LIMIT 1` : null;

  const executeSave = (existingId = null) => {
    if (existingId) {
      const updateSql = `
        UPDATE work_updates
        SET months = ?, domain = ?, sow = ?, job_type = ?, region = ?, state = ?, county = ?, uom = ?, otp = ?, current_status = ?, production_engineers = ?, qc_engineers = ?, internal_qc = ?, amdocs_qc = ?, jobs_delivered = ?, receive_date = COALESCE(?, receive_date), ecd_date = COALESCE(?, ecd_date), submission_date = COALESCE(?, submission_date), updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `;
      db.query(updateSql, [JSON.stringify(parsedMonths), fixedDomain, sow, fixedJobType, region, state, county, JSON.stringify(uom || {}), clean(otp), clean(current_status), clean(production_engineers), clean(qc_engineers), formattedInternalQc, formattedAmdocsQc, Number(jobs_delivered || 1), formattedReceiveDate, formattedEcdDate, formattedSubmissionDate, existingId], (err) => {
        if (err) return res.status(500).json(err);
        syncToJobCreation(existingId);
      });
    } else {
      const insertSql = `
        INSERT INTO work_updates
        (months, domain, sow, job_type, region, state, county, uom, otp, current_status, production_engineers, qc_engineers, internal_qc, amdocs_qc, jobs_delivered, job_id, receive_date, ecd_date, submission_date)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;
      db.query(insertSql, [JSON.stringify(parsedMonths), fixedDomain, sow, fixedJobType, region, state, county, JSON.stringify(uom || {}), clean(otp), clean(current_status), clean(production_engineers), clean(qc_engineers), formattedInternalQc, formattedAmdocsQc, Number(jobs_delivered || 1), cleanJobId, formattedReceiveDate, formattedEcdDate, formattedSubmissionDate], (err, result) => {
        if (err) return res.status(500).json(err);
        syncToJobCreation(result.insertId);
      });
    }
  };

  const syncToJobCreation = async (workId) => {
    await helperSyncToJobCreation({
      domain: fixedDomain,
      market: state || region,
      cleanJobId,
      month: firstMonth,
      receiveDate: formattedReceiveDate,
      ecdDate: formattedEcdDate,
      submissionDate: formattedSubmissionDate,
      otp: clean(otp),
      amdocsQc: formattedAmdocsQc,
      internalQc: formattedInternalQc
    });

    res.json({
      message: "Work added and synced successfully",
      id: workId
    });
  };

  if (checkSql) {
    db.query(checkSql, [cleanJobId], (err, rows) => {
      if (!err && rows.length > 0) {
        executeSave(rows[0].id);
      } else {
        executeSave(null);
      }
    });
  } else {
    executeSave(null);
  }
};

/* ======================================
   UPDATE WORK
====================================== */
const updateWork = async (req, res) => {
  const { id } = req.params;
  const {
    months,
    domain,
    sow,
    job_type,
    region,
    state,
    county,
    uom,
    jobs_delivered,
    job_id,
    current_status,
    production_engineers,
    qc_engineers,
    otp,
    internal_qc,
    amdocs_qc,
    receive_date,
    ecd_date,
    submission_date
  } = req.body;

  const fixedDomain = normalize(domain);
  const fixedJobType = normalize(job_type);
  const cleanJobId = clean(job_id);

  const formattedInternalQc = formatPercentage(internal_qc);
  const formattedAmdocsQc = formatPercentage(amdocs_qc);

  const formattedReceiveDate = parseExcelDate(receive_date);
  const formattedEcdDate = parseExcelDate(ecd_date);
  const formattedSubmissionDate = parseExcelDate(submission_date);

  let parsedMonths = [];
  if (Array.isArray(months)) {
    parsedMonths = months;
  } else if (typeof months === "string" && months.trim() !== "") {
    try { 
      const temp = JSON.parse(months); 
      parsedMonths = Array.isArray(temp) ? temp : [months];
    } catch { 
      parsedMonths = [months.trim()]; 
    }
  }
  parsedMonths = cleanMonthArray(parsedMonths);
  const latestMonth = parsedMonths.length > 0 ? parsedMonths[parsedMonths.length - 1] : null;

  const sql = `
    UPDATE work_updates
    SET
      months = ?,
      domain = ?,
      sow = ?,
      job_type = ?,
      region = ?,
      state = ?,
      county = ?,
      uom = ?,
      jobs_delivered = ?,
      job_id = ?,
      current_status = ?,
      production_engineers = ?,
      qc_engineers = ?,
      otp = ?,
      internal_qc = ?,
      amdocs_qc = ?,
      receive_date = ?,
      ecd_date = ?,
      submission_date = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `;

  try {
    // Update se pehle purani Job ID yaad rakho.
    // Agar Job ID badli aur job_creation me purani wali row chhod di,
    // to wo "orphan" ban jati hai: Report se delete karne ke baad bhi
    // Job History me dikhti rehti hai.
    const oldRows = await query("SELECT job_id FROM work_updates WHERE id = ?", [id]);
    const oldJobId = oldRows && oldRows.length > 0 ? clean(oldRows[0].job_id) : "";

    const result = await query(sql, [
      JSON.stringify(parsedMonths),
      fixedDomain,
      sow,
      fixedJobType,
      region,
      state,
      county,
      JSON.stringify(uom || {}),
      Number(jobs_delivered || 0),
      cleanJobId,
      clean(current_status),
      clean(production_engineers),
      clean(qc_engineers),
      clean(otp),
      formattedInternalQc,
      formattedAmdocsQc,
      formattedReceiveDate,
      formattedEcdDate,
      formattedSubmissionDate,
      id
    ]);

    const jobIdChanged =
      isRealJobId(oldJobId) && oldJobId.toLowerCase() !== cleanJobId.toLowerCase();

    if (jobIdChanged) {
      if (isRealJobId(cleanJobId)) {
        const newExists = await query(
          "SELECT id FROM job_creation WHERE TRIM(jobId) = TRIM(?) LIMIT 1",
          [cleanJobId]
        );
        if (newExists && newExists.length > 0) {
          // Nayi Job ID ki row pehle se hai -> purani wali hata do (duplicate/orphan na bane)
          await query("DELETE FROM job_creation WHERE TRIM(jobId) = TRIM(?)", [oldJobId]);
        } else {
          // Nayi row banane ki jagah purani row ka jobId rename karo
          await query(
            "UPDATE job_creation SET jobId = ?, updated_at = CURRENT_TIMESTAMP WHERE TRIM(jobId) = TRIM(?)",
            [cleanJobId, oldJobId]
          );
        }
      } else {
        // Job ID hata di / "-" kar di -> purani job_creation row ka ab koi matlab nahi
        await query("DELETE FROM job_creation WHERE TRIM(jobId) = TRIM(?)", [oldJobId]);
      }
    }

    if (isRealJobId(cleanJobId)) {
      await helperSyncToJobCreation({
        domain: fixedDomain,
        market: state || region,
        cleanJobId,
        month: latestMonth,
        receiveDate: formattedReceiveDate,
        ecdDate: formattedEcdDate,
        submissionDate: formattedSubmissionDate,
        otp: clean(otp),
        amdocsQc: formattedAmdocsQc,
        internalQc: formattedInternalQc
      });
    }

    return res.json({
      message: "Updated successfully and synced to Job Creation",
      result
    });
  } catch (err) {
    return res.status(500).json({
      message: "Update failed",
      error: err
    });
  }
};

const safeParseJson = (val, fallback) => {
  if (val === null || val === undefined) return fallback;
  if (typeof val === "object") return val;
  if (typeof val === "string") {
    try { return JSON.parse(val); } catch { return fallback; }
  }
  return fallback;
};

/* ======================================
   GETTERS (Formatted to MM-DD-YYYY for Frontend)
====================================== */
const getAllWork = (req, res) => {
  db.query(
    "SELECT *, updated_at FROM work_updates ORDER BY id ASC",
    (err, rows) => {
      if (err) return res.status(500).json(err);

      const data = (rows || []).map((row) => {
        let monthsArr = safeParseJson(row.months, []);
        if (!Array.isArray(monthsArr)) monthsArr = monthsArr ? [monthsArr] : [];

        monthsArr = cleanMonthArray(monthsArr);

        const displayMonth = Array.isArray(monthsArr) && monthsArr.length > 0 
          ? monthsArr[monthsArr.length - 1] 
          : "";

        return {
          ...row,
          month: displayMonth,
          months: monthsArr,
          uom: safeParseJson(row.uom, {}),
          receive_date: formatDateToMMDDYYYY(row.receive_date),
          ecd_date: formatDateToMMDDYYYY(row.ecd_date),
          submission_date: formatDateToMMDDYYYY(row.submission_date),
          lastUpdate: row.updated_at ? row.updated_at : row.created_at
        };
      });

      res.json(data);
    }
  );
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
    if (isRealJobId(jobId)) {
      await query("DELETE FROM job_creation WHERE TRIM(jobId) = TRIM(?)", [jobId]);
    }

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

    if (jobIds.length > 0) {
      await query("DELETE FROM job_creation WHERE TRIM(jobId) IN (?)", [jobIds]);
    }

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
