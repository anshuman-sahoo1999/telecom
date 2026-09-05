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
exports.createJob = async (req, res) => {
  try {
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
    const [checkRows] = await db.promise().query(checkSql, [cleanJobId]);

    let newId = null;

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
      await db.promise().query(updateSql, [
        cleanDomain, market, cleanMonth, finalReceiveDate, 
        formattedEcdDate, formattedSubmissionDate, cleanJobId
      ]);
    } else {
      const insertSql = `
        INSERT INTO job_creation (domain, market, jobId, month, receiveDate, ecdDate, submissionDate)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `;
      const [inResult] = await db.promise().query(insertSql, [
        cleanDomain, market, cleanJobId, cleanMonth, 
        finalReceiveDate, formattedEcdDate, formattedSubmissionDate
      ]);
      newId = inResult.insertId;
    }

    // Sync to Work Controller logic
    if (!cleanJobId || cleanJobId === "-") {
      return res.json({
        success: true,
        message: "Job saved successfully",
        id: newId
      });
    }

    const checkWorkSql = `SELECT id FROM work_updates WHERE TRIM(job_id) = TRIM(?) LIMIT 1`;
    const [wRows] = await db.promise().query(checkWorkSql, [cleanJobId]);

    if (wRows && wRows.length > 0) {
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
      await db.promise().query(updateWorkSql, [
        cleanDomain, market, cleanMonth, cleanMonth, 
        finalReceiveDate, formattedEcdDate, formattedSubmissionDate, cleanJobId
      ]);
      return res.json({
        success: true,
        message: "Job synced successfully with correct month & updated timestamp",
        id: newId
      });
    } else {
      const insertWorkSql = `
        INSERT INTO work_updates (domain, state, job_id, months, receive_date, ecd_date, submission_date, jobs_delivered, uom)
        VALUES (?, ?, ?, ?, ?, ?, ?, 1, '{}')
      `;
      await db.promise().query(insertWorkSql, [
        cleanDomain, market, cleanJobId, 
        JSON.stringify(cleanMonth ? [cleanMonth] : []), 
        finalReceiveDate, formattedEcdDate, formattedSubmissionDate
      ]);
      return res.json({
        success: true,
        message: "Job inserted successfully into Work Controller",
        id: newId
      });
    }

  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ============================
// GET ALL JOBS (Combined)
// ============================
exports.getAllJobs = async (req, res) => {
  try {
    const queryJC = "SELECT id, jobId, domain, market, month, receiveDate, ecdDate, submissionDate, updated_at FROM job_creation";
    const queryWU = "SELECT id, job_id AS jobId, domain, state AS market, receive_date AS receiveDate, ecd_date AS ecdDate, submission_date AS submissionDate, updated_at FROM work_updates WHERE job_id IS NOT NULL AND job_id != '-' AND job_id != ''";

    const [jcRows] = await db.promise().query(queryJC);
    const [wuRows] = await db.promise().query(queryWU);

    const jobMap = new Map();

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

    return res.json(Array.from(jobMap.values()));
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ============================
// UPDATE JOB
// ============================
exports.updateJob = async (req, res) => {
  try {
    const { 
      internalQc, internal_qc, 
      amdocsQc, amdocs_qc, 
      otp, internalOtp, 
      domain, market, 
      receiveDate, receive_date, 
      ecdDate, ecd_date, 
      submissionDate, submission_date, 
      month, jobId 
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

    const [wRows] = await db.promise().query(
      `SELECT id, job_id FROM work_updates WHERE id = ? OR TRIM(job_id) = TRIM(?) LIMIT 1`, 
      [paramId, requestedJobId]
    );

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
      await db.promise().query(updateWorkSql, [finalAmdocsQc, finalOtp, finalInternalQc, requestedJobId, wRows[0].id]);
      return res.json({ success: true, message: "Work updates table updated successfully." });
    } else {
      const [jRows] = await db.promise().query(`SELECT id FROM job_creation WHERE id = ? LIMIT 1`, [paramId]);

      if (jRows && jRows.length > 0) {
        const updateJcSql = `
          UPDATE job_creation
          SET jobId = COALESCE(NULLIF(?, ''), jobId),
              month = COALESCE(?, month),
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `;
        await db.promise().query(updateJcSql, [requestedJobId, cleanMonth, paramId]);
        return res.json({ success: true, message: "Job creation updated successfully." });
      } else {
        const insertWorkSql = `
          INSERT INTO work_updates (job_id, amdocs_qc, otp, internal_qc, jobs_delivered, uom)
          VALUES (?, ?, ?, ?, 1, '{}')
        `;
        await db.promise().query(insertWorkSql, [requestedJobId || "UNKNOWN", finalAmdocsQc, finalOtp, finalInternalQc]);
        return res.json({ success: true, message: "Record created and updated successfully." });
      }
    }
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ============================
// DELETE JOB
// ============================
exports.deleteJob = async (req, res) => {
  try {
    const rowId = req.params.id;
    const requestedJobId = clean(req.query.jobId);

    const findJobSql = `
      SELECT jobId as jcJobId, NULL as workJobId FROM job_creation WHERE id = ?
      UNION
      SELECT NULL as jcJobId, job_id as workJobId FROM work_updates WHERE id = ?
    `;

    const [rows] = await db.promise().query(findJobSql, [rowId, rowId]);
    let targetJobId = requestedJobId;
    
    if (rows && rows.length > 0) {
      targetJobId = rows[0].jcJobId || rows[0].workJobId || requestedJobId;
    }

    await db.promise().query("DELETE FROM job_creation WHERE id = ? OR (TRIM(jobId) = TRIM(?))", [rowId, targetJobId || ""]);
    await db.promise().query("DELETE FROM work_updates WHERE id = ? OR (TRIM(job_id) = TRIM(?))", [rowId, targetJobId || ""]);

    return res.json({
      success: true,
      message: "Row and related data deleted successfully from both tables",
    });
  } catch (err2) {
    return res.status(500).json({ success: false, message: err2.message });
  }
};

// ============================
// SUBMIT JOB
// ============================
exports.submitJob = async (req, res) => {
  try {
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

    const [result] = await db.promise().query(sql, [formattedSubmissionDate, cleanMonth, cleanJobId]);

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
    
    // Background sync call safely executed
    db.promise().query(updateWorkSync, [formattedSubmissionDate, cleanMonth, cleanMonth, cleanJobId]).catch(() => {});

    return res.json({
      success: true,
      message: "Job Submitted Successfully",
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};
