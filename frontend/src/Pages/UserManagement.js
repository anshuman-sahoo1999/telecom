import React, { useEffect, useState } from "react";
import {
  FaUserShield,
  FaUsers,
  FaChartLine,
} from "react-icons/fa";
import axios from "axios";
import "../style/usermanagement.css";
import Swal from "sweetalert2";

const UserManagement = () => {
  const [activeTab, setActiveTab] = useState("admin");
  const [users, setUsers] = useState([]);
  const [editId, setEditId] = useState(null);
  const [domainTab, setDomainTab] = useState("ALL");
  const [domains, setDomains] = useState([]);
  const [memberType, setMemberType] = useState("");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [totalExperience, setTotalExperience] = useState("");
  const [telecomExperience, setTelecomExperience] = useState("");
  const [skillSets, setSkillSets] = useState("");
  const [region, setRegion] = useState("");
  const [mobileNo, setMobileNo] = useState("");
  const openCreateModal = () => {
    setShowCreateModal(true);
    setName("");
    setEmpId("");
    setEmail("");
    setPassword("");   // ✅ IMPORTANT
    setRole("");
    setDomain([]);
    setMemberType("");
    setTotalExperience("");
    setTelecomExperience("");
    setSkillSets("");
    setRegion("");
    setMobileNo("");
  };
  const closeCreateModal = () => setShowCreateModal(false);

  const [name, setName] = useState("");
  const [emp_id, setEmpId] = useState("");
  const [emailDomain, setEmailDomain] = useState("@ecometrix.co.in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("");
  const [domain, setDomain] = useState([]);
  const [open, setOpen] = useState(false);
  const [openEdit, setOpenEdit] = useState(false);
  const [toast, setToast] = useState({
    message: "",
    type: ""
  });

  const [editData, setEditData] = useState({
    name: "",
    emp_id: "",
    email: "",
    role: "",
    domain: [],
    totalExperience: "",
    telecomExperience: "",
    skillSets: "",
    region: "",
    mobileNo: ""
  });

  const tabs = [
    { id: "admin", label: "Admin", icon: <FaUserShield />, desc: "Manage Admin Access" },
    { id: "mis", label: "MIS", icon: <FaChartLine />, desc: "Reports & Analytics" },
    { id: "team", label: "Team Lead", icon: <FaUsers />, desc: "Manage Team Leads" },
    { id: "member", label: "Team Member", icon: <FaUsers />, desc: "Manage Team Members" },
  ];

  useEffect(() => {
    fetchUsers();
    fetchDomains();
  }, []);
  const fetchDomains = async () => {
    try {
      const masterRes = await axios.get("http://localhost:5000/api/master");
      const workRes = await axios.get("http://localhost:5000/api/work/bydomain");

      const masterDomains = Object.keys(masterRes.data || {}); // string array

      const workDomains = (workRes.data || []).map(d =>
        typeof d === "string" ? d : d.domain
      );

      const merged = [...masterDomains, ...workDomains];

      setDomains([...new Set(merged)]);
    } catch (err) {
      console.log(err);
    }
  };

  const fetchUsers = async () => {
    const res = await axios.get(
      "http://localhost:5000/api/auth/all-user-details"
    );
    setUsers(res.data.users);
  };

  const roleFiltered = users.filter((u) => {
    if (activeTab === "admin") return u.role === "Admin";
    if (activeTab === "mis") return u.role === "MIS";
    if (activeTab === "team") return u.role === "TeamLead";
    if (activeTab === "member") return u.role === "TeamMember";
    return true;
  });

  const finalUsers =
    activeTab === "team" || activeTab === "member"
      ? domainTab === "ALL"
        ? roleFiltered
        : roleFiltered.filter((u) => {
          const userDomains = (u.domain || "")
            .split(",")
            .map((d) => d.trim().toLowerCase());

          return userDomains.includes(
            domainTab.trim().toLowerCase()
          );
        })
      : roleFiltered;
  const handleEdit = (item) => {
    setEditId(item.id);
    setEditData({
      name: item.name,
      emp_id: item.emp_id,
      email: item.email,
      role: item.role,
      domain: item.domain ? item.domain.split(",") : [],
      totalExperience: item.totalExperience || "",
      telecomExperience: item.telecomExperience || "",
      skillSets: item.skillSets || "",
      region: item.region || "",
      mobileNo: item.mobileNo || ""
    });
  };

  const cancelEdit = () => {
    setEditId(null);
  };
  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      let cleanEmail = email.trim().replace(/@/g, "");
      const finalEmail = `${cleanEmail}${emailDomain}`;
      const res = await axios.post(
        "http://localhost:5000/api/auth/create-user",
        {
          name, emp_id, email: finalEmail, password, role, domain, memberType, totalExperience, telecomExperience, skillSets, region, mobileNo
        }
      );

      console.log("CREATE RESPONSE:", res.data); // 🔥 DEBUG

      if (res.data?.success || res.status === 200) {
        fetchUsers();
        setShowCreateModal(false);

        setName("");
        setEmpId("");
        setEmail("");
        setPassword("");
        setRole("");
        setDomain([]);

        setToast({
          message: "User Created Successfully ✔",
          type: "success"
        });
      } else {
        throw new Error("Create failed");
      }

    } catch (err) {
      console.log("CREATE ERROR:", err.response?.data || err.message);

      setToast({
        message: "User Creation Failed ❌",
        type: "error"
      });
    }

    setTimeout(() => {
      setToast({ message: "", type: "" });
    }, 3000);
  };
  // ✅ UPDATE
  const saveEdit = async (id) => {
    try {
      await axios.put(
        `http://localhost:5000/api/auth/update-user/${id}`,
        editData
      );

      setEditId(null);
      fetchUsers();

      setToast({
        message: "User updated successfully ✔",
        type: "success"
      });

    } catch (error) {
      setToast({
        message: "Update failed ❌",
        type: "error"
      });
    }

    setTimeout(() => {
      setToast({ message: "", type: "" });
    }, 3000);
  };

  // ✅ DELETE
  const deleteUser = (id) => {
    Swal.fire({
      title: "Are you sure?",
      text: "This user will be permanently deleted!",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Yes, Delete it!",
      cancelButtonText: "Cancel",
    }).then(async (result) => {

      if (result.isConfirmed) {
        try {
          await axios.delete(
            `http://localhost:5000/api/auth/delete-user/${id}`
          );

          setUsers((prev) =>
            prev.filter((u) => u.id !== id)
          );

          Swal.fire("Deleted!", "User deleted successfully ✔", "success");

        } catch (error) {
          Swal.fire("Error!", "Delete failed ❌", "error");
        }
      }
    });
  };

  return (
    <div className="user-management">

      {toast.message && (
        <div className={`toast ${toast.type}`}>
          {toast.message}
        </div>
      )}

      <div className="management-box">

        {/* HEADER */}
        <div className="top-section">
          <h2>User Management</h2>
        </div>

        {/* TABS */}
        <div className="tab-wrapper">
          {tabs.map((tab) => (
            <div
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`tab-card ${activeTab === tab.id ? "active" : ""}`}
            >
              <div className="tab-icon">{tab.icon}</div>
              <div className="tab-info">
                <h3>{tab.label}</h3>
                <span>{tab.desc}</span>
              </div>
            </div>
          ))}
        </div>
        {(activeTab === "team" || activeTab === "member") && (
          <div className="domain-bar">

            {/* LEFT - DOMAINS */}
            <div className="domain-list">

              <button
                className={domainTab === "ALL" ? "active" : ""}
                onClick={() => setDomainTab("ALL")}
              >
                ALL DOMAINS
              </button>

              {domains.map((d, i) => (
                <button
                  key={i}
                  className={domainTab === d ? "active" : ""}
                  onClick={() => setDomainTab(d)}
                >
                  {d}
                </button>
              ))}

            </div>

            {/* RIGHT - CREATE USER */}
            <div className="create-user-btn">
              <button
                className="updatePasswordBtn"
                onClick={openCreateModal}
              >
                + Create User
              </button>
              {showCreateModal && (
                <div className="modalOverlay">
                  <div className="modalBoxes">

                    <h2>Create User</h2>

                    <form onSubmit={handleSubmit} className="userForm">

                      <input
                        placeholder="Name"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                      />

                      <input
                        placeholder="Employee ID"
                        value={emp_id}
                        onChange={(e) => setEmpId(e.target.value)}
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
                        onChange={(e) => setRole(e.target.value)}
                      >
                        <option value="">Select Role</option>
                        <option value="TeamLead">Team Lead</option>
                        <option value="TeamMember">Team Member</option>
                      </select>

                      {/* 👇 ADD THIS */}
                      {role === "TeamMember" && (
                        <select
                          value={memberType}
                          onChange={(e) => setMemberType(e.target.value)}
                        >
                          <option value="">Member Type</option>
                          <option value="QA">QA</option>
                          <option value="QC">QC</option>
                          <option value="Production">Production</option>
                        </select>
                      )}
                      {(role === "TeamLead" || role === "TeamMember") && (
                        <>
                          <input
                            type="number"
                            placeholder="Total Experience (years)"
                            value={totalExperience}
                            onChange={(e) => setTotalExperience(e.target.value)}
                          />

                          <input
                            placeholder="Telecom Experience"
                            value={telecomExperience}
                            onChange={(e) => setTelecomExperience(e.target.value)}
                          />

                          <input
                            placeholder="Skill Sets"
                            value={skillSets}
                            onChange={(e) => setSkillSets(e.target.value)}
                          />

                          <input
                            placeholder="Region"
                            value={region}
                            onChange={(e) => setRegion(e.target.value)}
                          />

                          <input
                            placeholder="Mobile Number"
                            value={mobileNo}
                            onChange={(e) => setMobileNo(e.target.value)}
                          />
                        </>
                      )}

                      <div className="multi-select">

                        <div
                          className="multi-select-box"
                          onClick={() => setOpen(!open)}
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

                        {open && (
                          <div className="dropdowned">
                            {domains.map((d, i) => (
                              <div
                                key={i}
                                className="option"
                                onClick={() => {
                                  if (!domain.includes(d)) {
                                    setDomain([...domain, d]);
                                  }
                                  setOpen(false);
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
                      />

                      <div className="modalActions">
                        <button type="submit">Create</button>
                        <button type="button" onClick={() => closeCreateModal(false)}>
                          Cancel
                        </button>
                      </div>

                    </form>

                  </div>
                </div>
              )}
            </div>

          </div>
        )}
        {/* TABLE */}
        <div className="table-section">
          <div className="table-scroll-container">
            <table>
              <thead>
                <tr>
                  <th style={{ width: "5%" }}>SL No</th>
                  <th style={{ width: "15%" }}>Name</th>
                  <th style={{ width: "10%" }}>Role</th>
                  <th style={{ width: "10%" }}>Emp ID</th>

                  {(activeTab === "team" || activeTab === "member") && (
                    <>
                      <th style={{ width: "12%" }}>Domain</th>
                      <th style={{ width: "8%" }}>Total Exp</th>
                      <th style={{ width: "8%" }}>Telecom Exp</th>
                      <th style={{ width: "10%" }}>Skill Sets</th>
                      <th style={{ width: "10%" }}>Region</th>
                      <th style={{ width: "10%" }}>Mobile No</th>
                    </>
                  )}
                  <th style={{ width: "15%" }}>Email ID</th>
                  {activeTab !== "admin" && <th style={{ width: "10%" }}>Action</th>}
                </tr>
              </thead>


              <tbody>
                {finalUsers.map((item, index) => (
                  <tr key={item.id}>
                    <td>{index + 1}</td>

                    <td>
                      {editId === item.id ? (
                        <input
                          value={editData.name}
                          onChange={(e) =>
                            setEditData({ ...editData, name: e.target.value })
                          }
                        />
                      ) : (
                        <>
                          {item.name}

                          {item.role === "TeamMember" && item.memberType && (
                            <span className={`roleTag ${item.memberType.toLowerCase()}`}>
                              ({item.memberType})
                            </span>
                          )}
                        </>
                      )}
                    </td>

                    <td>
                      {editId === item.id ? (
                        <select
                          value={editData.role}
                          onChange={(e) =>
                            setEditData({ ...editData, role: e.target.value })
                          }
                        >
                          <option value="Admin">Admin</option>
                          <option value="MIS">MIS</option>
                          <option value="TeamLead">Team Lead</option>
                          <option value="TeamMember">Team Member</option>
                        </select>
                      ) : (
                        item.role
                      )}
                    </td>
                    <td>
                      {editId === item.id ? (
                        <input
                          value={editData.emp_id}
                          onChange={(e) =>
                            setEditData({ ...editData, emp_id: e.target.value })
                          }
                        />
                      ) : (
                        item.emp_id
                      )}
                    </td>

                    {(activeTab === "team" || activeTab === "member") && (
                      <>
                        {(activeTab === "team" || activeTab === "member") && (
                          <td>
                            {editId === item.id ? (
                              <div className="multi-select">
                                <div
                                  className="multi-select-box"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setOpenEdit(!openEdit);
                                  }}
                                >
                                  {editData.domain.length === 0 && (
                                    <span className="placeholder">Select Domain</span>
                                  )}

                                  {editData.domain.map((item, i) => (
                                    <span className="tag" key={i}>
                                      {item}
                                      <span
                                        className="remove"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setEditData({
                                            ...editData,
                                            domain: editData.domain.filter((d) => d !== item)
                                          });
                                        }}
                                      >
                                        ✖
                                      </span>
                                    </span>
                                  ))}

                                  <span className="arrow">▼</span>
                                </div>

                                {openEdit && (
                                  <div className="dropdowned">
                                    {domains.map((d, i) => (
                                      <div
                                        key={i}
                                        className="option"
                                        onClick={() => {
                                          if (!editData.domain.includes(d)) {
                                            setEditData({
                                              ...editData,
                                              domain: [...editData.domain, d]
                                            });
                                          }

                                          setOpenEdit(false);
                                        }}
                                      >
                                        {d}
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            ) : (
                              domainTab === "ALL"
                                ? item.domain
                                : domainTab
                            )}

                          </td>
                        )}
                        <td>{item.totalExperience}</td>
                        <td>{item.telecomExperience}</td>

                        <td>
                          {editId === item.id ? (
                            <input
                              value={editData.skillSets}
                              onChange={(e) =>
                                setEditData({
                                  ...editData,
                                  skillSets: e.target.value
                                })
                              }
                            />
                          ) : (
                            item.skillSets
                          )}
                        </td>

                        <td>
                          {editId === item.id ? (
                            <input
                              value={editData.region}
                              onChange={(e) =>
                                setEditData({
                                  ...editData,
                                  region: e.target.value
                                })
                              }
                            />
                          ) : (
                            item.region
                          )}
                        </td>

                        <td>
                          {editId === item.id ? (
                            <input
                              value={editData.mobileNo}
                              onChange={(e) =>
                                setEditData({
                                  ...editData,
                                  mobileNo: e.target.value
                                })
                              }
                            />
                          ) : (
                            item.mobileNo
                          )}
                        </td>
                      </>
                    )}
                    <td>
                      {editId === item.id ? (
                        <input
                          value={editData.email}
                          onChange={(e) =>
                            setEditData({ ...editData, email: e.target.value })
                          }
                        />
                      ) : (
                        item.email
                      )}
                    </td>

                    {activeTab !== "admin" && (
                      <td>
                        {editId === item.id ? (
                          <>
                            <button onClick={() => saveEdit(item.id)}>Save</button>
                            <button onClick={cancelEdit}>Cancel</button>
                          </>
                        ) : (
                          <>
                            <button onClick={() => handleEdit(item)}>Edit</button>
                            <button onClick={() => deleteUser(item.id)}>Delete</button>
                          </>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>

            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default UserManagement;