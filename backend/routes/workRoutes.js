const express = require("express");
const router = express.Router();
const multer = require("multer");
const workController = require("../controllers/workController");

/* ======================================
   MULTER CONFIG (Excel Upload)
====================================== */

const upload = multer({
  storage: multer.memoryStorage()
});

/* ======================================
   IMPORT EXCEL
====================================== */

router.post(
  "/import-excel",
  upload.single("file"),
  workController.importExcel
);

/* ======================================
   CREATE SINGLE WORK ENTRY
====================================== */

router.post("/add", workController.createWork);

/* ======================================
   GET ALL WORK DATA
====================================== */

router.get("/all", workController.getAllWork);

/* ======================================
   VIEW FILE (❗ FIX ADDED)
====================================== */

router.get("/file/:fileName", workController.getFileData);
router.delete("/delete-file/:fileName", workController.deleteFile);

/* ======================================
   DOMAIN WISE STATS
====================================== */

router.get("/bydomain", workController.getDomainStats);

/* ======================================
   JOB TYPE STATS
====================================== */

router.get("/jobtype", workController.getJobTypeStats);

/* ======================================
   MONTH WISE REPORT
====================================== */

router.get("/report/monthwise", workController.getMonthWiseReport);

/* ======================================
   STATE WISE JOBS SUMMARY
====================================== */

router.get("/state-wise-jobs", workController.getStateWiseJobs);

/* ======================================
   DOMAIN LAST UPDATE
====================================== */

router.get("/domain-last-update", workController.getDomainLastUpdate);

/* ======================================
   UPDATE SINGLE RECORD
====================================== */

router.put("/update/:id", workController.updateWork);

/* ======================================
   DELETE SINGLE RECORD
====================================== */

router.delete("/delete/:id", workController.deleteWork);

/* ======================================
   CLEAR ALL DATA
====================================== */

router.delete("/clear", workController.clearWork);

module.exports = router;