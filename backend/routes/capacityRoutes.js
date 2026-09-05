// routes/capacityRoutes.js
const express = require("express");
const router = express.Router();
const {
  createCapacityForecast,
  getAllCapacityForecast,
  updateCapacityForecast,
  deleteCapacityForecast
} = require("../controllers/capacityController");

router.post("/", createCapacityForecast);
router.get("/", getAllCapacityForecast);
router.put("/:id", updateCapacityForecast);
router.delete("/:id", deleteCapacityForecast);

module.exports = router;