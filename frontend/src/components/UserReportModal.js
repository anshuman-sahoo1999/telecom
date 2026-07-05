import React from "react";
import "../style/userReportModal.css";

const UserReportModal = ({ open, user }) => {
    if (!open || !user) return null;

    return (
        <div className="profile-overlay">
            <div
                className="profile-box"
                style={{
                    position: "absolute",
                    top: user.y,
                    left: user.x
                }}
            >
                <div className="profile-header">
                    <h2>Workforce Profile</h2>
                </div>

                <div className="profile-body">

                    <div><b>Name:</b> {user.name}</div>
                    <div><b>Employee ID:</b> {user.emp_id || "-"}</div>
                    <div><b>Email:</b> {user.email}</div>
                    <div><b>Role:</b> {user.role}</div>
                    <div><b>Domain:</b> {user.domain}</div>
                    <div><b>Member Type:</b> {user.memberType || "-"}</div>

                    <div><b>Total Exp:</b> {user.totalExperience || "-"}</div>
                    <div><b>Telecom Exp:</b> {user.telecomExperience || "-"}</div>

                    <div><b>Skill Sets:</b> {user.skillSets || "-"}</div>
                    <div><b>Region:</b> {user.region || "-"}</div>

                    <div><b>Mobile:</b> {user.mobileNo || "-"}</div>

                </div>
            </div>
        </div>
    );
};

export default UserReportModal;