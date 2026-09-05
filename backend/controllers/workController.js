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
   DATE HELPER
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

  return `${year}-${month}-${day}`;
};

/* ======================================
   MONTH HELPERS
====================================== */
const getMonthValue = (row) => {
  return (
    row["Month of Service "] ||
    row["Month of Service"] ||
    row.Month ||
    null
  );
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

const extractUOM = (row) => {
  const uom = {};

  const skipColumns = [
    "sow", "job type", "state", "market", "month", "month of service", 
    "otp", "amdocs qc", "amdocs_qc", "internal qc", "internal_qc", 
    "job id", "job_id", "jobid", "sl.no", "sl no", "footage", 
    "splice count", "receive date", "ecd date", "submission date", 
    "current status", "production engineers", "qc engineers", "region"
  ];

  Object.keys(row).forEach((key) => {
    if (!key) return;
    
    const cleanKey = key
      .replace(/\(.*\)/g, "")
      .replace(/\*/g, "")
      .trim()
      .toLowerCase(); 

    if (skipColumns.includes(cleanKey)) return;

    const value = row[key];
    if (value === "" || value === null || value === undefined) return;
    if (value instanceof Date) return;

    uom[cleanKey] = value;
  });

  return uom;
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
   IMPORT EXCEL (SEQUENTIAL ORDER MAINTAINED)
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

      worksheet.getRow(1).eachCell((cell, colNumber) => {
        headers[colNumber] = cell.value ? cell.value.toString().trim() : "";
      });

      worksheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return;

        const obj = {};
        row.eachCell((cell, colNumber) => {
          const headerName = headers[colNumber];
          if (headerName) {
            obj[headerName] = cell.value;
          }
        });

        if (Object.keys(obj).length > 0) {
          rows.push(obj);
        }
      });

      totalRows += rows.length;

      // Sequential execution taaki upar ki row pehle aur niche ki row baad me hi process ho
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];

        await new Promise((resolve) => {
          try {
            const domain = normalize(sheetName); 
            const sow = clean(row.SOW || row.sow || "");
            const jobType = normalize(row["Job Type"] || row.job_type || "");
            const jobIdVal = clean(row["Job ID"] || row.job_id || row.jobId || "");
            
            const otpVal = clean(row.OTP || row.otp || "");
            const amdocsQcVal = clean(row["Amdocs QC"] || row["AMDOCS QC"] || row.amdocs_qc || "");
            const internalQcVal = clean(row["Internal QC"] || row["INTERNAL QC"] || row.internal_qc || "");
            
            const receiveDateVal = parseExcelDate(row["Receive Date"] || row.receive_date);
            const ecdDateVal = parseExcelDate(row["ECD Date"] || row.ecd_date);
            const submissionDateVal = parseExcelDate(row["Submission Date"] || row.submission_date);

            let rawLocation = clean(
              row.State ||
              row.STATE ||
              row.state ||
              row.Market ||
              row.market ||
              row.Region
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
                    SET months = ?, uom = ?, otp = ?, amdocs_qc = ?, internal_qc = ?, jobs_delivered = ?, receive_date = COALESCE(?, receive_date), ecd_date = COALESCE(?, ecd_date), submission_date = COALESCE(?, submission_date), updated_at = CURRENT_TIMESTAMP
                    WHERE id = ?
                  `;

                  db.query(
                    updateSql,
                    [
                      JSON.stringify(existingMonths),
                      JSON.stringify(mergedUOM),
                      otpVal,
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
                (file_name, months, domain, sow, job_type, region, state, county, uom, otp, amdocs_qc, internal_qc, jobs_delivered, job_id, receive_date, ecd_date, submission_date)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)
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
        SET months = ?, domain = ?, sow = ?, job_type = ?, region = ?, state = ?, county = ?, uom = ?, otp = ?, internal_qc = ?, amdocs_qc = ?, jobs_delivered = ?, receive_date = COALESCE(?, receive_date), ecd_date = COALESCE(?, ecd_date), submission_date = COALESCE(?, submission_date), updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `;
      db.query(updateSql, [JSON.stringify(parsedMonths), fixedDomain, sow, fixedJobType, region, state, county, JSON.stringify(uom || {}), clean(otp), clean(internal_qc), clean(amdocs_qc), Number(jobs_delivered || 1), receive_date || null, ecd_date || null, submission_date || null, existingId], (err) => {
        if (err) return res.status(500).json(err);
        syncToJobCreation(existingId);
      });
    } else {
      const insertSql = `
        INSERT INTO work_updates
        (months, domain, sow, job_type, region, state, county, uom, otp, internal_qc, amdocs_qc, jobs_delivered, job_id, receive_date, ecd_date, submission_date)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;
      db.query(insertSql, [JSON.stringify(parsedMonths), fixedDomain, sow, fixedJobType, region, state, county, JSON.stringify(uom || {}), clean(otp), clean(internal_qc), clean(amdocs_qc), Number(jobs_delivered || 1), cleanJobId, receive_date || null, ecd_date || null, submission_date || null], (err, result) => {
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
      receiveDate: receive_date || null,
      ecdDate: ecd_date || null,
      submissionDate: submission_date || null,
      otp: clean(otp),
      amdocsQc: clean(amdocs_qc),
      internalQc: clean(internal_qc)
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
      clean(internal_qc),
      clean(amdocs_qc),
      receive_date || null,
      ecd_date || null,
      submission_date || null,
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
          receiveDate: receive_date || null,
          ecdDate: ecd_date || null,
          submissionDate: submission_date || null,
          otp: clean(otp),
          amdocsQc: clean(amdocs_qc),
          internalQc: clean(internal_qc)
        });
      }

      res.json({
        message: "Updated successfully and synced to Job Creation",
        result
      });
    }
  );
};

/* ======================================
   GETTERS (FIXED ORDER: ID KE HISAB SE)
====================================== */
const getAllWork = (req, res) => {
  // Yahan ORDER BY id ASC kar diya hai taaki jaise data insert hua tha wahi sequence frontend par dikhe
  db.query(
    "SELECT *, updated_at FROM work_updates ORDER BY id ASC",
    (err, rows) => {
      if (err) return res.status(500).json(err);

      const data = rows.map((row) => {
        let monthsArr = [];
        try { 
          monthsArr = row.months ? JSON.parse(row.months) : []; 
        } catch { 
          monthsArr = row.months ? [row.months] : []; 
        }

        monthsArr = cleanMonthArray(monthsArr);

        const displayMonth = Array.isArray(monthsArr) && monthsArr.length > 0 
          ? monthsArr[monthsArr.length - 1] 
          : "";

        return {
          ...row,
          month: displayMonth,
          months: monthsArr,
          uom: row.uom ? JSON.parse(row.uom) : {},
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
      return rest;
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
    res.json(rows);
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
