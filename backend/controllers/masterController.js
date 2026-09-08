const db = require("../config/db");

/* =========================
   SAFE PARSER
========================= */
const parseSafe = (val) => {
  if (!val) return [];

  if (Array.isArray(val)) return val;

  if (typeof val === "string") {
    try {
      const parsed = JSON.parse(val);
      return Array.isArray(parsed) ? parsed : [parsed];
    } catch {
      return val
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean);
    }
  }

  return [];
};

/* =========================
   REMOVE DUPLICATES
========================= */
const uniqueArray = (arr) => [...new Set(arr.filter(Boolean))];

/* =========================
   CREATE DOMAIN
========================= */
exports.createDomain = (req, res) => {
  const { domain } = req.body;

  if (!domain) {
    return res.status(400).json({ error: "Domain is required" });
  }

  db.query(
    "SELECT * FROM master_data WHERE domain=?",
    [domain],
    (err, rows) => {
      if (err) return res.status(500).json(err);

      if (rows.length > 0) {
        return res.status(400).json({ error: "Domain already exists" });
      }

      db.query(
        "INSERT INTO master_data (domain, sow, jobType, uom) VALUES (?, ?, ?, ?)",
        [domain, "[]", "[]", "[]"],
        (err, result) => {
          if (err) return res.status(500).json(err);

          res.json({
            message: "Domain created successfully",
            data: {
              id: result.insertId,
              domain,
              sow: [],
              jobType: [],
              uom: [],
            },
          });
        }
      );
    }
  );
};

/* =========================
   GET ALL MASTER DATA (FIXED)
========================= */
exports.getMasterData = (req, res) => {
  db.query("SELECT * FROM master_data ORDER BY domain", (err, result) => {
    if (err) return res.status(500).json(err);

    const formatted = {};

    result.forEach((row) => {
      formatted[row.domain] = {
        id: row.id,
        sow: parseSafe(row.sow),
        jobType: parseSafe(row.jobType),
        uom: parseSafe(row.uom),
      };
    });

    res.json(formatted);
  });
};

/* =========================
   GET SINGLE DOMAIN
========================= */
exports.getDomainConfig = (req, res) => {
  const { domain } = req.params;

  db.query(
    "SELECT * FROM master_data WHERE domain=?",
    [domain],
    (err, rows) => {
      if (err) return res.status(500).json(err);

      if (rows.length === 0) {
        return res.status(404).json({ error: "Domain not found" });
      }

      const row = rows[0];

      res.json({
        id: row.id,
        domain: row.domain,
        sow: parseSafe(row.sow),
        jobType: parseSafe(row.jobType),
        uom: parseSafe(row.uom),
      });
    }
  );
};

/* =========================
   UPDATE MASTER DATA
========================= */
exports.updateMasterData = (req, res) => {
  const { domain, sow, jobType, uom } = req.body;

  if (!domain) {
    return res.status(400).json({ error: "Domain is required" });
  }

  const newSow = Array.isArray(sow) ? sow : sow ? [sow] : [];
  const newJobType = Array.isArray(jobType) ? jobType : jobType ? [jobType] : [];
  const newUom = Array.isArray(uom) ? uom : uom ? [uom] : [];

  db.query(
    "SELECT * FROM master_data WHERE domain=?",
    [domain],
    (err, rows) => {
      if (err) return res.status(500).json(err);

      if (rows.length === 0) {
        return res.status(404).json({ error: "Domain not found" });
      }

      const row = rows[0];

      const finalSow = uniqueArray([...parseSafe(row.sow), ...newSow]);
      const finalJobType = uniqueArray([...parseSafe(row.jobType), ...newJobType]);
      const finalUom = uniqueArray([...parseSafe(row.uom), ...newUom]);

      db.query(
        "UPDATE master_data SET sow=?, jobType=?, uom=? WHERE domain=?",
        [
          JSON.stringify(finalSow),
          JSON.stringify(finalJobType),
          JSON.stringify(finalUom),
          domain,
        ],
        (err) => {
          if (err) return res.status(500).json(err);

          res.json({
            message: "Updated successfully",
            data: {
              domain,
              sow: finalSow,
              jobType: finalJobType,
              uom: finalUom,
            },
          });
        }
      );
    }
  );
};

