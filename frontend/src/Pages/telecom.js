import { API_BASE_URL } from "../config";
import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useOutletContext } from "react-router-dom";
import { ComposableMap, Geographies, Geography } from "react-simple-maps";
import { geoCentroid } from "d3-geo";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, CartesianGrid
} from "recharts";
import { FaTachometerAlt, FaChartBar, FaUsers, FaSitemap, FaPlusCircle, FaClock, FaHistory, FaLayerGroup, FaFolderOpen, FaPaperPlane, FaChartLine, FaTimes } from "react-icons/fa";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import geoData from "../us-states.json";
import "../style/telecom.css";
import WorkUpdate from "./WorkUpdate";
import JobCreation from "./JobCreation";
import JobSubmission from "./JobSubmission";
import Report from "./Report";
import Reports from "../components/Report.jsx";
import UserManagement from "./UserManagement";
import Organogram from "./Organogram";
import TimesheetManagement from "../Pages/TimesheetManagement";
import MasterDomainCreation from "../Pages/MasterDomainCreation";
import CapacityForecast from "../Pages/CapacityForecast";
import JobHistory from "../Pages/JobHistory";
// NOTE: file ka naam exactly "KpiTrendModal.jsx" rakho, path src/components/ (Linux/Vercel par case matter karta hai)
import KpiTrendModal from "../components/KpiTrendModal";
import axios from "axios";

/* ======================================
   PURE HELPERS (component ke bahar — re-create nahi honge)
====================================== */
const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTH_KEYS = MONTH_NAMES.map((m) => m.toLowerCase());

const normalize = (d) => (d ?? "").toString().trim().toUpperCase();
const lc = (s) => String(s ?? "").trim().toLowerCase();

// Pehli non-empty value (0 ko valid maanta hai)
const firstFilled = (...vals) =>
  vals.find((v) => v !== null && v !== undefined && String(v).trim() !== "");

// "Jan,26" / "jan, 2026" / "January-26" / "Jan 2026"  ->  { idx: 0, year: 2026 }
const parseMonthEntry = (m, fallbackYear) => {
  if (!m) return null;
  const match = String(m).trim().match(/^([A-Za-z]{3,})\W*(\d{2,4})?$/);
  if (!match) return null;
  const idx = MONTH_KEYS.indexOf(match[1].slice(0, 3).toLowerCase());
  if (idx < 0) return null;
  let year = fallbackYear;
  if (match[2]) year = match[2].length === 2 ? 2000 + Number(match[2]) : Number(match[2]);
  if (!Number.isFinite(year)) return null;
  return { idx, year };
};

// NaN se sums kharab na hon
const getJobs = (item) => Number(firstFilled(item?.jobsDelivered, item?.jobs_delivered)) || 0;

const parsePercent = (val) => {
  if (val === null || val === undefined || val === "") return null;
  const num = parseFloat(val.toString().replace("%", "").trim());
  if (isNaN(num)) return null;
  const pct = num > 0 && num <= 1 ? num * 100 : num;
  return Math.min(100, Math.max(0, Math.round(pct)));
};

// 0 value bhi valid (|| use karne se 0 gayab ho jata tha)
const getQc = (item) => parsePercent(firstFilled(item?.amdocsQc, item?.amdocs_qc));

const isOtpMet = (val) => {
  if (val === null || val === undefined || val === "") return false;
  const str = val.toString().trim().toLowerCase();
  if (["yes", "y", "met", "true", "ok", "pass", "passed"].includes(str)) return true;
  if (["no", "n", "not met", "false", "fail", "failed", "0"].includes(str)) return false;
  const num = parseFloat(str.replace("%", ""));
  return !isNaN(num) && num > 0;
};

const parseUom = (raw) => {
  let uom = raw || {};
  if (typeof uom === "string") {
    try { uom = JSON.parse(uom); } catch { uom = {}; }
  }
  return uom && typeof uom === "object" && !Array.isArray(uom) ? uom : {};
};

// QC / OTP colour rule: 90-100% green, 80-90% orange, below 80% red
const getPerfColor = (val, fallback = "#64748b") => {
  if (val === null || val === undefined || isNaN(val)) return fallback;
  if (val >= 90) return "#16a34a";
  if (val >= 80) return "#d97706";
  return "#dc2626";
};

const getPerfBoxStyle = (val) => {
  const v = val === null || val === undefined || isNaN(val) ? 0 : val;
  const color = getPerfColor(v);
  const bg = v >= 90 ? "#dcfce7" : v >= 80 ? "#ffedd5" : "#fee2e2";
  const border = v >= 90 ? "#86efac" : v >= 80 ? "#fdba74" : "#fca5a5";
  return {
    fontSize: "10.5px",
    fontWeight: 700,
    color,
    background: bg,
    border: `1px solid ${border}`,
    borderRadius: "6px",
    padding: "3px 6px",
    whiteSpace: "nowrap",
    display: "inline-block",
    flex: "0 0 auto",
  };
};

// "NOOF ASE" / "NO OF ASE" / "No.of ASE"  ->  "No.of ase"
const formatUomLabel = (key) => {
  const raw = String(key || "").trim();
  if (!raw) return raw;
  const m = raw.match(/^(no\.?\s*of|noof|number\s*of)\s*(.*)$/i);
  if (m) {
    const rest = m[2].trim().toLowerCase();
    return rest ? `No.of ${rest}` : "No.of";
  }
  const low = raw.toLowerCase();
  return low.charAt(0).toUpperCase() + low.slice(1);
};

const SHORT_NAMES = {
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
const getShortStateName = (stateName) => SHORT_NAMES[stateName] || String(stateName || "").substring(0, 2).toUpperCase();

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
  return `${year}-${month}-${day} at ${String(hours).padStart(2, "0")}.${minutes}.${seconds} ${ampm}`;
};

const monthsList = MONTH_NAMES;
const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4"];
const CROWDED_LABELS = ["Rhode Island", "Connecticut", "New Jersey", "Delaware", "Maryland", "District of Columbia", "Vermont", "New Hampshire", "Massachusetts"];
const REGIONS = ["All Region", "Northeast", "Southeast", "Midwest", "Southwest", "West"];

