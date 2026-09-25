const db = require("../config/db");

const clean = (v) => (v !== undefined && v !== null ? v.toString().trim() : "");
const normalize = (v) => clean(v).toUpperCase();

let stateData = {};
try {
  stateData = require("../stateCodes") || {};
} catch (e) {
  stateData = {};
}

const regionFromMarket = (market) => {
  const raw = clean(market).toUpperCase();
  if (!raw) return "";
  for (const name of Object.keys(stateData)) {
    const info = stateData[name] || {};
    if (name.toUpperCase() === raw || clean(info.code).toUpperCase() === raw) {
      return info.region || "";
    }
  }
  return "";
};
const monthsParam = (m) => (m ? JSON.stringify([m]) : null);
const WORK_INSERT_SQL = `
  INSERT INTO work_updates
  (domain, state, region, job_id, months, receive_date, ecd_date, submission_date,
   amdocs_qc, internal_qc, otp, sow, job_type, county, current_status,
   production_engineers, qc_engineers, jobs_delivered, uom)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '', '', '', '', '', '', 1, '{}')
`;
const workInsertParams = ({ domain, state, jobId, month, receiveDate, ecdDate, submissionDate, amdocsQc, internalQc, otp }) => [
  domain || null,
  state || null,
  regionFromMarket(state) || "",
  jobId,
  JSON.stringify(month ? [month] : []),
  receiveDate || null,
  ecdDate || null,
  submissionDate || null,
  amdocsQc || null,
  internalQc || null,
  otp || null,
];

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

const cleanSingleMonth = (m) => {
  let strVal = clean(m);
  if (!strVal) return null;

  if (/^[A-Za-z]{3},\d{4}$/.test(strVal)) return strVal;

  let match = strVal.match(/^(\d{4})-(\d{1,2})(?:-\d{1,2})?$/);
  if (match) {
    const monthIdx = Number(match[2]) - 1;
    if (monthIdx >= 0 && monthIdx <= 11) return `${monthNames[monthIdx]},${match[1]}`;
  }

  match = strVal.match(/^(\d{1,2})[-/](\d{4})$/);
  if (match) {
    const monthIdx = Number(match[1]) - 1;
    if (monthIdx >= 0 && monthIdx <= 11) return `${monthNames[monthIdx]},${match[2]}`;
  }

  match = strVal.match(/^([A-Za-z]+)[\s\-/,]+(\d{4})$/);
  if (match) {
    const key = match[1].toLowerCase();
    const monthIdx = key.length === 3 ? monthNameToIndex[key] : fullMonthNameToIndex[key];
    if (monthIdx !== undefined) return `${monthNames[monthIdx]},${match[2]}`;
  }

  const d = new Date(strVal);
  if (!isNaN(d.getTime())) return `${monthNames[d.getMonth()]},${d.getFullYear()}`;

  return strVal;
};

