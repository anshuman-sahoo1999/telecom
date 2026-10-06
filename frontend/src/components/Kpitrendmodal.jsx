import React, { useState, useMemo, useRef, useEffect, useCallback } from "react";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, LabelList
} from "recharts";
import { FaDownload, FaTimes } from "react-icons/fa";
import html2canvas from "html2canvas";
import "../style/kpitrend.css";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const QC_COLOR = "#2563eb";
const OTP_COLOR = "#111827";
const SERIES = [
  { key: "QC", name: "Amdocs QC %", color: QC_COLOR },
  { key: "OTP", name: "OTP %", color: OTP_COLOR },
];

const normalize = (d) => (d ?? "").toString().trim().toUpperCase();

const firstFilled = (...vals) =>
  vals.find((v) => v !== null && v !== undefined && String(v).trim() !== "");

const parsePercent = (val) => {
  if (val === null || val === undefined || val === "") return null;
  const num = parseFloat(val.toString().replace("%", "").trim());
  if (isNaN(num)) return null;
  const pct = num > 0 && num <= 1 ? num * 100 : num;
  return Math.min(100, Math.max(0, Math.round(pct)));
};

// OTP: blank = no data (skip), yes/no = 100/0, number/percent = value
const parseOtp = (val) => {
  if (val === null || val === undefined) return null;
  const str = val.toString().trim().toLowerCase();
  if (str === "" || ["-", "na", "n/a", "null", "undefined"].includes(str)) return null;
  if (["yes", "y", "met", "true", "ok", "pass", "passed"].includes(str)) return 100;
  if (["no", "n", "not met", "false", "fail", "failed"].includes(str)) return 0;
  return parsePercent(str);
};

const parseMonthYear = (m, fallbackYear) => {
  const match = String(m).trim().match(/^([A-Za-z]{3,})\W*(\d{2,4})?$/);
  if (!match) return null;
  const monthIdx = MONTHS.findIndex((x) => x.toLowerCase() === match[1].slice(0, 3).toLowerCase());
  if (monthIdx < 0) return null;
  let year = fallbackYear;
  if (match[2]) year = match[2].length === 2 ? 2000 + Number(match[2]) : Number(match[2]);
  if (!Number.isFinite(year)) return null;
  return { monthIdx, year };
};

const TrendTooltip = ({ active, payload, label }) => {
  if (!active || !payload || !payload.length) return null;
  const rows = payload.filter((p) => p.value !== null && p.value !== undefined);
  if (!rows.length) return null;
  return (
    <div className="ktmTooltip">
      <div className="ktmTooltipTitle">{label}</div>
      {rows.map((p) => (
        <div key={p.dataKey} className="ktmTooltipRow">
          <span className="ktmDot" style={{ background: p.color }}></span>
          <span>{p.name}:</span>
          <b>{p.value}%</b>
        </div>
      ))}
    </div>
  );
};

