import { API_BASE_URL } from "../config";
import React, { useCallback, useEffect, useRef, useState } from "react";
import axios from "axios";
import "../style/masterdomian.css";

const API_BASE =
  process.env.REACT_APP_API_BASE ||
  `${API_BASE_URL}/api/master`;

const normalize = (d) => (d || "").toString().trim().toUpperCase();

// Backend ka asli error message nikalta hai, taaki pata chale delete/update kyu fail hua
const getErrorMessage = (err, fallback) => {
  const data = err?.response?.data;
  const backendMsg =
    (typeof data === "string" && data.trim() && data.length < 200 ? data : "") ||
    data?.message ||
    data?.error;
  if (backendMsg) return backendMsg;
  if (err?.response?.status) return `${fallback} (Error ${err.response.status})`;
  return fallback;
};

/* ---------- On-screen message (toast) + confirm box styles ---------- */
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

const MasterDomainCreation = () => {
  // Har domain: { name, inMaster }
  // name = wahi naam jo master/work mein saved hai (original case), uppercase mein badla hua nahi
  const [domains, setDomains] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [isEdit, setIsEdit] = useState(false);
  const [selectedDomain, setSelectedDomain] = useState(null); // { name, inMaster }
  const [domainName, setDomainName] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null); // { name, inMaster }
  const [deleting, setDeleting] = useState(false);

  const [toast, setToast] = useState(null); // { type, text }
  const toastTimerRef = useRef(null);

  const showToast = useCallback((type, text) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ type, text });
    toastTimerRef.current = setTimeout(() => setToast(null), 4000);
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  // ================= FETCH DOMAINS & WORK DATA =================
  const fetchDomains = useCallback(async () => {
    const [masterResult, workResult] = await Promise.allSettled([
      axios.get(API_BASE),
      axios.get(`${API_BASE_URL}/api/work/all`),
    ]);

    // 1. Master domains (original naam ke saath)
    let masterList = [];
    if (masterResult.status === "fulfilled") {
      const data = masterResult.value.data;
      if (Array.isArray(data)) {
        masterList = data
          .map((item) =>
            typeof item === "string" ? item : item?.domain || item?.name || ""
          )
          .filter(Boolean);
      } else {
        masterList = Object.keys(data || {});
      }
    } else {
      console.error("Fetch Error:", masterResult.reason);
      showToast("error", "Domains load nahi ho paye!");
    }

    // 2. Work data ke domains (taaki koi chhoote nahi)
    let workList = [];
    if (workResult.status === "fulfilled") {
      const data = workResult.value.data;
      const arr = Array.isArray(data) ? data : data?.data || [];
      workList = arr.map((item) => item.domain).filter(Boolean);
    } else {
      console.error("Work Data Fetch Error:", workResult.reason);
    }

    // 3. Case-insensitive unique. Master ka naam pehle aata hai, isliye
    //    master mein jo spelling/case hai wahi rakhi jati hai (delete/update ke liye wahi chahiye)
    const map = new Map();
    masterList.forEach((d) => {
      const clean = d.toString().trim();
      const key = normalize(clean);
      if (key && !map.has(key)) {
        map.set(key, { name: clean, inMaster: true });
      }
    });
    workList.forEach((d) => {
      const clean = d.toString().trim();
      const key = normalize(clean);
      if (key && !map.has(key)) {
        map.set(key, { name: clean, inMaster: false });
      }
    });

    const list = Array.from(map.values()).sort((a, b) =>
      a.name.localeCompare(b.name)
    );
    setDomains(list);
  }, [showToast]);

  useEffect(() => {
    fetchDomains();
  }, [fetchDomains]);

  const domainExists = (name, ignoreName) =>
    domains.some(
      (d) =>
        normalize(d.name) === normalize(name) &&
        normalize(d.name) !== normalize(ignoreName)
    );

  // ================= CREATE DOMAIN =================
  const handleCreate = async () => {
    const cleanName = domainName.trim();

    if (!cleanName) {
      showToast("warning", "Please Enter Domain Name!");
      return;
    }

    if (domainExists(cleanName)) {
      showToast("warning", "Ye domain pehle se maujood hai!");
      return;
    }

    setSaving(true);
    try {
      await axios.post(`${API_BASE}/create-domain`, {
        domain: cleanName,
      });

      showToast("success", "Domain Created Successfully!");

      setShowModal(false);
      setDomainName("");

      fetchDomains();
    } catch (err) {
      console.error(err);
      showToast("error", getErrorMessage(err, "Create Failed!"));
    } finally {
      setSaving(false);
    }
  };

  // ================= UPDATE DOMAIN =================
  const handleUpdate = async () => {
    const cleanName = domainName.trim();

    if (!cleanName) {
      showToast("warning", "Please Enter Domain Name!");
      return;
    }

    if (selectedDomain && cleanName === selectedDomain.name) {
      showToast("warning", "Koi change nahi kiya gaya!");
      return;
    }

    if (domainExists(cleanName, selectedDomain?.name)) {
      showToast("warning", "Ye domain pehle se maujood hai!");
      return;
    }

    setSaving(true);
    try {
      await axios.put(`${API_BASE}/update-domain`, {
        // Original naam bheja ja raha hai (pehle uppercase wala bhej dete the, isliye match nahi hota tha)
        oldDomain: selectedDomain?.name,
        newDomain: cleanName,
      });

      showToast("success", "Domain Updated Successfully!");

      setShowModal(false);
      setIsEdit(false);
      setSelectedDomain(null);
      setDomainName("");

      fetchDomains();
    } catch (err) {
      console.error(err);
      showToast("error", getErrorMessage(err, "Update Failed!"));
    } finally {
      setSaving(false);
    }
  };

  // ================= DELETE DOMAIN =================
  // Pehle screen par confirm box dikhega
  const requestDelete = (domainItem) => {
    setDeleteTarget(domainItem);
  };

  const confirmDelete = async () => {
    const target = deleteTarget;
    if (!target || deleting) return;

    setDeleting(true);
    try {
      // Delete fail hone ki wajah: domain URL mein encode nahi ho raha tha
      // (space, &, / jaise characters URL toot dete the) aur naam uppercase mein ja raha tha.
      await axios.delete(
        `${API_BASE}/delete-domain/${encodeURIComponent(target.name)}`
      );

      showToast("success", "Domain Deleted Successfully!");
      setDeleteTarget(null);
      fetchDomains();
    } catch (err) {
      console.error(err);

      let message = getErrorMessage(err, "Delete Failed!");

      if (err?.response?.status === 404 && !target.inMaster) {
        message =
          "Ye domain sirf Work data mein hai, Master mein nahi mila, isliye yahan se delete nahi ho sakta.";
      }

      showToast("error", message);
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  };

  // ================= OPEN CREATE MODAL =================
  const openCreateModal = () => {
    setIsEdit(false);
    setSelectedDomain(null);
    setDomainName("");
    setShowModal(true);
  };

  // ================= OPEN EDIT MODAL =================
  const openEditModal = (domainItem) => {
    setIsEdit(true);
    setSelectedDomain(domainItem);
    setDomainName(domainItem.name);
    setShowModal(true);
  };

  // ================= CLOSE MODAL =================
  const closeModal = () => {
    setShowModal(false);
    setIsEdit(false);
    setSelectedDomain(null);
    setDomainName("");
  };

  const handleSave = () => {
    if (saving) return;
    if (isEdit) {
      handleUpdate();
    } else {
      handleCreate();
    }
  };

  return (
    <div className="master-container">
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

      {/* ---------- Delete confirm (screen par) ---------- */}
      {deleteTarget && (
        <div
          style={confirmOverlayStyle}
          onClick={() => !deleting && setDeleteTarget(null)}
        >
          <div style={confirmModalStyle} onClick={(e) => e.stopPropagation()}>
            <div
              style={{
                fontSize: "16px",
                fontWeight: 700,
                marginBottom: "8px",
                color: "#111827",
              }}
            >
              Delete Domain?
            </div>
            <div style={{ fontSize: "14px", color: "#4b5563", marginBottom: "18px" }}>
              Are you sure you want to delete "{deleteTarget.name}"?
            </div>
            <div style={{ display: "flex", justifyContent: "center", gap: "12px" }}>
              <button
                type="button"
                style={{ ...confirmBtnBase, background: "#dc2626", opacity: deleting ? 0.6 : 1 }}
                onClick={confirmDelete}
                disabled={deleting}
              >
                {deleting ? "Deleting..." : "Yes, Delete"}
              </button>
              <button
                type="button"
                style={{ ...confirmBtnBase, background: "#6b7280" }}
                onClick={() => setDeleteTarget(null)}
                disabled={deleting}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="domain-card">
        {/* HEADER */}
        <div className="domain-header">
          <div>
            <h2 className="domain-title">Domain Management</h2>

            <p className="domain-subtitle">Create, Update and Delete Domains</p>
          </div>

          <button
            type="button"
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
                  <tr key={domain.name}>
                    <td>{index + 1}</td>

                    {/* Dikhane ke liye uppercase, lekin API ko original naam jata hai */}
                    <td>{domain.name.toUpperCase()}</td>

                    <td>
                      <button
                        type="button"
                        className="edit-btn"
                        onClick={() => openEditModal(domain)}
                      >
                        Edit
                      </button>

                      <button
                        type="button"
                        className="delete-btn"
                        onClick={() => requestDelete(domain)}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="3" className="no-data">
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
                <h3>{isEdit ? "Edit Domain" : "Create Domain"}</h3>

                <button
                  type="button"
                  className="close-id close-btn"
                  onClick={closeModal}
                >
                  ✕
                </button>
              </div>

              <div className="modal-body">
                <label>Domain Name</label>

                <input
                  type="text"
                  value={domainName}
                  placeholder="Enter Domain Name"
                  autoFocus
                  onChange={(e) => setDomainName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSave();
                  }}
                />
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  className="save-btn"
                  onClick={handleSave}
                  disabled={saving}
                >
                  {saving ? "Saving..." : "Save"}
                </button>

                <button type="button" className="cancel-btn" onClick={closeModal}>
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
