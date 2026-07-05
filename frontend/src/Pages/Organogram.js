import React, { useState, useEffect, useRef } from "react";
import axios from "axios";
import { FaSitemap, FaProjectDiagram, FaFileExport, } from "react-icons/fa";
import { DndContext, useDroppable } from "@dnd-kit/core";
import DraggableUser from "../components/DraggableUser";
import UserReportModal from "../components/UserReportModal";
import * as htmlToImage from "html-to-image";
import * as XLSX from "xlsx-js-style";
import { saveAs } from "file-saver";
import { jsPDF } from "jspdf";
import "../style/organogram.css";
import Swal from "sweetalert2";

const DomainDropZone = ({dropId,children,}) => {
    const { setNodeRef } = useDroppable({id: dropId,});

    return (
        <div ref={setNodeRef}>{children}</div>
    );
};

const ExportHeader = () => {
    return (
        <div className="export-header">
            <div className="export-left">
                <img src="/Image/img1.png" alt="logo" />
            </div>
            <div className="export-center">
                <h2>COMPANY ORGANOGRAM REPORT</h2>
            </div>
            <div className="export-right">
                <div>{new Date().toLocaleString("en-IN")}</div>
            </div>
        </div>
    );
};
const Organogram = () => {
    const [activeTab, setActiveTab] = useState("overall");
    const [openExport, setOpenExport] = useState(false);
    const [selectedDomain, setSelectedDomain] = useState(null);
    const [isExporting, setIsExporting] = useState(false);
    const [users, setUsers] = useState([]);
    const [domains, setDomains] = useState([]);
    const treeRef = useRef(null);
    const [hiddenRoles, setHiddenRoles] = useState([]);
    const hoverTimerRef = useRef(null);
    const [selectedUser, setSelectedUser] = useState(null);
    const [openReport, setOpenReport] = useState(false);
    const handleHoverUser = (user, event) => {
clearTimeout(hoverTimerRef.current);

        if (user && user !== "LEAVE") {
const rect = event?.currentTarget?.getBoundingClientRect();
setSelectedUser({
                ...user,
                x: rect.right + 10,   // RIGHT SIDE POSITION
                y: rect.top
            });
            setOpenReport(true);
            return;
        }

        hoverTimerRef.current = setTimeout(() => {
            setOpenReport(false);
            setSelectedUser(null);
        }, 200);
    };
    const tabs = [
        {
            id: "overall",
            label: "Overall",
            icon: <FaSitemap />,
            desc: "Company Structure",
        },
        {
            id: "project",
            label: "Project",
            icon: <FaProjectDiagram />,
            desc: "Project Structure",
        },
    ];

    useEffect(() => {
        fetchUsers();
        fetchDomains();
    }, []);

    const fetchUsers = async () => {
        try {
            const res = await axios.get(
                "http://localhost:5000/api/auth/all-user-details"
            );
            console.log(res.data.users);
            setUsers(res.data.users || []);
        } catch (err) {
            console.log(err);
        }
    };
    const fetchDomains = async () => {
        try {
            const res = await axios.get(
                "http://localhost:5000/api/work/bydomain"
            );

            setDomains(res.data || []);
        } catch (err) {
            console.log(err);
        }
    };
    const getFileNameDateTime = () => {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, "0");
        const day = String(now.getDate()).padStart(2, "0");
        let hours = now.getHours();
        const minutes = String(now.getMinutes()).padStart(2, "0");
        const seconds = String(now.getSeconds()).padStart(2, "0");
        const ampm = hours >= 12 ? "PM" : "AM";
        hours = hours % 12 || 12;
        hours = String(hours).padStart(2, "0");
        return `${year}-${month}-${day} at ${hours}.${minutes}.${seconds} ${ampm}`;
    };
    const admins = users
        .filter((u) => u.role === "Admin")
        .sort((a, b) => a.id - b.id);
    const misUsers = users.filter(
        (u) => u.role === "MIS"
    );
    const teamLeads = users.filter(
        (u) => u.role === "TeamLead"
    );
    const teamMembers = users.filter(
        (u) => u.role === "TeamMember"
    );
    const handleDelete = (id) => {
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
    const handleLegendClick = (role) => {
        if (role === "ALL") {
            // sab roles show
            setHiddenRoles([]);
            return;
        }

        setHiddenRoles((prev) =>
            prev.includes(role)
                ? prev.filter((r) => r !== role)
                : [...prev, role]
        );
    };
    const exportPNG = async () => {
        setIsExporting(true);
        await new Promise(r => setTimeout(r, 100)); // allow DOM update
        const element = treeRef.current;

        const dataUrl = await htmlToImage.toPng(element, {
            backgroundColor: "#fff",
            pixelRatio: 2,
            cacheBust: true,
            width: element.scrollWidth,
            height: element.scrollHeight,
        });
        setIsExporting(false);
        const link = document.createElement("a");
        link.download = `Organogram ${getFileNameDateTime()}.png`;
        link.href = dataUrl;
        link.click();
    };
    const exportJPG = async () => {
        setIsExporting(true);
        await new Promise(r => setTimeout(r, 100));
        const element = treeRef.current;
        const dataUrl = await htmlToImage.toJpeg(element, {
            quality: 0.95,
            backgroundColor: "#fff",
            width: element.scrollWidth,
            height: element.scrollHeight,
        });
       setIsExporting(false);
        const link = document.createElement("a");
        link.download = `Organogram ${getFileNameDateTime()}.jpg`;
        link.href = dataUrl;
        link.click();
    };
    const exportPDF = async () => {
        setIsExporting(true);
        await new Promise(r => setTimeout(r, 100));
     const element = treeRef.current;
        const canvas = await htmlToImage.toCanvas(element, {
            backgroundColor: "#fff",
            pixelRatio: 2,
        });
        const imgData = canvas.toDataURL("image/png");
        const pdf = new jsPDF("l", "mm", "a4");
        const pageWidth = pdf.internal.pageSize.getWidth();
        const pageHeight = pdf.internal.pageSize.getHeight();
        const imgRatio = canvas.width / canvas.height;
        const pageRatio = pageWidth / pageHeight;
        let renderWidth = pageWidth;
        let renderHeight = pageHeight;

        if (imgRatio > pageRatio) {
            renderHeight = pageWidth / imgRatio;
        } else {
            renderWidth = pageHeight * imgRatio;
        }
        const x = (pageWidth - renderWidth) / 2;
        const y = (pageHeight - renderHeight) / 2;
        pdf.addImage(imgData, "PNG", x, y, renderWidth, renderHeight);
        setIsExporting(false);
       pdf.save(`Organogram ${getFileNameDateTime()}.pdf`);
    };
    const exportExcel = () => {
        const wb = XLSX.utils.book_new();
        const roleSheets = {
            Admin: users.filter(u => u.role === "Admin"),
            MIS: users.filter(u => u.role === "MIS"),
            TeamLead: users.filter(u => u.role === "TeamLead"),
            TeamMember: users.filter(u => u.role === "TeamMember"),
        };

        Object.entries(roleSheets).forEach(([sheetName, data]) => {
            const rows = data.map(u => {
                if (sheetName === "Admin" || sheetName === "MIS") {
                    return {
                        Name: u.name || "",
                        Emp_ID: u.emp_id || "",
                        Role: u.role || "",
                        Email: u.email || "",
                    };
                }
                return {
                    Name: u.name || "",
                    Emp_ID: u.emp_id || "",
                    Role: u.role || "",
                    Domain: u.domain || "",
                    MemberType: u.memberType || "",
                    Mobile: u.mobileNo || "",
                    Email: u.email || "",
                    TotalExp: u.totalExperience || "",
                    TelecomExp: u.telecomExperience || "",
                    SkillSets: u.skillSets || "",
                    Region: u.region || "",
                };
            });
           const ws = XLSX.utils.json_to_sheet(rows);
            const range = XLSX.utils.decode_range(ws["!ref"]);
          for (let col = range.s.c; col <= range.e.c; col++) {
                const cell = XLSX.utils.encode_cell({
                    r: 0,
                    c: col,
                });
                if (ws[cell]) {
                    ws[cell].s = {
                        fill: {
                            fgColor: { rgb: "1F4E78" }
                        },
                        font: {
                            bold: true,
                            color: { rgb: "FFFFFF" }
                        },
                        alignment: {
                            horizontal: "center",
                            vertical: "center"
                        }
                    };
                }
            }
            XLSX.utils.book_append_sheet(
                wb,
                ws,
                sheetName
            );
        });
        const excelBuffer = XLSX.write(wb, {
            bookType: "xlsx",
            type: "array",
            cellStyles: true,
        });
        const file = new Blob(
            [excelBuffer],
            {
                type:
                    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            }
        );

        saveAs(file,`Organogram Report ${getFileNameDateTime()}.xlsx`);
    };
    const handleDragEnd = async (event) => {
        const { active, over } = event;

        if (!over) return;

        const draggedId = active.id;

        const draggedUser = users.find(
            (u) => u.id.toString() === draggedId.toString()
        );

        if (!draggedUser) return;
       const [targetDomain, targetType] = over.id.split("|");
        if (draggedUser.role === "TeamLead") {
            const oldDomain = draggedUser.domain;
            const targetTL = users.find(
                (u) =>
                    u.role === "TeamLead" &&
                    (u.domain || "")
                        .split(",")
                        .map((x) => x.trim())
                        .includes(targetDomain)
            );
            setUsers((prev) =>
                prev.map((u) => {
                    if (u.id === draggedUser.id) {
                        return {
                            ...u,
                            domain: targetDomain,
                        };
                    }
                    if (targetTL && u.id === targetTL.id) {
                        return {
                            ...u,
                            domain: oldDomain,
                        };
                    }
                    return u;
                })
            );
           try {
                await axios.put(
                    `http://localhost:5000/api/auth/update-position/${draggedUser.id}`,
                    {
                        domain: targetDomain,
                        memberType: null,
                    }
                );
                if (targetTL) {
                    await axios.put(
                        `http://localhost:5000/api/auth/update-position/${targetTL.id}`,
                        {
                            domain: oldDomain,
                            memberType: null,
                        }
                    );
                }

            } catch (err) {
                console.log(err);
            }

            return;
        }
        setUsers((prev) => {
            const currentDraggedUser = prev.find(
                (u) => u.id.toString() === draggedId.toString()
            );
           if (!currentDraggedUser) return prev;
            const targetUser = prev.find(
                (u) =>
                    u.memberType === targetType &&
                    (u.domain || "")
                        .split(",")
                        .map((x) => x.trim())
                        .includes(targetDomain)
            );
            return prev.map((u) => {
                if (u.id.toString() === draggedId.toString()) {
                    return {
                        ...u,
                        domain: targetDomain,
                        memberType: targetType,
                    };
                }
                if (targetUser && u.id === targetUser.id) {
                    return {
                        ...u,
                        domain: currentDraggedUser.domain,
                        memberType: currentDraggedUser.memberType,
                    };
                }
                return u;
            });
        });
        try {
            const targetUser = users.find(
                (u) =>
                    u.memberType === targetType &&
                    (u.domain || "")
                        .split(",")
                        .map((x) => x.trim())
                        .includes(targetDomain)
            );
          await axios.put(
                `http://localhost:5000/api/auth/update-position/${draggedId}`,
                {
                    domain: targetDomain,
                    memberType: targetType,
                }
            );
            if (targetUser) {
                await axios.put(
                    `http://localhost:5000/api/auth/update-position/${targetUser.id}`,
                    {
                        domain: draggedUser.domain,
                        memberType: draggedUser.memberType,
                    }
                );
            }
        } catch (err) {
            console.log(err);
        }
    };
    return (
        <div className="org-page">
            <UserReportModal
                open={openReport}
                user={selectedUser}
            />
            <div className="org-container">

                {/* HEADER */}
                <div className="org-topbar">

                    <div className="org-title-center">
                        <h2>Organogram</h2>
                    </div>

                    <div className="export-wrapper">
                        <button
                            className="export-btned"
                            onClick={() => setOpenExport(!openExport)}
                        >
                            <FaFileExport />
                            Export
                        </button>

                        {openExport && (
                            <div className="export-btn-dropdown">
                                <div onClick={exportJPG}>JPG</div>
                                <div onClick={exportPNG}>PNG</div>
                                <div onClick={exportPDF}>PDF</div>
                                <div onClick={exportExcel}>XLSX</div>
                            </div>
                        )}
                    </div>

                </div>

                {/* TABS */}
                <div className="org-tab-wrapper">

                    {tabs.map((tab) => (
                        <div
                            key={tab.id}
                            className={`org-tab-card ${activeTab === tab.id ? "active" : ""
                                }`}
                            onClick={() => setActiveTab(tab.id)}
                        >
                            <div className="org-icon">
                                {tab.icon}
                            </div>

                            <div className="org-info">
                                <h3>{tab.label}</h3>
                                <span>{tab.desc}</span>
                            </div>
                        </div>
                    ))}

                </div>
                <div className="org-body-box">

                    {activeTab === "overall" ? (

                        <DndContext onDragEnd={handleDragEnd}>

                            <div ref={treeRef} className="export-area">
                                {isExporting && <ExportHeader />}
                                <div className="org-tree-wrapper">
                                    <div className="org-tree">

                                        {/* ADMIN */}
                                        {!hiddenRoles.includes("Admin") && admins.map((admin, index) => (
                                            <React.Fragment key={admin.id}>
                                                <div className="admin-row">
                                                    <div className="org-node admin">
                                                        {admin.name}
                                                    </div>

                                                    {index === 1 && !hiddenRoles.includes("MIS") && (
                                                        <div className="mis-wrapper">

                                                            {/* TOP dashed (Admin1 → MIS path) */}
                                                            <div className="mis-top"></div>

                                                            {/* CENTER solid (Admin2 ↔ MIS) */}
                                                            <div className="mis-center"></div>

                                                            {/* BOTTOM dashed (Admin3 → MIS path) */}
                                                            <div className="mis-bottom"></div>

                                                            <div className="org-node mis">
                                                                {misUsers[0]?.name || "MIS"}
                                                            </div>

                                                        </div>
                                                    )}
                                                </div>

                                                {index !== admins.length - 1 && <div className="v-line"></div>}
                                            </React.Fragment>
                                        ))}

                                        <div className="v-line big"></div>
                                        <div className="domain-wrapper">
                                            <div className="top-horizontal"></div>

                                            {(domains || []).map((d, index) => {

                                                const domainName = d.domain;

                                                const tls = teamLeads.filter((tl) =>
                                                    (tl.domain || "")
                                                        .split(",")
                                                        .map((x) => x.trim())
                                                        .includes(domainName)
                                                );

                                                const qaMembers = teamMembers.filter(
                                                    (m) =>
                                                        m.memberType === "QA" &&
                                                        (m.domain || "")
                                                            .split(",")
                                                            .map((x) => x.trim())
                                                            .includes(domainName)
                                                );

                                                const qcMembers = teamMembers.filter(
                                                    (m) =>
                                                        m.memberType === "QC" &&
                                                        (m.domain || "")
                                                            .split(",")
                                                            .map((x) => x.trim())
                                                            .includes(domainName)
                                                );

                                                const productionMembers = teamMembers.filter(
                                                    (m) =>
                                                        m.memberType === "Production" &&
                                                        (m.domain || "")
                                                            .split(",")
                                                            .map((x) => x.trim())
                                                            .includes(domainName)
                                                );

                                                return (
                                                    <div className="domain-column" key={index}>

                                                        {/* DOMAIN */}
                                                        {!hiddenRoles.includes("Domain") && (
                                                            <div className="org-node domain">
                                                                {domainName}
                                                            </div>
                                                        )}

                                                        <div className="small-line"></div>

                                                        {/* TEAM LEAD */}
                                                        <DomainDropZone dropId={`${domainName}|TeamLead`}>
                                                            <div className="tl-wrapper">
                                                                {!hiddenRoles.includes("TeamLead") && (
                                                                    tls.length > 0 ? (
                                                                        tls.map((tl) => (
                                                                            <DraggableUser
                                                                                key={tl.id}
                                                                                user={tl}
                                                                                onDelete={handleDelete}
                                                                                onHover={handleHoverUser}
                                                                            />
                                                                        ))
                                                                    ) : (
                                                                        <div className="org-node tl">TL</div>
                                                                    )
                                                                )}
                                                            </div>
                                                        </DomainDropZone>

                                                        <div className="small-line"></div>
                                                        <div className="qaqc-row">
                                                            <DomainDropZone dropId={`${domainName}|QA`}>
                                                                <div className="qa-column">
                                                                    {!hiddenRoles.includes("QA") && (
                                                                        qaMembers.length > 0 ? (
                                                                            qaMembers.map((qa) => (
                                                                                <DraggableUser
                                                                                    key={qa.id}
                                                                                    user={qa}
                                                                                    onDelete={handleDelete}
                                                                                    onHover={handleHoverUser}
                                                                                />
                                                                            ))
                                                                        ) : (
                                                                            <div className="org-node qa1">QA</div>
                                                                        )
                                                                    )}
                                                                </div>
                                                            </DomainDropZone>
                                                            <DomainDropZone dropId={`${domainName}|QC`}>
                                                                <div className="qc-column">
                                                                    {!hiddenRoles.includes("QC") && (
                                                                        qcMembers.length > 0 ? (
                                                                            qcMembers.map((qc) => (
                                                                                <DraggableUser
                                                                                    key={qc.id}
                                                                                    user={qc}
                                                                                    onDelete={handleDelete}
                                                                                    onHover={handleHoverUser}
                                                                                />
                                                                            ))
                                                                        ) : (
                                                                            <div className="org-node qc1">QC</div>
                                                                        )
                                                                    )}
                                                                </div>
                                                            </DomainDropZone>
                                                            <DomainDropZone dropId={`${domainName}|Production`}>
                                                                <div className="production-column">
                                                                    {!hiddenRoles.includes("Production") && (
                                                                        productionMembers.length > 0 ? (
                                                                            productionMembers.map((p) => (
                                                                                <DraggableUser
                                                                                    key={p.id}
                                                                                    user={p}
                                                                                    onDelete={handleDelete}
                                                                                    onHover={handleHoverUser}
                                                                                />
                                                                            ))
                                                                        ) : (
                                                                            <div className="org-node prod1">PRODUCTION</div>
                                                                        )
                                                                    )}
                                                                </div>
                                                            </DomainDropZone>

                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                        <div className="org-legend">
                                            <div
                                                className="legend-item all-item"
                                                onClick={() => setHiddenRoles([])}
                                            >
                                                <span className="legend-color all-color"></span>
                                                ALL
                                            </div>
                                            {!hiddenRoles.includes("Admin") && (
                                                <div
                                                    className="legend-item"
                                                    onClick={() => handleLegendClick("Admin")}
                                                >
                                                    <span className="legend-color admin-color"></span>
                                                    Admin
                                                </div>
                                            )}
                                            {!hiddenRoles.includes("MIS") && (
                                                <div
                                                    className="legend-item"
                                                    onClick={() => handleLegendClick("MIS")}
                                                >
                                                    <span className="legend-color mis-color"></span>
                                                    MIS
                                                </div>
                                            )}
                                            {!hiddenRoles.includes("Domain") && (
                                                <div
                                                    className="legend-item"
                                                    onClick={() => handleLegendClick("Domain")}
                                                >
                                                    <span className="legend-color domain-color"></span>
                                                    Domain
                                                </div>
                                            )}
                                            {!hiddenRoles.includes("TeamLead") && (
                                                <div
                                                    className="legend-item"
                                                    onClick={() => handleLegendClick("TeamLead")}
                                                >
                                                    <span className="legend-color tl-color"></span>
                                                    Team Lead
                                                </div>
                                            )}

                                            {!hiddenRoles.includes("QA") && (
                                                <div
                                                    className="legend-item"
                                                    onClick={() => handleLegendClick("QA")}
                                                >
                                                    <span className="legend-color qa-color"></span>
                                                    QA
                                                </div>
                                            )}
                                            {!hiddenRoles.includes("QC") && (
                                                <div
                                                    className="legend-item"
                                                    onClick={() => handleLegendClick("QC")}
                                                >
                                                    <span className="legend-color qc-color"></span>
                                                    QC
                                                </div>
                                            )}
                                            {!hiddenRoles.includes("Production") && (
                                                <div
                                                    className="legend-item"
                                                    onClick={() => handleLegendClick("Production")}
                                                >
                                                    <span className="legend-color prod-color"></span>
                                                    Production
                                                </div>
                                            )}

                                        </div>                                    </div>
                                </div>
                            </div>

                        </DndContext>
                    ) : (

                        <div className="org-body-box">
                            <div ref={treeRef} className="export-area">

                                {isExporting && <ExportHeader />}
                                {activeTab === "overall" && (
                                    <DndContext onDragEnd={handleDragEnd}>
                                        <div className="org-tree-wrapper">
                                            <div className="org-tree">
                                                {admins.map((admin, index) => (
                                                    <React.Fragment key={admin.id}>
                                                        {index === 1 ? (
                                                            <div className="admin-row">
                                                                <div className="org-node admin">{admin.name}</div>

                                                                <div className="mis-branch">
                                                                    <div className="mis-line"></div>

                                                                    {!hiddenRoles.includes("MIS") && (
                                                                        <div className="org-node mis">
                                                                            {misUsers[0]?.name || "MIS"}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        ) : (
                                                            <div className="org-node admin">{admin.name}</div>
                                                        )}

                                                        {index !== admins.length - 1 && <div className="v-line"></div>}
                                                    </React.Fragment>
                                                ))}

                                                <div className="v-line big"></div>

                                                {/* DOMAIN SECTION */}
                                                <div className="domain-wrapper">
                                                    <div className="top-horizontal"></div>

                                                    {(domains || []).map((d, index) => {

                                                        const domainName = d.domain;

                                                        const tls = teamLeads.filter((tl) =>
                                                            (tl.domain || "")
                                                                .split(",")
                                                                .map((x) => x.trim())
                                                                .includes(domainName)
                                                        );

                                                        const qaMembers = teamMembers.filter(
                                                            (m) =>
                                                                m.memberType === "QA" &&
                                                                (m.domain || "")
                                                                    .split(",")
                                                                    .map((x) => x.trim())
                                                                    .includes(domainName)
                                                        );

                                                        const qcMembers = teamMembers.filter(
                                                            (m) =>
                                                                m.memberType === "QC" &&
                                                                (m.domain || "")
                                                                    .split(",")
                                                                    .map((x) => x.trim())
                                                                    .includes(domainName)
                                                        );

                                                        const productionMembers = teamMembers.filter(
                                                            (m) =>
                                                                m.memberType === "Production" &&
                                                                (m.domain || "")
                                                                    .split(",")
                                                                    .map((x) => x.trim())
                                                                    .includes(domainName)
                                                        );

                                                        return (
                                                            <div className="domain-column" key={index}>

                                                                {/* DOMAIN */}
                                                                <DomainDropZone dropId={domainName}>
                                                                    {!hiddenRoles.includes("Domain") && (
                                                                        <div className="org-node domain">
                                                                            {domainName}
                                                                        </div>
                                                                    )}
                                                                </DomainDropZone>

                                                                <div className="small-line"></div>

                                                                {/* TL (FIXED SYNTAX) */}
                                                                <DomainDropZone dropId={`${domainName}|TeamLead`}>
                                                                    <div className="tl-wrapper">
                                                                        {!hiddenRoles.includes("TeamLead") && (
                                                                            tls.length > 0 ? (
                                                                                tls.map((tl) => (
                                                                                    <DraggableUser
                                                                                        key={tl.id}
                                                                                        user={tl}
                                                                                        onDelete={handleDelete}
                                                                                        onHover={handleHoverUser}
                                                                                    />
                                                                                ))
                                                                            ) : (
                                                                                <div className="org-node tl">TL</div>
                                                                            )
                                                                        )}
                                                                    </div>
                                                                </DomainDropZone>

                                                                <div className="small-line"></div>

                                                                {/* QA QC PRODUCTION */}
                                                                <div className="qaqc-row">

                                                                    {/* QA */}
                                                                    <DomainDropZone dropId={`${domainName}|QA`}>
                                                                        <div className="qa-column">
                                                                            {!hiddenRoles.includes("QA") && (
                                                                                qaMembers.length > 0 ? (
                                                                                    qaMembers.map((qa) => (
                                                                                        <DraggableUser
                                                                                            key={qa.id}
                                                                                            user={qa}
                                                                                            onDelete={handleDelete}
                                                                                            onHover={handleHoverUser}
                                                                                        />
                                                                                    ))
                                                                                ) : (
                                                                                    <div className="org-node qa1">QA</div>
                                                                                )
                                                                            )}
                                                                        </div>
                                                                    </DomainDropZone>

                                                                    {/* QC */}
                                                                    <DomainDropZone dropId={`${domainName}|QC`}>
                                                                        <div className="qc-column">
                                                                            {!hiddenRoles.includes("QC") && (
                                                                                qcMembers.length > 0 ? (
                                                                                    qcMembers.map((qc) => (
                                                                                        <DraggableUser
                                                                                            key={qc.id}
                                                                                            user={qc}
                                                                                            onDelete={handleDelete}
                                                                                            onHover={handleHoverUser}
                                                                                        />
                                                                                    ))
                                                                                ) : (
                                                                                    <div className="org-node qc1">QC</div>
                                                                                )
                                                                            )}
                                                                        </div>
                                                                    </DomainDropZone>

                                                                    {/* PRODUCTION */}
                                                                    <DomainDropZone dropId={`${domainName}|Production`}>
                                                                        <div className="production-column">
                                                                            {!hiddenRoles.includes("Production") && (
                                                                                productionMembers.length > 0 ? (
                                                                                    productionMembers.map((p) => (
                                                                                        <DraggableUser
                                                                                            key={p.id}
                                                                                            user={p}
                                                                                            onDelete={handleDelete}
                                                                                            onHover={handleHoverUser}
                                                                                        />
                                                                                    ))
                                                                                ) : (
                                                                                    <div className="org-node prod1">PRODUCTION</div>
                                                                                )
                                                                            )}
                                                                        </div>
                                                                    </DomainDropZone>

                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>

                                            </div>
                                        </div>
                                    </DndContext>
                                )}
                                {activeTab === "project" && (
                                    <div className="org-tree">
                                        <div className="domain-wrapp">

                                            {domains.map((d) => {
                                                const domainName = d.domain;
                                                const isOpen = selectedDomain === domainName;
                                                const shouldShow = isOpen || isExporting;

                                                const tls = teamLeads.filter((tl) =>
                                                    (tl.domain || "")
                                                        .split(",")
                                                        .map((x) => x.trim())
                                                        .includes(domainName)
                                                );

                                                const qaMembers = teamMembers.filter(
                                                    (m) =>
                                                        m.memberType === "QA" &&
                                                        (m.domain || "")
                                                            .split(",")
                                                            .map((x) => x.trim())
                                                            .includes(domainName)
                                                );

                                                const qcMembers = teamMembers.filter(
                                                    (m) =>
                                                        m.memberType === "QC" &&
                                                        (m.domain || "")
                                                            .split(",")
                                                            .map((x) => x.trim())
                                                            .includes(domainName)
                                                );
                                                const productionMembers = teamMembers.filter(
                                                    (m) =>
                                                        m.memberType === "Production" &&
                                                        (m.domain || "")
                                                            .split(",")
                                                            .map((x) => x.trim())
                                                            .includes(domainName)
                                                );

                                                return (
                                                    <div key={domainName} className="domain-item">

                                                        {!hiddenRoles.includes("Domain") && (
                                                            <div
                                                                className={`org-node domain ${isOpen ? "active-domain" : ""}`}
                                                                onClick={() =>
                                                                    setSelectedDomain(isOpen ? null : domainName)
                                                                }
                                                            >
                                                                {domainName}
                                                            </div>
                                                        )}

                                                        {shouldShow && (
                                                            <>
                                                                <div className="small-line"></div>

                                                                <div className="tl-wrapper">
                                                                    {!hiddenRoles.includes("TeamLead") &&
                                                                        (tls.length > 0 ? (
                                                                            tls.map((tl) => (
                                                                                <div
                                                                                    key={tl.id}
                                                                                    className="org-node tl"
                                                                                    onMouseEnter={(e) => handleHoverUser(tl, e)}
                                                                                    onMouseLeave={() => handleHoverUser(null, null)}
                                                                                >
                                                                                    {tl.name}
                                                                                </div>
                                                                            ))
                                                                        ) : (
                                                                            <div className="org-node tl">TL</div>
                                                                        ))}
                                                                </div>

                                                                <div className="small-line"></div>

                                                                <div className="qaqc-row">
                                                                    <div className="qa-column">
                                                                        {!hiddenRoles.includes("QA") &&
                                                                            (qaMembers.length > 0 ? (
                                                                                qaMembers.map((qa) => (
                                                                                    <div
                                                                                        key={qa.id}
                                                                                        className="org-node qa1"
                                                                                        onMouseEnter={(e) => handleHoverUser(qa, e)}
                                                                                        onMouseLeave={() => handleHoverUser(null, null)}
                                                                                    >
                                                                                        {qa.name}
                                                                                    </div>
                                                                                ))
                                                                            ) : (
                                                                                <div className="org-node qa1">QA</div>
                                                                            ))}
                                                                    </div>

                                                                    <div className="qc-column">
                                                                        {!hiddenRoles.includes("QC") &&
                                                                            (qcMembers.length > 0 ? (
                                                                                qcMembers.map((qc) => (
                                                                                    <div
                                                                                        key={qc.id}
                                                                                        className="org-node qc"
                                                                                        onMouseEnter={(e) => handleHoverUser(qc, e)}
                                                                                        onMouseLeave={() => handleHoverUser(null, null)}
                                                                                    >
                                                                                        {qc.name}
                                                                                    </div>
                                                                                ))
                                                                            ) : (
                                                                                <div className="org-node qc1">QC</div>
                                                                            ))}
                                                                    </div>
                                                                    <div className="production-column">
                                                                        {!hiddenRoles.includes("Production") &&
                                                                            (productionMembers.length > 0 ? (
                                                                                productionMembers.map((p) => (
                                                                                    <div
                                                                                        key={p.id}
                                                                                        className="org-node prod"
                                                                                        onMouseEnter={(e) => handleHoverUser(p, e)}
                                                                                        onMouseLeave={() => handleHoverUser(null, null)}
                                                                                    >
                                                                                        {p.name}
                                                                                    </div>
                                                                                ))
                                                                            ) : (
                                                                                <div className="org-node prod1">PRODUCTION</div>
                                                                            ))}
                                                                    </div>
                                                                </div>
                                                            </>
                                                        )}
                                                    </div>
                                                );
                                            })}

                                        </div>
                                        <div className="org-legend">

                                            <div
                                                className="legend-item all-item"
                                                onClick={() => setHiddenRoles([])}
                                            >
                                                <span className="legend-color all-color"></span>
                                                ALL
                                            </div>

                                            {!hiddenRoles.includes("Domain") && (
                                                <div
                                                    className="legend-item"
                                                    onClick={() => handleLegendClick("Domain")}
                                                >
                                                    <span className="legend-color domain-color"></span>
                                                    Domain
                                                </div>
                                            )}

                                            {!hiddenRoles.includes("TeamLead") && (
                                                <div
                                                    className="legend-item"
                                                    onClick={() => handleLegendClick("TeamLead")}
                                                >
                                                    <span className="legend-color tl-color"></span>
                                                    Team Lead
                                                </div>
                                            )}

                                            {!hiddenRoles.includes("QA") && (
                                                <div
                                                    className="legend-item"
                                                    onClick={() => handleLegendClick("QA")}
                                                >
                                                    <span className="legend-color qa-color"></span>
                                                    QA
                                                </div>
                                            )}

                                            {!hiddenRoles.includes("QC") && (
                                                <div
                                                    className="legend-item"
                                                    onClick={() => handleLegendClick("QC")}
                                                >
                                                    <span className="legend-color qc-color"></span>
                                                    QC
                                                </div>
                                            )}

                                            {!hiddenRoles.includes("Production") && (
                                                <div
                                                    className="legend-item"
                                                    onClick={() => handleLegendClick("Production")}
                                                >
                                                    <span className="legend-color prod-color"></span>
                                                    Production
                                                </div>
                                            )}

                                        </div>
                                    </div>
                                )}

                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default Organogram;