const express = require("express");
const router = express.Router();
const multer = require("multer");
const ctrl = require("../controllers/rawDataController");

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB
});

const uploadSingle = (req, res, next) =>
  upload.single("file")(req, res, (err) => {
    if (!err) return next();
    const tooBig = err.code === "LIMIT_FILE_SIZE";
    res.status(tooBig ? 413 : 400).json({
      success: false,
      message: tooBig ? "File is too large (max 50 MB)" : err.message,
    });
  });

router.post("/import-excel", uploadSingle, ctrl.importExcel);
router.get("/files", ctrl.getFiles);
router.get("/file/:fileName", ctrl.getFileData);
router.delete("/file/:fileName", ctrl.deleteFile);
router.get("/domains", ctrl.getDomains);
router.get("/export/excel", ctrl.exportExcel);
router.get("/", ctrl.getRawData);

module.exports = router;
