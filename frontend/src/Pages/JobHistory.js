import { API_BASE_URL } from "../config";
import React, { useCallback, useEffect, useRef, useState } from "react";
import axios from "axios";
import { FaEdit, FaTrash } from "react-icons/fa";
import "../style/jobhistory.css";

const normalizeUpper = (d) => (d || "").toString().trim().toUpperCase();

const pad2 = (n) => String(n).padStart(2, "0");

// Date ko "YYYY-MM-DD" banata hai. "03-05-2026 10:30" jaisi value me time ho tab bhi date sahi nikalti hai.
const toDateKey = (value) => {
  if (!value) return null;
  if (typeof value === "string") {
    const v = value.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;

    // "2026-03-05 10:30"
    let m = v.match(/^(\d{4})-(\d{2})-(\d{2})\s+\d{1,2}:\d{2}/);
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;

    // "03-05-2026" ya "03-05-2026 10:30" (MM-DD-YYYY)
    m = v.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})(?:\s|$)/);
    if (m && Number(m[1]) >= 1 && Number(m[1]) <= 12 && Number(m[2]) >= 1 && Number(m[2]) <= 31) {
      return `${m[3]}-${pad2(m[1])}-${pad2(m[2])}`;
    }
  }
  const d = new Date(value);
  if (isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
};

// "03-05-2026 10:30" me se "10:30" nikalta hai. Time na ho (ya 00:00 ho) to "".
const toTimeKey = (value) => {
  if (typeof value !== "string") return "";
  const v = value.trim();
  // ISO + Z (timezone wali string) ka time bharosemand nahi, isliye ignore
  if (/^\d{4}-\d{2}-\d{2}T.*Z$/.test(v)) return "";
  const m = v.match(/(?:^|[\sT])(\d{1,2}):(\d{2})/);
  if (!m) return "";
  if (Number(m[1]) === 0 && Number(m[2]) === 0) return "";
  return `${pad2(m[1])}:${m[2]}`;
};

// UI ke liye MM-DD-YYYY
const formatLocalDate = (value) => {
  const key = toDateKey(value);
  if (!key) return "-";
  const [y, m, d] = key.split("-");
  return `${m}-${d}-${y}`;
};

const formatDateTime = (value) => {
  if (!value) return "-";
  const d = new Date(value);
  if (isNaN(d.getTime())) return "-";
  return d.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
};

const parseMonthField = (job) => {
  const val = job.month || job.Month || job.months;
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
      // JSON nahi hai to normal string ki tarah hi use hoga
      return val;
    }
  }
  return val;
};

const getJobId = (job) => job?.jobId || job?.job_id || "";
const getInternalQc = (job) => job?.internalQc || job?.internal_qc || "";
const getAmdocsQc = (job) => job?.amdocsQc || job?.amdocs_qc || "";
const getOtp = (job) => job?.otp || job?.internalOtp || "";

const qcColor = (value) => {
  const val = parseFloat(value);
  if (isNaN(val)) return "#000";
  if (val >= 80) return "green";
  if (val >= 50) return "#b8860b";
  return "red";
};

// "80%", "↑ 80%", "0.8" jaisi value se number nikalta hai (nahi mila to null)
const parsePercent = (v) => {
  if (v === null || v === undefined) return null;
  // Arrow, % aur space hata ke sirf number (digits, dot, minus) rakhta hai
  const t = v.toString().replace(/[^0-9.-]/g, "");
  if (t === "" || t === "-") return null;
  const n = parseFloat(t);
  return isNaN(n) ? null : n;
};

// Deviation = Amdocs QC - Internal QC
//   Internal 80%, Amdocs 90%  -> 10%  ↑ (green)
//   Internal 70%, Amdocs 60%  -> 10%  ↓ (red)
// Dono me se koi khaali ho to "-"
const getDeviation = (internalQc, amdocsQc) => {
  const internal = parsePercent(internalQc);
  const amdocs = parsePercent(amdocsQc);
  if (internal === null || amdocs === null) return { text: "-", trend: "" };

  const diff = Math.round((amdocs - internal) * 100) / 100;
  if (diff === 0) return { text: "0%", trend: "" };
  return { text: `${Math.abs(diff)}%`, trend: diff > 0 ? "up" : "down" };
};

