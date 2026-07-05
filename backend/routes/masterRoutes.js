const express = require("express");
const router = express.Router();

const {
  createDomain,
  getMasterData,
  getDomainConfig,
  updateMasterData,
  deleteSow,
  deleteJobType,
  deleteUom,
  deleteDomain,
  updateDomain,
} = require("../controllers/masterController");

router.post("/create-domain", createDomain);
router.get("/", getMasterData);
router.get("/:domain", getDomainConfig);
router.post("/update", updateMasterData);
router.put("/update-domain", updateDomain);
router.delete("/delete-sow", deleteSow);
router.delete("/delete-jobtype", deleteJobType);
router.delete("/delete-uom", deleteUom);
router.delete("/delete-domain/:domain", deleteDomain);

module.exports = router;