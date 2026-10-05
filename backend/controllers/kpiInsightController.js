const db = require("../config/db");
const isMySQL = !!db.config; 

const run = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.query(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)));
  });

const TABLE_SQL = isMySQL
  ? `CREATE TABLE IF NOT EXISTS kpi_quality (
      id INT AUTO_INCREMENT PRIMARY KEY,
      kpi_type VARCHAR(50) NOT NULL DEFAULT 'Quality Rating',
      kpi_year INT NOT NULL,
      kpi_month INT NOT NULL,
      domain VARCHAR(100) NOT NULL,
      scope_name VARCHAR(150) NOT NULL DEFAULT '',
      quality_pct DECIMAL(6,2) NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_kpi_quality_v2 (kpi_type, kpi_year, kpi_month, domain, scope_name)
    )`
  : `CREATE TABLE IF NOT EXISTS kpi_quality (
      id SERIAL PRIMARY KEY,
      kpi_type VARCHAR(50) NOT NULL DEFAULT 'Quality Rating',
      kpi_year INT NOT NULL,
      kpi_month INT NOT NULL,
      domain VARCHAR(100) NOT NULL,
      scope_name VARCHAR(150) NOT NULL DEFAULT '',
      quality_pct NUMERIC(6,2) NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`; // Postgres: unique index is created in migrateTable()

const KPI_TYPES = ["Quality Rating", "On Time Delivery", "Repeat"];
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

const isDuplicateError = (err) =>
  !!err && (err.code === "ER_DUP_ENTRY" || err.errno === 1062 || err.code === "23505");


// Old table (without kpi_type) ko safely upgrade karta hai. Purana data "Quality Rating" ban jata hai.
const migrateTable = async () => {
  if (isMySQL) {
    const col = await run("SHOW COLUMNS FROM kpi_quality LIKE 'kpi_type'");
    if (!col || col.length === 0) {
      await run("ALTER TABLE kpi_quality ADD COLUMN kpi_type VARCHAR(50) NOT NULL DEFAULT 'Quality Rating' AFTER id");
    }
    const oldKey = await run("SHOW INDEX FROM kpi_quality WHERE Key_name = 'uq_kpi_quality'");
    if (oldKey && oldKey.length > 0) {
      await run(
        "ALTER TABLE kpi_quality DROP INDEX uq_kpi_quality, ADD UNIQUE KEY uq_kpi_quality_v2 (kpi_type, kpi_year, kpi_month, domain, scope_name)"
      );
    }
  } else {
    await run("ALTER TABLE kpi_quality ADD COLUMN IF NOT EXISTS kpi_type VARCHAR(50) NOT NULL DEFAULT 'Quality Rating'");
    await run("ALTER TABLE kpi_quality DROP CONSTRAINT IF EXISTS kpi_quality_kpi_year_kpi_month_domain_scope_name_key");
    await run(
      "CREATE UNIQUE INDEX IF NOT EXISTS uq_kpi_quality_v2 ON kpi_quality (kpi_type, kpi_year, kpi_month, domain, scope_name)"
    );
  }
};

let readyPromise = null;

const ensureReady = () => {
  if (!readyPromise) {
    readyPromise = run(TABLE_SQL).then(migrateTable).catch((err) => {
      readyPromise = null; 
      throw err;
    });
  }
  return readyPromise;
};

const mapRow = (r) => ({
  id: r.id,
  kpi: r.kpi_type || "Quality Rating",
  year: Number(r.kpi_year),
  month: Number(r.kpi_month),
  domain: r.domain,
  scope: r.scope_name || "",
  quality: Number(r.quality_pct),
});

/* =========================
   Validation helpers
========================= */
const parseId = (v) => {
  const id = parseInt(v, 10);
  return Number.isInteger(id) && id > 0 ? id : null;
};

// body se year / month / domain / scope / quality nikal kar validate karta hai.
// defaults: update me jo field na aaye wo purani value se bhar jati hai.
const normalizeKpi = (v) => {
  const name = clean(v);
  if (!name) return KPI_TYPES[0]; // kpi na aaye to Quality Rating (purana behaviour)
  return KPI_TYPES.find((k) => k.toLowerCase() === name.toLowerCase()) || null;
};

const parsePayload = (body = {}, defaults = {}) => {
  const pick = (key) => (body[key] !== undefined ? body[key] : defaults[key]);

  const kpi = normalizeKpi(pick("kpi"));
  if (!kpi) return { error: "Valid KPI is required" };

  const year = parseInt(pick("year"), 10);
  const month = parseInt(pick("month"), 10);
  const domain = normalizeDomain(pick("domain"));
  const scope = clean(pick("scope"));
  const quality = parseFloat(clean(pick("quality")).replace("%", ""));

  if (!Number.isInteger(year) || year < 2000 || year > 2100) return { error: "Valid year is required" };
  if (!Number.isInteger(month) || month < 1 || month > 12) return { error: "Valid month is required" };
  if (!domain) return { error: "Domain is required" };
  if (domain.length > 100 || scope.length > 150) return { error: "Domain / scope is too long" };
  if (!Number.isFinite(quality) || quality < 0 || quality > 100) {
    return { error: "Quality % must be between 0 and 100" };
  }

  return { kpi, year, month, domain, scope, pct: Math.round(quality * 100) / 100 };
};

const resolveScopeSpelling = async (domain, scope) => {
  if (!scope) return scope;
  const spellings = await run("SELECT DISTINCT scope_name FROM kpi_quality WHERE domain = ?", [domain]);
  const match = (spellings || []).find((r) => clean(r.scope_name).toLowerCase() === scope.toLowerCase());
  return match ? clean(match.scope_name) : scope;
};

