import React, { useState, useRef, useEffect, useCallback } from "react";
import { useOutletContext } from "react-router-dom";
import { ComposableMap, Geographies, Geography } from "react-simple-maps";
import { geoCentroid } from "d3-geo";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, CartesianGrid
} from "recharts";
import { FaTachometerAlt, FaUpload, FaChartBar, FaUsers, FaSitemap, FaPlusCircle, FaClock, FaHistory, FaLayerGroup } from "react-icons/fa";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import geoData from "../us-states.json";
import "../style/telecom.css";
import WorkUpdate from "./WorkUpdate";
import JobCreation from "./JobCreation";
import Report from "./Report";
import Reports from "../components/Report.jsx";
import UserManagement from "./UserManagement";
import Organogram from "./Organogram";
import TimesheetManagement from "../Pages/TimesheetManagement";
import MasterDomainCreation from "../Pages/MasterDomainCreation";
import JobHistory from "../Pages/JobHistory";
import axios from "axios";

export default function TelecomMap() {
  const [selectedKpiDomain, setSelectedKpiDomain] = useState(null);
  const [showKpiModal, setShowKpiModal] = useState(false);

  const handleKpiReport = (domain) => {
    setSelectedKpiDomain(domain);
    setShowKpiModal(true);
  };

  const handleStateHover = useCallback((stateName, evt) => {
    setTooltip({
      visible: true,
      x: evt.clientX,
      y: evt.clientY,
      data: { state: stateName },
    });
  }, []);

  const monthsList = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
  ];
  const currentYear = new Date().getFullYear();

  const [selectedMonth, setSelectedMonth] = useState(null);
  const [activePage, setActivePage] = useState("dashboard");
  const [selectedRegion, setSelectedRegion] = useState("All Region");
  const [selectedFilterStates, setSelectedFilterStates] = useState([]);
  const [selectedDomains, setSelectedDomains] = useState([]);
  const [search, setSearch] = useState("");
  const [showExport, setShowExport] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [allWorkData, setAllWorkData] = useState([]);
  const [currentFilterData, setCurrentFilterData] = useState([]);
  const [domains, setDomains] = useState([]);

  const [tooltip, setTooltip] = useState({
    visible: false,
    x: 0,
    y: 0,
    data: null,
  });

  const exportRef = useRef();
  const hasDataForState = (stateName) => {
    return currentFilterData.some(item => item.state === stateName);
  };

  const allStates = geoData.features.map((f) => f.properties.name);
  const coveredCount = allStates.filter(hasDataForState).length;
  const notCoveredCount = allStates.length - coveredCount;
  const regions = ["All Region", "Northeast", "Southeast", "Midwest", "Southwest", "West"];

  const regionStateMap = {
    Northeast: ["Maine", "New Hampshire", "Vermont", "Massachusetts", "Rhode Island", "Connecticut", "New York", "New Jersey", "Pennsylvania"],
    Southeast: ["Delaware", "Maryland", "Virginia", "West Virginia", "North Carolina", "South Carolina", "Georgia", "Florida", "Alabama", "Mississippi", "Tennessee", "Arkansas", "Kentucky", "Louisiana"],
    Midwest: ["Ohio", "Michigan", "Indiana", "Illinois", "Wisconsin", "Minnesota", "Iowa", "Missouri", "North Dakota", "South Dakota", "Nebraska", "Kansas"],
    Southwest: ["Texas", "Oklahoma", "New Mexico", "Arizona"],
    West: ["Colorado", "Wyoming", "Montana", "Idaho", "Utah", "Nevada", "California", "Oregon", "Washington", "Alaska", "Hawaii"]
  };
  const filteredStates =
    selectedRegion === "All Region"
      ? allStates
      : regionStateMap[selectedRegion] || [];

  const getRegionByState = (stateName) => {
    return Object.keys(regionStateMap).find(region =>
      regionStateMap[region].includes(stateName)
    );
  };
  const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4"];
  const [selectedSubDomains, setSelectedSubDomains] = useState([]);
  const [hiddenDomains, setHiddenDomains] = useState([]);
  const subDomainsMap = {
    ASE: ["Placement", "Activation"],
    F2: ["Aramis", "IQGEO"]
  };

  const domainColors = {
    ASE: "#3b82f6",
    F2: "#10b981",
    TCP: "#f59e0b",
    PERMIT: "#ef4444",
    LUMEN: "#8b5cf6",
    PLA: "#06b6d4",
    JPA: "#f97316",
  };
  const [role, setRole] = useState(null);
  const { menuOpen, setMenuOpen } = useOutletContext();
  useEffect(() => {
    const user = JSON.parse(localStorage.getItem("user"));
    setRole(user?.role);
  }, []);
  useEffect(() => {
    let filtered = allWorkData;

    if (selectedDomains.length > 0) {
      filtered = filtered.filter(item => selectedDomains.includes(item.domain));
    }

    if (selectedSubDomains.length > 0) {
      filtered = filtered.filter(item => selectedSubDomains.includes(item.subDomain));
    }

    if (selectedFilterStates.length > 0) {
      filtered = filtered.filter(item => selectedFilterStates.includes(item.state));
    }

    if (selectedMonth?.month) {
      filtered = filtered.filter(item =>
        item?.months?.some(m => {
          if (!m) return false;
          const [month, year] = m.split("-");
          const fullYear = Number(`20${year}`);
          return (
            month === selectedMonth.month &&
            fullYear === selectedMonth.year
          );
        })
      );
    }
    setCurrentFilterData(filtered);
  }, [
    selectedDomains,
    selectedSubDomains,
    selectedFilterStates,
    selectedMonth,
    allWorkData,
    currentYear
  ]);

  const toggleFilter = (id, setter) => {
    setter(prev =>
      prev.includes(id)
        ? prev.filter(item => item !== id)
        : [...prev, id]
    );
  };

  useEffect(() => {
    const handleFocus = () => {
      fetchAllData();
    };
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        fetchAllData();
      }
    };
    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibility);
       };
  }, []);
 
  const [expandedDomains, setExpandedDomains] = useState({});

  const toggleExpand = (d) => {
    setExpandedDomains(prev => ({
      ...prev,
      [d]: !prev[d]
    }));
  };

  const fetchAllData = async () => {
    try {
      const workRes = await axios.get("http://localhost:5000/api/work/all");
      setAllWorkData(workRes.data);
      setCurrentFilterData(workRes.data);
      const masterRes = await axios.get("http://localhost:5000/api/master");
      const data = masterRes.data;
      const domainList = Object.keys(data);
      setDomains(domainList);
    } catch (err) {
      console.error(err);
    }
  };
  useEffect(() => {
    fetchAllData();
  }, []);

  const getStateColor = (stateName) => {
    const totalJobs = currentFilterData
      .filter(item => item.state === stateName)
      .reduce((sum, item) => {
        return sum + Number(item.jobsDelivered || 0);
      }, 0);
    if (totalJobs === 0) return "#FFC491";
    const totals = allStates.map(state => {
      return currentFilterData
        .filter(item => item.state === state)
        .reduce((sum, item) => {
          return sum + Number(item.jobsDelivered || 0);
        }, 0);
    });
    const maxJobs = Math.max(...totals, 1);
    const ratio = totalJobs / maxJobs;
    const colors = ["#738F52", "#9ACD32", "#78BE21", "#32CD32", "#90EE90", "#00FF00", "#66FF00", "#008000", "#006400"];
    const index = Math.min(colors.length - 1, Math.floor(ratio * colors.length));
    return colors[index];
  };

  const getLabelBgColor = (stateName) => hasDataForState(stateName) ? "#15803d" : "#dc2626";
  const getLabelTextColor = () => "#ffffff";

  const [mapReportData, setMapReportData] = useState({});
  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await fetch("http://localhost:5000/api/work/state-wise-jobs");
        const data = await res.json();
        setMapReportData(data);
        localStorage.setItem("workReport", JSON.stringify(data));
      } catch (err) {
        console.error(err);
      }
    };
    fetchData();
  }, []);

  const toggleFilterState = (state) => {
    setSelectedFilterStates(prev =>
      prev.includes(state)
        ? prev.filter((s) => s !== state)
        : [...prev, state]
    );
  };
  const getShortStateName = (stateName) => {
    const shortNames = {
      'Alabama': 'AL', 'Alaska': 'AK', 'Arizona': 'AZ', 'Arkansas': 'AR',
      'California': 'CA', 'Colorado': 'CO', 'Connecticut': 'CT', 'Delaware': 'DE',
      'Florida': 'FL', 'Georgia': 'GA', 'Hawaii': 'HI', 'Idaho': 'ID',
      'Illinois': 'IL', 'Indiana': 'IN', 'Iowa': 'IA', 'Kansas': 'KS',
      'Kentucky': 'KY', 'Louisiana': 'LA', 'Maine': 'ME', 'Maryland': 'MD',
      'Massachusetts': 'MA', 'Michigan': 'MI', 'Minnesota': 'MN', 'Mississippi': 'MS',
      'Missouri': 'MO', 'Montana': 'MT', 'Nebraska': 'NE', 'Nevada': 'NV',
      'New Hampshire': 'NH', 'New Jersey': 'NJ', 'New Mexico': 'NM', 'New York': 'NY',
      'North Carolina': 'NC', 'North Dakota': 'ND', 'Ohio': 'OH', 'Oklahoma': 'OK',
      'Oregon': 'OR', 'Pennsylvania': 'PA', 'Rhode Island': 'RI', 'South Carolina': 'SC',
      'South Dakota': 'SD', 'Tennessee': 'TN', 'Texas': 'TX', 'Utah': 'UT',
      'Vermont': 'VT', 'Virginia': 'VA', 'Washington': 'WA', 'West Virginia': 'WV',
      'Wisconsin': 'WI', 'Wyoming': 'WY', 'District of Columbia': 'DC'
    };
    return shortNames[stateName] || stateName.substring(0, 2).toUpperCase();
  };
  const captureAndExport = async (type) => {
    try {
      setIsExporting(true);
      setShowExport(false);
      await new Promise((res) => setTimeout(res, 200));
      const original = exportRef.current;
      if (!original) return;
      const clone = original.cloneNode(true);
      const isMobile = window.innerWidth <= 768;
      const isTablet = window.innerWidth > 768 && window.innerWidth <= 1024;
      if (isMobile) {
        clone.style.width = "890px";
      } else if (isTablet) {
        clone.style.width = "968px";
      } else {
        clone.style.width = "1100px";
      }
      clone.style.position = "absolute";
      clone.style.top = "-9999px";
      clone.style.left = "-9999px";
      clone.style.background = "#fff";
      const mapTitle = clone.querySelector(".mapTitleContainer");

      if (mapTitle) {
        mapTitle.style.fontSize = "36px";      
        mapTitle.style.fontWeight = "700";
        mapTitle.style.textAlign = "center";
        mapTitle.style.padding = "15px 0";
        mapTitle.style.letterSpacing = "1px";
        mapTitle.style.textTransform = "uppercase";
        mapTitle.style.lineHeight = "1.3";
      }

      const logoBox = clone.querySelector(".mapLogo");
      const logo = clone.querySelector(".mapLogo img");

      if (logoBox && logo) {

        if (isMobile) {
          logoBox.style.display = "flex";
          logoBox.style.justifyContent = "flex-end"; 
          logoBox.style.width = "100%";
          logo.style.width = "120px";
          logo.style.height = "auto";
          logo.style.position = "relative";
          logo.style.left = "0";
          logo.style.top = "-90px";
        } else {
          logo.style.width = "130px";
          logo.style.height = "auto";
          logo.style.position = "relative";
          logo.style.left = "-120px";
          logo.style.top = "-90px";
        }
      }
      const Legend = clone.querySelector(".mapLegend");
      if (Legend) {
        Legend.style.fontSize = "16px"; 
        Legend.style.fontWeight = "700";
        Legend.style.marginLeft = "90px";
      }
      const compass = clone.querySelector(".resized-image");
      if (compass) {
        if (isMobile) {
          compass.style.width = "140px";
          compass.style.marginTop = "-10px";   
          compass.style.marginLeft = "10px";   
        } else {
          compass.style.width = "120px";
          compass.style.height = "auto";
          compass.style.marginTop = "40px";
        }
      }
      const exportBtn = clone.querySelector(".export");
      if (exportBtn) exportBtn.remove();
      document.body.appendChild(clone);
      const canvas = await html2canvas(clone, {
        scale: 2,
        useCORS: true,
        backgroundColor: "#fff",
      });
      document.body.removeChild(clone);
      const imgData = canvas.toDataURL("image/png");
      if (type === "pdf") {
        const pdf = new jsPDF("landscape", "mm", "a4");
        const pageWidth = pdf.internal.pageSize.getWidth();
        const pageHeight = pdf.internal.pageSize.getHeight();
        const ratio = Math.min(
          (pageWidth - 10) / canvas.width,
          (pageHeight - 10) / canvas.height
        );
        const finalWidth = canvas.width * ratio;
        const finalHeight = canvas.height * ratio;
        const x = (pageWidth - finalWidth) / 2;
        const y = (pageHeight - finalHeight) / 2;
        pdf.addImage(imgData, "PNG", x, y, finalWidth, finalHeight);
        pdf.save(`USA Map ${getFileNameDateTime()}.pdf`);

      } else {
        const link = document.createElement("a");
        link.href = imgData;
        link.download = `USA Map ${getFileNameDateTime()}.${type}`;
        link.click();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsExporting(false);
    }
  };
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const monthlyJobsMap = {};
  currentFilterData.forEach((item) => {
    const totalJobs = Number(item.jobsDelivered || 0);
    item.months?.forEach((m) => {
      if (!m) return;
      const [month, year] = m.split("-");
      const fullYear = Number(`20${year}`);
      if (!monthlyJobsMap[month]) monthlyJobsMap[month] = {};
      if (!monthlyJobsMap[month][fullYear]) monthlyJobsMap[month][fullYear] = 0;
      monthlyJobsMap[month][fullYear] += totalJobs;
    });
  });
  const monthlyJobsSorted = monthNames.map((month) => ({ name: month, ...(monthlyJobsMap[month] || {}) }));
  const domainPieDataMap = {};
  currentFilterData.forEach((item) => {
    const domain = (item.domain || "").toString().trim().toUpperCase();
    const jobs = Number(item.jobsDelivered || 0);
    if (!domain) return;
    if (!domainPieDataMap[domain]) domainPieDataMap[domain] = 0;
    domainPieDataMap[domain] += jobs;
  });
  const grandTotal = Object.values(domainPieDataMap).reduce((sum, val) => sum + val, 0);
  const pieChartData = Object.keys(domainPieDataMap)
    .filter((domain) => domainPieDataMap[domain] > 0 && !hiddenDomains.includes(domain))
    .map((domain) => ({
      name: domain,
      jobs: domainPieDataMap[domain],
      value: grandTotal ? Number(((domainPieDataMap[domain] / grandTotal) * 100).toFixed(2)) : 0
    }));

  const normalize = (d) => (d || "").toString().trim().toUpperCase();
  const masterDomains = (domains || []).map(normalize);
  const workDomains = allWorkData.map(x => normalize(x.domain));
  const mergedDomains = [...new Set([...masterDomains, ...workDomains])];
  const sortedDomainStats = mergedDomains.map(domain => ({
    domain,
    jobs: allWorkData.filter(x => normalize(x.domain) === domain).reduce((sum, x) => sum + Number(x.jobsDelivered || 0), 0)
  }));
  const allYears = [...new Set(monthlyJobsSorted.flatMap(item => Object.keys(item).filter(key => key !== "name")))].sort();
  const getDomainJobs = (domain) => currentFilterData.filter((x) => x.domain === domain).reduce((sum, x) => sum + Number(x.jobsDelivered || 0), 0);
  const getFileNameDateTime = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    let hours = now.getHours();
    const minutes = String(now.getMinutes()).padStart(2, "0");
    const seconds = String(now.getSeconds()).padStart(2, "0");
    const ampm = hours >= 12 ? "PM" : "AM";
    hours = hours % 12 || 12;
    hours = String(hours).padStart(2, "0");
    return `${year}-${month}-${day} at ${hours}.${minutes}.${seconds} ${ampm}`;
  };

  return (
    <div className="page">
      <div className={`topMenu ${menuOpen ? "expanded" : "collapsed"}`}>
        <button className={`menuBtn ${activePage === "dashboard" ? "active" : ""}`} onClick={() => { setActivePage("dashboard"); if (window.innerWidth <= 1100) setMenuOpen(false); }}><FaTachometerAlt className="menuIcon" />{menuOpen && "Dashboard"}</button>

        <button className={`menuBtn ${activePage === "workupdate" ? "active" : ""}`} onClick={() => { setActivePage("workupdate"); if (window.innerWidth <= 1100) setMenuOpen(false); }}><FaUpload className="menuIcon" />{menuOpen && "Data Upload"}</button>

        <button className={`menuBtn ${activePage === "report" ? "active" : ""}`} onClick={() => { setActivePage("report"); if (window.innerWidth <= 1100) setMenuOpen(false); }}><FaChartBar className="menuIcon" />{menuOpen && "Report"}</button>

        {role === "Admin" && <button className={`menuBtn ${activePage === "user-management" ? "active" : ""}`} onClick={() => { setActivePage("user-management"); if (window.innerWidth <= 1100) setMenuOpen(false); }}><FaUsers className="menuIcon" />{menuOpen && "User Management"}</button>}

        {(role === "Admin" || role === "TeamLead") && <button className={`menuBtn ${activePage === "organogram" ? "active" : ""}`} onClick={() => { setActivePage("organogram"); if (window.innerWidth <= 1100) setMenuOpen(false); }}><FaSitemap className="menuIcon" />{menuOpen && "Organogram"}</button>}

        {role === "MIS" && <button className={`menuBtn ${activePage === "jobcreation" ? "active" : ""}`} onClick={() => { setActivePage("jobcreation"); if (window.innerWidth <= 1100) setMenuOpen(false); }}><FaPlusCircle className="menuIcon" />{menuOpen && "Job Creation"}</button>}

        {(role === "Admin" || role === "TeamLead") && <button className={`menuBtn ${activePage === "workstatus" ? "active" : ""}`} onClick={() => { setActivePage("workstatus"); if (window.innerWidth <= 1100) setMenuOpen(false); }}><FaClock className="menuIcon" />{menuOpen && "Timesheet / Work Status"}</button>}

        {role === "MIS" && <button className={`menuBtn ${activePage === "jobhistory" ? "active" : ""}`} onClick={() => { setActivePage("jobhistory"); if (window.innerWidth <= 1100) setMenuOpen(false); }}><FaHistory className="menuIcon" />{menuOpen && "Job History"}</button>}

        {role === "MIS" && <button className={`menuBtn ${activePage === "domaincreation" ? "active" : ""}`} onClick={() => { setActivePage("domaincreation"); if (window.innerWidth <= 1100) setMenuOpen(false); }}><FaLayerGroup className="menuIcon" />{menuOpen && "Domain Creation"}</button>}
      </div>

      {/* Main Content Area Side Canvas Container */}
      <div className="mainContentContainer">
        <div className="menu-icon-container">
          <div
            className={`menu-icon ${menuOpen ? "" : "active"}`}
            onClick={() => setMenuOpen(!menuOpen)}
          >
            <span className="bar1"></span>
            <span className="bar2"></span>
            <span className="bar3"></span>
          </div>
        </div>
        {activePage === "dashboard" && (
          <>
            <div className="kpiContainer">
              <h2 className="kpiTitle">📊 KPI - Job Delivery Summary</h2>
              <div className="kpiGridModern">
                {sortedDomainStats.map((item) => {
                  const color = domainColors[item.domain] || "#6366f1";
                  return (
                    <div key={item.domain} className="kpiCardModern" style={{ "--themeColor": color }}>
                      <button type="button" className="kpiEyeBtnLeft" onClick={(e) => { e.stopPropagation(); handleKpiReport(item.domain); }} style={{ background: `${color}15`, border: `1px solid ${color}70`, color: color }}>𝑖</button>
                      <div className="kpiContent">
                        <div className="kpiDomainModern">{item.domain}</div>
                        <div className="kpiSubModern">
                          {(() => {
                            const domainData = currentFilterData.filter(x => x.domain === item.domain);
                            const uomTotals = {};
                            domainData.forEach((x) => {
                              let uom = x.uom || {};
                              if (typeof uom === "string") { try { uom = JSON.parse(uom); } catch { uom = {}; } }
                              if (typeof uom === "object" && !Array.isArray(uom)) {
                                Object.entries(uom).forEach(([key, value]) => {
                                  let displayKey = key;
                                  if (item.domain === "MRE") displayKey = "Total Poles";
                                  else if (item.domain === "PLA") displayKey = "Total Wolp";
                                  else if (item.domain === "TCP") displayKey = "Total Plans";
                                  else if (item.domain === "JPA") displayKey = "JPA Count";
                                  uomTotals[displayKey] = (uomTotals[displayKey] || 0) + Number(value || 0);
                                });
                              }
                            });
                            return [...Object.entries(uomTotals).map(([key, value]) => `${key}: ${value}`)].filter(Boolean).join(" | ");
                          })()}
                        </div>
                        <div className="kpiValueModern">{getDomainJobs(item.domain)}<span> Jobs</span></div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="container">
              <div className="mapContainer" ref={exportRef}>
                <div className="mapTitleContainer">Optical Fiber Network Coverage Map</div>
                <div className="mapTopBar">
                  <img src="https://upload.wikimedia.org/wikipedia/commons/1/1a/Brosen_windrose.svg" alt="Compass" className="resized-image" />
                </div>
                <div className="export" style={{ display: isExporting ? "none" : "block" }}>
                  <button onClick={() => setShowExport(!showExport)}>Export ⬇</button>
                  {showExport && (
                    <div className="dropdown">
                      <div onClick={() => captureAndExport("png")}>PNG</div>
                      <div onClick={() => captureAndExport("jpeg")}>JPG</div>
                      <div onClick={() => captureAndExport("pdf")}>PDF</div>
                    </div>
                  )}
                </div>
                <div className="mapBox">
                  <ComposableMap projection="geoAlbersUsa" width={1000} height={600} style={{ width: "100%", height: "100%" }}>
                    <Geographies geography={geoData}>
                      {({ geographies, projection }) => (
                        <>
                          {geographies.map((geo) => {
                            const name = geo.properties.name;
                            return (
                              <Geography key={geo.rsmKey} geography={geo} fill={getStateColor(name)} stroke="#2B2727" strokeWidth={0.8} style={{ default: { outline: "none" }, hover: { outline: "none", stroke: "#64748b", strokeWidth: 1.5 }, pressed: { outline: "none" } }} onMouseEnter={(evt) => handleStateHover(name, evt)} onMouseMove={(evt) => setTooltip((prev) => ({ ...prev, x: evt.clientX, y: evt.clientY }))} onMouseLeave={() => setTooltip({ visible: false, x: 0, y: 0, data: null })} />
                            );
                          })}
                          {geographies.map((geo) => {
                            const name = geo.properties.name;
                            const shortName = getShortStateName(name);
                            const centroid = geoCentroid(geo);
                            const projected = projection(centroid);
                            if (!projected) return null;
                            let [x, y] = projected;
                            const offsets = { "DC": [10, 0], "RI": [12, 0], "DE": [10, 0], "NJ": [10, 0], "CT": [10, 0], "MD": [10, 0], "MA": [10, 0], "VT": [10, 0], "NH": [10, 0], "ME": [10, 0] };
                            const [dx, dy] = offsets[shortName] || [0, 0];
                            return (
                              <g key={`${geo.rsmKey}-label`}>
                                <rect x={x + dx - 14} y={y + dy - 10} width="28" height="20" rx="5" fill={getLabelBgColor(name)} style={{ filter: "drop-shadow(0 3px 6px rgba(0,0,0,0.25))" }} />
                                <text x={x + dx} y={y + dy + 1} textAnchor="middle" dominantBaseline="middle" style={{ fontSize: "11px", fontWeight: "700", fill: getLabelTextColor(), pointerEvents: "none", fontFamily: "Arial" }}>{shortName}</text>
                              </g>
                            );
                          })}
                        </>
                      )}
                    </Geographies>
                  </ComposableMap>
                  <div className="mapFooter">
                    <div className="mapLegend">
                      <div className="legendItem"><span className="greenDot"></span><span>Covered State - {coveredCount}</span></div>
                      <div className="legendItem"><span className="redDot"></span><span>Not-Covered State - {notCoveredCount}</span></div>
                    </div>
                    <div className="mapLogo"><img src="/Image/img1.png" alt="logo" /></div>
                  </div>
                </div>
              </div>

              <div className="sidePanel">
                <div className="panelCard">
                  <div className="dropdown-group">
                    <h3 className="panelCard1">Select Region</h3>
                    <select className="dropdown" value={selectedRegion} onChange={(e) => { setSelectedRegion(e.target.value); setSelectedFilterStates([]); }}>
                      {regions.map((r) => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </div>
                </div>
                <div className="panelCard">
                  <h3 className="panelCard1">Select Markets</h3>
                  <input className="searchBox" type="text" placeholder="Search state..." value={search} onChange={(e) => setSearch(e.target.value)} />
                  <div className="scrollBox">
                    {filteredStates.filter((s) => s.toLowerCase().includes(search.toLowerCase())).map((state) => (
                      <label key={state} style={{ marginBottom: "4px" }}>
                        <input type="checkbox" checked={selectedFilterStates.includes(state)} onChange={() => toggleFilterState(state)} />
                        <span style={{ marginLeft: "8px" }}>{state}</span>
                      </label>
                    ))}
                  </div>
                </div>
                <div className="panelCard">
                  <h4 className="panelCard1">Select Domains</h4>
                  <div className="scrollBox">
                    {[...new Set([...domains, ...allWorkData.map(x => (x.domain || "").toString().trim().toUpperCase())])].map(d => (
                      <div key={d} style={{ marginBottom: "12px" }}>
                        <label style={{ cursor: "pointer", display: "flex", alignItems: "center" }} onClick={() => toggleExpand(d)}>
                          <input type="checkbox" checked={selectedDomains.includes(d)} onChange={(e) => { e.stopPropagation(); toggleFilter(d, setSelectedDomains); }} />
                          <strong style={{ marginLeft: "8px" }}>{d}</strong>
                        </label>
                        {(expandedDomains[d] && (d === "ASE" || d === "F2")) && subDomainsMap[d] && (
                          <div style={{ marginLeft: "25px", marginTop: "5px" }}>
                            {subDomainsMap[d].map(sub => (
                              <label key={sub} style={{ display: "block", fontSize: "12px" }}>
                                <input type="checkbox" checked={selectedSubDomains.includes(sub)} onChange={() => toggleFilter(sub, setSelectedSubDomains)} />
                                <span style={{ marginLeft: "8px" }}>{sub}</span>
                              </label>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
                <div className="panelCard">
                  <h4 className="panelCard1">Select Month & Year</h4>
                  <div className="dropdown-group">
                    <select className="dropdown" value={`${selectedMonth?.month || ""}-${selectedMonth?.year || ""}`} onChange={(e) => { if (e.target.value) { const [month, year] = e.target.value.split("-"); setSelectedMonth({ month, year: Number(year) }); } else { setSelectedMonth(null); } }}>
                      <option value="">All Months</option>
                      {monthsList.map((m) => <option key={m} value={`${m}-${currentYear}`}>{m} - {currentYear}</option>)}
                    </select>
                  </div>
                </div>
              </div>
            </div>

            <div className="bottomChartsRow">
              <div className="chartBox">
                <h3 className="chartTitle" style={{ marginBottom: "30px" }}>📊 Domain Wise Jobs</h3>
                <ResponsiveContainer width="100%" height={350}>
                  <BarChart data={monthlyJobsSorted} barGap={0} barCategoryGap={25}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    {allYears.map((year, index) => (
                      <Bar key={year} dataKey={year} stackId="a" fill={COLORS[index % COLORS.length]} name={year} barSize={window.innerWidth < 768 ? 18 : 35} radius={[6, 6, 0, 0]} />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="chartBox">
                <h3 className="chartTitle">🥧 Domain % Share</h3>
                <ResponsiveContainer width="100%" height={360}>
                  <PieChart>
                    <Pie data={pieChartData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={window.innerWidth < 768 ? 80 : 120} innerRadius={0} paddingAngle={2} stroke="#fff" strokeWidth={2} startAngle={90} endAngle={-270} clockwise={true} isAnimationActive={true} animationBegin={0} animationDuration={2500} animationEasing="ease-out" label={({ name, value, cx, cy, midAngle, outerRadius }) => { const RADIAN = Math.PI / 180; const radius = outerRadius + 30; const x = cx + radius * Math.cos(-midAngle * RADIAN); const y = cy + radius * Math.sin(-midAngle * RADIAN); return (<text x={x} y={y} fill="#111827" textAnchor={x > cx ? "start" : "end"} dominantBaseline="central" style={{ fontSize: "13px", fontWeight: "700" }}>{name} {value}%</text>); }} labelLine={{ stroke: "#4b5563", strokeWidth: 1.3 }}>
                      {pieChartData.map((entry, index) => (<Cell key={index} fill={COLORS[index % COLORS.length]} opacity={hiddenDomains.includes(entry.name) ? 0.15 : 1} />))}
                    </Pie>
                    <Tooltip formatter={(v) => `${v}%`} />
                    <Legend content={() => (
                      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", flexWrap: "wrap", gap: "14px", marginTop: "10px", fontSize: "13px", fontWeight: "600" }}>
                        <div onClick={() => setHiddenDomains([])} style={{ display: "flex", alignItems: "center", gap: "6px", cursor: "pointer" }}><span style={{ width: "16px", height: "10px", borderRadius: "2px", background: "#111827", display: "inline-block" }}></span>ALL</div>
                        {pieChartData.filter(item => item.jobs > 0).filter(item => !hiddenDomains.includes(item.name)).map((entry, index) => (
                          <div key={entry.name} onClick={() => { setHiddenDomains(prev => [...prev, entry.name]); }} style={{ display: "flex", alignItems: "center", gap: "6px", cursor: "pointer" }}><span style={{ width: "16px", height: "10px", borderRadius: "2px", background: COLORS[index % COLORS.length], display: "inline-block" }}></span>{entry.name}</div>
                        ))}
                      </div>
                    )} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          </>
        )}

        {/* Individual Panels Renders */}
        {activePage === "workupdate" && (<div className="belowSection"><WorkUpdate refreshDashboard={fetchAllData} /></div>)}
        {activePage === "report" && <div className="belowSection"><Report /></div>}
        {activePage === "user-management" && <div className="belowSection"><UserManagement /></div>}
        {activePage === "organogram" && <div className="belowSection"><Organogram /></div>}
        {activePage === "jobcreation" && <div className="belowSection"><JobCreation /></div>}
        {activePage === "workstatus" && <div className="belowSection"><TimesheetManagement /></div>}
        {activePage === "jobhistory" && <div className="belowSection"><JobHistory /></div>}
        {activePage === "domaincreation" && <div className="belowSection"><MasterDomainCreation /></div>}
      </div>

      {/* Tooltip Hover Overlay Canvas */}
      {tooltip.visible && (
        <div className="tooltipBox" style={window.innerWidth < 768 ? {} : { top: tooltip.y + 10, left: tooltip.x + 10 }}>
          {(() => {
            const stateData = mapReportData[tooltip.data?.state] || {};
            const totalJobsDelivered = Object.values(stateData).reduce((sum, val) => sum + Number(val || 0), 0);
            return (
              <div style={{ display: "flex", justifyContent: "space-between", padding: "10px", background: "#f1f5f9", fontWeight: "700" }}>
                <div style={{ fontSize: "14px", color: "#0f4a63" }}>{getRegionByState(tooltip.data?.state)} - {tooltip.data?.state}</div>
                <div style={{ fontSize: "12px", color: "#166534", fontWeight: "700" }}>{totalJobsDelivered > 0 ? `Total Jobs: ${totalJobsDelivered}` : "N/A"}</div>
              </div>
            );
          })()}
          <div style={{ padding: "10px" }}>
            {[...new Set([...domains, ...Object.keys(mapReportData[tooltip.data?.state] || {})])].map((d) => {
              const jobs = Number((mapReportData[tooltip.data?.state] || {})[d] || 0);
              return (
                <div key={d} style={{ marginBottom: "10px", borderBottom: "1px solid #eee", paddingBottom: "6px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontWeight: "700", fontSize: "13px" }}>
                    <span>{d}</span>
                    <span style={{ color: jobs > 0 ? "#16a34a" : "#9ca3af", fontWeight: "700" }}>{jobs} Jobs</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
      {showKpiModal && (
        <div className="modalOverlay" onClick={() => setShowKpiModal(false)}>
          <div className="modalContent" onClick={(e) => e.stopPropagation()}>
            <div className="modalHeader">
              <div className="statusHeaderBox">
                <div className="statusLeft">
                  <div className="statusIcon">📊</div>
                  <div className="statusInfo">
                    <p className="statusSmall">Status Report</p>
                    <div className="statusMain">{selectedKpiDomain ? selectedKpiDomain : selectedFilterStates?.length === 1 ? selectedFilterStates[0] : "All Domains"}</div>
                  </div>
                </div>
                <button className="closeBtn" onClick={() => setShowKpiModal(false)}>✖</button>
              </div>
            </div>
            <div className="modalBody">
              <Reports domain={selectedKpiDomain} states={selectedFilterStates} monthData={selectedMonth} month={selectedMonth?.month} year={selectedMonth?.year} onClose={() => setShowKpiModal(false)} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}