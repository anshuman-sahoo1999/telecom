import React, { useEffect, useState } from "react";
import axios from "axios";
import { FaEdit, FaTrash } from "react-icons/fa";
import "../style/jobhistory.css";

const JobHistory = () => {
    const [jobs, setJobs] = useState([]);
    const [workDataReport, setWorkDataReport] = useState([]);
    const [domains, setDomains] = useState([]);
    const [editingId, setEditingId] = useState(null);
    const [showWorkModal, setShowWorkModal] = useState(false);
    const [selectedJob, setSelectedJob] = useState(null);
    const [workData, setWorkData] = useState([]);
    const [tlName, setTlName] = useState("-");

    // Pagination State
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 10;

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
        otp: "",
        jobId: "",
    });

    const formatLocalDate = (dateStr) => {
        if (!dateStr) return "-";
        const d = new Date(dateStr);
        if (isNaN(d)) return "-";
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, "0");
        const day = String(d.getDate()).padStart(2, "0");
        return `${year}-${month}-${day}`;
    };

    useEffect(() => {
        fetchJobs();
        fetchReportData();
        fetchMasterDomains();
    }, []);

    useEffect(() => {
        setCurrentPage(1);
    }, [filters]);

    const fetchReportData = async () => {
        try {
            const res = await axios.get("http://localhost:5000/api/work/all");
            const data = Array.isArray(res.data) ? res.data : (res.data?.data || []);
            setWorkDataReport(data);
        } catch (error) {
            console.log("FETCH REPORT WORK ERROR:", error);
        }
    };

    const fetchMasterDomains = async () => {
        try {
            const res = await axios.get("http://localhost:5000/api/master");
            const data = res.data || {};
            setDomains(Object.keys(data));
        } catch (error) {
            console.log("FETCH MASTER DOMAINS ERROR:", error);
        }
    };

    const fetchWorkByJob = async (jobId) => {
        try {
            const res = await axios.get(
                `http://localhost:5000/api/timesheet/job/${jobId}`
            );

            const rawData = res.data?.data || [];

            const normalizedData = rawData.map((item) => ({
                id: item.id,
                jobId: item.jobId || item.job_id,
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
            setWorkData([]);
        }
    };

    const fetchJobs = async () => {
        try {
            const res = await axios.get("http://localhost:5000/api/job/all");
            const data = Array.isArray(res.data) ? res.data : (res.data?.data || []);
            setJobs(data);
        } catch (error) {
            console.log("FETCH JOBS ERROR:", error);
        }
    };

    const rawCombinedData = [
        ...jobs,
        ...workDataReport.filter(reportItem => {
            const reportJobId = String(reportItem.jobId || reportItem.job_id || reportItem.id || "").trim();
            if (!reportJobId) return true;

            return !jobs.some(job => {
                const jobId = String(job.jobId || job.job_id || job.id || "").trim();
                return jobId === reportJobId;
            });
        })
    ];

    // Deduplication logic to prevent duplicate UI rendering
    const uniqueMap = new Map();
    rawCombinedData.forEach(item => {
        const jId = String(item.jobId || item.job_id || "").trim();
        if (jId && jId !== "-") {
            if (!uniqueMap.has(jId)) {
                uniqueMap.set(jId, item);
            }
        } else {
            uniqueMap.set(item.id, item);
        }
    });
    const combinedData = Array.from(uniqueMap.values());

    // Normalize and convert all domains to uppercase so they never appear small
    const normalizeUpper = (d) => (d || "").toString().trim().toUpperCase();
    const masterDomains = (domains || []).map(normalizeUpper);
    const jobDomains = combinedData.map(j => normalizeUpper(j.domain));
    const mergedDomains = [...new Set([...masterDomains, ...jobDomains])].filter(Boolean);

    const handleDelete = async (job) => {
        const confirmDelete = window.confirm(
            "Are you sure you want to delete this job?"
        );

        if (!confirmDelete) return;

        const rowId = job.id;
        const businessJobId = job.jobId || job.job_id || "";

        try {
            const url = businessJobId
                ? `http://localhost:5000/api/job/delete/${rowId}?jobId=${encodeURIComponent(businessJobId)}`
                : `http://localhost:5000/api/job/delete/${rowId}`;

            await axios.delete(url);
            alert("Job Deleted Successfully");
            fetchJobs();
            fetchReportData();
        } catch (error) {
            console.log(error);
            alert("Delete Failed");
        }
    };

    const handleEdit = (job) => {
        setEditingId(job.id);

        setEditData({
            internalQc: job.internalQc || job.internal_qc || job.amdocs_qc || "",
            amdocsQc: job.amdocsQc || job.amdocs_qc || "",
            otp: job.otp || job.internalOtp || "",
            jobId: job.jobId || job.job_id || "",
        });
    };

    const handleSave = async (id) => {
        const confirmSave = window.confirm(
            "Are you sure you want to save changes?"
        );

        if (!confirmSave) {
            return;
        }

        const job = combinedData.find((j) => j.id === id);

        try {
            const payload = {
                internalQc: editData.internalQc,
                amdocsQc: editData.amdocsQc,
                otp: editData.otp,
                internalOtp: editData.otp,
                jobId: editData.jobId,
                month: job ? parseMonthField(job) : "",
            };

            const res = await axios.put(
                `http://localhost:5000/api/job/update/${id}`,
                payload
            );

            if (res.status === 200) {
                alert("✅ Record updated successfully");
                setEditingId(null);
                setEditData({
                    internalQc: "",
                    amdocsQc: "",
                    otp: "",
                    jobId: "",
                });
                await fetchJobs();
                await fetchReportData();
            }
        } catch (error) {
            console.log(error);
            alert("❌ Update failed");
        }
    };

    const handleClose = () => {
        setEditingId(null);
        setEditData({
            internalQc: "",
            amdocsQc: "",
            otp: "",
            jobId: "",
        });
    };

    const handleViewWork = async (job) => {
        setSelectedJob(job);
        setShowWorkModal(true);

        const targetJobId = job.jobId || job.job_id;
        if (targetJobId) {
            await fetchWorkByJob(targetJobId);
        } else {
            setWorkData([]);
        }

        try {
            const domainVal = job.domain || "";
            if (domainVal) {
                const res = await axios.get(
                    `http://localhost:5000/api/auth/tl/bydomain?domain=${domainVal}`
                );

                const tlData = res.data?.data || [];

                setTlName(
                    tlData.length > 0
                        ? tlData.map((item) => item.name).join(", ")
                        : "-"
                );
            } else {
                setTlName("-");
            }
        } catch (error) {
            console.log("TL FETCH ERROR:", error);
            setTlName("-");
        }
    };

    const parseMonthField = (job) => {
        let val = job.month || job.Month || job.months;
        if (!val) return "-";
        if (Array.isArray(val)) {
            return val.length > 0 ? val[0] : "-";
        }
        if (typeof val === "string") {
            try {
                const parsed = JSON.parse(val);
                if (Array.isArray(parsed)) {
                    return parsed.length > 0 ? parsed[0] : "-";
                }
            } catch (e) {
                // Not JSON string
            }
        }
        return val;
    };

    const filteredJobs = combinedData.filter((job) => {
        const jobMonthYear = parseMonthField(job);

        const receiveDateStr = formatLocalDate(job.receiveDate || job.receive_date);
        const jobDate = receiveDateStr;

        const matchMonthYear =
            !appliedFilters.monthYear ||
            jobMonthYear === appliedFilters.monthYear;

        const matchDomain =
            !appliedFilters.domain ||
            normalizeUpper(job.domain) === normalizeUpper(appliedFilters.domain);

        const matchMarket =
            !appliedFilters.market ||
            job.market === appliedFilters.market || job.state === appliedFilters.market;

        const matchFromDate =
            !appliedFilters.fromDate ||
            (jobDate !== "-" && jobDate >= appliedFilters.fromDate);

        const matchToDate =
            !appliedFilters.toDate ||
            (jobDate !== "-" && jobDate <= appliedFilters.toDate);

        return (
            matchMonthYear &&
            matchDomain &&
            matchMarket &&
            matchFromDate &&
            matchToDate
        );
    });

    const sortedFilteredJobs = [...filteredJobs].sort((a, b) => {
        const idA = Number(a.id) || 0;
        const idB = Number(b.id) || 0;
        return idA - idB;
    });

    const totalPages = Math.ceil(sortedFilteredJobs.length / itemsPerPage) || 1;
    const startIndex = (currentPage - 1) * itemsPerPage;
    const currentJobs = sortedFilteredJobs.slice(startIndex, startIndex + itemsPerPage);

    const handlePrevPage = () => {
        if (currentPage > 1) {
            setCurrentPage(currentPage - 1);
        }
    };

    const handleNextPage = () => {
        if (currentPage < totalPages) {
            setCurrentPage(currentPage + 1);
        }
    };

    const handlePageInputChange = (e) => {
        const value = e.target.value;
        if (value === "") {
            setCurrentPage("");
            return;
        }
        const pageNum = parseInt(value, 10);
        if (!isNaN(pageNum)) {
            if (pageNum >= 1 && pageNum <= totalPages) {
                setCurrentPage(pageNum);
            } else if (pageNum > totalPages) {
                setCurrentPage(totalPages);
            }
        }
    };

    const handlePageInputBlur = () => {
        if (!currentPage || currentPage < 1) {
            setCurrentPage(1);
        }
    };

    return (
        <div className="job-history-container">
            <h2 className="page-title">Job History</h2>
            <div className="job-filter-container">

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
                            combinedData.map((job) => parseMonthField(job))
                        )]
                            .filter(item => item && item !== "-")
                            .map((item) => (
                                <option key={item} value={item}>
                                    {item}
                                </option>
                            ))}
                    </select>
                </div>

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

                        {mergedDomains.map((d) => (
                            <option key={d} value={d}>
                                {d}
                            </option>
                        ))}
                    </select>
                </div>

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

                        {combinedData
                            .map((j) => j.market || j.state)
                            .filter((v, i, a) => v && a.indexOf(v) === i)
                            .map((m) => (
                                <option key={m} value={m}>
                                    {m}
                                </option>
                            ))}
                    </select>
                </div>

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

                <div className="job-filter-actions">
                    <button
                        className="job-apply-btn"
                        onClick={() => {
                            fetchJobs();
                            fetchReportData();
                            fetchMasterDomains();
                        }}
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
                            <th rowSpan="2">Domain</th>
                            <th rowSpan="2">Market</th>
                            <th rowSpan="2">Job ID</th>
                            <th rowSpan="2">Received Date</th>
                            <th rowSpan="2">ECD Date</th>
                            <th rowSpan="2">Submission Date</th>
                            <th rowSpan="2">View Work</th>
                            <th colSpan="2">QC Status</th>
                            <th rowSpan="2">OTP Status</th>
                            <th rowSpan="2">Action</th>
                            <th rowSpan="2">Last Updated Date</th>
                        </tr>
                        <tr>
                            <th>Internal QC</th>
                            <th>Amdocs QC</th>
                        </tr>
                    </thead>

                    <tbody>
                        {currentJobs.length > 0 ? (
                            currentJobs.map((job, index) => {
                                const receiveStr = formatLocalDate(job.receiveDate || job.receive_date);
                                const subDateVal = job.submissionDate || job.submission_date || job.submissiondate;
                                const monthVal = parseMonthField(job);

                                const otpVal = job.otp || job.internalOtp;
                                const amdocsVal = job.amdocsQc || job.amdocs_qc;
                                
                                // Check if OTP or Amdocs QC is missing or '-'
                                const isMissingOtpOrAmdocs =
                                    !otpVal || otpVal === "-" || !amdocsVal || amdocsVal === "-";

                                return (
                                    <tr 
                                        key={job.id || index}
                                        className={isMissingOtpOrAmdocs ? "light-orange-row" : ""}
                                    >
                                        <td>{startIndex + index + 1}</td>

                                        <td>{monthVal}</td>
                                        <td>{job.domain ? job.domain.toUpperCase() : "-"}</td>
                                        <td>{job.market || job.state || "-"}</td>
                                        <td>{job.jobId || job.job_id || "-"}</td>
                                        <td>{receiveStr}</td>
                                        <td>{formatLocalDate(job.ecdDate || job.ecd_date)}</td>
                                        <td>{formatLocalDate(subDateVal)}</td>
                                        <td>
                                            <button
                                                className="view-work-btn"
                                                onClick={() => handleViewWork(job)}
                                            >
                                                View
                                            </button>
                                        </td>

                                        <td>
                                            {editingId === job.id ? (
                                                <input
                                                    type="text"
                                                    style={{ width: "70px", padding: "4px" }}
                                                    value={editData.internalQc}
                                                    onChange={(e) =>
                                                        setEditData({
                                                            ...editData,
                                                            internalQc: e.target.value,
                                                        })
                                                    }
                                                />
                                            ) : (
                                                job.internalQc || job.internal_qc || job.amdocs_qc || "-"
                                            )}
                                        </td>

                                        <td>
                                            {editingId === job.id ? (
                                                <input
                                                    type="text"
                                                    style={{ width: "70px", padding: "4px" }}
                                                    value={editData.amdocsQc}
                                                    onChange={(e) =>
                                                        setEditData({
                                                            ...editData,
                                                            amdocsQc: e.target.value,
                                                        })
                                                    }
                                                />
                                            ) : (
                                                job.amdocsQc || job.amdocs_qc || "-"
                                            )}
                                        </td>

                                        <td>
                                            {editingId === job.id ? (
                                                <input
                                                    type="text"
                                                    style={{ width: "70px", padding: "4px" }}
                                                    value={editData.otp}
                                                    onChange={(e) =>
                                                        setEditData({
                                                            ...editData,
                                                            otp: e.target.value,
                                                        })
                                                    }
                                                />
                                            ) : (
                                                job.otp || job.internalOtp || "-"
                                            )}
                                        </td>

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
                                                        onClick={() => handleDelete(job)}
                                                    />
                                                </div>
                                            )}
                                        </td>

                                        <td>
                                            {job.updated_at || job.updatedAt
                                                ? new Date(job.updated_at || job.updatedAt).toLocaleString("en-IN", {
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
                                <td colSpan="14" style={{ textAlign: "center", padding: "20px" }}>
                                    No Job History Found
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            <div className="pagination-container" style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: "8px", marginTop: "16px" }}>
                <button
                    className="pagination-btn"
                    onClick={handlePrevPage}
                    disabled={currentPage === 1 || !currentPage}
                    style={{
                        padding: "6px 12px",
                        cursor: currentPage === 1 || !currentPage ? "not-allowed" : "pointer",
                        opacity: currentPage === 1 || !currentPage ? 0.5 : 1
                    }}
                >
                    Prev
                </button>

                <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <input
                        type="number"
                        min="1"
                        max={totalPages}
                        value={currentPage}
                        onChange={handlePageInputChange}
                        onBlur={handlePageInputBlur}
                        style={{
                            width: "55px",
                            textAlign: "center",
                            padding: "4px",
                            border: "1px solid #ccc",
                            borderRadius: "4px"
                        }}
                    />
                    / {totalPages}
                </span>

                <button
                    className="pagination-btn"
                    onClick={handleNextPage}
                    disabled={currentPage === totalPages || !currentPage}
                    style={{
                        padding: "6px 12px",
                        cursor: currentPage === totalPages || !currentPage ? "not-allowed" : "pointer",
                        opacity: currentPage === totalPages || !currentPage ? 0.5 : 1
                    }}
                >
                    Next
                </button>
            </div>

            {showWorkModal && selectedJob && (
                <div className="jobwork-overlay">
                    <div className="jobwork-modal">
                        <div className="jobwork-header">
                            <h3 className="jobwork-title">A. General Information</h3>
                            <button
                                className="jobwork-close-btn"
                                onClick={() => setShowWorkModal(false)}
                            >
                                ✕
                            </button>
                        </div>

                        <div className="jobwork-general-section">
                            <div className="jobwork-general-left">
                                <div className="jobwork-info-row">
                                    <span className="jobwork-label">Job ID :</span>
                                    <span>{selectedJob.jobId || selectedJob.job_id || "-"}</span>
                                </div>
                                <div className="jobwork-info-row">
                                    <span className="jobwork-label">Domain :</span>
                                    <span>{selectedJob.domain ? selectedJob.domain.toUpperCase() : "-"}</span>
                                </div>
                                <div className="jobwork-info-row">
                                    <span className="jobwork-label">TL :</span>
                                    <span>{tlName}</span>
                                </div>
                            </div>

                            <div className="jobwork-general-right">
                                <div className="jobwork-qc-wrapper">
                                    <div className="jobwork-qc-box">
                                        <div className="jobwork-qc-heading">Internal QC</div>
                                        <div
                                            className="jobwork-qc-value"
                                            style={{
                                                color: (() => {
                                                    const val = parseFloat(selectedJob?.internalQc || selectedJob?.internal_qc || selectedJob?.amdocs_qc);
                                                    if (isNaN(val)) return "#000";
                                                    if (val >= 80) return "green";
                                                    if (val >= 50) return "#b8860b";
                                                    return "red";
                                                })(),
                                            }}
                                        >
                                            {selectedJob?.internalQc || selectedJob?.internal_qc || selectedJob?.amdocs_qc ? `${selectedJob.internalQc || selectedJob.internal_qc || selectedJob.amdocs_qc}` : "-"}
                                        </div>
                                    </div>

                                    <div className="jobwork-qc-box">
                                        <div className="jobwork-qc-heading">Amdocs QC</div>
                                        <div
                                            className="jobwork-qc-value"
                                            style={{
                                                color: (() => {
                                                    const val = parseFloat(selectedJob?.amdocsQc || selectedJob?.amdocs_qc);
                                                    if (isNaN(val)) return "#000";
                                                    if (val >= 80) return "green";
                                                    if (val >= 50) return "#b8860b";
                                                    return "red";
                                                })(),
                                            }}
                                        >
                                            {selectedJob?.amdocsQc || selectedJob?.amdocs_qc ? `${selectedJob.amdocsQc || selectedJob.amdocs_qc}` : "-"}
                                        </div>
                                    </div>
                                </div>

                                <div className="jobwork-otp-container">
                                    <div className="jobwork-qc-heading">OTP</div>
                                    <div className="jobwork-otp-value">
                                        {selectedJob?.otp || selectedJob?.internalOtp || "-"}
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="jobwork-section">
                            <h3 className="jobwork-section-title">B. Work Information</h3>
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
                                            <td colSpan="4">No Work Flow Found</td>
                                        </tr>
                                    ) : (
                                        workData.map((item, index) => (
                                            <tr key={item.id || index}>
                                                <td>
                                                    {item.teamMember ||
                                                        item.employeeName ||
                                                        item.assignedTo ||
                                                        "-"}
                                                </td>
                                                <td>
                                                    {item.workDone ||
                                                        item.task ||
                                                        item.typeOfWork ||
                                                        "-"}
                                                </td>
                                                <td>{item.tlStatus || item.teamLeadStatus || "-"}</td>
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
