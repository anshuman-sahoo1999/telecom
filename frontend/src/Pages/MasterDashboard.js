import React, { useEffect, useState } from "react";
import axios from "axios";
import { FaUserPlus, FaUsers } from "react-icons/fa";
import "../style/dashboard.css";
import Swal from "sweetalert2";

import UpdatePasswordModal from "../components/UpdatePasswordModal";

const MasterDashboard = () => {
    const [activeTab, setActiveTab] = useState("create");
    const [users, setUsers] = useState([]);
    const [toast, setToast] = useState({
        message: "",
        type: ""
    });

    const [name, setName] = useState("");
    const [emp_id, setEmpId] = useState("");
    const [emailDomain, setEmailDomain] = useState("@ecometrix.co.in");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [role, setRole] = useState("");
    
    const [memberType, setMemberType] = useState([]);
    const [openCreateMemberType, setOpenCreateMemberType] = useState(false);
    const [openEditMemberType, setOpenEditMemberType] = useState(false);

    const [editingRowId, setEditingRowId] = useState(null);
    const [editRowData, setEditRowData] = useState({});

    const [showPassModal, setShowPassModal] = useState(false);
    const [passEditId, setPassEditId] = useState(null);
    const [newPass, setNewPass] = useState("");
    const [confirmPass, setConfirmPass] = useState("");
    const [domain, setDomain] = useState([]);
    const [openCreateDomain, setOpenCreateDomain] = useState(false);
    const [openEditDomain, setOpenEditDomain] = useState(false);
    const [domains, setDomains] = useState([]);

    const [searchTerm, setSearchTerm] = useState("");

    const memberTypeOptions = ["QA", "QC", "Production"];

    const filteredUsers = users.filter((u) =>
        `${u.name} ${u.email} ${u.emp_id} ${u.role}`
            .toLowerCase()
            .includes(searchTerm.toLowerCase())
    );

    const getUsers = async () => {
        try {
            const res = await axios.get("http://localhost:5000/api/auth/users");
            setUsers(res.data);
        } catch (err) {
            console.log(err);
        }
    };

    useEffect(() => {
        getUsers();
        fetchDomains();
    }, []);

    useEffect(() => {
        const loadDomains = async () => {
            try {
                const masterRes = await axios.get("http://localhost:5000/api/master");
                const workRes = await axios.get("http://localhost:5000/api/work/bydomain");

                const masterDomains = Object.keys(masterRes.data || {});
                const workDomains = (workRes.data || []).map((d) => d.domain);
                const merged = [...masterDomains, ...workDomains];
                const unique = [...new Set(merged)];

                setDomains(unique);
            } catch (err) {
                console.log(err);
            }
        };

        loadDomains();
    }, []);

    const fetchDomains = async () => {
        try {
            const res = await axios.get("http://localhost:5000/api/work/bydomain");
            const data = res.data || [];
            const cleanDomains = data.map(d =>
                typeof d === "string" ? d : d.domain
            );
            setDomains([...new Set(cleanDomains)]);
        } catch (err) {
            console.log(err);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        try {
            let cleanEmail = email.trim().replace(/@/g, "");
            const finalEmail = `${cleanEmail}${emailDomain}`;

            await axios.post(
                "http://localhost:5000/api/auth/create-user",
                {
                    name,
                    emp_id,
                    email: finalEmail,
                    password,
                    role,
                    domain,
                    memberType
                }
            );

            await getUsers();

            setName("");
            setEmpId("");
            setEmail("");
            setPassword("");
            setRole("");
            setMemberType([]);
            setDomain([]);

            setToast({
                message: "User Created Successfully ✔",
                type: "success"
            });

        } catch (err) {
            setToast({
                message: "User Creation Failed ❌",
                type: "error"
            });
        }

        setTimeout(() => {
            setToast({
                message: "",
                type: ""
            });
        }, 3000);
    };

    const deleteUser = (id) => {
        Swal.fire({
            title: "Are you sure?",
            text: "This user will be permanently deleted!",
            icon: "warning",
            showCancelButton: true,
            confirmButtonColor: "#dc3545",
            cancelButtonColor: "#6c757d",
            confirmButtonText: "Yes, Delete it!",
            cancelButtonText: "Cancel"
        }).then(async (result) => {
            if (result.isConfirmed) {
                try {
                    await axios.delete(
                        `http://localhost:5000/api/auth/delete-user/${id}`
                    );

                    setUsers((prev) =>
                        prev.filter((u) => (u.id || u._id) !== id)
                    );

                    Swal.fire(
                        "Deleted!",
                        "User has been deleted successfully ✔",
                        "success"
                    );

                } catch (err) {
                    Swal.fire(
                        "Error!",
                        "Delete failed ❌",
                        "error"
                    );
                }
            }
        });
    };

    const startEdit = (user) => {
        let normalizedDomain = [];
        if (Array.isArray(user.domain)) {
            normalizedDomain = user.domain;
        } else if (typeof user.domain === "string") {
            normalizedDomain = user.domain.split(",").map(d => d.trim());
        }

        let normalizedMemberType = [];
        if (Array.isArray(user.memberType)) {
            normalizedMemberType = user.memberType;
        } else if (typeof user.memberType === "string" && user.memberType.trim() !== "") {
            normalizedMemberType = user.memberType.split(",").map(m => m.trim());
        }

        setEditingRowId(user.id || user._id);
        setEditRowData({
            ...user,
            domain: normalizedDomain,
            memberType: normalizedMemberType
        });
    };

    const cancelEdit = () => {
        setEditingRowId(null);
        setEditRowData({});
    };

    const saveEdit = async (id) => {
        try {
            await axios.put(
                `http://localhost:5000/api/auth/update-user/${id}`,
                editRowData
            );

            await getUsers();

            setToast({
                message: "User Updated Successfully ✔",
                type: "success"
            });

            cancelEdit();

        } catch (err) {
            setToast({
                message: "Update Failed ❌",
                type: "error"
            });
        }

        setTimeout(() => {
            setToast({ message: "", type: "" });
        }, 3000);
    };

    const openPassModal = () => {
        setShowPassModal(true);
        setPassEditId(null);
        setNewPass("");
        setConfirmPass("");
    };

    const closePassModal = () => {
        setShowPassModal(false);
        setPassEditId(null);
        setNewPass("");
        setConfirmPass("");
    };

    const savePassword = async () => {
        if (!passEditId) {
            Swal.fire("Error", "Please select a user first!", "error");
            return;
        }
        if (!newPass || newPass !== confirmPass) {
            Swal.fire("Error", "Passwords do not match or are empty!", "error");
            return;
        }

        try {
            await axios.put(`http://localhost:5000/api/auth/update-password/${passEditId}`, {
                password: newPass
            });

            Swal.fire("Success", "Password updated successfully ✔", "success");
            closePassModal();
        } catch (err) {
            console.error(err);
            Swal.fire("Error", "Failed to update password ❌", "error");
        }
    };

    const getMemberTypesArray = (mtData) => {
        if (Array.isArray(mtData)) {
            return mtData.map(m => String(m).trim()).filter(Boolean);
        }
        if (typeof mtData === "string" && mtData.trim() !== "") {
            return mtData.split(",").map(m => m.trim()).filter(Boolean);
        }
        return [];
    };

    return (
        <div className="dashboard">
            {toast.message && (
                <div className={`toast ${toast.type}`}>
                    {toast.message}
                </div>
            )}
            <div className="mainContent">

                <h1 className="mainTitle">Control Panel</h1>
                <p className="mainDesc">Manage users and system access</p>

                <div className="buttonContainer">
                    <button className="updatePasswordBtn" onClick={openPassModal}>
                        Update Password
                    </button>
                </div>

                <div className="topCards">
                    <div
                        className={`actionCard ${activeTab === "create" ? "activeCard" : ""}`}
                        onClick={() => setActiveTab("create")}
                    >
                        <div className="fullIcon blue">
                            <FaUserPlus />
                        </div>
                        <div className="cardOverlay">
                            <h2>Create User</h2>
                            <p>Add or update users</p>
                        </div>
                    </div>

                    <div
                        className={`actionCard ${activeTab === "view" ? "activeCard" : ""}`}
                        onClick={() => setActiveTab("view")}
                    >
                        <div className="fullIcon purple">
                            <FaUsers />
                        </div>
                        <div className="cardOverlay">
                            <h2>View Users</h2>
                            <p>All registered users</p>
                        </div>
                    </div>
                </div>

                {/* CREATE USER */}
                {activeTab === "create" && (
                    <div className="contentBox">
                        <h2 className="sectionTitle">Create User</h2>

                        <form
                            className="userForm"
                            onSubmit={handleSubmit}
                            autoComplete="off"
                        >
                            <input style={{ display: "none" }} type="text" />
                            <input style={{ display: "none" }} type="password" />

                            <input
                                placeholder="Name"
                                value={name}
                                autoComplete="off"
                                onChange={(e) => setName(e.target.value)}
                                required
                            />

                            <input
                                placeholder="Employee ID"
                                value={emp_id}
                                autoComplete="off"
                                onChange={(e) => setEmpId(e.target.value)}
                                required
                            />

                            <div className="emailBox">
                                <input
                                    type="text"
                                    placeholder="Email..."
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    required
                                />
                                <div className="emailSuffix">
                                    <select
                                        value={emailDomain}
                                        onChange={(e) => setEmailDomain(e.target.value)}
                                    >
                                        <option value="@ecometrix.co.in">@ecometrix.co.in</option>
                                        <option value="@gmail.com">@gmail.com</option>
                                        <option value="@outlook.com">@outlook.com</option>
                                        <option value="@yahoo.com">@yahoo.com</option>
                                        <option value="@zoho.com">@zoho.com</option>
                                        <option value="@rediffmail.com">@rediffmail.com</option>
                                    </select>
                                </div>
                            </div>

                            <select
                                value={role}
                                autoComplete="off"
                                onChange={(e) => {
                                    setRole(e.target.value);
                                    if (e.target.value !== "TeamMember") {
                                        setMemberType([]);
                                    }
                                }}
                                required
                            >
                                <option value="">Select Role</option>
                                <option value="Admin">Admin</option>
                                <option value="MIS">MIS</option>
                                <option value="TeamLead">Team Lead</option>
                                <option value="TeamMember">Team Member</option>
                            </select>

                            {role === "TeamMember" && (
                                <div className="multi-select">
                                    <div
                                        className="multi-select-box"
                                        onClick={() => setOpenCreateMemberType(!openCreateMemberType)}
                                    >
                                        {memberType.length === 0 && (
                                            <span className="placeholder">Select Member Type</span>
                                        )}

                                        {memberType.map((item, i) => (
                                            <span className="tag" key={i}>
                                                {item}
                                                <span
                                                    className="remove"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setMemberType(memberType.filter((m) => m !== item));
                                                    }}
                                                >
                                                    ✖
                                                </span>
                                            </span>
                                        ))}

                                        <span className="arrow">▼</span>
                                    </div>

                                    {openCreateMemberType && (
                                        <div className="dropdowned">
                                            {memberTypeOptions.map((m, i) => (
                                                <div
                                                    key={i}
                                                    className="option"
                                                    onClick={() => {
                                                        if (!memberType.includes(m)) {
                                                            setMemberType([...memberType, m]);
                                                        }
                                                        setOpenCreateMemberType(false);
                                                    }}
                                                >
                                                    {m}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}

                            <div className="multi-select">
                                <div
                                    className="multi-select-box"
                                    onClick={() => setOpenCreateDomain(!openCreateDomain)}
                                >
                                    {domain.length === 0 && (
                                        <span className="placeholder">Select Domain</span>
                                    )}

                                    {domain.map((item, i) => (
                                        <span className="tag" key={i}>
                                            {item}
                                            <span
                                                className="remove"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setDomain(domain.filter((d) => d !== item));
                                                }}
                                            >
                                                ✖
                                            </span>
                                        </span>
                                    ))}

                                    <span className="arrow">▼</span>
                                </div>

                                {openCreateDomain && (
                                    <div className="dropdowned">
                                        {domains.map((d, i) => (
                                            <div
                                                key={i}
                                                className="option"
                                                onClick={() => {
                                                    if (!domain.includes(d)) {
                                                        setDomain([...domain, d]);
                                                    }
                                                    setOpenCreateDomain(false);
                                                }}
                                            >
                                                {d}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            <input
                                type="password"
                                placeholder="Password"
                                value={password}
                                autoComplete="new-password"
                                onChange={(e) => setPassword(e.target.value)}
                                required
                            />
                            <button type="submit">Create User</button>
                        </form>
                    </div>
                )}

                {/* VIEW USERS */}
                {activeTab === "view" && (
                    <div className="contentBox">
                        <div className="userListHeader">
                            <h2 className="sectionTitle">User List</h2>

                            <div className="userSearchContainer">
                                <input
                                    type="text"
                                    className="userSearchInput"
                                    placeholder="Search by name, email, ID..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                />
                            </div>
                        </div>

                        <div className="tableWrapper x-axis-hidden y-axis-scroll">
                            <table>
                                <thead>
                                    <tr>
                                        <th>Sl No</th>
                                        <th>Name</th>
                                        <th>ID</th>
                                        <th>Email</th>
                                        <th>Role</th>
                                        <th>Domain</th>
                                        <th className="action-th">Action</th>
                                    </tr>
                                </thead>

                                <tbody>
                                    {filteredUsers.map((u, index) => {
                                        const id = u.id || u._id;
                                        const isEditing = editingRowId === id;
                                        const memberTypesList = getMemberTypesArray(u.memberType);

                                        return (
                                            <tr key={id}>
                                                <td>{index + 1}</td>

                                                <td>
                                                    {isEditing ? (
                                                        <input
                                                            value={editRowData.name || ""}
                                                            onChange={(e) =>
                                                                setEditRowData({
                                                                    ...editRowData,
                                                                    name: e.target.value
                                                                })
                                                            }
                                                        />
                                                    ) : (
                                                        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "4px" }}>
                                                            <span>{u.name}</span>
                                                            {memberTypesList.map((mt, idx) => {
                                                                const cleanMt = mt.toLowerCase();
                                                                
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
                                                    )}
                                                </td>

                                                <td>
                                                    {isEditing ? (
                                                        <input
                                                            value={editRowData.emp_id || ""}
                                                            onChange={(e) =>
                                                                setEditRowData({
                                                                    ...editRowData,
                                                                    emp_id: e.target.value
                                                                })
                                                            }
                                                        />
                                                    ) : (
                                                        u.emp_id
                                                    )}
                                                </td>

                                                <td>
                                                    {isEditing ? (
                                                        <input
                                                            value={editRowData.email || ""}
                                                            onChange={(e) =>
                                                                setEditRowData({
                                                                    ...editRowData,
                                                                    email: e.target.value
                                                                })
                                                            }
                                                        />
                                                    ) : (
                                                        u.email
                                                    )}
                                                </td>

                                                <td>
                                                    {isEditing ? (
                                                        <div className="edit-role-container">
                                                            <select
                                                                value={editRowData.role || ""}
                                                                onChange={(e) => {
                                                                    const val = e.target.value;
                                                                    setEditRowData({
                                                                        ...editRowData,
                                                                        role: val,
                                                                        memberType: val === "TeamMember" ? editRowData.memberType : []
                                                                    });
                                                                }}
                                                            >
                                                                <option value="Admin">Admin</option>
                                                                <option value="MIS">MIS</option>
                                                                <option value="TeamLead">Team Lead</option>
                                                                <option value="TeamMember">Team Member</option>
                                                            </select>

                                                            {editRowData.role === "TeamMember" && (
                                                                <div className="multi-select" style={{ marginTop: "6px" }}>
                                                                    <div
                                                                        className="multi-select-box"
                                                                        onClick={() => setOpenEditMemberType(!openEditMemberType)}
                                                                    >
                                                                        {(!editRowData.memberType || getMemberTypesArray(editRowData.memberType).length === 0) && (
                                                                            <span className="placeholder">Select Member Type</span>
                                                                        )}

                                                                        {getMemberTypesArray(editRowData.memberType).map((item, i) => (
                                                                            <span className="tag" key={i}>
                                                                                {item}
                                                                                <span
                                                                                    className="remove"
                                                                                    onClick={(e) => {
                                                                                        e.stopPropagation();
                                                                                        const currentArr = getMemberTypesArray(editRowData.memberType);
                                                                                        setEditRowData({
                                                                                            ...editRowData,
                                                                                            memberType: currentArr.filter(m => m !== item)
                                                                                        });
                                                                                    }}
                                                                                >
                                                                                    ✖
                                                                                </span>
                                                                            </span>
                                                                        ))}
                                                                        <span className="arrow">▼</span>
                                                                    </div>

                                                                    {openEditMemberType && (
                                                                        <div className="dropeddown">
                                                                            {memberTypeOptions.map((m, i) => (
                                                                                <div
                                                                                    key={i}
                                                                                    className="option"
                                                                                    onClick={() => {
                                                                                        const currentTypes = getMemberTypesArray(editRowData.memberType);
                                                                                        if (!currentTypes.includes(m)) {
                                                                                            setEditRowData({
                                                                                                ...editRowData,
                                                                                                memberType: [...currentTypes, m]
                                                                                            });
                                                                                        }
                                                                                        setOpenEditMemberType(false);
                                                                                    }}
                                                                                >
                                                                                    {m}
                                                                                </div>
                                                                            ))}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            )}
                                                        </div>
                                                    ) : (
                                                        u.role
                                                    )}
                                                </td>

                                                <td>
                                                    {isEditing ? (
                                                        <div className="multi-select">
                                                            <div
                                                                className="multi-select-box"
                                                                onClick={() => setOpenEditDomain(!openEditDomain)}
                                                            >
                                                                {(!editRowData.domain || editRowData.domain.length === 0) && (
                                                                    <span className="placeholder">Select Domain</span>
                                                                )}

                                                                {Array.isArray(editRowData.domain) &&
                                                                    editRowData.domain.map((item, i) => (
                                                                        <span className="tag" key={i}>
                                                                            {item}
                                                                            <span
                                                                                className="remove"
                                                                                onClick={(e) => {
                                                                                    e.stopPropagation();
                                                                                    setEditRowData({
                                                                                        ...editRowData,
                                                                                        domain: editRowData.domain.filter(d => d !== item)
                                                                                    });
                                                                                }}
                                                                            >
                                                                                ✖
                                                                            </span>
                                                                        </span>
                                                                    ))
                                                                }

                                                                <span className="arrow">▼</span>
                                                            </div>

                                                            {openEditDomain && (
                                                                <div className="dropeddown">
                                                                    {domains.map((d, i) => (
                                                                        <div
                                                                            key={i}
                                                                            className="option"
                                                                            onClick={() => {
                                                                                if (!(editRowData.domain || []).includes(d)) {
                                                                                    setEditRowData({
                                                                                        ...editRowData,
                                                                                        domain: [...(editRowData.domain || []), d]
                                                                                    });
                                                                                }
                                                                                setOpenEditDomain(false);
                                                                            }}
                                                                        >
                                                                            {d}
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            )}
                                                        </div>
                                                    ) : (
                                                        Array.isArray(u.domain)
                                                            ? u.domain.join(", ")
                                                            : typeof u.domain === "string"
                                                                ? u.domain
                                                                : "-"
                                                    )}
                                                </td>

                                                <td className="action-td">
                                                    {isEditing ? (
                                                        <div className="action-btn-group">
                                                            <button onClick={() => saveEdit(id)}>Save</button>
                                                            <button onClick={cancelEdit}>Cancel</button>
                                                        </div>
                                                    ) : (
                                                        <div className="action-btn-group">
                                                            <button onClick={() => startEdit(u)}>✎</button>
                                                            <button onClick={() => deleteUser(id)}>✕</button>
                                                        </div>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                <UpdatePasswordModal
                    showPassModal={showPassModal}
                    closePassModal={closePassModal}
                    filteredUsers={filteredUsers}
                    searchTerm={searchTerm}
                    setSearchTerm={setSearchTerm}
                    passEditId={passEditId}
                    setPassEditId={setPassEditId}
                    newPass={newPass}
                    setNewPass={setNewPass}
                    confirmPass={confirmPass}
                    setConfirmPass={setConfirmPass}
                    savePassword={savePassword}
                />

            </div>
        </div>
    );
};

export default MasterDashboard;
