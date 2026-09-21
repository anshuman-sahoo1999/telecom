const db = require("../config/db");
const ExcelJS = require("exceljs");
const fs = require("fs");
const path = require("path");

const stateData = require("../stateCodes");
const countyData = require("../counties.json");

const clean = (v) => {
  return v ? v.toString().trim() : "";
};

const normalize = (v) => clean(v).toUpperCase();

/* ======================================
   DATE HELPER (Database Insertion Format)
====================================== */
const parseExcelDate = (value) => {
  if (!value) return null;
  
  let d;
  if (value instanceof Date) {
    d = value;
  } else {
    d = new Date(value);
  }

  if (isNaN(d)) return null;

  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');

  // MySQL DATE type ke liye standard YYYY-MM-DD return karte hain taaki query fail na ho
  return `${year}-${month}-${day}`;
};

/* ======================================
   FORMAT DATE FOR FRONTEND (MM-DD-YYYY)
====================================== */
const formatDateToMMDDYYYY = (dateVal) => {
  if (!dateVal) return "";
  let d = new Date(dateVal);
  if (isNaN(d.getTime())) return dateVal.toString();

  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');

  return `${month}-${day}-${year}`;
};

/* ======================================
   PERCENTAGE FORMATTER FOR QC
====================================== */
const formatPercentage = (value) => {
  if (value === null || value === undefined || value === "") return "";
  let str = value.toString().trim();
  if (str.endsWith("%")) return str;

  let num = Number(str);
  if (!isNaN(num)) {
    if (num > 0 && num <= 1) {
      return `${Math.round(num * 100)}%`;
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

const formatMonth = (value) => {
  if (!value) return null;

  const months = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
  ];

  let strVal = String(value).trim();
  strVal = strVal.replace(/-\d{2,4}/g, "").trim();

  let d = new Date(strVal);

  if (!isNaN(d.getTime())) {
    return `${months[d.getMonth()]},${d.getFullYear()}`;
  }

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
      let value = row[key];
      if (value && typeof value === 'object' && value.text) {
        value = value.text;
      }
      if (value !== "" && value !== null && value !== undefined && !(value instanceof Date)) {
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
        let val = row[key];
        if (val && typeof val === 'object' && val.text) {
          val = val.text;
        }
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
  const newJobId = clean(data.cleanJobId);
  if (!newJobId || newJobId === "-") return;
  const cleanSingleM = formatMonth(data.month);

  const checkSql = `
    SELECT id, jobId FROM job_creation 
    WHERE TRIM(jobId) = TRIM(?) 
    LIMIT 1
  `;

  db.query(checkSql, [newJobId], (err, rows) => {
    if (err) return console.error("Error checking job_creation:", err.message);

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
      });
    }
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
        const cellVal = headerRow.getCell(col).value;
        headers[col] = cellVal ? cellVal.toString().trim() : "";
      }

      worksheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return;

        const obj = {};
        for (let col = 1; col <= totalColumns; col++) {
          const headerName = headers[col];
          if (headerName) {
            let cellVal = row.getCell(col).value;
            if (cellVal && typeof cellVal === 'object' && cellVal.text) {
              cellVal = cellVal.text;
            }
            obj[headerName] = cellVal;
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
                      if (!err2) {
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
                        });
                        success++;
                      } else {
                        failed++;
                      }
                      resolve();
                    }
                  );
                } else {
                  insertNewRow();
                }
              });
            } else {
              insertNewRow();
            }

            function insertNewRow() {
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
                  if (!err3) {
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
                      });
                    }
                    success++;
                  } else {
                    failed++;
                  }
                  resolve();
                }
              );
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

  const syncToJobCreation = (workId) => {
    helperSyncToJobCreation({
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
const updateWork = (req, res) => {
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

  db.query(
    sql,
    [
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
    ],
    (err, result) => {
      if (err) {
        return res.status(500).json({
          message: "Update failed",
          error: err
        });
      }

      if (cleanJobId && cleanJobId !== "-") {
        helperSyncToJobCreation({
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

      res.json({
        message: "Updated successfully and synced to Job Creation",
        result
      });
    }
  );
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
const deleteWork = (req, res) => {
  const workId = req.params.id;

  db.query("SELECT job_id FROM work_updates WHERE id = ?", [workId], (findErr, rows) => {
    const jobId = (!findErr && rows && rows.length > 0) ? rows[0].job_id : null;

    db.query("DELETE FROM work_updates WHERE id = ?", [workId], (err) => {
      if (err) return res.status(500).json(err);

      if (jobId && jobId !== "-" && jobId !== "") {
        db.query("DELETE FROM job_creation WHERE TRIM(jobId) = TRIM(?)", [jobId], () => {});
      }

      res.json({ message: "Deleted from both Work Controller and Job Creation successfully" });
    });
  });
};

const deleteFile = (req, res) => {
  const fileName = req.params.fileName;
  
  db.query("SELECT job_id FROM work_updates WHERE file_name = ?", [fileName], (findErr, rows) => {
    const jobIds = (!findErr && rows) ? rows.map(r => r.job_id).filter(j => j && j !== "-") : [];

    db.query("DELETE FROM work_updates WHERE file_name = ?", [fileName], (err) => {
      if (err) return res.status(500).json(err);

      if (jobIds.length > 0) {
        db.query("DELETE FROM job_creation WHERE jobId IN (?)", [jobIds], () => {});
      }

      res.json({ message: "File and related jobs deleted successfully from both places" });
    });
  });
};

const clearWork = (req, res) => {
  db.query("DELETE FROM work_updates", (err) => {
    if (err) return res.status(500).json(err);
    
    db.query("DELETE FROM job_creation", () => {});

    res.json({ message: "All data cleared from both places" });
  });
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
