const db = require("../config/db");

const clean = (v) => (v !== undefined && v !== null ? v.toString().trim() : "");
const normalize = (v) => clean(v).toUpperCase();

const cleanSingleMonth = (m) => {
  const str = clean(m);
  if (!str) return null;
  return str; 
};

// ============================
// CREATE / SYNC JOB
// ============================
exports.createJob = (req, res) => {
  let {
    domain,
    market,
    jobId,
    receiveDate,
    receivedDate, 
    ecdDate,
    submissionDate,
    month
  } = req.body;

  const finalReceiveDate = receiveDate || receivedDate || null;
  const formattedEcdDate = ecdDate && ecdDate !== "" ? ecdDate : null;
  const formattedSubmissionDate = submissionDate && submissionDate !== "" ? submissionDate : null;
  
  const cleanJobId = clean(jobId);
  const cleanDomain = normalize(domain);
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
            updated_at = CURRENT_TIMESTAMP
        WHERE TRIM(jobId) = TRIM(?)
      `;
      db.query(updateSql, [cleanDomain, market, cleanMonth, finalReceiveDate, formattedEcdDate, formattedSubmissionDate, cleanJobId], (upErr) => {
        if (upErr) return res.status(500).json({ success: false, message: upErr.message });
        syncToWorkController();
      });
    } else {
      const insertSql = `
        INSERT INTO job_creation (domain, market, jobId, month, receiveDate, ecdDate, submissionDate)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `;
      db.query(insertSql, [cleanDomain, market, cleanJobId, cleanMonth, finalReceiveDate, formattedEcdDate, formattedSubmissionDate], (inErr, inResult) => {
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
              updated_at = CURRENT_TIMESTAMP
          WHERE TRIM(job_id) = TRIM(?)
        `;
        db.query(updateWorkSql, [cleanDomain, market, cleanMonth, cleanMonth, finalReceiveDate, formattedEcdDate, formattedSubmissionDate, cleanJobId], () => {
          return res.json({
            success: true,
            message: "Job synced successfully with correct month & updated timestamp",
            id: newId
          });
        });
      } else {
        const insertWorkSql = `
          INSERT INTO work_updates (domain, state, job_id, months, receive_date, ecd_date, submission_date, jobs_delivered, uom)
          VALUES (?, ?, ?, ?, ?, ?, ?, 1, '{}')
        `;
        db.query(insertWorkSql, [cleanDomain, market, cleanJobId, JSON.stringify(cleanMonth ? [cleanMonth] : []), finalReceiveDate, formattedEcdDate, formattedSubmissionDate], () => {
          return res.json({
            success: true,
            message: "Job inserted successfully into Work Controller",
            id: newId
          });
        });
      }
    });
  }
};

// ============================
// GET ALL JOBS (Combined from Job Creation & Work Updates)
// ============================
exports.getAllJobs = (req, res) => {
  const queryJC = "SELECT id, jobId, domain, market, month, receiveDate, ecdDate, submissionDate, updated_at FROM job_creation";
  const queryWU = "SELECT id, job_id AS jobId, domain, state AS market, receive_date AS receiveDate, ecd_date AS ecdDate, submission_date AS submissionDate, updated_at FROM work_updates WHERE job_id IS NOT NULL AND job_id != '-' AND job_id != ''";

  db.query(queryJC, (errJC, jcRows) => {
    if (errJC) {
      return res.status(500).json({ success: false, message: errJC.message });
    }
    db.query(queryWU, (errWU, wuRows) => {
      if (errWU) {
        return res.status(500).json({ success: false, message: errWU.message });
      }

      const jobMap = new Map();

      // Combine both tables and remove duplicate job IDs
      [...wuRows, ...jcRows].forEach(row => {
        const jId = row.jobId ? row.jobId.toString().trim() : "";
        if (jId && jId !== "-") {
          if (jobMap.has(jId)) {
            const existing = jobMap.get(jId);
            jobMap.set(jId, {
              ...existing,
              ...row,
              domain: row.domain || existing.domain,
              submissionDate: row.submissionDate || existing.submissionDate,
              receiveDate: row.receiveDate || existing.receiveDate
            });
          } else {
            jobMap.set(jId, row);
          }
        }
      });

      res.json(Array.from(jobMap.values()));
    });
  });
};

