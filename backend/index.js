const express = require('express');
const cors = require('cors');

const app = express();

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'],
  credentials: true
}));
app.options('*', cors());

app.use(express.json());

const authRoutes = require('./routes/authRoutes');
const workRoutes = require("./routes/workRoutes");
const masterRoutes = require("./routes/masterRoutes");
const countyRoutes = require("./routes/countyRoutes");
const jobCreationRoutes = require("./routes/jobCreationRoutes");
const timesheetRoutes = require("./routes/timesheetRoutes");
const capacityRoutes = require("./routes/capacityRoutes");

app.use("/api/auth", authRoutes); 
app.use("/api/work", workRoutes);
app.use("/api/master", masterRoutes);
app.use("/api", countyRoutes);
app.use("/api/job", jobCreationRoutes);
app.use("/api/timesheet", timesheetRoutes);
app.use("/api/capacity-forecast", capacityRoutes);

const PORT = process.env.PORT || 5000;

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

module.exports = app;