import React, { useEffect, useState } from "react";
import axios from "axios";
import "../style/JobSubmission.css";

const JobSubmission = () => {
  const [domainListItems, setDomainListItems] = useState([]);
  const [extractedJobIds, setExtractedJobIds] = useState([]);
  const [totalJobsReceived, setTotalJobsReceived] = useState(0);

  const [submissionFormData, setSubmissionFormData] = useState({
    month: "",
    fromDate: "",
    toDate: "",
    domain: "",
    jobId: "",
    submissionDate: "",
  });

  const availableMonths = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
  ];
  const activeYear = new Date().getFullYear();

  const formatLocalDate = (dateStr) => {
    if (!dateStr) return "";
    const d = new Date(dateStr);
    if (isNaN(d)) return dateStr.substring(0, 10);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  useEffect(() => {
    loadDistinctDomains();
  }, []);

const loadDistinctDomains = async () => {
    try {
      const masterResponse = await axios.get("http://localhost:5000/api/master");
      const workResponse = await axios.get("http://localhost:5000/api/work/bydomain");

      // Sabhi domains ko uppercase me convert karke map kar rahe hain taaki case mismatch na ho
      const primaryDomains = Object.keys(masterResponse.data || {}).map((d) => ({
        domain: d ? d.trim().toUpperCase() : ""
      }));

      const secondaryDomains = (workResponse.data || []).map((d) => ({
        domain: d.domain ? d.domain.trim().toUpperCase() : ""
      }));

      const combinedDomains = [...primaryDomains, ...secondaryDomains];
      const distinctDomains = combinedDomains.filter(
        (item, index, arr) =>
          item.domain && arr.findIndex(x => x.domain === item.domain) === index
      );

      setDomainListItems(distinctDomains);
    } catch (err) {
      console.log("Error loading domains:", err);
    }
  };
  
  useEffect(() => {
    const fetchFilteredMetricsAndIds = async () => {
      try {
        const response = await axios.get("http://localhost:5000/api/job/all");
        let allJobs = response.data || [];

        // Case-insensitive domain filter
        if (submissionFormData.domain) {
          const selectedDomain = submissionFormData.domain.toString().trim().toUpperCase();
          allJobs = allJobs.filter(item => 
            item.domain && item.domain.toString().trim().toUpperCase() === selectedDomain
          );
        }

        if (submissionFormData.fromDate) {
          allJobs = allJobs.filter(item => {
            const itemDate = formatLocalDate(item.receiveDate);
            return itemDate >= submissionFormData.fromDate;
          });
        }

        if (submissionFormData.toDate) {
          allJobs = allJobs.filter(item => {
            const itemDate = formatLocalDate(item.receiveDate);
            return itemDate <= submissionFormData.toDate;
          });
        }

        const unsubmittedJobs = allJobs.filter(item => !item.submissionDate);
        const uniqueIds = [...new Set(unsubmittedJobs.map(item => item.jobId))].filter(Boolean);
        setExtractedJobIds(uniqueIds);

        const sumTotal = allJobs.reduce((acc, curr) => acc + Number(curr.jobsDelivered || 1), 0);
        setTotalJobsReceived(sumTotal);
      } catch (err) {
        console.log("Error fetching job metrics:", err);
      }
    };

    fetchFilteredMetricsAndIds();
  }, [submissionFormData.domain, submissionFormData.fromDate, submissionFormData.toDate]);

  const handleFieldChange = (e) => {
    setSubmissionFormData((prev) => ({
      ...prev,
      [e.target.name]: e.target.value,
    }));
  };

  const handleFormSubmission = async (e) => {
    e.preventDefault();

    try {
      const payload = {
        domain: submissionFormData.domain,
        month: submissionFormData.month,
        jobId: submissionFormData.jobId,
        submissionDate: submissionFormData.submissionDate,
      };

      const response = await axios.post(
        "http://localhost:5000/api/job/submit",
        payload
      );

      if (response.data.success) {
        alert(response.data.message || "Job Submitted Successfully");

        setSubmissionFormData({
          month: "",
          fromDate: "",
          toDate: "",
          domain: "",
          jobId: "",
          submissionDate: "",
        });
      }
    } catch (err) {
      console.log("Submission error:", err);
      alert(err.response?.data?.message || "Failed to Submit Job");
    }
  };

  return (
    <div className="job-page">
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

            <div className="form-group" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "15px" }}>
              <div>
                <label>From Date</label>
                <input
                  type="date"
                  name="fromDate"
                  value={submissionFormData.fromDate}
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
                {domainListItems.map((item, index) => (
                  <option key={index} value={item.domain}>
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
                <option value="">Select Job ID</option>
                {extractedJobIds.map((id, index) => (
                  <option key={index} value={id}>
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
              <button type="submit">
                Submit Job
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