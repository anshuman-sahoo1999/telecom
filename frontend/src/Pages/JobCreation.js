import { API_BASE_URL } from "../config";
import React, { useCallback, useEffect, useRef, useState } from "react";
import axios from "axios";
import "../style/jobcreation.css";

const normalize = (d) => (d || "").toString().trim().toUpperCase();

const emptyForm = {
  domain: "",
  market: "",
  jobId: "",
  receiveDate: "",
  ecdDate: "",
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

const JobCreation = () => {
  const [domains, setDomains] = useState([]);
  const [formData, setFormData] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState(null); // { type, text }
  const toastTimerRef = useRef(null);

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

  const fetchDomains = useCallback(async () => {
    // Teeno API alag-alag chalengi, ek fail hone par baaki ka data phir bhi aayega
    const [masterRes, workRes, jobRes] = await Promise.allSettled([
      axios.get(`${API_BASE_URL}/api/master`),
      axios.get(`${API_BASE_URL}/api/work/bydomain`),
      axios.get(`${API_BASE_URL}/api/job/all`),
    ]);

    const masterDomains =
      masterRes.status === "fulfilled"
        ? Object.keys(masterRes.value.data || {}).map(normalize)
        : [];

    const workDomains =
      workRes.status === "fulfilled" && Array.isArray(workRes.value.data)
        ? workRes.value.data.map((d) => normalize(d.domain))
        : [];

    const jobDomains =
      jobRes.status === "fulfilled" && Array.isArray(jobRes.value.data)
        ? jobRes.value.data.map((j) => normalize(j.domain))
        : [];

    const merged = [...new Set([...masterDomains, ...workDomains, ...jobDomains])]
      .filter(Boolean)
      .sort();

    setDomains(merged.map((d) => ({ domain: d })));

    if (
      masterRes.status === "rejected" &&
      workRes.status === "rejected" &&
      jobRes.status === "rejected"
    ) {
      console.error("Domain fetch failed:", masterRes.reason);
      showToast("error", "Domains load nahi ho paye!");
    }
  }, [showToast]);

  useEffect(() => {
    fetchDomains();
  }, [fetchDomains]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting) return;

    const payload = {
      ...formData,
      market: formData.market.trim(),
      jobId: formData.jobId.trim(),
    };

    if (!payload.domain || !payload.market || !payload.jobId) {
      showToast("warning", "Please fill Domain, Market and Job ID!");
      return;
    }

    if (!payload.receiveDate || !payload.ecdDate) {
      showToast("warning", "Please select Receive Date and ECD Date!");
      return;
    }

    // Dono date "YYYY-MM-DD" format mein hain, isliye string compare sahi chalega
    if (payload.ecdDate < payload.receiveDate) {
      showToast("warning", "ECD Date, Receive Date se pehle nahi ho sakti!");
      return;
    }

    setSubmitting(true);
    try {
      const res = await axios.post(`${API_BASE_URL}/api/job/create`, payload);

      // success: true ho ya backend sirf 200/201 bheje, dono case handle
      const ok = res.data?.success !== false;

      if (ok) {
        showToast("success", "Job Created Successfully!");
        setFormData(emptyForm);
        fetchDomains();
      } else {
        showToast("error", res.data?.message || "Failed to Create Job!");
      }
    } catch (error) {
      console.error("Job create error:", error);
      showToast(
        "error",
        error?.response?.data?.message || "Failed to Create Job!"
      );
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
        <h2>Job Creation</h2>
      </div>

      <div className="job-card">
        <form onSubmit={handleSubmit} className="job-form">
          <div className="form-group">
            <label>Domain</label>
            <select
              name="domain"
              value={formData.domain}
              onChange={handleChange}
              required
            >
              <option value="">Select Domain</option>

              {domains.map((item) => (
                <option key={item.domain} value={item.domain}>
                  {item.domain}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label>Market</label>
            <input
              type="text"
              name="market"
              placeholder="Enter Market"
              value={formData.market}
              onChange={handleChange}
              required
            />
          </div>

          <div className="form-group">
            <label>Job ID</label>
            <input
              type="text"
              name="jobId"
              placeholder="Enter Job ID"
              value={formData.jobId}
              onChange={handleChange}
              required
            />
          </div>

          <div className="form-group">
            <label>Receive Date</label>
            <input
              type="date"
              name="receiveDate"
              value={formData.receiveDate}
              onChange={handleChange}
              required
            />
          </div>

          <div className="form-group">
            <label>ECD Date</label>
            <input
              type="date"
              name="ecdDate"
              value={formData.ecdDate}
              min={formData.receiveDate || undefined}
              onChange={handleChange}
              required
            />
          </div>

          <div className="button-wrapper">
            <button type="submit" disabled={submitting}>
              {submitting ? "Creating..." : "Create Job"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default JobCreation;