exports.createJob = (req, res) => {
 try {
  let {
    domain,
    market,
    jobId,
    receiveDate,
    receivedDate,
    ecdDate,
    submissionDate,
    month,
    amdocsQc,
    amdocs_qc,
    internalQc,
    internal_qc,
    otp,
    internalOtp
  } = req.body || {};

  const finalReceiveDate = receiveDate || receivedDate || null;
  const formattedEcdDate = ecdDate && ecdDate !== "" ? ecdDate : null;
  const formattedSubmissionDate = submissionDate && submissionDate !== "" ? submissionDate : null;

  const finalAmdocsQc = amdocsQc !== undefined ? amdocsQc : (amdocs_qc || null);
  const finalInternalQc = internalQc !== undefined ? internalQc : (internal_qc || null);
  const finalOtp = otp || internalOtp || null;

  const cleanJobId = clean(jobId);
  const cleanDomain = normalize(domain);
  const cleanMarket = clean(market);
  const cleanMonth = cleanSingleMonth(month);

  const checkSql = `SELECT id FROM job_creation WHERE TRIM(jobId) = TRIM(?) LIMIT 1`;

  db.query(checkSql, [cleanJobId], (checkErr, checkRows) => {
    if (checkErr) {
      return res.status(500).json({ success: false, message: checkErr.message });
    }

    if (checkRows && checkRows.length > 0) {
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
        WHERE TRIM(jobId) = TRIM(?)
      `;
      db.query(updateSql, [cleanDomain, cleanMarket, cleanMonth, finalReceiveDate, formattedEcdDate, formattedSubmissionDate, finalOtp, finalAmdocsQc, finalInternalQc, cleanJobId], (upErr) => {
        if (upErr) return res.status(500).json({ success: false, message: upErr.message });
        syncToWorkController();
      });
    } else {
      const insertSql = `
        INSERT INTO job_creation (domain, market, jobId, month, receiveDate, ecdDate, submissionDate, otp, amdocsQc, internalQc)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;
      db.query(insertSql, [cleanDomain, cleanMarket, cleanJobId, cleanMonth, finalReceiveDate, formattedEcdDate, formattedSubmissionDate, finalOtp, finalAmdocsQc, finalInternalQc], (inErr, inResult) => {
        if (inErr) return res.status(500).json({ success: false, message: inErr.message });
        syncToWorkController(inResult.insertId);
      });
    }
  });

  function syncToWorkController(newId = null) {
    if (!cleanJobId || cleanJobId === "-") {
      return res.json({
        success: true,
        message: "Job saved successfully",
        id: newId
      });
    }

    const checkWorkSql = `SELECT id FROM work_updates WHERE TRIM(job_id) = TRIM(?) LIMIT 1`;
    db.query(checkWorkSql, [cleanJobId], (wErr, wRows) => {
      if (!wErr && wRows && wRows.length > 0) {
        const updateWorkSql = `
          UPDATE work_updates
          SET domain = COALESCE(NULLIF(?, ''), domain),
              state = COALESCE(NULLIF(?, ''), state),
              region = COALESCE(NULLIF(region, ''), NULLIF(?, '')),
              months = COALESCE(?, months),
              receive_date = COALESCE(?, receive_date),
              ecd_date = COALESCE(?, ecd_date),
              submission_date = COALESCE(?, submission_date),
              amdocs_qc = COALESCE(NULLIF(?, ''), amdocs_qc),
              internal_qc = COALESCE(NULLIF(?, ''), internal_qc),
              otp = COALESCE(NULLIF(?, ''), otp),
              updated_at = CURRENT_TIMESTAMP
          WHERE TRIM(job_id) = TRIM(?)
        `;
        db.query(updateWorkSql, [cleanDomain, cleanMarket, regionFromMarket(cleanMarket), monthsParam(cleanMonth), finalReceiveDate, formattedEcdDate, formattedSubmissionDate, finalAmdocsQc, finalInternalQc, finalOtp, cleanJobId], (uwErr) => {
          if (uwErr) return res.status(500).json({ success: false, message: uwErr.message });
          return res.json({
            success: true,
            message: "Job synced successfully with correct QC, OTP & month",
            id: newId
          });
        });
      } else {
        db.query(WORK_INSERT_SQL, workInsertParams({
          domain: cleanDomain, state: cleanMarket, jobId: cleanJobId, month: cleanMonth,
          receiveDate: finalReceiveDate, ecdDate: formattedEcdDate, submissionDate: formattedSubmissionDate,
          amdocsQc: finalAmdocsQc, internalQc: finalInternalQc, otp: finalOtp
        }), (iwErr) => {
          if (iwErr) {
            if (newId) db.query("DELETE FROM job_creation WHERE id = ?", [newId], () => {});
            return res.status(500).json({ success: false, message: iwErr.message });
          }
          return res.json({
            success: true,
            message: "Job inserted successfully into Work Controller with QC & OTP",
            id: newId
          });
        });
      }
    });
  }
 } catch (e) {
  console.error("createJob crashed:", e.message);
  return res.status(500).json({ success: false, message: e.message });
 }
};

