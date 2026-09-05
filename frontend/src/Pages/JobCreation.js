import React, { useEffect, useState } from "react";
import axios from "axios";
import "../style/jobcreation.css";

const JobCreation = () => {
  const [domains, setDomains] = useState([]);

  const [formData, setFormData] = useState({
    domain: "",
    market: "",
    jobId: "",
    receiveDate: "",
    ecdDate: "",
  });

  useEffect(() => {
    fetchDomains();
  }, []);

  const fetchDomains = async () => {
    try {
      const masterRes = await axios.get("http://localhost:5000/api/master");
      const workRes = await axios.get("http://localhost:5000/api/work/bydomain");
      const jobRes = await axios.get("http://localhost:5000/api/job/all");

      const normalize = (d) => (d || "").toString().trim().toUpperCase();

      // Master domains
      const masterDomains = Object.keys(masterRes.data || {}).map((d) => normalize(d));

      // Work domains
      const workDomains = (workRes.data || []).map((d) => normalize(d.domain));

      // Job Creation domains
      const jobDomains = (jobRes.data || []).map((j) => normalize(j.domain));

      // Merge all and remove duplicates
      const merged = [...new Set([...masterDomains, ...workDomains, ...jobDomains])].filter(Boolean);

      const uniqueFormatted = merged.map((d) => ({ domain: d }));
      setDomains(uniqueFormatted);

    } catch (error) {
      console.log(error);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;

    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      const res = await axios.post(
        "http://localhost:5000/api/job/create",
        formData
      );

      if (res.data.success) {
        alert("Job Created Successfully");

        setFormData({
          domain: "",
          market: "",
          jobId: "",
          receiveDate: "",
          ecdDate: "",
        });

        fetchDomains();
      }
    } catch (error) {
      console.log(error);
      alert("Failed to Create Job");
    }
  };

  return (
    <div className="job-page">
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

              {domains.map((item, index) => (
                <option key={index} value={item.domain}>
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
              onChange={handleChange}
              required
            />
          </div>

          <div className="button-wrapper">
            <button type="submit">
              Create Job
            </button>
          </div>

        </form>
      </div>
    </div>
  );
};

export default JobCreation;