const findByKey = async (kpi, year, month, domain, scope) => {
  const rows = await run(
    "SELECT id FROM kpi_quality WHERE kpi_type = ? AND kpi_year = ? AND kpi_month = ? AND domain = ? AND scope_name = ?",
    [kpi, year, month, domain, scope]
  );
  return rows && rows.length > 0 ? rows[0] : null;
};

const getAllQuality = async (req, res) => {
  try {
    await ensureReady();
    const rows = await run(
      "SELECT id, kpi_type, kpi_year, kpi_month, domain, scope_name, quality_pct FROM kpi_quality ORDER BY kpi_year, kpi_month, domain, scope_name"
    );
    res.json((rows || []).map(mapRow));
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch KPI quality data", error: err.message });
  }
};

const getOptions = async (req, res) => {
  try {
    await ensureReady();
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
    const saved = await run("SELECT DISTINCT domain, scope_name FROM kpi_quality");
    (saved || []).forEach((r) => addScope(r.domain, r.scope_name));
    try {
      const master = await run("SELECT domain, sow FROM master_data ORDER BY domain");
      (master || []).forEach((r) => {
        addDomain(r.domain);
        parseList(r.sow).forEach((s) => addScope(r.domain, s));
      });
    } catch (e) {
    }

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
   POST /api/kpi-insight -> Create (same month + domain + scope ho to update)
   body: { year, month, domain, scope, quality }
========================= */
const saveQuality = async (req, res) => {
  try {
    const parsed = parsePayload(req.body);
    if (parsed.error) return res.status(400).json({ message: parsed.error });

    const { kpi, year, month, domain, pct } = parsed;

    await ensureReady();
    const scope = await resolveScopeSpelling(domain, parsed.scope);

    const existing = await findByKey(kpi, year, month, domain, scope);
    if (existing) {
      await run("UPDATE kpi_quality SET quality_pct = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", [
        pct,
        existing.id,
      ]);
      return res.json({ message: "Quality % updated successfully", action: "updated", id: existing.id });
    }

    try {
      await run(
        "INSERT INTO kpi_quality (kpi_type, kpi_year, kpi_month, domain, scope_name, quality_pct) VALUES (?, ?, ?, ?, ?, ?)",
        [kpi, year, month, domain, scope, pct]
      );
    } catch (err) {
      // do request ek saath aayein to unique key fail hogi -> update kar do
      if (!isDuplicateError(err)) throw err;
      const again = await findByKey(kpi, year, month, domain, scope);
      if (!again) throw err;
      await run("UPDATE kpi_quality SET quality_pct = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", [
        pct,
        again.id,
      ]);
      return res.json({ message: "Quality % updated successfully", action: "updated", id: again.id });
    }

    // id wapas select se (MySQL insertId / Postgres RETURNING dono ki zarurat nahi)
    const created = await findByKey(kpi, year, month, domain, scope);
    res.status(201).json({ message: "Quality % created successfully", action: "created", id: created ? created.id : null });
  } catch (err) {
    res.status(500).json({ message: "Failed to save quality %", error: err.message });
  }
};

/* =========================
   PUT /api/kpi-insight/:id -> Edit / Update
   body: { year?, month?, domain?, scope?, quality? }  (jo na aaye wo purani value rahegi)
========================= */
const updateQuality = async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ message: "Valid id is required" });

    await ensureReady();

    const rows = await run(
      "SELECT id, kpi_type, kpi_year, kpi_month, domain, scope_name, quality_pct FROM kpi_quality WHERE id = ?",
      [id]
    );
    if (!rows || rows.length === 0) return res.status(404).json({ message: "Quality entry not found" });
    const current = mapRow(rows[0]);

    const parsed = parsePayload(req.body, {
      kpi: current.kpi,
      year: current.year,
      month: current.month,
      domain: current.domain,
      scope: current.scope,
      quality: current.quality,
    });
    if (parsed.error) return res.status(400).json({ message: parsed.error });

    const { kpi, year, month, domain, pct } = parsed;
    const scope = await resolveScopeSpelling(domain, parsed.scope);

    // Month / domain / scope badalne par kisi aur entry se takraye to mana karo
    const clash = await findByKey(kpi, year, month, domain, scope);
    if (clash && Number(clash.id) !== id) {
      return res.status(409).json({ message: "An entry already exists for this month, domain and scope" });
    }

    try {
      await run(
        "UPDATE kpi_quality SET kpi_type = ?, kpi_year = ?, kpi_month = ?, domain = ?, scope_name = ?, quality_pct = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        [kpi, year, month, domain, scope, pct, id]
      );
    } catch (err) {
      if (isDuplicateError(err)) {
        return res.status(409).json({ message: "An entry already exists for this month, domain and scope" });
      }
      throw err;
    }

    res.json({
      message: "Quality % updated successfully",
      action: "updated",
      id,
      entry: { id, kpi, year, month, domain, scope, quality: pct },
    });
  } catch (err) {
    res.status(500).json({ message: "Failed to update quality %", error: err.message });
  }
};

/* =========================
   DELETE /api/kpi-insight/:id -> ek entry delete
========================= */
const deleteQuality = async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ message: "Valid id is required" });

    await ensureReady();

    const rows = await run("SELECT id FROM kpi_quality WHERE id = ?", [id]);
    if (!rows || rows.length === 0) return res.status(404).json({ message: "Quality entry not found" });

    await run("DELETE FROM kpi_quality WHERE id = ?", [id]);
    res.json({ message: "Quality % deleted successfully", action: "deleted", id });
  } catch (err) {
    res.status(500).json({ message: "Failed to delete quality %", error: err.message });
  }
};

module.exports = {
  getAllQuality,
  getOptions,
  saveQuality,
  updateQuality,
  deleteQuality,
};