const REGION_STATE_MAP = {
  Northeast: ["Maine", "New Hampshire", "Vermont", "Massachusetts", "Rhode Island", "Connecticut", "New York", "New Jersey", "Pennsylvania"],
  // FIX: District of Columbia kisi region me nahi tha -> tooltip me "undefined - ..." aata tha
  Southeast: ["Delaware", "Maryland", "District of Columbia", "Virginia", "West Virginia", "North Carolina", "South Carolina", "Georgia", "Florida", "Alabama", "Mississippi", "Tennessee", "Arkansas", "Kentucky", "Louisiana"],
  Midwest: ["Ohio", "Michigan", "Indiana", "Illinois", "Wisconsin", "Minnesota", "Iowa", "Missouri", "North Dakota", "South Dakota", "Nebraska", "Kansas"],
  Southwest: ["Texas", "Oklahoma", "New Mexico", "Arizona"],
  West: ["Colorado", "Wyoming", "Montana", "Idaho", "Utah", "Nevada", "California", "Oregon", "Washington", "Alaska", "Hawaii"]
};

const SUB_DOMAINS_MAP = {
  ASE: ["Placement", "Activation"],
  F2: ["Aramis", "IQGEO"]
};

const DOMAIN_COLORS = {
  ASE: "#3b82f6",
  F2: "#10b981",
  TCP: "#f59e0b",
  PERMIT: "#ef4444",
  LUMEN: "#8b5cf6",
  PLA: "#06b6d4",
  JPA: "#f97316",
};

const STATE_COLOR_SCALE = [
  "#738F52", "#9ACD32", "#78BE21", "#32CD32", "#90EE90",
  "#00FF00", "#66FF00", "#008000", "#006400",
];

const CLOSED_TOOLTIP = { visible: false, x: 0, y: 0, data: null };
const ALL_STATES = geoData.features.map((f) => f.properties.name);

const tooltipCardStyle = {
  background: "#ffffff",
  border: "1px solid #e2e8f0",
  borderRadius: 8,
  padding: "8px 11px",
  fontSize: 11.5,
  lineHeight: 1.6,
  boxShadow: "0 4px 14px rgba(0,0,0,0.18)",
};

/* ======================================
   CHART TOOLTIPS (component ke bahar — har render pe remount nahi honge)
====================================== */
const BarChartTooltip = ({ active, payload, label }) => {
  if (!active || !payload || !payload.length) return null;
  const row = payload[0].payload;
  return (
    <div style={tooltipCardStyle}>
      <div style={{ fontWeight: 800, marginBottom: 5, fontSize: 12.5, color: "#0f172a" }}>{label}</div>
      {payload.map((p) => {
        const year = p.dataKey;
        const qc = row[`qc_${year}`];
        const otp = row[`otp_${year}`];
        return (
          <div key={year} style={{ marginBottom: 4 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 2 }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: p.color, display: "inline-block" }}></span>
              <span style={{ fontWeight: 800, color: "#0f172a" }}>{year}</span>
            </div>
            <div style={{ display: "flex", gap: 10, paddingLeft: 13, whiteSpace: "nowrap" }}>
              <span style={{ color: "#2563eb" }}><b style={{ fontWeight: 800 }}>Job-</b> <b style={{ fontWeight: 800 }}>{p.value}</b></span>
              <span style={{ color: getPerfColor(qc ?? 0) }}><b style={{ fontWeight: 800 }}>QC-</b> <b style={{ fontWeight: 800 }}>{qc !== null && qc !== undefined ? `${qc}%` : "0%"}</b></span>
              <span style={{ color: getPerfColor(otp ?? 0) }}><b style={{ fontWeight: 800 }}>OTP-</b> <b style={{ fontWeight: 800 }}>{otp !== null && otp !== undefined ? `${otp}%` : "0%"}</b></span>
            </div>
          </div>
        );
      })}
    </div>
  );
};

const PieChartTooltip = ({ active, payload }) => {
  if (!active || !payload || !payload.length) return null;
  const d = payload[0].payload;
  return (
    <div style={{ ...tooltipCardStyle, lineHeight: 1.7 }}>
      <div style={{ fontWeight: 800, marginBottom: 4, fontSize: 12.5, color: "#0f172a" }}>{d.name}</div>
      <div style={{ color: "#2563eb" }}><b style={{ fontWeight: 800 }}>Job-</b> <b style={{ fontWeight: 800 }}>{d.jobs}</b> <span style={{ color: "#64748b", fontWeight: 600 }}>(<b style={{ fontWeight: 800 }}>{d.value}%</b>)</span></div>
      <div style={{ color: getPerfColor(d.qc ?? 0) }}><b style={{ fontWeight: 800 }}>QC-</b> <b style={{ fontWeight: 800 }}>{d.qc !== null && d.qc !== undefined ? `${d.qc}%` : "0%"}</b></div>
      <div style={{ color: getPerfColor(d.otp ?? 0) }}><b style={{ fontWeight: 800 }}>OTP-</b> <b style={{ fontWeight: 800 }}>{d.otp !== null && d.otp !== undefined ? `${d.otp}%` : "0%"}</b></div>
    </div>
  );
};

