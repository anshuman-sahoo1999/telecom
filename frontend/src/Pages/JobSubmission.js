import { API_BASE_URL } from "../config";
import React, { useCallback, useEffect, useRef, useState } from "react";
import axios from "axios";
import "../style/JobSubmission.css";

const pad2 = (n) => String(n).padStart(2, "0");

// Date ko "YYYY-MM-DD" key mein badalta hai.
// - Already "YYYY-MM-DD" ho to seedha wahi (timezone ka jhanjhat nahi)
// - Warna local timezone se nikalta hai
// - Invalid ya string na ho to "" (pehle substring() par crash ho sakta tha)
const formatLocalDate = (value) => {
  if (!value) return "";
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value.trim())) {
    return value.trim();
  }
  const d = new Date(value);
  if (isNaN(d.getTime())) {
    return typeof value === "string" ? value.substring(0, 10) : "";
  }
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
};

const normalizeUpper = (d) => (d || "").toString().trim().toUpperCase();

const availableMonths = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

const emptyForm = {
  month: "",
  fromDate: "",
  toDate: "",
  domain: "",
  jobId: "",
  submissionDate: "",
};

/* ---------- On-screen message (toast) styles ---------- */
const toastBaseStyle = {
  position: "fixed",
  top: "20px",
  right: "20px",
  zIndex: 99999,
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

const JobSubmission = () => {
  const [domainListItems, setDomainListItems] = useState([]);
  const [extractedJobIds, setExtractedJobIds] = useState([]);
  const [totalJobsReceived, setTotalJobsReceived] = useState(0);
  const [submissionFormData, setSubmissionFormData] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0); // submit ke baad list dobara laane ke liye

  const [toast, setToast] = useState(null); // { type, text }
  const toastTimerRef = useRef(null);

  const activeYear = new Date().getFullYear();

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

  /* ---------------- Domains ---------------- */

  const loadDistinctDomains = useCallback(async () => {
    // Dono API alag-alag chalengi, ek fail hone par doosri ka data phir bhi aayega
    const [masterResult, workResult] = await Promise.allSettled([
      axios.get(`${API_BASE_URL}/api/master`),
      axios.get(`${API_BASE_URL}/api/work/bydomain`),
    ]);

    const primaryDomains =
      masterResult.status === "fulfilled"
        ? Object.keys(masterResult.value.data || {}).map(normalizeUpper)
        : [];

    const secondaryDomains =
      workResult.status === "fulfilled" && Array.isArray(workResult.value.data)
        ? workResult.value.data.map((d) => normalizeUpper(d.domain))
        : [];

    // Uppercase + duplicate hatao, taaki case mismatch na ho
    const distinct = [...new Set([...primaryDomains, ...secondaryDomains])]
      .filter(Boolean)
      .sort();

    setDomainListItems(distinct.map((d) => ({ domain: d })));

    if (masterResult.status === "rejected" && workResult.status === "rejected") {
      console.log("Error loading domains:", masterResult.reason);
      showToast("error", "Domains load nahi ho paye!");
    }
  }, [showToast]);

  useEffect(() => {
    loadDistinctDomains();
  }, [loadDistinctDomains]);

  /* ---------------- Job IDs + total count ---------------- */

  useEffect(() => {
    let cancelled = false; // purana response naye response ko overwrite na kare

    const fetchFilteredMetricsAndIds = async () => {
      try {
        const response = await axios.get(`${API_BASE_URL}/api/job/all`);
        if (cancelled) return;

        const raw = response.data;
        let allJobs = Array.isArray(raw) ? raw : raw?.data || [];

        // Case-insensitive domain filter
        if (submissionFormData.domain) {
          const selectedDomain = normalizeUpper(submissionFormData.domain);
          allJobs = allJobs.filter(
            (item) => item.domain && normalizeUpper(item.domain) === selectedDomain
          );
        }

        if (submissionFormData.fromDate) {
          allJobs = allJobs.filter((item) => {
            const itemDate = formatLocalDate(item.receiveDate || item.receive_date);
            return itemDate && itemDate >= submissionFormData.fromDate;
          });
        }

        if (submissionFormData.toDate) {
          allJobs = allJobs.filter((item) => {
            const itemDate = formatLocalDate(item.receiveDate || item.receive_date);
            return itemDate && itemDate <= submissionFormData.toDate;
          });
        }

        const unsubmittedJobs = allJobs.filter(
          (item) => !(item.submissionDate || item.submission_date)
        );
        const uniqueIds = [
          ...new Set(unsubmittedJobs.map((item) => item.jobId || item.job_id)),
        ].filter(Boolean);
        setExtractedJobIds(uniqueIds);

        // Agar chuni hui Job ID ab list mein nahi hai (filter badla / submit ho gayi), to hata do
        setSubmissionFormData((prev) =>
          prev.jobId && !uniqueIds.includes(prev.jobId) ? { ...prev, jobId: "" } : prev
        );

        const sumTotal = allJobs.reduce((acc, curr) => {
          const n = Number(curr.jobsDelivered || 1);
          return acc + (isNaN(n) ? 1 : n);
        }, 0);
        setTotalJobsReceived(sumTotal);
      } catch (err) {
        if (cancelled) return;
        console.log("Error fetching job metrics:", err);
        showToast("error", "Jobs data load nahi ho paya!");
      }
    };

    fetchFilteredMetricsAndIds();

    return () => {
      cancelled = true;
    };
  }, [
    submissionFormData.domain,
    submissionFormData.fromDate,
    submissionFormData.toDate,
    refreshKey,
    showToast,
  ]);

  /* ---------------- Form handlers ---------------- */

  const handleFieldChange = (e) => {
    const { name, value } = e.target;
    setSubmissionFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleFormSubmission = async (e) => {
    e.preventDefault();
    if (submitting) return;

    if (
      !submissionFormData.month ||
      !submissionFormData.domain ||
      !submissionFormData.jobId ||
      !submissionFormData.submissionDate
    ) {
      showToast("warning", "Please fill Month, Domain, Job ID and Submission Date!");
      return;
    }

    if (
      submissionFormData.fromDate &&
      submissionFormData.toDate &&
      submissionFormData.fromDate > submissionFormData.toDate
    ) {
      showToast("warning", "From Date, To Date se badi nahi ho sakti!");
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        domain: submissionFormData.domain,
        month: submissionFormData.month,
        jobId: submissionFormData.jobId,
        submissionDate: submissionFormData.submissionDate,
      };

      const response = await axios.post(`${API_BASE_URL}/api/job/submit`, payload);

      // Backend success: true bheje ya sirf 200/201, dono case handle
      const ok = response.data?.success !== false;

      if (ok) {
        showToast("success", response.data?.message || "Job Submitted Successfully!");
        setSubmissionFormData(emptyForm);
        // Submit hui job dropdown se hat jaye aur count refresh ho
        setRefreshKey((k) => k + 1);
      } else {
        showToast("error", response.data?.message || "Failed to Submit Job!");
      }
    } catch (err) {
      console.log("Submission error:", err);
      showToast("error", err.response?.data?.message || "Failed to Submit Job!");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="job-page">
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

      <div className="job-header">
        <h2>Job Submission</h2>
      </div>

      <div className="js-grid-layout-box">
        <div className="job-card" style={{ margin: 0, width: "100%" }}>
          <form onSubmit={handleFormSubmission} className="job-form">
            <div className="form-group">
              <label>Choose Month</label>
              <select
                name="month"
                value={submissionFormData.month}
                onChange={handleFieldChange}
                required
              >
                <option value="">Select Month</option>
                {availableMonths.map((m) => {
                  const formattedMonthYear = `${m},${activeYear}`;
                  return (
                    <option key={formattedMonthYear} value={formattedMonthYear}>
                      {formattedMonthYear}
                    </option>
                  );
                })}
              </select>
            </div>

            <div
              className="form-group"
              style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "15px" }}
            >
              <div>
                <label>From Date</label>
                <input
                  type="date"
                  name="fromDate"
                  value={submissionFormData.fromDate}
                  max={submissionFormData.toDate || undefined}
                  onChange={handleFieldChange}
                  required
                />
              </div>
              <div>
                <label>To Date</label>
                <input
                  type="date"
                  name="toDate"
                  value={submissionFormData.toDate}
                  min={submissionFormData.fromDate || undefined}
                  onChange={handleFieldChange}
                  required
                />
              </div>
            </div>

            <div className="form-group">
              <label>Choose Domain</label>
              <select
                name="domain"
                value={submissionFormData.domain}
                onChange={handleFieldChange}
                required
              >
                <option value="">Select Domain</option>
                {domainListItems.map((item) => (
                  <option key={item.domain} value={item.domain}>
                    {item.domain}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label>Choose Job ID</label>
              <select
                name="jobId"
                value={submissionFormData.jobId}
                onChange={handleFieldChange}
                required
              >
                <option value="">
                  {extractedJobIds.length === 0 ? "No pending Job ID found" : "Select Job ID"}
                </option>
                {extractedJobIds.map((id) => (
                  <option key={id} value={id}>
                    {id}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label>Submission Date</label>
              <input
                type="date"
                name="submissionDate"
                value={submissionFormData.submissionDate}
                onChange={handleFieldChange}
                required
              />
            </div>

            <div className="button-wrapper">
              <button type="submit" disabled={submitting}>
                {submitting ? "Submitting..." : "Submit Job"}
              </button>
            </div>
          </form>
        </div>

        <div className="js-summary-card-box">
          <div className="js-summary-title-text">No. of Jobs Received</div>
          <div className="js-summary-metric-value">{totalJobsReceived}</div>
        </div>
      </div>
    </div>
  );
};

export default JobSubmission;
