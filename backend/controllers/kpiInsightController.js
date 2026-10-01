// controllers/kpiInsightController.js
// KPI Insight -> Quality Rating (%) : Month x Domain x Scope
const db = require("../config/db");

/* =========================
   DB helpers (NeonDB PostgreSQL + MySQL dono par chalega)
========================= */
const isMySQL = !!db.config; // mysql2 connection ke paas .config hota hai, Postgres wrapper ke paas nahi

const run = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.query(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)));
  });

const TABLE_SQL = isMySQL
  ? `CREATE TABLE IF NOT EXISTS kpi_quality (
      id INT AUTO_INCREMENT PRIMARY KEY,
      kpi_year INT NOT NULL,
      kpi_month INT NOT NULL,
      domain VARCHAR(100) NOT NULL,
      scope_name VARCHAR(150) NOT NULL DEFAULT '',
      quality_pct DECIMAL(6,2) NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_kpi_quality (kpi_year, kpi_month, domain, scope_name)
    )`
  : `CREATE TABLE IF NOT EXISTS kpi_quality (
      id SERIAL PRIMARY KEY,
      kpi_year INT NOT NULL,
      kpi_month INT NOT NULL,
      domain VARCHAR(100) NOT NULL,
      scope_name VARCHAR(150) NOT NULL DEFAULT '',
      quality_pct NUMERIC(6,2) NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (kpi_year, kpi_month, domain, scope_name)
    )`;

/* =========================
   Excel (Ecometrix Mar26 to Aug26 -> KPIs sheet -> Quality Rating) ka data
   [year, month, domain, scope, quality %]
   Table pehli baar khali ho to ye rows apne aap ek baar daal di jati hain.
========================= */
const EXCEL_SEED = [
  [2026, 3, "ASE", "", 83.86],
  [2026, 3, "F2", "", 64.83],
  [2026, 3, "JPA", "", 78.51],
  [2026, 3, "LUMEN", "Permit", 68.0],
  [2026, 3, "PERMIT", "IFP", 58.52],
  [2026, 3, "PERMIT", "IFP F1", 45.14],
  [2026, 3, "PLA", "IFP", 84.67],
  [2026, 4, "ASE", "", 85.49],
  [2026, 4, "F2", "", 83.0],
  [2026, 4, "JPA", "", 83.11],
  [2026, 4, "PERMIT", "IFP", 86.0],
  [2026, 4, "PERMIT", "IFP F1", 81.0],
  [2026, 4, "PLA", "IFP", 86.38],
  [2026, 5, "ASE", "", 86.67],
  [2026, 5, "F2", "", 76.16],
  [2026, 5, "JPA", "", 86.5],
  [2026, 5, "LUMEN", "Construction print", 39.0],
  [2026, 5, "LUMEN", "Permit", 46.18],
  [2026, 5, "PERMIT", "IFP", 90.0],
  [2026, 5, "PLA", "IFP", 86.24],
  [2026, 6, "ASE", "", 92.35],
  [2026, 6, "F2", "", 82.61],
  [2026, 6, "JPA", "", 85.79],
  [2026, 6, "LUMEN", "Construction print", 38.5],
  [2026, 6, "LUMEN", "Redline Drafting", 58.37],
  [2026, 6, "PERMIT", "IFP", 84.56],
  [2026, 6, "PLA", "IFP", 85.56],
  [2026, 7, "ASE", "", 91.15],
  [2026, 7, "F2", "", 81.74],
  [2026, 7, "JPA", "", 84.22],
  [2026, 7, "LUMEN", "Construction print", 47.0],
  [2026, 7, "LUMEN", "Redline Drafting", 49.39],
  [2026, 7, "PERMIT", "ASE", 26.5],
  [2026, 7, "PLA", "IFP", 88.92],
  [2026, 8, "ASE", "", 92.09],
  [2026, 8, "F2", "", 82.34],
  [2026, 8, "JPA", "", 84.24],
  [2026, 8, "LUMEN", "Construction print", 80.0],
  [2026, 8, "PERMIT", "ASE", 45.83],
  [2026, 8, "PERMIT", "IFP F1", 65.18],
  [2026, 8, "PLA", "IFP", 88.08]
];

/* Excel me jo domain / scope hain (master_data me na bhi ho to dropdown me aayenge) */
const DEFAULT_SCOPES = {
  ASE: [],
  F2: [],
  JPA: [],
  LUMEN: ["Construction print", "Permit", "Redline Drafting"],
  PERMIT: ["ASE", "IFP", "IFP F1", "FOB"],
  PLA: ["IFP"],
  TCP: ["IFP", "IFP F1"],
};

const clean = (v) => (v === null || v === undefined ? "" : v.toString().trim());
const normalizeDomain = (v) => clean(v).toUpperCase();

const parseList = (val) => {
  if (!val) return [];
  if (Array.isArray(val)) return val.map(clean).filter(Boolean);
  if (typeof val === "string") {
    try {
      const parsed = JSON.parse(val);
      return Array.isArray(parsed) ? parsed.map(clean).filter(Boolean) : [clean(parsed)].filter(Boolean);
    } catch {
      return val.split(",").map(clean).filter(Boolean);
    }
  }
  return [];
};

/* =========================
   Table ready + one time seed
========================= */
let readyPromise = null;

const seedIfEmpty = async () => {
  const countRows = await run("SELECT COUNT(*) AS total FROM kpi_quality");
  const total = Number(countRows && countRows[0] ? countRows[0].total : 0);
  if (total > 0) return;

  for (const [year, month, domain, scope, pct] of EXCEL_SEED) {
    try {
      await run(
        "INSERT INTO kpi_quality (kpi_year, kpi_month, domain, scope_name, quality_pct) VALUES (?, ?, ?, ?, ?)",
        [year, month, domain, scope, pct]
      );
    } catch (e) {
      // duplicate ho to ignore
    }
  }
};

