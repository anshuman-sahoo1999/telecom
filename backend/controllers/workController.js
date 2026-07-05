const db = require("../config/db");
const ExcelJS = require("exceljs");
const fs = require("fs");
const path = require("path");


const stateData = require("../stateCodes");
const countyData = require("../counties.json");

const clean = (v) => {
  return v ? v.toString().trim() : "";
};

// 🔥 NEW ADD THIS
const normalize = (v) => clean(v).toUpperCase();


/* ======================================
   MONTH HELPERS
====================================== */

const getMonthValue = (row) => {
  return (
    row["Month of Service "] ||
    row["Month of Service"] ||
    row.Month ||
    null
  );
};

const formatMonth = (value) => {
  if (!value) return null;

  const months = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
  ];

  // If already Date object
  if (value instanceof Date) {
    return `${months[value.getMonth()]}-${String(value.getFullYear()).slice(-2)}`;
  }

  // If Excel / ISO string
  if (typeof value === "string" || typeof value === "number") {
    const d = new Date(value);
    if (!isNaN(d)) {
      return `${months[d.getMonth()]}-${String(d.getFullYear()).slice(-2)}`;
    }
  }

  return value;
};

/* ======================================
   UOM EXTRACT
====================================== */

const extractUOM = (row) => {
  const uom = {};

  const skipColumns = [
    "SOW",
    "Job Type",
    "State",
    "Market",
    "Month",
    "Month of Service"
  ];

  Object.keys(row).forEach((key) => {
    const cleanKey = key
      .replace(/\(.*\)/g, "")
      .replace(/\*/g, "")
      .trim();

    if (skipColumns.some(col => col.toLowerCase() === cleanKey.toLowerCase())) {
      return;
    }

    const value = row[key];

    if (value === "" || value === null || value === undefined) return;

    const num = Number(value);
    if (isNaN(num)) return;

    // ✅ OBJECT FORMAT (FIX)
    uom[cleanKey] = num;
  });

  return uom;
};

/* ======================================
   STATE CODE -> FULL STATE
====================================== */

const getStateNameFromCode = (code) => {

  if (!code) return "";

  const input = code
    .toString()
    .trim()
    .toUpperCase();

  for (const stateName in stateData) {

    if (
      stateData[stateName]
        .code
        .toUpperCase() === input
    ) {
      return stateName;
    }
  }

  return "";
};

/* ======================================
   REGION FROM STATE
====================================== */

const getRegionFromState = (state) => {

  if (!state) {
    return "";
  }

  const found = stateData[state];

  if (!found) {
    return "";
  }

  return found.region;
};

/* ======================================
   COUNTY -> STATE
====================================== */

const getStateFromCounty = (countyName) => {

  if (!countyName) {

    return {
      county: "",
      state: ""
    };
  }

  const input =
    countyName
      .toString()
      .toLowerCase()
      .replace("county", "")
      .trim();

  for (const item of countyData) {

    const geo =
      item.GeographicAreaName;

    if (!geo) continue;

    const parts =
      geo.split(",");

    const countyPart =
      parts[0]
        ?.replace("County", "")
        .trim()
        .toLowerCase();

    const statePart =
      parts[1]
        ?.trim();

    if (countyPart === input) {

      return {

        county:
          parts[0]
            ?.replace("County", "")
            .trim(),

        state:
          statePart
      };
    }
  }

  return {
    county: countyName,
    state: ""
  };
};

/* ======================================
   IMPORT EXCEL
====================================== */

const importExcel = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "Excel file required" });
    }

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(req.file.buffer);

    let success = 0;
    let failed = 0;
    let totalRows = 0;

    const tasks = [];

