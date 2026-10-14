const db = require("../config/db");

const clean = (v) => (v !== undefined && v !== null ? v.toString().trim() : "");
const normalize = (v) => clean(v).toUpperCase();
const isZeroValue = (v) => {
  if (v === null || v === undefined || v === false) return false;
  const s = v.toString().trim().replace(/%$/, "").trim();
  return s !== "" && !isNaN(Number(s)) && Number(s) === 0;
};

const blankIfZero = (v) => (isZeroValue(v) ? "" : v);
const formatPercentage = (value) => {
  if (value === null || value === undefined || value === "") return "";
  const str = value.toString().trim();
  if (str === "") return "";
  if (isZeroValue(str)) return "";
  if (str.endsWith("%")) return str;

  const num = Number(str);
  if (!isNaN(num)) {
    if (num > 0 && num <= 1) {
      return `${Number((num * 100).toFixed(2))}%`;
    }
    return `${num}%`;
  }
  return str;
};

const displayPct = (v) => formatPercentage(v);
const qcVal = (v) => {
  if (v === undefined || v === null) return null;
  if (isZeroValue(v)) return null;
  if (clean(v) === "") return null;
  const f = formatPercentage(v);
  return f === "" ? null : f;
};

/* ======================================
   DOMAIN-SCOPED HELPERS (NEW)
   Same Job ID alag-alag domain (ASE / PERMIT / F2 / PLA ...) me ho sakta hai.
   Isliye identity hamesha (domain + job id) se hoti hai, sirf job id se nahi.
====================================== */
const domainKey = (v) => clean(v).toUpperCase();
const mapKey = (domain, jobId) => `${domainKey(domain)}|${clean(jobId).toLowerCase()}`;

// job_creation: (jobId + domain). Purani blank-domain row bhi match hoti hai,
// lekin exact domain wali row ko priority milti hai.
const jcScope = (jobId, domain) => {
  const d = domainKey(domain);
  if (!d) {
    return { where: "TRIM(jobId) = TRIM(?)", params: [jobId], order: "", orderParams: [] };
  }
  return {
    where:
      "TRIM(jobId) = TRIM(?) AND (UPPER(TRIM(COALESCE(domain,''))) = ? OR TRIM(COALESCE(domain,'')) = '')",
    params: [jobId, d],
    order: "ORDER BY (UPPER(TRIM(COALESCE(domain,''))) = ?) DESC",
    orderParams: [d]
  };
};

// work_updates: (job_id + domain)
const wuScope = (jobId, domain) => {
  const d = domainKey(domain);
  if (!d) {
    return { where: "TRIM(job_id) = TRIM(?)", params: [jobId] };
  }
  return {
    where: "TRIM(job_id) = TRIM(?) AND UPPER(TRIM(COALESCE(domain,''))) = ?",
    params: [jobId, d]
  };
};

let stateData = {};
try {
  stateData = require("../stateCodes") || {};
} catch (e) {
  stateData = {};
}

const regionFromMarket = (market) => {
  const raw = clean(market).toUpperCase();
  if (!raw) return "";
  for (const name of Object.keys(stateData)) {
    const info = stateData[name] || {};
    if (name.toUpperCase() === raw || clean(info.code).toUpperCase() === raw) {
      return info.region || "";
    }
  }
  return "";
};
const monthsParam = (m) => (m ? JSON.stringify([m]) : null);
const WORK_INSERT_SQL = `
  INSERT INTO work_updates
  (domain, state, region, job_id, months, receive_date, ecd_date, submission_date,
   amdocs_qc, internal_qc, otp, sow, job_type, county, current_status,
   production_engineers, qc_engineers, jobs_delivered, uom)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '', '', '', '', '', '', 1, '{}')
`;
const workInsertParams = ({ domain, state, jobId, month, receiveDate, ecdDate, submissionDate, amdocsQc, internalQc, otp }) => [
  domain || null,
  state || null,
  regionFromMarket(state) || "",
  jobId,
  JSON.stringify(month ? [month] : []),
  receiveDate || null,
  ecdDate || null,
  submissionDate || null,
  qcVal(amdocsQc),
  qcVal(internalQc),
  qcVal(otp),
];