/* =========================
   DELETE SOW
========================= */
exports.deleteSow = (req, res) => {
  const { domain, sow } = req.body;

  db.query(
    "SELECT * FROM master_data WHERE domain=?",
    [domain],
    (err, rows) => {
      if (err) return res.status(500).json(err);
      if (rows.length === 0)
        return res.status(404).json({ error: "Domain not found" });

      const row = rows[0];

      const updated = parseSafe(row.sow).filter((item) => item !== sow);

      db.query(
        "UPDATE master_data SET sow=? WHERE domain=?",
        [JSON.stringify(updated), domain],
        (err) => {
          if (err) return res.status(500).json(err);

          res.json({
            message: "SOW deleted successfully",
            sow: updated,
          });
        }
      );
    }
  );
};

/* =========================
   DELETE JOB TYPE
========================= */
exports.deleteJobType = (req, res) => {
  const { domain, jobType } = req.body;

  db.query(
    "SELECT * FROM master_data WHERE domain=?",
    [domain],
    (err, rows) => {
      if (err) return res.status(500).json(err);
      if (rows.length === 0)
        return res.status(404).json({ error: "Domain not found" });

      const row = rows[0];

      const updated = parseSafe(row.jobType).filter(
        (item) => item !== jobType
      );

      db.query(
        "UPDATE master_data SET jobType=? WHERE domain=?",
        [JSON.stringify(updated), domain],
        (err) => {
          if (err) return res.status(500).json(err);

          res.json({
            message: "Job Type deleted successfully",
            jobType: updated,
          });
        }
      );
    }
  );
};

/* =========================
   DELETE UOM
========================= */
exports.deleteUom = (req, res) => {
  const { domain, uom } = req.body;

  db.query(
    "SELECT * FROM master_data WHERE domain=?",
    [domain],
    (err, rows) => {
      if (err) return res.status(500).json(err);
      if (rows.length === 0)
        return res.status(404).json({ error: "Domain not found" });

      const row = rows[0];

      const updated = parseSafe(row.uom).filter((item) => item !== uom);

      db.query(
        "UPDATE master_data SET uom=? WHERE domain=?",
        [JSON.stringify(updated), domain],
        (err) => {
          if (err) return res.status(500).json(err);

          res.json({
            message: "UOM deleted successfully",
            uom: updated,
          });
        }
      );
    }
  );
};

/* =========================
   DELETE DOMAIN
========================= */
exports.deleteDomain = (req, res) => {
  const { domain } = req.params;

  db.query(
    "DELETE FROM master_data WHERE domain=?",
    [domain],
    (err, result) => {
      if (err) return res.status(500).json(err);

      if (result.affectedRows === 0) {
        return res.status(404).json({ error: "Domain not found" });
      }

      res.json({ message: "Domain deleted successfully" });
    }
  );
};
exports.updateDomain = (req, res) => {
  const { oldDomain, newDomain } = req.body;

  if (!oldDomain || !newDomain) {
    return res.status(400).json({
      error: "Old domain and new domain are required",
    });
  }

  db.query(
    "SELECT * FROM master_data WHERE domain = ?",
    [oldDomain],
    (err, rows) => {
      if (err) return res.status(500).json(err);

      if (rows.length === 0) {
        return res.status(404).json({
          error: "Domain not found",
        });
      }

      db.query(
        "SELECT * FROM master_data WHERE domain = ?",
        [newDomain],
        (err, existing) => {
          if (err) return res.status(500).json(err);

          if (
            existing.length > 0 &&
            oldDomain !== newDomain
          ) {
            return res.status(400).json({
              error: "Domain already exists",
            });
          }

          db.query(
            "UPDATE master_data SET domain=? WHERE domain=?",
            [newDomain, oldDomain],
            (err, result) => {
              if (err)
                return res.status(500).json(err);

              res.json({
                message:
                  "Domain updated successfully",
              });
            }
          );
        }
      );
    }
  );
};