export default function KpiTrendModal({ data = [], domains = [], onClose }) {
  const currentYear = new Date().getFullYear();
  const [selectedDomain, setSelectedDomain] = useState("ALL");
  const [selectedYear, setSelectedYear] = useState(String(currentYear));
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [exporting, setExporting] = useState(false);
  const chartRef = useRef(null);
  const closeBtnRef = useRef(null);
  const handleClose = useCallback(() => {
    if (typeof onClose === "function") onClose();
  }, [onClose]);

  const domainList = useMemo(() => {
    const seen = new Set();
    const list = [];
    (Array.isArray(domains) ? domains : []).forEach((d) => {
      const key = normalize(d);
      if (!key || seen.has(key)) return;
      seen.add(key);
      list.push(String(d).trim());
    });
    return list;
  }, [domains]);

  const yearList = useMemo(() => {
    const set = new Set([currentYear]);
    (Array.isArray(data) ? data : []).forEach((item) => {
      (Array.isArray(item?.months) ? item.months : []).forEach((m) => {
        if (!m) return;
        const parsed = parseMonthYear(m, currentYear);
        if (parsed) set.add(parsed.year);
      });
    });
    return Array.from(set).sort((a, b) => a - b).map(String);
  }, [data, currentYear]);

  const activeYear = yearList.includes(selectedYear) ? selectedYear : String(currentYear);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      if (showExportMenu) setShowExportMenu(false);
      else handleClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [handleClose, showExportMenu]);

  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    const prevFocus = document.activeElement;
    document.body.style.overflow = "hidden";
    if (closeBtnRef.current) closeBtnRef.current.focus();
    return () => {
      document.body.style.overflow = prevOverflow;
      if (prevFocus && typeof prevFocus.focus === "function") prevFocus.focus();
    };
  }, []);

  const chartData = useMemo(() => {
    const yearNum = Number(activeYear);
    const bucket = {};
    const wanted = normalize(selectedDomain);

    (Array.isArray(data) ? data : []).forEach((item) => {
      if (!item) return;
      if (selectedDomain !== "ALL" && normalize(item.domain) !== wanted) return;

      const qcVal = parsePercent(firstFilled(item.amdocsQc, item.amdocs_qc));
      const otpVal = parseOtp(item.otp);
      const seen = new Set();

      (Array.isArray(item.months) ? item.months : []).forEach((m) => {
        if (!m) return;
        const parsed = parseMonthYear(m, currentYear);
        if (!parsed || parsed.year !== yearNum) return;
        const { monthIdx } = parsed;
        if (seen.has(monthIdx)) return;
        seen.add(monthIdx);

        if (!bucket[monthIdx]) bucket[monthIdx] = { qcSum: 0, qcCount: 0, otpSum: 0, otpCount: 0 };
        if (qcVal !== null) {
          bucket[monthIdx].qcSum += qcVal;
          bucket[monthIdx].qcCount += 1;
        }
        if (otpVal !== null) {
          bucket[monthIdx].otpSum += otpVal;
          bucket[monthIdx].otpCount += 1;
        }
      });
    });

    return MONTHS.map((month, idx) => {
      const b = bucket[idx];
      if (!b) return { label: month, QC: null, OTP: null };
      return {
        label: month,
        QC: b.qcCount > 0 ? Math.round(b.qcSum / b.qcCount) : null,
        OTP: b.otpCount > 0 ? Math.round(b.otpSum / b.otpCount) : null,
      };
    });
  }, [data, selectedDomain, activeYear, currentYear]);

  const hasData = chartData.some((r) => r.QC !== null || r.OTP !== null);
  const domainTitle = selectedDomain === "ALL" ? "All Domains" : selectedDomain;

  const getFileNameDateTime = () => {
    const n = new Date();
    const p = (v) => String(v).padStart(2, "0");
    return `${n.getFullYear()}-${p(n.getMonth() + 1)}-${p(n.getDate())} ${p(n.getHours())}.${p(n.getMinutes())}.${p(n.getSeconds())}`;
  };

  const exportChart = async (type) => {
    setShowExportMenu(false);
    if (!chartRef.current || exporting) return;
    setExporting(true);
    try {
      await new Promise((res) => setTimeout(res, 150));
      const canvas = await html2canvas(chartRef.current, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: "#ffffff",
        ignoreElements: (el) => el.hasAttribute && el.hasAttribute("data-export-ignore"),
      });
      const mime = type === "jpg" ? "image/jpeg" : "image/png";
      const safeTitle = domainTitle.replace(/[\\/:*?"<>|]/g, "-");
      const link = document.createElement("a");
      link.href = canvas.toDataURL(mime, 0.95);
      link.download = `KPI Trend ${safeTitle} ${activeYear} ${getFileNameDateTime()}.${type}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      console.error("Trend chart export failed:", err);
    } finally {
      setExporting(false);
    }
  };

  const renderPointLabel = (seriesKey, color) => (props) => {
    const { x, y, value, index } = props;
    if (x === null || x === undefined || y === null || y === undefined) return null;
    if (value === null || value === undefined) return null;
    const row = chartData[index];
    if (!row) return null;
    const other = seriesKey === "QC" ? row.OTP : row.QC;
    const above =
      other === null || other === undefined || value > other || (value === other && seriesKey === "QC");
    return (
      <text
        x={x}
        y={above ? y - 11 : y + 19}
        textAnchor="middle"
        fontSize={11}
        fontWeight={700}
        fill={color}
        stroke="#ffffff"
        strokeWidth={3}
        paintOrder="stroke"
      >
        {`${value}%`}
      </text>
    );
  };

  return (
    <div
      className="ktmOverlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
    >
      <div
        className="ktmModal"
        role="dialog"
        aria-modal="true"
        aria-label="KPI Trend"
        onClick={() => setShowExportMenu(false)}
      >
        <div className="ktmHeader">
          <div className="ktmHeaderLeft">
            <div className="ktmHeaderIcon" aria-hidden="true">📈</div>
            <div className="ktmHeaderText">
              <div className="ktmHeaderSmall">KPI Trend</div>
              <div className="ktmHeaderMain">OTP / Amdocs QC </div>
            </div>
          </div>
          <button
            type="button"
            ref={closeBtnRef}
            className="ktmCloseBtn"
            onClick={handleClose}
            aria-label="Close"
            title="Close"
          >
            <FaTimes />
          </button>
        </div>

        <div className="ktmToolbar">
          <div className="ktmField">
            <label className="ktmLabel" htmlFor="ktmDomainSelect">Select Domain</label>
            <select
              id="ktmDomainSelect"
              className="ktmSelect"
              value={selectedDomain}
              onChange={(e) => setSelectedDomain(e.target.value)}
            >
              <option value="ALL">All Domains</option>
              {domainList.map((d) => (
                <option key={normalize(d)} value={d}>{d}</option>
              ))}
            </select>
          </div>
          <div className="ktmField">
            <label className="ktmLabel" htmlFor="ktmYearSelect">Select Year</label>
            <select
              id="ktmYearSelect"
              className="ktmSelect"
              value={activeYear}
              onChange={(e) => setSelectedYear(e.target.value)}
            >
              {yearList.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="ktmChartCard" ref={chartRef}>
          <div className="ktmChartTop">
            <h3 className="ktmChartTitle">
              {domainTitle} - OTP &amp; Amdocs QC (%) - {activeYear}
            </h3>

            <div className="ktmExport" data-export-ignore="true" onClick={(e) => e.stopPropagation()}>
              <button
                type="button"
                className="ktmExportBtn"
                title="Download chart"
                aria-label="Download chart"
                aria-haspopup="menu"
                aria-expanded={showExportMenu}
                disabled={exporting || !hasData}
                onClick={() => setShowExportMenu((v) => !v)}
              >
                <FaDownload />
              </button>
              {showExportMenu && (
                <div className="ktmExportMenu" role="menu">
                  <button type="button" role="menuitem" onClick={() => exportChart("png")}>PNG</button>
                  <button type="button" role="menuitem" onClick={() => exportChart("jpg")}>JPG</button>
                </div>
              )}
            </div>
          </div>

          <div className="ktmLegend">
            {SERIES.map((s) => (
              <span key={s.key} className="ktmLegendItem">
                <span className="ktmLegendLine" style={{ background: s.color }}>
                  <span className="ktmLegendDot" style={{ background: s.color }}></span>
                </span>
                {s.name}
              </span>
            ))}
          </div>

          {!hasData ? (
            <div className="ktmEmpty">No data available for {domainTitle} in {activeYear}</div>
          ) : (
            <div className="ktmChartBox">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 22, right: 24, left: 0, bottom: 6 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis
                    dataKey="label"
                    interval={0}
                    height={44}
                    tick={{ fontSize: 12, fill: "#334155" }}
                    label={{ value: `Month - ${activeYear}`, position: "insideBottom", offset: -4, fontSize: 12, fill: "#64748b" }}
                  />
                  <YAxis
                    domain={[0, 100]}
                    ticks={[0, 20, 40, 60, 80, 100]}
                    padding={{ top: 6, bottom: 16 }}
                    tickFormatter={(v) => `${v}%`}
                    tick={{ fontSize: 12, fill: "#334155" }}
                    label={{ value: "Percentage (%)", angle: -90, position: "insideLeft", offset: 10, fontSize: 12, fill: "#64748b" }}
                  />
                  <Tooltip content={<TrendTooltip />} />
                  {SERIES.map((s) => (
                    <Line
                      key={s.key}
                      type="monotone"
                      dataKey={s.key}
                      name={s.name}
                      stroke={s.color}
                      strokeWidth={3}
                      connectNulls={false}
                      dot={{ r: 5, fill: s.color, stroke: "#fff", strokeWidth: 2 }}
                      activeDot={{ r: 7 }}
                      isAnimationActive={false}
                    >
                      <LabelList dataKey={s.key} content={renderPointLabel(s.key, s.color)} />
                    </Line>
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
