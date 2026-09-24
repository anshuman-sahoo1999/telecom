const db = require("../config/db");

const clean = (v) => (v !== undefined && v !== null ? v.toString().trim() : "");
const normalize = (v) => clean(v).toUpperCase();

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
  } = req.body;

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
              months = CASE WHEN ? IS NOT NULL THEN JSON_ARRAY(?) ELSE months END,
              receive_date = COALESCE(?, receive_date),
              ecd_date = COALESCE(?, ecd_date),
              submission_date = COALESCE(?, submission_date),
              amdocs_qc = COALESCE(NULLIF(?, ''), amdocs_qc),
              internal_qc = COALESCE(NULLIF(?, ''), internal_qc),
              otp = COALESCE(NULLIF(?, ''), otp),
              updated_at = CURRENT_TIMESTAMP
          WHERE TRIM(job_id) = TRIM(?)
        `;
        db.query(updateWorkSql, [cleanDomain, cleanMarket, cleanMonth, cleanMonth, finalReceiveDate, formattedEcdDate, formattedSubmissionDate, finalAmdocsQc, finalInternalQc, finalOtp, cleanJobId], (uwErr) => {
          if (uwErr) return res.status(500).json({ success: false, message: uwErr.message });
          return res.json({
            success: true,
            message: "Job synced successfully with correct QC, OTP & month",
            id: newId
          });
        });
      } else {
        const insertWorkSql = `
          INSERT INTO work_updates (domain, state, job_id, months, receive_date, ecd_date, submission_date, amdocs_qc, internal_qc, otp, jobs_delivered, uom)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, '{}')
        `;
        db.query(insertWorkSql, [cleanDomain, cleanMarket, cleanJobId, JSON.stringify(cleanMonth ? [cleanMonth] : []), finalReceiveDate, formattedEcdDate, formattedSubmissionDate, finalAmdocsQc, finalInternalQc, finalOtp], (iwErr) => {
          // Work insert fail ho to job_creation me akeli row (orphan) na bache
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
};

exports.getAllJobs = (req, res) => {
  const queryJC = "SELECT id, jobId, domain, market, month, receiveDate, ecdDate, submissionDate, otp, amdocsQc, internalQc, updated_at FROM job_creation";
  const queryWU = "SELECT id, job_id AS jobId, domain, state AS market, receive_date AS receiveDate, ecd_date AS ecdDate, submission_date AS submissionDate, amdocs_qc, internal_qc, otp, updated_at FROM work_updates WHERE job_id IS NOT NULL AND job_id != '-' AND job_id != ''";

  db.query(queryJC, (errJC, jcRows) => {
    if (errJC) {
      return res.status(500).json({ success: false, message: errJC.message });
    }
    db.query(queryWU, (errWU, wuRows) => {
      if (errWU) {
        return res.status(500).json({ success: false, message: errWU.message });
      }

      // Job ID ko trim + lowercase karke compare karte hain (MySQL TRIM/=
      // bhi case-insensitive hai), taaki "abc1" aur "ABC1" alag na ginein.
      const keyOf = (v) => (v ? v.toString().trim().toLowerCase() : "");
      const isValidKey = (k) => k !== "" && k !== "-";

      // work_updates hi Report ka source hai. Jo job_creation row ki
      // work_updates me koi row nahi hai (Report/upload se delete ho chuki),
      // wo "orphan" hai -> Job History me nahi dikhni chahiye.
      const workJobKeys = new Set();
      wuRows.forEach((row) => {
        const k = keyOf(row.jobId);
        if (isValidKey(k)) workJobKeys.add(k);
      });

      const jobMap = new Map();

      jcRows.forEach((row) => {
        const k = keyOf(row.jobId);
        if (!isValidKey(k)) return;
        if (!workJobKeys.has(k)) return; // orphan row skip

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
          jobMap.set(k, {
            ...row,
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
};

exports.updateJob = (req, res) => {
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
  } = req.body;

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
            months = CASE WHEN ? IS NOT NULL THEN JSON_ARRAY(?) ELSE months END,
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
          cleanMonth, cleanMonth,
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

        if ((!wRows || wRows.length === 0) && (!jRows || jRows.length === 0) && cleanNewJobId && cleanNewJobId !== "-") {
          const insertWorkSql = `
            INSERT INTO work_updates (job_id, domain, state, amdocs_qc, otp, internal_qc, months, receive_date, ecd_date, submission_date, jobs_delivered, uom)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, '{}')
          `;
          db.query(
            insertWorkSql,
            [
              cleanNewJobId, domain || null, market || null,
              finalAmdocsQc, finalOtp, finalInternalQc,
              JSON.stringify(cleanMonth ? [cleanMonth] : []),
              finalReceiveDate, finalEcdDate, finalSubmissionDate
            ],
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
};

exports.deleteJob = (req, res) => {
  const rowId = clean(req.params.id);
  const requestedJobId = clean(req.query.jobId);
  const jcId = clean(req.query.jcId);
  const workId = clean(req.query.workId);

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
};

exports.submitJob = (req, res) => {
  const { jobId, month, submissionDate } = req.body;
  const formattedSubmissionDate = submissionDate && submissionDate !== "" ? submissionDate : null;
  const cleanJobId = clean(jobId);
  const cleanMonth = cleanSingleMonth(month);

  const sql = `
    UPDATE job_creation
    SET submissionDate = ?,
        month = ?,
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

    const updateWorkSync = `
      UPDATE work_updates
      SET submission_date = ?,
          months = CASE WHEN ? IS NOT NULL THEN JSON_ARRAY(?) ELSE months END,
          updated_at = CURRENT_TIMESTAMP
      WHERE TRIM(job_id) = TRIM(?)
    `;
    db.query(updateWorkSync, [formattedSubmissionDate, cleanMonth, cleanMonth, cleanJobId], () => {});

    res.json({
      success: true,
      message: "Job Submitted Successfully",
    });
  });
};
