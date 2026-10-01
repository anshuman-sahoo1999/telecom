const express = require("express");
const router = express.Router();
const {
  getAllQuality,
  getOptions,
  saveQuality,
  updateQuality,
  deleteQuality,
} = require("../controllers/kpiInsightController");

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

router.get("/options", wrap(getOptions)); 
router.get("/", wrap(getAllQuality));
router.post("/", wrap(saveQuality));
router.put("/:id", wrap(updateQuality));
router.delete("/:id", wrap(deleteQuality));

module.exports = router;
