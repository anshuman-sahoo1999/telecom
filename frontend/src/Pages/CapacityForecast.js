import React, { useState, useEffect, useCallback, useRef } from "react";
import axios from "axios";
import html2canvas from "html2canvas";
import "../style/CapacityForecast.css";

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

  const componentRefs = useRef({});

  const monthsList = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
  ];

  const currentYear = new Date().getFullYear();
  const generatedMonths = [];
  const yearsRange = [currentYear];

  yearsRange.forEach(yr => {
    monthsList.forEach(m => {
      generatedMonths.push(`${m}, ${yr}`);
    });
  });

  const [formData, setFormData] = useState({
    month: generatedMonths[0] || `Jan, ${currentYear}`,
    domain: "",
    capacity: "",
    forecast: "",
    inflow: "",
    uomValues: {}
  });

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
      const workRes = await axios.get("http://localhost:5000/api/work/all");
      setAllWorkData(workRes.data);

      const masterRes = await axios.get("http://localhost:5000/api/master");
      const data = masterRes.data || {};
      setMasterDataMap(data);
      const domainList = Object.keys(data);
      setDomains(domainList);

      const normalize = (d) => (d || "").toString().trim().toUpperCase();
      const masterDomains = (domainList || []).map(normalize);
      const workDomains = (workRes.data || []).map(x => normalize(x.domain));
      const mergedDomains = [...new Set([...masterDomains, ...workDomains])];

      if (mergedDomains.length > 0) {
        setFormData(prev => ({ ...prev, domain: prev.domain || mergedDomains[0], uomValues: {} }));
      }
    } catch (err) {
      console.error("Error fetching work/master data:", err);
    }
  }, []);

  const fetchCapacityRecords = useCallback(async () => {
    try {
      const res = await axios.get("http://localhost:5000/api/capacity-forecast");
      setRecords(res.data || []);
    } catch (err) {
      console.error("Error fetching capacity records:", err);
    }
  }, []);

  useEffect(() => {
    fetchAllData();
    fetchCapacityRecords();
  }, [fetchAllData, fetchCapacityRecords]);

  const normalize = (d) => (d || "").toString().trim().toUpperCase();
  const masterDomains = (domains || []).map(normalize);
  const workDomains = allWorkData.map(x => normalize(x.domain));
  const mergedDomains = [...new Set([...masterDomains, ...workDomains])];

  const getActiveUoms = (domainName) => {
    if (!domainName) return [];
    const upperDomain = domainName.toUpperCase();

    if (masterDataMap[upperDomain]) {
      const sub = masterDataMap[upperDomain];
      if (Array.isArray(sub)) return sub;
      if (typeof sub === "object" && sub !== null) return Object.keys(sub);
    }

    const domainItems = allWorkData.filter(x => normalize(x.domain) === upperDomain);
    const uomKeys = new Set();
    domainItems.forEach(item => {
      let uom = item.uom || {};
      if (typeof uom === "string") {
        try { uom = JSON.parse(uom); } catch { uom = {}; }
      }
      if (typeof uom === "object" && uom !== null) {
        Object.keys(uom).forEach(k => {
          if (k && k !== "undefined") uomKeys.add(k);
        });
      }
    });

    return Array.from(uomKeys);
  };

  const activeUoms = getActiveUoms(formData.domain);

  const handleCustomChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => {
      if (name === "domain") {
        return { ...prev, domain: value, uomValues: {} };
      }
      return { ...prev, [name]: value };
    });
  };

  const handleUomChange = (subKey, value) => {
    setFormData(prev => ({
      ...prev,
      uomValues: {
        ...prev.uomValues,
        [subKey]: value
      }
    }));
  };

  const handleCustomSubmit = async (e) => {
    e.preventDefault();
    if (!formData.capacity || !formData.forecast || !formData.inflow) {
      alert("Please fill out capacity, forecast, and inflow fields!");
      return;
    }

    const formattedUom = {};
    Object.keys(formData.uomValues).forEach(k => {
      formattedUom[k] = Number(formData.uomValues[k] || 0);
    });

    const payloadData = {
      month: formData.month,
      domain: formData.domain,
      capacity: Number(formData.capacity),
      forecast: Number(formData.forecast),
      inflow: Number(formData.inflow),
      uom: formattedUom
    };

    try {
      await axios.post("http://localhost:5000/api/capacity-forecast", payloadData);
      alert("Data submitted successfully!");
      fetchCapacityRecords();
    } catch (err) {
      console.error("API submission error:", err);
      alert("Failed to save data to backend API!");
    }

    setFormData({
      month: generatedMonths[0] || `Jan, ${currentYear}`,
      domain: mergedDomains[0] || "",
      capacity: "",
      forecast: "",
      inflow: "",
      uomValues: {}
    });
  };

  const handleInlineEditStart = (row) => {
    const rowId = row.id;
    setEditingRowId(rowId);
    setInlineData({
      month: row.month || generatedMonths[0],
      capacity: row.capacity || 0,
      forecast: row.forecast || 0,
      inflow: row.inflow || 0,
      uom: { ...(row.uom || {}) }
    });
  };

  const handleInlineFieldChange = (field, value) => {
    setInlineData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleInlineUomChange = (uk, value) => {
    setInlineData(prev => ({
      ...prev,
      uom: {
        ...prev.uom,
        [uk]: value
      }
    }));
  };

  const handleInlineSave = async (row) => {
    const rowId = row.id;
    const formattedUom = {};
    if (inlineData.uom) {
      Object.keys(inlineData.uom).forEach(k => {
        formattedUom[k] = Number(inlineData.uom[k] || 0);
      });
    }

    const payloadData = {
      month: inlineData.month,
      domain: row.domain,
      capacity: Number(inlineData.capacity),
      forecast: Number(inlineData.forecast),
      inflow: Number(inlineData.inflow),
      uom: formattedUom
    };

    try {
      await axios.put(`http://localhost:5000/api/capacity-forecast/${rowId}`, payloadData);
      alert("Record updated successfully!");
      setEditingRowId(null);
      fetchCapacityRecords();
    } catch (err) {
      console.error("Error updating record:", err);
      alert("Failed to update record!");
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Are you sure you want to delete this record?")) return;
    try {
      await axios.delete(`http://localhost:5000/api/capacity-forecast/${id}`);
      alert("Record deleted successfully!");
      fetchCapacityRecords();
    } catch (err) {
      console.error("Error deleting record:", err);
      alert("Failed to delete record!");
    }
  };

  const parseMonthYearToDate = (monthStr) => {
    if (!monthStr) return null;
    const parts = monthStr.split(",");
    if (parts.length < 2) return null;
    const mName = parts[0].trim();
    const yr = parseInt(parts[1].trim(), 10);
    const dateParsed = new Date(`${mName} 1, ${yr}`);
    return isNaN(dateParsed.getTime()) ? null : dateParsed;
  };

  const filteredRecords = records.filter(item => {
    if (!fromDate && !toDate) return true;
    const itemDate = parseMonthYearToDate(item.month);
    if (!itemDate) return true;

    if (fromDate && toDate) {
      const fDate = new Date(fromDate);
      const tDate = new Date(toDate);
      return itemDate >= fDate && itemDate <= tDate;
    } else if (fromDate) {
      const fDate = new Date(fromDate);
      return itemDate >= fDate;
    } else if (toDate) {
      const tDate = new Date(toDate);
      return itemDate <= tDate;
    }
    return true;
  });

  const groupedData = filteredRecords.reduce((acc, item) => {
    const domain = (item.domain || "UNKNOWN").toUpperCase();
    if (!acc[domain]) {
      acc[domain] = [];
    }
    acc[domain].push(item);
    return acc;
  }, {});

  // Canvas generation without domain/project title bar
  const generateStyledCanvas = async (domainName) => {
    const printContent = componentRefs.current[domainName];
    if (!printContent) return null;

    const wrapper = document.createElement("div");
    wrapper.style.padding = "20px";
    wrapper.style.background = "#ffffff";
    wrapper.style.width = "700px";
    wrapper.style.margin = "0 auto";
    wrapper.style.fontFamily = "Arial, sans-serif";

    const currentTimestamp = new Date().toLocaleString("en-US", {
      month: "numeric",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
      hour12: true
    }).toLowerCase();

    const headerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; border-bottom: 1px solid #d1d5db; padding-bottom: 8px;">
        <div>
          <img src="/Image/img1.png" alt="Logo" width="75" style="height: 50px; object-fit: contain;" />
        </div>
        <div style="font-size: 18px; font-weight: 800; color: #1e3a8a; text-align: center; letter-spacing: 0.5px;">Capacity Vs Forecast Vs Inflow</div>
        <div style="font-size: 8px; font-weight: 500; color: #4b5563;">${currentTimestamp}</div>
      </div>
    `;

    wrapper.innerHTML = headerHTML;

    const clonedContent = printContent.cloneNode(true);
    clonedContent.style.width = "auto";
    clonedContent.style.margin = "0";

    // Remove export container dropdown
    const exportContainer = clonedContent.querySelector(".img-export-dropdown-container");
    if (exportContainer) exportContainer.remove();
    const table = clonedContent.querySelector("table");
    if (table) {
      // Remove action column cells
      const rows = table.querySelectorAll("tr");
      rows.forEach(row => {
        const lastCell = row.lastElementChild;
        if (lastCell) lastCell.remove();
      });

      // Insert project name directly inside the table as the very first row spanning across all columns
      const headerRow = table.insertRow(0);
      const colCount = table.rows[1] ? table.rows[1].cells.length : 5;
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

    // Remove card header title (Domain Project bar) from exported content
    const cardHeaderTitle = clonedContent.querySelector(".img-table-header-container");
    if (cardHeaderTitle) cardHeaderTitle.remove();

    wrapper.appendChild(clonedContent);
    document.body.appendChild(wrapper);

    const canvas = await html2canvas(wrapper, {
      scale: 2,
      useCORS: true
    });

    document.body.removeChild(wrapper);
    return canvas;
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
    } catch (err) {
      console.error("Export error:", err);
      alert(`Failed to export as ${type.toUpperCase()}!`);
    }
  };

  return (
    <div className="img-style-container">
      <h2 className="img-main-title">Capacity Vs Forecast Vs Inflow</h2>

      <form className="img-form-wrapper" onSubmit={handleCustomSubmit}>
        <div className="img-field-group">
          <label>Choose Month & Year</label>
          <select name="month" value={formData.month} onChange={handleCustomChange}>
            {generatedMonths.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>

        <div className="img-field-group">
          <label>Choose Domain</label>
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

        {activeUoms.map((sub, idx) => (
          <div key={idx} className="img-field-group">
            <label>Enter No. Of {sub}</label>
            <input
              type="number"
              value={formData.uomValues[sub] || ""}
              onChange={(e) => handleUomChange(sub, e.target.value)}
              placeholder={`Enter no. of ${sub.toLowerCase()}`}
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
          <input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
          />
        </div>
        <div className="img-filter-group">
          <label>To Date:</label>
          <input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
          />
        </div>
        {(fromDate || toDate) && (
          <button className="img-clear-filter-btn" onClick={() => { setFromDate(""); setToDate(""); }}>
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
          } else if (rows.length > 0) {
            const ratios = rows.map((r) => {
              const f = Number(r.forecast || 0);
              const i = Number(r.inflow || 0);
              return f > 0 ? (i / f) * 100 : 0;
            });
            const sumRatios = ratios.reduce((a, b) => a + b, 0);
            avgPercentage = Math.round(sumRatios / rows.length);
          }

          const isDropdownOpen = openDropdownDomain === domainName;

          return (
            <div key={domainName} className="img-table-box">
              <div ref={(el) => (componentRefs.current[domainName] = el)}>
                <div className="img-table-header-container">
                  <div className="img-table-header-title">{domainName} Project</div>

                  <div className="img-export-dropdown-container">
                    <button
                      className="img-export-main-btn"
                      onClick={() => setOpenDropdownDomain(isDropdownOpen ? null : domainName)}
                    >
                      📤 Export ▼
                    </button>
                    {isDropdownOpen && (
                      <div className="img-export-dropdown-menu">
                        <button onClick={() => handleExport(domainName, "png")}>PNG Image</button>
                        <button onClick={() => handleExport(domainName, "jpg")}>JPG Image</button>
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
                          const rowId = row.id;
                          const isEditing = editingRowId === rowId;

                          return (
                            <tr key={rowId || idx}>
                              <td>
                                {isEditing ? (
                                  <select
                                    className="img-edit-row-input"
                                    value={inlineData.month}
                                    onChange={(e) => handleInlineFieldChange("month", e.target.value)}
                                  >
                                    {generatedMonths.map(m => <option key={m} value={m}>{m}</option>)}
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
                                      value={inlineData.uom?.[uk] || ""}
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
                                    <button className="img-action-btn img-action-save-btn" title="Save" onClick={() => handleInlineSave(row)}>✅</button>
                                    <button className="img-action-btn img-action-cancel-btn" title="Cancel" onClick={() => setEditingRowId(null)}>❌</button>
                                  </>
                                ) : (
                                  <>
                                    <button className="img-action-btn img-action-edit-btn" title="Edit" onClick={() => handleInlineEditStart(row)}>✏️</button>
                                    <button className="img-action-btn img-action-delete-btn" title="Delete" onClick={() => handleDelete(rowId)}>🗑️</button>
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