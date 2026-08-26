import React, { useEffect, useState, useRef } from "react";
import "../style/userReportModal.css";

const UserReportModal = ({ open, user }) => {
    const [adjustedPos, setAdjustedPos] = useState({ top: 0, left: 0 });
    const modalRef = useRef(null);

    useEffect(() => {
        if (!open || !user) return;

        const boxWidth = 340;  // Updated box width
        const boxHeight = 320; // Approximate height
        const screenWidth = window.innerWidth;
        const screenHeight = window.innerHeight;

        // Default: Sabhi normal nodes ke liye right side par hi open hoga
        let posX = (user.x || 0) + 15; 
        let posY = (user.y || 0) - 10; 

        // Sirf un nodes ke liye jo right edge par cut rahe hain, unko aur zyada left side mein shift karne ke liye -90 kiya gaya hai
        if (posX + boxWidth > screenWidth - 20) {
            posX = (user.x || 0) - boxWidth - 90; 
        }

        // Left boundary check (agar screen ke bahar jane lage toh minimum 10px margin rahe)
        if (posX < 10) {
            posX = 10;
        }

        // Bottom boundary check
        if (posY + boxHeight > screenHeight - 20) {
            posY = screenHeight - boxHeight - 20;
        }
        
        // Top boundary safety (name ke upar na jaye)
        if (posY < 10) {
            posY = 10;
        }

        setAdjustedPos({ top: posY, left: posX });
    }, [open, user]);

    if (!open || !user) return null;

    return (
        <div className="profile-overlay">
            <div
                ref={modalRef}
                className="profile-box"
                style={{
                    position: "absolute",
                    top: adjustedPos.top,
                    left: adjustedPos.left
                }}
            >
                <div className="profile-header">
                    <h2>Workforce Profile</h2>
                </div>

                <div className="profile-body">
                    <div><b>Name:</b> <span>{user.name || "-"}</span></div>
                    <div><b>Employee ID:</b> <span>{user.emp_id || "-"}</span></div>
                    <div><b>Email:</b> <span>{user.email || "-"}</span></div>
                    <div><b>Role:</b> <span>{user.role || "-"}</span></div>
                    <div><b>Domain:</b> <span>{user.domain || "-"}</span></div>
                    <div><b>Member Type:</b> <span>{user.memberType || "-"}</span></div>
                    <div><b>Total Exp:</b> <span>{user.totalExperience || "-"}</span></div>
                    <div><b>Telecom Exp:</b> <span>{user.telecomExperience || "-"}</span></div>
                    <div><b>Skill Sets:</b> <span>{user.skillSets || "-"}</span></div>
                    <div><b>Region:</b> <span>{user.region || "-"}</span></div>
                    <div><b>Mobile:</b> <span>{user.mobileNo || "-"}</span></div>
                </div>
            </div>
        </div>
    );
};

export default UserReportModal;