// ============================
// UPDATE JOB
// ============================
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
    jobId 
  } = req.body;
  
  const paramId = clean(req.params.id); 
  const requestedJobId = clean(jobId);

  const finalInternalQc = internalQc !== undefined ? internalQc : (internal_qc || null);
  const finalAmdocsQc = amdocsQc !== undefined ? amdocsQc : (amdocs_qc || null);
  const finalOtp = otp || internalOtp || null;
  const cleanMonth = cleanSingleMonth(month);

  if (!paramId && !requestedJobId) {
    return res.status(400).json({ success: false, message: "A row ID or Job ID is required for updating." });
  }

  db.query(`SELECT id, job_id FROM work_updates WHERE id = ? OR TRIM(job_id) = TRIM(?) LIMIT 1`, [paramId, requestedJobId], (wErr, wRows) => {
    if (wErr) {
      return res.status(500).json({ success: false, message: wErr.message });
    }

    if (wRows && wRows.length > 0) {
      const updateWorkSql = `
        UPDATE work_updates
        SET amdocs_qc = COALESCE(NULLIF(?, ''), amdocs_qc),
            otp = COALESCE(NULLIF(?, ''), otp),
            internal_qc = COALESCE(NULLIF(?, ''), internal_qc),
            job_id = COALESCE(NULLIF(?, ''), job_id),
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `;
      db.query(updateWorkSql, [finalAmdocsQc, finalOtp, finalInternalQc, requestedJobId, wRows[0].id], (upWerr) => {
        if (upWerr) {
          return res.status(500).json({ success: false, message: upWerr.message });
        }
        return res.json({ success: true, message: "Work updates table updated successfully." });
      });
    } else {
      db.query(`SELECT id FROM job_creation WHERE id = ? LIMIT 1`, [paramId], (jErr, jRows) => {
        if (jErr) {
          return res.status(500).json({ success: false, message: jErr.message });
        }

        if (jRows && jRows.length > 0) {
          const updateJcSql = `
            UPDATE job_creation
            SET jobId = COALESCE(NULLIF(?, ''), jobId),
                month = COALESCE(?, month),
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `;
          db.query(updateJcSql, [requestedJobId, cleanMonth, paramId], (upJerr) => {
            if (upJerr) {
              return res.status(500).json({ success: false, message: upJerr.message });
            }
            return res.json({ success: true, message: "Job creation updated successfully." });
          });
        } else {
          const insertWorkSql = `
            INSERT INTO work_updates (job_id, amdocs_qc, otp, internal_qc, jobs_delivered, uom)
            VALUES (?, ?, ?, ?, 1, '{}')
          `;
          db.query(insertWorkSql, [requestedJobId || "UNKNOWN", finalAmdocsQc, finalOtp, finalInternalQc], (inErr) => {
            if (inErr) {
              return res.status(500).json({ success: false, message: inErr.message });
            }
            return res.json({ success: true, message: "Record created and updated successfully." });
          });
        }
      });
    }
  });
};

// ============================
// DELETE JOB
// ============================
exports.deleteJob = (req, res) => {
  const rowId = req.params.id;
  const requestedJobId = clean(req.query.jobId);

  const findJobSql = `
    SELECT jobId as jcJobId, NULL as workJobId FROM job_creation WHERE id = ?
    UNION
    SELECT NULL as jcJobId, job_id as workJobId FROM work_updates WHERE id = ?
  `;

  db.query(findJobSql, [rowId, rowId], (err, rows) => {
    let targetJobId = requestedJobId;
    
    if (!err && rows && rows.length > 0) {
      targetJobId = rows[0].jcJobId || rows[0].workJobId || requestedJobId;
    }

    db.query("DELETE FROM job_creation WHERE id = ? OR (TRIM(jobId) = TRIM(?))", [rowId, targetJobId || ""], () => {
      db.query("DELETE FROM work_updates WHERE id = ? OR (TRIM(job_id) = TRIM(?))", [rowId, targetJobId || ""], (err2) => {
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
};

// ============================
// SUBMIT JOB
// ============================
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