exports.getAllJobs = (req, res) => {
 try {
  const queryJC = "SELECT id, jobId, domain, market, month, receiveDate, ecdDate, submissionDate, otp, amdocsQc, internalQc, updated_at FROM job_creation";
  const queryWU = "SELECT id, job_id AS jobId, domain, state AS market, months, receive_date AS receiveDate, ecd_date AS ecdDate, submission_date AS submissionDate, amdocs_qc, internal_qc, otp, updated_at FROM work_updates WHERE job_id IS NOT NULL AND job_id != '-' AND job_id != ''";

  db.query(queryJC, (errJC, jcRows) => {
    if (errJC) {
      return res.status(500).json({ success: false, message: errJC.message });
    }
    db.query(queryWU, (errWU, wuRows) => {
      if (errWU) {
        return res.status(500).json({ success: false, message: errWU.message });
      }
      const keyOf = (v) => (v ? v.toString().trim().toLowerCase() : "");
      const isValidKey = (k) => k !== "" && k !== "-";
      const workJobKeys = new Set();
      wuRows.forEach((row) => {
        const k = keyOf(row.jobId);
        if (isValidKey(k)) workJobKeys.add(k);
      });

      const monthFromWork = (val) => {
        let v = val;
        if (typeof v === "string") {
          try { v = JSON.parse(v); } catch { /* plain text month */ }
        }
        if (Array.isArray(v)) return v.length > 0 ? v[v.length - 1] : null;
        return v || null;
      };

      const jobMap = new Map();

      jcRows.forEach((row) => {
        const k = keyOf(row.jobId);
        if (!isValidKey(k)) return;
        if (!workJobKeys.has(k)) return; 

        jobMap.set(k, {
          ...row,
          jobId: row.jobId.toString().trim(),
          id: row.id,
          jcId: row.id,
          workId: null,
        });
      });

      wuRows.forEach((row) => {
        const k = keyOf(row.jobId);
        if (!isValidKey(k)) return;

        if (jobMap.has(k)) {
          const existing = jobMap.get(k);
          jobMap.set(k, {
            ...existing,

            domain: row.domain || existing.domain,
            market: row.market || existing.market,
            month: existing.month || monthFromWork(row.months),
            submissionDate: row.submissionDate || existing.submissionDate,
            receiveDate: row.receiveDate || existing.receiveDate,
            ecdDate: row.ecdDate || existing.ecdDate,
            amdocs_qc: row.amdocs_qc || existing.amdocs_qc,
            internal_qc: row.internal_qc || existing.internal_qc,
            otp: row.otp || existing.otp,
            updated_at: row.updated_at || existing.updated_at,
            workId: row.id,
          });
        } else {
          const { months: workMonths, ...rowNoMonths } = row;
          jobMap.set(k, {
            ...rowNoMonths,
            month: monthFromWork(workMonths),
            jobId: row.jobId.toString().trim(),
            id: row.id,
            jcId: null,
            workId: row.id,
          });
        }
      });

      res.json(Array.from(jobMap.values()));
    });
  });
 } catch (e) {
  console.error("getAllJobs crashed:", e.message);
  return res.status(500).json({ success: false, message: e.message });
 }
};

