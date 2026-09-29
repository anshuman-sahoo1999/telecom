import { API_BASE_URL } from "../config";
import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";
import "../style/reports.css";

// ================= STATIC HELPERS =================
const REGION_MAP = {
  Northeast: [
    "Maine", "New Hampshire", "Vermont", "Massachusetts", "Rhode Island", "Connecticut",
    "New York", "New Jersey", "Pennsylvania",
  ],
  Southeast: [
    "Delaware", "Maryland", "Virginia", "West Virginia", "North Carolina", "South Carolina",
    "Georgia", "Florida", "Alabama", "Mississippi", "Tennessee", "Arkansas", "Kentucky", "Louisiana",
  ],
  Midwest: [
    "Ohio", "Michigan", "Indiana", "Illinois", "Wisconsin", "Minnesota", "Iowa", "Missouri",
    "North Dakota", "South Dakota", "Nebraska", "Kansas",
  ],
  Southwest: ["Texas", "Oklahoma", "New Mexico", "Arizona"],
  West: [
    "Colorado", "Wyoming", "Montana", "Idaho", "Utah", "Nevada",
    "California", "Oregon", "Washington", "Alaska", "Hawaii",
  ],
};

const getRegion = (state) => {
  for (const region in REGION_MAP) {
    if (REGION_MAP[region].includes(state)) return region;
  }
  return "Unknown";
};

const MONTH_ORDER = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// Case-insensitive normalizer
const norm = (v) => (v === null || v === undefined ? "" : v.toString().trim().toLowerCase());

// "jan" / "JAN" / "January" -> "Jan"
const normMonth = (m) => {
  const s = norm(m).slice(0, 3);
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : "";
};

// Reads "Jan-25" / "Jan,2025" and returns { month, fullYear } or null
const parseMonthValue = (m) => {
  if (!m) return null;
  const str = String(m);
  const parts = str.includes(",") ? str.split(",") : str.split("-");
  const month = normMonth(parts[0]);
  const year = parts[1]?.trim();
  if (!month || !year) return null;
  const fullYear = year.length === 2 ? `20${year}` : year;
  return { month, fullYear };
};

const latestDateFromRows = (rows) => {
  const dates = rows
    .map(
      (item) =>
        item.updatedAt || item.lastUpdate || item.updated_at ||
        item.last_update || item.date || item.createdAt
    )
    .filter(Boolean)
    .map((d) => new Date(d))
    .filter((d) => !isNaN(d.getTime()));
  if (!dates.length) return null;
  return new Date(Math.max(...dates.map((d) => d.getTime())));
};

// ================= QC / OTP HELPERS =================
const parsePercent = (val) => {
  if (val === null || val === undefined || val === "") return null;
  const num = parseFloat(val.toString().replace("%", "").trim());
  if (isNaN(num)) return null;
  return num > 0 && num <= 1 ? Math.round(num * 100) : Math.round(num);
};

const isOtpMet = (val) => {
  if (val === null || val === undefined || val === "") return null;
  const str = val.toString().trim().toLowerCase();
  if (["yes", "y", "met", "true", "ok", "pass", "passed", "1"].includes(str)) return true;
  if (["no", "n", "not met", "false", "fail", "failed", "0"].includes(str)) return false;
  const num = parseFloat(str.replace("%", ""));
  if (!isNaN(num)) return num > 0;
  return null;
};

// Turns a row's OTP into a percent: numbers stay, Yes/No become 100/0
const getOtpPercent = (val) => {
  if (val === null || val === undefined || val === "") return null;
  const str = val.toString().trim();
  if (str !== "" && !isNaN(parseFloat(str.replace("%", "")))) {
    return parsePercent(str);
  }
  const met = isOtpMet(str);
  if (met === true) return 100;
  if (met === false) return 0;
  return null;
};

// 90-100 green, 80-90 orange, below 80 red, missing = grey
const getPerfColor = (val, fallback = "#444") => {
  if (val === null || val === undefined || isNaN(val)) return fallback;
  if (val >= 90) return "#16a34a";
  if (val >= 80) return "#d97706";
  return "#dc2626";
};

const average = (vals) =>
  vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null;

const getQcRaw = (item) => item.amdocsQc ?? item.amdocs_qc;

