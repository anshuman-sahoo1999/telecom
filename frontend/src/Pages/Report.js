import React, { useEffect, useState, useRef } from "react";
import axios from "axios";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import autoTable from "jspdf-autotable";
import ExcelJS from "exceljs";
import "../style/report.css";
import { ComposableMap, Geographies, Geography } from "react-simple-maps";
import geoData from "../us-states.json";
import { geoCentroid } from "d3-geo";

export default function Report() {
  const [jumpPage, setJumpPage] = useState("");
  const [data, setData] = useState([]);
  const [selectedMonthYear, setSelectedMonthYear] = useState("");
  const [selectedDomain, setSelectedDomain] = useState("");
  const [selectedState, setSelectedState] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const rowsPerPage = 10;
  const [openExport, setOpenExport] = useState(false);
  const exportRef = useRef();
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
  const [editingRowId, setEditingRowId] = useState(null);
  const [editForm, setEditForm] = useState({});
  const user = JSON.parse(localStorage.getItem("user")) || {};


  const handleSave = async () => {

    const confirmSave = window.confirm(
      "Are you sure you want to save changes?"
    );

    if (!confirmSave) {
      return;
    }

    try {

      const parsedUOM = editForm.uom || {};

      const payload = {

        domain: editForm.domain,

        subDomain: editForm.jobType,

        jobsDelivered: Number(
          editForm.jobsDelivered || 0
        ),

        state: editForm.state,

        county: editForm.county,

        region: editForm.region,

        sow: editForm.sow,

        uom: parsedUOM,

        months: [
          `${editForm.month}-${String(editForm.year).slice(-2)}`
        ],
      };

      const res = await axios.put(
        `http://localhost:5000/api/work/update/${editForm.id}`,
        payload
      );

      if (res.status === 200) {

        alert("✅ Record updated successfully");

        setEditingRowId(null);

        fetchData();

      }

    } catch (err) {

      console.log(err);

      alert("❌ Update failed");
    }
  };
  const handleDelete = async (id) => {

    const confirmDelete = window.confirm(
      "Are you sure you want to delete this record?"
    );

    if (!confirmDelete) {
      return;
    }

    try {

      const res = await axios.delete(
        `http://localhost:5000/api/work/delete/${id}`
      );

      if (res.status === 200) {

        alert("✅ Record deleted successfully");

        await fetchData();

      }

    } catch (err) {

      console.error(err);

      alert("❌ Delete failed");
    }
  };

  const fetchData = async () => {
    try {
      const res = await axios.get("http://localhost:5000/api/work/all");
      setData(res.data);
    } catch (err) {
      console.error("Error fetching work data:", err);
    }
  };

  useEffect(() => {
    fetchData();

    const handleClickOutside = (e) => {
      if (exportRef.current && !exportRef.current.contains(e.target)) {
        setOpenExport(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    setCurrentPage(1);
  }, [selectedMonthYear, selectedDomain, selectedState, fromDate, toDate]);

  const parseDate = (d) => {
    if (!d) return null;

    if (d instanceof Date && !isNaN(d.getTime())) return d;

    try {
      const parsed = new Date(d);
      return isNaN(parsed.getTime()) ? null : parsed;
    } catch {
      return null;
    }
  };

  const formatDateOnly = (date) => {
    const d = parseDate(date);
    if (!d) return "-";

    try {
      return d.toLocaleDateString("en-IN", {
        timeZone: "Asia/Kolkata",
        day: "2-digit",
        month: "short",
        year: "numeric",
      });
    } catch {
      return "-";
    }
  };

  const formatArrayOrString = (val) => {
    if (!val) return "-";

    if (Array.isArray(val)) {
      return val.join(" | ");
    }

    return val;
  };


  const formatUOM = (uom) => {

    if (!uom) return "-";

    // string case
    if (typeof uom === "string") {
      return uom;
    }

    // object case
    if (typeof uom === "object") {

      const entries = Object.entries(uom);

      if (entries.length === 0) return "-";

      return entries
        .map(([key, value]) => `${key}: ${value || 0}`)
        .join(" | ");
    }

    return "-";
  };

  let rows = [];

  data.forEach((item) => {

    const dateObj = item.updated_at || item.created_at;

    const monthRaw = item.months?.[0]; // ["Jan-26"]

    let month = "-";
    let year = "-";

    if (typeof monthRaw === "string") {
      const parts = monthRaw.split("-"); // ["Jan", "26"]
      month = parts[0] || "-";
      year = parts[1] ? `20${parts[1]}` : "-";
    }
    // ✅ FIX: monthYear define karo
    const monthYear = `${month} ${year}`;

    rows.push({
      id: item._id || item.id,
      monthYear,
      month,
      year,
      domain: item.domain || "-",
      sow: formatArrayOrString(item.sow),
      jobType: formatArrayOrString(item.subDomain || item.jobType),

      // ✅ REGION
      region:
        item.region &&
          item.region !== "Unknown" &&
          item.region !== "Unknown Region"
          ? item.region
          : "N/A",

      // ✅ STATE / MARKET
      state:
        item.state &&
          item.state !== "Unknown" &&
          item.state !== "Unknown State"
          ? item.state
          : "N/A",

      county:
        item.county &&
          item.county !== "Unknown" &&
          item.county !== "Unknown County"
          ? item.county
          : "",

      jobsDelivered: Number(item.jobsDelivered) || 0,

      uom: item.uom || {},

      lastUpdate: parseDate(dateObj),

      formattedDate: formatDateOnly(dateObj),
    });
  });

  const monthOrder = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
  ];

  rows.sort((a, b) => {
    const aMonth = monthOrder.indexOf(a.month);
    const bMonth = monthOrder.indexOf(b.month);

    if (b.year !== a.year) return b.year - a.year;

    return bMonth - aMonth;
  });
  const uniqueMonthYear = [...new Set(rows.map((r) => `${r.month} ${r.year}`))];
  const uniqueDomains = [...new Set(data.map((d) => d.domain))];
  const uniqueStates = [
    ...new Set(
      rows.map((r) => {

        // ✅ agar region N/A hai
        // to state dropdown me Other show hoga
        if (
          r.region === "N/A" ||
          !r.state ||
          r.state === "Unknown" ||
          r.state === "Unknown State" ||
          r.state === "N/A"
        ) {
          return "Other";
        }

        return r.state;
      })
    ),
  ].sort((a, b) => {

    // ✅ Other always last
    if (a === "Other") return 1;
    if (b === "Other") return -1;

    return a.localeCompare(b);
  });

  const filteredRows = rows.filter((r) => {
    if (selectedMonthYear && `${r.month} ${r.year}` !== selectedMonthYear)
      return false;
    if (selectedDomain && r.domain !== selectedDomain) return false;
    if (selectedState) {

      // ✅ Other select karne pe
      // region N/A wale records bhi aayenge
      if (selectedState === "Other") {

        const isOther =
          r.region === "N/A" ||
          !r.state ||
          r.state === "Unknown" ||
          r.state === "Unknown State" ||
          r.state === "N/A";

        if (!isOther) return false;

      } else if (r.state !== selectedState) {

        return false;
      }
    }

    if (fromDate || toDate) {
      if (!r.lastUpdate) return false;

      const rowTime = r.lastUpdate.getTime();

      if (fromDate) {
        const from = new Date(fromDate + "T00:00:00").getTime();
        if (rowTime < from) return false;
      }

      if (toDate) {
        const to = new Date(toDate + "T23:59:59").getTime();
        if (rowTime > to) return false;
      }
    }

    return true;
  });
  const latestUpdated = filteredRows.length
    ? filteredRows.reduce((latest, row) => {
      if (!row.lastUpdate) return latest;

      return !latest || row.lastUpdate > latest
        ? row.lastUpdate
        : latest;
    }, null)
    : null;

  const formattedLastUpdated = latestUpdated
    ? `${latestUpdated.toLocaleTimeString("en-IN", {
      timeZone: "Asia/Kolkata",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    })}, ${latestUpdated.toLocaleDateString("en-IN", {
      timeZone: "Asia/Kolkata",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    })}`
    : "-";
  const getRowTotalJob = (r) => {
    return Number(r.jobsDelivered || 0);
  };

  const totalJobs = filteredRows.reduce((sum, r) => {
    return sum + getRowTotalJob(r);
  }, 0);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / rowsPerPage));

  const indexOfLast = currentPage * rowsPerPage;
  const currentRows = filteredRows.slice(
    indexOfLast - rowsPerPage,
    indexOfLast
  );
  const getFileTimestamp = () => {
    const now = new Date();

    const date = now.toLocaleDateString("en-CA"); // 2026-06-09

    const time = now.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
    })
      .replace(/:/g, ".")
      .replace(/\s/g, "_");

    return `${date}_at_${time}`;
  };
  const downloadPDF = async () => {

    setIsGeneratingPDF(true);

    try {

      const pdf = new jsPDF("l", "mm", "a4");

      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();

      // ===============================
      // LOGO LOAD
      // ===============================

      const img = new Image();
      img.src = "/Image/img1.png";

      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
      });

      // ===============================
      // HEADER
      // ===============================

      // LOGO LEFT
      pdf.addImage(
        img,
        "PNG",
        10,
        8,
        28,
        28
      );

      // TITLE CENTER
      // TITLE CENTER (NAVY BLUE + BOLD)
      pdf.setFontSize(24);

      pdf.setFont("helvetica", "bold");

      // Navy Blue color
      pdf.setTextColor(0, 38, 77);

      pdf.text(
        "TELECOM WORK STATUS REPORT",
        pageWidth / 2,
        20,
        { align: "center" }
      );

      // reset font (optional)
      pdf.setFont("helvetica", "normal");

      // GENERATED DATE RIGHT
      pdf.setFontSize(12);

      pdf.setTextColor(80);
      // REPORT DATE RIGHT
      pdf.text(
        `${new Date().toLocaleString("en-IN")}`,
        pageWidth - 12,
        25,
        { align: "right" }
      );

      // HEADER BORDER LINE
      pdf.setDrawColor(180);

      pdf.setLineWidth(0.8);

      pdf.line(
        10,
        38,
        pageWidth - 10,
        38
      );

      // ===============================
      // SUMMARY BOX
      // ===============================

      pdf.setDrawColor(180);

      pdf.setFillColor(248, 250, 252);

      pdf.roundedRect(
        10,
        48,
        pageWidth - 20,
        42,
        3,
        3,
        "FD"
      );

      pdf.setFontSize(15);

      pdf.setTextColor(17, 24, 39);

      pdf.text(
        "REPORT SUMMARY",
        15,
        60
      );

      // LEFT SIDE

      pdf.setFontSize(11);

      pdf.text(
        `Month / Year : ${selectedMonthYear || "All"}`,
        15,
        72
      );

      pdf.text(
        `Date of Report : ${new Date().toLocaleDateString("en-IN")}`,
        15,
        82
      );

      // RIGHT SIDE

      pdf.text(
        `Total Jobs Delivered : ${totalJobs}`,
        170,
        82
      );

      // ===============================
      // SUMMARY GROUP (DOMAIN → SUBDOMAIN)
      // ===============================

      const summaryMap = filteredRows.reduce((acc, r) => {
        const domain = r.domain || "Unknown";
        const sub = r.jobType || "-";
        const totalJob = Number(r.jobsDelivered || 0);

        if (!acc[domain]) {
          acc[domain] = { total: 0, subMap: {} };
        }

        acc[domain].total += totalJob;

        if (sub !== "-") {
          acc[domain].subMap[sub] =
            (acc[domain].subMap[sub] || 0) + totalJob;
        }

        return acc;
      }, {});

      const summaryData = Object.entries(summaryMap).map(
        ([domain, value]) => {
          const subText = Object.entries(value.subMap)
            .map(([k, v]) => `${k}: ${v}`)
            .join(", ") || "-";

          return [
            domain,
            subText,
            `${value.total}`
          ];
        }
      );

      // ===============================
      // PDF TABLE
      // ===============================

      autoTable(pdf, {
        startY: 92,
        head: [["Domain", "Sub Domain", "Total job"]],
        body: summaryData,

        theme: "grid",

        styles: {
          fontSize: 9,
          cellPadding: 3,
          halign: "center",
        },

        headStyles: {
          fillColor: [22, 78, 99],
          textColor: 255,
          fontStyle: "bold",
        },

        alternateRowStyles: {
          fillColor: [248, 250, 252],
        },

        margin: {
          left: 5,
          right: 5,
        },
      });

      // ===============================
      // DETAIL TABLE TITLE
      // ===============================

      const finalY = pdf.lastAutoTable.finalY + 12;

      pdf.setFontSize(16);

      pdf.setTextColor(20);

      pdf.text(
        "DETAIL OVERVIEW",
        pageWidth / 2,
        finalY,
        { align: "center" }
      );

      // ===============================
      // MAIN TABLE
      // ===============================

      const tableData = filteredRows.map((r, i) => ([

        i + 1,

        r.month,

        r.year,

        r.jobType
          ? `${r.domain} (${r.jobType})`
          : r.domain,

        r.sow,

        r.region,

        r.county && r.county !== "-"
          ? `${r.state} (${r.county})`
          : r.state,

        r.jobsDelivered || 0,
        formatUOM(r.uom),
      ]));

      autoTable(pdf, {

        startY: finalY + 8,

        theme: "grid",

        head: [[
          "Sl",
          "Month",
          "Year",
          "Domain",
          "SOW",
          "Region",
          "Market",
          "Jobs",
          "UOM"
        ]],

        body: tableData,

        styles: {
          fontSize: 7,
          cellPadding: 2,
          overflow: "linebreak",
          valign: "middle",
          halign: "center",
        },

        headStyles: {
          fillColor: [22, 78, 99],
          textColor: 255,
          fontStyle: "bold",
        },

        alternateRowStyles: {
          fillColor: [248, 250, 252],
        },

        margin: {
          left: 5,
          right: 5,
        },

        didDrawPage: () => {

          pdf.setFontSize(10);

          pdf.setTextColor(120);

          pdf.text(
            `Page ${pdf.internal.getNumberOfPages()}`,
            pageWidth / 2,
            pageHeight - 8,
            { align: "center" }
          );
        }
      });

      // ===============================
      // MAP PAGE
      // ===============================

      const mapElement =
        document.querySelector(".pdf-map");

      if (mapElement) {

        const mapCanvas = await html2canvas(
          mapElement,
          {
            scale: 2,
            backgroundColor: "#ffffff",
          }
        );

        const mapImg =
          mapCanvas.toDataURL("image/png");

        pdf.addPage();

        // MAP PAGE HEADER

        pdf.addImage(
          img,
          "PNG",
          10,
          8,
          28,
          28
        );

        pdf.setFontSize(20);

        pdf.setTextColor(20);

        pdf.text(
          "STATES COVERAGE MAP",
          pageWidth / 2,
          18,
          { align: "center" }
        );

        pdf.setFontSize(10);

        pdf.setTextColor(80);

        pdf.text(
          `Report Date : ${new Date().toLocaleString("en-IN")}`,
          pageWidth - 12,
          25,
          { align: "right" }
        );

        // BORDER LINE
        pdf.setDrawColor(180);

        pdf.setLineWidth(0.8);

        pdf.line(
          10,
          38,
          pageWidth - 10,
          38
        );

        // MAP IMAGE
        pdf.addImage(
          mapImg,
          "PNG",
          15,
          45,
          pageWidth - 30,
          145
        );
      }
      const fileName = `Work_Report_${getFileTimestamp()}.pdf`;
      pdf.save(fileName);

    } catch (err) {

      console.error(err);

    } finally {

      setIsGeneratingPDF(false);
    }
  };

