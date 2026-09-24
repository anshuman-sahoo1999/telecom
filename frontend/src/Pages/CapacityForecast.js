import { API_BASE_URL } from "../config";
import React, { useState, useEffect, useCallback, useRef } from "react";
import axios from "axios";
import html2canvas from "html2canvas";
import "../style/CapacityForecast.css";

const monthsList = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
];

const normalize = (d) => (d || "").toString().trim().toUpperCase();

// "Mar, 2026" -> number (year * 12 + monthIndex). Timezone issue se bachne ke liye Date use nahi kiya.
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
  gap: "12px"
};

const toastColors = {
  success: "#16a34a",
  error: "#dc2626",
  warning: "#d97706"
};

const toastIcons = {
  success: "✅",
  error: "❌",
  warning: "⚠️"
};

const overlayStyle = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.45)",
  zIndex: 99998,
  display: "flex",
  alignItems: "center",
  justifyContent: "center"
};

const modalStyle = {
  background: "#ffffff",
  borderRadius: "10px",
  padding: "22px 24px",
  width: "90%",
  maxWidth: "380px",
  boxShadow: "0 10px 30px rgba(0,0,0,0.3)",
  textAlign: "center",
  fontFamily: "Arial, sans-serif"
};

const modalBtnBase = {
  border: "none",
  borderRadius: "6px",
  padding: "8px 18px",
  fontSize: "14px",
  fontWeight: 600,
  cursor: "pointer",
  color: "#ffffff"
};

