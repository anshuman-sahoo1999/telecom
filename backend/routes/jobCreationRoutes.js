const express = require("express");
const router = express.Router();

const {
  createJob,
  getAllJobs,
  updateJob,
  deleteJob,
} = require("../controllers/jobCreationController");

router.post("/create", createJob);
router.get("/all", getAllJobs);
router.put("/update/:id", updateJob);
router.delete("/delete/:id", deleteJob);

module.exports = router;