for (const worksheet of workbook.worksheets) {

  const sheetName = worksheet.name;

  const rows = [];
  const headers = [];

  // Get Header Row
  worksheet.getRow(1).eachCell((cell, colNumber) => {
    headers[colNumber] = cell.value;
  });

  // Convert Sheet to JSON Array
  worksheet.eachRow((row, rowNumber) => {

    if (rowNumber === 1) return;

    const obj = {};

    row.eachCell((cell, colNumber) => {
      obj[headers[colNumber]] = cell.value;
    });

    rows.push(obj);
  });

  totalRows += rows.length;

  for (let i = 0; i < rows.length; i++) {

    const row = rows[i];

    tasks.push(
      new Promise((resolve) => {

        try {

          const domain = normalize(sheetName);
          const sow = clean(row.SOW);
          const jobType = normalize(row["Job Type"]);
          const market = normalize(
            row.State ||
            row.Market ||
            row.market
          );

          let rawLocation = clean(
            row.State ||
            row.STATE ||
            row.state ||
            row.Market ||
            row.market
          );

          let state = "";
          let county = "";
          let region = "";

          const formattedLocation = rawLocation
            .toString()
            .trim()
            .toLowerCase()
            .split(" ")
            .map(
              w =>
                w.charAt(0).toUpperCase() +
                w.slice(1)
            )
            .join(" ");

          const stateFromCode =
            getStateNameFromCode(
              formattedLocation
            );

          if (stateFromCode) {

            state = stateFromCode;

            region =
              getRegionFromState(
                state
              );

          } else {

            const matchedState =
              Object.keys(
                stateData
              ).find(
                s =>
                  s.toLowerCase() ===
                  formattedLocation.toLowerCase()
              );

            if (matchedState) {

              state =
                matchedState;

              region =
                getRegionFromState(
                  state
                );
            }
          }

          if (!state) {

            const countyResult =
              getStateFromCounty(
                formattedLocation
              );

            if (countyResult.state) {

              county =
                countyResult.county;

              state =
                countyResult.state;

              region =
                getRegionFromState(
                  state
                );
            }
          }

          const month =
            formatMonth(
              getMonthValue(row)
            );

          const uom =
            extractUOM(row);

          const checkSql = `
            SELECT id, months, uom
            FROM work_updates
            WHERE domain = ?
            AND sow = ?
            AND subDomain = ?
            AND state = ?
            AND county = ?
            LIMIT 1
          `;

          db.query(
            checkSql,
            [
              domain,
              sow,
              jobType,
              state,
              county
            ],
            (
              err,
              results
            ) => {

              if (err) {

                failed++;

                return resolve();
              }

              if (
                results.length > 0
              ) {

                const existing =
                  results[0];

                let existingMonths =
                  [];

                let existingUOM =
                  {};

                try {

                  existingMonths =
                    JSON.parse(
                      existing.months ||
                      "[]"
                    );

                } catch {

                  existingMonths =
                    [];
                }

                try {

                  existingUOM =
                    JSON.parse(
                      existing.uom ||
                      "{}"
                    );

                } catch {

                  existingUOM =
                    {};
                }

                const newMonth =
                  month
                    ? String(
                        month
                      ).trim()
                    : null;

                if (
                  newMonth &&
                  !existingMonths.includes(
                    newMonth
                  )
                ) {

                  existingMonths.push(
                    newMonth
                  );
                }

                const mergedUOM = {
                  ...existingUOM,
                  ...uom
                };

                const updateSql = `
                  UPDATE work_updates
                  SET months = ?, uom = ?
                  WHERE id = ?
                `;

                return db.query(
                  updateSql,
                  [
                    JSON.stringify(
                      existingMonths
                    ),
                    JSON.stringify(
                      mergedUOM
                    ),
                    existing.id
                  ],
                  (
                    err2
                  ) => {

                    if (
                      err2
                    ) {
                      failed++;
                    } else {
                      success++;
                    }

                    resolve();
                  }
                );
              }

              const insertSql = `
                INSERT INTO work_updates
                (
                  file_name,
                  months,
                  domain,
                  sow,
                  subDomain,
                  region,
                  state,
                  county,
                  uom
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
              `;

              db.query(
                insertSql,
                [
                  req.file
                    .originalname,

                  JSON.stringify(
                    month
                      ? [month]
                      : []
                  ),

                  domain,
                  sow,
                  jobType,
                  region,
                  state,
                  county,

                  JSON.stringify(
                    uom
                  )
                ],
                (
                  err3
                ) => {

                  if (
                    err3
                  ) {
                    failed++;
                  } else {
                    success++;
                  }

                  resolve();
                }
              );
            }
          );

        } catch (e) {

          failed++;

          resolve();
        }
      })
    );
  }
}

    await Promise.allSettled(tasks);

    return res.json({
      message: "Excel imported successfully (NO DUPLICATES + SAFE MERGE)",
      totalRows,
      insertedOrUpdated: success,
      failed
    });

  } catch (err) {
    return res.status(500).json({
      message: "Import failed",
      error: err.message
    });
  }
};

