import React, { useState, useMemo, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, LabelList, ReferenceLine
} from "recharts";
import { FaDownload } from "react-icons/fa";
import html2canvas from "html2canvas";
import "../style/kpitrend.css";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const QC_COLOR = "#2563eb";   // blue
const OTP_COLOR = "#111827";  // black

const normalize = (d) => (d || "").toString().trim().toUpperCase();

const parsePercent = (val) => {
  if (val === null || val === undefined || val === "") return null;
  const num = parseFloat(val.toString().replace("%", "").trim());
  if (isNaN(num)) return null;
  return num > 0 && num <= 1 ? Math.round(num * 100) : Math.round(num);
};

const isOtpMet = (val) => {
  if (val === null || val === undefined || val === "") return false;
  const str = val.toString().trim().toLowerCase();
  if (["yes", "y", "met", "true", "ok", "pass", "passed"].includes(str)) return true;
  if (["no", "n", "not met", "false", "fail", "failed", "0"].includes(str)) return false;
  const num = parseFloat(str.replace("%", ""));
  return !isNaN(num) && num > 0;
};

export default function KpiTrendModal({ data = [], domains = [], onClose }) {
  const [selectedDomain, setSelectedDomain] = useState("ALL");
  const [showExportMenu, setShowExportMenu] = useState(false);
  const chartRef = useRef(null);
  const currentYear = new Date().getFullYear();

  // Lock background page scroll while popup is open
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  // Close popup with Esc key
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose && onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Month-Year wise QC % and OTP %
  const chartData = useMemo(() => {
    const bucket = {}; // key -> { year, monthIdx, qcSum, qcCount, otpMet, total }

    (Array.isArray(data) ? data : []).forEach((item) => {
      if (selectedDomain !== "ALL" && normalize(item.domain) !== selectedDomain) return;

      const qcVal = parsePercent(item.amdocsQc || item.amdocs_qc);
      const otpMet = isOtpMet(item.otp);

      (Array.isArray(item.months) ? item.months : []).forEach((m) => {
        if (!m) return;
        const [monthRaw, yearRaw] = String(m).split(",");
        const monthIdx = MONTHS.findIndex(
          (x) => x.toLowerCase() === String(monthRaw || "").trim().slice(0, 3).toLowerCase()
        );
        if (monthIdx < 0) return;
        const y = String(yearRaw || "").trim();
        const year = y.length === 2 ? Number(`20${y}`) : Number(y || currentYear);
        const key = `${year}-${String(monthIdx).padStart(2, "0")}`;

        if (!bucket[key]) bucket[key] = { year, monthIdx, qcSum: 0, qcCount: 0, otpMet: 0, total: 0 };
        if (qcVal !== null) {
          bucket[key].qcSum += qcVal;
          bucket[key].qcCount += 1;
        }
        bucket[key].total += 1;
        if (otpMet) bucket[key].otpMet += 1;
      });
    });

    return Object.keys(bucket)
      .sort()
      .map((key) => {
        const b = bucket[key];
        return {
          label: `${MONTHS[b.monthIdx]} ${b.year}`,
          QC: b.qcCount > 0 ? Math.round(b.qcSum / b.qcCount) : 0,       // no QC -> 0%
          OTP: b.total > 0 ? Math.round((b.otpMet / b.total) * 100) : 0, // no OTP -> 0%
        };
      });
  }, [data, selectedDomain, currentYear]);

  const domainTitle = selectedDomain === "ALL" ? "All Domains" : selectedDomain;

  const getFileNameDateTime = () => {
    const n = new Date();
    const p = (v) => String(v).padStart(2, "0");
    return `${n.getFullYear()}-${p(n.getMonth() + 1)}-${p(n.getDate())} ${p(n.getHours())}.${p(n.getMinutes())}.${p(n.getSeconds())}`;
  };

  // Download chart as PNG / JPG
  const exportChart = async (type) => {
    setShowExportMenu(false);
    if (!chartRef.current) return;
    try {
      await new Promise((res) => setTimeout(res, 150));
      const canvas = await html2canvas(chartRef.current, {
        scale: 2,
        useCORS: true,
        backgroundColor: "#ffffff",
        ignoreElements: (el) => el.hasAttribute && el.hasAttribute("data-export-ignore"),
      });
      const mime = type === "jpg" ? "image/jpeg" : "image/png";
      const link = document.createElement("a");
      link.href = canvas.toDataURL(mime, 0.95);
      link.download = `KPI Trend ${domainTitle} ${getFileNameDateTime()}.${type}`;
      link.click();
    } catch (err) {
      console.error("Trend chart export failed:", err);
    }
  };

  const TrendTooltip = ({ active, payload, label }) => {
    if (!active || !payload || !payload.length) return null;
    return (
      <div className="ktmTooltip">
        <div className="ktmTooltipTitle">{label}</div>
        {payload.map((p) => (
          <div key={p.dataKey} className="ktmTooltipRow">
            <span className="ktmDot" style={{ background: p.color }}></span>
            <span>{p.name}:</span>
            <b>{p.value}%</b>
          </div>
        ))}
      </div>
    );
  };

  return createPortal(
    <div className="ktmOverlay" onClick={onClose}>
      <div className="ktmModal" onClick={(e) => { e.stopPropagation(); setShowExportMenu(false); }}>
        {/* ---------- Header ---------- */}
        <div className="ktmHeader">
          <div className="ktmHeaderLeft">
            <div className="ktmHeaderIcon">📈</div>
            <div>
              <div className="ktmHeaderSmall">KPI Trend</div>
              <div className="ktmHeaderMain">OTP / Amdocs QC - Month & Year Wise</div>
            </div>
          </div>
          <button className="ktmCloseBtn" onClick={onClose} aria-label="Close">✖</button>
        </div>

        {/* ---------- Domain dropdown ---------- */}
        <div className="ktmToolbar">
          <div className="ktmField">
            <label className="ktmLabel">Select Domain</label>
            <select
              className="ktmSelect"
              value={selectedDomain}
              onChange={(e) => setSelectedDomain(e.target.value)}
            >
              <option value="ALL">All Domains</option>
              {(domains || []).map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>
          <div className="ktmColorRule">
            <span className="ktmRuleItem"><i style={{ background: "#16a34a" }}></i>90-100%</span>
            <span className="ktmRuleItem"><i style={{ background: "#d97706" }}></i>80-90%</span>
            <span className="ktmRuleItem"><i style={{ background: "#dc2626" }}></i>Below 80%</span>
          </div>
        </div>

        {/* ---------- Chart card (this whole box is exported) ---------- */}
        <div className="ktmChartCard" ref={chartRef}>
          <div className="ktmChartTop">
            <h3 className="ktmChartTitle">{domainTitle} - OTP & Amdocs QC (%)</h3>

            {/* Export icon (not included in the downloaded image) */}
            <div className="ktmExport" data-export-ignore="true" onClick={(e) => e.stopPropagation()}>
              <button
                type="button"
                className="ktmExportBtn"
                title="Download chart"
                aria-label="Download chart"
                onClick={() => setShowExportMenu((v) => !v)}
              >
                <FaDownload />
              </button>
              {showExportMenu && (
                <div className="ktmExportMenu">
                  <div onClick={() => exportChart("png")}>PNG</div>
                  <div onClick={() => exportChart("jpg")}>JPG</div>
                </div>
              )}
            </div>
          </div>

          {chartData.length === 0 ? (
            <div className="ktmEmpty">No data available for {domainTitle}</div>
          ) : (
            <ResponsiveContainer width="100%" height={380}>
              <LineChart data={chartData} margin={{ top: 28, right: 30, left: 0, bottom: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis
                  dataKey="label"
                  interval={0}
                  angle={chartData.length > 6 ? -35 : 0}
                  textAnchor={chartData.length > 6 ? "end" : "middle"}
                  height={chartData.length > 6 ? 70 : 40}
                  tick={{ fontSize: 12, fill: "#334155" }}
                  label={{ value: "Month - Year", position: "insideBottom", offset: chartData.length > 6 ? -2 : -6, fontSize: 12, fill: "#64748b" }}
                />
                <YAxis
                  domain={[0, 100]}
                  ticks={[0, 20, 40, 60, 80, 100]}
                  tickFormatter={(v) => `${v}%`}
                  tick={{ fontSize: 12, fill: "#334155" }}
                  label={{ value: "Percentage (%)", angle: -90, position: "insideLeft", offset: 10, fontSize: 12, fill: "#64748b" }}
                />
                <ReferenceLine y={90} stroke="#16a34a" strokeDasharray="5 4" strokeOpacity={0.6} />
                <ReferenceLine y={80} stroke="#d97706" strokeDasharray="5 4" strokeOpacity={0.6} />
                <Tooltip content={<TrendTooltip />} />
                <Legend verticalAlign="top" height={36} iconType="plainline" wrapperStyle={{ fontSize: 13, fontWeight: 700 }} />
                <Line
                  type="monotone"
                  dataKey="QC"
                  name="Amdocs QC %"
                  stroke={QC_COLOR}
                  strokeWidth={3}
                  dot={{ r: 5, fill: QC_COLOR, stroke: "#fff", strokeWidth: 2 }}
                  activeDot={{ r: 7 }}
                  isAnimationActive={false}
                >
                  <LabelList dataKey="QC" position="top" formatter={(v) => `${v}%`} style={{ fontSize: 11, fontWeight: 700, fill: QC_COLOR }} />
                </Line>
                <Line
                  type="monotone"
                  dataKey="OTP"
                  name="OTP %"
                  stroke={OTP_COLOR}
                  strokeWidth={3}
                  dot={{ r: 5, fill: OTP_COLOR, stroke: "#fff", strokeWidth: 2 }}
                  activeDot={{ r: 7 }}
                  isAnimationActive={false}
                >
                  <LabelList dataKey="OTP" position="bottom" formatter={(v) => `${v}%`} style={{ fontSize: 11, fontWeight: 700, fill: OTP_COLOR }} />
                </Line>
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
