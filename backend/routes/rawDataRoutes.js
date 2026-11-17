const express = require("express");
const router = express.Router();
const multer = require("multer");
const ctrl = require("../controllers/rawDataController");

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
});

router.post("/import-excel", upload.single("file"), ctrl.importExcel);
router.get("/files", ctrl.getFiles);
router.delete("/file/:fileName", ctrl.deleteFile);
router.get("/domains", ctrl.getDomains);
router.get("/export/excel", ctrl.exportExcel);
router.get("/", ctrl.getRawData);

module.exports = router;
