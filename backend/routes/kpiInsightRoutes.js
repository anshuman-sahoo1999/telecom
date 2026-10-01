// routes/kpiInsightRoutes.js
const express = require("express");
const router = express.Router();
const { getAllQuality, getOptions, saveQuality } = require("../controllers/kpiInsightController");
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

router.get("/options", wrap(getOptions));
router.get("/", wrap(getAllQuality));
router.post("/", wrap(saveQuality));

module.exports = router;