const DEVIATION_UP = "#16a34a";
const DEVIATION_DOWN = "#dc2626";

// Deviation cell: value + uske side me arrow
const DeviationCell = ({ text, trend }) => {
  if (!trend) return text || "-";
  const color = trend === "up" ? DEVIATION_UP : DEVIATION_DOWN;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontWeight: 700, color }}>
      <span>{text}</span>
      <span style={{ fontSize: 16, lineHeight: 1 }}>{trend === "up" ? "↑" : "↓"}</span>
    </span>
  );
};

// Date ke side me time ka chhota chip (inline style: css purani ho tab bhi dikhe)
const timeChipStyle = {
  display: "inline-block",
  marginLeft: 6,
  padding: "1px 7px",
  borderRadius: 999,
  background: "#e0e7ff",
  color: "#3730a3",
  fontSize: 11,
  fontWeight: 600,
  verticalAlign: "middle",
};

const DateTimeCell = ({ value }) => {
  const date = formatLocalDate(value);
  if (date === "-") return "-";
  const time = toTimeKey(typeof value === "string" ? value : "");
  return (
    <>
      <span>{date}</span>
      {time ? <span style={timeChipStyle}>{time}</span> : null}
    </>
  );
};

// OTP khaali ho to poori row ka background red (text ka color normal rahega)
const rowMissingStyle = { background: "#fee2e2" };
const otpCellMissingStyle = {
  background: "#fecaca",
  fontWeight: 700,
};

const toastBaseStyle = {
  position: "fixed",
  top: "20px",
  right: "20px",
  zIndex: 999999,
  minWidth: "260px",
  maxWidth: "420px",
  padding: "12px 16px",
  borderRadius: "8px",
  color: "#ffffff",
  fontSize: "14px",
  fontWeight: 600,
  boxShadow: "0 6px 18px rgba(0,0,0,0.25)",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "12px",
};

const toastColors = {
  success: "#16a34a",
  error: "#dc2626",
  warning: "#d97706",
};

const toastIcons = {
  success: "✅",
  error: "❌",
  warning: "⚠️",
};

const confirmOverlayStyle = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.45)",
  zIndex: 999998,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

const confirmModalStyle = {
  background: "#ffffff",
  borderRadius: "10px",
  padding: "22px 24px",
  width: "90%",
  maxWidth: "380px",
  boxShadow: "0 10px 30px rgba(0,0,0,0.3)",
  textAlign: "center",
  fontFamily: "Arial, sans-serif",
};

const confirmBtnBase = {
  border: "none",
  borderRadius: "6px",
  padding: "8px 18px",
  fontSize: "14px",
  fontWeight: 600,
  cursor: "pointer",
  color: "#ffffff",
};

const emptyEditData = {
  internalQc: "",
  amdocsQc: "",
  otp: "",
  jobId: "",
  jcId: null,
  workId: null,
};

