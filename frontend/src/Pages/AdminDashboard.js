import React from "react";
import { Link } from "react-router-dom";

const AdminDashboard = () => {
  return (
    <div>
      <h1>Admin Dashboard</h1>

      <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
        <Link to="/admin-dashboard/telecom">Telecom</Link>
        <Link to="/admin-dashboard/telecom">Work Update</Link>
        <Link to="/admin-dashboard/telecom">Report</Link>
        <Link to="/admin-dashboard/telecom">Master Creation</Link>
      </div>
    </div>
  );
};

export default AdminDashboard;