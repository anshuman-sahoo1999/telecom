import { API_BASE_URL } from "../config";
import React, { useCallback, useEffect, useRef, useState } from "react";
import axios from "axios";
import { FaUserPlus, FaUsers } from "react-icons/fa";
import "../style/dashboard.css";
import Swal from "sweetalert2";

import UpdatePasswordModal from "../components/UpdatePasswordModal";

/* =====================================================
   Helper functions 
   ===================================================== */

const memberTypeOptions = ["QA", "QC", "Production"];
const toArray = (data) => {
    if (Array.isArray(data)) {
        return data.map((m) => String(m).trim()).filter(Boolean);
    }
    if (typeof data === "string" && data.trim() !== "") {
        return data.split(",").map((m) => m.trim()).filter(Boolean);
    }
    return [];
};

const getMemberTypeTagStyle = (mt) => {
    const cleanMt = String(mt).toLowerCase();

    const tagStyle = {
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

    return tagStyle;
};

/* ---------- On-screen message (toast) styles ---------- */
const toastBaseStyle = {
    position: "fixed",
    top: "20px",
    right: "20px",
    zIndex: 999999,
    minWidth: "260px",
    maxWidth: "420px",
    padding: "12px 16px",
    borderRadius: "8px",
    color: "#ffffff",
    fontSize: "14px",
    fontWeight: 600,
    boxShadow: "0 6px 18px rgba(0,0,0,0.25)",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "12px"
};

const toastColors = {
    success: "#16a34a",
    error: "#dc2626",
    warning: "#d97706"
};

const toastIcons = {
    success: "✅",
    error: "❌",
    warning: "⚠️"
};

const MasterDashboard = () => {
    const [activeTab, setActiveTab] = useState("create");
    const [users, setUsers] = useState([]);

    // Screen par message
    const [toast, setToast] = useState(null); // { type, text }
    const toastTimerRef = useRef(null);

    const [name, setName] = useState("");
    const [emp_id, setEmpId] = useState("");
    const [emailDomain, setEmailDomain] = useState("@ecometrix.co.in");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [role, setRole] = useState("");
    const [submitting, setSubmitting] = useState(false);

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
    const [passSearchTerm, setPassSearchTerm] = useState("");

    const showToast = useCallback((type, text) => {
        if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
        setToast({ type, text });
        toastTimerRef.current = setTimeout(() => setToast(null), 3500);
    }, []);

    useEffect(() => {
        return () => {
            if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
        };
    }, []);

    const matchesSearch = (u, term) =>
        `${u.name ?? ""} ${u.email ?? ""} ${u.emp_id ?? ""} ${u.role ?? ""}`
            .toLowerCase()
            .includes((term || "").toLowerCase());

    const filteredUsers = users.filter((u) => matchesSearch(u, searchTerm));
    const passFilteredUsers = users.filter((u) => matchesSearch(u, passSearchTerm));

    const getUsers = useCallback(async () => {
        try {
            const res = await axios.get(`${API_BASE_URL}/api/auth/users`);
            const data = Array.isArray(res.data) ? res.data : res.data?.data || [];
            setUsers(data);
        } catch (err) {
            console.log(err);
            showToast("error", "Users load nahi ho paye!");
        }
    }, [showToast]);

    const loadDomains = useCallback(async () => {
        const [masterRes, workRes] = await Promise.allSettled([
            axios.get(`${API_BASE_URL}/api/master`),
            axios.get(`${API_BASE_URL}/api/work/bydomain`)
        ]);

        const masterDomains =
            masterRes.status === "fulfilled"
                ? Object.keys(masterRes.value.data || {})
                : [];

        const workDomains =
            workRes.status === "fulfilled" && Array.isArray(workRes.value.data)
                ? workRes.value.data.map((d) => (typeof d === "string" ? d : d.domain))
                : [];


        const seen = new Set();
        const unique = [];
        [...masterDomains, ...workDomains].forEach((d) => {
            const clean = (d || "").toString().trim();
            const key = clean.toUpperCase();
            if (clean && !seen.has(key)) {
                seen.add(key);
                unique.push(clean);
            }
        });

        setDomains(unique);

        if (masterRes.status === "rejected" && workRes.status === "rejected") {
            console.log(masterRes.reason);
            showToast("error", "Domains load nahi ho paye!");
        }
    }, [showToast]);

    useEffect(() => {
        getUsers();
        loadDomains();
    }, [getUsers, loadDomains]);


    useEffect(() => {
        const handleClickOutside = (event) => {
            if (!event.target.closest(".multi-select")) {
                setOpenCreateMemberType(false);
                setOpenEditMemberType(false);
                setOpenCreateDomain(false);
                setOpenEditDomain(false);
            }
        };
        document.addEventListener("click", handleClickOutside);
        return () => document.removeEventListener("click", handleClickOutside);
    }, []);

    /* ---------------- Create user ---------------- */

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (submitting) return;

        const cleanEmail = email.trim().split("@")[0].trim();
        if (!cleanEmail) {
            showToast("warning", "Please enter a valid email!");
            return;
        }
        const finalEmail = `${cleanEmail}${emailDomain}`.toLowerCase();

        setSubmitting(true);
        try {
            await axios.post(`${API_BASE_URL}/api/auth/create-user`, {
                name: name.trim(),
                emp_id: emp_id.trim(),
                email: finalEmail,
                password,
                role,
                domain,
                memberType
            });

            await getUsers();

            setName("");
            setEmpId("");
            setEmail("");
            setPassword("");
            setRole("");
            setMemberType([]);
            setDomain([]);

            showToast("success", "User Created Successfully!");
        } catch (err) {
            console.log(err);
            showToast("error", err.response?.data?.message || "User Creation Failed!");
        } finally {
            setSubmitting(false);
        }
    };

    /* ---------------- Delete user ---------------- */

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
            if (!result.isConfirmed) return;

            try {
                await axios.delete(`${API_BASE_URL}/api/auth/delete-user/${id}`);

                setUsers((prev) => prev.filter((u) => (u.id || u._id) !== id));

                if (editingRowId === id) {
                    setEditingRowId(null);
                    setEditRowData({});
                }

                showToast("success", "User deleted successfully!");
            } catch (err) {
                console.log(err);
                showToast("error", err.response?.data?.message || "Delete failed!");
            }
        });
    };

    /* ---------------- Edit user ---------------- */

    const startEdit = (user) => {
        setEditingRowId(user.id || user._id);
        setEditRowData({
            ...user,
            domain: toArray(user.domain),
            memberType: toArray(user.memberType)
        });
        setOpenEditMemberType(false);
        setOpenEditDomain(false);
    };

    const cancelEdit = () => {
        setEditingRowId(null);
        setEditRowData({});
        setOpenEditMemberType(false);
        setOpenEditDomain(false);
    };

    const saveEdit = async (id) => {
        if (!(editRowData.name || "").trim() || !(editRowData.emp_id || "").toString().trim() || !(editRowData.email || "").trim()) {
            showToast("warning", "Name, ID and Email are required!");
            return;
        }

        const payload = {
            name: editRowData.name.trim(),
            emp_id: editRowData.emp_id,
            email: editRowData.email.trim(),
            role: editRowData.role,
            domain: toArray(editRowData.domain),
            memberType: editRowData.role === "TeamMember" ? toArray(editRowData.memberType) : []
        };

        try {
            await axios.put(`${API_BASE_URL}/api/auth/update-user/${id}`, payload);

            await getUsers();
            showToast("success", "User Updated Successfully!");
            cancelEdit();
        } catch (err) {
            console.log(err);
            showToast("error", err.response?.data?.message || "Update Failed!");
        }
    };

    /* ---------------- Update password ---------------- */

    const openPassModal = () => {
        setShowPassModal(true);
        setPassEditId(null);
        setNewPass("");
        setConfirmPass("");
        setPassSearchTerm("");
    };

    const closePassModal = () => {
        setShowPassModal(false);
        setPassEditId(null);
        setNewPass("");
        setConfirmPass("");
        setPassSearchTerm("");
    };

    const savePassword = async () => {
        if (!passEditId) {
            showToast("warning", "Please select a user first!");
            return;
        }
        if (!newPass || newPass !== confirmPass) {
            showToast("warning", "Passwords do not match or are empty!");
            return;
        }

        try {
            await axios.put(`${API_BASE_URL}/api/auth/update-password/${passEditId}`, {
                password: newPass
            });

            showToast("success", "Password updated successfully!");
            closePassModal();
        } catch (err) {
            console.error(err);
            showToast("error", err.response?.data?.message || "Failed to update password!");
        }
    };

    return (
        <div className="dashboard">
            {/* ---------- Screen par success / error message ---------- */}
            {toast && (
                <div
                    role="status"
                    style={{
                        ...toastBaseStyle,
                        background: toastColors[toast.type] || toastColors.success
                    }}
                >
                    <span>
                        {toastIcons[toast.type]} {toast.text}
                    </span>
                    <button
                        type="button"
                        onClick={() => setToast(null)}
                        title="Close"
                        style={{
                            background: "transparent",
                            border: "none",
                            color: "#ffffff",
                            fontSize: "16px",
                            cursor: "pointer",
                            lineHeight: 1
                        }}
                    >
                        ✕
                    </button>
                </div>
            )}

            <div className="mainContent">

                <h1 className="mainTitle">Control Panel</h1>
                <p className="mainDesc">Manage users and system access</p>

                <div className="buttonContainer">
                    <button type="button" className="updatePasswordBtn" onClick={openPassModal}>
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
                                        setOpenCreateMemberType(false);
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

                                        {memberType.map((item) => (
                                            <span className="tag" key={item}>
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
                                        <div className="dropdown-list">
                                            {memberTypeOptions.map((m) => (
                                                <div
                                                    key={m}
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

                                    {domain.map((item) => (
                                        <span className="tag" key={item}>
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
                                    <div className="dropdown-list">
                                        {domains.map((d) => (
                                            <div
                                                key={d}
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
                            <button type="submit" disabled={submitting}>
                                {submitting ? "Creating..." : "Create User"}
                            </button>
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
                                    {filteredUsers.length === 0 && (
                                        <tr>
                                            <td colSpan="7" style={{ textAlign: "center", padding: "20px" }}>
                                                No Users Found
                                            </td>
                                        </tr>
                                    )}

                                    {filteredUsers.map((u, index) => {
                                        const id = u.id || u._id;
                                        const isEditing = editingRowId === id;
                                        const memberTypesList = toArray(u.memberType);
                                        const editMemberTypes = toArray(editRowData.memberType);
                                        const editDomains = toArray(editRowData.domain);

                                        return (
                                            <tr key={id ?? index}>
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
                                                            {memberTypesList.map((mt) => (
                                                                <span key={mt} style={getMemberTypeTagStyle(mt)}>
                                                                    ({mt})
                                                                </span>
                                                            ))}
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
                                                                        memberType: val === "TeamMember" ? editMemberTypes : []
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
                                                                        {editMemberTypes.length === 0 && (
                                                                            <span className="placeholder">Select Member Type</span>
                                                                        )}

                                                                        {editMemberTypes.map((item) => (
                                                                            <span className="tag" key={item}>
                                                                                {item}
                                                                                <span
                                                                                    className="remove"
                                                                                    onClick={(e) => {
                                                                                        e.stopPropagation();
                                                                                        setEditRowData({
                                                                                            ...editRowData,
                                                                                            memberType: editMemberTypes.filter((m) => m !== item)
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
                                                                        <div className="dropdown-list">
                                                                            {memberTypeOptions.map((m) => (
                                                                                <div
                                                                                    key={m}
                                                                                    className="option"
                                                                                    onClick={() => {
                                                                                        if (!editMemberTypes.includes(m)) {
                                                                                            setEditRowData({
                                                                                                ...editRowData,
                                                                                                memberType: [...editMemberTypes, m]
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
                                                                {editDomains.length === 0 && (
                                                                    <span className="placeholder">Select Domain</span>
                                                                )}

                                                                {editDomains.map((item) => (
                                                                    <span className="tag" key={item}>
                                                                        {item}
                                                                        <span
                                                                            className="remove"
                                                                            onClick={(e) => {
                                                                                e.stopPropagation();
                                                                                setEditRowData({
                                                                                    ...editRowData,
                                                                                    domain: editDomains.filter((d) => d !== item)
                                                                                });
                                                                            }}
                                                                        >
                                                                            ✖
                                                                        </span>
                                                                    </span>
                                                                ))}

                                                                <span className="arrow">▼</span>
                                                            </div>

                                                            {openEditDomain && (
                                                                <div className="dropdown-list">
                                                                    {domains.map((d) => (
                                                                        <div
                                                                            key={d}
                                                                            className="option"
                                                                            onClick={() => {
                                                                                if (!editDomains.includes(d)) {
                                                                                    setEditRowData({
                                                                                        ...editRowData,
                                                                                        domain: [...editDomains, d]
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
                                                        toArray(u.domain).length > 0
                                                            ? toArray(u.domain).join(", ")
                                                            : "-"
                                                    )}
                                                </td>

                                                <td className="action-td">
                                                    {isEditing ? (
                                                        <div className="action-btn-group">
                                                            <button type="button" onClick={() => saveEdit(id)}>Save</button>
                                                            <button type="button" onClick={cancelEdit}>Cancel</button>
                                                        </div>
                                                    ) : (
                                                        <div className="action-btn-group">
                                                            <button type="button" onClick={() => startEdit(u)}>✎</button>
                                                            <button type="button" onClick={() => deleteUser(id)}>✕</button>
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
                    filteredUsers={passFilteredUsers}
                    searchTerm={passSearchTerm}
                    setSearchTerm={setPassSearchTerm}
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