const ensureReady = () => {
  if (!readyPromise) {
    readyPromise = (async () => {
      await run(TABLE_SQL);
      await seedIfEmpty();
    })().catch((err) => {
      readyPromise = null; // agli request me dobara try karega
      throw err;
    });
  }
  return readyPromise;
};

const mapRow = (r) => ({
  id: r.id,
  year: Number(r.kpi_year),
  month: Number(r.kpi_month),
  domain: r.domain,
  scope: r.scope_name || "",
  quality: Number(r.quality_pct),
});

/* =========================
   GET /api/kpi-insight  -> saari quality entries
========================= */
const getAllQuality = async (req, res) => {
  try {
    await ensureReady();
    const rows = await run(
      "SELECT id, kpi_year, kpi_month, domain, scope_name, quality_pct FROM kpi_quality ORDER BY kpi_year, kpi_month, domain, scope_name"
    );
    res.json((rows || []).map(mapRow));
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch KPI quality data", error: err.message });
  }
};

/* =========================
   GET /api/kpi-insight/options -> domain + uske scopes (dropdown ke liye)
   Sources: (1) pehle se saved entries  (2) master_data (domain / sow)  (3) Excel wale default
========================= */
const getOptions = async (req, res) => {
  try {
    await ensureReady();

    // domain -> Map(lowercase scope -> scope)
    const domainMap = new Map();
    const addDomain = (d) => {
      const key = normalizeDomain(d);
      if (!key) return null;
      if (!domainMap.has(key)) domainMap.set(key, new Map());
      return domainMap.get(key);
    };
    const addScope = (d, s) => {
      const scopes = addDomain(d);
      const name = clean(s);
      if (scopes && name && !scopes.has(name.toLowerCase())) scopes.set(name.toLowerCase(), name);
    };

    // (1) pehle se saved entries (inki spelling sabse pehle, taaki table ke column na toote)
    const saved = await run("SELECT DISTINCT domain, scope_name FROM kpi_quality");
    (saved || []).forEach((r) => addScope(r.domain, r.scope_name));

    // (2) master_data (Domain Creation me jo domain / sow bana hai)
    try {
      const master = await run("SELECT domain, sow FROM master_data ORDER BY domain");
      (master || []).forEach((r) => {
        addDomain(r.domain);
        parseList(r.sow).forEach((s) => addScope(r.domain, s));
      });
    } catch (e) {
      // master_data na mile to bhi chalega
    }

    // (3) Excel wale default
    Object.entries(DEFAULT_SCOPES).forEach(([d, scopes]) => {
      addDomain(d);
      scopes.forEach((s) => addScope(d, s));
    });

    const domains = [...domainMap.entries()]
      .map(([domain, scopes]) => ({
        domain,
        scopes: [...scopes.values()].sort((a, b) => a.localeCompare(b)),
      }))
      .sort((a, b) => a.domain.localeCompare(b.domain));

    res.json({ domains });
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch KPI options", error: err.message });
  }
};

/* =========================
   POST /api/kpi-insight -> Create / Update (same month + domain + scope ho to update)
   body: { year, month, domain, scope, quality }
========================= */
const saveQuality = async (req, res) => {
  try {
    const body = req.body || {};
    const year = parseInt(body.year, 10);
    const month = parseInt(body.month, 10);
    const domain = normalizeDomain(body.domain);
    let scope = clean(body.scope);
    const quality = parseFloat(clean(body.quality).replace("%", ""));

    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
      return res.status(400).json({ message: "Valid year is required" });
    }
    if (!Number.isInteger(month) || month < 1 || month > 12) {
      return res.status(400).json({ message: "Valid month is required" });
    }
    if (!domain) {
      return res.status(400).json({ message: "Domain is required" });
    }
    if (scope.length > 150 || domain.length > 100) {
      return res.status(400).json({ message: "Domain / scope is too long" });
    }
    if (!Number.isFinite(quality) || quality < 0 || quality > 100) {
      return res.status(400).json({ message: "Quality % must be between 0 and 100" });
    }
    const pct = Math.round(quality * 100) / 100;

    await ensureReady();

    // Same domain me scope pehle kisi aur spelling/case me saved ho to wahi spelling use ho
    if (scope) {
      const spellings = await run("SELECT DISTINCT scope_name FROM kpi_quality WHERE domain = ?", [domain]);
      const match = (spellings || []).find(
        (r) => clean(r.scope_name).toLowerCase() === scope.toLowerCase()
      );
      if (match) scope = clean(match.scope_name);
    }

    const existing = await run(
      "SELECT id FROM kpi_quality WHERE kpi_year = ? AND kpi_month = ? AND domain = ? AND scope_name = ?",
      [year, month, domain, scope]
    );

    if (existing && existing.length > 0) {
      await run(
        "UPDATE kpi_quality SET quality_pct = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        [pct, existing[0].id]
      );
      return res.json({ message: "Quality % updated successfully", action: "updated", id: existing[0].id });
    }

    const result = await run(
      "INSERT INTO kpi_quality (kpi_year, kpi_month, domain, scope_name, quality_pct) VALUES (?, ?, ?, ?, ?)",
      [year, month, domain, scope, pct]
    );
    res.json({ message: "Quality % created successfully", action: "created", id: result ? result.insertId : null });
  } catch (err) {
    res.status(500).json({ message: "Failed to save quality %", error: err.message });
  }
};

module.exports = {
  getAllQuality,
  getOptions,
  saveQuality,
};
