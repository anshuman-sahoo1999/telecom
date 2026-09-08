const fs = require("fs");

const cleanName = (name) =>
  name.split(",")[0].replace(/county/i, "").trim();

// ALL counties
const getCounties = (req, res) => {
  const data = JSON.parse(fs.readFileSync("./counties.json"));

  res.json(data.map(i => cleanName(i.GeographicAreaName)));
};

// STATE wise
const getByState = (req, res) => {
  const state = req.params.state.toLowerCase();

  const data = JSON.parse(fs.readFileSync("./counties.json"));

  const filtered = data
    .filter(i =>
      i.GeographicAreaName.toLowerCase().includes(state)
    )
    .map(i => cleanName(i.GeographicAreaName));

  res.json(filtered);
};

module.exports = { getCounties, getByState };