export default function Reports({ domain, states }) {
  const [data, setData] = useState([]);
  const [open, setOpen] = useState(false);
  const [selectedPeriod, setSelectedPeriod] = useState("");
  const [lastUpdateMap, setLastUpdateMap] = useState({});

  useEffect(() => {
    const timer = setTimeout(() => setOpen(true), 50);
    return () => clearTimeout(timer);
  }, []);

  // Normalize "states" prop: string, array, or empty
  const selectedStatesNorm = useMemo(() => {
    let list = [];
    if (Array.isArray(states)) list = states.filter(Boolean);
    else if (typeof states === "string" && states !== "All") list = [states];
    return list.map(norm);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Array.isArray(states) ? states.join("|") : states]);

  const matchDomain = (item) => !domain || domain === "All" || norm(item.domain) === norm(domain);
  const matchState = (item) =>
    !selectedStatesNorm.length || selectedStatesNorm.includes(norm(item.state));

  // ================= FETCH LAST UPDATE MAP =================
  useEffect(() => {
    let cancelled = false;
    axios
      .get(`${API_BASE_URL}/api/work/domain-last-update`)
      .then((res) => {
        const mapObj = {};
        const list = Array.isArray(res.data)
          ? res.data
          : Array.isArray(res.data?.data)
          ? res.data.data
          : Array.isArray(res.data?.result)
          ? res.data.result
          : [];
        list.forEach((item) => {
          const domainKey = item.domain || item.Domain;
          const dateVal =
            item.lastUpdate || item.lastUpdated || item.last_update ||
            item.updatedAt || item.updated_at || item.date;
          if (domainKey && dateVal) mapObj[domainKey] = dateVal;
        });
        if (!cancelled) setLastUpdateMap(mapObj);
      })
      .catch((err) => {
        console.log(err);
        if (!cancelled) setLastUpdateMap({});
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // ================= FETCH DATA (once; filtering is client-side) =================
  useEffect(() => {
    let cancelled = false;
    axios
      .get(`${API_BASE_URL}/api/work/all`)
      .then((res) => {
        if (!cancelled) setData(Array.isArray(res.data) ? res.data : []);
      })
      .catch((err) => {
        console.log(err);
        if (!cancelled) setData([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // ================= LAST UPDATE =================
  const overallLastUpdate = (() => {
    const dates = Object.values(lastUpdateMap)
      .filter(Boolean)
      .map((d) => new Date(d))
      .filter((d) => !isNaN(d.getTime()));
    if (dates.length) return new Date(Math.max(...dates.map((d) => d.getTime())));
    return latestDateFromRows(data);
  })();

  const domainLastUpdate = (() => {
    const matchedKey = Object.keys(lastUpdateMap).find((k) => norm(k) === norm(domain));
    if (matchedKey && lastUpdateMap[matchedKey]) return lastUpdateMap[matchedKey];
    return latestDateFromRows(data.filter((item) => norm(item.domain) === norm(domain)));
  })();

  const currentLastUpdate = domain && domain !== "All" ? domainLastUpdate : overallLastUpdate;

  const formattedLastUpdate = currentLastUpdate
    ? new Date(currentLastUpdate).toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : "-";

  // ================= MONTH OPTIONS =================
  const monthYearOptions = Array.from(
    new Set(
      data
        .filter((item) => matchDomain(item) && matchState(item))
        .flatMap((item) =>
          (Array.isArray(item.months) ? item.months : []).map((m) => {
            const parsed = parseMonthValue(m);
            return parsed ? `${parsed.month} ${parsed.fullYear}` : null;
          })
        )
        .filter(Boolean)
    )
  ).sort((a, b) => {
    const [am, ay] = a.split(" ");
    const [bm, by] = b.split(" ");
    if (Number(by) !== Number(ay)) return Number(by) - Number(ay);
    return MONTH_ORDER.indexOf(am) - MONTH_ORDER.indexOf(bm);
  });

  // Reset the selected month if it no longer exists after domain/state change
  useEffect(() => {
    if (selectedPeriod && !monthYearOptions.includes(selectedPeriod)) {
      setSelectedPeriod("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthYearOptions.join("|")]);

  // ================= FILTERED DATA =================
  const filteredData = data.filter((item) => {
    if (!matchDomain(item)) return false;
    if (!matchState(item)) return false;

    if (selectedPeriod) {
      const [selMonth, selYear] = selectedPeriod.split(" ");
      const months = Array.isArray(item.months) ? item.months : [];
      return months.some((m) => {
        const parsed = parseMonthValue(m);
        return parsed && parsed.month === selMonth && parsed.fullYear === selYear;
      });
    }
    return true;
  });

  // ================= TOTALS =================
  const totalJobs = filteredData.length;

  const overallQc = average(
    filteredData.map((x) => parsePercent(getQcRaw(x))).filter((v) => v !== null)
  );

  const overallOtp = average(
    filteredData.map((x) => getOtpPercent(x.otp)).filter((v) => v !== null)
  );

  const qcText = overallQc !== null ? `${overallQc}%` : "-";
  const otpText = overallOtp !== null ? `${overallOtp}%` : "-";
  const qcTotalColor = getPerfColor(overallQc);
  const otpTotalColor = getPerfColor(overallOtp);

  return (
    <div className={`reports ${open ? "open" : "close"}`}>
      {/* ================= FILTER ================= */}
      <div className="rpFilterBar">
        <select
          className="rpMonthSelect"
          value={selectedPeriod}
          onChange={(e) => setSelectedPeriod(e.target.value)}
        >
          <option value="">All Months</option>
          {monthYearOptions.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </div>

      {/* ================= TABLE ================= */}
      <div className="reportsBox">
        {filteredData.length === 0 ? (
          <div className="empty">No data found</div>
        ) : (
          <>
            <div className="rpTableWrap">
              <table className="reportTable">
                <thead>
                  <tr>
                    <th className="colSl">Sl.No</th>
                    <th className="colDomain">Domain</th>
                    <th className="colRegion">Region</th>
                    <th className="colMarket">Market Name</th>
                    <th className="colNum">No.of Job Delivered</th>
                    <th className="colNum">Amdocs QC</th>
                    <th className="colNum">OTP</th>
                  </tr>
                </thead>

                <tbody>
                  {filteredData.map((item, index) => {
                    const qcVal = parsePercent(getQcRaw(item));
                    const otpPct = getOtpPercent(item.otp);
                    const otpRaw =
                      item.otp !== null && item.otp !== undefined && item.otp !== ""
                        ? item.otp.toString()
                        : "-";

                    return (
                      <tr key={item._id || item.id || index}>
                        <td>{index + 1}</td>

                        <td className="domain-cell">
                          <div className="domain-main">{item.domain || "-"}</div>
                          <div className="domain-sub">{item.job_type || "-"}</div>
                        </td>

                        <td>{item.region || getRegion(item.state)}</td>
                        <td>{item.state}</td>

                        <td className="job-cell">
                          <div className="job-main">1</div>
                        </td>

                        <td className="job-cell">
                          <div
                            className="job-main"
                            style={{ color: getPerfColor(qcVal), fontWeight: 700 }}
                          >
                            {qcVal !== null ? `${qcVal}%` : "-"}
                          </div>
                        </td>

                        <td className="job-cell">
                          <div
                            className="job-main"
                            style={{ color: getPerfColor(otpPct), fontWeight: 700 }}
                          >
                            {otpRaw}
                          </div>
                        </td>
                      </tr>
                    );
                  })}

                  {/* TOTAL ROW */}
                  <tr className="totalRow">
                    <td className="totalEmpty"></td>
                    <td className="totalEmpty"></td>
                    <td className="totalEmpty"></td>
                    <td className="totalLabel">Total</td>
                    <td className="highlight">{totalJobs}</td>
                    <td className="highlight" style={{ color: qcTotalColor }}>{qcText}</td>
                    <td className="highlight" style={{ color: otpTotalColor }}>{otpText}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* ================= SUMMARY ================= */}
            <div className="rpSummaryWrap">
              <div className="rpSummaryBox">
                <div className="rpSummaryIcon">📶</div>

                <div className="rpSummaryBody">
                  <div className="rpStats">
                    <div className="rpStat">
                      <div className="rpStatValue" style={{ color: "#991b1b" }}>
                        {totalJobs}
                      </div>
                      <div className="rpStatLabel">Jobs Delivered</div>
                    </div>
                    <div className="rpDivider" />
                    <div className="rpStat">
                      <div className="rpStatValue" style={{ color: qcTotalColor }}>
                        {qcText}
                      </div>
                      <div className="rpStatLabel">Amdocs QC</div>
                    </div>
                    <div className="rpDivider" />
                    <div className="rpStat">
                      <div className="rpStatValue" style={{ color: otpTotalColor }}>
                        {otpText}
                      </div>
                      <div className="rpStatLabel">OTP</div>
                    </div>
                  </div>
                  <div className="rpAsOn">As on - {formattedLastUpdate}</div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