const downloadExcel = async () => {
  if (!filteredRows.length) {
    alert("No data to export.");
    return;
  }

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Work Report");

  // HEADER
  sheet.columns = [
    { header: "Sl.No", key: "sl", width: 8 },
    { header: "Month", key: "month", width: 10 },
    { header: "Year", key: "year", width: 10 },
    { header: "Domain", key: "domain", width: 25 },
    { header: "SOW", key: "sow", width: 20 },
    { header: "Region", key: "region", width: 15 },
    { header: "Market", key: "market", width: 25 },
    { header: "Jobs (Total)", key: "jobs", width: 15 },
    { header: "UOM", key: "uom", width: 30 },
  ];

  // ROWS
  filteredRows.forEach((r, i) => {
    sheet.addRow({
      sl: i + 1,
      month: r.month,
      year: r.year,
      domain: r.jobType ? `${r.domain} (${r.jobType})` : r.domain,
      sow: r.sow,
      region: r.region,
      market:
        r.state === "N/A"
          ? "N/A"
          : r.county && r.county !== "-"
          ? `${r.state} (${r.county})`
          : r.state,
      jobs: r.jobsDelivered || 0,
      uom: formatUOM(r.uom),
    });
  });

  // TOTAL ROW
  const totalJobs = filteredRows.reduce(
    (sum, r) => sum + Number(r.jobsDelivered || 0),
    0
  );

  sheet.addRow({
    domain: "TOTAL",
    jobs: totalJobs,
  });

  // STYLE HEADER
  sheet.getRow(1).eachCell((cell) => {
    cell.font = { bold: true };
    cell.alignment = { vertical: "middle", horizontal: "center" };
  });

  const buffer = await workbook.xlsx.writeBuffer();

  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });

  const url = window.URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = `Work_Report_Detail.xlsx`;
  a.click();

  window.URL.revokeObjectURL(url);
};

  const hasDataForState = (stateName) => {
    return data.some(item => item.state === stateName);
  };
  // CURRENT FILTER DATA
  const currentFilterData = filteredRows;

  // ALL STATES
  const allStates = [
    ...new Set(
      geoData.features.map(
        (f) => f.properties.name
      )
    ),
  ];

  const getStateColor = (stateName) => {
    const totalJobs = currentFilterData
      .filter(item => item.state === stateName)
      .reduce((sum, item) => {
        return sum + Number(item.jobsDelivered || 0);
      }, 0);

    if (totalJobs === 0) {
      return "#FFC491";
    }

    const totals = allStates.map(state => {
      return currentFilterData
        .filter(item => item.state === state)
        .reduce((sum, item) => {
          return sum + Number(item.jobsDelivered || 0);
        }, 0);
    });

    const maxJobs = Math.max(...totals, 1);
    const ratio = totalJobs / maxJobs;

    const colors = [
      "#738F52",
      "#9ACD32",
      "#78BE21",
      "#32CD32",
      "#90EE90",
      "#00FF00",
      "#66FF00",
      "#008000",
      "#006400"
    ];

    const index = Math.min(
      colors.length - 1,
      Math.floor(ratio * colors.length)
    );

    return colors[index];
  };

  const getLabelBgColor = (stateName) => {
    if (hasDataForState(stateName)) {
      return "#14532d";
    }
    return "#991b1b";
  };


  const getLabelTextColor = () => "#ffffff";
  const handleEdit = (row) => {
    setEditingRowId(row.id);

    setEditForm({
      id: row.id,

      domain: row.domain || "",

      jobType: row.jobType || "",

      jobsDelivered: row.jobsDelivered || 0,

      state: row.state || "",

      county: row.county || "",

      region: row.region || "",

      sow: row.sow || "",

      uom: row.uom || {},

      month: row.month || "",

      year: row.year || "",
    });
  };
  const handleChange = (field, value) => {
    setEditForm((prev) => ({
      ...prev,

      // numeric fields fix
      [field]:
        field === "jobsDelivered"
          ? Number(value)
          : value,
    }));
  };
  const handleUOMChange = (key, value) => {

    setEditForm((prev) => ({
      ...prev,

      uom: {
        ...prev.uom,

        [key]: Number(value)
      }
    }));
  };
  return (
    <div className="report-wrapper">
      {!isGeneratingPDF && (
        <>
        <div className="report-header">
          <h2 className="title">Work Report</h2>
          <div className="export-box" ref={exportRef}>
            <button
              className="export-btn"
              onClick={() => setOpenExport(!openExport)}
            >
              Export ⬇
            </button>

            {openExport && (
              <div className="export-dropdown">
                <button onClick={downloadPDF}>Export as PDF</button>
                <button onClick={downloadExcel}>Export as Excel</button>
              </div>
            )}
          </div>
          </div>
        </>
      )}

      <div
        id="pdf-export-area"
        className={`pdf-export-area ${!isGeneratingPDF ? "pdf-hidden" : ""}`}
      >

        <div className="pdf-map">
          <h3 style={{ textAlign: 'center', marginBottom: '15px', color: '#1f2937' }}>
            States Coverage Map
          </h3>
          <ComposableMap
            projection="geoAlbersUsa"
            width={1000}
            height={550}
          >
            <Geographies geography={geoData}>
              {({ geographies, projection }) => (
                <>
                  {geographies.map((geo) => (
                    <Geography
                      key={geo.rsmKey}
                      geography={geo}
                      fill={getStateColor(geo.properties.name)}
                      stroke="#2B2727"
                      strokeWidth={0.8}
                    />
                  ))}
                  {geographies.map((geo) => {
                    const centroid = geoCentroid(geo);
                    const coords = projection(centroid);

                    if (!coords) return null;

                    const [x, y] = coords;
                    const name = geo.properties.name;
                    const shortNames = {
                      Alabama: "AL", Alaska: "AK", Arizona: "AZ", Arkansas: "AR",
                      California: "CA", Colorado: "CO", Connecticut: "CT", Delaware: "DE",
                      Florida: "FL", Georgia: "GA", Hawaii: "HI", Idaho: "ID",
                      Illinois: "IL", Indiana: "IN", Iowa: "IA", Kansas: "KS",
                      Kentucky: "KY", Louisiana: "LA", Maine: "ME", Maryland: "MD",
                      Massachusetts: "MA", Michigan: "MI", Minnesota: "MN", Mississippi: "MS",
                      Missouri: "MO", Montana: "MT", Nebraska: "NE", Nevada: "NV",
                      "New Hampshire": "NH", "New Jersey": "NJ", "New Mexico": "NM", "New York": "NY",
                      "North Carolina": "NC", "North Dakota": "ND", Ohio: "OH", Oklahoma: "OK",
                      Oregon: "OR", Pennsylvania: "PA", "Rhode Island": "RI", "South Carolina": "SC",
                      "South Dakota": "SD", Tennessee: "TN", Texas: "TX", Utah: "UT",
                      Vermont: "VT", Virginia: "VA", Washington: "WA", "West Virginia": "WV",
                      Wisconsin: "WI", Wyoming: "WY", "District of Columbia": "DC"
                    };

                    const label = shortNames[name] || "";

                    return (
                      <g key={`${geo.rsmKey}-label`}>
                        <rect
                          x={x - 12}
                          y={y - 10}
                          width={24}
                          height={16}
                          rx={4}
                          fill={getLabelBgColor(name)}
                          style={{
                            filter: "drop-shadow(0 2px 5px rgba(0,0,0,0.25))"
                          }}
                        />
                        <text
                          x={x}
                          y={y}
                          textAnchor="middle"
                          dominantBaseline="middle"
                          style={{
                            fontSize: "10px",
                            fontWeight: "700",
                            fill: getLabelTextColor(name),
                            pointerEvents: "none"
                          }}
                        >
                          {label}
                        </text>
                      </g>
                    );
                  })}
                </>
              )}
            </Geographies>
          </ComposableMap>
          {/* LEGEND */}
          <div className="map-legend">
            <div className="legend-item">
              <span className="legend-selecteddot"></span>
              <span>
                Covered-{allStates.filter(s => hasDataForState(s)).length}
              </span>
            </div>

            <div className="legend-item">
              <span className="legend-not-selecteddot"></span>
              <span>
                NotCovered-{allStates.length - allStates.filter(s => hasDataForState(s)).length}
              </span>
            </div>
          </div>
        </div>
      </div>

      {!isGeneratingPDF && (
        <>
          <div className="filters">
            <div className="left-filters">
              <div className="filter-group">
                <label>Month & Year</label>
                <select
                  value={selectedMonthYear}
                  onChange={(e) => setSelectedMonthYear(e.target.value)}
                >
                  <option value="">All</option>
                  {uniqueMonthYear.map((m, i) => (
                    <option key={i}>{m}</option>
                  ))}
                </select>
              </div>

              <div className="filter-group">
                <label>Domain</label>
                <select
                  value={selectedDomain}
                  onChange={(e) => setSelectedDomain(e.target.value)}
                >
                  <option value="">All</option>
                  {uniqueDomains.map((d, i) => (
                    <option key={i}>{d}</option>
                  ))}
                </select>
              </div>

              <div className="filter-group">
                <label>Markets</label>
                <select
                  value={selectedState}
                  onChange={(e) => setSelectedState(e.target.value)}
                >
                  <option value="">All</option>
                  {uniqueStates.map((s, i) => (
                    <option
                      key={i}
                      value={s}
                      style={
                        s === "Other"
                          ? {
                            fontWeight: "700",
                            background: "#fff3cd",
                            color: "#b45309",
                          }
                          : {}
                      }
                    >
                      {s}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="right-filters">
              <div className="filter-group">
                <label>From Date</label>
                <input
                  type="date"
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                />
              </div>

              <div className="filter-group">
                <label>To Date</label>
                <input
                  type="date"
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                />
              </div>
            </div>
          </div>
          <div className="table-update-info">
            <p>
              <span className="star-icon">* </span>{" "}
              This table was last updated by{" "}
              <strong>
                {user?.role || "Admin"}
                {user?.domain ? `-${user.domain}` : ""}
              </strong>{" "}
              (<strong>{user?.name || "Unknown User"}</strong>){" "}
              at <strong>{formattedLastUpdated}</strong>
            </p>
          </div>

          <table id="report-table" className="table">
            <thead>
              <tr>
                <th>Sl.No</th>
                <th>Month</th>
                <th>Year</th>
                <th>Domain</th>
                <th>SOW</th>
                <th>Region</th>
                <th>Market Name</th>
                <th>No.of Job Delivered</th>
                <th>Unit of Materials(UOM)</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {currentRows.length > 0 ? (
                currentRows.map((r, i) => (
                  <tr key={r.id}>
                    <td>{(currentPage - 1) * rowsPerPage + i + 1}</td>

                    {/* Month */}
                    <td>
                      {editingRowId === r.id ? (
                        <input
                          value={editForm.month || ""}
                          onChange={(e) => handleChange("month", e.target.value)}
                        />
                      ) : (
                        r.month
                      )}
                    </td>

                    {/* Year */}
                    <td>
                      {editingRowId === r.id ? (
                        <input
                          value={editForm.year || ""}
                          onChange={(e) =>
                            handleChange("year", e.target.value)
                          }
                        />
                      ) : (
                        r.year
                      )}
                    </td>

                    {/* Domain */}
                    <td>
                      {editingRowId === r.id ? (

                        <div
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: "5px"
                          }}
                        >

                          <input
                            value={editForm.domain || ""}
                            onChange={(e) =>
                              handleChange("domain", e.target.value)
                            }
                            placeholder="Domain"
                          />

                          <input
                            value={editForm.jobType || ""}
                            onChange={(e) =>
                              handleChange("jobType", e.target.value)
                            }
                            placeholder="Sub Domain"
                          />

                        </div>

                      ) : (
                        r.jobType
                          ? `${r.domain} (${r.jobType})`
                          : r.domain
                      )}
                    </td>

                    {/* SOW */}
                    <td>
                      {editingRowId === r.id ? (
                        <input
                          value={editForm.sow || ""}
                          onChange={(e) => handleChange("sow", e.target.value)}
                        />
                      ) : (
                        r.sow
                      )}
                    </td>

                    {/* Region */}
                    <td>
                      {editingRowId === r.id ? (
                        <input
                          value={editForm.region || ""}
                          onChange={(e) =>
                            handleChange("region", e.target.value)
                          }
                        />
                      ) : (
                        r.region || "N/A"
                      )}
                    </td>

                    {/* Market */}
                    {/* Market */}
                    <td>
                      {editingRowId === r.id ? (

                        <div
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: "5px"
                          }}
                        >

                          {/* STATE */}
                          <input
                            value={editForm.state || ""}
                            onChange={(e) =>
                              handleChange("state", e.target.value)
                            }
                            placeholder="State"
                          />

                          {/* COUNTY ONLY IF EXISTS */}
                          {editForm.county &&
                            editForm.county !== "-" &&
                            editForm.county !== "Unknown" &&
                            editForm.county !== "Unknown County" && (

                              <input
                                value={editForm.county || ""}
                                onChange={(e) =>
                                  handleChange("county", e.target.value)
                                }
                                placeholder="County"
                              />
                            )}

                        </div>

                      ) : (
                        <>
                          {r.state === "N/A"
                            ? "N/A"
                            : r.county &&
                              r.county !== "-" &&
                              r.county !== "Unknown" &&
                              r.county !== "Unknown County"
                              ? `${r.state} (${r.county})`
                              : r.state}
                        </>
                      )}
                    </td>
                    {/* Jobs */}
                    <td className="job-cell">
                      {editingRowId === r.id ? (
                        <input
                          type="number"
                          value={editForm.jobsDelivered || 0}
                          onChange={(e) => handleChange("jobsDelivered", e.target.value)}
                        />
                      ) : (
                        <div className="job-main">
                          {r.jobsDelivered || 0} Jobs
                        </div>
                      )}
                    </td>

                    {/* UOM */}
                    {/* UOM */}
                    <td>
                      {editingRowId === r.id ? (

                        <div
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: "8px",
                            minWidth: "180px"
                          }}
                        >

                          {Object.entries(editForm.uom || {}).map(([key, value]) => (

                            <div
                              key={key}
                              style={{
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                                gap: "10px"
                              }}
                            >

                              <label
                                style={{
                                  fontWeight: "600",
                                  minWidth: "80px"
                                }}
                              >
                                {key}
                              </label>

                              <input
                                type="number"
                                value={value || 0}
                                onChange={(e) =>
                                  handleUOMChange(key, e.target.value)
                                }
                                style={{
                                  width: "80px",
                                  padding: "5px"
                                }}
                              />

                            </div>
                          ))}

                        </div>

                      ) : (
                        formatUOM(r.uom)
                      )}
                    </td>
                    {/* ACTIONS (ONLY BUTTONS) */}
                    {/* ACTIONS */}
                    <td>
                      {editingRowId === r.id ? (
                        <div className="action-buttons">

                          <button
                            className="cancel-btn"
                            onClick={() => setEditingRowId(null)}
                          >
                            ❌
                          </button>
                          <button className="save-btn" onClick={handleSave}>
                            ✔️
                          </button>

                        </div>
                      ) : (
                        <div className="action-buttons">
                          <button
                            className="edit-btn"
                            onClick={() => handleEdit(r)}
                          >
                            ✏️
                          </button>

                          <button
                            className="delete-btn"
                            onClick={() => handleDelete(r.id)}
                          >
                            🗑️
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="8" className="no-data">
                    ❌ No data found
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          <div className="report-footer">
            <div className="last-update">
              <strong>Total Records:</strong>{filteredRows.length}
              {/* {" | "}
              <strong>Last Updated On:</strong> {formattedLastUpdated} */}
            </div>

            <div className="pagination">
              <button
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(currentPage - 1)}
              >
                Prev
              </button>

              <span>
                Page {currentPage} / {totalPages}
              </span>

              <input
                type="number"
                value={jumpPage}
                placeholder="Page"
                onChange={(e) => {
                  let val = e.target.value;
                  setJumpPage(val);

                  let page = Number(val);

                  if (!page) return;

                  if (page < 1) page = 1;
                  if (page > totalPages) page = totalPages;

                  setCurrentPage(page);
                }}
                className="page-input"
              />

              <button
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage(currentPage + 1)}
              >
                Next
              </button>
            </div>
          </div>
        </>
      )
      }
    </div >
  );
}