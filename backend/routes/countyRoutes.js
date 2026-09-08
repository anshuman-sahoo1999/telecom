const express = require("express");
const router = express.Router();

const { getCounties, getByState } = require("../controllers/countyController");

// ALL counties
router.get("/county", getCounties);

// STATE wise counties (clean version)
router.get("/county/:state", getByState);

module.exports = router;