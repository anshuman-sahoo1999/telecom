import React, { useState, useEffect } from "react";
import axios from "axios";
import "../style/masterdomian.css";

const API_BASE =
  process.env.REACT_APP_API_BASE ||
  "http://localhost:5000/api/master";

const MasterDomainCreation = () => {
  const [domains, setDomains] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [isEdit, setIsEdit] = useState(false);
  const [selectedDomain, setSelectedDomain] = useState("");
  const [domainName, setDomainName] = useState("");

  // ================= FETCH DOMAINS & WORK DATA =================
  const fetchDomains = async () => {
    try {
      // 1. Master API se domains fetch karein
      const masterRes = await axios.get(API_BASE);
      let masterList = [];
      if (Array.isArray(masterRes.data)) {
        masterList = masterRes.data;
      } else {
        masterList = Object.keys(masterRes.data || {});
      }

      // 2. Work Data se bhi existing domains fetch karein taaki koi chhoote nahi
      let workList = [];
      try {
        const workRes = await axios.get("http://localhost:5000/api/work/all");
        if (Array.isArray(workRes.data)) {
          workList = workRes.data.map(item => item.domain).filter(Boolean);
        }
      } catch (workErr) {
        console.error("Work Data Fetch Error:", workErr);
      }

      // 3. Dono lists ko combine karke unique uppercase domains banayein
      const normalize = (d) => (d || "").toString().trim().toUpperCase();
      const combinedDomains = [...new Set([...masterList.map(normalize), ...workList.map(normalize)])];
      
      setDomains(combinedDomains);
    } catch (err) {
      console.error("Fetch Error:", err);
    }
  };

  useEffect(() => {
    fetchDomains();
  }, []);

  // ================= CREATE DOMAIN =================
  const handleCreate = async () => {
    try {
      if (!domainName.trim()) {
        alert("Please Enter Domain Name");
        return;
      }

      await axios.post(`${API_BASE}/create-domain`, {
        domain: domainName.trim(),
      });

      alert("Domain Created Successfully");

      setShowModal(false);
      setDomainName("");

      fetchDomains();
    } catch (err) {
      console.error(err);
      alert("Create Failed");
    }
  };

  // ================= UPDATE DOMAIN =================
  const handleUpdate = async () => {
    try {
      if (!domainName.trim()) {
        alert("Please Enter Domain Name");
        return;
      }

      await axios.put(`${API_BASE}/update-domain`, {
        oldDomain: selectedDomain,
        newDomain: domainName.trim(),
      });

      alert("Domain Updated Successfully");

      setShowModal(false);
      setIsEdit(false);
      setSelectedDomain("");
      setDomainName("");

      fetchDomains();
    } catch (err) {
      console.error(err);
      alert("Update Failed");
    }
  };

  // ================= DELETE DOMAIN =================
  const handleDelete = async (domain) => {
    const confirmDelete = window.confirm(
      `Delete "${domain}" ?`
    );

    if (!confirmDelete) return;

    try {
      await axios.delete(
        `${API_BASE}/delete-domain/${domain}`
      );

      alert("Domain Deleted Successfully");

      fetchDomains();
    } catch (err) {
      console.error(err);
      alert("Delete Failed");
    }
  };

  // ================= OPEN CREATE MODAL =================
  const openCreateModal = () => {
    setIsEdit(false);
    setSelectedDomain("");
    setDomainName("");
    setShowModal(true);
  };

  // ================= OPEN EDIT MODAL =================
  const openEditModal = (domain) => {
    setIsEdit(true);
    setSelectedDomain(domain);
    setDomainName(domain);
    setShowModal(true);
  };

  // ================= CLOSE MODAL =================
  const closeModal = () => {
    setShowModal(false);
    setIsEdit(false);
    setSelectedDomain("");
    setDomainName("");
  };

  return (
    <div className="master-container">
      <div className="domain-card">

        {/* HEADER */}
        <div className="domain-header">
          <div>
            <h2 className="domain-title">
              Domain Management
            </h2>

            <p className="domain-subtitle">
              Create, Update and Delete Domains
            </p>
          </div>

          <button
            className="create-domain-btn"
            onClick={openCreateModal}
          >
            + Create Domain
          </button>
        </div>

        {/* TABLE */}
        <div className="domain-table-wrapper">
          <table className="domain-table">
            <thead>
              <tr>
                <th>Sl No</th>
                <th>Domain Name</th>
                <th>Action</th>
              </tr>
            </thead>

            <tbody>
              {domains.length > 0 ? (
                domains.map((domain, index) => (
                  <tr key={index}>
                    <td>{index + 1}</td>

                    <td>{domain}</td>

                    <td>
                      <button
                        className="edit-btn"
                        onClick={() =>
                          openEditModal(domain)
                        }
                      >
                        Edit
                      </button>

                      <button
                        className="delete-btn"
                        onClick={() =>
                          handleDelete(domain)
                        }
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td
                    colSpan="3"
                    className="no-data"
                  >
                    No Domains Found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* MODAL */}
        {showModal && (
          <div className="modal-overlay">
            <div className="modal-box">

              <div className="modal-header">
                <h3>
                  {isEdit
                    ? "Edit Domain"
                    : "Create Domain"}
                </h3>

                <button
                  className="close-id close-btn"
                  onClick={closeModal}
                >
                  ✕
                </button>
              </div>

              <div className="modal-body">
                <label>
                  Domain Name
                </label>

                <input
                  type="text"
                  value={domainName}
                  placeholder="Enter Domain Name"
                  onChange={(e) =>
                    setDomainName(
                      e.target.value
                    )
                  }
                />
              </div>

              <div className="modal-footer">
                <button
                  className="save-btn"
                  onClick={
                    isEdit
                      ? handleUpdate
                      : handleCreate
                  }
                >
                  Save
                </button>

                <button
                  className="cancel-btn"
                  onClick={closeModal}
                >
                  Cancel
                </button>
              </div>

            </div>
          </div>
        )}

      </div>
    </div>
  );
};
export default MasterDomainCreation;    