/* ======================================
   CREATE WORK
====================================== */

const createWork = (req, res) => {

  const {
    months,
    domain,
    sow,
    subDomain,
    region,
    state,
    county,
    uom
  } = req.body;

  const fixedDomain = normalize(domain);
  const fixedSubDomain = normalize(subDomain);

  const sql = `
    INSERT INTO work_updates
    (
      months,
      domain,
      sow,
      subDomain,
      region,
      state,
      county,
      uom
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `;

  db.query(
    sql,
    [
      JSON.stringify(months || []),
      fixedDomain,
      sow,
      fixedSubDomain,
      region,
      state,
      county,
      JSON.stringify(uom || {})
    ],
    (err, result) => {

      if (err) {
        return res.status(500).json(err);
      }

      res.json({
        message: "Work added",
        id: result.insertId
      });
    }
  );
};

/* ======================================
   GET ALL
====================================== */

const getAllWork = (req, res) => {
  db.query(
    "SELECT *, updated_at FROM work_updates ORDER BY id DESC",
    (err, rows) => {
      if (err) return res.status(500).json(err);

      const data = rows.map((row) => ({
        ...row,
        months: row.months ? JSON.parse(row.months) : [],
        uom: row.uom ? JSON.parse(row.uom) : {},
        lastUpdate: row.updated_at ? new Date(row.updated_at) : null
      }));

      res.json(data);
    }
  );
};
const getFileData = (req, res) => {
  const fileName = req.params.fileName;

  const sql = `
    SELECT *
    FROM work_updates
    WHERE file_name = ?
    ORDER BY id DESC
  `;

  db.query(sql, [fileName], (err, rows) => {
    if (err) {
      return res.status(500).json(err);
    }

    if (!rows.length) {
      return res.status(404).json({
        message: "No data found for this file"
      });
    }

    // ✅ REMOVE file_name + system fields
    const cleaned = rows.map((row) => {
      const {
        created_at,
        updated_at,
        file_name,   // 👈 removed
        id,
        ...rest
      } = row;

      return rest;
    });

    res.json(cleaned);
  });
};
/* ======================================
   DOMAIN STATS
====================================== */

const getDomainStats = (req, res) => {

  db.query(
    `
      SELECT
      domain,
      COUNT(*) AS jobsDelivered
      FROM work_updates
      GROUP BY domain
    `,
    (err, rows) => {

      if (err) {
        return res.status(500).json(err);
      }

      res.json(rows);
    }
  );
};

/* ======================================
   JOB TYPE STATS
====================================== */

const getJobTypeStats = (req, res) => {

  db.query(
    `
      SELECT
      subDomain AS jobType,
      COUNT(*) AS jobsDelivered
      FROM work_updates
      GROUP BY subDomain
      ORDER BY jobsDelivered DESC
    `,
    (err, rows) => {

      if (err) {
        return res.status(500).json(err);
      }

      res.json(rows);
    }
  );
};

/* ======================================
   MONTH REPORT
====================================== */