export default function CapacityForecast() {
  const [domains, setDomains] = useState([]);
  const [allWorkData, setAllWorkData] = useState([]);
  const [masterDataMap, setMasterDataMap] = useState({});
  const [records, setRecords] = useState([]);

  const [editingRowId, setEditingRowId] = useState(null);
  const [inlineData, setInlineData] = useState({});
  const [openDropdownDomain, setOpenDropdownDomain] = useState(null);

  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  // Screen par dikhne wala message + delete confirm
  const [toast, setToast] = useState(null); // { type: "success" | "error" | "warning", text: string }
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
      if (!event.target.closest(".img-export-dropdown-container")) {
        setOpenDropdownDomain(null);
      }
    };
    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, []);

  const fetchAllData = useCallback(async () => {
    try {
      const workRes = await axios.get(`${API_BASE_URL}/api/work/all`);
      const workData = workRes.data || [];
      setAllWorkData(workData);

      const masterRes = await axios.get(`${API_BASE_URL}/api/master`);
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
      showToast("error", "Domain data load nahi ho paya!");
    }
  }, [showToast]);

  const fetchCapacityRecords = useCallback(async () => {
    try {
      const res = await axios.get(`${API_BASE_URL}/api/capacity-forecast`);
      setRecords(res.data || []);
    } catch (err) {
      console.error("Error fetching capacity records:", err);
      showToast("error", "Records load nahi ho paye!");
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

  // Records mein agar dusre saal ke months hain to edit dropdown mein bhi dikhen
  const monthOptions = [
    ...generatedMonths,
    ...[...new Set(records.map((r) => r.month).filter(Boolean))].filter(
      (m) => !generatedMonths.includes(m)
    )
  ];

  const getActiveUoms = (domainName) => {
    if (!domainName) return [];
    const upperDomain = normalize(domainName);

    // master keys ka case alag ho sakta hai, isliye case-insensitive match
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
    // Sirf Month aur Domain mandatory hain.
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
    } catch (err) {
      console.error("API submission error:", err);
      showToast("error", "Failed to save data to backend API!");
    }
  };

  const handleInlineEditStart = (row) => {
    setEditingRowId(getRowId(row));
    setInlineData({
      month: row.month || generatedMonths[0],
      capacity: row.capacity ?? 0,
      forecast: row.forecast ?? 0,
      inflow: row.inflow ?? 0,
      uom: { ...(row.uom || {}) }
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

    try {
      await axios.put(`${API_BASE_URL}/api/capacity-forecast/${rowId}`, payloadData);
      showToast("success", "Record updated successfully!");
      setEditingRowId(null);
      fetchCapacityRecords();
    } catch (err) {
      console.error("Error updating record:", err);
      showToast("error", "Failed to update record!");
    }
  };

  // Delete: pehle screen par confirm box dikhega, browser popup nahi
  const handleDelete = (id) => {
    if (id === undefined || id === null) {
      showToast("error", "Record ID nahi mili, delete nahi ho sakta!");
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

  // Date filter: month-level compare (timezone / 1st-of-month bug fix)
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

  // Har domain ke rows ko month ke order mein sort karo
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
    // Screen par flash na ho isliye off-screen rakha
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
    const exportContainer = clonedContent.querySelector(".img-export-dropdown-container");
    if (exportContainer) exportContainer.remove();
    const cardHeaderTitle = clonedContent.querySelector(".img-table-header-container");
    if (cardHeaderTitle) cardHeaderTitle.remove();

    // Scroll wrapper clip na kare
    const scrollWrapper = clonedContent.querySelector(".img-table-scroll-wrapper");
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

      // Column count pehle nikalo, phir project title row insert karo
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
      // Logo load hone ka wait (warna export mein logo missing aata tha)
      const logo = wrapper.querySelector("img");
      if (logo && !logo.complete) {
        await new Promise((resolve) => {
          logo.onload = resolve;
          logo.onerror = resolve;
        });
      }

      return await html2canvas(wrapper, { scale: 2, useCORS: true });
    } finally {
      document.body.removeChild(wrapper);
    }
  };

  const handleExport = async (domainName, type) => {
    setOpenDropdownDomain(null);
    try {
      const canvas = await generateStyledCanvas(domainName);
      if (!canvas) return;

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

  return (
    <div className="img-style-container">
      {/* ---------- Screen par success / error message ---------- */}
      {toast && (
        <div
          role="status"
          style={{ ...toastBaseStyle, background: toastColors[toast.type] || toastColors.success }}
        >
          <span>
            {toastIcons[toast.type]} {toast.text}
          </span>
          <button
            type="button"
            onClick={() => setToast(null)}
            style={{
              background: "transparent",
              border: "none",
              color: "#ffffff",
              fontSize: "16px",
              cursor: "pointer",
              lineHeight: 1
            }}
            title="Close"
          >
            ✕
          </button>
        </div>
      )}

      {/* ---------- Delete confirm (screen par) ---------- */}
      {deleteId !== null && (
        <div style={overlayStyle} onClick={() => setDeleteId(null)}>
          <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontSize: "16px", fontWeight: 700, marginBottom: "8px", color: "#111827" }}>
              Delete Record?
            </div>
            <div style={{ fontSize: "14px", color: "#4b5563", marginBottom: "18px" }}>
              Are you sure you want to delete this record?
            </div>
            <div style={{ display: "flex", justifyContent: "center", gap: "12px" }}>
              <button
                type="button"
                style={{ ...modalBtnBase, background: "#dc2626" }}
                onClick={confirmDelete}
              >
                Yes, Delete
              </button>
              <button
                type="button"
                style={{ ...modalBtnBase, background: "#6b7280" }}
                onClick={() => setDeleteId(null)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <h2 className="img-main-title">Capacity Vs Forecast Vs Inflow</h2>

      <form className="img-form-wrapper" onSubmit={handleCustomSubmit}>
        <div className="img-field-group">
          <label>Choose Month & Year <span style={{ color: "red" }}>*</span></label>
          <select name="month" value={formData.month} onChange={handleCustomChange} required>
            {generatedMonths.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>

        <div className="img-field-group">
          <label>Choose Domain <span style={{ color: "red" }}>*</span></label>
          <select name="domain" value={formData.domain} onChange={handleCustomChange} required>
            <option value="">Select Domain</option>
            {mergedDomains.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        </div>

        <div className="img-field-group">
          <label>Enter No. Of Capacity</label>
          <input type="number" name="capacity" value={formData.capacity} onChange={handleCustomChange} placeholder="Enter no. of capacity" />
        </div>

        <div className="img-field-group">
          <label>Enter No. Of Forecast</label>
          <input type="number" name="forecast" value={formData.forecast} onChange={handleCustomChange} placeholder="Enter no. of forecast" />
        </div>

        <div className="img-field-group">
          <label>Enter No. Of Inflow</label>
          <input type="number" name="inflow" value={formData.inflow} onChange={handleCustomChange} placeholder="Enter no. of inflow" />
        </div>

        {activeUoms.map((sub) => (
          <div key={sub} className="img-field-group">
            <label>Enter No. Of {sub}</label>
            <input
              type="number"
              value={formData.uomValues[sub] || ""}
              onChange={(e) => handleUomChange(sub, e.target.value)}
              placeholder={`Enter no. of ${String(sub).toLowerCase()}`}
            />
          </div>
        ))}

        <div className="img-form-actions">
          <button type="submit" className="img-submit-btn">
            Submit Record
          </button>
        </div>
      </form>

      <div className="img-date-filter-simple">
        <div className="img-filter-group">
          <label>From Date:</label>
          <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
        </div>
        <div className="img-filter-group">
          <label>To Date:</label>
          <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
        </div>
        {(fromDate || toDate) && (
          <button
            type="button"
            className="img-clear-filter-btn"
            onClick={() => { setFromDate(""); setToDate(""); }}
          >
            Clear Filters
          </button>
        )}
      </div>

      <div className="img-reports-grid">
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
            <div key={domainName} className="img-table-box">
              <div ref={(el) => (componentRefs.current[domainName] = el)}>
                <div className="img-table-header-container">
                  <div className="img-table-header-title">{domainName} Project</div>

                  <div className="img-export-dropdown-container">
                    <button
                      type="button"
                      className="img-export-main-btn"
                      onClick={() => setOpenDropdownDomain(isDropdownOpen ? null : domainName)}
                    >
                      📤 Export ▼
                    </button>
                    {isDropdownOpen && (
                      <div className="img-export-dropdown-menu">
                        <button type="button" onClick={() => handleExport(domainName, "png")}>PNG Image</button>
                        <button type="button" onClick={() => handleExport(domainName, "jpg")}>JPG Image</button>
                      </div>
                    )}
                  </div>
                </div>

                <div className="img-table-flex-row">
                  <div className="img-table-scroll-wrapper">
                    <table className="img-custom-table">
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
                                    className="img-edit-row-input"
                                    value={inlineData.month}
                                    onChange={(e) => handleInlineFieldChange("month", e.target.value)}
                                  >
                                    {monthOptions.map((m) => <option key={m} value={m}>{m}</option>)}
                                  </select>
                                ) : (
                                  row.month
                                )}
                              </td>
                              <td>
                                {isEditing ? (
                                  <input
                                    type="number"
                                    className="img-edit-row-input"
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
                                    className="img-edit-row-input"
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
                                    className="img-edit-row-input"
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
                                      className="img-edit-row-input"
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
                                    <button type="button" className="img-action-btn img-action-save-btn" title="Save" onClick={() => handleInlineSave(row)}>✅</button>
                                    <button type="button" className="img-action-btn img-action-cancel-btn" title="Cancel" onClick={() => setEditingRowId(null)}>❌</button>
                                  </>
                                ) : (
                                  <>
                                    <button type="button" className="img-action-btn img-action-edit-btn" title="Edit" onClick={() => handleInlineEditStart(row)}>✏️</button>
                                    <button type="button" className="img-action-btn img-action-delete-btn" title="Delete" onClick={() => handleDelete(rowId)}>🗑️</button>
                                  </>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                        <tr className="img-total-row">
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

                  <div className="img-avg-card">
                    <div className="img-avg-title">Avg:</div>
                    <div className="img-avg-val">{avgPercentage}%</div>
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
