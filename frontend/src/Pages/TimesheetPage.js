import React, { useEffect, useState } from "react";
import axios from "axios";
import "../style/TimesheetPage.css";

const TimesheetPage = () => {
  const [data, setData] = useState([]);
  const [selectedReason, setSelectedReason] = useState(null);

  // ================= FETCH DATA =================
const fetchData = () => {
  const user = JSON.parse(localStorage.getItem("user") || "{}");
  const domain = user?.domain;

  axios
    .get(`http://localhost:5000/api/timesheet/all?domain=${domain}`)
    .then((res) => {
      setData(res.data?.data || []);
    })
    .catch((err) => {
    });
};

  useEffect(() => {
    fetchData();
  }, []);

  // ================= QC FORMAT =================
  const formatQC = (val) => {
    if (!val) return "-";

    const v = String(val).toLowerCase();

    if (["yes", "true", "1", "approved", "verified"].includes(v))
      return "Approved";

    if (["no", "false", "0", "pending"].includes(v))
      return "Not Verified";

    return val;
  };

  // ================= STATUS CLICK HANDLER =================
  const handleStatusClick = (item, type) => {
    if (type === "teamlead" && item.tlStatus === "Revised") {
      setSelectedReason(item.tlRevisedReason || "No reason found");
    }

    if (type === "admin" && item.adminStatus === "Revised") {
      setSelectedReason(item.adminRevisedReason || "No reason found");
    }
  };

  return (
    <div className="timesheet-page">
      <h2>Timesheet Records</h2>

      <div className="table-sheet">
        <table className="timesheet-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Job ID</th>
              <th>Type Of Work</th>
              <th>Work Done</th>
              <th>Hours</th>
              <th>TL Status</th>
              <th>Admin Status</th>
              <th>Internal QC</th>
              <th>Amdocs QC</th>
              <th>Markup Required</th>
            </tr>
          </thead>

          <tbody>
            {data.length === 0 ? (
              <tr>
                <td colSpan="10">No records found</td>
              </tr>
            ) : (
              data.map((item) => {

                console.log("ROW DATA =", item);

                const formatDate = (d) => {
                  if (!d) return "-";

                  const date = new Date(d);

                  const day = String(date.getDate()).padStart(2, "0");
                  const month = String(date.getMonth() + 1).padStart(2, "0");
                  const year = date.getFullYear();

                  return `${day}-${month}-${year}`;
                };

                return (
                  <tr key={item.id}>
                    <td>{formatDate(item.created_at)}</td>

                    <td>
                      {item.jobId || "-"}
                      {item.domain ? ` - ${item.domain}` : ""}
                    </td>

                    <td>{item.teamMember || "-"}</td>

                    <td className="work-done-cell">
                      {item.task || "-"}
                    </td>

                    <td>
                      {item.hours
                        ? Number(item.hours).toFixed(2)
                        : "0.00"}
                    </td>

                    {/* TL STATUS */}
                    <td>
                      {item.tlStatus ? (
                        <span
                          className={`status ${item.tlStatus.toLowerCase()}`}
                          onClick={() =>
                            handleStatusClick(item, "teamlead")
                          }
                        >
                          {item.tlStatus}
                        </span>
                      ) : (
                        "-"
                      )}
                    </td>

                    {/* ADMIN STATUS */}
                    <td>
                      {item.adminStatus ? (
                        <span
                          className={`status ${item.adminStatus.toLowerCase()}`}
                          onClick={() =>
                            handleStatusClick(item, "admin")
                          }
                        >
                          {item.adminStatus}
                        </span>
                      ) : (
                        "-"
                      )}
                    </td>

                    <td>{formatQC(item.internalQc)}</td>
                    <td>{formatQC(item.amdocsQc)}</td>
                    <td>{item.markupRequired || "-"}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* ================= POPUP ================= */}
      {selectedReason && (
        <div
          className="work-modal-overlay"
          onClick={() => setSelectedReason(null)}
        >
          <div
            className="work-modal-card"
            onClick={(e) => e.stopPropagation()}
          >

            <span
              className="ts-close-icon"
              onClick={() => setSelectedReason(null)}
            >
              &times;
            </span>

            <h3>Revised Reason</h3>

            <p>{selectedReason}</p>

            {/* SUCCESS BUTTON ONLY */}
            <div className="ts-modal-actions">

              <button
                className="ts-success"
                onClick={() => {
                  alert("Successfully Revised");
                  setSelectedReason(null);
                }}
              >
                Successfully Revised
              </button>

            </div>

          </div>
        </div>
      )}
    </div>
  );
};

export default TimesheetPage;