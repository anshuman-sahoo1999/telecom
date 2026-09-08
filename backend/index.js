const express = require('express');
const cors = require('cors');

const app = express();

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'],
  credentials: true
}));

app.use(express.json());

// Health Check Routes
app.get('/', (req, res) => {
  res.json({ success: true, message: "Telecom API is running with NeonDB PostgreSQL!" });
});
app.get('/health', (req, res) => {
  res.json({ status: "healthy", timestamp: new Date() });
});
app.get('/api/health', (req, res) => {
  res.json({ status: "healthy", timestamp: new Date() });
});

const authRoutes = require('./routes/authRoutes');
const workRoutes = require("./routes/workRoutes");
const masterRoutes = require("./routes/masterRoutes");
const countyRoutes = require("./routes/countyRoutes");
const jobCreationRoutes = require("./routes/jobCreationRoutes");
const timesheetRoutes = require("./routes/timesheetRoutes");
const capacityRoutes = require("./routes/capacityRoutes");

// Mount routes with and without /api prefix for Vercel routing compatibility
app.use("/api/auth", authRoutes); 
app.use("/auth", authRoutes); 

app.use("/api/work", workRoutes);
app.use("/work", workRoutes);

app.use("/api/master", masterRoutes);
app.use("/master", masterRoutes);

app.use("/api/job", jobCreationRoutes);
app.use("/job", jobCreationRoutes);

app.use("/api/timesheet", timesheetRoutes);
app.use("/timesheet", timesheetRoutes);

app.use("/api/capacity-forecast", capacityRoutes);
app.use("/capacity-forecast", capacityRoutes);

app.use("/api", countyRoutes);
app.use("/", countyRoutes);

// Global Error Handler for Vercel Serverless Function resilience
app.use((err, req, res, next) => {
  console.error("Global Server Error:", err);
  res.status(500).json({
    success: false,
    message: err.message || "Internal Server Error"
  });
});

const PORT = process.env.PORT || 5000;

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

module.exports = app;