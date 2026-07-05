import React, { useState, useEffect } from "react";
import axios from "axios";
import { FaHome, FaClock, FaPlus } from "react-icons/fa";
import "../style/TeamMemberDashboard.css";
import TimesheetModal from "../components/TimesheetModal";
import TimesheetPage from "../Pages/TimesheetPage";
import { useOutletContext } from "react-router-dom";

const TeamMemberDashboard = () => {
  const [jobs, setJobs] = useState([]);
  const [showTimesheet, setShowTimesheet] = useState(false);
  const [activePage, setActivePage] = useState("home");

  // only use menuOpen (NO ESLint warning)
  const { menuOpen, setMenuOpen } = useOutletContext();
  const handleMenuClick = (page) => {
    setActivePage(page);

    if (window.innerWidth <= 992) {
      setMenuOpen(false);
    }
  };

  // FETCH JOBS
  const fetchJobs = async () => {
    try {
      const userData = JSON.parse(localStorage.getItem("user"));
      const domain = userData?.domain;

      const res = await axios.get(
        `http://localhost:5000/api/job/all?domain=${domain}`
      );

      setJobs(res.data || []);
    } catch (error) {
      console.log("Job fetch error:", error);
    }
  };

  useEffect(() => {
    fetchJobs();
  }, []);

  const today = new Date();

  const formatDate = (d) =>
    d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });

  const monthName = today.toLocaleDateString("en-GB", { month: "long" });

  const weekStart = new Date(today);
  weekStart.setDate(today.getDate() - today.getDay());
  weekStart.setHours(0, 0, 0, 0);

  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  weekEnd.setHours(23, 59, 59, 999);

  const todayJobs = jobs.filter((job) => {
    const d = new Date(job.receiveDate);
    return (
      d.getDate() === today.getDate() &&
      d.getMonth() === today.getMonth() &&
      d.getFullYear() === today.getFullYear()
    );
  }).length;

  const thisWeekJobs = jobs.filter((job) => {
    const d = new Date(job.receiveDate);
    return d >= weekStart && d <= weekEnd;
  }).length;

  const thisMonthJobs = jobs.filter((job) => {
    const d = new Date(job.receiveDate);
    return (
      d.getMonth() === today.getMonth() &&
      d.getFullYear() === today.getFullYear()
    );
  }).length;

  const completedJobs = jobs.filter(
    (job) => job.status === "Completed"
  ).length;

  return (
    <div className="dashboard-wrapper">

      {/* SIDEBAR */}
      <aside className={`sidebar ${menuOpen ? "open" : "collapsed"}`}>
        <button
          className={`nav-item ${activePage === "home" ? "active" : ""}`}
          onClick={() => handleMenuClick("home")}
        >
          <FaHome />
          <span>Dashboard</span>
        </button>

        <button
          className={`nav-item ${activePage === "timesheet" ? "active" : ""}`}
          onClick={() => handleMenuClick("timesheet")}
        > 
          <FaClock />
          <span>Timesheet</span>
        </button>
      </aside>

      {/* MAIN */}
      <div className="main-container">

        <div className="menu-icon-container">
          <div
            className={`menu-icon ${menuOpen ? "" : "active"}`}
            onClick={() => setMenuOpen(!menuOpen)}
          >
            <span className="bar1"></span>
            <span className="bar2"></span>
            <span className="bar3"></span>
          </div>
        </div>
        {activePage === "home" && (
          <div className="content">
            <h1 className="title">EMPLOYEE DASHBOARD</h1>

            <div className="card-grid">

              <div className="card">
                <h4>Jobs Received Today</h4>
                <h2>{todayJobs}</h2>
              </div>

              <div className="card">
                <h4>
                  This Week<br />
                  <small>({formatDate(weekStart)} - {formatDate(weekEnd)})</small>
                </h4>
                <h2>{thisWeekJobs}</h2>
              </div>

              <div className="card">
                <h4>
                  This Month<br />
                  <small>({monthName})</small>
                </h4>
                <h2>{thisMonthJobs}</h2>
              </div>

              <div className="card">
                <h4>Completed Jobs</h4>
                <h2>{completedJobs}</h2>
              </div>

              <div className="timesheet-card">
                <span>Timesheet / Status Update</span>
                <button onClick={() => setShowTimesheet(true)}>
                  <FaPlus />
                </button>
              </div>

            </div>
          </div>
        )}

        {activePage === "timesheet" && (
          <TimesheetPage jobs={jobs} />
        )}

      </div>

      {showTimesheet && (
        <TimesheetModal
          jobs={jobs}
          onClose={() => setShowTimesheet(false)}
        />
      )}
    </div>
  );
};

export default TeamMemberDashboard;