exports.updateJob = (req, res) => {
 try {
  const {
    internalQc, internal_qc,
    amdocsQc, amdocs_qc,
    otp, internalOtp,
    domain,
    market,
    receiveDate, receive_date,
    ecdDate, ecd_date,
    submissionDate, submission_date,
    month,
    jobId,
    newJobId,
    jcId,
    workId
  } = req.body || {};

  const paramId = clean(req.params.id);

  const requestedJobId = clean(jobId) || paramId;

  const cleanNewJobId = clean(newJobId) || requestedJobId;

  const finalInternalQc = internalQc !== undefined ? internalQc : (internal_qc || null);
  const finalAmdocsQc = amdocsQc !== undefined ? amdocsQc : (amdocs_qc || null);
  const finalOtp = otp || internalOtp || null;
  const cleanMonth = cleanSingleMonth(month);
  const finalReceiveDate = (receiveDate || receive_date) || null;
  const finalEcdDate = (ecdDate || ecd_date) || null;
  const finalSubmissionDate = (submissionDate || submission_date) || null;

  const cleanJcId = clean(jcId);
  const cleanWorkId = clean(workId);

  if (!paramId && !requestedJobId && !cleanJcId && !cleanWorkId) {
    return res.status(400).json({ success: false, message: "A row ID or Job ID is required for updating." });
  }

  const findWorkSql = cleanWorkId
    ? `SELECT id, job_id FROM work_updates WHERE id = ? LIMIT 1`
    : `SELECT id, job_id FROM work_updates WHERE TRIM(job_id) = TRIM(?) LIMIT 1`;
  const findWorkParam = cleanWorkId || requestedJobId;

  db.query(findWorkSql, [findWorkParam], (wErr, wRows) => {
    if (wErr) {
      return res.status(500).json({ success: false, message: wErr.message });
    }

    const updateWorkIfExists = (cb) => {
      if (!wRows || wRows.length === 0) return cb();
      const updateWorkSql = `
        UPDATE work_updates
        SET amdocs_qc = COALESCE(NULLIF(?, ''), amdocs_qc),
            otp = COALESCE(NULLIF(?, ''), otp),
            internal_qc = COALESCE(NULLIF(?, ''), internal_qc),
            domain = COALESCE(NULLIF(?, ''), domain),
            state = COALESCE(NULLIF(?, ''), state),
            region = COALESCE(NULLIF(region, ''), NULLIF(?, '')),
            months = COALESCE(?, months),
            receive_date = COALESCE(?, receive_date),
            ecd_date = COALESCE(?, ecd_date),
            submission_date = COALESCE(?, submission_date),
            job_id = COALESCE(NULLIF(?, ''), job_id),
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `;
      db.query(
        updateWorkSql,
        [
          finalAmdocsQc, finalOtp, finalInternalQc,
          domain || null, market || null,
          regionFromMarket(market),
          monthsParam(cleanMonth),
          finalReceiveDate, finalEcdDate, finalSubmissionDate,
          cleanNewJobId,
          wRows[0].id
        ],
        (upWerr) => cb(upWerr)
      );
    };

    const findJcSql = cleanJcId
      ? `SELECT id FROM job_creation WHERE id = ? LIMIT 1`
      : `SELECT id FROM job_creation WHERE TRIM(jobId) = TRIM(?) LIMIT 1`;
    const findJcParam = cleanJcId || requestedJobId;

    db.query(findJcSql, [findJcParam], (jErr, jRows) => {
      if (jErr) {
        return res.status(500).json({ success: false, message: jErr.message });
      }

      const upsertJc = (cb) => {
        if (jRows && jRows.length > 0) {
          const updateJcSql = `
            UPDATE job_creation
            SET jobId = COALESCE(NULLIF(?, ''), jobId),
                domain = COALESCE(NULLIF(?, ''), domain),
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
          db.query(
            updateJcSql,
            [
              cleanNewJobId, domain || null, market || null, cleanMonth,
              finalReceiveDate, finalEcdDate, finalSubmissionDate,
              finalOtp, finalAmdocsQc, finalInternalQc,
              jRows[0].id
            ],
            (upJerr) => cb(upJerr)
          );
        } else if (cleanNewJobId && cleanNewJobId !== "-") {

          const insertJcSql = `
            INSERT INTO job_creation (domain, market, jobId, month, receiveDate, ecdDate, submissionDate, otp, amdocsQc, internalQc)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `;
          db.query(
            insertJcSql,
            [
              domain || null, market || null, cleanNewJobId, cleanMonth,
              finalReceiveDate, finalEcdDate, finalSubmissionDate,
              finalOtp, finalAmdocsQc, finalInternalQc
            ],
            (inJerr) => cb(inJerr)
          );
        } else {
          cb(null);
        }
      };

      updateWorkIfExists((upWerr) => {
        if (upWerr) {
          return res.status(500).json({ success: false, message: upWerr.message });
        }

        // work_updates me row na ho to hamesha banao (job_creation ho ya na ho), taaki Report me job dikhe
        if ((!wRows || wRows.length === 0) && cleanNewJobId && cleanNewJobId !== "-") {
          db.query(
            WORK_INSERT_SQL,
            workInsertParams({
              domain, state: market, jobId: cleanNewJobId, month: cleanMonth,
              receiveDate: finalReceiveDate, ecdDate: finalEcdDate, submissionDate: finalSubmissionDate,
              amdocsQc: finalAmdocsQc, internalQc: finalInternalQc, otp: finalOtp
            }),
            (inErr) => {
              if (inErr) {
                return res.status(500).json({ success: false, message: inErr.message });
              }
              upsertJc((upJerr) => {
                if (upJerr) return res.status(500).json({ success: false, message: upJerr.message });
                return res.json({ success: true, message: "Record created and synced successfully." });
              });
            }
          );
          return;
        }

        upsertJc((upJerr) => {
          if (upJerr) {
            return res.status(500).json({ success: false, message: upJerr.message });
          }
          return res.json({ success: true, message: "Job updated and synced successfully in both Job History and Report." });
        });
      });
    });
  });
 } catch (e) {
  console.error("updateJob crashed:", e.message);
  return res.status(500).json({ success: false, message: e.message });
 }
};

exports.deleteJob = (req, res) => {
 try {
  const rowId = clean(req.params.id);
  const requestedJobId = clean((req.query || {}).jobId);
  const jcId = clean((req.query || {}).jcId);
  const workId = clean((req.query || {}).workId);

  const findJcSql = jcId
    ? `SELECT jobId FROM job_creation WHERE id = ? LIMIT 1`
    : `SELECT jobId FROM job_creation WHERE TRIM(jobId) = TRIM(?) LIMIT 1`;
  const findJcParam = jcId || requestedJobId || rowId;

  const findWorkSql = workId
    ? `SELECT job_id FROM work_updates WHERE id = ? LIMIT 1`
    : `SELECT job_id FROM work_updates WHERE TRIM(job_id) = TRIM(?) LIMIT 1`;
  const findWorkParam = workId || requestedJobId || rowId;

  db.query(findJcSql, [findJcParam], (jcErr, jcRows) => {
    db.query(findWorkSql, [findWorkParam], (wErr, wRows) => {
      const jcJobId = (!jcErr && jcRows && jcRows[0]) ? jcRows[0].jobId : "";
      const workJobId = (!wErr && wRows && wRows[0]) ? wRows[0].job_id : "";

      const targetJobId = requestedJobId || jcJobId || workJobId || "";

      const deleteFromJc = (cb) => {
        if (jcId) {
          db.query("DELETE FROM job_creation WHERE id = ?", [jcId], cb);
        } else if (targetJobId) {
          db.query("DELETE FROM job_creation WHERE TRIM(jobId) = TRIM(?)", [targetJobId], cb);
        } else if (rowId) {

          db.query("DELETE FROM job_creation WHERE id = ?", [rowId], cb);
        } else {
          cb(null);
        }
      };

      const deleteFromWork = (cb) => {
        if (workId) {
          db.query("DELETE FROM work_updates WHERE id = ?", [workId], cb);
        } else if (targetJobId) {
          db.query("DELETE FROM work_updates WHERE TRIM(job_id) = TRIM(?)", [targetJobId], cb);
        } else if (rowId) {
          db.query("DELETE FROM work_updates WHERE id = ?", [rowId], cb);
        } else {
          cb(null);
        }
      };

      deleteFromJc((err1) => {
        if (err1) {
          return res.status(500).json({ success: false, message: err1.message });
        }
        deleteFromWork((err2) => {
          if (err2) {
            return res.status(500).json({ success: false, message: err2.message });
          }

          return res.json({
            success: true,
            message: "Row and related data deleted successfully from both tables",
          });
        });
      });
    });
  });
 } catch (e) {
  console.error("deleteJob crashed:", e.message);
  return res.status(500).json({ success: false, message: e.message });
 }
};

exports.submitJob = (req, res) => {
 try {
  const { jobId, month, submissionDate } = req.body || {};
  const formattedSubmissionDate = submissionDate && submissionDate !== "" ? submissionDate : null;
  const cleanJobId = clean(jobId);
  const cleanMonth = cleanSingleMonth(month);

  const sql = `
    UPDATE job_creation
    SET submissionDate = ?,
        month = COALESCE(?, month),
        updated_at = CURRENT_TIMESTAMP
    WHERE TRIM(jobId) = TRIM(?)
  `;

  db.query(sql, [formattedSubmissionDate, cleanMonth, cleanJobId], (err, result) => {
    if (err) {
      return res.status(500).json({
        success: false,
        message: err.message,
      });
    }

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: "Job ID not found",
      });
    }

    const done = () =>
      res.json({
        success: true,
        message: "Job Submitted Successfully",
      });
    const fail = (e) =>
      res.status(500).json({
        success: false,
        message: e.message,
      });

 
    db.query(
      "SELECT id FROM work_updates WHERE TRIM(job_id) = TRIM(?) LIMIT 1",
      [cleanJobId],
      (wErr, wRows) => {
        if (wErr) return fail(wErr);

        if (wRows && wRows.length > 0) {
          const updateWorkSync = `
            UPDATE work_updates
            SET submission_date = ?,
                months = COALESCE(?, months),
                updated_at = CURRENT_TIMESTAMP
            WHERE TRIM(job_id) = TRIM(?)
          `;
          return db.query(
            updateWorkSync,
            [formattedSubmissionDate, monthsParam(cleanMonth), cleanJobId],
            (uErr) => (uErr ? fail(uErr) : done())
          );
        }

        // work_updates me row hi nahi thi -> job_creation se bana do
        db.query(
          "SELECT domain, market, month, receiveDate, ecdDate, otp, amdocsQc, internalQc FROM job_creation WHERE TRIM(jobId) = TRIM(?) LIMIT 1",
          [cleanJobId],
          (jErr, jRows) => {
            if (jErr) return fail(jErr);
            const jc = (jRows && jRows[0]) || {};
            const monthToStore = cleanMonth || cleanSingleMonth(jc.month);

            db.query(
              WORK_INSERT_SQL,
              workInsertParams({
                domain: jc.domain, state: jc.market, jobId: cleanJobId, month: monthToStore,
                receiveDate: jc.receiveDate, ecdDate: jc.ecdDate, submissionDate: formattedSubmissionDate,
                amdocsQc: jc.amdocsQc, internalQc: jc.internalQc, otp: jc.otp
              }),
              (iErr) => (iErr ? fail(iErr) : done())
            );
          }
        );
      }
    );
  });
 } catch (e) {
  console.error("submitJob crashed:", e.message);
  return res.status(500).json({ success: false, message: e.message });
 }
};
