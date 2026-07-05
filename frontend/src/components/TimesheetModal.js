import React, { useState } from "react";
import axios from "axios";
import "../style/TimesheetModal.css";

const API_URL = "http://localhost:5000/api/timesheet";

const TimesheetModal = ({ jobs, onClose }) => {
  // ✅ SAFE USER PARSE (NO CRASH)
  const user = JSON.parse(localStorage.getItem("user") || "{}");

  const [jobId, setJobId] = useState("");
  const [teamMember, setTeamMember] = useState("");
  const [rows, setRows] = useState([
    { task: "", startTime: "", endTime: "" },
  ]);

  // ================= JOB CHANGE =================
  const handleJobChange = (e) => {
    setJobId(e.target.value);
    setRows([{ task: "", startTime: "", endTime: "" }]);
  };

  // ================= ADD ROW =================
  const addRow = () => {
    setRows((prev) => [
      ...prev,
      { task: "", startTime: "", endTime: "" },
    ]);
  };

  // ================= UPDATE ROW =================
  const updateRow = (i, field, value) => {
    const updated = [...rows];
    updated[i][field] = value;
    setRows(updated);
  };

  // ================= DELETE ROW =================
  const deleteRow = (i) => {
    const updated = rows.filter((_, index) => index !== i);

    setRows(
      updated.length
        ? updated
        : [{ task: "", startTime: "", endTime: "" }]
    );
  };

  // ================= HOURS CALC =================
  const getHours = (start, end) => {
    if (!start || !end) return "0.00";

    const startParts = start.split(":");
    const endParts = end.split(":");

    if (startParts.length !== 2 || endParts.length !== 2) return "0.00";

    const [sh, sm] = startParts.map(Number);
    const [eh, em] = endParts.map(Number);

    let startMin = sh * 60 + sm;
    let endMin = eh * 60 + em;

    if (endMin < startMin) {
      endMin += 1440;
    }

    return ((endMin - startMin) / 60).toFixed(2);
  };

  // ================= SUBMIT =================
  const handleSubmit = async () => {
    try {
      console.log("SELECTED JOB ID:", jobId);

      if (!jobId) {
        alert("Please select a job");
        return;
      }
      if (!teamMember) {
        alert("Please select team member");
        return;
      }

      // 🔴 DUPLICATE CHECK (ADD HERE)
      const check = await axios.get(
        `${API_URL}/check/${jobId}`
      );

      if (check.data.exists) {
        alert("❌ This Job ID already has entry for today");
        return;
      }

      const clean = rows
        .map((r) => ({
          task: r.task?.trim(),
          startTime: r.startTime,
          endTime: r.endTime,
        }))
        .filter((r) => r.task && r.startTime && r.endTime);

      if (clean.length === 0) {
        alert("Please add at least one valid task");
        return;
      }

      const payload = {
        jobId,
        employeeName: user?.name || "Unknown",
        teamMember,
        entries: clean,
      };

      const res = await axios.post(
        `${API_URL}/save`,
        payload
      );

      console.log("SUCCESS:", res.data);

      alert("Timesheet saved successfully");

      setJobId("");
      setTeamMember("");
      setRows([{ task: "", startTime: "", endTime: "" }]);

      onClose();

    } catch (err) {
      console.log("API ERROR:", err?.response?.data || err.message);

      alert(
        err?.response?.data?.message ||
        "Error saving timesheet"
      );
    }
  };

  return (
    <div className="ts-overlay">
      <div className="ts-modal">

        {/* HEADER */}
        <div className="ts-header">
          <h2>Timesheet Entry</h2>
          <button onClick={onClose} className="ts-close">
            ✕
          </button>
        </div>

        {/* JOB SELECT */}
        <div className="ts-row-fields">

          <div className="ts-field">
            <label>Select Job</label>

            <select
              value={jobId}
              onChange={handleJobChange}
            >
              <option value="">Select Job</option>

              {jobs?.map((job) => (
                <option
                  key={job.id}
                  value={job.jobId}
                >
                  {job.jobId || job.id}
                  {job.domain ? ` - ${job.domain}` : ""}
                </option>
              ))}
            </select>
          </div>

          <div className="ts-field">
            <label>Type of Work</label>

            <select
              value={teamMember}
              onChange={(e) =>
                setTeamMember(e.target.value)
              }
            >
              <option value="">Select Team</option>
              <option value="QA">QA</option>
              <option value="QC">QC</option>
              <option value="Production">Production</option>
            </select>
          </div>

        </div>

        {/* TABLE */}
        <div className="ts-table-wrapper">
          <table className="ts-table">
            <thead>
              <tr>
                <th>Task</th>
                <th>Start</th>
                <th>End</th>
                <th>Hours</th>
                <th>Action</th>
              </tr>
            </thead>

            <tbody>
              {rows.map((row, i) => (
                <tr key={i}>
                  <td>
                    <input
                      value={row.task}
                      onChange={(e) =>
                        updateRow(
                          i,
                          "task",
                          e.target.value
                        )
                      }
                      className="ts-input"
                    />
                  </td>

                  <td>
                    <input
                      type="time"
                      value={row.startTime}
                      onChange={(e) =>
                        updateRow(
                          i,
                          "startTime",
                          e.target.value
                        )
                      }
                      className="ts-input"
                    />
                  </td>

                  <td>
                    <input
                      type="time"
                      value={row.endTime}
                      onChange={(e) =>
                        updateRow(
                          i,
                          "endTime",
                          e.target.value
                        )
                      }
                      className="ts-input"
                    />
                  </td>

                  <td>
                    {getHours(
                      row.startTime,
                      row.endTime
                    )}
                  </td>

                  <td>
                    <button
                      onClick={() =>
                        deleteRow(i)
                      }
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <button
            onClick={addRow}
            className="ts-add"
          >
            + Add Task
          </button>
        </div>


        {/* FOOTER */}
        <div className="ts-footer">
          <button
            onClick={handleSubmit}
            className="ts-submit"
            disabled={!jobId}
          >
            Submit Timesheet
          </button>
        </div>

      </div>
    </div>
  );
};

export default TimesheetModal;