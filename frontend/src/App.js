import React from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";

import Login from "./Pages/login";
import Telecom from "./Pages/telecom";
import WorkUpdate from "./Pages/WorkUpdate";
import Report from "./Pages/Report";
import MasterDomainCreation from "./Pages/MasterDomainCreation";

import Header from "./components/header";
import ProtectedRoute from "./components/ProtectedRoute";

import AdminDashboard from "./Pages/AdminDashboard";
import MISDashboard from "./Pages/MISDashboard";
import TeamLeadDashboard from "./Pages/TeamLeadDashboard";
import TeamMemberDashboard from "./Pages/TeamMemberDashboard";
import MasterDashboard from "./Pages/MasterDashboard";
import UserManagement from "./Pages/UserManagement";
import Organogram from "./Pages/Organogram";
import JobCreation from "./Pages/JobCreation";
import TimesheetPage from "./Pages/TimesheetPage";
import TimesheetManagement from "./Pages/TimesheetManagement"
import JobHistory from "./Pages/JobHistory"

function App() {
  return (
    <Router>
      <Routes>
        {/* Login */}
        <Route path="/" element={<Login />} />

        {/* ================= ADMIN ================= */}
        <Route
          element={
            <ProtectedRoute allowedRoles={["Admin"]}>
              <Header />
            </ProtectedRoute>
          }
        >
          <Route path="/admin-dashboard" element={<AdminDashboard />} />
          <Route path="/admin-dashboard/telecom" element={<Telecom />} />
          <Route path="/admin-dashboard/workupdate" element={<WorkUpdate />} />
          <Route path="/admin-dashboard/report" element={<Report />} />
          <Route path="/admin-dashboard/user-management" element={<UserManagement />} />
          <Route path="/admin-dashboard/organogram" element={<Organogram />} />
          <Route
            path="/teamlead-dashboard/workstatus"
            element={<TimesheetManagement />}
          />
        </Route>

        {/* ================= MIS ================= */}
        <Route
          element={
            <ProtectedRoute allowedRoles={["MIS"]}>
              <Header />
            </ProtectedRoute>
          }
        >
          <Route path="/mis-dashboard" element={<MISDashboard />} />
          <Route path="/mis-dashboard/telecom" element={<Telecom />} />
          <Route path="/mis-dashboard/workupdate" element={<WorkUpdate />} />
          <Route path="/mis-dashboard/domaincreation" element={<MasterDomainCreation />} />
          <Route path="/mis-dashboard/report" element={<Report />} />
          <Route path="/mis-dashboard/jobcreation" element={<JobCreation />} />
          <Route path="/mis-dashboard/jobhistory" element={<JobHistory />} />
        </Route>

        {/* ================= TEAM LEAD ================= */}
        <Route
          element={
            <ProtectedRoute allowedRoles={["Team Lead"]}>
              <Header />
            </ProtectedRoute>
          }
        >
          <Route path="/teamlead-dashboard" element={<TeamLeadDashboard />} />
          <Route path="/teamlead-dashboard/telecom" element={<Telecom />} />
          <Route path="/teamlead-dashboard/workupdate" element={<WorkUpdate />} />
          <Route path="/teamlead-dashboard/report" element={<Report />} />
          <Route path="/teamlead-dashboard/organogram" element={<Organogram />} />
          <Route path="/teamlead-dashboard/timesheet" element={<TimesheetManagement />} />
        </Route>

        {/* ================= TEAM MEMBER ================= */}
        <Route
          element={
            <ProtectedRoute allowedRoles={["Team Member"]}>
              <Header />
            </ProtectedRoute>
          }
        >
          <Route path="/teammember-dashboard" element={<TeamMemberDashboard />} />
        </Route>

        {/* ================= MASTER ================= */}
        <Route
          element={
            <ProtectedRoute allowedRoles={["MASTER"]}>
              <Header />
            </ProtectedRoute>
          }
        >
          <Route path="/master-dashboard" element={<MasterDashboard />} />
          <Route path="/timesheet" element={<TimesheetPage />} />
        </Route>
      </Routes>
    </Router>
  );
}

export default App;