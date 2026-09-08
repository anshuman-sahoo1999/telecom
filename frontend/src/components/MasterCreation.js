import React, { useState, useEffect, } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import "../style/master.css";

const API_BASE =
  process.env.REACT_APP_API_BASE ||
  "http://localhost:5000/api/master";

const MasterCreation = () => {
  const [domainsList, setDomainsList] = useState([]);
  const [selectedDomain, setSelectedDomain] = useState("");
  const [data, setData] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const navigate = useNavigate();


  const [newDomain, setNewDomain] = useState("");
  const [showCreateForm, setShowCreateForm] = useState(false);

  const [sow, setSow] = useState([""]);
  const [jobType, setJobType] = useState([""]);
  const [uom, setUom] = useState([""]);

  const [deleteMode, setDeleteMode] = useState(false);

  const [hiddenItems, setHiddenItems] = useState({
    sow: {},
    jobType: {},
    uom: {},
  });

  /* ================= FETCH ================= */
  const fetchData = async () => {
    try {
      setLoading(true);
      const res = await axios.get(`${API_BASE}`);
      const responseData = res.data || {};

      setData(responseData);

      // ✅ FIX: only show domains that have actual saved data
      const filteredDomains = Object.keys(responseData).filter((d) => {
        const domain = responseData[d];
        return (
          (domain.sow && domain.sow.length > 0) ||
          (domain.jobType && domain.jobType.length > 0) ||
          (domain.uom && domain.uom.length > 0)
        );
      });

      setDomainsList(filteredDomains);
    } catch (err) {
      setError("Failed to fetch data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  /* ================= LOAD DOMAIN ================= */
  const loadDomainData = (domain) => {
    const current = data[domain] || {};

    setSow(current.sow?.length ? current.sow : [""]);
    setJobType(current.jobType?.length ? current.jobType : [""]);
    setUom(current.uom?.length ? current.uom : [""]);
  };

const handleDomainChange = (domain) => {

  // SAME DOMAIN CLICK = CLOSE
  if (selectedDomain === domain) {
    setSelectedDomain("");

    setSow([""]);
    setJobType([""]);
    setUom([""]);

    return;
  }

  // OPEN
  setSelectedDomain(domain);
  loadDomainData(domain);
};

  /* ================= CREATE DOMAIN API ================= */
  const createDomain = async () => {
    try {
      if (!newDomain.trim()) {
        alert("Domain required");
        return;
      }

      await axios.post(`${API_BASE}/create-domain`, {
        domain: newDomain.trim(),
      });

      alert("Domain created successfully");

      await fetchData();

      setSelectedDomain(newDomain.trim());
      setNewDomain("");
    } catch (err) {
      console.log(err);
      alert("Create failed (maybe already exists)");
    }
  };
  const deleteDomain = async () => {
    try {
      const domainToDelete = newDomain.trim() || selectedDomain;

      if (!domainToDelete) {
        alert("Enter or select domain");
        return;
      }

      const confirmDelete = window.confirm(
        `Are you sure you want to delete domain: ${domainToDelete}?`
      );

      if (!confirmDelete) return;

      // ✅ FIXED API CALL (PARAM BASED)
      await axios.delete(
        `${API_BASE}/delete-domain/${domainToDelete}`
      );

      alert("Domain deleted successfully");

      await fetchData();

      setSelectedDomain("");
      setNewDomain("");
      setSow([""]);
      setJobType([""]);
      setUom([""]);
    } catch (err) {
      console.log(err);
      alert("Delete failed");
    }
  };

  /* ================= ARRAY HELPERS ================= */
  const updateArray = (setter, arr, i, val) => {
    const copy = [...arr];
    copy[i] = val;
    setter(copy);
  };

  const addField = (setter, arr) => setter([...arr, ""]);

  const removeField = (setter, arr, i) =>
    setter(arr.filter((_, idx) => idx !== i));

  /* ================= SAVE ALL ================= */
  const saveAll = async () => {
    try {
      const clean = (arr) =>
        [...new Set(arr.map((v) => v.trim()).filter(Boolean))];

      const domainToSave = selectedDomain || newDomain;

      if (!domainToSave) {
        alert("Domain required");
        return;
      }

      const payload = {
        domain: domainToSave,
        sow: clean(sow),
        jobType: clean(jobType),
        uom: clean(uom),
      };

      await axios.post(`${API_BASE}/update`, payload);

      alert("Saved successfully");

      await fetchData();

      setSelectedDomain("");
      setNewDomain("");
      setSow([""]);
      setJobType([""]);
      setUom([""]);
    } catch (err) {
      console.log(err);
      alert("Save failed");
    }
  };

  /* ================= DELETE ================= */
  const hideAndDelete = async (type, domain, value) => {
    setHiddenItems((prev) => ({
      ...prev,
      [type]: {
        ...prev[type],
        [`${domain}-${value}`]: true,
      },
    }));

    try {
      if (type === "sow") {
        await axios.delete(`${API_BASE}/delete-sow`, {
          data: { domain, sow: value },
        });
      }

      if (type === "jobType") {
        await axios.delete(`${API_BASE}/delete-jobtype`, {
          data: { domain, jobType: value },
        });
      }

      if (type === "uom") {
        await axios.delete(`${API_BASE}/delete-uom`, {
          data: { domain, uom: value },
        });
      }

      fetchData();
    } catch (err) {
      alert("Delete failed");
    }
  };
  /* ================= UI ================= */
return (
  <>
    <div className="page-top-bar">
      <button
        className="back-btn standalone-back-btn"
        onClick={() => navigate("/telecom")}
      >
        ⬅ Back
      </button>
    </div>

    <div className="master-container flex-layout">
      {/* LEFT PANEL */}
      <div className="left-side">
        <h2 className="title">Master Entry</h2>

        <div className="card">

          <div className="domain-header">

            <h3>Select Domain</h3>

            <button
              className="create-domain-btn"
              onClick={() => setShowCreateForm(!showCreateForm)}
            >
              + Create Domain
            </button>

          </div>

          <select
            value={selectedDomain}
            onChange={(e) => handleDomainChange(e.target.value)}
          >
            <option value="">Select Domain</option>

            {Object.keys(data).map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>

          {showCreateForm && (
            <div className="create-domain-form">

              <input
                value={newDomain}
                onChange={(e) => setNewDomain(e.target.value)}
                placeholder="Enter domain"
              />

              <div className="domain-btn-row">

                <button className="domain-create-btn" onClick={createDomain}>
                  Create
                </button>

                <button
                  onClick={deleteDomain}
                  className="delete-btn"
                >
                  Delete
                </button>

              </div>

            </div>
          )}

        </div>


        {/* SOW */}
        <div className="card">
          <h3>SOW</h3>
          {sow.map((v, i) => (
            <div key={i} className="input-row">
              <input
                value={v}
                onChange={(e) => updateArray(setSow, sow, i, e.target.value)}
              />
              <button onClick={() => addField(setSow, sow)}>+</button>
              {sow.length > 1 && (
                <button onClick={() => removeField(setSow, sow, i)}>
                  -
                </button>
              )}
            </div>
          ))}
        </div>

        {/* JOB TYPE */}
        <div className="card">
          <h3>Job Type</h3>
          {jobType.map((v, i) => (
            <div key={i} className="input-row">
              <input
                value={v}
                onChange={(e) =>
                  updateArray(setJobType, jobType, i, e.target.value)
                }
              />
              <button onClick={() => addField(setJobType, jobType)}>+</button>
              {jobType.length > 1 && (
                <button onClick={() => removeField(setJobType, jobType, i)}>
                  -
                </button>
              )}
            </div>
          ))}
        </div>

        {/* UOM */}
        <div className="card">
          <h3>UOM</h3>
          {uom.map((v, i) => (
            <div key={i} className="input-row">
              <input
                value={v}
                onChange={(e) => updateArray(setUom, uom, i, e.target.value)}
              />
              <button onClick={() => addField(setUom, uom)}>+</button>
              {uom.length > 1 && (
                <button onClick={() => removeField(setUom, uom, i)}>
                  -
                </button>
              )}
            </div>
          ))}
        </div>

        <div className="card">
          <button className="save-all-btn" onClick={saveAll}>
            Save All
          </button>
        </div>
      </div>

      {/* RIGHT PANEL */}
      <div className="right-side">

        <h2 className="title">Edit Master </h2>

        {loading && <p>Loading...</p>}
        {error && <p>{error}</p>}

        <table className="master-table">
          <thead>
            <tr>
              <th>S.No</th>
              <th>Domain</th>
              <th>SOW</th>
              <th>Job Type</th>
              <th>UOM</th>
              <th>Actions</th>
            </tr>
          </thead>

          <tbody>
            {domainsList.map((d, i) => (
              <tr key={d}>
                <td>{i + 1}</td>
                <td>{d}</td>

             <td>
  {data[d]?.sow
    ?.filter((item) => !hiddenItems.sow[`${d}-${item}`])
    .map((item, idx, arr) => (
      <span key={idx} className="item-chip">

        {deleteMode && (
          <button
            className="cross-btn"
            onClick={() => hideAndDelete("sow", d, item)}
          >
            ❌
          </button>
        )}

        {item}

        {idx < arr.length - 1 && ", "}
      </span>
    ))}
</td>

            <td>
  {data[d]?.jobType
    ?.filter((item) => !hiddenItems.jobType[`${d}-${item}`])
    .map((item, idx, arr) => (
      <span key={idx} className="item-chip">

        {deleteMode && (
          <button
            className="cross-btn"
            onClick={() => hideAndDelete("jobType", d, item)}
          >
            ❌
          </button>
        )}

        {item}

        {idx < arr.length - 1 && ", "}
      </span>
    ))}
</td>

            <td>
  {data[d]?.uom
    ?.filter((item) => !hiddenItems.uom[`${d}-${item}`])
    .map((item, idx, arr) => (
      <span key={idx} className="item-chip">

        {deleteMode && (
          <button
            className="cross-btn"
            onClick={() => hideAndDelete("uom", d, item)}
          >
            ❌
          </button>
        )}

        {item}

        {idx < arr.length - 1 && ", "}
      </span>
    ))}
</td>

                <td>
                  <button onClick={() => handleDomainChange(d)}>
                    ✏️
                  </button>

                  <button
                    onClick={() => setDeleteMode((p) => !p)}
                  >
                    🗑️
                  </button>
                </td>
              </tr>
            ))}
          </tbody>

        </table>
      </div>
    </div>
  </>
);
};

export default MasterCreation;