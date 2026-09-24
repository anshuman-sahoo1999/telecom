import { API_BASE_URL } from "../config";
import React, { useEffect, useState } from "react";
import axios from "axios";
import "../style/reports.css";

export default function Reports({ domain, states }) {
  const [data, setData] = useState([]);
  const [open, setOpen] = useState(false);
  const [selectedPeriod, setSelectedPeriod] = useState("");
  const [lastUpdateMap, setLastUpdateMap] = useState({});

  useEffect(() => {
    setTimeout(() => setOpen(true), 50);
  }, []);

  // ================= REGION FUNCTION =================
  const getRegion = (state) => {
    const map = {
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

    for (let region in map) {
      if (map[region].includes(state)) return region;
    }
    return "Unknown";
  };

  // FETCH LAST UPDATE MAP[cite: 3]
  useEffect(() => {
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
          if (domainKey && dateVal) {
            mapObj[domainKey] = dateVal;
          }
        });
        setLastUpdateMap(mapObj);
      })
      .catch((err) => {
        console.log(err);
        setLastUpdateMap({});
      });
  }, []);

  const overallLastUpdate = (() => {
    const dates = Object.values(lastUpdateMap)
      .filter(Boolean)
      .map((d) => new Date(d))
      .filter((d) => !isNaN(d.getTime()));
    if (dates.length) {
      return new Date(Math.max(...dates.map((d) => d.getTime())));
    }

    // Fallback: if /api/work/domain-last-update gave nothing usable,
    // try to derive the latest date directly from the job data itself.
    const fallbackDates = data
      .map((item) => item.updatedAt || item.lastUpdate || item.updated_at || item.last_update || item.date || item.createdAt)
      .filter(Boolean)
      .map((d) => new Date(d))
      .filter((d) => !isNaN(d.getTime()));
    if (!fallbackDates.length) return null;
    return new Date(Math.max(...fallbackDates.map((d) => d.getTime())));
  })();

  const domainLastUpdate = (() => {
    if (lastUpdateMap[domain]) return lastUpdateMap[domain];
    // Fallback per-domain: latest date found among that domain's own rows.
    const rows = data.filter((item) => item.domain === domain);
    const fallbackDates = rows
      .map((item) => item.updatedAt || item.lastUpdate || item.updated_at || item.last_update || item.date || item.createdAt)
      .filter(Boolean)
      .map((d) => new Date(d))
      .filter((d) => !isNaN(d.getTime()));
    if (!fallbackDates.length) return null;
    return new Date(Math.max(...fallbackDates.map((d) => d.getTime())));
  })();

  const currentLastUpdate =
    domain && domain !== "All"
      ? domainLastUpdate
      : overallLastUpdate;

  const formattedLastUpdate = currentLastUpdate
    ? new Date(currentLastUpdate).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    })
    : "-";

  // ================= FETCH DATA =================
  useEffect(() => {
    axios
      .get(`${API_BASE_URL}/api/work/all`)
      .then((res) => {
        setData(res.data || []);
      });
  }, [domain, states]);

  // ================= MONTH-YEAR OPTIONS =================
  const monthOrder = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
  ];

  const monthYearOptions = Array.from(
    new Set(
      data
        .filter((item) => {
          if (domain && domain !== "All") {
            return item.domain === domain;
          }
          return true;
        })
        .flatMap((item) =>
          (item.months || []).map((m) => {
            if (!m) return null;
            const parts = m.includes(",") ? m.split(",") : m.split("-");
            const month = parts[0]?.trim();
            const year = parts[1]?.trim();

            if (!month || !year) return null;
            const fullYear = year.length === 2 ? `20${year}` : year;
            return `${month} ${fullYear}`;
          })
        )
        .filter(Boolean)
    )
  ).sort((a, b) => {
    const [am, ay] = a.split(" ");
    const [bm, by] = b.split(" ");

    if (Number(by) !== Number(ay)) {
      return Number(by) - Number(ay);
    }

    return monthOrder.indexOf(am) - monthOrder.indexOf(bm);
  });

  // ================= QC / OTP HELPERS =================
  const parsePercent = (val) => {
    if (val === null || val === undefined || val === "") return null;
    const num = parseFloat(val.toString().replace("%", "").trim());
    if (isNaN(num)) return null;
    return num > 0 && num <= 1 ? Math.round(num * 100) : Math.round(num);
  };

  // Tells us whether a given OTP field value counts as "met", regardless of
  // whether the raw data stores it as Yes/No text, true/false, or a number.
  const isOtpMet = (val) => {
    if (val === null || val === undefined || val === "") return null;
    const str = val.toString().trim().toLowerCase();
    if (["yes", "y", "met", "true", "ok", "pass", "passed", "1"].includes(str)) return true;
    if (["no", "n", "not met", "false", "fail", "failed", "0"].includes(str)) return false;
    const num = parseFloat(str.replace("%", ""));
    if (!isNaN(num)) return num > 0;
    return null;
  };

  // ================= JOB FORMAT =================
  const getJobData = (item) => {
    return {
      main: 1,
      sub: `Jobs Delivered`,
    };
  };

  // ================= FILTERED DATA =================
  const filteredData = data.filter((item) => {
    if (domain && domain !== "All") {
      if (item.domain !== domain) return false;
    }

    const months = Array.isArray(item.months) ? item.months : [];
    if (selectedPeriod) {
      return months.some((m) => {
        if (!m) return false;
        const parts = m.includes(",") ? m.split(",") : m.split("-");
        const month = parts[0]?.trim();
        const year = parts[1]?.trim();
        if (!month || !year) return false;
        const fullYear = year.length === 2 ? `20${year}` : year;

        return (
          month === selectedPeriod.split(" ")[0] &&
          fullYear === selectedPeriod.split(" ")[1]
        );
      });
    }
    return true;
  });

  // ================= TOTAL JOBS =================
  const totalJobs = filteredData.length;

  // ================= OVERALL QC / OTP (for summary boxes) =================
  const overallQc = (() => {
    const vals = filteredData
      .map((x) => parsePercent(x.amdocsQc || x.amdocs_qc))
      .filter((v) => v !== null);
    if (!vals.length) return null;
    return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
  })();

  const overallOtp = (() => {
    if (!filteredData.length) return null;
    const metCount = filteredData.filter((x) => isOtpMet(x.otp) === true).length;
    return Math.round((metCount / filteredData.length) * 100);
  })();

  // ================= DOMAIN WISE SUMMARY (Job / QC / OTP) =================
  const domainStatsMap = {};
  filteredData.forEach((item) => {
    const d = item.domain || "Unknown";
    if (!domainStatsMap[d]) {
      domainStatsMap[d] = { jobs: 0, qcSum: 0, qcCount: 0, otpMet: 0 };
    }
    domainStatsMap[d].jobs += 1;

    const qcVal = parsePercent(item.amdocsQc || item.amdocs_qc);
    if (qcVal !== null) {
      domainStatsMap[d].qcSum += qcVal;
      domainStatsMap[d].qcCount += 1;
    }

    if (isOtpMet(item.otp) === true) {
      domainStatsMap[d].otpMet += 1;
    }
  });

  const domainSummaryRows = Object.keys(domainStatsMap)
    .sort()
    .map((d) => ({
      domain: d,
      jobs: domainStatsMap[d].jobs,
      qc: domainStatsMap[d].qcCount > 0 ? Math.round(domainStatsMap[d].qcSum / domainStatsMap[d].qcCount) : null,
      otp: domainStatsMap[d].jobs > 0 ? Math.round((domainStatsMap[d].otpMet / domainStatsMap[d].jobs) * 100) : null,
    }));

  return (
    <div className={`reports ${open ? "open" : "close"}`}>

      {/* ================= FILTER ================= */}
      <div className="headerRight">
        <select
          className="month-select"
          value={selectedPeriod}
          onChange={(e) => setSelectedPeriod(e.target.value)}
        >
          <option value="">All Months</option>
          {monthYearOptions.map((p, i) => (
            <option key={i} value={p}>
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
            <table className="reportTable">
              <thead>
                <tr>
                  <th>Sl.No</th>
                  <th>Domain</th>
                  <th>Region</th>
                  <th>Market Name</th>
                  <th>No.of Job Delivered</th>
                  <th>Amdocs QC</th>
                  <th>OTP</th>
                </tr>
              </thead>

              <tbody>

                {filteredData.map((item, index) => {
                  const job = getJobData(item);
                  const qcVal = parsePercent(item.amdocsQc || item.amdocs_qc);
                  const otpRaw =
                    item.otp !== null && item.otp !== undefined && item.otp !== ""
                      ? item.otp.toString()
                      : "-";

                  return (
                    <tr key={index}>
                      <td>{index + 1}</td>

                      <td className="domain-cell">
                        <div className="domain-main">
                          {item.domain || "-"}
                        </div>

                        {/* Domain ke neeche subDomain ki jagah ab job_type show hoga */}
                        <div className="domain-sub" style={{ color: "#64748b", fontStyle: "italic" }}>
                          {item.job_type || "-"}
                        </div>
                      </td>

                      <td>{item.region || getRegion(item.state)}</td>
                      <td>{item.state}</td>

                      <td className="job-cell">
                        <div className="job-main">{job.main}</div>
                        <div className="job-sub">{job.sub}</div>
                      </td>

                      <td className="job-cell">
                        <div className="job-main">{qcVal !== null ? `${qcVal}%` : "0%"}</div>
                        <div className="job-sub">Amdocs QC</div>
                      </td>

                      <td className="job-cell">
                        <div className="job-main">{otpRaw}</div>
                        <div className="job-sub">OTP</div>
                      </td>
                    </tr>
                  );
                })}

                {/* TOTAL ROW */}
                <tr className="totalRow">
                  <td></td>
                  <td></td>
                  <td></td>
                  <td>Total Jobs Delivered</td>
                  <td className="highlight">{totalJobs}</td>
                  <td className="highlight">{overallQc !== null ? `${overallQc}%` : "0%"}</td>
                  <td className="highlight">{overallOtp !== null ? `${overallOtp}%` : "0%"}</td>
                </tr>

              </tbody>
            </table>

            {/* ================= DOMAIN WISE SUMMARY ================= */}
            <table className="reportTable" style={{ marginTop: "20px" }}>
              <thead>
                <tr>
                  <th>Domain</th>
                  <th>Total Job Delivered</th>
                  <th>Amdocs QC</th>
                  <th>OTP</th>
                </tr>
              </thead>
              <tbody>
                {domainSummaryRows.map((row) => (
                  <tr key={row.domain}>
                    <td className="domain-cell">
                      <div className="domain-main">{row.domain}</div>
                    </td>
                    <td className="job-cell">
                      <div className="job-main">{row.jobs}</div>
                      <div className="job-sub">Jobs Delivered</div>
                    </td>
                    <td className="job-cell">
                      <div className="job-main">{row.qc !== null ? `${row.qc}%` : "0%"}</div>
                      <div className="job-sub">Amdocs QC</div>
                    </td>
                    <td className="job-cell">
                      <div className="job-main">{row.otp !== null ? `${row.otp}%` : "0%"}</div>
                      <div className="job-sub">OTP</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* ================= SUMMARY ================= */}
            <div
              style={{
                marginTop: "24px",
                background: "linear-gradient(135deg, #eff6ff 0%, #f0fdf4 50%, #fffbeb 100%)",
                border: "1px solid #e2e8f0",
                borderRadius: "18px",
                padding: "22px 26px",
                boxShadow: "0 6px 20px rgba(15, 23, 42, 0.08)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "24px",
                  justifyContent: "flex-end",
                }}
              >
                {/* Jobs Delivered */}
                <div style={{ display: "flex", alignItems: "center", gap: "14px", flex: "0 1 auto" }}>
                  <div
                    style={{
                      width: 52,
                      height: 52,
                      minWidth: 52,
                      borderRadius: "50%",
                      background: "#dbeafe",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 24,
                      boxShadow: "0 2px 6px rgba(37, 99, 235, 0.25)",
                    }}
                  >
                    📶
                  </div>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                      Jobs Delivered
                    </div>
                    <div style={{ fontSize: 30, fontWeight: 800, color: "#1d4ed8", lineHeight: 1.2 }}>
                      {totalJobs}
                    </div>
                  </div>
                </div>

                {/* Amdocs QC */}
                <div style={{ display: "flex", alignItems: "center", gap: "14px", flex: "0 1 auto" }}>
                  <div
                    style={{
                      width: 52,
                      height: 52,
                      minWidth: 52,
                      borderRadius: "50%",
                      background: "#dcfce7",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 24,
                      boxShadow: "0 2px 6px rgba(22, 163, 74, 0.25)",
                    }}
                  >
                    ✅
                  </div>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                      Amdocs QC
                    </div>
                    <div style={{ fontSize: 30, fontWeight: 800, color: "#16a34a", lineHeight: 1.2 }}>
                      {overallQc !== null ? `${overallQc}%` : "0%"}
                    </div>
                  </div>
                </div>

                {/* OTP */}
                <div style={{ display: "flex", alignItems: "center", gap: "14px", flex: "0 1 auto" }}>
                  <div
                    style={{
                      width: 52,
                      height: 52,
                      minWidth: 52,
                      borderRadius: "50%",
                      background: "#fef3c7",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 24,
                      boxShadow: "0 2px 6px rgba(217, 119, 6, 0.25)",
                    }}
                  >
                    ⏱
                  </div>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                      OTP
                    </div>
                    <div style={{ fontSize: 30, fontWeight: 800, color: "#d97706", lineHeight: 1.2 }}>
                      {overallOtp !== null ? `${overallOtp}%` : "0%"}
                    </div>
                  </div>
                </div>
              </div>

              <div
                style={{
                  marginTop: "18px",
                  paddingTop: "14px",
                  borderTop: "1px dashed #cbd5e1",
                  fontSize: 13,
                  fontWeight: 600,
                  color: "#64748b",
                  textAlign: "right",
                }}
              >
                As on {formattedLastUpdate}
              </div>
            </div>
          </>
        )}

      </div>
    </div>
  );
}
