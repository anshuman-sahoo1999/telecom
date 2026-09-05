const express = require("express");
const router = express.Router();

const {
  createJob,
  getAllJobs,
  updateJob,
  deleteJob,
  submitJob, 
} = require("../controllers/jobCreationController");

// 1. Specific POST/GET routes pehle aayenge
router.post("/create", createJob);
router.post("/submit", submitJob); 
router.get("/all", getAllJobs);
router.get("/", getAllJobs);
router.put("/update/:id", updateJob);
router.delete("/delete/:id", deleteJob);
router.put("/:id", updateJob);
router.delete("/:id", deleteJob);

module.exports = router;