export default function TelecomMap() {
  const [selectedKpiDomain, setSelectedKpiDomain] = useState(null);
  const [showKpiModal, setShowKpiModal] = useState(false);
  const [expandedJobMenu, setExpandedJobMenu] = useState(false);
  const [showTrendModal, setShowTrendModal] = useState(false);

  const currentYear = new Date().getFullYear();

  const [selectedMonth, setSelectedMonth] = useState(null);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [activePage, setActivePage] = useState("dashboard");

  const [selectedRegion, setSelectedRegion] = useState("All Region");
  const [selectedFilterStates, setSelectedFilterStates] = useState([]);
  const [selectedDomains, setSelectedDomains] = useState([]);
  const [selectedSubDomains, setSelectedSubDomains] = useState([]);
  const [hiddenDomains, setHiddenDomains] = useState([]);
  const [expandedDomains, setExpandedDomains] = useState({});
  const [search, setSearch] = useState("");
  const [showExport, setShowExport] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [allWorkData, setAllWorkData] = useState([]);
  const [domains, setDomains] = useState([]);
  const [mapReportData, setMapReportData] = useState({});
  const [role, setRole] = useState(null);
  const [tooltip, setTooltip] = useState(CLOSED_TOOLTIP);

  const exportRef = useRef();
  const mapBoxRef = useRef(null);
  const pointerTypeRef = useRef("mouse");
  const lastFetchRef = useRef(0);

  const outletCtx = useOutletContext() || {};
  const menuOpen = outletCtx.menuOpen ?? true;
  const setMenuOpen = outletCtx.setMenuOpen || (() => {});

  const handleKpiReport = (domain) => {
    setSelectedKpiDomain(domain);
    setShowKpiModal(true);
  };

  const closeKpiModal = useCallback(() => {
    setShowKpiModal(false);
    setSelectedKpiDomain(null);
  }, []);

  const handleStateHover = useCallback((stateName, evt) => {
    setTooltip({
      visible: true,
      x: evt.clientX,
      y: evt.clientY,
      data: { state: stateName },
    });
  }, []);

  // ---- Page navigation via window event ----
  useEffect(() => {
    const handleNavigate = (e) => {
      setActivePage(e.detail || "workupdate");
    };
    window.addEventListener("navigate-to-page", handleNavigate);

    if (window.pendingNavigationPage) {
      setActivePage(window.pendingNavigationPage);
      window.pendingNavigationPage = null;
    }
    return () => window.removeEventListener("navigate-to-page", handleNavigate);
  }, []);

  // ---- Responsive helpers (tablet / mobile map) ----
  const [viewportWidth, setViewportWidth] = useState(
    typeof window !== "undefined" ? window.innerWidth : 1200
  );
  const [mapWidth, setMapWidth] = useState(1000);

  useEffect(() => {
    const onResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
    };
  }, []);

  // Map ki real rendered width track karo
  useEffect(() => {
    const el = mapBoxRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect?.width;
      if (w) setMapWidth((prev) => (Math.abs(prev - w) > 1 ? w : prev));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [activePage]);

  const isCompact = viewportWidth <= 1100;
  const isPhone = viewportWidth <= 600;
  const isCoarsePointer =
    typeof window !== "undefined" &&
    !!window.matchMedia &&
    window.matchMedia("(pointer: coarse)").matches;
  const isSheetTooltip = viewportWidth <= 768 || isCoarsePointer;

  // Touch: state tap -> details, dobara tap -> close
  const handleStateTap = (stateName, evt) => {
    setTooltip((prev) =>
      prev.visible && prev.data?.state === stateName
        ? CLOSED_TOOLTIP
        : { visible: true, x: evt.clientX, y: evt.clientY, data: { state: stateName } }
    );
  };

  // Touch: bahar tap karne par tooltip band
  useEffect(() => {
    if (!tooltip.visible) return;
    const onDown = (e) => {
      if (e.pointerType === "mouse") return;
      const t = e.target;
      if (t && t.closest && (t.closest(".tooltipBox") || t.closest(".mapBox path"))) return;
      setTooltip(CLOSED_TOOLTIP);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [tooltip.visible]);

  // Esc: tooltip / KPI status popup band
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      setTooltip(CLOSED_TOOLTIP);
      closeKpiModal();
      setShowExport(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [closeKpiModal]);

  // Export menu ke bahar click par band
  useEffect(() => {
    if (!showExport) return;
    const onDown = (e) => {
      if (!(e.target && e.target.closest && e.target.closest(".export"))) setShowExport(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [showExport]);

  const mapScale = Math.max(mapWidth, 1) / 1000;
  const labelK = isCompact && !isExporting ? Math.min(1.9, Math.max(1, 9 / (11 * mapScale))) : 1;

  const filteredStates =
    selectedRegion === "All Region" ? ALL_STATES : REGION_STATE_MAP[selectedRegion] || [];

  const getRegionByState = (stateName) =>
    Object.keys(REGION_STATE_MAP).find((region) => REGION_STATE_MAP[region].includes(stateName));

  // ---- Role ----
  useEffect(() => {
    try {
      const user = JSON.parse(localStorage.getItem("user"));
      setRole(user?.role);
    } catch (e) {
      setRole(null);
    }
  }, []);

  // ---- Data fetch (teeno API parallel; ek fail ho to baaki chalti rahe) ----
  const fetchAllData = useCallback(async () => {
    lastFetchRef.current = Date.now();
    const [workRes, masterRes, stateRes] = await Promise.allSettled([
      axios.get(`${API_BASE_URL}/api/work/all`),
      axios.get(`${API_BASE_URL}/api/master`),
      axios.get(`${API_BASE_URL}/api/work/state-wise-jobs`),
    ]);

    if (workRes.status === "fulfilled") {
      setAllWorkData(Array.isArray(workRes.value.data) ? workRes.value.data : []);
    } else {
      console.error("Error fetching work data:", workRes.reason);
    }
    if (masterRes.status === "fulfilled") {
      setDomains(Object.keys(masterRes.value.data || {}));
    } else {
      console.error("Error fetching master data:", masterRes.reason);
    }
    if (stateRes.status === "fulfilled") {
      setMapReportData(stateRes.value.data || {});
    } else {
      console.error("Error fetching state-wise jobs:", stateRes.reason);
    }
  }, []);

  useEffect(() => {
    fetchAllData();
  }, [fetchAllData]);

  // Tab focus par refresh (focus + visibilitychange dono ek saath fire hote hain -> 3 sec throttle)
  useEffect(() => {
    const refreshIfStale = () => {
      if (Date.now() - lastFetchRef.current < 3000) return;
      fetchAllData();
    };
    const handleVisibility = () => {
      if (document.visibilityState === "visible") refreshIfStale();
    };
    window.addEventListener("focus", refreshIfStale);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      window.removeEventListener("focus", refreshIfStale);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [fetchAllData]);

  // ---- Filters (useMemo: extra render / ek-frame-purana-data ki problem nahi) ----
  const currentFilterData = useMemo(() => {
    let filtered = [...allWorkData];

    if (selectedDomains.length > 0) {
      const wanted = selectedDomains.map(normalize);
      filtered = filtered.filter((item) => wanted.includes(normalize(item.domain)));
    }

    if (selectedSubDomains.length > 0) {
      const wanted = selectedSubDomains.map(lc);
      filtered = filtered.filter((item) => wanted.includes(lc(item.subDomain)));
    }

    if (selectedFilterStates.length > 0) {
      const wanted = selectedFilterStates.map(lc);
      filtered = filtered.filter((item) => item.state && wanted.includes(lc(item.state)));
    }

    if (selectedMonth?.month) {
      const wantIdx = MONTH_KEYS.indexOf(selectedMonth.month.slice(0, 3).toLowerCase());
      filtered = filtered.filter((item) =>
        (Array.isArray(item?.months) ? item.months : []).some((m) => {
          const p = parseMonthEntry(m, currentYear);
          return p && p.idx === wantIdx && p.year === selectedMonth.year;
        })
      );
    }

    if (fromDate || toDate) {
      let rangeStart = fromDate ? new Date(`${fromDate}T00:00:00`) : null;
      let rangeEnd = toDate ? new Date(`${toDate}T23:59:59`) : null;
      if (rangeStart && rangeEnd && rangeStart > rangeEnd) {
        [rangeStart, rangeEnd] = [rangeEnd, rangeStart];
      }
      filtered = filtered.filter((item) =>
        (Array.isArray(item?.months) ? item.months : []).some((m) => {
          const p = parseMonthEntry(m, currentYear);
          if (!p) return false;
          const monthStart = new Date(p.year, p.idx, 1);
          const monthEnd = new Date(p.year, p.idx + 1, 0, 23, 59, 59);
          if (rangeStart && monthEnd < rangeStart) return false;
          if (rangeEnd && monthStart > rangeEnd) return false;
          return true;
        })
      );
    }
    return filtered;
  }, [selectedDomains, selectedSubDomains, selectedFilterStates, selectedMonth, fromDate, toDate, allWorkData, currentYear]);

  const toggleFilter = (id, setter) => {
    setter((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
  };

  const toggleExpand = (d) => {
    setExpandedDomains((prev) => ({ ...prev, [d]: !prev[d] }));
  };

  const resetDateFilters = () => {
    setSelectedMonth(null);
    setFromDate("");
    setToDate("");
  };

  const toggleFilterState = (state) => {
    setSelectedFilterStates((prev) =>
      prev.includes(state) ? prev.filter((s) => s !== state) : [...prev, state]
    );
  };

  // ---- Covered / not covered states (Set: har state ke liye array scan nahi hoga) ----
  const coveredStates = useMemo(
    () => new Set(currentFilterData.filter((i) => i.state).map((i) => lc(i.state))),
    [currentFilterData]
  );
  const hasDataForState = (stateName) => coveredStates.has(lc(stateName));
  const coveredCount = ALL_STATES.filter(hasDataForState).length;
  const notCoveredCount = ALL_STATES.length - coveredCount;

  // ---- State-wise maps (keys lowercase => case mismatch se colour/tooltip nahi bigdega) ----
  const stateJobsMap = useMemo(() => {
    const map = {};
    currentFilterData.forEach((item) => {
      if (!item.state) return;
      const key = lc(item.state);
      map[key] = (map[key] || 0) + getJobs(item);
    });
    return map;
  }, [currentFilterData]);

  const maxJobs = useMemo(() => Math.max(...Object.values(stateJobsMap), 1), [stateJobsMap]);

  const stateDomainStatsMap = useMemo(() => {
    const map = {};
    currentFilterData.forEach((item) => {
      if (!item.state) return;
      const stateKey = lc(item.state);
      const domain = normalize(item.domain);
      if (!domain) return;
      if (!map[stateKey]) map[stateKey] = {};
      if (!map[stateKey][domain]) map[stateKey][domain] = { jobs: 0, qcSum: 0, qcCount: 0, otp: 0, otpTotal: 0 };
      const s = map[stateKey][domain];
      s.jobs += getJobs(item);
      const qcVal = getQc(item);
      if (qcVal !== null) {
        s.qcSum += qcVal;
        s.qcCount += 1;
      }
      s.otpTotal += 1;
      if (isOtpMet(item.otp)) s.otp += 1;
    });
    return map;
  }, [currentFilterData]);

  // Backend ka state-wise data lowercase key se (tooltip lookup case-insensitive)
  const mapReportByState = useMemo(() => {
    const map = {};
    Object.entries(mapReportData || {}).forEach(([k, v]) => {
      map[lc(k)] = v || {};
    });
    return map;
  }, [mapReportData]);

  const getStateColor = (stateName) => {
    const totalJobs = stateJobsMap[lc(stateName)] || 0;
    if (totalJobs === 0) return "#FFC491";
    const ratio = totalJobs / maxJobs;
    const index = Math.min(STATE_COLOR_SCALE.length - 1, Math.floor(ratio * STATE_COLOR_SCALE.length));
    return STATE_COLOR_SCALE[index];
  };

  const getLabelBgColor = (stateName) => (hasDataForState(stateName) ? "#15803d" : "#dc2626");
  const getLabelTextColor = () => "#ffffff";

  // ---- Domain-wise stats: ek hi pass me (KPI cards + pie chart dono yahin se) ----
  const domainStats = useMemo(() => {
    const map = {};
    currentFilterData.forEach((item) => {
      const domain = normalize(item.domain);
      if (!domain) return;
      const s = map[domain] || (map[domain] = { jobs: 0, qcSum: 0, qcCount: 0, otpMet: 0, total: 0, uom: {} });
      s.jobs += getJobs(item);
      const qcVal = getQc(item);
      if (qcVal !== null) {
        s.qcSum += qcVal;
        s.qcCount += 1;
      }
      s.total += 1;
      if (isOtpMet(item.otp)) s.otpMet += 1;

      Object.entries(parseUom(item.uom)).forEach(([key, value]) => {
        if (!key || key === "undefined") return;
        const lowerKey = key.toString().toLowerCase();
        if (lowerKey.includes("date") || lowerKey.includes("submission") || lowerKey.includes("time")) return;
        s.uom[key] = (s.uom[key] || 0) + (Number(value) || 0);
      });
    });
    return map;
  }, [currentFilterData]);

  const getDomainJobs = (domain) => domainStats[normalize(domain)]?.jobs || 0;
  const getDomainQcAvg = (domain) => {
    const s = domainStats[normalize(domain)];
    return s && s.qcCount > 0 ? Math.round(s.qcSum / s.qcCount) : null;
  };
  const getDomainOtpPercent = (domain) => {
    const s = domainStats[normalize(domain)];
    return s && s.total > 0 ? Math.round((s.otpMet / s.total) * 100) : null;
  };
  const getDomainUomText = (domain) => {
    const uom = domainStats[normalize(domain)]?.uom || {};
    return Object.entries(uom).map(([key, value]) => `${formatUomLabel(key)}: ${value}`).join(" | ");
  };

  // ---- Domains list ----
  const mergedDomains = useMemo(() => {
    const masterDomains = (domains || []).map(normalize);
    const workDomains = allWorkData.map((x) => normalize(x.domain));
    // khali domain ("") ka fake KPI card / checkbox nahi banega
    return [...new Set([...masterDomains, ...workDomains])].filter(Boolean);
  }, [domains, allWorkData]);

  // ---- Monthly chart data ----
  const { monthlyJobsSorted, allYears } = useMemo(() => {
    const buckets = {}; // "idx-year" -> { jobs, qcSum, qcCount, otpMet, total }
    const yearSet = new Set();

    currentFilterData.forEach((item) => {
      const jobs = getJobs(item);
      const qcVal = getQc(item);
      const otpMet = isOtpMet(item.otp);
      const seen = new Set(); // ek row me same month duplicate ho to ek hi baar

      (Array.isArray(item.months) ? item.months : []).forEach((m) => {
        const p = parseMonthEntry(m, currentYear);
        if (!p) return;
        const key = `${p.idx}-${p.year}`;
        if (seen.has(key)) return;
        seen.add(key);
        yearSet.add(String(p.year));

        const b = buckets[key] || (buckets[key] = { jobs: 0, qcSum: 0, qcCount: 0, otpMet: 0, total: 0 });
        b.jobs += jobs;
        if (qcVal !== null) {
          b.qcSum += qcVal;
          b.qcCount += 1;
        }
        b.total += 1;
        if (otpMet) b.otpMet += 1;
      });
    });

    const years = [...yearSet].sort();
    const rows = MONTH_NAMES.map((month, idx) => {
      const row = { name: month };
      years.forEach((year) => {
        const b = buckets[`${idx}-${year}`];
        if (!b) return;
        row[year] = b.jobs;
        row[`qc_${year}`] = b.qcCount > 0 ? Math.round(b.qcSum / b.qcCount) : null;
        row[`otp_${year}`] = b.total > 0 ? Math.round((b.otpMet / b.total) * 100) : null;
      });
      return row;
    });
    return { monthlyJobsSorted: rows, allYears: years };
  }, [currentFilterData, currentYear]);

  // ---- Pie chart data ----
  // pieAll: sab domains (stable order + stable colour), legend me hidden bhi dikhenge (dim), dobara click se wapas aa sakte hain
  const pieAll = useMemo(() => {
    const entries = Object.entries(domainStats)
      .filter(([, s]) => s.jobs > 0)
      .sort(([a], [b]) => a.localeCompare(b));
    const grandTotal = entries.reduce((sum, [, s]) => sum + s.jobs, 0);
    return entries.map(([name, s], index) => ({
      name,
      jobs: s.jobs,
      value: grandTotal ? Number(((s.jobs / grandTotal) * 100).toFixed(2)) : 0,
      qc: s.qcCount > 0 ? Math.round(s.qcSum / s.qcCount) : null,
      otp: s.total > 0 ? Math.round((s.otpMet / s.total) * 100) : null,
      color: COLORS[index % COLORS.length],
    }));
  }, [domainStats]);

  const pieChartData = useMemo(
    () => pieAll.filter((d) => !hiddenDomains.includes(d.name)),
    [pieAll, hiddenDomains]
  );

  // ---- Export ----
  const captureAndExport = async (type) => {
    try {
      setIsExporting(true);
      setShowExport(false);
      await new Promise((res) => setTimeout(res, 200));
      const original = exportRef.current;
      if (!original) return;
      const clone = original.cloneNode(true);
      const isCompactExport = window.innerWidth <= 1100;
      if (isCompactExport) {
        clone.classList.add("exporting");
        clone.style.width = "1000px";
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

      if (!isCompactExport) {
        const logoBox = clone.querySelector(".mapLogo");
        const logo = clone.querySelector(".mapLogo img");
        if (logoBox && logo) {
          logo.style.width = "130px";
          logo.style.height = "auto";
          logo.style.position = "relative";
          logo.style.left = "-120px";
          logo.style.top = "-90px";
        }
        const legendEl = clone.querySelector(".mapLegend");
        if (legendEl) {
          legendEl.style.fontSize = "16px";
          legendEl.style.fontWeight = "700";
          legendEl.style.marginLeft = "90px";
        }
        const compass = clone.querySelector(".resized-image");
        if (compass) {
          compass.style.width = "120px";
          compass.style.height = "auto";
          compass.style.marginTop = "40px";
        }
      }
      const exportBtn = clone.querySelector(".export");
      if (exportBtn) exportBtn.remove();
      document.body.appendChild(clone);
      let canvas;
      try {
        canvas = await html2canvas(clone, { scale: 2, useCORS: true, backgroundColor: "#fff" });
      } finally {
        // html2canvas fail ho to bhi clone DOM se hat jaye
        if (clone.parentNode) clone.parentNode.removeChild(clone);
      }
      const imgData = canvas.toDataURL(type === "jpeg" ? "image/jpeg" : "image/png");
      if (type === "pdf") {
        const pdf = new jsPDF("landscape", "mm", "a4");
        const pageWidth = pdf.internal.pageSize.getWidth();
        const pageHeight = pdf.internal.pageSize.getHeight();
        const ratio = Math.min((pageWidth - 10) / canvas.width, (pageHeight - 10) / canvas.height);
        const finalWidth = canvas.width * ratio;
        const finalHeight = canvas.height * ratio;
        const x = (pageWidth - finalWidth) / 2;
        const y = (pageHeight - finalHeight) / 2;
        pdf.addImage(imgData, "PNG", x, y, finalWidth, finalHeight);
        pdf.save(`USA Map ${getFileNameDateTime()}.pdf`);
      } else {
        const link = document.createElement("a");
        link.href = imgData;
        link.download = `USA Map ${getFileNameDateTime()}.${type === "jpeg" ? "jpg" : type}`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsExporting(false);
    }
  };

  const goTo = (page) => {
    setActivePage(page);
    if (window.innerWidth <= 1100) setMenuOpen(false);
  };

  // ---- Map tooltip data ----
  const tooltipState = tooltip.data?.state;
  const tooltipStateData = tooltipState ? mapReportByState[lc(tooltipState)] || {} : {};
  const tooltipTotalJobs = Object.values(tooltipStateData).reduce((sum, val) => sum + (Number(val) || 0), 0);
  const tooltipRegion = tooltipState ? getRegionByState(tooltipState) : null;

  // Tooltip screen ke bahar na jaye (desktop + tablet dono me)
  const tooltipPosition = {
    top: Math.max(8, Math.min(tooltip.y + 10, (typeof window !== "undefined" ? window.innerHeight : 800) - 320)),
    left: Math.max(8, Math.min(tooltip.x + 10, (typeof window !== "undefined" ? window.innerWidth : 1200) - 300)),
  };

  return (
    <div className="page">
      <div className={`topMenu ${menuOpen ? "expanded" : "collapsed"}`}>
        <button className={`menuBtn ${activePage === "dashboard" ? "active" : ""}`} onClick={() => goTo("dashboard")}><FaTachometerAlt className="menuIcon" />{menuOpen && "Dashboard"}</button>
        {/* Data Upload button hidden. Dubara dikhana ho to yaha button add karo aur FaUpload ko react-icons/fa import me wapas jodo. */}
        <button className={`menuBtn ${activePage === "report" ? "active" : ""}`} onClick={() => goTo("report")}><FaChartBar className="menuIcon" />{menuOpen && "Report"}</button>
        {role === "Admin" && <button className={`menuBtn ${activePage === "user-management" ? "active" : ""}`} onClick={() => goTo("user-management")}><FaUsers className="menuIcon" />{menuOpen && "User Management"}</button>}
        {(role === "Admin" || role === "TeamLead") && <button className={`menuBtn ${activePage === "organogram" ? "active" : ""}`} onClick={() => goTo("organogram")}><FaSitemap className="menuIcon" />{menuOpen && "Organogram"}</button>}

        {role === "MIS" && (
          <div className="menuGroupContainer">
            <button
              className={`menuBtn ${(activePage === "jobcreation" || activePage === "jobsubmission" || activePage === "jobhistory") ? "active" : ""}`}
              onClick={() => setExpandedJobMenu(!expandedJobMenu)}
            >
              <FaFolderOpen className="menuIcon" />
              {menuOpen && <span style={{ display: "flex", justifyContent: "space-between", width: "100%", alignItems: "center" }}>Job Record Management <span style={{ fontSize: "11px" }}>{expandedJobMenu ? "▲" : "▼"}</span></span>}
            </button>
            {((menuOpen && expandedJobMenu) || !menuOpen) && (
              <div className="subMenuContainer" style={menuOpen ? { paddingLeft: "20px", display: "flex", flexDirection: "column", gap: "4px", marginTop: "4px" } : {}}>
                <button className={`menuBtn subMenuBtn ${activePage === "jobcreation" ? "active" : ""}`} onClick={() => goTo("jobcreation")}><FaPlusCircle className="menuIcon" style={{ fontSize: "16px" }} />{menuOpen && "Job Creation"}</button>
                <button className={`menuBtn subMenuBtn ${activePage === "jobsubmission" ? "active" : ""}`} onClick={() => goTo("jobsubmission")}><FaPaperPlane className="menuIcon" style={{ fontSize: "16px" }} />{menuOpen && "Job Submission"}</button>
                <button className={`menuBtn subMenuBtn ${activePage === "jobhistory" ? "active" : ""}`} onClick={() => goTo("jobhistory")}><FaHistory className="menuIcon" style={{ fontSize: "16px" }} />{menuOpen && "Job History"}</button>
              </div>
            )}
          </div>
        )}

        {(role === "Admin" || role === "TeamLead") && <button className={`menuBtn ${activePage === "workstatus" ? "active" : ""}`} onClick={() => goTo("workstatus")}><FaClock className="menuIcon" />{menuOpen && "Timesheet / Work Status"}</button>}

        {role === "MIS" && (
          <>
            <button className={`menuBtn ${activePage === "capacityforecast" ? "active" : ""}`} onClick={() => goTo("capacityforecast")}><FaChartLine className="menuIcon" />{menuOpen && "Capacity / Forecast"}</button>
            <button className={`menuBtn ${activePage === "domaincreation" ? "active" : ""}`} onClick={() => goTo("domaincreation")}><FaLayerGroup className="menuIcon" />{menuOpen && "Domain Creation"}</button>
          </>
        )}
      </div>

      <div className="mainContentContainer">
        <div className="menu-icon-container">
          <div className={`menu-icon ${menuOpen ? "" : "active"}`} onClick={() => setMenuOpen(!menuOpen)}>
            <span className="bar1"></span>
            <span className="bar2"></span>
            <span className="bar3"></span>
          </div>
        </div>

        {activePage === "dashboard" && (
          <>
            <div className="tmFilterBar" style={{ flexShrink: 0, height: "auto", overflow: "visible" }}>
              <div className="tmFilterField tmFilterFieldMonth">
                <label className="tmFilterLabel">Select Month & Year</label>
                <select className="tmFilterSelect" value={selectedMonth ? `${selectedMonth.month}-${selectedMonth.year}` : ""} onChange={(e) => { if (e.target.value) { const [month, year] = e.target.value.split("-"); setSelectedMonth({ month, year: Number(year) }); } else { setSelectedMonth(null); } }}>
                  <option value="">All Months</option>
                  {monthsList.map((m) => <option key={m} value={`${m}-${currentYear}`}>{m} - {currentYear}</option>)}
                </select>
              </div>
              <div className="tmFilterField">
                <label className="tmFilterLabel">From Date</label>
                <input type="date" className="tmFilterInput" value={fromDate} max={toDate || undefined} onChange={(e) => setFromDate(e.target.value)} />
              </div>
              <div className="tmFilterField">
                <label className="tmFilterLabel">To Date</label>
                <input type="date" className="tmFilterInput" value={toDate} min={fromDate || undefined} onChange={(e) => setToDate(e.target.value)} />
              </div>
              <button type="button" className="tmFilterResetBtn" onClick={resetDateFilters}>Reset</button>
            </div>

            <div className="kpiContainer">
              <div className="kpiHeaderRow">
                <h2 className="kpiTitle">📊 KPI - Job Delivery / Amdocs QC / OTP Summary</h2>
                <button type="button" className="kpiTrendBtn" title="Open OTP / QC trend" onClick={() => setShowTrendModal(true)}><span aria-hidden="true">📈</span> OTP / QC Trend</button>
              </div>
              <div className="kpiGridModern">
                {mergedDomains.map((domain) => {
                  const color = DOMAIN_COLORS[domain] || "#6366f1";
                  const qcAvg = getDomainQcAvg(domain);
                  const otpPct = getDomainOtpPercent(domain);
                  return (
                    <div key={domain} className="kpiCardModern" style={{ "--themeColor": color }}>
                      <button type="button" className="kpiEyeBtnLeft" aria-label={`${domain} status report`} title={`${domain} status report`} onClick={(e) => { e.stopPropagation(); handleKpiReport(domain); }} style={{ background: `${color}15`, border: `1px solid ${color}70`, color: color }}>𝑖</button>
                      <div className="kpiContent">
                        <div className="kpiDomainModern">{domain}</div>
                        <div className="kpiSubModern">{getDomainUomText(domain)}</div>
                        <div className="kpiQcOtpRow" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "nowrap", gap: "6px", margin: "8px 0 4px" }}>
                          <span style={getPerfBoxStyle(qcAvg ?? 0)}>Amdocs QC: {qcAvg !== null ? `${qcAvg}%` : "0%"}</span>
                          <span style={getPerfBoxStyle(otpPct ?? 0)}>OTP: {otpPct !== null ? `${otpPct}%` : "0%"}</span>
                        </div>
                        <div className="kpiValueModern">{getDomainJobs(domain)}<span> Jobs</span></div>
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
                  <img src="https://upload.wikimedia.org/wikipedia/commons/1/1a/Brosen_windrose.svg" alt="Compass" className="resized-image" crossOrigin="anonymous" />
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
                <div className="mapBox" ref={mapBoxRef}>
                  <ComposableMap className="usMap" projection="geoAlbersUsa" width={1000} height={600} style={{ width: "100%", height: "100%" }}>
                    <Geographies geography={geoData}>
                      {({ geographies, projection }) => (
                        <>
                          {geographies.map((geo) => {
                            const name = geo.properties.name;
                            return (
                              <Geography
                                key={geo.rsmKey}
                                geography={geo}
                                fill={getStateColor(name)}
                                stroke="#2B2727"
                                strokeWidth={isCompact && !isExporting ? 0.7 : 0.8}
                                vectorEffect={isCompact && !isExporting ? "non-scaling-stroke" : undefined}
                                style={{ default: { outline: "none" }, hover: { outline: "none", stroke: "#64748b", strokeWidth: isCompact && !isExporting ? 1.4 : 1.5 }, pressed: { outline: "none" } }}
                                onPointerDown={(evt) => { pointerTypeRef.current = evt.pointerType; }}
                                onPointerEnter={(evt) => { if (evt.pointerType === "mouse") handleStateHover(name, evt); }}
                                onPointerMove={(evt) => { if (evt.pointerType === "mouse") setTooltip((prev) => (prev.visible ? { ...prev, x: evt.clientX, y: evt.clientY } : prev)); }}
                                onPointerLeave={(evt) => { if (evt.pointerType === "mouse") setTooltip(CLOSED_TOOLTIP); }}
                                onClick={(evt) => { if (pointerTypeRef.current !== "mouse") handleStateTap(name, evt); }}
                              />
                            );
                          })}
                          {geographies.map((geo) => {
                            const name = geo.properties.name;
                            if (isPhone && !isExporting && CROWDED_LABELS.includes(name)) return null;
                            const shortName = getShortStateName(name);
                            const centroid = geoCentroid(geo);
                            const projected = projection(centroid);
                            if (!projected) return null;
                            const [x, y] = projected;
                            const k = labelK;
                            return (
                              <g key={`${geo.rsmKey}-label`} style={{ pointerEvents: "none" }}>
                                <rect x={x - 14 * k} y={y - 10 * k} width={28 * k} height={20 * k} rx={5 * k} fill={getLabelBgColor(name)} style={{ filter: "drop-shadow(0 3px 6px rgba(0,0,0,0.25))" }} />
                                <text x={x} y={y + 1 * k} textAnchor="middle" dominantBaseline="middle" style={{ fontSize: `${11 * k}px`, fontWeight: "700", fill: getLabelTextColor(), pointerEvents: "none", fontFamily: "Arial" }}>{shortName}</text>
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
                      {REGIONS.map((r) => <option key={r} value={r}>{r}</option>)}
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
                    {mergedDomains.map((d) => (
                      <div key={d} style={{ marginBottom: "12px" }}>
                        <label style={{ cursor: "pointer", display: "flex", alignItems: "center" }} onClick={() => toggleExpand(d)}>
                          <input type="checkbox" checked={selectedDomains.includes(d)} onClick={(e) => e.stopPropagation()} onChange={() => toggleFilter(d, setSelectedDomains)} />
                          <strong style={{ marginLeft: "8px" }}>{d}</strong>
                        </label>
                        {(expandedDomains[d] && SUB_DOMAINS_MAP[d]) && (
                          <div style={{ marginLeft: "25px", marginTop: "5px" }}>
                            {SUB_DOMAINS_MAP[d].map((sub) => (
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
              </div>
            </div>

            <div className="bottomChartsRow">
              <div className="chartBox">
                <h3 className="chartTitle" style={{ marginBottom: "6px" }}>📊 Month Wise Job Delivery, Amdocs QC & OTP</h3>
                <ResponsiveContainer width="100%" height={350}>
                  <BarChart data={monthlyJobsSorted} barGap={0} barCategoryGap={25}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" interval={0} angle={-45} textAnchor="end" height={60} />
                    <YAxis allowDecimals={false} />
                    <Tooltip content={<BarChartTooltip />} />
                    <Legend />
                    {allYears.map((year, index) => (
                      <Bar key={year} dataKey={year} stackId="a" fill={COLORS[index % COLORS.length]} name={year} barSize={viewportWidth < 768 ? 18 : 35} radius={[6, 6, 0, 0]} />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="chartBox">
                <h3 className="chartTitle" style={{ marginBottom: "6px" }}>🥧 Domain % Share (Job, Amdocs QC & OTP)</h3>
                <ResponsiveContainer width="100%" height={360}>
                  <PieChart>
                    <Pie
                      data={pieChartData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={viewportWidth < 768 ? 80 : 120}
                      innerRadius={0}
                      paddingAngle={pieChartData.length > 1 ? 2 : 0}
                      stroke="#fff"
                      strokeWidth={2}
                      startAngle={90}
                      endAngle={-270}
                      isAnimationActive={true}
                      animationBegin={0}
                      animationDuration={1000}
                      animationEasing="ease-out"
                      label={false}
                      labelLine={false}
                    >
                      {pieChartData.map((entry) => (
                        <Cell key={entry.name} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip content={<PieChartTooltip />} />
                    <Legend content={() => (
                      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", flexWrap: "wrap", gap: "14px", marginTop: "10px", fontSize: "13px", fontWeight: "600" }}>
                        {pieAll.length === 0 && <div style={{ color: "#64748b" }}>No data available</div>}
                        {pieAll.length > 0 && (
                          <div onClick={() => setHiddenDomains([])} style={{ display: "flex", alignItems: "center", gap: "6px", cursor: "pointer" }}><span style={{ width: "16px", height: "10px", borderRadius: "2px", background: "#111827", display: "inline-block" }}></span>ALL</div>
                        )}
                        {pieAll.map((entry) => {
                          const isHidden = hiddenDomains.includes(entry.name);
                          return (
                            <div
                              key={entry.name}
                              onClick={() => setHiddenDomains((prev) => (prev.includes(entry.name) ? prev.filter((x) => x !== entry.name) : [...prev, entry.name]))}
                              style={{ display: "flex", alignItems: "center", gap: "6px", cursor: "pointer", opacity: isHidden ? 0.4 : 1, textDecoration: isHidden ? "line-through" : "none" }}
                            >
                              <span style={{ width: "16px", height: "10px", borderRadius: "2px", background: entry.color, display: "inline-block" }}></span>{entry.name}
                            </div>
                          );
                        })}
                      </div>
                    )} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          </>
        )}

        {activePage === "workupdate" && (<div className="belowSection"><WorkUpdate refreshDashboard={fetchAllData} /></div>)}
        {activePage === "report" && <div className="belowSection"><Report /></div>}
        {activePage === "user-management" && <div className="belowSection"><UserManagement /></div>}
        {activePage === "organogram" && <div className="belowSection"><Organogram /></div>}
        {activePage === "jobcreation" && <div className="belowSection"><JobCreation /></div>}
        {activePage === "jobsubmission" && <div className="belowSection"><JobSubmission /></div>}
        {activePage === "workstatus" && <div className="belowSection"><TimesheetManagement /></div>}
        {activePage === "jobhistory" && <div className="belowSection"><JobHistory /></div>}
        {activePage === "capacityforecast" && <div className="belowSection"><CapacityForecast /></div>}
        {activePage === "domaincreation" && <div className="belowSection"><MasterDomainCreation /></div>}
      </div>

      {tooltip.visible && (
        <div
          className={`tooltipBox${isSheetTooltip ? " tooltipSheet" : ""}`}
          style={isSheetTooltip ? undefined : tooltipPosition}
        >
          <div style={{ display: "flex", justifyContent: "space-between", padding: "10px", background: "#f1f5f9", fontWeight: "700" }}>
            <div style={{ fontSize: "14px", color: "#0f4a63" }}>{tooltipRegion ? `${tooltipRegion} - ` : ""}{tooltipState}</div>
            <div style={{ fontSize: "12px", color: "#166534", fontWeight: "700", marginLeft: "auto", whiteSpace: "nowrap" }}>{tooltipTotalJobs > 0 ? `Total Jobs: ${tooltipTotalJobs}` : "N/A"}</div>
            {isSheetTooltip && (
              <button type="button" className="tooltipClose" aria-label="Close" onClick={() => setTooltip(CLOSED_TOOLTIP)}><FaTimes /></button>
            )}
          </div>
          <div style={{ padding: "10px" }}>
            {Object.entries(tooltipStateData)
              .filter(([, jobs]) => Number(jobs) > 0)
              .map(([d, jobs]) => {
                // state + domain lookup case-insensitive
                const domainStat = stateDomainStatsMap[lc(tooltipState)]?.[normalize(d)];
                const qc = domainStat && domainStat.qcCount > 0 ? Math.round(domainStat.qcSum / domainStat.qcCount) : null;
                const otp = domainStat && domainStat.otpTotal > 0 ? Math.round((domainStat.otp / domainStat.otpTotal) * 100) : null;
                return (
                  <div key={d} style={{ marginBottom: "8px", borderBottom: "1px solid #eee", paddingBottom: "5px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontWeight: "700", fontSize: "13px", marginBottom: "2px" }}>
                      <span>{d}</span>
                      <span style={{ color: "#16a34a", fontWeight: "700" }}>{jobs} Jobs</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", fontWeight: "600" }}>
                      <span style={{ color: getPerfColor(qc ?? 0) }}>QC: {qc !== null ? `${qc}%` : "0%"}</span>
                      <span style={{ color: getPerfColor(otp ?? 0) }}>OTP: {otp !== null ? `${otp}%` : "0%"}</span>
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {showTrendModal && (
        <KpiTrendModal data={allWorkData} domains={mergedDomains} onClose={() => setShowTrendModal(false)} />
      )}

      {showKpiModal && (
        <div className="modalOverlay" onClick={closeKpiModal}>
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
                <button type="button" className="closeBtn" aria-label="Close" title="Close" onClick={closeKpiModal}><FaTimes /></button>
              </div>
            </div>
            <div className="modalBody">
              <Reports domain={selectedKpiDomain} states={selectedFilterStates} monthData={selectedMonth} month={selectedMonth?.month} year={selectedMonth?.year} onClose={closeKpiModal} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