const monthNames = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
];
const monthNameToIndex = monthNames.reduce((acc, m, idx) => {
  acc[m.toLowerCase()] = idx;
  return acc;
}, {});
monthNameToIndex["sept"] = 8; // "Sept, 2026" bhi chale
const fullMonthNameToIndex = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december"
].reduce((acc, m, idx) => {
  acc[m] = idx;
  return acc;
}, {});

const cleanSingleMonth = (m) => {
  let strVal = clean(m);
  if (!strVal) return null;

  if (/^[A-Za-z]{3},\d{4}$/.test(strVal)) return strVal;

  let match = strVal.match(/^(\d{4})-(\d{1,2})(?:-\d{1,2})?$/);
  if (match) {
    const monthIdx = Number(match[2]) - 1;
    if (monthIdx >= 0 && monthIdx <= 11) return `${monthNames[monthIdx]},${match[1]}`;
  }

  match = strVal.match(/^(\d{1,2})[-/](\d{4})$/);
  if (match) {
    const monthIdx = Number(match[1]) - 1;
    if (monthIdx >= 0 && monthIdx <= 11) return `${monthNames[monthIdx]},${match[2]}`;
  }

  match = strVal.match(/^([A-Za-z]+)[\s\-/,]+(\d{4})$/);
  if (match) {
    const key = match[1].toLowerCase();
    const monthIdx = monthNameToIndex[key] !== undefined ? monthNameToIndex[key] : fullMonthNameToIndex[key];
    if (monthIdx !== undefined) return `${monthNames[monthIdx]},${match[2]}`;
  }

  // sirf month ka naam (bina saal) -> current saal
  match = strVal.match(/^([A-Za-z]+)\.?$/);
  if (match) {
    const key = match[1].toLowerCase();
    const monthIdx = monthNameToIndex[key] !== undefined ? monthNameToIndex[key] : fullMonthNameToIndex[key];
    if (monthIdx !== undefined) return `${monthNames[monthIdx]},${new Date().getFullYear()}`;
  }

  const d = new Date(strVal);
  if (!isNaN(d.getTime())) return `${monthNames[d.getMonth()]},${d.getFullYear()}`;

  return strVal;
};

