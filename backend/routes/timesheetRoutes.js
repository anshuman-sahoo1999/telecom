const express = require("express");
const router = express.Router();

const {
  saveTimesheet,
  getTimesheetByJob,
  getAllTimesheets,
  deleteEntry,
  updateStatus,
  checkTodayEntry,
} = require("../controllers/timesheetController");

router.post("/save", saveTimesheet);
router.get("/all", getAllTimesheets);
router.get("/job/:jobId", getTimesheetByJob);
router.delete("/:id", deleteEntry);
router.put("/update-status", updateStatus);
router.get("/check/:jobId", checkTodayEntry);

module.exports = router;