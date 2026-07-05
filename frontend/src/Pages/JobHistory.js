import React, { useEffect, useState } from "react";
import axios from "axios";
import { FaEdit, FaTrash } from "react-icons/fa";
import "../style/jobhistory.css";

const JobHistory = () => {
    const [jobs, setJobs] = useState([]);
    const [editingId, setEditingId] = useState(null);
    const [showWorkModal, setShowWorkModal] = useState(false);
    const [selectedJob, setSelectedJob] = useState(null);
    const [workData, setWorkData] = useState([]);
    const [tlName, setTlName] = useState("-");
    const [filters, setFilters] = useState({
        monthYear: "",
        domain: "",
        market: "",
        fromDate: "",
        toDate: "",
    });

    const appliedFilters = filters;

    const [editData, setEditData] = useState({
        internalQc: "",
        amdocsQc: "",
        markupRequired: "",
    });

    useEffect(() => {
        fetchJobs();
    }, []);

    const fetchWorkByJob = async (jobId) => {
        try {
            const res = await axios.get(
                `http://localhost:5000/api/timesheet/job/${jobId}`
            );

            console.log("RAW WORK API RESPONSE:", res.data);

            const rawData = res.data?.data || [];

            // ✅ Normalize backend fields to frontend standard fields
            const normalizedData = rawData.map((item) => ({
                id: item.id,
                jobId: item.jobId,
                task: item.task || "-",
                startTime: item.startTime,
                endTime: item.endTime,
                hours: item.hours,
                created_at: item.created_at,

                teamMember: item.teamMember || "-",
                workDone: item.task || "-",

                tlStatus: item.tlStatus || "-",
                adminStatus: item.adminStatus || "-"
            }));
            setWorkData(normalizedData);
        } catch (error) {
            console.log("FETCH WORK ERROR:", error.message);
            setWorkData([]); // safe fallback
        }
    };

    const fetchJobs = async () => {
        try {
            const res = await axios.get("http://localhost:5000/api/job/all");

            console.log("JOB API DATA =", res.data);

            const job34568 = res.data.find(
                (j) => j.jobId === "34568"
            );

            console.log("JOB 34568 =", job34568);

            setJobs(res.data);
        } catch (error) {
            console.log(error);
        }
    };

    // DELETE
    const handleDelete = async (id) => {
        const confirmDelete = window.confirm(
            "Are you sure you want to delete this job?"
        );

        if (!confirmDelete) return;

        try {
            await axios.delete(`http://localhost:5000/api/job/delete/${id}`);
            alert("Job Deleted Successfully");
            fetchJobs();
        } catch (error) {
            console.log(error);
            alert("Delete Failed");
        }
    };

    // EDIT
    const handleEdit = (job) => {
        setEditingId(job.id);

        setEditData({
            internalQc: job.internalQc || "",
            amdocsQc: job.amdocsQc || "",
            markupRequired: job.markupRequired || "",
        });
    };

    // SAVE
    const handleSave = async (id) => {
        try {
            await axios.put(
                `http://localhost:5000/api/job/update/${id}`,
                editData
            );

            alert("Job Updated Successfully");

            setEditingId(null);

            setEditData({
                internalQc: "",
                amdocsQc: "",
                markupRequired: "",
            });

            await fetchJobs(); // 👈 IMPORTANT (wait added)
        } catch (error) {
            console.log(error);
            alert("Update Failed");
        }
    };

    // CLOSE
    const handleClose = () => {
        setEditingId(null);
        setEditData({
            internalQc: "",
            amdocsQc: "",
            markupRequired: "",
        });
    };
    const handleViewWork = async (job) => {
        setSelectedJob(job);
        setShowWorkModal(true);

        // Work data fetch
        await fetchWorkByJob(job.jobId);

        // TL fetch by domain
        try {
            const res = await axios.get(
                `http://localhost:5000/api/auth/tl/bydomain?domain=${job.domain}`
            );

            console.log("TL API RESPONSE =", res.data);

            const tlData = res.data?.data || [];

            setTlName(
                tlData.length > 0
                    ? tlData.map((item) => item.name).join(", ")
                    : "-"
            );
        } catch (error) {
            console.log("TL FETCH ERROR:", error);
            setTlName("-");
        }
    };
    const filteredJobs = jobs.filter((job) => {
        const receiveDate = job.receiveDate
            ? new Date(job.receiveDate)
            : null;

        const jobMonthYear = receiveDate
            ? `${receiveDate.toLocaleString("default", {
                month: "long",
            })}-${receiveDate.getFullYear()}`
            : "";

        const jobDate = receiveDate
            ? receiveDate.toISOString().split("T")[0]
            : "";

        const matchMonthYear =
            !appliedFilters.monthYear ||
            jobMonthYear === appliedFilters.monthYear;

        const matchDomain =
            !appliedFilters.domain ||
            job.domain === appliedFilters.domain;

        const matchMarket =
            !appliedFilters.market ||
            job.market === appliedFilters.market;

        const matchFromDate =
            !appliedFilters.fromDate ||
            jobDate >= appliedFilters.fromDate;

        const matchToDate =
            !appliedFilters.toDate ||
            jobDate <= appliedFilters.toDate;

        return (
            matchMonthYear &&
            matchDomain &&
            matchMarket &&
            matchFromDate &&
            matchToDate
        );
    });
    return (
        <div className="job-history-container">
            <h2 className="page-title">Job History</h2>
            <div className="job-filter-container">

                {/* Month-Year */}
                <div className="job-filter-group">
                    <label className="job-filter-label">Month-Year</label>
                    <select
                        className="job-filter-input"
                        value={filters.monthYear}
                        onChange={(e) =>
                            setFilters({ ...filters, monthYear: e.target.value })
                        }
                    >
                        <option value="">All Month-Year</option>

                        {[...new Set(
                            jobs.map((job) => {
                                if (!job.receiveDate) return null;

                                const d = new Date(job.receiveDate);

                                return `${d.toLocaleString("default", {
                                    month: "long",
                                })}-${d.getFullYear()}`;
                            })
                        )]
                            .filter(Boolean)
                            .map((item) => (
                                <option key={item} value={item}>
                                    {item}
                                </option>
                            ))}
                    </select>
                </div>

                {/* Domain */}
                <div className="job-filter-group">
                    <label className="job-filter-label">Domain</label>
                    <select
                        className="job-filter-input"
                        value={filters.domain}
                        onChange={(e) =>
                            setFilters({ ...filters, domain: e.target.value })
                        }
                    >
                        <option value="">All Domain</option>

                        {jobs
                            .map((j) => j.domain)
                            .filter((v, i, a) => v && a.indexOf(v) === i)
                            .map((d) => (
                                <option key={d} value={d}>
                                    {d}
                                </option>
                            ))}
                    </select>
                </div>

                {/* Market */}
                <div className="job-filter-group">
                    <label className="job-filter-label">Market</label>
                    <select
                        className="job-filter-input"
                        value={filters.market}
                        onChange={(e) =>
                            setFilters({ ...filters, market: e.target.value })
                        }
                    >
                        <option value="">All Market</option>

                        {jobs
                            .map((j) => j.market)
                            .filter((v, i, a) => v && a.indexOf(v) === i)
                            .map((m) => (
                                <option key={m} value={m}>
                                    {m}
                                </option>
                            ))}
                    </select>
                </div>

                {/* From Date */}
                <div className="job-filter-group">
                    <label className="job-filter-label">From Date</label>
                    <input
                        className="job-filter-input"
                        type="date"
                        value={filters.fromDate}
                        onChange={(e) =>
                            setFilters({ ...filters, fromDate: e.target.value })
                        }
                    />
                </div>

                {/* To Date */}
                <div className="job-filter-group">
                    <label className="job-filter-label">To Date</label>
                    <input
                        className="job-filter-input"
                        type="date"
                        value={filters.toDate}
                        onChange={(e) =>
                            setFilters({ ...filters, toDate: e.target.value })
                        }
                    />
                </div>

                {/* Buttons */}
                <div className="job-filter-actions">
                    <button
                        className="job-apply-btn"
                        onClick={() => console.log(filters)}
                    >
                        Apply
                    </button>

                    <button
                        className="job-clear-btn"
                        onClick={() =>
                            setFilters({
                                monthYear: "",
                                domain: "",
                                market: "",
                                fromDate: "",
                                toDate: "",
                            })
                        }
                    >
                        Clear
                    </button>
                </div>

            </div>

            <div className="table-wrapper">
                <table className="job-history-table">
                    <thead>
                        <tr>
                            <th rowSpan="2">Sl. No</th>
                            <th rowSpan="2">Month</th>
                            <th rowSpan="2">Year</th>
                            <th rowSpan="2">Domain</th>
                            <th rowSpan="2">Market</th>
                            <th rowSpan="2">Job ID</th>
                            <th rowSpan="2">Received Date</th>
                            <th rowSpan="2">ECD Date</th>
                            <th rowSpan="2">Submission Date</th>
                            <th rowSpan="2">View Work</th>
                            <th colSpan="2">QC Status</th>
                            <th rowSpan="2">Markup Required</th>
                            <th rowSpan="2">Action</th>
                            <th rowSpan="2">Last Updated Date</th>
                        </tr>
                        <tr>
                            <th>Internal QC</th>
                            <th>Amdocs QC</th>
                        </tr>
                    </thead>

                    <tbody>
                        {filteredJobs.length > 0 ? (
                            filteredJobs.map((job, index) => {
                                const receive = job.receiveDate
                                    ? new Date(job.receiveDate)
                                    : null;

                                return (
                                    <tr key={job.id}>
                                        <td>{index + 1}</td>

                                        <td>
                                            {receive
                                                ? receive.toLocaleString("default", {
                                                    month: "long",
                                                })
                                                : "-"}
                                        </td>

                                        <td>
                                            {receive ? receive.getFullYear() : "-"}
                                        </td>

                                        <td>{job.domain}</td>
                                        <td>{job.market}</td>
                                        <td>{job.jobId}</td>

                                        <td>
                                            {job.receiveDate?.split("T")[0] || "-"}
                                        </td>

                                        <td>{job.ecdDate?.split("T")[0] || "-"}</td>
                                        <td>
                                            {job.submissionDate?.split("T")[0] || "-"}
                                        </td>
                                        <td>
                                            <button
                                                className="view-work-btn"
                                                onClick={() => handleViewWork(job)}
                                            >
                                                View
                                            </button>
                                        </td>

                                        {/* Internal QC */}
                                        <td>
                                            {editingId === job.id ? (
                                                <input
                                                    type="text"
                                                    value={editData.internalQc}
                                                    onChange={(e) =>
                                                        setEditData({
                                                            ...editData,
                                                            internalQc: e.target.value,
                                                        })
                                                    }
                                                />
                                            ) : (
                                                job.internalQc || "-"
                                            )}
                                        </td>

                                        {/* Amdocs QC */}
                                        <td>
                                            {editingId === job.id ? (
                                                <input
                                                    type="text"
                                                    value={editData.amdocsQc}
                                                    onChange={(e) =>
                                                        setEditData({
                                                            ...editData,
                                                            amdocsQc: e.target.value,
                                                        })
                                                    }
                                                />
                                            ) : (
                                                job.amdocsQc || "-"
                                            )}
                                        </td>

                                        {/* Markup */}
                                        <td>
                                            {editingId === job.id ? (
                                                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "8px" }}>

                                                    {/* YES / NO BUTTONS */}
                                                    <div style={{ display: "flex", gap: "10px" }}>

                                                        <div
                                                            onClick={() =>
                                                                setEditData({ ...editData, markupRequired: "Yes" })
                                                            }
                                                            style={{
                                                                padding: "4px 12px",
                                                                border: "1px solid #999",
                                                                borderRadius: "4px",
                                                                cursor: "pointer",
                                                                background: editData.markupRequired === "Yes" ? "maroon" : "white",
                                                                color: editData.markupRequired === "Yes" ? "white" : "black",
                                                            }}
                                                        >
                                                            Yes
                                                        </div>

                                                        <div
                                                            onClick={() =>
                                                                setEditData({ ...editData, markupRequired: "No" })
                                                            }
                                                            style={{
                                                                padding: "4px 12px",
                                                                border: "1px solid #999",
                                                                borderRadius: "4px",
                                                                cursor: "pointer",
                                                                background: editData.markupRequired === "No" ? "maroon" : "white",
                                                                color: editData.markupRequired === "No" ? "white" : "black",
                                                            }}
                                                        >
                                                            No
                                                        </div>

                                                    </div>

                                                    {/* INPUT FIELD ONLY WHEN YES */}
                                                    {editData.markupRequired === "Yes" && (
                                                        <input
                                                            type="text"
                                                            value={editData.value || ""}
                                                            onChange={(e) =>
                                                                setEditData({
                                                                    ...editData,
                                                                    value: e.target.value,
                                                                })
                                                            }
                                                            placeholder="Type here..."
                                                            style={{ padding: "4px", width: "100px" }}
                                                        />
                                                    )}

                                                </div>
                                            ) : (
                                                job.markupRequired || "No"
                                            )}
                                        </td>

                                        {/* Action */}
                                        <td>
                                            {editingId === job.id ? (
                                                <div style={{ display: "flex", gap: "8px" }}>
                                                    <button onClick={() => handleSave(job.id)}>
                                                        Save
                                                    </button>
                                                    <button onClick={handleClose}>
                                                        Close
                                                    </button>
                                                </div>
                                            ) : (
                                                <div
                                                    style={{
                                                        display: "flex",
                                                        gap: "12px",
                                                        justifyContent: "center",
                                                    }}
                                                >
                                                    <FaEdit
                                                        style={{ color: "#2563eb", cursor: "pointer" }}
                                                        onClick={() => handleEdit(job)}
                                                    />
                                                    <FaTrash
                                                        style={{ color: "#dc2626", cursor: "pointer" }}
                                                        onClick={() => handleDelete(job.id)}
                                                    />
                                                </div>
                                            )}
                                        </td>

                                        {/* Last Updated */}
                                        <td>
                                            {job.updated_at
                                                ? new Date(job.updated_at).toLocaleString("en-IN", {
                                                    dateStyle: "medium",
                                                    timeStyle: "short",
                                                })
                                                : "-"}
                                        </td>
                                    </tr>
                                );
                            })
                        ) : (
                            <tr>
                                <td colSpan="15" style={{ textAlign: "center", padding: "20px" }}>
                                    No Job History Found
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
            {showWorkModal && selectedJob && (
                <div className="jobwork-overlay">
                    <div className="jobwork-modal">

                        {/* Header */}
                        <div className="jobwork-header">
                            <h3 className="jobwork-title">
                                A. General Information
                            </h3>

                            <button
                                className="jobwork-close-btn"
                                onClick={() => setShowWorkModal(false)}
                            >
                                ✕
                            </button>
                        </div>

                        {/* General Information */}
                        <div className="jobwork-general-section">

                            <div className="jobwork-general-left">

                                <div className="jobwork-info-row">
                                    <span className="jobwork-label">Job ID :</span>
                                    <span>{selectedJob.jobId}</span>
                                </div>

                                <div className="jobwork-info-row">
                                    <span className="jobwork-label">Domain :</span>
                                    <span>{selectedJob.domain}</span>
                                </div>

                                <div className="jobwork-info-row">
                                    <span className="jobwork-label">TL :</span>
                                    <span>{tlName}</span>
                                </div>

                            </div>

                            <div className="jobwork-general-right">
                                <div className="jobwork-qc-heading">
                                    Internal QC
                                </div>

                                <div
                                    className="jobwork-qc-value"
                                    style={{
                                        fontWeight: "bold",
                                        color: (() => {
                                            const val = parseFloat(selectedJob?.internalQc);

                                            if (isNaN(val)) return "#000";

                                            if (val >= 80) return "green";
                                            if (val >= 50) return "#b8860b"; // yellow (dark golden)
                                            return "red";
                                        })(),
                                    }}
                                >
                                    {selectedJob?.internalQc ? `${selectedJob.internalQc}` : "-"}
                                </div>
                            </div>

                        </div>

                        {/* Work Information */}
                        <div className="jobwork-section">

                            <h3 className="jobwork-section-title">
                                B. Work Information
                            </h3>

                            <table className="jobwork-table">

                                <thead>
                                    <tr>
                                        <th>Team Members</th>
                                        <th>Work Done</th>
                                        <th>TL Status</th>
                                        <th>Admin Status</th>
                                    </tr>
                                </thead>

                                <tbody>
                                    {workData.length === 0 ? (
                                        <tr>
                                            <td colSpan="4">No Work Found</td>
                                        </tr>
                                    ) : (
                                        workData.map((item, index) => (
                                            <tr key={item.id || index}>

                                                {/* Team Member */}
                                                <td>
                                                    {item.teamMember ||
                                                        item.employeeName ||
                                                        item.assignedTo ||
                                                        "-"}
                                                </td>

                                                {/* Work Done */}
                                                <td>
                                                    {item.workDone ||
                                                        item.task ||
                                                        item.typeOfWork ||
                                                        "-"}
                                                </td>

                                                {/* TL Status */}
                                                <td>{item.tlStatus || item.teamLeadStatus || "-"}</td>

                                                {/* Admin Status */}
                                                <td>{item.adminStatus || "-"}</td>

                                            </tr>
                                        ))
                                    )}
                                </tbody>

                            </table>

                        </div>

                    </div>
                </div>
            )}
        </div>

    );
};

export default JobHistory;