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
    submissionDate: "",
  });

  useEffect(() => {
    fetchDomains();
  }, []);

  const fetchDomains = async () => {
    try {
      const masterRes = await axios.get("http://localhost:5000/api/master");
      const workRes = await axios.get("http://localhost:5000/api/work/bydomain");

      const masterDomains = Object.keys(masterRes.data || {}).map((d) => ({
        domain: d
      }));

      const workDomains = (workRes.data || []).map((d) => ({
        domain: d.domain
      }));

      const merged = [...masterDomains, ...workDomains];

      const unique = merged.filter(
        (item, index, arr) =>
          arr.findIndex(x => x.domain === item.domain) === index
      );

      setDomains(unique);

    } catch (error) {
      console.log(error);
    }
  };

  const handleChange = (e) => {
    setFormData((prev) => ({
      ...prev,
      [e.target.name]: e.target.value,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      // ✅ Agar submissionDate khali hai, toh usko payload se hata do ya null bhejo
      const payload = {
        domain: formData.domain,
        market: formData.market,
        jobId: formData.jobId,
        receiveDate: formData.receiveDate,
        ecdDate: formData.ecdDate,
      };

      if (formData.submissionDate && formData.submissionDate.trim() !== "") {
        payload.submissionDate = formData.submissionDate;
      } else {
        payload.submissionDate = null; // ya phir agar table NOT NULL hai toh default current date bhej sakte hain ya skip kar sakte hain
      }

      const res = await axios.post(
        "https://telecom-lovat.vercel.app/api/job/create",
        payload
      );

      if (res.data.success) {
        alert("Job Created Successfully");

        setFormData({
          domain: "",
          market: "",
          jobId: "",
          receiveDate: "",
          ecdDate: "",
          submissionDate: "",
        });
      }
    } catch (error) {
      console.log(error);
      alert("Failed to Create Job: " + (error.response?.data?.message || error.message));
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

          <div className="date-row">
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

            <div className="form-group">
              <label>Submission Date (Optional)</label>
              <input
                type="date"
                name="submissionDate"
                value={formData.submissionDate}
                onChange={handleChange}
              />
            </div>
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
