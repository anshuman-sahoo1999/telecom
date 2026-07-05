const db = require("../config/db");

// ================= SAVE TIMESHEET =================
exports.saveTimesheet = (req, res) => {
  const jobId = String(req.body.jobId || "").trim();
  const entries = Array.isArray(req.body.entries) ? req.body.entries : [];
  const employeeName = req.body.employeeName || null;
  const teamMember = req.body.teamMember || req.body.employeeName || "Unknown";

  if (!jobId || entries.length === 0) {
    return res.status(400).json({
      success: false,
      message: "Job ID and entries required",
    });
  }

  const values = [];

  entries.forEach((e) => {
    const task = String(e.task || "").trim();
    const start = e.startTime || "";
    const end = e.endTime || "";

    if (!task || !start || !end) return;

    let hours = 0;

    const [sh, sm] = start.split(":").map(Number);
    const [eh, em] = end.split(":").map(Number);

    let startMin = sh * 60 + sm;
    let endMin = eh * 60 + em;

    if (endMin < startMin) endMin += 1440;

    hours = (endMin - startMin) / 60;
    hours = Number(hours.toFixed(2));

    values.push([
      jobId,
      task,
      start,
      end,
      hours,
      employeeName,
      teamMember,
      "Pending",
      " "
    ]);
  });

  if (values.length === 0) {
    return res.status(400).json({
      success: false,
      message: "No valid entries found",
    });
  }

  const sql = `
    INSERT INTO timesheet_entries
      (jobId, task, startTime, endTime, hours, employeeName, teamMember, tlStatus, adminStatus)
    VALUES ?
  `;

  db.query(sql, [values], (err, result) => {
    if (err) {
      console.log("DB ERROR:", err);
      return res.status(500).json({
        success: false,
        message: err.message,
      });
    }

    return res.json({
      success: true,
      message: "Timesheet saved successfully",
      insertedRows: result.affectedRows,
    });
  });
};
// ================= GET ALL TIMESHEETS =================
exports.getAllTimesheets = (req, res) => {
  const domain = req.query.domain;

  let sql = `
    SELECT
      t.id,
      t.jobId,
      t.task,
      t.startTime,
      t.endTime,
      t.hours,
      t.created_at,
      t.employeeName,
      t.teamMember,
      t.tlStatus,
      t.adminStatus,
      j.domain
    FROM timesheet_entries t
    LEFT JOIN job_creation j
      ON TRIM(t.jobId) = TRIM(j.jobId)
  `;

  const params = [];

  // ✅ ONLY APPLY FILTER IF DOMAIN EXISTS
  if (domain && domain !== "undefined") {
    sql += ` WHERE j.domain = ?`;
    params.push(domain);
  }

  sql += ` ORDER BY t.id DESC`;

  db.query(sql, params, (err, result) => {
    if (err) {
      return res.status(500).json({
        success: false,
        message: err.message,
      });
    }
   
    res.json({
      success: true,
      data: result,
    });
  });
};
// ================= GET BY JOB (FIXED WITH TEAM MEMBER) =================
exports.getTimesheetByJob = (req, res) => {
  const jobId = String(req.params.jobId || "").trim();

  if (!jobId) {
    return res.status(400).json({
      success: false,
      message: "Job ID required",
    });
  }

  const sql = `
    SELECT 
      t.id,
      t.jobId,
      t.task,
      t.startTime,
      t.endTime,
      t.hours,
      t.created_at,

      t.teamMember,
      t.employeeName,
      t.tlStatus,
      t.adminStatus,

      j.internalQc,
      j.amdocsQc,
      j.markupRequired

    FROM timesheet_entries t
    LEFT JOIN job_creation j 
      ON TRIM(CAST(t.jobId AS CHAR)) = TRIM(CAST(j.jobId AS CHAR))

    WHERE TRIM(t.jobId) = ?
    ORDER BY t.id DESC
  `;

  db.query(sql, [jobId], (err, result) => {
    if (err) {
      return res.status(500).json({
        success: false,
        message: err.message,
      });
    }

    res.json({
      success: true,
      jobId,
      count: result.length,
      data: result,
    });
  });
};
// ================= DELETE ENTRY =================
exports.deleteEntry = (req, res) => {
  const id = req.params.id;

  db.query(
    "DELETE FROM timesheet_entries WHERE id = ?",
    [id],
    (err, result) => {
      if (err) {
        return res.status(500).json({
          success: false,
          message: err.message,
        });
      }

      res.json({
        success: true,
        message: "Deleted successfully",
        id,
      });
    }
  );
};
exports.updateStatus = (req, res) => {
  const { id, status, role, revisedText } = req.body;

  if (!id || !status || !role) {
    return res.status(400).json({
      success: false,
      message: "id, status, role required",
    });
  }

  let sql = "";
  let values = [];

  // ================= TL =================
  if (role.toLowerCase() === "teamlead") {
    if (status === "Revised") {
      sql = `
        UPDATE timesheet_entries
        SET 
          tlStatus = ?,
          tlRevisedReason = CONCAT(
            IFNULL(tlRevisedReason, ''),
            '\n• ',
            ?
          )
        WHERE id = ?
      `;
      values = [status, revisedText || "", id];
    } else {
      sql = "UPDATE timesheet_entries SET tlStatus = ? WHERE id = ?";
      values = [status, id];
    }
  }

  // ================= ADMIN =================
  else if (role.toLowerCase() === "admin") {
    if (status === "Revised") {
      sql = `
        UPDATE timesheet_entries
        SET 
          adminStatus = ?,
          adminRevisedReason = CONCAT(
            IFNULL(adminRevisedReason, ''),
            '\n• ',
            ?
          )
        WHERE id = ?
      `;
      values = [status, revisedText || "", id];
    } else {
      sql = "UPDATE timesheet_entries SET adminStatus = ? WHERE id = ?";
      values = [status, id];
    }
  }

  else {
    return res.status(400).json({
      success: false,
      message: "Invalid role",
    });
  }

  db.query(sql, values, (err) => {
    if (err) {
      console.log("DB ERROR:", err);
      return res.status(500).json({
        success: false,
        message: err.message,
      });
    }

    res.json({
      success: true,
      message: "Status updated with history",
    });
  });
};
exports.checkTodayEntry = (req, res) => {
  const jobId = req.params.jobId;

  const sql = `
    SELECT COUNT(*) AS count
    FROM timesheet_entries
    WHERE jobId = ?
    AND DATE(created_at) = CURDATE()
  `;

  db.query(sql, [jobId], (err, result) => {
    if (err) {
      return res.status(500).json({
        success: false,
        message: err.message,
      });
    }

    res.json({
      exists: result[0].count > 0,
    });
  });
};