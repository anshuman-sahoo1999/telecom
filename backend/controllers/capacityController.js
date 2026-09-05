// controllers/capacityController.js[cite: 1]
const db = require("../config/db");

const clean = (v) => (v ? v.toString().trim() : "");
const normalize = (v) => clean(v).toUpperCase();

const createCapacityForecast = (req, res) => {
  const {
    month,
    domain,
    capacity,
    forecast,
    inflow,
    uom
  } = req.body;

  const fixedDomain = normalize(domain);

  const sql = `
    INSERT INTO capacity_forecast
    (
      month,
      domain,
      capacity,
      forecast,
      inflow,
      uom
    )
    VALUES (?, ?, ?, ?, ?, ?)
  `;

  db.query(
    sql,
    [
      clean(month),
      fixedDomain,
      Number(capacity || 0),
      Number(forecast || 0),
      Number(inflow || 0),
      JSON.stringify(uom || {})
    ],
    (err, result) => {
      if (err) {
        return res.status(500).json({
          message: "Failed to save capacity forecast",
          error: err.message
        });
      }

      res.json({
        message: "Capacity forecast added successfully",
        id: result.insertId
      });
    }
  );
};

const getAllCapacityForecast = (req, res) => {
  db.query(
    "SELECT * FROM capacity_forecast ORDER BY id DESC",
    (err, rows) => {
      if (err) {
        return res.status(500).json({
          message: "Failed to fetch capacity forecast data",
          error: err.message
        });
      }

      const data = rows.map((row) => ({
        ...row,
        uom: row.uom ? JSON.parse(row.uom) : {}
      }));

      res.json(data);
    }
  );
};

const updateCapacityForecast = (req, res) => {
  const { id } = req.params;
  const {
    month,
    domain,
    capacity,
    forecast,
    inflow,
    uom
  } = req.body;

  const fixedDomain = normalize(domain);

  const sql = `
    UPDATE capacity_forecast
    SET month = ?, domain = ?, capacity = ?, forecast = ?, inflow = ?, uom = ?
    WHERE id = ?
  `;

  db.query(
    sql,
    [
      clean(month),
      fixedDomain,
      Number(capacity || 0),
      Number(forecast || 0),
      Number(inflow || 0),
      JSON.stringify(uom || {}),
      id
    ],
    (err, result) => {
      if (err) {
        return res.status(500).json({
          message: "Failed to update record",
          error: err.message
        });
      }

      if (result.affectedRows === 0) {
        return res.status(404).json({
          message: "Record not found"
        });
      }

      res.json({
        message: "Capacity forecast updated successfully"
      });
    }
  );
};

const deleteCapacityForecast = (req, res) => {
  db.query(
    "DELETE FROM capacity_forecast WHERE id = ?",
    [req.params.id],
    (err) => {
      if (err) {
        return res.status(500).json({
          message: "Failed to delete record",
          error: err.message
        });
      }

      res.json({
        message: "Capacity forecast deleted successfully"
      });
    }
  );
};

module.exports = {
  createCapacityForecast,
  getAllCapacityForecast,
  updateCapacityForecast,
  deleteCapacityForecast
};