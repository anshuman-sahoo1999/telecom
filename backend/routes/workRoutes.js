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

router.post("/add", workController.createWork);

router.get("/all", workController.getAllWork);

router.get("/file/:fileName", workController.getFileData);
router.delete("/delete-file/:fileName", workController.deleteFile);

router.get("/bydomain", workController.getDomainStats);

router.get("/jobtype", workController.getJobTypeStats);

router.get("/report/monthwise", workController.getMonthWiseReport);

router.get("/state-wise-jobs", workController.getStateWiseJobs);

router.get("/domain-last-update", workController.getDomainLastUpdate);

router.put("/update/:id", workController.updateWork);
router.delete("/delete/:id", workController.deleteWork);

router.delete("/clear", workController.clearWork);

module.exports = router;
