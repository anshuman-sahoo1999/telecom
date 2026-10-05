import { API_BASE_URL } from "../config";
import React, { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import axios from "axios";
import html2canvas from "html2canvas";
import "../style/CapacityForecast.css";

const monthsList = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
];

const normalize = (d) => (d || "").toString().trim().toUpperCase();

const monthStrToIndex = (monthStr) => {
  if (!monthStr) return null;
  const parts = monthStr.split(",");
  if (parts.length < 2) return null;
  const mIdx = monthsList.findIndex(
    (m) => m.toLowerCase() === parts[0].trim().slice(0, 3).toLowerCase()
  );
  const yr = parseInt(parts[1].trim(), 10);
  if (mIdx === -1 || isNaN(yr)) return null;
  return yr * 12 + mIdx;
};

// "2026-03-15" (date input) -> year * 12 + monthIndex
const dateInputToIndex = (dateStr) => {
  if (!dateStr) return null;
  const [y, m] = dateStr.split("-").map(Number);
  if (!y || !m) return null;
  return y * 12 + (m - 1);
};

const getRowId = (row) => row.id ?? row._id;

const toastIcons = {
  success: "✅",
  error: "❌",
  warning: "⚠️"
};

export default function CapacityForecast() {
  const [domains, setDomains] = useState([]);
  const [allWorkData, setAllWorkData] = useState([]);
  const [masterDataMap, setMasterDataMap] = useState({});
  const [records, setRecords] = useState([]);

  const [editingRowId, setEditingRowId] = useState(null);
  const [inlineData, setInlineData] = useState({});
  const [openDropdownDomain, setOpenDropdownDomain] = useState(null);

  // Create button se form popup khulega
  const [showForm, setShowForm] = useState(false);

  // Double click par duplicate record na bane
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSavingInline, setIsSavingInline] = useState(false);

  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  // Screen par message + delete confirm
  const [toast, setToast] = useState(null); // { type, text }
  const [deleteId, setDeleteId] = useState(null);
  const toastTimerRef = useRef(null);

  const componentRefs = useRef({});

  const currentYear = new Date().getFullYear();
  const generatedMonths = monthsList.map((m) => `${m}, ${currentYear}`);

  const [formData, setFormData] = useState({
    month: generatedMonths[0],
    domain: "",
    capacity: "",
    forecast: "",
    inflow: "",
    uomValues: {}
  });

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

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (!event.target.closest(".cvf-export-wrap")) {
        setOpenDropdownDomain(null);
      }
    };
    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, []);

  // Popup khula ho to Esc se band ho, aur peeche ka page scroll na kare
  useEffect(() => {
    if (!showForm) return undefined;
    const onKeyDown = (e) => {
      if (e.key === "Escape") setShowForm(false);
    };
    document.addEventListener("keydown", onKeyDown);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [showForm]);

  // Delete confirm box bhi Esc se band ho
  useEffect(() => {
    if (deleteId === null) return undefined;
    const onKeyDown = (e) => {
      if (e.key === "Escape") setDeleteId(null);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [deleteId]);

  const fetchAllData = useCallback(async () => {
    try {
      const [workRes, masterRes] = await Promise.all([
        axios.get(`${API_BASE_URL}/api/work/all`),
        axios.get(`${API_BASE_URL}/api/master`)
      ]);

      const workData = Array.isArray(workRes.data) ? workRes.data : [];
      setAllWorkData(workData);

      const data = masterRes.data || {};
      setMasterDataMap(data);
      const domainList = Object.keys(data);
      setDomains(domainList);

      const merged = [
        ...new Set([
          ...domainList.map(normalize),
          ...workData.map((x) => normalize(x.domain))
        ])
      ].filter(Boolean);

      if (merged.length > 0) {
        setFormData((prev) => ({ ...prev, domain: prev.domain || merged[0] }));
      }
    } catch (err) {
      console.error("Error fetching work/master data:", err);
      showToast("error", "Failed to load domain data!");
    }
  }, [showToast]);

  const fetchCapacityRecords = useCallback(async () => {
    try {
      const res = await axios.get(`${API_BASE_URL}/api/capacity-forecast`);
      setRecords(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error("Error fetching capacity records:", err);
      showToast("error", "Failed to load records!");
    }
  }, [showToast]);

  useEffect(() => {
    fetchAllData();
    fetchCapacityRecords();
  }, [fetchAllData, fetchCapacityRecords]);

  const mergedDomains = [
    ...new Set([
      ...domains.map(normalize),
      ...allWorkData.map((x) => normalize(x.domain))
    ])
  ].filter(Boolean);

  // Records mein dusre saal ke months hon to edit dropdown mein bhi dikhen
  const monthOptions = [
    ...generatedMonths,
    ...[...new Set(records.map((r) => r.month).filter(Boolean))].filter(
      (m) => !generatedMonths.includes(m)
    )
  ];

  const getActiveUoms = (domainName) => {
    if (!domainName) return [];
    const upperDomain = normalize(domainName);

    const masterKey = Object.keys(masterDataMap).find(
      (k) => normalize(k) === upperDomain
    );
    if (masterKey) {
      const sub = masterDataMap[masterKey];
      if (Array.isArray(sub)) return sub;
      if (typeof sub === "object" && sub !== null) return Object.keys(sub);
    }

    const domainItems = allWorkData.filter((x) => normalize(x.domain) === upperDomain);
    const uomKeys = new Set();
    domainItems.forEach((item) => {
      let uom = item.uom || {};
      if (typeof uom === "string") {
        try { uom = JSON.parse(uom); } catch { uom = {}; }
      }
      if (typeof uom === "object" && uom !== null) {
        Object.keys(uom).forEach((k) => {
          if (k && k !== "undefined") uomKeys.add(k);
        });
      }
    });

    return Array.from(uomKeys);
  };

  const activeUoms = getActiveUoms(formData.domain);

  const openForm = () => {
    setFormData((prev) => ({
      ...prev,
      domain: prev.domain || mergedDomains[0] || ""
    }));
    setShowForm(true);
  };

  const handleCustomChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => {
      if (name === "domain") {
        return { ...prev, domain: value, uomValues: {} };
      }
      return { ...prev, [name]: value };
    });
  };

  const handleUomChange = (subKey, value) => {
    setFormData((prev) => ({
      ...prev,
      uomValues: { ...prev.uomValues, [subKey]: value }
    }));
  };

  const handleCustomSubmit = async (e) => {
    e.preventDefault();
    if (isSubmitting) return;

    // Sirf Month aur Domain mandatory hain
    if (!formData.month || !formData.domain) {
      showToast("warning", "Please select Month and Domain!");
      return;
    }

    const formattedUom = {};
    Object.keys(formData.uomValues).forEach((k) => {
      formattedUom[k] = Number(formData.uomValues[k] || 0);
    });

    const payloadData = {
      month: formData.month,
      domain: formData.domain,
      capacity: Number(formData.capacity || 0),
      forecast: Number(formData.forecast || 0),
      inflow: Number(formData.inflow || 0),
      uom: formattedUom
    };

    setIsSubmitting(true);
    try {
      await axios.post(`${API_BASE_URL}/api/capacity-forecast`, payloadData);
      showToast("success", "Data submitted successfully!");
      fetchCapacityRecords();

      // Form sirf success par reset hoga
      setFormData({
        month: generatedMonths[0],
        domain: mergedDomains[0] || "",
        capacity: "",
        forecast: "",
        inflow: "",
        uomValues: {}
      });
      setShowForm(false);
    } catch (err) {
      console.error("API submission error:", err);
      showToast("error", "Failed to save data to backend API!");
    } finally {
      setIsSubmitting(false);
    }
  };

  // uomKeys: us domain ke table ke saare UOM columns
  const handleInlineEditStart = (row, uomKeys = []) => {
    const uomInit = {};
    uomKeys.forEach((k) => {
      uomInit[k] = row.uom?.[k] ?? 0;
    });
    setEditingRowId(getRowId(row));
    setInlineData({
      month: row.month || generatedMonths[0],
      capacity: row.capacity ?? 0,
      forecast: row.forecast ?? 0,
      inflow: row.inflow ?? 0,
      uom: { ...(row.uom || {}), ...uomInit }
    });
  };

  const handleInlineFieldChange = (field, value) => {
    setInlineData((prev) => ({ ...prev, [field]: value }));
  };

  const handleInlineUomChange = (uk, value) => {
    setInlineData((prev) => ({
      ...prev,
      uom: { ...prev.uom, [uk]: value }
    }));
  };

  const handleInlineSave = async (row) => {
    if (isSavingInline) return;
    const rowId = getRowId(row);

    if (!inlineData.month) {
      showToast("warning", "Please select Month!");
      return;
    }

    const formattedUom = {};
    if (inlineData.uom) {
      Object.keys(inlineData.uom).forEach((k) => {
        formattedUom[k] = Number(inlineData.uom[k] || 0);
      });
    }

    const payloadData = {
      month: inlineData.month,
      domain: row.domain,
      capacity: Number(inlineData.capacity || 0),
      forecast: Number(inlineData.forecast || 0),
      inflow: Number(inlineData.inflow || 0),
      uom: formattedUom
    };

    setIsSavingInline(true);
    try {
      await axios.put(`${API_BASE_URL}/api/capacity-forecast/${rowId}`, payloadData);
      showToast("success", "Record updated successfully!");
      setEditingRowId(null);
      fetchCapacityRecords();
    } catch (err) {
      console.error("Error updating record:", err);
      showToast("error", "Failed to update record!");
    } finally {
      setIsSavingInline(false);
    }
  };

  // Delete: pehle screen par confirm box dikhega
  const handleDelete = (id) => {
    if (id === undefined || id === null) {
      showToast("error", "Record ID not found, cannot delete!");
      return;
    }
    setDeleteId(id);
  };

  const confirmDelete = async () => {
    const id = deleteId;
    setDeleteId(null);
    try {
      await axios.delete(`${API_BASE_URL}/api/capacity-forecast/${id}`);
      showToast("success", "Record deleted successfully!");
      fetchCapacityRecords();
    } catch (err) {
      console.error("Error deleting record:", err);
      showToast("error", "Failed to delete record!");
    }
  };

  // Date filter: month-level compare
  const fromIdx = dateInputToIndex(fromDate);
  const toIdx = dateInputToIndex(toDate);

  const filteredRecords = records.filter((item) => {
    if (fromIdx === null && toIdx === null) return true;
    const itemIdx = monthStrToIndex(item.month);
    if (itemIdx === null) return true;
    if (fromIdx !== null && itemIdx < fromIdx) return false;
    if (toIdx !== null && itemIdx > toIdx) return false;
    return true;
  });

  const groupedData = filteredRecords.reduce((acc, item) => {
    const domain = (item.domain || "UNKNOWN").toUpperCase();
    if (!acc[domain]) acc[domain] = [];
    acc[domain].push(item);
    return acc;
  }, {});

  // Har domain ke rows month ke order mein
  Object.keys(groupedData).forEach((d) => {
    groupedData[d].sort(
      (a, b) => (monthStrToIndex(a.month) ?? 0) - (monthStrToIndex(b.month) ?? 0)
    );
  });

  const generateStyledCanvas = async (domainName) => {
    const printContent = componentRefs.current[domainName];
    if (!printContent) return null;

    const wrapper = document.createElement("div");
    wrapper.style.padding = "20px";
    wrapper.style.background = "#ffffff";
    wrapper.style.width = "700px";
    wrapper.style.margin = "0 auto";
    wrapper.style.fontFamily = "Arial, sans-serif";
    // Screen par flash na ho isliye off-screen
    wrapper.style.position = "fixed";
    wrapper.style.left = "-10000px";
    wrapper.style.top = "0";

    const currentTimestamp = new Date()
      .toLocaleString("en-US", {
        month: "numeric",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
        second: "2-digit",
        hour12: true
      })
      .toLowerCase();

    wrapper.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; border-bottom: 1px solid #d1d5db; padding-bottom: 8px;">
        <div>
          <img src="/Image/img1.png" alt="Logo" width="75" style="height: 50px; object-fit: contain;" />
        </div>
        <div style="font-size: 18px; font-weight: 800; color: #1e3a8a; text-align: center; letter-spacing: 0.5px;">Capacity Vs Forecast Vs Inflow</div>
        <div style="font-size: 8px; font-weight: 500; color: #4b5563;">${currentTimestamp}</div>
      </div>
    `;

    const clonedContent = printContent.cloneNode(true);
    clonedContent.style.width = "auto";
    clonedContent.style.margin = "0";

    // Export dropdown aur card header hatao
    const exportContainer = clonedContent.querySelector(".cvf-export-wrap");
    if (exportContainer) exportContainer.remove();
    const cardHeaderTitle = clonedContent.querySelector(".cvf-card-head");
    if (cardHeaderTitle) cardHeaderTitle.remove();

    // Scroll wrapper clip na kare
    const scrollWrapper = clonedContent.querySelector(".cvf-table-scroll");
    if (scrollWrapper) {
      scrollWrapper.style.overflow = "visible";
      scrollWrapper.style.maxWidth = "none";
    }

    const table = clonedContent.querySelector("table");
    if (table) {
      // Action column hatao
      table.querySelectorAll("tr").forEach((row) => {
        const lastCell = row.lastElementChild;
        if (lastCell) lastCell.remove();
      });

      // Column count nikalo, phir project title row insert karo
      const colCount = table.rows[0] ? table.rows[0].cells.length : 5;
      const headerRow = table.insertRow(0);
      const cell = headerRow.insertCell(0);
      cell.colSpan = colCount;
      cell.innerText = `${domainName} Project`;
      cell.style.backgroundColor = "#182848";
      cell.style.color = "#ffffff";
      cell.style.fontWeight = "bold";
      cell.style.fontSize = "14px";
      cell.style.textAlign = "center";
      cell.style.padding = "8px";
    }

    wrapper.appendChild(clonedContent);
    document.body.appendChild(wrapper);

    try {
      // Logo load hone ka wait
      const logo = wrapper.querySelector("img");
      if (logo && !logo.complete) {
        await new Promise((resolve) => {
          logo.onload = resolve;
          logo.onerror = resolve;
        });
      }

      return await html2canvas(wrapper, {
        scale: 2,
        useCORS: true,
        backgroundColor: "#ffffff"
      });
    } finally {
      if (wrapper.parentNode) wrapper.parentNode.removeChild(wrapper);
    }
  };

  const handleExport = async (domainName, type) => {
    setOpenDropdownDomain(null);
    try {
      const canvas = await generateStyledCanvas(domainName);
      if (!canvas) {
        showToast("error", "Nothing to export!");
        return;
      }

      let mimeType = "image/png";
      let extension = "png";
      if (type === "jpg" || type === "jpeg") {
        mimeType = "image/jpeg";
        extension = "jpg";
      }

      const imageURL = canvas.toDataURL(mimeType, 1.0);
      const link = document.createElement("a");
      link.href = imageURL;
      link.download = `${domainName}-Capacity-Report.${extension}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      showToast("success", `${extension.toUpperCase()} exported successfully!`);
    } catch (err) {
      console.error("Export error:", err);
      showToast("error", `Failed to export as ${type.toUpperCase()}!`);
    }
  };

  /* ---------- Overlays (portal ke through body mein render honge) ---------- */
  const overlays = (
    <>
      {toast && (
        <div role="status" className={`cvf-toast cvf-toast--${toast.type}`}>
          <span>
            {toastIcons[toast.type]} {toast.text}
          </span>
          <button
            type="button"
            className="cvf-toast-close"
            title="Close"
            onClick={() => setToast(null)}
          >
            ✕
          </button>
        </div>
      )}

      {deleteId !== null && (
        <div className="cvf-confirm-overlay" onClick={() => setDeleteId(null)}>
          <div
            className="cvf-confirm-box"
            role="alertdialog"
            aria-modal="true"
            aria-label="Delete record"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="cvf-confirm-title">Delete Record?</div>
            <div className="cvf-confirm-text">
              Are you sure you want to delete this record?
            </div>
            <div className="cvf-confirm-actions">
              <button type="button" className="cvf-btn cvf-btn--danger" onClick={confirmDelete}>
                Yes, Delete
              </button>
              <button type="button" className="cvf-btn cvf-btn--grey" onClick={() => setDeleteId(null)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {showForm && (
        <div className="cvf-modal-overlay" onClick={() => setShowForm(false)}>
          <div
            className="cvf-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Add new record"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="cvf-modal-head">
              <span className="cvf-modal-title">Add New Record</span>
              <button
                type="button"
                className="cvf-modal-close"
                title="Close"
                onClick={() => setShowForm(false)}
              >
                ✕
              </button>
            </div>

            <form className="cvf-form" onSubmit={handleCustomSubmit}>
              <div className="cvf-field">
                <label>
                  Choose Month &amp; Year <span className="cvf-required">*</span>
                </label>
                <select name="month" value={formData.month} onChange={handleCustomChange} required>
                  {generatedMonths.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>

              <div className="cvf-field">
                <label>
                  Choose Domain <span className="cvf-required">*</span>
                </label>
                <select name="domain" value={formData.domain} onChange={handleCustomChange} required>
                  <option value="">Select Domain</option>
                  {mergedDomains.map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </div>

              <div className="cvf-field">
                <label>Enter No. Of Capacity</label>
                <input
                  type="number"
                  min="0"
                  name="capacity"
                  value={formData.capacity}
                  onChange={handleCustomChange}
                  placeholder="Enter no. of capacity"
                />
              </div>

              <div className="cvf-field">
                <label>Enter No. Of Forecast</label>
                <input
                  type="number"
                  min="0"
                  name="forecast"
                  value={formData.forecast}
                  onChange={handleCustomChange}
                  placeholder="Enter no. of forecast"
                />
              </div>

              <div className="cvf-field">
                <label>Enter No. Of Inflow</label>
                <input
                  type="number"
                  min="0"
                  name="inflow"
                  value={formData.inflow}
                  onChange={handleCustomChange}
                  placeholder="Enter no. of inflow"
                />
              </div>

              {activeUoms.map((sub) => (
                <div key={sub} className="cvf-field">
                  <label>Enter No. Of {sub}</label>
                  <input
                    type="number"
                    min="0"
                    value={formData.uomValues[sub] || ""}
                    onChange={(e) => handleUomChange(sub, e.target.value)}
                    placeholder={`Enter no. of ${String(sub).toLowerCase()}`}
                  />
                </div>
              ))}

              <div className="cvf-form-actions">
                <button type="submit" className="cvf-submit-btn" disabled={isSubmitting}>
                  {isSubmitting ? "Submitting..." : "Submit Record"}
                </button>
                <button
                  type="button"
                  className="cvf-cancel-btn"
                  onClick={() => setShowForm(false)}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );

  return (
    <div className="cvf-page">
      <h2 className="cvf-title">Capacity Vs Forecast Vs Inflow</h2>

      {/* ---------- Toolbar: filters (left) + Create (right) ---------- */}
      <div className="cvf-toolbar">
        <div className="cvf-filters">
          <div className="cvf-filter">
            <label>From Date:</label>
            <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
          </div>
          <div className="cvf-filter">
            <label>To Date:</label>
            <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
          </div>
          {(fromDate || toDate) && (
            <button
              type="button"
              className="cvf-clear-btn"
              onClick={() => { setFromDate(""); setToDate(""); }}
            >
              Clear Filters
            </button>
          )}
        </div>

        <button type="button" className="cvf-create-btn" onClick={openForm}>
          <span className="cvf-create-plus">+</span> Create
        </button>
      </div>

      {/* Modal / toast / confirm ko document.body mein render karo, taaki
          parent ke overflow, transform ya z-index se kabhi na dabein */}
      {createPortal(overlays, document.body)}

      <div className="cvf-grid">
        {Object.entries(groupedData).map(([domainName, rows]) => {
          const uomKeysSet = new Set();
          rows.forEach((r) => {
            if (r.uom && typeof r.uom === "object") {
              Object.keys(r.uom).forEach((k) => uomKeysSet.add(k));
            }
          });
          const uomKeys = Array.from(uomKeysSet);

          const totalCapacity = rows.reduce((sum, r) => sum + Number(r.capacity || 0), 0);
          const totalForecast = rows.reduce((sum, r) => sum + Number(r.forecast || 0), 0);
          const totalInflow = rows.reduce((sum, r) => sum + Number(r.inflow || 0), 0);

          const uomTotals = {};
          uomKeys.forEach((uk) => {
            uomTotals[uk] = rows.reduce((sum, r) => sum + Number(r.uom?.[uk] || 0), 0);
          });

          let avgPercentage = 0;
          if (totalForecast > 0) {
            avgPercentage = Math.round((totalInflow / totalForecast) * 100);
          }

          const isDropdownOpen = openDropdownDomain === domainName;

          return (
            <div key={domainName} className="cvf-card">
              <div ref={(el) => { componentRefs.current[domainName] = el; }}>
                <div className="cvf-card-head">
                  <div className="cvf-card-title">{domainName} Project</div>

                  <div className="cvf-export-wrap">
                    <button
                      type="button"
                      className="cvf-export-btn"
                      onClick={() => setOpenDropdownDomain(isDropdownOpen ? null : domainName)}
                    >
                      📤 Export ▼
                    </button>
                    {isDropdownOpen && (
                      <div className="cvf-export-menu">
                        <button type="button" onClick={() => handleExport(domainName, "png")}>PNG Image</button>
                        <button type="button" onClick={() => handleExport(domainName, "jpg")}>JPG Image</button>
                      </div>
                    )}
                  </div>
                </div>

                <div className="cvf-card-body">
                  <div className="cvf-table-scroll">
                    <table className="cvf-table">
                      <thead>
                        <tr>
                          <th>Month</th>
                          <th>Capacity</th>
                          <th>Forecast</th>
                          <th>Inflow</th>
                          {uomKeys.map((uk) => (
                            <th key={uk}>{uk}</th>
                          ))}
                          <th>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((row, idx) => {
                          const rowId = getRowId(row);
                          // rowId undefined ho to sab rows ek saath edit mode mein na jayein
                          const isEditing = rowId !== undefined && editingRowId === rowId;

                          return (
                            <tr key={rowId ?? idx}>
                              <td>
                                {isEditing ? (
                                  <select
                                    className="cvf-edit-input"
                                    value={inlineData.month}
                                    onChange={(e) => handleInlineFieldChange("month", e.target.value)}
                                  >
                                    {monthOptions.map((m) => (
                                      <option key={m} value={m}>{m}</option>
                                    ))}
                                  </select>
                                ) : (
                                  row.month
                                )}
                              </td>
                              <td>
                                {isEditing ? (
                                  <input
                                    type="number"
                                    min="0"
                                    className="cvf-edit-input"
                                    value={inlineData.capacity}
                                    onChange={(e) => handleInlineFieldChange("capacity", e.target.value)}
                                  />
                                ) : (
                                  row.capacity
                                )}
                              </td>
                              <td>
                                {isEditing ? (
                                  <input
                                    type="number"
                                    min="0"
                                    className="cvf-edit-input"
                                    value={inlineData.forecast}
                                    onChange={(e) => handleInlineFieldChange("forecast", e.target.value)}
                                  />
                                ) : (
                                  row.forecast
                                )}
                              </td>
                              <td>
                                {isEditing ? (
                                  <input
                                    type="number"
                                    min="0"
                                    className="cvf-edit-input"
                                    value={inlineData.inflow}
                                    onChange={(e) => handleInlineFieldChange("inflow", e.target.value)}
                                  />
                                ) : (
                                  row.inflow
                                )}
                              </td>
                              {uomKeys.map((uk) => (
                                <td key={uk}>
                                  {isEditing ? (
                                    <input
                                      type="number"
                                      min="0"
                                      className="cvf-edit-input"
                                      value={inlineData.uom?.[uk] ?? ""}
                                      onChange={(e) => handleInlineUomChange(uk, e.target.value)}
                                    />
                                  ) : (
                                    row.uom?.[uk] || 0
                                  )}
                                </td>
                              ))}
                              <td>
                                {isEditing ? (
                                  <>
                                    <button
                                      type="button"
                                      className="cvf-icon-btn"
                                      title="Save"
                                      disabled={isSavingInline}
                                      onClick={() => handleInlineSave(row)}
                                    >
                                      ✅
                                    </button>
                                    <button
                                      type="button"
                                      className="cvf-icon-btn"
                                      title="Cancel"
                                      onClick={() => setEditingRowId(null)}
                                    >
                                      ❌
                                    </button>
                                  </>
                                ) : (
                                  <>
                                    <button
                                      type="button"
                                      className="cvf-icon-btn"
                                      title="Edit"
                                      onClick={() => handleInlineEditStart(row, uomKeys)}
                                    >
                                      ✏️
                                    </button>
                                    <button
                                      type="button"
                                      className="cvf-icon-btn"
                                      title="Delete"
                                      onClick={() => handleDelete(rowId)}
                                    >
                                      🗑️
                                    </button>
                                  </>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                        <tr className="cvf-total-row">
                          <td>Total</td>
                          <td>{totalCapacity}</td>
                          <td>{totalForecast}</td>
                          <td>{totalInflow}</td>
                          {uomKeys.map((uk) => (
                            <td key={uk}>{uomTotals[uk]}</td>
                          ))}
                          <td>-</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  <div className="cvf-avg-card">
                    <div className="cvf-avg-title">Avg:</div>
                    <div className="cvf-avg-val">{avgPercentage}%</div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
