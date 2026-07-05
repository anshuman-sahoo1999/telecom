require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();

app.use(cors());
app.use(express.json());

const authRoutes = require('./routes/authRoutes'); // ✅ CHECK PATH
const workRoutes = require("./routes/workRoutes");
const masterRoutes = require("./routes/masterRoutes");
const countyRoutes = require("./routes/countyRoutes");
const jobCreationRoutes = require("./routes/jobCreationRoutes");
const timesheetRoutes = require("./routes/timesheetRoutes");


app.use("/api/auth", authRoutes); 
app.use("/api/work", workRoutes);
app.use("/api/master", masterRoutes);
app.use("/api", countyRoutes);
app.use("/api/job", jobCreationRoutes);
app.use("/api/timesheet", require("./routes/timesheetRoutes"));


app.listen(5000, () => {
  console.log('Server running on port 5000');
});

module.exports = app;