const JobHistory = () => {
  const [jobs, setJobs] = useState([]);
  const [workDataReport, setWorkDataReport] = useState([]);
  const [domains, setDomains] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [showWorkModal, setShowWorkModal] = useState(false);
  const [selectedJob, setSelectedJob] = useState(null);
  const [workData, setWorkData] = useState([]);
  const [workLoading, setWorkLoading] = useState(false);
  const [tlName, setTlName] = useState("-");

  // Screen par message + confirm box
  const [toast, setToast] = useState(null); // { type, text }
  const [confirmAction, setConfirmAction] = useState(null); // { type: "delete" | "save", job?, id? }
  const toastTimerRef = useRef(null);
  const workRequestRef = useRef(0);

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

  const [editData, setEditData] = useState(emptyEditData);

  const showToast = useCallback((type, text) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ type, text });
    toastTimerRef.current = setTimeout(() => setToast(null), 3500);
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  /* ---------------- API calls ---------------- */

  const fetchReportData = useCallback(async () => {
    try {
      const res = await axios.get(`${API_BASE_URL}/api/work/all`);
      const data = Array.isArray(res.data) ? res.data : res.data?.data || [];
      setWorkDataReport(data);
    } catch (error) {
      console.log("FETCH REPORT WORK ERROR:", error);
      showToast("error", "Work report data load nahi ho paya!");
    }
  }, [showToast]);

  const fetchMasterDomains = useCallback(async () => {
    try {
      const res = await axios.get(`${API_BASE_URL}/api/master`);
      const data = res.data || {};
      setDomains(Object.keys(data));
    } catch (error) {
      console.log("FETCH MASTER DOMAINS ERROR:", error);
      showToast("error", "Domains load nahi ho paye!");
    }
  }, [showToast]);

  const fetchJobs = useCallback(async () => {
    try {
      const res = await axios.get(`${API_BASE_URL}/api/job/all`);
      const data = Array.isArray(res.data) ? res.data : res.data?.data || [];
      setJobs(data);
    } catch (error) {
      console.log("FETCH JOBS ERROR:", error);
      showToast("error", "Jobs load nahi ho paye!");
    }
  }, [showToast]);

  useEffect(() => {
    fetchJobs();
    fetchReportData();
    fetchMasterDomains();
  }, [fetchJobs, fetchReportData, fetchMasterDomains]);

  useEffect(() => {
    setCurrentPage(1);
  }, [filters]);

  const fetchWorkByJob = async (jobId, requestId) => {
    try {
      const res = await axios.get(
        `${API_BASE_URL}/api/timesheet/job/${encodeURIComponent(jobId)}`
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
        adminStatus: item.adminStatus || "-",
      }));

      // Agar beech mein dusra job khul gaya ho to purana result ignore karo
      if (workRequestRef.current === requestId) {
        setWorkData(normalizedData);
      }
    } catch (error) {
      console.log("FETCH WORK ERROR:", error.message);
      if (workRequestRef.current === requestId) {
        setWorkData([]);
        showToast("error", "Work details load nahi ho paye!");
      }
    }
  };

  /* ---------------- Combined data ---------------- */

  const rawCombinedData = [
    ...jobs,
    ...workDataReport.filter((reportItem) => {
      const reportJobId = String(
        reportItem.jobId || reportItem.job_id || reportItem.id || ""
      ).trim();
      if (!reportJobId) return true;

      return !jobs.some((job) => {
        const jobId = String(job.jobId || job.job_id || job.id || "").trim();
        return jobId === reportJobId;
      });
    }),
  ];

  const uniqueMap = new Map();
  rawCombinedData.forEach((item, idx) => {
    const jId = String(item.jobId || item.job_id || "").trim();
    if (jId && jId !== "-") {
      if (!uniqueMap.has(`job-${jId}`)) {
        uniqueMap.set(`job-${jId}`, item);
      }
    } else {
      // id ke saath prefix, taaki job id aur work id ek jaisi hone par ek dusre ko overwrite na karein
      uniqueMap.set(`row-${item.id ?? `idx-${idx}`}`, item);
    }
  });
  const combinedData = Array.from(uniqueMap.values());

  const masterDomains = (domains || []).map(normalizeUpper);
  const jobDomains = combinedData.map((j) => normalizeUpper(j.domain));
  const mergedDomains = [...new Set([...masterDomains, ...jobDomains])].filter(Boolean);

  /* ---------------- Delete / Edit / Save ---------------- */

  // Delete: pehle screen par confirm box dikhega
  const requestDelete = (job) => {
    setConfirmAction({ type: "delete", job });
  };

  const performDelete = async (job) => {
    const rowId = job.id;
    const businessJobId = getJobId(job);

    try {
      const params = new URLSearchParams();
      if (businessJobId) params.set("jobId", businessJobId);
      // jcId/workId: job_creation aur work_updates ki apni-apni asli id.
      // Ye backend ko batati hain ki kis table ki kaunsi exact row delete karni
      // hai, taaki dono tables se hamesha sahi row delete ho (id collision na ho).
      if (job.jcId !== undefined && job.jcId !== null) params.set("jcId", job.jcId);
      if (job.workId !== undefined && job.workId !== null) params.set("workId", job.workId);

      const qs = params.toString();
      const url = `${API_BASE_URL}/api/job/delete/${rowId}${qs ? `?${qs}` : ""}`;

      await axios.delete(url);
      showToast("success", "Job Deleted Successfully!");
      if (editingId === rowId) {
        setEditingId(null);
        setEditData(emptyEditData);
      }
      fetchJobs();
      fetchReportData();
    } catch (error) {
      console.log(error);
      showToast("error", "Delete Failed!");
    }
  };

  const handleEdit = (job) => {
    setEditingId(job.id);

    setEditData({
      internalQc: getInternalQc(job),
      amdocsQc: getAmdocsQc(job),
      otp: getOtp(job),
      jobId: getJobId(job),
      jcId: job.jcId ?? null,
      workId: job.workId ?? null,
    });
  };

  // Save: pehle screen par confirm box dikhega
  const requestSave = (id) => {
    setConfirmAction({ type: "save", id });
  };

  const performSave = async (id) => {
    const job = combinedData.find((j) => j.id === id);

    try {
      const originalJobId = job ? getJobId(job) : editData.jobId;

      const payload = {
        internalQc: editData.internalQc,
        amdocsQc: editData.amdocsQc,
        otp: editData.otp,
        internalOtp: editData.otp,
        // jobId = purani/original Job ID jisse row dhoondhni hai,
        // newJobId = user ne jo naya Job ID type kiya (agar change kiya ho)
        jobId: originalJobId,
        newJobId: editData.jobId,
        jcId: editData.jcId,
        workId: editData.workId,
      };

      // Month "-" ho to bhejna nahi hai, warna DB mein "-" save ho jata tha
      const monthVal = job ? parseMonthField(job) : "-";
      if (monthVal && monthVal !== "-") {
        payload.month = monthVal;
      }

      await axios.put(`${API_BASE_URL}/api/job/update/${id}`, payload);

      showToast("success", "Record updated successfully!");
      setEditingId(null);
      setEditData(emptyEditData);
      await fetchJobs();
      await fetchReportData();
    } catch (error) {
      console.log(error);
      showToast("error", "Update failed!");
    }
  };

  const handleConfirmYes = async () => {
    const action = confirmAction;
    setConfirmAction(null);
    if (!action) return;

    if (action.type === "delete") {
      await performDelete(action.job);
    } else if (action.type === "save") {
      await performSave(action.id);
    }
  };

  const handleClose = () => {
    setEditingId(null);
    setEditData(emptyEditData);
  };

  const handleRefresh = async () => {
    await Promise.all([fetchJobs(), fetchReportData(), fetchMasterDomains()]);
    showToast("success", "Data refreshed successfully!");
  };

  /* ---------------- View Work modal ---------------- */

  const handleViewWork = async (job) => {
    const requestId = workRequestRef.current + 1;
    workRequestRef.current = requestId;

    setSelectedJob(job);
    setShowWorkModal(true);
    // Purane job ka data na dikhe
    setWorkData([]);
    setTlName("-");
    setWorkLoading(true);

    const targetJobId = getJobId(job);
    if (targetJobId) {
      await fetchWorkByJob(targetJobId, requestId);
    }

    try {
      const domainVal = job.domain || "";
      if (domainVal) {
        const res = await axios.get(`${API_BASE_URL}/api/auth/tl/bydomain`, {
          params: { domain: domainVal },
        });

        const tlData = res.data?.data || [];

        if (workRequestRef.current === requestId) {
          setTlName(
            tlData.length > 0 ? tlData.map((item) => item.name).join(", ") : "-"
          );
        }
      }
    } catch (error) {
      console.log("TL FETCH ERROR:", error);
      if (workRequestRef.current === requestId) {
        setTlName("-");
      }
    }

    if (workRequestRef.current === requestId) {
      setWorkLoading(false);
    }
  };

  /* ---------------- Filters ---------------- */

  const filteredJobs = combinedData.filter((job) => {
    const jobMonthYear = parseMonthField(job);
    const jobDate = toDateKey(job.receiveDate || job.receive_date);

    const matchMonthYear = !filters.monthYear || jobMonthYear === filters.monthYear;

    const matchDomain =
      !filters.domain || normalizeUpper(job.domain) === normalizeUpper(filters.domain);

    const matchMarket =
      !filters.market ||
      job.market === filters.market ||
      job.state === filters.market;

    const matchFromDate = !filters.fromDate || (jobDate && jobDate >= filters.fromDate);

    const matchToDate = !filters.toDate || (jobDate && jobDate <= filters.toDate);

    return matchMonthYear && matchDomain && matchMarket && matchFromDate && matchToDate;
  });

  const sortedFilteredJobs = [...filteredJobs].sort((a, b) => {
    const idA = Number(a.id) || 0;
    const idB = Number(b.id) || 0;
    return idA - idB;
  });

  /* ---------------- Pagination ---------------- */

  const totalPages = Math.ceil(sortedFilteredJobs.length / itemsPerPage) || 1;
  // currentPage khaali ("") ya limit se bahar ho to bhi table sahi dikhe
  const safePage = Math.min(Math.max(Number(currentPage) || 1, 1), totalPages);
  const startIndex = (safePage - 1) * itemsPerPage;
  const currentJobs = sortedFilteredJobs.slice(startIndex, startIndex + itemsPerPage);

  // Delete ke baad page limit se bahar chala jaye to wapas last page par
  useEffect(() => {
    if (currentPage !== "" && Number(currentPage) > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const handlePrevPage = () => {
    if (safePage > 1) {
      setCurrentPage(safePage - 1);
    }
  };

  const handleNextPage = () => {
    if (safePage < totalPages) {
      setCurrentPage(safePage + 1);
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

  const prevDisabled = safePage === 1;
  const nextDisabled = safePage === totalPages;

  /* ---------------- Confirm box text ---------------- */

  const confirmTitle = confirmAction?.type === "delete" ? "Delete Job?" : "Save Changes?";
  const confirmText =
    confirmAction?.type === "delete"
      ? "Are you sure you want to delete this job?"
      : "Are you sure you want to save changes?";
  const confirmYesLabel = confirmAction?.type === "delete" ? "Yes, Delete" : "Yes, Save";
  const confirmYesColor = confirmAction?.type === "delete" ? "#dc2626" : "#16a34a";

  const selectedInternalQc = getInternalQc(selectedJob);
  const selectedAmdocsQc = getAmdocsQc(selectedJob);
  const selectedOtp = getOtp(selectedJob);

  return (
    <div className="job-history-container">
      {/* ---------- Screen par success / error message ---------- */}
      {toast && (
        <div
          role="status"
          style={{
            ...toastBaseStyle,
            background: toastColors[toast.type] || toastColors.success,
          }}
        >
          <span>
            {toastIcons[toast.type]} {toast.text}
          </span>
          <button
            type="button"
            onClick={() => setToast(null)}
            title="Close"
            style={{
              background: "transparent",
              border: "none",
              color: "#ffffff",
              fontSize: "16px",
              cursor: "pointer",
              lineHeight: 1,
            }}
          >
            ✕
          </button>
        </div>
      )}

      {/* ---------- Delete / Save confirm (screen par) ---------- */}
      {confirmAction && (
        <div style={confirmOverlayStyle} onClick={() => setConfirmAction(null)}>
          <div style={confirmModalStyle} onClick={(e) => e.stopPropagation()}>
            <div
              style={{
                fontSize: "16px",
                fontWeight: 700,
                marginBottom: "8px",
                color: "#111827",
              }}
            >
              {confirmTitle}
            </div>
            <div style={{ fontSize: "14px", color: "#4b5563", marginBottom: "18px" }}>
              {confirmText}
            </div>
            <div style={{ display: "flex", justifyContent: "center", gap: "12px" }}>
              <button
                type="button"
                style={{ ...confirmBtnBase, background: confirmYesColor }}
                onClick={handleConfirmYes}
              >
                {confirmYesLabel}
              </button>
              <button
                type="button"
                style={{ ...confirmBtnBase, background: "#6b7280" }}
                onClick={() => setConfirmAction(null)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <h2 className="page-title">Job History</h2>
      <div className="job-filter-container">
        <div className="job-filter-group">
          <label className="job-filter-label">Month-Year</label>
          <select
            className="job-filter-input"
            value={filters.monthYear}
            onChange={(e) => setFilters({ ...filters, monthYear: e.target.value })}
          >
            <option value="">All Month-Year</option>
            {[...new Set(combinedData.map((job) => parseMonthField(job)))]
              .filter((item) => item && item !== "-")
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
            onChange={(e) => setFilters({ ...filters, domain: e.target.value })}
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
            onChange={(e) => setFilters({ ...filters, market: e.target.value })}
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
            onChange={(e) => setFilters({ ...filters, fromDate: e.target.value })}
          />
        </div>

        <div className="job-filter-group">
          <label className="job-filter-label">To Date</label>
          <input
            className="job-filter-input"
            type="date"
            value={filters.toDate}
            onChange={(e) => setFilters({ ...filters, toDate: e.target.value })}
          />
        </div>

        <div className="job-filter-actions">
          <button type="button" className="job-apply-btn" onClick={handleRefresh}>
            Apply
          </button>
          <button
            type="button"
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
              <th colSpan="3">QC Status</th>
              <th rowSpan="2">OTP Status</th>
              <th rowSpan="2">Action</th>
              <th rowSpan="2">Last Updated Date</th>
            </tr>
            <tr>
              <th>Internal QC</th>
              <th>Amdocs QC</th>
              <th>Deviation</th>
            </tr>
          </thead>

          <tbody>
            {currentJobs.length > 0 ? (
              currentJobs.map((job, index) => {
                const monthVal = parseMonthField(job);

                const otpVal = getOtp(job);
                const internalVal = getInternalQc(job);
                const amdocsVal = getAmdocsQc(job);

                // OTP khaali ("", "-" ya sirf space) ho to poori row red
                const otpText = String(otpVal || "").trim();
                const otpMissing = otpText === "" || otpText === "-";
                const cellStyle = otpMissing ? rowMissingStyle : undefined;

                const isEditingRow = editingId === job.id;

                // Deviation = Amdocs QC - Internal QC (edit karte waqt live badalta hai)
                const dev = isEditingRow
                  ? getDeviation(editData.internalQc, editData.amdocsQc)
                  : getDeviation(internalVal, amdocsVal);

                return (
                  <tr
                    key={`${job.id ?? "row"}-${startIndex + index}`}
                    className={otpMissing ? "row-missing-otp" : ""}
                    style={otpMissing ? rowMissingStyle : undefined}
                  >
                    <td style={cellStyle}>{startIndex + index + 1}</td>
                    <td style={cellStyle}>{monthVal}</td>
                    <td style={cellStyle}>
                      {job.domain ? String(job.domain).toUpperCase() : "-"}
                    </td>
                    <td style={cellStyle}>{job.market || job.state || "-"}</td>
                    <td style={cellStyle}>{getJobId(job) || "-"}</td>

                    {/* Received Date: date ke side me time */}
                    <td style={cellStyle}>
                      <DateTimeCell value={job.receiveDate || job.receive_date} />
                    </td>

                    <td style={cellStyle}>
                      <DateTimeCell value={job.ecdDate || job.ecd_date} />
                    </td>

                    {/* Submission Date: date ke side me time */}
                    <td style={cellStyle}>
                      <DateTimeCell
                        value={job.submissionDate || job.submission_date || job.submissiondate}
                      />
                    </td>

                    <td style={cellStyle}>
                      <button
                        type="button"
                        className="view-work-btn"
                        onClick={() => handleViewWork(job)}
                      >
                        View
                      </button>
                    </td>

                    <td style={cellStyle}>
                      {isEditingRow ? (
                        <input
                          type="text"
                          style={{ width: "70px", padding: "4px" }}
                          value={editData.internalQc}
                          onChange={(e) =>
                            setEditData({ ...editData, internalQc: e.target.value })
                          }
                        />
                      ) : (
                        internalVal || "-"
                      )}
                    </td>

                    <td style={cellStyle}>
                      {isEditingRow ? (
                        <input
                          type="text"
                          style={{ width: "70px", padding: "4px" }}
                          value={editData.amdocsQc}
                          onChange={(e) =>
                            setEditData({ ...editData, amdocsQc: e.target.value })
                          }
                        />
                      ) : (
                        amdocsVal || "-"
                      )}
                    </td>

                    {/* Deviation = Amdocs QC - Internal QC (value ke side me ↑ green / ↓ red) */}
                    <td style={cellStyle}>
                      <DeviationCell text={dev.text} trend={dev.trend} />
                    </td>

                    <td style={otpMissing ? otpCellMissingStyle : undefined}>
                      {isEditingRow ? (
                        <input
                          type="text"
                          style={{ width: "70px", padding: "4px" }}
                          value={editData.otp}
                          onChange={(e) =>
                            setEditData({ ...editData, otp: e.target.value })
                          }
                        />
                      ) : (
                        otpVal || "-"
                      )}
                    </td>

                    <td style={cellStyle}>
                      {isEditingRow ? (
                        <div style={{ display: "flex", gap: "8px" }}>
                          <button type="button" onClick={() => requestSave(job.id)}>
                            Save
                          </button>
                          <button type="button" onClick={handleClose}>
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
                            onClick={() => requestDelete(job)}
                          />
                        </div>
                      )}
                    </td>

                    <td style={cellStyle}>{formatDateTime(job.updated_at || job.updatedAt)}</td>
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

      <div
        className="pagination-container"
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          gap: "8px",
          marginTop: "16px",
        }}
      >
        <button
          type="button"
          className="pagination-btn"
          onClick={handlePrevPage}
          disabled={prevDisabled}
          style={{
            padding: "6px 12px",
            cursor: prevDisabled ? "not-allowed" : "pointer",
            opacity: prevDisabled ? 0.5 : 1,
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
              borderRadius: "4px",
            }}
          />
          / {totalPages}
        </span>

        <button
          type="button"
          className="pagination-btn"
          onClick={handleNextPage}
          disabled={nextDisabled}
          style={{
            padding: "6px 12px",
            cursor: nextDisabled ? "not-allowed" : "pointer",
            opacity: nextDisabled ? 0.5 : 1,
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
                type="button"
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
                  <span>{getJobId(selectedJob) || "-"}</span>
                </div>
                <div className="jobwork-info-row">
                  <span className="jobwork-label">Domain :</span>
                  <span>
                    {selectedJob.domain ? String(selectedJob.domain).toUpperCase() : "-"}
                  </span>
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
                      style={{ color: qcColor(selectedInternalQc) }}
                    >
                      {selectedInternalQc ? `${selectedInternalQc}` : "-"}
                    </div>
                  </div>

                  <div className="jobwork-qc-box">
                    <div className="jobwork-qc-heading">Amdocs QC</div>
                    <div
                      className="jobwork-qc-value"
                      style={{ color: qcColor(selectedAmdocsQc) }}
                    >
                      {selectedAmdocsQc ? `${selectedAmdocsQc}` : "-"}
                    </div>
                  </div>
                </div>

                <div className="jobwork-otp-container">
                  <div className="jobwork-qc-heading">OTP</div>
                  <div className="jobwork-otp-value">{selectedOtp || "-"}</div>
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
                  {workLoading && workData.length === 0 ? (
                    <tr>
                      <td colSpan="4">Loading...</td>
                    </tr>
                  ) : workData.length === 0 ? (
                    <tr>
                      <td colSpan="4">No Work Flow Found</td>
                    </tr>
                  ) : (
                    workData.map((item, index) => (
                      <tr key={item.id ?? index}>
                        <td>
                          {item.teamMember || item.employeeName || item.assignedTo || "-"}
                        </td>
                        <td>{item.workDone || item.task || item.typeOfWork || "-"}</td>
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
