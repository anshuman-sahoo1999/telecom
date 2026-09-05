const express = require("express");
const router = express.Router();

const multer = require("multer");

const upload = multer({
  storage: multer.memoryStorage(),

  limits: {
    fileSize: 50 * 1024 * 1024
  }
});

const workController =
  require("../controllers/workController");

router.post(
  "/import-excel",
  upload.single("file"),
  workController.importExcel
);

module.exports = router;
