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

      const currentMonthVal = editForm.month ? `${editForm.month}-${String(editForm.year).slice(-2)}` : null;

      const payload = {
        months: currentMonthVal ? [currentMonthVal] : undefined,
        month: editForm.month,
        domain: editForm.domain,
        sow: editForm.sow,
        job_type: editForm.jobType,
        region: editForm.region,
        state: editForm.state,
        county: editForm.county,
        uom: parsedUOM,
        job_id: editForm.job_id,
        jobId: editForm.job_id, 
        current_status: editForm.current_status,
        production_engineers: editForm.production_engineers,
        qc_engineers: editForm.qc_engineers,
        otp: editForm.otp,
        internal_qc: editForm.internal_qc,
        amdocs_qc: editForm.amdocs_qc,
        internalQc: editForm.internal_qc,
        amdocsQc: editForm.amdocs_qc,
        internalOtp: editForm.otp,
        jobs_delivered: Number(editForm.jobsDelivered || 0),
        receive_date: editForm.receive_date || null,
        ecd_date: editForm.ecd_date || null,
        submission_date: editForm.submission_date || null,
      };

      const res = await axios.put(
        `http://localhost:5000/api/work/update/${editForm.id}`,
        payload
      );

      if (res.status === 200) {
        alert("✅ Record updated successfully");
        setEditingRowId(null);
        await fetchData();
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
      console.log("res",res);
      
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

  // Fixed formatLocalDateString to show exact database date without timezone shift
  const formatLocalDateString = (dateStr) => {
    if (!dateStr) return "";

    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return "";

    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    
    return `${year}-${day}-${month}`;
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
    if (typeof uom === "string") {
      return uom;
    }
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
    const monthRaw = item.months?.[0] || item.month;

    let month = "-";
    let year = "-";

    if (typeof monthRaw === "string" && monthRaw.trim() !== "") {
      if (monthRaw.includes("-")) {
        const parts = monthRaw.split("-");
        month = parts[0] || "-";
        let rawYear = parts[1] || "-";
        year = rawYear.length === 2 ? `20${rawYear}` : rawYear;
      } else if (monthRaw.includes(" ")) {
        const parts = monthRaw.split(" ");
        month = parts[0] || "-";
        year = parts[1] || "-";
      } else {
        month = monthRaw;
      }
    }

    if ((year === "-" || !year) / dateObj) {
      const fallbackDate = parseDate(dateObj);
      if (fallbackDate) {
        year = fallbackDate.getFullYear().toString();
      }
    }

    const monthYear = `${month !== "-" ? month : ""} ${year !== "-" ? year : ""}`.trim() || "-";

    rows.push({
      id: item.id || item._id,
      monthYear,
      month,
      year,
      domain: item.domain || "-",
      sow: formatArrayOrString(item.sow),
      jobType: formatArrayOrString(item.job_type || item.jobType),

      region:
        item.region &&
        item.region !== "Unknown" &&
        item.region !== "Unknown Region"
          ? item.region
          : "N/A",

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

      job_id: item.job_id || item.jobId || "-",
      current_status: item.current_status || "-",
      production_engineers: formatArrayOrString(item.production_engineers),
      qc_engineers: formatArrayOrString(item.qc_engineers),
      jobsDelivered: Number(item.jobs_delivered ?? item.jobsDelivered) || 0,
      uom: item.uom || {},
      otp: item.otp || item.internalOtp || "-",
      internal_qc: item.internal_qc || item.internalQc || "-",
      amdocs_qc: item.amdocs_qc || item.amdocsQc || "-",
      receive_date: item.receive_date ? formatLocalDateString(item.receive_date) : "",
      ecd_date: item.ecd_date ? formatLocalDateString(item.ecd_date) : "",
      submission_date: item.submission_date ? formatLocalDateString(item.submission_date) : "",

      createdAt: parseDate(item.created_at), 
      lastUpdate: parseDate(dateObj),
      formattedDate: formatDateOnly(dateObj),
    });
  });

  rows.sort((a, b) => {
    const timeA = a.createdAt ? a.createdAt.getTime() : 0;
    const timeB = b.createdAt ? b.createdAt.getTime() : 0;
    return timeA - timeB;
  });

  const uniqueMonthYear = [...new Set(rows.map((r) => `${r.month} ${r.year}`))];
  const uniqueDomains = [...new Set(rows.map((r) => r.domain).filter(Boolean))];

  const uniqueStates = [
    ...new Set(
      rows.map((r) => {
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
    if (a === "Other") return 1;
    if (b === "Other") return -1;
    return a.localeCompare(b);
  });

  const filteredRows = rows.filter((r) => {
    if (selectedMonthYear && `${r.month} ${r.year}` !== selectedMonthYear)
      return false;
    if (selectedDomain && r.domain !== selectedDomain) return false;
    if (selectedState) {
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

  const totalJobs = filteredRows.reduce((sum, r) => {
    return sum + Number(r.jobsDelivered || 0);
  }, 0);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / rowsPerPage));
  const indexOfLast = currentPage * rowsPerPage;
  const currentRows = filteredRows.slice(
    indexOfLast - rowsPerPage,
    indexOfLast
  );

  const getFileTimestamp = () => {
    const now = new Date();
    const date = now.toLocaleDateString("en-CA");
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

      const img = new Image();
      img.src = "/Image/img1.png";

      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
      });

      pdf.addImage(img, "PNG", 10, 8, 28, 28);
      pdf.setFontSize(24);
      pdf.setFont("helvetica", "bold");
      pdf.setTextColor(0, 38, 77);
      pdf.text("TELECOM WORK STATUS REPORT", pageWidth / 2, 20, { align: "center" });

      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(12);
      pdf.setTextColor(80);
      pdf.text(`${new Date().toLocaleString("en-IN")}`, pageWidth - 12, 25, { align: "right" });

      pdf.setDrawColor(180);
      pdf.setLineWidth(0.8);
      pdf.line(10, 38, pageWidth - 10, 38);

      pdf.setFillColor(248, 250, 252);
      pdf.roundedRect(10, 48, pageWidth - 20, 42, 3, 3, "FD");

      pdf.setFontSize(15);
      pdf.setTextColor(17, 24, 39);
      pdf.text("REPORT SUMMARY", 15, 60);

      pdf.setFontSize(11);
      pdf.text(`Month / Year : ${selectedMonthYear || "All"}`, 15, 72);
      pdf.text(`Date of Report : ${new Date().toLocaleDateString("en-IN")}`, 15, 82);
      pdf.text(`Total Jobs Delivered : ${totalJobs}`, 170, 82);

      const summaryMap = filteredRows.reduce((acc, r) => {
        const domain = r.domain || "Unknown";
        const sub = r.jobType || "-";
        const totalJob = Number(r.jobsDelivered || 0);

        if (!acc[domain]) {
          acc[domain] = { total: 0, subMap: {} };
        }
        acc[domain].total += totalJob;

        if (sub !== "-") {
          acc[domain].subMap[sub] = (acc[domain].subMap[sub] || 0) + totalJob;
        }
        return acc;
      }, {});

      const summaryData = Object.entries(summaryMap).map(([domain, value]) => {
        const subText = Object.entries(value.subMap)
          .map(([k, v]) => `${k}: ${v}`)
          .join(", ") || "-";
        return [domain, subText, `${value.total}`];
      });

      autoTable(pdf, {
        startY: 92,
        head: [["Domain", "Sub Domain", "Total job"]],
        body: summaryData,
        theme: "grid",
        styles: { fontSize: 9, cellPadding: 3, halign: "center" },
        headStyles: { fillColor: [22, 78, 99], textColor: 255, fontStyle: "bold" },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        margin: { left: 5, right: 5 },
      });

      const finalY = pdf.lastAutoTable.finalY + 12;
      pdf.setFontSize(16);
      pdf.setTextColor(20);
      pdf.text("DETAIL OVERVIEW", pageWidth / 2, finalY, { align: "center" });

      const tableData = filteredRows.map((r, i) => ([
        i + 1,
        r.month,
        r.year,
        r.domain,
        r.sow,
        r.jobType,
        r.region,
        r.state === "N/A" ? "N/A" : r.county && r.county !== "-" ? `${r.state} (${r.county})` : r.state,
        r.job_id,
        r.current_status,
        r.production_engineers,
        r.qc_engineers,
        r.jobsDelivered || 0,
        formatUOM(r.uom),
        r.otp,
        r.internal_qc,
        r.amdocs_qc,
        r.receive_date || "-",
        r.ecd_date || "-",
        r.submission_date || "-",
      ]));

      autoTable(pdf, {
        startY: finalY + 8,
        theme: "grid",
        head: [["Sl", "Month", "Year", "Domain", "SOW", "Job Type", "Region", "Market", "Job ID", "Status", "Prod Eng", "QC Eng", "Jobs", "UOM", "OTP", "Int QC", "QC", "Receive Date", "ECD Date", "Submission Date"]],
        body: tableData,
        styles: { fontSize: 4.5, cellPadding: 1.5, overflow: "linebreak", valign: "middle", halign: "center" },
        headStyles: { fillColor: [22, 78, 99], textColor: 255, fontStyle: "bold" },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        margin: { left: 5, right: 5 },
        didDrawPage: () => {
          pdf.setFontSize(10);
          pdf.setTextColor(120);
          pdf.text(`Page ${pdf.internal.getNumberOfPages()}`, pageWidth / 2, pageHeight - 8, { align: "center" });
        }
      });

      const mapElement = document.querySelector(".pdf-map");
      if (mapElement) {
        const mapCanvas = await html2canvas(mapElement, { scale: 2, backgroundColor: "#ffffff" });
        const mapImg = mapCanvas.toDataURL("image/png");

        pdf.addPage();
        pdf.addImage(img, "PNG", 10, 8, 28, 28);
        pdf.setFontSize(20);
        pdf.setTextColor(20);
        pdf.text("STATES COVERAGE MAP", pageWidth / 2, 18, { align: "center" });
        pdf.setFontSize(10);
        pdf.setTextColor(80);
        pdf.text(`Report Date : ${new Date().toLocaleString("en-IN")}`, pageWidth - 12, 25, { align: "right" });

        pdf.setDrawColor(180);
        pdf.setLineWidth(0.8);
        pdf.line(10, 38, pageWidth - 10, 38);
        pdf.addImage(mapImg, "PNG", 15, 45, pageWidth - 30, 145);
      }

      pdf.save(`Work_Report_${getFileTimestamp()}.pdf`);
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

    sheet.columns = [
      { header: "Sl.No", key: "sl", width: 8 },
      { header: "Month", key: "month", width: 10 },
      { header: "Year", key: "year", width: 10 },
      { header: "Domain", key: "domain", width: 20 },
      { header: "SOW", key: "sow", width: 15 },
      { header: "Job Type", key: "job_type", width: 15 },
      { header: "Region", key: "region", width: 15 },
      { header: "Market", key: "market", width: 25 },
      { header: "Job ID", key: "job_id", width: 15 },
      { header: "Status", key: "current_status", width: 15 },
      { header: "Prod Engineers", key: "production_engineers", width: 20 },
      { header: "QC Engineers", key: "qc_engineers", width: 20 },
      { header: "Jobs (Total)", key: "jobs", width: 15 },
      { header: "UOM", key: "uom", width: 25 },
      { header: "OTP", key: "otp", width: 15 },
      { header: "Internal QC", key: "internal_qc", width: 15 },
      { header: "Amdocs QC", key: "amdocs_qc", width: 15 },
      { header: "Receive Date", key: "receive_date", width: 15 },
      { header: "ECD Date", key: "ecd_date", width: 15 },
      { header: "Submission Date", key: "submission_date", width: 15 },
    ];

    filteredRows.forEach((r, i) => {
      sheet.addRow({
        sl: i + 1,
        month: r.month,
        year: r.year,
        domain: r.domain,
        sow: r.sow,
        job_type: r.jobType,
        region: r.region,
        market: r.state === "N/A" ? "N/A" : r.county && r.county !== "-" ? `${r.state} (${r.county})` : r.state,
        job_id: r.job_id,
        current_status: r.current_status,
        production_engineers: r.production_engineers,
        qc_engineers: r.qc_engineers,
        jobs: r.jobsDelivered || 0,
        uom: formatUOM(r.uom),
        otp: r.otp,
        internal_qc: r.internal_qc,
        amdocs_qc: r.amdocs_qc,
        receive_date: r.receive_date || "",
        ecd_date: r.ecd_date || "",
        submission_date: r.submission_date || "",
      });
    });

    sheet.addRow({ domain: "TOTAL", jobs: totalJobs });

    sheet.getRow(1).eachCell((cell) => {
      cell.font = { bold: true };
      cell.alignment = { vertical: "middle", horizontal: "center" };
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
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
  const currentFilterData = filteredRows;

  const allStates = [...new Set(geoData.features.map((f) => f.properties.name))];

  const getStateColor = (stateName) => {
    const totalJobs = currentFilterData
      .filter(item => item.state === stateName)
      .reduce((sum, item) => sum + Number(item.jobsDelivered || 0), 0);

    if (totalJobs === 0) return "#FFC491";

    const totals = allStates.map(state => {
      return currentFilterData
        .filter(item => item.state === state)
        .reduce((sum, item) => sum + Number(item.jobsDelivered || 0), 0);
    });

    const maxJobs = Math.max(...totals, 1);
    const ratio = totalJobs / maxJobs;

    const colors = [
      "#738F52", "#9ACD32", "#78BE21", "#32CD32",
      "#90EE90", "#00FF00", "#66FF00", "#008000", "#006400"
    ];

    const index = Math.min(colors.length - 1, Math.floor(ratio * colors.length));
    return colors[index];
  };

  const getLabelBgColor = (stateName) => {
    if (hasDataForState(stateName)) return "#14532d";
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
      job_id: row.job_id || "",
      current_status: row.current_status || "",
      production_engineers: row.production_engineers || "",
      qc_engineers: row.qc_engineers || "",
      otp: row.otp || "",
      internal_qc: row.internal_qc || "",
      amdocs_qc: row.amdocs_qc || "",
      receive_date: row.receive_date ? formatLocalDateString(row.receive_date) : "",
      ecd_date: row.ecd_date ? formatLocalDateString(row.ecd_date) : "",
      submission_date: row.submission_date ? formatLocalDateString(row.submission_date) : "",
      month: row.month || "",
      year: row.year || "",
    });
  };

  const handleChange = (field, value) => {
    setEditForm((prev) => ({
      ...prev,
      [field]: field === "jobsDelivered" ? Number(value) : value,
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
      )}

      <div
        id="pdf-export-area"
        className={`pdf-export-area ${!isGeneratingPDF ? "pdf-hidden" : ""}`}
      >
        <div className="pdf-map">
          <h3 style={{ textAlign: 'center', marginBottom: '15px', color: '#1f2937' }}>
            States Coverage Map
          </h3>
          <ComposableMap projection="geoAlbersUsa" width={1000} height={550}>
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
                          style={{ filter: "drop-shadow(0 2px 5px rgba(0,0,0,0.25))" }}
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
          <div className="map-legend">
            <div className="legend-item">
              <span className="legend-selecteddot"></span>
              <span>Covered-{allStates.filter(s => hasDataForState(s)).length}</span>
            </div>
            <div className="legend-item">
              <span className="legend-not-selecteddot"></span>
              <span>NotCovered-{allStates.length - allStates.filter(s => hasDataForState(s)).length}</span>
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
                          ? { fontWeight: "700", background: "#fff3cd", color: "#b45309" }
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

          <div className="table-responsive-container">
            <table id="report-table" className="table">
              <thead>
                <tr>
                  <th>Sl.No</th>
                  <th>Month & Year</th>
                  <th>Domain</th>
                  <th>SOW</th>
                  <th>Job Type</th>
                  <th>Region</th>
                  <th>Market Name</th>
                  <th>Job ID</th>
                  <th>Current Status</th>
                  <th>Production Engineers</th>
                  <th>QC Engineers</th>
                  <th>Jobs Delivered</th>
                  <th>UOM</th>
                  <th>OTP</th>
                  <th>Internal QC</th>
                  <th>Amdocs QC</th>
                  <th>Receive Date</th>
                  <th>ECD Date</th>
                  <th>Submission Date</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {currentRows.length > 0 ? (
                  currentRows.map((r, i) => {
                    const isMissingOtpOrAmdocs = !r.otp || r.otp === "-" || !r.amdocs_qc || r.amdocs_qc === "-";
                    return (
                      <tr key={r.id} className={isMissingOtpOrAmdocs ? "light-orange-row" : ""}>
                        <td>{(currentPage - 1) * rowsPerPage + i + 1}</td>

                        <td>
                          {editingRowId === r.id ? (
                            <input
                              value={editForm.month || ""}
                              onChange={(e) => handleChange("month", e.target.value)}
                              style={{ width: "50px" }}
                            />
                          ) : (
                            r.month
                          )}
                        </td>

                        <td>
                          {editingRowId === r.id ? (
                            <input
                              value={editForm.domain || ""}
                              onChange={(e) => handleChange("domain", e.target.value)}
                            />
                          ) : (
                            r.domain
                          )}
                        </td>

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

                        <td>
                          {editingRowId === r.id ? (
                            <input
                              value={editForm.jobType || ""}
                              onChange={(e) => handleChange("jobType", e.target.value)}
                            />
                          ) : (
                            r.jobType
                          )}
                        </td>

                        <td>
                          {editingRowId === r.id ? (
                            <input
                              value={editForm.region || ""}
                              onChange={(e) => handleChange("region", e.target.value)}
                            />
                          ) : (
                            r.region || "N/A"
                          )}
                        </td>

                        <td>
                          {editingRowId === r.id ? (
                            <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
                              <input
                                value={editForm.state || ""}
                                onChange={(e) => handleChange("state", e.target.value)}
                                placeholder="State"
                              />
                              <input
                                value={editForm.county || ""}
                                onChange={(e) => handleChange("county", e.target.value)}
                                placeholder="County"
                              />
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

                        <td>
                          {editingRowId === r.id ? (
                            <input
                              value={editForm.job_id || ""}
                              onChange={(e) => handleChange("job_id", e.target.value)}
                            />
                          ) : (
                            r.job_id
                          )}
                        </td>

                        <td>
                          {editingRowId === r.id ? (
                            <input
                              value={editForm.current_status || ""}
                              onChange={(e) => handleChange("current_status", e.target.value)}
                            />
                          ) : (
                            r.current_status
                          )}
                        </td>

                        <td>
                          {editingRowId === r.id ? (
                            <input
                              value={editForm.production_engineers || ""}
                              onChange={(e) => handleChange("production_engineers", e.target.value)}
                            />
                          ) : (
                            r.production_engineers
                          )}
                        </td>

                        <td>
                          {editingRowId === r.id ? (
                            <input
                              value={editForm.qc_engineers || ""}
                              onChange={(e) => handleChange("qc_engineers", e.target.value)}
                            />
                          ) : (
                            r.qc_engineers
                          )}
                        </td>

                        <td className="job-cell">
                          {editingRowId === r.id ? (
                            <input
                              type="number"
                              value={editForm.jobsDelivered || 0}
                              onChange={(e) => handleChange("jobsDelivered", e.target.value)}
                              style={{ width: "60px" }}
                            />
                          ) : (
                            <div className="job-main">
                              {r.jobsDelivered || 0}
                            </div>
                          )}
                        </td>

                        <td>
                          {editingRowId === r.id ? (
                            <div style={{ display: "flex", flexDirection: "column", gap: "5px", minWidth: "140px" }}>
                              {Object.entries(editForm.uom || {}).map(([key, value]) => (
                                <div key={key} style={{ display: "flex", justifyContent: "space-between", gap: "5px" }}>
                                  <span style={{ fontSize: "11px" }}>{key}:</span>
                                  <input
                                    type="number"
                                    value={value || 0}
                                    onChange={(e) => handleUOMChange(key, e.target.value)}
                                    style={{ width: "50px" }}
                                  />
                                </div>
                              ))}
                            </div>
                          ) : (
                            formatUOM(r.uom)
                          )}
                        </td>

                        <td>
                          {editingRowId === r.id ? (
                            <input
                              value={editForm.otp || ""}
                              onChange={(e) => handleChange("otp", e.target.value)}
                              style={{ width: "60px" }}
                            />
                          ) : (
                            r.otp
                          )}
                        </td>

                        <td>
                          {editingRowId === r.id ? (
                            <input
                              value={editForm.internal_qc || ""}
                              onChange={(e) => handleChange("internal_qc", e.target.value)}
                              style={{ width: "60px" }}
                            />
                          ) : (
                            r.internal_qc
                          )}
                        </td>

                        <td>
                          {editingRowId === r.id ? (
                            <input
                              value={editForm.amdocs_qc || ""}
                              onChange={(e) => handleChange("amdocs_qc", e.target.value)}
                              style={{ width: "60px" }}
                            />
                          ) : (
                            r.amdocs_qc
                          )}
                        </td>

                        <td>
                          {editingRowId === r.id ? (
                            <input
                              type="date"
                              value={editForm.receive_date || ""}
                              onChange={(e) => handleChange("receive_date", e.target.value)}
                            />
                          ) : (
                            r.receive_date || "-"
                          )}
                        </td>

                        <td>
                          {editingRowId === r.id ? (
                            <input
                              type="date"
                              value={editForm.ecd_date || ""}
                              onChange={(e) => handleChange("ecd_date", e.target.value)}
                            />
                          ) : (
                            r.ecd_date || "-"
                          )}
                        </td>

                        <td>
                          {editingRowId === r.id ? (
                            <input
                              type="date"
                              value={editForm.submission_date || ""}
                              onChange={(e) => handleChange("submission_date", e.target.value)}
                            />
                          ) : (
                            r.submission_date || "-"
                          )}
                        </td>

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
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan="21" className="no-data">
                      ❌ No data found
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="report-footer">
            <div className="last-update">
              <strong>Total Records:</strong> {filteredRows.length}
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
      )}
    </div>
  );
}
