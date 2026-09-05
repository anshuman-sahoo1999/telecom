const fs = require("fs");
const path = require("path");

const COUNTIES_PATH = path.join(__dirname, "..", "counties.json");

const cleanName = (name) =>
  name.split(",")[0].replace(/county/i, "").trim();

// ALL counties
const getCounties = (req, res) => {
  const data = JSON.parse(fs.readFileSync(COUNTIES_PATH));

  res.json(data.map(i => cleanName(i.GeographicAreaName)));
};

// STATE wise
const getByState = (req, res) => {
  const state = req.params.state.toLowerCase();

  const data = JSON.parse(fs.readFileSync(COUNTIES_PATH));

  const filtered = data
    .filter(i =>
      i.GeographicAreaName.toLowerCase().includes(state)
    )
    .map(i => cleanName(i.GeographicAreaName));

  res.json(filtered);
};

module.exports = { getCounties, getByState };
