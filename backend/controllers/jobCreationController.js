const db = require("../config/db");

// ============================
// CREATE JOB (Submission Date Optional)
// ============================
exports.createJob = (req, res) => {
  let {
    domain,
    market,
    jobId,
    receiveDate,
    ecdDate,
    submissionDate,
  } = req.body;

  // Agar submissionDate khali string, null ya undefined hai, toh use explicitly NULL kar do
  const finalSubmissionDate = submissionDate && submissionDate.trim() !== "" 
    ? submissionDate 
    : null;

  const sql = `
    INSERT INTO job_creation
    (domain, market, jobId, receiveDate, ecdDate, submissionDate, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, NULL)
  `;

  db.query(
    sql,
    [domain, market, jobId, receiveDate, ecdDate, finalSubmissionDate],
    (err, result) => {
      if (err) {
        console.log("MYSQL ERROR:", err);
        return res.status(500).json({
          success: false,
          message: err.sqlMessage || err.message,
        });
      }

      res.json({
        success: true,
        message: "Job created successfully",
        id: result.insertId,
      });
    }
  );
};

// ============================
// GET ALL JOBS
// ============================
exports.getAllJobs = (req, res) => {
  const { domain } = req.query;

  let sql = "SELECT * FROM job_creation";
  let params = [];

  if (domain) {
    sql += " WHERE domain = ?";
    params.push(domain);
  }

  sql += " ORDER BY id DESC";

  db.query(sql, params, (err, rows) => {
    if (err) {
      console.log("MYSQL ERROR:", err);
      return res.status(500).json({
        success: false,
        message: err.message,
      });
    }

    res.json(rows);
  });
};

// ============================
// UPDATE JOB (QC)
// ============================
exports.updateJob = (req, res) => {
  const { internalQc, amdocsQc, markupRequired } = req.body;

  const sql = `
    UPDATE job_creation
    SET internalQc = ?,
        amdocsQc = ?,
        markupRequired = ?,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `;

  db.query(sql,
    [internalQc, amdocsQc, markupRequired, req.params.id],
    (err) => {
      if (err) {
        console.log(err);
        return res.status(500).json(err);
      }

      res.json({ success: true });
    }
  );
};

// ============================
// DELETE JOB
// ============================
exports.deleteJob = (req, res) => {
  db.query(
    "DELETE FROM job_creation WHERE id = ?",
    [req.params.id],
    (err) => {
      if (err) {
        console.log("MYSQL ERROR:", err);
        return res.status(500).json({
          success: false,
          message: err.message,
        });
      }

      res.json({
        success: true,
        message: "Job deleted successfully",
      });
    }
  );
};
