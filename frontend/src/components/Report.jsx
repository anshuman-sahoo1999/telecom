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

  // Normalizes the "states" prop so it always works whether the parent
  // passes a single string, an array of strings, or leaves it empty.
  const selectedStates = (() => {
    if (!states) return [];
    if (Array.isArray(states)) return states.filter(Boolean);
    if (typeof states === "string") return states === "All" ? [] : [states];
    return [];
  })();

  // FETCH LAST UPDATE MAP
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
  useEffect(() => {
    axios
      .get(`${API_BASE_URL}/api/work/all`)
      .then((res) => {
        setData(res.data || []);
      });
  }, [domain, states]);
  const monthOrder = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
  ];

  const monthYearOptions = Array.from(
    new Set(
      data
        .filter((item) => {
          if (domain && domain !== "All") {
            if (item.domain !== domain) return false;
          }
          if (selectedStates.length && !selectedStates.includes(item.state)) {
            return false;
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

    // Apply the states/markets filter passed in from the parent.
    if (selectedStates.length && !selectedStates.includes(item.state)) {
      return false;
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

  // Domain-wise summary is only meaningful when more than one domain is
  // actually present in the filtered data (i.e. "All" domains selected).
  const showDomainSummary = (!domain || domain === "All") && domainSummaryRows.length > 1;

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

            {/* ================= DOMAIN-WISE SUMMARY (only when viewing all domains) ================= */}
            {showDomainSummary && (
              <table className="reportTable" style={{ marginTop: "16px" }}>
                <thead>
                  <tr>
                    <th>Domain</th>
                    <th>Jobs Delivered</th>
                    <th>Amdocs QC</th>
                    <th>OTP</th>
                  </tr>
                </thead>
                <tbody>
                  {domainSummaryRows.map((row, i) => (
                    <tr key={i}>
                      <td>{row.domain}</td>
                      <td>{row.jobs}</td>
                      <td>{row.qc !== null ? `${row.qc}%` : "0%"}</td>
                      <td>{row.otp !== null ? `${row.otp}%` : "0%"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {/* ================= SUMMARY ================= */}
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "20px" }}>
              <div
                style={{display: "flex",alignItems: "center",gap: "18px",background: "#ffffff",border: "1px solid #e5e7eb",borderRadius: "16px",
                  padding: "16px 26px",boxShadow: "0 4px 14px rgba(15, 23, 42, 0.06)",}}
              >
                <div
                  style={{width: 64,height: 64,minWidth: 64,borderRadius: "14px", background: "linear-gradient(135deg, #3b82f6, #06b6d4)",
                  display: "flex",alignItems: "center",justifyContent: "center",fontSize: 28,}} >
                  📶
                </div>

                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
                    <div style={{ textAlign: "center" }}>
                      <div style={{ fontSize: 30, fontWeight: 800, color: "#dc2626", lineHeight: 1.1 }}>
                        {totalJobs}
                      </div>
                      <div style={{ fontSize: 11, fontWeight: 600, color: "#64748b" }}>Jobs Delivered</div>
                    </div>
                    <div style={{ width: 1, height: 34, background: "#e2e8f0" }} />
                    <div style={{ textAlign: "center" }}>
                      <div style={{ fontSize: 30, fontWeight: 800, color: "#dc2626", lineHeight: 1.1 }}>
                        {overallQc !== null ? `${overallQc}%` : "0%"}
                      </div>
                      <div style={{ fontSize: 11, fontWeight: 600, color: "#64748b" }}>Amdocs QC</div>
                    </div>
                    <div style={{ width: 1, height: 34, background: "#e2e8f0" }} />
                    <div style={{ textAlign: "center" }}>
                      <div style={{ fontSize: 30, fontWeight: 800, color: "#dc2626", lineHeight: 1.1 }}>
                        {overallOtp !== null ? `${overallOtp}%` : "0%"}
                      </div>
                      <div style={{ fontSize: 11, fontWeight: 600, color: "#64748b" }}>OTP</div>
                    </div>
                  </div>
                  <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 6, textAlign: "right" }}>
                    As on - {formattedLastUpdate}
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
