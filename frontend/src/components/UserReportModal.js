import React, { useEffect, useState, useRef } from "react";
import ReactDOM from "react-dom";
import "../style/userReportModal.css";

const UserReportModal = ({ open, user }) => {
    const [adjustedPos, setAdjustedPos] = useState({ top: 0, left: 0 });
    const modalRef = useRef(null);

    useEffect(() => {
        if (!open || !user) return;

        const boxWidth = 340;  
        const boxHeight = 320; 
        const screenWidth = window.innerWidth;
        const screenHeight = window.innerHeight;

        let posX = (user.x || 100) + 15; 
        let posY = (user.y || 100) - 10; 

        // Agar modal screen ke right edge par touch kare, toh use thoda aur zyada left shift karne ke liye -60 kar diya hai
        if (posX + boxWidth > screenWidth - 20) {
            posX = (user.x || 100) - boxWidth - 60; 
        }

        if (posX < 10) {
            posX = 10;
        }

        if (posY + boxHeight > screenHeight - 20) {
            posY = screenHeight - boxHeight - 20;
        }
        
        if (posY < 10) {
            posY = 10;
        }

        setAdjustedPos({ top: posY, left: posX });
    }, [open, user]);

    if (!open || !user) return null;

    return ReactDOM.createPortal(
        <div className="profile-overlay">
            <div
                ref={modalRef}
                className="profile-box"
                style={{
                    position: "fixed",
                    top: `${adjustedPos.top}px`,
                    left: `${adjustedPos.left}px`
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
        </div>,
        document.body
    );
};

export default UserReportModal;
