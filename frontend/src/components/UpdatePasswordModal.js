import React, { useState } from "react";
import "../style/updatepasswordmodal.css";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faEye, faEyeSlash } from "@fortawesome/free-solid-svg-icons";

const UpdatePasswordModal = ({
    showPassModal,
    closePassModal,
    filteredUsers,
    searchTerm,
    setSearchTerm,
    passEditId,
    setPassEditId,
    newPass,
    setNewPass,
    confirmPass,
    setConfirmPass,
    savePassword
}) => {

    // ✅ NEW STATES (eye toggle)
    const [showNewPass, setShowNewPass] = useState(false);
    const [showConfirmPass, setShowConfirmPass] = useState(false);

    // Helper function to extract member types array safely
    const getMemberTypesArray = (mtData) => {
        if (Array.isArray(mtData)) {
            return mtData.map(m => String(m).trim()).filter(Boolean);
        }
        if (typeof mtData === "string" && mtData.trim() !== "") {
            return mtData.split(",").map(m => m.trim()).filter(Boolean);
        }
        return [];
    };

    if (!showPassModal) return null;

    return (
        <div className="modalOverlay">
            <div className="modalBox">

                {/* CLOSE BUTTON */}
                <button
                    type="button"
                    className="close-Btn"
                    onClick={() => {
                        setPassEditId(null);
                        setNewPass("");
                        setConfirmPass("");
                        closePassModal();
                    }}
                >
                    ✕
                </button>

                <h2>Update Password</h2>

                {/* SEARCH */}
                <input
                    className="searchInput"
                    type="text"
                    placeholder="Search by name or email..."
                    value={searchTerm}
                    autoComplete="off"
                    onChange={(e) => setSearchTerm(e.target.value)}
                />

                {/* TABLE */}
                <div className="tableWrapper">
                    <table>
                        <thead>
                            <tr>
                                <th>Name</th>
                                <th>Email</th>
                                <th>Action</th>
                            </tr>
                        </thead>

                        <tbody>
                            {filteredUsers
                                .filter((u) => u.role !== "master_admin")
                                .map((u) => {

                                    const id = u.id || u._id;
                                    const memberTypesList = getMemberTypesArray(u.memberType);

                                    return (
                                        <tr key={id}>
                                            <td>
                                                <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "4px" }}>
                                                    <span>{u.name}</span>
                                                    {memberTypesList.map((mt, idx) => {
                                                        const cleanMt = mt.toLowerCase();
                                                        
                                                        // Inline tag style fix for multiple selection color issue
                                                        let tagStyle = {
                                                            display: "inline-block",
                                                            fontSize: "11px",
                                                            fontWeight: "600",
                                                            padding: "2px 6px",
                                                            borderRadius: "4px",
                                                            whiteSpace: "nowrap"
                                                        };

                                                        if (cleanMt === "qa") {
                                                            tagStyle.background = "#ffedd5";
                                                            tagStyle.color = "#ea580c";
                                                        } else if (cleanMt === "qc") {
                                                            tagStyle.background = "#dcfce7";
                                                            tagStyle.color = "#16a34a";
                                                        } else {
                                                            tagStyle.background = "#e0f2fe";
                                                            tagStyle.color = "#0ea5e9";
                                                        }

                                                        return (
                                                            <span key={idx} style={tagStyle}>
                                                                ({mt})
                                                            </span>
                                                        );
                                                    })}
                                                </div>
                                            </td>
                                            <td>{u.email}</td>

                                            <td>
                                                <button
                                                    type="button"
                                                    className="updateBtn"
                                                    onMouseDown={(e) => e.preventDefault()}
                                                    onClick={() => {
                                                        setPassEditId(id);
                                                        setNewPass("");
                                                        setConfirmPass("");
                                                    }}
                                                >
                                                    Update
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })}
                        </tbody>
                    </table>
                </div>

                {/* PASSWORD POPUP */}
                {passEditId && (
                    <div className="popupOverlay">
                        <div className="popupBox">

                            <h3>Set New Password</h3>

                            {/* NEW PASSWORD */}
                            <div style={{ position: "relative" }}>
                                <input
                                    type={showNewPass ? "text" : "password"}
                                    placeholder="New Password"
                                    value={newPass}
                                    autoComplete="new-password"
                                    onChange={(e) => setNewPass(e.target.value)}
                                />

                                <span
                                    onClick={() => setShowNewPass(!showNewPass)}
                                    style={{
                                        position: "absolute",
                                        right: "10px",
                                        top: "50%",
                                        transform: "translateY(-50%)",
                                        cursor: "pointer"
                                    }}
                                >
                                   <FontAwesomeIcon icon={showNewPass ? faEyeSlash : faEye} />
                                </span>
                            </div>

                            {/* CONFIRM PASSWORD */}
                            <div style={{ position: "relative", marginTop: "10px" }}>
                                <input
                                    type={showConfirmPass ? "text" : "password"}
                                    placeholder="Confirm Password"
                                    value={confirmPass}
                                    autoComplete="new-password"
                                    onChange={(e) => setConfirmPass(e.target.value)}
                                />

                                <span
                                    onClick={() => setShowConfirmPass(!showConfirmPass)}
                                    style={{
                                        position: "absolute",
                                        right: "10px",
                                        top: "50%",
                                        transform: "translateY(-50%)",
                                        cursor: "pointer"
                                    }}
                                >
                                    <FontAwesomeIcon icon={showConfirmPass ? faEyeSlash : faEye} />
                                </span>
                            </div>

                            {/* SAVE BUTTON WITH VALIDATION */}
                            <button
                                type="button"
                                className="saveBtn"
                                onClick={() => {
                                    if (!newPass || !confirmPass) {
                                        alert("Please fill both password fields");
                                        return;
                                    }

                                    if (newPass !== confirmPass) {
                                        alert("Passwords do not match");
                                        return;
                                    }

                                    savePassword(passEditId);
                                }}
                            >
                                Save
                            </button>

                            <button
                                type="button"
                                className="cancelBtn"
                                onClick={() => {
                                    setPassEditId(null);
                                    setNewPass("");
                                    setConfirmPass("");
                                }}
                            >
                                Cancel
                            </button>

                        </div>
                    </div>
                )}

            </div>
        </div>
    );
};

export default UpdatePasswordModal;