const getMonthWiseReport = (req, res) => {

  db.query(
    "SELECT * FROM work_updates",
    (err, rows) => {

      if (err) {
        return res.status(500).json([]);
      }

      res.json(rows);
    }
  );
};

/* ======================================
   STATE WISE JOBS
====================================== */

const getStateWiseJobs = (req, res) => {

  db.query(
    `
      SELECT
      state,
      domain,
      COUNT(*) AS jobsDelivered
      FROM work_updates
      GROUP BY state, domain
    `,
    (err, rows) => {

      if (err) {
        return res.status(500).json(err);
      }

      const result = {};

      rows.forEach((row) => {

        if (!result[row.state]) {
          result[row.state] = {};
        }

        result[row.state][row.domain] =
          row.jobsDelivered;
      });

      res.json(result);
    }
  );
};
/* ======================================
   DOMAIN LAST UPDATE
====================================== */

const getDomainLastUpdate = (req, res) => {

  const sql = `
    SELECT 
      domain,
      MAX(updated_at) AS lastUpdate
    FROM work_updates
    GROUP BY domain
  `;

  db.query(sql, (err, rows) => {

    if (err) {

      console.log(err);

      return res.status(500).json({
        message: "Failed to fetch last update"
      });
    }

    const result = {};

    rows.forEach((row) => {

      result[row.domain] = row.lastUpdate;
    });

    res.json(result);
  });
};
/* ======================================
   UPDATE WORK
====================================== */

const updateWork = (req, res) => {

  const { id } = req.params;

  const {
    months,
    domain,
    sow,
    subDomain,
    region,
    state,
    county,
    uom,
    jobsDelivered
  } = req.body;

  const fixedDomain = normalize(domain);
  const fixedSubDomain = normalize(subDomain);

  const sql = `
    UPDATE work_updates
    SET
      months = ?,
      domain = ?,
      sow = ?,
      subDomain = ?,
      region = ?,
      state = ?,
      county = ?,
      uom = ?,
      jobsDelivered = ?
    WHERE id = ?
  `;

  db.query(
    sql,
    [
      JSON.stringify(months || []),

      fixedDomain,

      sow,

      fixedSubDomain,

      region,

      state,

      county,

      JSON.stringify(uom || {}),

      Number(jobsDelivered || 0),

      id
    ],
    (err, result) => {

      if (err) {

        console.log(err);

        return res.status(500).json({
          message: "Update failed",
          error: err
        });
      }

      res.json({
        message: "Updated successfully",
        result
      });
    }
  );
};
const deleteFile = (req, res) => {

  const fileName =
    req.params.fileName;

  const sql = `
    DELETE FROM work_updates
    WHERE file_name = ?
  `;

  db.query(
    sql,
    [fileName],
    (err) => {

      if (err) {

        return res
          .status(500)
          .json(err);
      }

      res.json({
        message:
          "File deleted successfully"
      });
    }
  );
};
/* ======================================
   DELETE
====================================== */

const deleteWork = (req, res) => {

  db.query(
    "DELETE FROM work_updates WHERE id=?",
    [req.params.id],
    (err) => {

      if (err) {
        return res.status(500).json(err);
      }

      res.json({
        message:
          "Deleted successfully"
      });
    }
  );
};

/* ======================================
   CLEAR
====================================== */

const clearWork = (req, res) => {

  db.query(
    "DELETE FROM work_updates",
    (err) => {

      if (err) {
        return res.status(500).json(err);
      }

      res.json({
        message:
          "All data cleared"
      });
    }
  );
};

/* ======================================
   EXPORTS
====================================== */

module.exports = {

  importExcel,

  createWork,

  getAllWork,

  getFileData,

  getDomainStats,

  getJobTypeStats,

  getMonthWiseReport,

  getStateWiseJobs,

  getDomainLastUpdate,

  updateWork,

  deleteWork,

  deleteFile,

  clearWork
};