exports.createJob = (req, res) => {
 try {
  let {
    domain,
    market,
    jobId,
    receiveDate,
    receivedDate,
    ecdDate,
    submissionDate,
    month,
    amdocsQc,
    amdocs_qc,
    internalQc,
    internal_qc,
    otp,
    internalOtp
  } = req.body || {};

  const finalReceiveDate = receiveDate || receivedDate || null;
  const formattedEcdDate = ecdDate && ecdDate !== "" ? ecdDate : null;
  const formattedSubmissionDate = submissionDate && submissionDate !== "" ? submissionDate : null;

  const finalAmdocsQc = qcVal(amdocsQc !== undefined ? amdocsQc : amdocs_qc);
  const finalInternalQc = qcVal(internalQc !== undefined ? internalQc : internal_qc);
  const finalOtp = qcVal(otp) || qcVal(internalOtp) || null;

  const cleanJobId = clean(jobId);
  const cleanDomain = normalize(domain);
  const cleanMarket = clean(market);
  const cleanMonth = cleanSingleMonth(month);

  // FIX: (jobId + domain) se check, taaki dusre domain ki same Job ID overwrite na ho
  const jcSc = jcScope(cleanJobId, cleanDomain);
  const checkSql = `SELECT id FROM job_creation WHERE ${jcSc.where} ${jcSc.order} LIMIT 1`;

  db.query(checkSql, [...jcSc.params, ...jcSc.orderParams], (checkErr, checkRows) => {
    if (checkErr) {
      return res.status(500).json({ success: false, message: checkErr.message });
    }

    if (checkRows && checkRows.length > 0) {
      // FIX: WHERE id = ? (pehle jobId se hota tha, jo dusre domain ki row bhi badal deta)
      const updateSql = `
        UPDATE job_creation
        SET domain = COALESCE(NULLIF(?, ''), domain),
            market = COALESCE(NULLIF(?, ''), market),
            month = COALESCE(?, month),
            receiveDate = COALESCE(?, receiveDate),
            ecdDate = COALESCE(?, ecdDate),
            submissionDate = COALESCE(?, submissionDate),
            otp = COALESCE(NULLIF(?, ''), otp),
            amdocsQc = COALESCE(NULLIF(?, ''), amdocsQc),
            internalQc = COALESCE(NULLIF(?, ''), internalQc),
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `;
      db.query(updateSql, [cleanDomain, cleanMarket, cleanMonth, finalReceiveDate, formattedEcdDate, formattedSubmissionDate, finalOtp, finalAmdocsQc, finalInternalQc, checkRows[0].id], (upErr) => {
        if (upErr) return res.status(500).json({ success: false, message: upErr.message });
        syncToWorkController();
      });
    } else {
      const insertSql = `
        INSERT INTO job_creation (domain, market, jobId, month, receiveDate, ecdDate, submissionDate, otp, amdocsQc, internalQc)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;
      db.query(insertSql, [cleanDomain, cleanMarket, cleanJobId, cleanMonth, finalReceiveDate, formattedEcdDate, formattedSubmissionDate, finalOtp, finalAmdocsQc, finalInternalQc], (inErr, inResult) => {
        if (inErr) return res.status(500).json({ success: false, message: inErr.message });
        syncToWorkController(inResult.insertId);
      });
    }
  });

  function syncToWorkController(newId = null) {
    if (!cleanJobId || cleanJobId === "-") {
      return res.json({
        success: true,
        message: "Job saved successfully",
        id: newId
      });
    }

    const wuSc = wuScope(cleanJobId, cleanDomain);
    const checkWorkSql = `SELECT id FROM work_updates WHERE ${wuSc.where} LIMIT 1`;
    db.query(checkWorkSql, wuSc.params, (wErr, wRows) => {
      if (!wErr && wRows && wRows.length > 0) {
        const updateWorkSql = `
          UPDATE work_updates
          SET domain = COALESCE(NULLIF(?, ''), domain),
              state = COALESCE(NULLIF(?, ''), state),
              region = COALESCE(NULLIF(region, ''), NULLIF(?, '')),
              months = COALESCE(?, months),
              receive_date = COALESCE(?, receive_date),
              ecd_date = COALESCE(?, ecd_date),
              submission_date = COALESCE(?, submission_date),
              amdocs_qc = COALESCE(NULLIF(?, ''), amdocs_qc),
              internal_qc = COALESCE(NULLIF(?, ''), internal_qc),
              otp = COALESCE(NULLIF(?, ''), otp),
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `;
        db.query(updateWorkSql, [cleanDomain, cleanMarket, regionFromMarket(cleanMarket), monthsParam(cleanMonth), finalReceiveDate, formattedEcdDate, formattedSubmissionDate, finalAmdocsQc, finalInternalQc, finalOtp, wRows[0].id], (uwErr) => {
          if (uwErr) return res.status(500).json({ success: false, message: uwErr.message });
          return res.json({
            success: true,
            message: "Job synced successfully with correct QC, OTP & month",
            id: newId
          });
        });
      } else {
        db.query(WORK_INSERT_SQL, workInsertParams({
          domain: cleanDomain, state: cleanMarket, jobId: cleanJobId, month: cleanMonth,
          receiveDate: finalReceiveDate, ecdDate: formattedEcdDate, submissionDate: formattedSubmissionDate,
          amdocsQc: finalAmdocsQc, internalQc: finalInternalQc, otp: finalOtp
        }), (iwErr) => {
          if (iwErr) {
            if (newId) db.query("DELETE FROM job_creation WHERE id = ?", [newId], () => {});
            return res.status(500).json({ success: false, message: iwErr.message });
          }
          return res.json({
            success: true,
            message: "Job inserted successfully into Work Controller with QC & OTP",
            id: newId
          });
        });
      }
    });
  }
 } catch (e) {
  console.error("createJob crashed:", e.message);
  return res.status(500).json({ success: false, message: e.message });
 }
};

exports.getAllJobs = (req, res) => {
 try {
  const queryJC = "SELECT id, jobId, domain, market, month, receiveDate, ecdDate, submissionDate, otp, amdocsQc, internalQc, updated_at FROM job_creation";
  const queryWU = "SELECT id, job_id AS jobId, domain, state AS market, months, receive_date AS receiveDate, ecd_date AS ecdDate, submission_date AS submissionDate, amdocs_qc, internal_qc, otp, updated_at FROM work_updates WHERE job_id IS NOT NULL AND job_id != '-' AND job_id != ''";

  db.query(queryJC, (errJC, jcRows) => {
    if (errJC) {
      return res.status(500).json({ success: false, message: errJC.message });
    }
    db.query(queryWU, (errWU, wuRows) => {
      if (errWU) {
        return res.status(500).json({ success: false, message: errWU.message });
      }
      const keyOf = (v) => (v ? v.toString().trim().toLowerCase() : "");
      const isValidKey = (k) => k !== "" && k !== "-";

      // FIX: key = domain + jobId (pehle sirf jobId tha, isse dusre domain ki row merge ho jaati thi)
      const workJobKeys = new Set();
      const workJobIds = new Set();
      wuRows.forEach((row) => {
        const k = keyOf(row.jobId);
        if (isValidKey(k)) {
          workJobKeys.add(mapKey(row.domain, row.jobId));
          workJobIds.add(k);
        }
      });

      const monthFromWork = (val) => {
        let v = val;
        if (typeof v === "string") {
          try { v = JSON.parse(v); } catch { /* plain text month */ }
        }
        if (Array.isArray(v)) return v.length > 0 ? v[v.length - 1] : null;
        return v || null;
      };

      // OTP / QC hamesha percentage: DB me "1" ho to "100%", 0 / blank => ""
      jcRows.forEach((row) => {
        row.otp = displayPct(row.otp);
        row.amdocsQc = displayPct(row.amdocsQc);
        row.internalQc = displayPct(row.internalQc);
      });
      wuRows.forEach((row) => {
        row.otp = displayPct(row.otp);
        row.amdocs_qc = displayPct(row.amdocs_qc);
        row.internal_qc = displayPct(row.internal_qc);
      });

      const jobMap = new Map();

      jcRows.forEach((row) => {
        const idKey = keyOf(row.jobId);
        if (!isValidKey(idKey)) return;
        const k = mapKey(row.domain, row.jobId);
        const hasWork = domainKey(row.domain) ? workJobKeys.has(k) : workJobIds.has(idKey);
        if (!hasWork) return; 

        jobMap.set(k, {
          ...row,
          jobId: row.jobId.toString().trim(),
          id: row.id,
          jcId: row.id,
          workId: null,
        });
      });

      wuRows.forEach((row) => {
        const idKey = keyOf(row.jobId);
        if (!isValidKey(idKey)) return;

        const k = mapKey(row.domain, row.jobId);

        // purani blank-domain job_creation row ko is domain ki work row se jod do
        if (!jobMap.has(k)) {
          const blankKey = mapKey("", row.jobId);
          if (jobMap.has(blankKey)) {
            jobMap.set(k, jobMap.get(blankKey));
            jobMap.delete(blankKey);
          }
        }

        if (jobMap.has(k)) {
          const existing = jobMap.get(k);
          jobMap.set(k, {
            ...existing,

            domain: row.domain || existing.domain,
            market: row.market || existing.market,
            month: existing.month || monthFromWork(row.months),
            submissionDate: row.submissionDate || existing.submissionDate,
            receiveDate: row.receiveDate || existing.receiveDate,
            ecdDate: row.ecdDate || existing.ecdDate,
            amdocs_qc: row.amdocs_qc || existing.amdocs_qc,
            internal_qc: row.internal_qc || existing.internal_qc,
            // camelCase fields bhi same merged value (Job History / Report dono me same dikhe)
            amdocsQc: row.amdocs_qc || existing.amdocsQc,
            internalQc: row.internal_qc || existing.internalQc,
            otp: row.otp || existing.otp,
            updated_at: row.updated_at || existing.updated_at,
            workId: row.id,
          });
        } else {
          const { months: workMonths, ...rowNoMonths } = row;
          jobMap.set(k, {
            ...rowNoMonths,
            month: monthFromWork(workMonths),
            amdocsQc: row.amdocs_qc,
            internalQc: row.internal_qc,
            jobId: row.jobId.toString().trim(),
            id: row.id,
            jcId: null,
            workId: row.id,
          });
        }
      });

      res.json(Array.from(jobMap.values()));
    });
  });
 } catch (e) {
  console.error("getAllJobs crashed:", e.message);
  return res.status(500).json({ success: false, message: e.message });
 }
};

exports.updateJob = (req, res) => {
 try {
  const {
    internalQc, internal_qc,
    amdocsQc, amdocs_qc,
    otp, internalOtp,
    domain,
    market,
    receiveDate, receive_date,
    ecdDate, ecd_date,
    submissionDate, submission_date,
    month,
    jobId,
    newJobId,
    jcId,
    workId
  } = req.body || {};

  const paramId = clean(req.params.id);

  const requestedJobId = clean(jobId) || paramId;

  const cleanNewJobId = clean(newJobId) || requestedJobId;

  const finalInternalQc = qcVal(internalQc !== undefined ? internalQc : internal_qc);
  const finalAmdocsQc = qcVal(amdocsQc !== undefined ? amdocsQc : amdocs_qc);
  const finalOtp = qcVal(otp) || qcVal(internalOtp) || null;
  const cleanMonth = cleanSingleMonth(month);
  const finalReceiveDate = (receiveDate || receive_date) || null;
  const finalEcdDate = (ecdDate || ecd_date) || null;
  const finalSubmissionDate = (submissionDate || submission_date) || null;

  const cleanJcId = clean(jcId);
  const cleanWorkId = clean(workId);

  if (!paramId && !requestedJobId && !cleanJcId && !cleanWorkId) {
    return res.status(400).json({ success: false, message: "A row ID or Job ID is required for updating." });
  }

  // FIX: id na mile to (jobId + domain) se dhoondho
  const wuSc = wuScope(requestedJobId, domain);
  const findWorkSql = cleanWorkId
    ? `SELECT id, job_id FROM work_updates WHERE id = ? LIMIT 1`
    : `SELECT id, job_id FROM work_updates WHERE ${wuSc.where} LIMIT 1`;
  const findWorkParams = cleanWorkId ? [cleanWorkId] : wuSc.params;

  db.query(findWorkSql, findWorkParams, (wErr, wRows) => {
    if (wErr) {
      return res.status(500).json({ success: false, message: wErr.message });
    }

    const updateWorkIfExists = (cb) => {
      if (!wRows || wRows.length === 0) return cb();
      const updateWorkSql = `
        UPDATE work_updates
        SET amdocs_qc = COALESCE(NULLIF(?, ''), amdocs_qc),
            otp = COALESCE(NULLIF(?, ''), otp),
            internal_qc = COALESCE(NULLIF(?, ''), internal_qc),
            domain = COALESCE(NULLIF(?, ''), domain),
            state = COALESCE(NULLIF(?, ''), state),
            region = COALESCE(NULLIF(region, ''), NULLIF(?, '')),
            months = COALESCE(?, months),
            receive_date = COALESCE(?, receive_date),
            ecd_date = COALESCE(?, ecd_date),
            submission_date = COALESCE(?, submission_date),
            job_id = COALESCE(NULLIF(?, ''), job_id),
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `;
      db.query(
        updateWorkSql,
        [
          finalAmdocsQc, finalOtp, finalInternalQc,
          domain || null, market || null,
          regionFromMarket(market),
          monthsParam(cleanMonth),
          finalReceiveDate, finalEcdDate, finalSubmissionDate,
          cleanNewJobId,
          wRows[0].id
        ],
        (upWerr) => cb(upWerr)
      );
    };

    const jcSc = jcScope(requestedJobId, domain);
    const findJcSql = cleanJcId
      ? `SELECT id FROM job_creation WHERE id = ? LIMIT 1`
      : `SELECT id FROM job_creation WHERE ${jcSc.where} ${jcSc.order} LIMIT 1`;
    const findJcParams = cleanJcId ? [cleanJcId] : [...jcSc.params, ...jcSc.orderParams];

    db.query(findJcSql, findJcParams, (jErr, jRows) => {
      if (jErr) {
        return res.status(500).json({ success: false, message: jErr.message });
      }

      const upsertJc = (cb) => {
        if (jRows && jRows.length > 0) {
          const updateJcSql = `
            UPDATE job_creation
            SET jobId = COALESCE(NULLIF(?, ''), jobId),
                domain = COALESCE(NULLIF(?, ''), domain),
                market = COALESCE(NULLIF(?, ''), market),
                month = COALESCE(?, month),
                receiveDate = COALESCE(?, receiveDate),
                ecdDate = COALESCE(?, ecdDate),
                submissionDate = COALESCE(?, submissionDate),
                otp = COALESCE(NULLIF(?, ''), otp),
                amdocsQc = COALESCE(NULLIF(?, ''), amdocsQc),
                internalQc = COALESCE(NULLIF(?, ''), internalQc),
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `;
          db.query(
            updateJcSql,
            [
              cleanNewJobId, domain || null, market || null, cleanMonth,
              finalReceiveDate, finalEcdDate, finalSubmissionDate,
              finalOtp, finalAmdocsQc, finalInternalQc,
              jRows[0].id
            ],
            (upJerr) => cb(upJerr)
          );
        } else if (cleanNewJobId && cleanNewJobId !== "-") {

          const insertJcSql = `
            INSERT INTO job_creation (domain, market, jobId, month, receiveDate, ecdDate, submissionDate, otp, amdocsQc, internalQc)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `;
          db.query(
            insertJcSql,
            [
              domain || null, market || null, cleanNewJobId, cleanMonth,
              finalReceiveDate, finalEcdDate, finalSubmissionDate,
              finalOtp, finalAmdocsQc, finalInternalQc
            ],
            (inJerr) => cb(inJerr)
          );
        } else {
          cb(null);
        }
      };

      updateWorkIfExists((upWerr) => {
        if (upWerr) {
          return res.status(500).json({ success: false, message: upWerr.message });
        }

        // work_updates me row na ho to hamesha banao (job_creation ho ya na ho), taaki Report me job dikhe
        if ((!wRows || wRows.length === 0) && cleanNewJobId && cleanNewJobId !== "-") {
          db.query(
            WORK_INSERT_SQL,
            workInsertParams({
              domain, state: market, jobId: cleanNewJobId, month: cleanMonth,
              receiveDate: finalReceiveDate, ecdDate: finalEcdDate, submissionDate: finalSubmissionDate,
              amdocsQc: finalAmdocsQc, internalQc: finalInternalQc, otp: finalOtp
            }),
            (inErr) => {
              if (inErr) {
                return res.status(500).json({ success: false, message: inErr.message });
              }
              upsertJc((upJerr) => {
                if (upJerr) return res.status(500).json({ success: false, message: upJerr.message });
                return res.json({ success: true, message: "Record created and synced successfully." });
              });
            }
          );
          return;
        }

        upsertJc((upJerr) => {
          if (upJerr) {
            return res.status(500).json({ success: false, message: upJerr.message });
          }
          return res.json({ success: true, message: "Job updated and synced successfully in both Job History and Report." });
        });
      });
    });
  });
 } catch (e) {
  console.error("updateJob crashed:", e.message);
  return res.status(500).json({ success: false, message: e.message });
 }
};

exports.deleteJob = (req, res) => {
 try {
  const rowId = clean(req.params.id);
  const requestedJobId = clean((req.query || {}).jobId);
  const jcId = clean((req.query || {}).jcId);
  const workId = clean((req.query || {}).workId);
  const requestedDomain = clean((req.query || {}).domain);

  const jcSc0 = jcScope(requestedJobId || rowId, requestedDomain);
  const findJcSql = jcId
    ? `SELECT jobId, domain FROM job_creation WHERE id = ? LIMIT 1`
    : `SELECT jobId, domain FROM job_creation WHERE ${jcSc0.where} ${jcSc0.order} LIMIT 1`;
  const findJcParams = jcId ? [jcId] : [...jcSc0.params, ...jcSc0.orderParams];

  const wuSc0 = wuScope(requestedJobId || rowId, requestedDomain);
  const findWorkSql = workId
    ? `SELECT job_id, domain FROM work_updates WHERE id = ? LIMIT 1`
    : `SELECT job_id, domain FROM work_updates WHERE ${wuSc0.where} LIMIT 1`;
  const findWorkParams = workId ? [workId] : wuSc0.params;

  db.query(findJcSql, findJcParams, (jcErr, jcRows) => {
    db.query(findWorkSql, findWorkParams, (wErr, wRows) => {
      const jcJobId = (!jcErr && jcRows && jcRows[0]) ? jcRows[0].jobId : "";
      const workJobId = (!wErr && wRows && wRows[0]) ? wRows[0].job_id : "";
      const jcDomain = (!jcErr && jcRows && jcRows[0]) ? jcRows[0].domain : "";
      const workDomain = (!wErr && wRows && wRows[0]) ? wRows[0].domain : "";

      const targetJobId = requestedJobId || jcJobId || workJobId || "";
      // FIX: sirf usi domain ki rows delete hongi jiski row delete ho rahi hai
      const targetDomain = requestedDomain || workDomain || jcDomain || "";

      const deleteFromJc = (cb) => {
        if (jcId) {
          db.query("DELETE FROM job_creation WHERE id = ?", [jcId], cb);
        } else if (targetJobId) {
          const sc = jcScope(targetJobId, targetDomain);
          db.query(`DELETE FROM job_creation WHERE ${sc.where}`, sc.params, cb);
        } else if (rowId) {

          db.query("DELETE FROM job_creation WHERE id = ?", [rowId], cb);
        } else {
          cb(null);
        }
      };

      const deleteFromWork = (cb) => {
        if (workId) {
          db.query("DELETE FROM work_updates WHERE id = ?", [workId], cb);
        } else if (targetJobId) {
          const sc = wuScope(targetJobId, targetDomain);
          db.query(`DELETE FROM work_updates WHERE ${sc.where}`, sc.params, cb);
        } else if (rowId) {
          db.query("DELETE FROM work_updates WHERE id = ?", [rowId], cb);
        } else {
          cb(null);
        }
      };

      deleteFromJc((err1) => {
        if (err1) {
          return res.status(500).json({ success: false, message: err1.message });
        }
        deleteFromWork((err2) => {
          if (err2) {
            return res.status(500).json({ success: false, message: err2.message });
          }

          return res.json({
            success: true,
            message: "Row and related data deleted successfully from both tables",
          });
        });
      });
    });
  });
 } catch (e) {
  console.error("deleteJob crashed:", e.message);
  return res.status(500).json({ success: false, message: e.message });
 }
};

exports.submitJob = (req, res) => {
 try {
  // domain / jcId / workId optional hain: frontend bheje to exact row update hogi
  const { jobId, month, submissionDate, domain, jcId, workId } = req.body || {};
  const formattedSubmissionDate = submissionDate && submissionDate !== "" ? submissionDate : null;
  const cleanJobId = clean(jobId);
  const cleanMonth = cleanSingleMonth(month);
  const cleanJcId = clean(jcId);
  const cleanWorkId = clean(workId);

  const fail = (e) =>
    res.status(500).json({
      success: false,
      message: e.message,
    });
  const done = () =>
    res.json({
      success: true,
      message: "Job Submitted Successfully",
    });

  const jcSc = jcScope(cleanJobId, domain);
  const findJcSql = cleanJcId
    ? "SELECT id, domain, market, month, receiveDate, ecdDate, otp, amdocsQc, internalQc FROM job_creation WHERE id = ? LIMIT 1"
    : `SELECT id, domain, market, month, receiveDate, ecdDate, otp, amdocsQc, internalQc FROM job_creation WHERE ${jcSc.where} ${jcSc.order} LIMIT 1`;
  const findJcParams = cleanJcId ? [cleanJcId] : [...jcSc.params, ...jcSc.orderParams];

  db.query(findJcSql, findJcParams, (jfErr, jfRows) => {
    if (jfErr) return fail(jfErr);

    if (!jfRows || jfRows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Job ID not found",
      });
    }

    const jc = jfRows[0];
    const rowDomain = clean(domain) || clean(jc.domain);

    const sql = `
      UPDATE job_creation
      SET submissionDate = ?,
          month = COALESCE(?, month),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `;

    db.query(sql, [formattedSubmissionDate, cleanMonth, jc.id], (err) => {
      if (err) return fail(err);

      const wuSc = wuScope(cleanJobId, rowDomain);
      const findWorkSql = cleanWorkId
        ? "SELECT id FROM work_updates WHERE id = ? LIMIT 1"
        : `SELECT id FROM work_updates WHERE ${wuSc.where} LIMIT 1`;
      const findWorkParams = cleanWorkId ? [cleanWorkId] : wuSc.params;

      db.query(findWorkSql, findWorkParams, (wErr, wRows) => {
        if (wErr) return fail(wErr);

        if (wRows && wRows.length > 0) {
          const updateWorkSync = `
            UPDATE work_updates
            SET submission_date = ?,
                months = COALESCE(?, months),
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `;
          return db.query(
            updateWorkSync,
            [formattedSubmissionDate, monthsParam(cleanMonth), wRows[0].id],
            (uErr) => (uErr ? fail(uErr) : done())
          );
        }

        // work_updates me row hi nahi thi -> job_creation se bana do
        const monthToStore = cleanMonth || cleanSingleMonth(jc.month);

        db.query(
          WORK_INSERT_SQL,
          workInsertParams({
            domain: jc.domain || rowDomain, state: jc.market, jobId: cleanJobId, month: monthToStore,
            receiveDate: jc.receiveDate, ecdDate: jc.ecdDate, submissionDate: formattedSubmissionDate,
            amdocsQc: jc.amdocsQc, internalQc: jc.internalQc, otp: jc.otp
          }),
          (iErr) => (iErr ? fail(iErr) : done())
        );
      });
    });
  });
 } catch (e) {
  console.error("submitJob crashed:", e.message);
  return res.status(500).json({ success: false, message: e.message });
 }
};
