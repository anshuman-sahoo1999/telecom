const fs = require("fs");
const path = require("path");

const countiesFilePath = path.join(__dirname, "../counties.json");

const cleanName = (name) =>
  name.split(",")[0].replace(/county/i, "").trim();

// ALL counties
const getCounties = (req, res) => {
  try {
    const data = JSON.parse(fs.readFileSync(countiesFilePath, "utf8"));
    res.json(data.map(i => cleanName(i.GeographicAreaName)));
  } catch (err) {
    console.error("Counties read error:", err);
    res.status(500).json({ error: "Failed to read counties data" });
  }
};

// STATE wise
const getByState = (req, res) => {
  try {
    const state = req.params.state.toLowerCase();
    const data = JSON.parse(fs.readFileSync(countiesFilePath, "utf8"));
    const filtered = data
      .filter(i => i.GeographicAreaName.toLowerCase().includes(state))
      .map(i => cleanName(i.GeographicAreaName));
    res.json(filtered);
  } catch (err) {
    console.error("Counties read error by state:", err);
    res.status(500).json({ error: "Failed to read counties data" });
  }
};

module.exports = { getCounties, getByState };