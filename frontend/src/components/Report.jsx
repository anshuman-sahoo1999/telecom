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
  useEffect(() => {
    axios
      .get("http://localhost:5000/api/work/domain-last-update")
      .then((res) => {
        setLastUpdateMap(res.data || {});
      })
      .catch((err) => {
        console.log(err);
        setLastUpdateMap({});
      });
  }, []);

const currentLastUpdate =
  domain && domain !== "All"
    ? lastUpdateMap[domain]
    : null;

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
    .get("http://localhost:5000/api/work/all")
    .then((res) => setData(res.data || []))
    .catch((err) => {
      console.log(err);
      setData([]);
    });
}, [domain, states]);

// ================= MONTH-YEAR OPTIONS =================
const monthOrder = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
];

const monthYearOptions = Array.from(
  new Set(
    data.flatMap((item) =>
      (item.months || []).map((m) => {
        if (!m) return null;

        const [month, year] = m.split("-");

        return `${month} 20${year}`;
      })
    ).filter(Boolean)
  )
).sort((a, b) => {
  const [am, ay] = a.split(" ");
  const [bm, by] = b.split(" ");

  if (by !== ay) return Number(by) - Number(ay);

  return monthOrder.indexOf(am) - monthOrder.indexOf(bm);
});


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

  const found = months.some((m) => {

    if (!m) return false;

    const [month, year] = m.split("-");

    return `${month} 20${year}` === selectedPeriod;
  });

  return found;
}

  return true;
});
// ================= TOTAL JOBS =================
const totalJobs = filteredData.length;

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
              </tr>
            </thead>

            <tbody>

              {filteredData.map((item, index) => {
                const job = getJobData(item);

                return (
                  <tr key={index}>
                    <td>{index + 1}</td>

                    <td className="domain-cell">
                      <div className="domain-main">
                        {item.domain || "-"}
                      </div>

                      <div className="domain-sub">
                        {Array.isArray(item.subDomain)
                          ? item.subDomain.join(" | ")
                          : typeof item.subDomain === "object"
                            ? Object.values(item.subDomain || {}).join(" | ")
                            : item.subDomain || "-"}
                      </div>
                    </td>

                    <td>{item.region || getRegion(item.state)}</td>
                    <td>{item.state}</td>

                    <td className="job-cell">
                      <div className="job-main">{job.main}</div>
                      <div className="job-sub">{job.sub}</div>
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
              </tr>

            </tbody>
          </table>

          {/* ================= SUMMARY ================= */}
          <div className="summaryWrap">
            <div className="summaryBox">
              <div className="iconBox">📶</div>

              <div className="summaryText">
                <p>Jobs Delivered</p>
                <span className="dateText">
                  As on {formattedLastUpdate}
                </span>
                <h1>{totalJobs}</h1>
              </div>
            </div>
          </div>
        </>
      )}

    </div>
  </div>
);
}