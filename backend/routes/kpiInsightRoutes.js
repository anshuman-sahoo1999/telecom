// routes/kpiInsightRoutes.js
const express = require("express");
const router = express.Router();
const {
  getAllQuality,
  getOptions,
  saveQuality,
} = require("../controllers/kpiInsightController");

router.get("/options", getOptions);
router.get("/", getAllQuality);
router.post("/", saveQuality);

module.exports = router;
