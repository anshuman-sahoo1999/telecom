import React, { useEffect, useState, useRef } from "react";
import axios from "axios";
import "../style/Timesheet.css";

const TimesheetManagement = () => {
  const [data, setData] = useState([]);
  const [domains, setDomains] = useState([]);
  const [tls, setTls] = useState([]);
  const [selected, setSelected] = useState([]);
  const [selectedWork, setSelectedWork] = useState(null);
  const user = JSON.parse(localStorage.getItem("user"));
  const [showRevisedPopup, setShowRevisedPopup] = useState(false);
  const [revisedText, setRevisedText] = useState("");
  const [viewType, setViewType] = useState("");
  const [currentDateTime, setCurrentDateTime] = useState("");
  const [filters, setFilters] = useState({
    domain: "",
    tl: "",
    reportee: "",
    jobId: "",
    monthYear: "",
    fromDate: "",
    toDate: "",
  });

  useEffect(() => {
    axios
      .get("http://localhost:5000/api/timesheet/all")
      .then((res) => {

        console.log("API RESPONSE:", res.data.data);

        const formatted = (res.data?.data || []).map((item) => {
          const dateObj = item.created_at
            ? new Date(item.created_at)
            : null;

          return {
            id: item.id,
            jobId: item.jobId,
            employeeName: item.employeeName || "-",
            domain: item.domain || "-",
            tl: item.teamMember || "-",

            date: dateObj
              ? dateObj.toISOString().split("T")[0]
              : "-",

            monthYear: dateObj
              ? dateObj.toLocaleString("en-US", {
                month: "short",
                year: "numeric",
              })
              : "-",

            workDone: item.task || "-",

            status:
              item.adminStatus !== "Pending" && item.adminStatus
                ? item.adminStatus
                : item.tlStatus || "Pending",
            revisedText:
              item.adminRevisedReason ||
              item.tlRevisedReason ||
              "",
          };
        });

        setData(formatted);
      })
      .catch((err) => {
        console.log("API ERROR:", err.message);
      });
  }, [user?.role]);
  useEffect(() => {
    const loadDomains = async () => {
      try {
        const masterRes = await axios.get("http://localhost:5000/api/master");
        const workRes = await axios.get("http://localhost:5000/api/work/bydomain");

        // MASTER domains (F2, F3, Telecom)
        const masterDomains = Object.keys(masterRes.data || {}).map((d) => ({
          domain: d
        }));

        // WORK domains
        const workDomains = (workRes.data || []).map((d) => ({
          domain: d.domain
        }));

        // MERGE + REMOVE DUPLICATES
        const merged = [...masterDomains, ...workDomains];

        const unique = merged.filter(
          (item, index, arr) =>
            arr.findIndex(x => x.domain === item.domain) === index
        );

        setDomains(unique);

      } catch (err) {
        console.log(err);
      }
    };

    loadDomains();
  }, []);
  useEffect(() => {
    if (!filters.domain) {
      setTls([]);
      return;
    }

    axios.get(
      `http://localhost:5000/api/auth/tl/bydomain?domain=${filters.domain}`
    )
      .then((res) => {
        console.log("TL RESPONSE:", res.data);
        setTls(res.data?.data || []);
      })
      .catch((err) => {
        console.log("TL ERROR:", err.message);
      });

  }, [filters.domain]);
  const changeStatus = async (id, status, revisedText = "") => {
    console.log("USER ROLE =", user.role);
    try {
      await axios.put("http://localhost:5000/api/timesheet/update-status", {
        id,
        status,
        role: user.role,
        revisedText,
      });

      setData((prev) =>
        prev.map((item) =>
          item.id === id
            ? {
              ...item,
              status,

              workDone:
                status === "Verified"
                  ? item.workDone
                  : item.workDone,

              revisedText:
                status === "Revised"
                  ? revisedText
                  : item.revisedText
            }
            : item
        )
      );

      // selectedWork update too
      setSelectedWork((prev) =>
        prev && prev.id === id
          ? {
            ...prev,
            status,
            revisedText: revisedText || prev.revisedText
          }
          : prev
      );
    } catch (err) {
      console.log("API ERROR:", err.response?.data || err.message);
    }
  };
  const handleFilterChange = (e) => {
    setFilters({ ...filters, [e.target.name]: e.target.value });
  };

  const filteredData = data.filter((item) => {
    const itemDate = new Date(item.date);

    const from = filters.fromDate ? new Date(filters.fromDate) : null;
    const to = filters.toDate ? new Date(filters.toDate) : null;

    return (
      (filters.domain ? item.domain === filters.domain : true) &&
      (filters.tl ? item.tl === filters.tl : true) &&
      (filters.reportee ? item.reportee === filters.reportee : true) &&
      (filters.jobId ? item.jobId === filters.jobId : true) &&
      (filters.monthYear ? item.monthYear === filters.monthYear : true) &&
      (!from || itemDate >= from) &&
      (!to || itemDate <= to)
    );
  });

  const toggleSelect = (id) => {
    setSelected((prev) =>
      prev.includes(id)
        ? prev.filter((x) => x !== id)
        : [...prev, id]
    );
  };

  const toggleSelectAll = () => {
    const allIds = filteredData.map((item) => item.id);

    if (
      allIds.length > 0 &&
      allIds.every((id) => selected.includes(id))
    ) {
      setSelected([]);
    } else {
      setSelected(allIds);
    }
  };


  const bulkUpdateStatus = async (status) => {
    try {
      await Promise.all(
        selected.map((id) =>
          axios.put(
            "http://localhost:5000/api/timesheet/update-status",
            {
              id,
              status,
              role: user.role,
            }
          )
        )
      );

      setData((prev) =>
        prev.map((item) =>
          selected.includes(item.id)
            ? { ...item, status }
            : item
        )
      );

      setSelected([]);
    } catch (err) {
      console.log(err);
    }
  };

  const clockInterval = useRef(null);

  const openRevisedPopup = () => {
    setShowRevisedPopup(true);

    clockInterval.current = setInterval(() => {
      setCurrentDateTime(
        new Date().toLocaleString("en-IN", {
          dateStyle: "medium",
          timeStyle: "medium",
        })
      );
    }, 1000);
  };
  useEffect(() => {
    return () => {
      if (clockInterval.current) {
        clearInterval(clockInterval.current);
      }
    };
  }, []);
  return (
    <div className="tm-container">
      <h2>Timesheet Management</h2>

      {/* FILTERS */}
      <div className="tm-filters">

        <div className="filter-item">
          <label>Domain</label>
          <select name="domain" onChange={handleFilterChange}>
            <option value="">All</option>
            {domains.map((item, index) => (
              <option key={index} value={item.domain}>
                {item.domain}
              </option>
            ))}
          </select>
        </div>

        <div className="filter-item">
          <label>TL</label>
          <select
            name="tl"
            value={filters.tl}
            onChange={handleFilterChange}
          >
            <option value="">All TL</option>
            {tls.map((tl) => (
              <option key={tl.id} value={tl.name}>
                {tl.name}
              </option>
            ))}
          </select>
        </div>

        <div className="filter-item">
          <label>Reportee</label>
          <select
            name="reportee"
            value={filters.reportee}
            onChange={handleFilterChange}
          >
            <option value="">All </option>

            {[...new Set(data.map(d => d.employeeName).filter(Boolean))]
              .map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
          </select>
        </div>

        <div className="filter-item">
          <label>Job ID</label>
          <select
            name="jobId"
            value={filters.jobId}
            onChange={handleFilterChange}
          >
            <option value="">All</option>
            {[...new Set(data.map(d => d.jobId))].map((jobId) => (
              <option key={jobId} value={jobId}>
                {jobId}
              </option>
            ))}
          </select>
        </div>

        <div className="filter-item">
          <label>From Date</label>
          <input
            type="date"
            name="fromDate"
            value={filters.fromDate}
            onChange={handleFilterChange}
          />
        </div>

        <div className="filter-item">
          <label>To Date</label>
          <input
            type="date"
            name="toDate"
            value={filters.toDate}
            onChange={handleFilterChange}
          />
        </div>
        <div className="filter-item">
          <label>Month / Year</label>
          <select
            name="monthYear"
            value={filters.monthYear}
            onChange={handleFilterChange}
          >
            <option value="">All</option>
            {[...new Set(data.map(d => d.monthYear))].map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>

      </div>

      {/* BULK ACTIONS */}
      <div className="tm-actions">
        <button
          className="btn-verify"
          disabled={!selected.length}
          onClick={() => bulkUpdateStatus("Verified")}
        >
          Verify Selected ({selected.length})
        </button>

        <button
          className="btn-revise"
          disabled={!selected.length}
          onClick={() => bulkUpdateStatus("Revised")}
        >
          Revise Selected ({selected.length})
        </button>
      </div>

      {/* TABLE WRAPPER (IMPORTANT FOR X AXIS) */}
      <div className="table-wrapper">
        <table className="tm-table">
          <thead>
            <tr>
              <th>
                <input
                  type="checkbox"
                  checked={
                    filteredData.length > 0 &&
                    filteredData.every((item) =>
                      selected.includes(item.id)
                    )
                  }
                  onChange={toggleSelectAll}
                />
              </th>

              <th>Job ID</th>
              <th>Employee</th>
              <th>Date</th>
              <th>Month/Year</th>
              <th>Work Done</th>
              <th>Status</th>
            </tr>
          </thead>

          <tbody>
            {filteredData.map((item) => (
              <tr key={item.id}>
                <td>
                  <input
                    type="checkbox"
                    checked={selected.includes(item.id)}
                    onChange={() => toggleSelect(item.id)}
                  />
                </td>

                <td>
                  {item.jobId}
                  {item.domain && item.domain !== "-"
                    ? ` - ${item.domain}`
                    : ""}
                </td>
                <td>{item.employeeName}</td>
                <td>{item.date}</td>
                <td>{item.monthYear}</td>

                <td className="workdone-cell">
                  <div className="work-text"></div>

                  <button
                    className="workdone-view-btn verified-btn"
                    onClick={() => {
                      setSelectedWork(item);
                      setViewType("verified");

                      localStorage.setItem(
                        `info-${item.id}`,
                        item.workDone || ""
                      );
                    }}
                  >
                    Informational Work
                  </button>

                  <button
                    className="workdone-view-btn revised-btn"
                    onClick={() => {
                      setSelectedWork(item);
                      setViewType("revised");

                      localStorage.setItem(
                        `rev-${item.id}`,
                        item.revisedText || ""
                      );
                    }}
                  >
                    Revised Work
                  </button>
                </td>

                <td className="status-cell">
                  {item.status && item.status !== "Pending" ? (
                    <span className={`status-badge ${item.status.toLowerCase()}`}>
                      {item.status}
                    </span>
                  ) : (
                    <span className="status-empty">-</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {selectedWork && (
        <div
          className="work-modal-overlay"
          onClick={() => setSelectedWork(null)}
        >
          <div
            className="work-modal-card"
            onClick={(e) => e.stopPropagation()}
          >

            {/* HEADER */}
            <div className="work-modal-header">
              <h3>Work Details</h3>

              <button
                className="work-close-btn"
                onClick={() => setSelectedWork(null)}
              >
                ×
              </button>
            </div>

            {/* BODY */}
            <div className="work-modal-body">
              <table className="work-detail-table">
                <tbody>
                  <tr>
                    <th>Job ID</th>
                    <td>{selectedWork.jobId}</td>
                  </tr>

                  <tr>
                    <th>Employee</th>
                    <td>{selectedWork.employeeName}</td>
                  </tr>

                  <tr>
                    <th>Date</th>
                    <td>{selectedWork.date}</td>
                  </tr>

                  <tr>
                    <th>Month/Year</th>
                    <td>{selectedWork.monthYear}</td>
                  </tr>

                  {viewType === "verified" && (
                    <tr>
                      <th>Verified Work</th>
                      <td style={{ whiteSpace: "pre-wrap", color: "green" }}>
                        {selectedWork.workDone || "-"}
                      </td>
                    </tr>
                  )}

                  {viewType === "revised" && (
                    <tr>
                      <th>Revised Work</th>
                      <td style={{ whiteSpace: "pre-wrap", color: "red" }}>
                        {selectedWork.revisedText || "-"}
                      </td>
                    </tr>
                  )}

                  <tr>
                    <td colSpan="2">
                      {selectedWork.status !== "Verified" &&
                        selectedWork.status !== "Revised" && (
                          <div className="modal-action-buttons">

                            <button
                              className="btn-small-verify"
                              onClick={() =>
                                changeStatus(selectedWork.id, "Verified")
                              }
                            >
                              Verified
                            </button>

                            <button
                              className="btn-small-revise"
                              onClick={openRevisedPopup}
                            >
                              Revised
                            </button>

                          </div>
                        )}
                    </td>
                  </tr>

                </tbody>
              </table>
            </div>

          </div>
        </div>
      )}
      {showRevisedPopup && (
        <div
          className="work-modal-overlay"
          onClick={() => setShowRevisedPopup(false)}
        >
          <div
            className="work-modal-card"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="revised-header">
              <h3>Revised Reason</h3>

              <span className="revised-datetime">
                {currentDateTime}
              </span>
            </div>

            <textarea
              value={revisedText}
              onChange={(e) => setRevisedText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();

                  setRevisedText((prev) => {
                    if (prev === "") return "• ";

                    return prev + "\n• ";
                  });
                }
              }}
              placeholder="Enter revision reason..."
            />

            <div style={{ marginTop: "10px", display: "flex", gap: "10px" }}>

              <button
                onClick={async () => {
                  await changeStatus(selectedWork.id, "Revised", revisedText);

                  setRevisedText("");
                  setShowRevisedPopup(false);
                  setSelectedWork(null);
                }}
              >
                Submit
              </button>

              <button onClick={() => setShowRevisedPopup(false)}>
                Cancel
              </button>

            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TimesheetManagement;