import { API_BASE_URL } from "../config";
import React, { useCallback, useEffect, useRef, useState } from "react";
import axios from "axios";
import { FaSitemap, FaProjectDiagram, FaFileExport, FaExpand, FaCompress } from "react-icons/fa";
import {
    DndContext,
    useDroppable,
    pointerWithin,
    rectIntersection,
    PointerSensor,
    useSensor,
    useSensors,
} from "@dnd-kit/core";
import DraggableUser from "../components/DraggableUser";
import UserReportModal from "../components/UserReportModal";
import * as htmlToImage from "html-to-image";
import * as XLSX from "xlsx-js-style";
import { saveAs } from "file-saver";
import { jsPDF } from "jspdf";
import "../style/organogram.css";

const SNAP_DISTANCE = 80;
const AUTO_REFRESH_MS = 30000; // har 30 second mein users/domains apne aap refresh honge

const collisionDetection = (args) => {
    const { droppableContainers, droppableRects, pointerCoordinates, active } = args;
    const pointerHits = pointerWithin(args);
    if (pointerHits.length > 0) return pointerHits;
    if (!pointerCoordinates) return rectIntersection(args);
    const draggedRole = active?.data?.current?.role;
    const candidates = droppableContainers.filter(
        (c) => draggedRole === "TeamLead" || !String(c.id).endsWith("|TeamLead")
    );

    let best = null;
    let bestDistance = Infinity;

    candidates.forEach((container) => {
        const rect = droppableRects.get(container.id);
        if (!rect) return;
        const dx = Math.max(rect.left - pointerCoordinates.x, 0, pointerCoordinates.x - rect.right);
        const dy = Math.max(rect.top - pointerCoordinates.y, 0, pointerCoordinates.y - rect.bottom);
        const distance = Math.hypot(dx, dy);
        if (distance < bestDistance) {
            bestDistance = distance;
            best = container;
        }
    });

    if (best && bestDistance <= SNAP_DISTANCE) {
        return [{ id: best.id, data: { droppableContainer: best, value: bestDistance } }];
    }

    return [];
};

/* =====================================================
   Helper functions (component ke bahar)
   ===================================================== */

// String ("A, B") ya array dono ko clean array mein badalta hai
// (pehle array aane par .split() se crash ho sakta tha)
const toList = (value) => {
    if (Array.isArray(value)) {
        return value.map((x) => String(x).trim()).filter(Boolean);
    }
    if (typeof value === "string") {
        return value.split(",").map((x) => x.trim()).filter(Boolean);
    }
    return [];
};

// Domain naam case-insensitive match (Master mein "Voice", user mein "VOICE" ho to bhi tree mein aa jaye)
const hasDomain = (userDomain, domainName) => {
    const target = (domainName || "").toString().trim().toLowerCase();
    if (!target) return false;
    return toList(userDomain).some((d) => d.toLowerCase() === target);
};

const getMemberType = (u) => {
    const mt = Array.isArray(u?.memberType) ? u.memberType[0] : u?.memberType;
    return (mt || "").toString().trim();
};

const sameType = (a, b) => (a || "").toString().toLowerCase() === (b || "").toString().toLowerCase();

const sameId = (a, b) => String(a) === String(b);

const getErrorText = (err, fallback) => {
    const data = err?.response?.data;
    const msg =
        data?.message ||
        data?.error ||
        (typeof data === "string" ? data.slice(0, 200) : "") ||
        err?.message ||
        fallback;
    const status = err?.response?.status;
    return `${status ? `Status ${status}: ` : ""}${msg}`;
};

/* ---------- On-screen message (toast) + confirm box styles ---------- */
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
    gap: "12px",
};

const toastColors = {
    success: "#16a34a",
    error: "#dc2626",
    warning: "#d97706",
};

const toastIcons = {
    success: "✅",
    error: "❌",
    warning: "⚠️",
};

const confirmOverlayStyle = {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.45)",
    zIndex: 999998,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
};

const confirmModalStyle = {
    background: "#ffffff",
    borderRadius: "10px",
    padding: "22px 24px",
    width: "90%",
    maxWidth: "400px",
    boxShadow: "0 10px 30px rgba(0,0,0,0.3)",
    textAlign: "center",
    fontFamily: "Arial, sans-serif",
};

const confirmBtnBase = {
    border: "none",
    borderRadius: "6px",
    padding: "8px 18px",
    fontSize: "14px",
    fontWeight: 600,
    cursor: "pointer",
    color: "#ffffff",
};

const DomainDropZone = ({ dropId, children }) => {
    const { setNodeRef, isOver, active } = useDroppable({ id: dropId });
    const draggedRole = active?.data?.current?.role;
    const isTLZone = String(dropId).endsWith("|TeamLead");
    const isValidTarget = draggedRole === "TeamLead" || !isTLZone;
    const highlight = isOver && isValidTarget;

    return (
        <div
            ref={setNodeRef}
            className="domain-drop-container"
            style={
                highlight
                    ? {
                          outline: "2px dashed #1976d2",
                          outlineOffset: "3px",
                          borderRadius: "8px",
                          backgroundColor: "rgba(25, 118, 210, 0.10)",
                      }
                    : undefined
            }
        >
            {children}
        </div>
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
    const popupTreeRef = useRef(null);
    const [hiddenRoles, setHiddenRoles] = useState([]);
    const hoverTimerRef = useRef(null);
    const [selectedUser, setSelectedUser] = useState(null);
    const [openReport, setOpenReport] = useState(false);
    const [isFullScreen, setIsFullScreen] = useState(false);

    // Screen par message + delete confirm
    const [toast, setToast] = useState(null); // { type, text }
    const toastTimerRef = useRef(null);
    const [deleteTarget, setDeleteTarget] = useState(null); // { id, name, role }
    const [deleting, setDeleting] = useState(false);

    // Auto refresh ke time drag / export ke beech data na badle
    const draggingRef = useRef(false);
    const exportingRef = useRef(false);

    // Click aur drag alag rahein: 6px hilne par hi drag shuru hoga.
    // (Isse ✕ cross dabane par galti se drag shuru nahi hota)
    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
    );

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

    useEffect(() => {
        exportingRef.current = isExporting;
    }, [isExporting]);

    const handleHoverUser = (user, event) => {
        clearTimeout(hoverTimerRef.current);

        if (user && user !== "LEAVE") {
            const rect = event?.currentTarget?.getBoundingClientRect();

            const posX = rect ? rect.right + 10 : (event?.clientX || 100);
            const posY = rect ? rect.top : (event?.clientY || 100);

            setSelectedUser({
                ...user,
                x: posX,
                y: posY,
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
        { id: "overall", label: "Overall", icon: <FaSitemap />, desc: "Company Structure" },
        { id: "project", label: "Project", icon: <FaProjectDiagram />, desc: "Project Structure" },
    ];

    /* ---------------- Fetch ---------------- */

    const fetchUsers = useCallback(
        async (silent = false) => {
            try {
                const res = await axios.get(`${API_BASE_URL}/api/auth/all-user-details`);
                setUsers(res.data?.users || []);
            } catch (err) {
                console.log(err);
                if (!silent) showToast("error", "Users load nahi ho paye!");
            }
        },
        [showToast]
    );

    // Pehle sirf /api/work/bydomain se domains aate the, isliye Master Domain Creation mein
    // naya domain add karne par wo tree mein nahi aata tha (jab tak uska work data na ho).
    // Ab Work + Master dono ke domains merge hote hain.
    const fetchDomains = useCallback(
        async (silent = false) => {
            const [workRes, masterRes] = await Promise.allSettled([
                axios.get(`${API_BASE_URL}/api/work/bydomain`),
                axios.get(`${API_BASE_URL}/api/master`),
            ]);

            if (workRes.status === "rejected" && masterRes.status === "rejected") {
                console.log(workRes.reason);
                if (!silent) showToast("error", "Domains load nahi ho paye!");
                return;
            }

            let workList = [];
            if (workRes.status === "fulfilled") {
                const data = workRes.value.data;
                const arr = Array.isArray(data) ? data : data?.data || [];
                workList = arr.map((d) => (typeof d === "string" ? d : d?.domain));
            }

            let masterList = [];
            if (masterRes.status === "fulfilled") {
                const data = masterRes.value.data;
                if (Array.isArray(data)) {
                    masterList = data.map((d) =>
                        typeof d === "string" ? d : d?.domain || d?.name
                    );
                } else {
                    masterList = Object.keys(data || {});
                }
            }

            // Case-insensitive unique. Purana order (work wale) pehle, naye Master domains baad mein
            const seen = new Set();
            const merged = [];
            [...workList, ...masterList].forEach((d) => {
                const clean = (d || "").toString().trim();
                const key = clean.toLowerCase();
                if (clean && !seen.has(key)) {
                    seen.add(key);
                    merged.push({ domain: clean });
                }
            });

            setDomains(merged);
        },
        [showToast]
    );

    useEffect(() => {
        fetchUsers();
        fetchDomains();
    }, [fetchUsers, fetchDomains]);

    // Auto refresh: naya domain / naya TL / naya member apne aap tree mein aa jaye
    useEffect(() => {
        const refresh = () => {
            if (draggingRef.current || exportingRef.current) return;
            fetchUsers(true);
            fetchDomains(true);
        };

        const intervalId = setInterval(() => {
            if (!document.hidden) refresh();
        }, AUTO_REFRESH_MS);

        const onFocus = () => refresh();
        const onVisibility = () => {
            if (!document.hidden) refresh();
        };
        // Master Domain Creation page se domain badalte hi turant refresh
        const onDomainsUpdated = () => refresh();
        const onStorage = (e) => {
            if (e.key === "domains_updated_at") refresh();
        };

        window.addEventListener("focus", onFocus);
        document.addEventListener("visibilitychange", onVisibility);
        window.addEventListener("domains-updated", onDomainsUpdated);
        window.addEventListener("storage", onStorage);

        return () => {
            clearInterval(intervalId);
            window.removeEventListener("focus", onFocus);
            document.removeEventListener("visibilitychange", onVisibility);
            window.removeEventListener("domains-updated", onDomainsUpdated);
            window.removeEventListener("storage", onStorage);
        };
    }, [fetchUsers, fetchDomains]);

    // unmount par hover timer clear karo
    useEffect(() => {
        return () => clearTimeout(hoverTimerRef.current);
    }, []);

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

    const getExportElement = () => {
        return isFullScreen && popupTreeRef.current ? popupTreeRef.current : treeRef.current;
    };

    const admins = users.filter((u) => u.role === "Admin").sort((a, b) => a.id - b.id);
    const misUsers = users.filter((u) => u.role === "MIS");
    const teamLeads = users.filter((u) => u.role === "TeamLead");
    const teamMembers = users.filter((u) => u.role === "TeamMember");

    const totalEmployeesCount = teamLeads.length + teamMembers.length;

    const misAdminIndex = admins.length > 1 ? 1 : 0;

    // Ek domain ke TL / QA / QC / Production members
    const getDomainGroups = (domainName) => ({
        tls: teamLeads.filter((tl) => hasDomain(tl.domain, domainName)),
        qaMembers: teamMembers.filter(
            (m) => sameType(getMemberType(m), "QA") && hasDomain(m.domain, domainName)
        ),
        qcMembers: teamMembers.filter(
            (m) => sameType(getMemberType(m), "QC") && hasDomain(m.domain, domainName)
        ),
        productionMembers: teamMembers.filter(
            (m) => sameType(getMemberType(m), "Production") && hasDomain(m.domain, domainName)
        ),
    });

    /* ---------------- Delete (✕ cross se) ---------------- */

    // DraggableUser se user object ya sirf id, dono aa sakte hain
    // Cross dabane par pehle screen par confirm box aayega, seedha delete nahi hoga
    const handleDelete = (arg) => {
        const id = arg && typeof arg === "object" ? arg.id : arg;
        if (id === undefined || id === null) {
            showToast("error", "User ID nahi mili, delete nahi ho sakta!");
            return;
        }

        const found = users.find((u) => sameId(u.id, id));

        // Hover wala report popup band kar do
        clearTimeout(hoverTimerRef.current);
        setOpenReport(false);
        setSelectedUser(null);

        setDeleteTarget({
            id,
            name: found?.name || (arg && typeof arg === "object" ? arg.name : "") || "this user",
            role: found?.role || "",
        });
    };

    const confirmDelete = async () => {
        const target = deleteTarget;
        if (!target || deleting) return;

        setDeleting(true);
        try {
            await axios.delete(`${API_BASE_URL}/api/auth/delete-user/${target.id}`);
            setUsers((prev) => prev.filter((u) => !sameId(u.id, target.id)));
            setDeleteTarget(null);
            showToast("success", "User deleted successfully!");
            // Backend ka asli data wapas lao
            fetchUsers(true);
        } catch (err) {
            console.error(err);
            setDeleteTarget(null);
            showToast("error", getErrorText(err, "Delete failed!"));
        } finally {
            setDeleting(false);
        }
    };

    const handleLegendClick = (role) => {
        if (role === "ALL") {
            setHiddenRoles([]);
            return;
        }
        setHiddenRoles((prev) =>
            prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role]
        );
    };

    /* ---------------- Export ---------------- */

    const exportPNG = async () => {
        setIsExporting(true);
        try {
            await new Promise((r) => setTimeout(r, 100));
            const element = getExportElement();
            if (!element) return;
            const dataUrl = await htmlToImage.toPng(element, {
                backgroundColor: "#fff",
                pixelRatio: 2,
                cacheBust: true,
                width: element.scrollWidth,
                height: element.scrollHeight,
            });
            const link = document.createElement("a");
            link.download = `Organogram ${getFileNameDateTime()}.png`;
            link.href = dataUrl;
            link.click();
            showToast("success", "PNG exported successfully!");
        } catch (err) {
            console.log(err);
            showToast("error", "Failed to export PNG!");
        } finally {
            setIsExporting(false);
            setOpenExport(false);
        }
    };

    const exportJPG = async () => {
        setIsExporting(true);
        try {
            await new Promise((r) => setTimeout(r, 100));
            const element = getExportElement();
            if (!element) return;
            const dataUrl = await htmlToImage.toJpeg(element, {
                quality: 0.95,
                backgroundColor: "#fff",
                width: element.scrollWidth,
                height: element.scrollHeight,
            });
            const link = document.createElement("a");
            link.download = `Organogram ${getFileNameDateTime()}.jpg`;
            link.href = dataUrl;
            link.click();
            showToast("success", "JPG exported successfully!");
        } catch (err) {
            console.log(err);
            showToast("error", "Failed to export JPG!");
        } finally {
            setIsExporting(false);
            setOpenExport(false);
        }
    };

    const exportPDF = async () => {
        setIsExporting(true);
        try {
            await new Promise((r) => setTimeout(r, 100));
            const element = getExportElement();
            if (!element) return;
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
            pdf.save(`Organogram ${getFileNameDateTime()}.pdf`);
            showToast("success", "PDF exported successfully!");
        } catch (err) {
            console.log(err);
            showToast("error", "Failed to export PDF!");
        } finally {
            setIsExporting(false);
            setOpenExport(false);
        }
    };

    const exportExcel = () => {
        try {
            const wb = XLSX.utils.book_new();
            const roleSheets = {
                Admin: users.filter((u) => u.role === "Admin"),
                MIS: users.filter((u) => u.role === "MIS"),
                TeamLead: users.filter((u) => u.role === "TeamLead"),
                TeamMember: users.filter((u) => u.role === "TeamMember"),
            };

            Object.entries(roleSheets).forEach(([sheetName, data]) => {
                const rows = data.map((u) => {
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
                        // Array ho ya string, dono sahi dikhe
                        Domain: toList(u.domain).join(", "),
                        MemberType: toList(u.memberType).join(", "),
                        Mobile: u.mobileNo || "",
                        Email: u.email || "",
                        TotalExp: u.totalExperience || "",
                        TelecomExp: u.telecomExperience || "",
                        SkillSets: Array.isArray(u.skillSets) ? u.skillSets.join(", ") : u.skillSets || "",
                        Region: u.region || "",
                    };
                });
                const ws = XLSX.utils.json_to_sheet(rows);
                // khali sheet me ws["!ref"] undefined hota hai, isse crash hota tha
                if (ws["!ref"]) {
                    const range = XLSX.utils.decode_range(ws["!ref"]);
                    for (let col = range.s.c; col <= range.e.c; col++) {
                        const cell = XLSX.utils.encode_cell({ r: 0, c: col });
                        if (ws[cell]) {
                            ws[cell].s = {
                                fill: { fgColor: { rgb: "1F4E78" } },
                                font: { bold: true, color: { rgb: "FFFFFF" } },
                                alignment: { horizontal: "center", vertical: "center" },
                            };
                        }
                    }
                }
                XLSX.utils.book_append_sheet(wb, ws, sheetName);
            });
            const excelBuffer = XLSX.write(wb, {
                bookType: "xlsx",
                type: "array",
                cellStyles: true,
            });
            const file = new Blob([excelBuffer], {
                type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            });

            saveAs(file, `Organogram Report ${getFileNameDateTime()}.xlsx`);
            showToast("success", "Excel exported successfully!");
        } catch (err) {
            console.log(err);
            showToast("error", "Failed to export Excel!");
        } finally {
            setOpenExport(false);
        }
    };

    /* ---------------- Drag & Drop ---------------- */

    // drag shuru hote hi hover wala report popup band kar do (drag ke beech me aa jata tha)
    const handleDragStart = () => {
        draggingRef.current = true;
        clearTimeout(hoverTimerRef.current);
        setOpenReport(false);
        setSelectedUser(null);
    };

    const handleDragCancel = () => {
        draggingRef.current = false;
    };

    const handleDragEnd = async (event) => {
        draggingRef.current = false;

        const { active, over } = event;
        if (!over) return;

        const draggedId = String(active.id);
        const draggedUser = users.find((u) => String(u.id) === draggedId);
        if (!draggedUser) return;

        const [targetDomain, targetType] = String(over.id).split("|");
        if (!targetDomain || !targetType) return;

        // API fail ho to UI ko purani state par wapas laane ke liye snapshot
        const previousUsers = users;

        const showSaveError = async (err) => {
            console.error("update-position failed:", err?.response?.status, err?.response?.data || err);

            // UI ko pehle purani state par lao, phir DB se asli data le aao
            // (agar backend ne save kar liya tha par response me error aaya, to bhi tree sahi dikhega)
            setUsers(previousUsers);
            await fetchUsers(true);

            showToast("error", `Position update failed! ${getErrorText(err, "Unknown error")}`);
        };

        // ---------- TEAM LEAD ----------
        if (draggedUser.role === "TeamLead") {
            const oldDomain = draggedUser.domain;

            // apne hi domain me drop kiya to kuch mat karo
            if (hasDomain(oldDomain, targetDomain)) return;

            const targetTL = users.find(
                (u) =>
                    !sameId(u.id, draggedUser.id) &&
                    u.role === "TeamLead" &&
                    hasDomain(u.domain, targetDomain)
            );

            setUsers((prev) =>
                prev.map((u) => {
                    if (sameId(u.id, draggedUser.id)) return { ...u, domain: targetDomain };
                    if (targetTL && sameId(u.id, targetTL.id)) return { ...u, domain: oldDomain };
                    return u;
                })
            );

            try {
                await axios.put(`${API_BASE_URL}/api/auth/update-position/${draggedUser.id}`, {
                    domain: targetDomain,
                    memberType: null,
                });
                if (targetTL) {
                    await axios.put(`${API_BASE_URL}/api/auth/update-position/${targetTL.id}`, {
                        domain: oldDomain,
                        memberType: null,
                    });
                }

                await fetchUsers(true);
                showToast("success", "Position updated successfully!");
            } catch (err) {
                showSaveError(err);
            }
            return;
        }

        if (targetType === "TeamLead") {
            showToast("warning", "Team Member ko Team Lead ke box mein nahi daal sakte!");
            return;
        }

        if (!["QA", "QC", "Production"].includes(targetType)) return;

        const alreadyThere =
            sameType(getMemberType(draggedUser), targetType) &&
            hasDomain(draggedUser.domain, targetDomain);
        if (alreadyThere) return;

        setUsers((prev) =>
            prev.map((u) =>
                String(u.id) === draggedId
                    ? { ...u, domain: targetDomain, memberType: targetType }
                    : u
            )
        );

        try {
            await axios.put(`${API_BASE_URL}/api/auth/update-position/${draggedId}`, {
                domain: targetDomain,
                memberType: targetType,
            });
            // backend ka asli data wapas lao, taaki tree me wahi dikhe jo DB me hai
            await fetchUsers(true);
            showToast("success", "Position updated successfully!");
        } catch (err) {
            showSaveError(err);
        }
    };

    /* ---------------- Tree render ---------------- */

    // ref parameter me aata hai, main aur popup dono ke liye alag ref use hota hai
    const renderTreeContent = (refToUse) =>
        activeTab === "overall" ? (
            <DndContext
                sensors={sensors}
                collisionDetection={collisionDetection}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
                onDragCancel={handleDragCancel}
            >
                <div ref={refToUse} className="export-area">
                    {isExporting && <ExportHeader />}
                    <div className="org-tree-wrapper">
                        <div className="org-tree">
                            {!hiddenRoles.includes("Admin") &&
                                admins.map((admin, index) => (
                                    <React.Fragment key={admin.id}>
                                        <div className="admin-row">
                                            <div className="org-node admin">{admin.name}</div>

                                            {index === misAdminIndex && !hiddenRoles.includes("MIS") && (
                                                <div className="mis-wrapper">
                                                    <div className="mis-top"></div>
                                                    <div className="mis-center"></div>
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

                                {(domains || []).map((d) => {
                                    const domainName = d.domain;
                                    const { tls, qaMembers, qcMembers, productionMembers } =
                                        getDomainGroups(domainName);

                                    return (
                                        <div className="domain-column" key={domainName}>
                                            {!hiddenRoles.includes("Domain") && (
                                                <div className="org-node domain">{domainName}</div>
                                            )}

                                            <div className="small-line"></div>

                                            <DomainDropZone dropId={`${domainName}|TeamLead`}>
                                                <div className="tl-wrapper">
                                                    {!hiddenRoles.includes("TeamLead") &&
                                                        (tls.length > 0 ? (
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
                                                        ))}
                                                </div>
                                            </DomainDropZone>

                                            <div className="small-line"></div>
                                            <div className="qaqc-row">
                                                <DomainDropZone dropId={`${domainName}|QA`}>
                                                    <div className="qa-column">
                                                        {!hiddenRoles.includes("QA") &&
                                                            (qaMembers.length > 0 ? (
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
                                                            ))}
                                                    </div>
                                                </DomainDropZone>

                                                <DomainDropZone dropId={`${domainName}|QC`}>
                                                    <div className="qc-column">
                                                        {!hiddenRoles.includes("QC") &&
                                                            (qcMembers.length > 0 ? (
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
                                                            ))}
                                                    </div>
                                                </DomainDropZone>

                                                <DomainDropZone dropId={`${domainName}|Production`}>
                                                    <div className="production-column">
                                                        {!hiddenRoles.includes("Production") &&
                                                            (productionMembers.length > 0 ? (
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
                                                            ))}
                                                    </div>
                                                </DomainDropZone>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>

                            <div className="org-legend">
                                <div className="legend-item all-item" onClick={() => setHiddenRoles([])}>
                                    <span className="legend-color all-color"></span>ALL
                                </div>
                                {!hiddenRoles.includes("Admin") && (
                                    <div className="legend-item" onClick={() => handleLegendClick("Admin")}>
                                        <span className="legend-color admin-color"></span>Admin
                                    </div>
                                )}
                                {!hiddenRoles.includes("MIS") && (
                                    <div className="legend-item" onClick={() => handleLegendClick("MIS")}>
                                        <span className="legend-color mis-color"></span>MIS
                                    </div>
                                )}
                                {!hiddenRoles.includes("Domain") && (
                                    <div className="legend-item" onClick={() => handleLegendClick("Domain")}>
                                        <span className="legend-color domain-color"></span>Domain
                                    </div>
                                )}
                                {!hiddenRoles.includes("TeamLead") && (
                                    <div className="legend-item" onClick={() => handleLegendClick("TeamLead")}>
                                        <span className="legend-color tl-color"></span>Team Lead
                                    </div>
                                )}
                                {!hiddenRoles.includes("QA") && (
                                    <div className="legend-item" onClick={() => handleLegendClick("QA")}>
                                        <span className="legend-color qa-color"></span>QA
                                    </div>
                                )}
                                {!hiddenRoles.includes("QC") && (
                                    <div className="legend-item" onClick={() => handleLegendClick("QC")}>
                                        <span className="legend-color qc-color"></span>QC
                                    </div>
                                )}
                                {!hiddenRoles.includes("Production") && (
                                    <div className="legend-item" onClick={() => handleLegendClick("Production")}>
                                        <span className="legend-color prod-color"></span>Production
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </DndContext>
        ) : (
            <div className="org-body-box-inner">
                <div ref={refToUse} className="export-area">
                    {isExporting && <ExportHeader />}
                    <div className="org-tree">
                        <div className="domain-wrapp">
                            {domains.map((d) => {
                                const domainName = d.domain;
                                const isOpen = selectedDomain === domainName;
                                const shouldShow = isOpen || isExporting;
                                const { tls, qaMembers, qcMembers, productionMembers } =
                                    getDomainGroups(domainName);

                                return (
                                    <div key={domainName} className="domain-item">
                                        {!hiddenRoles.includes("Domain") && (
                                            <div
                                                className={`org-node domain ${isOpen ? "active-domain" : ""}`}
                                                onClick={() => setSelectedDomain(isOpen ? null : domainName)}
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
                                                                <DraggableUser
                                                                    key={tl.id}
                                                                    user={tl}
                                                                    onDelete={handleDelete}
                                                                    onHover={handleHoverUser}
                                                                    disableDrag={true}
                                                                />
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
                                                                    <DraggableUser
                                                                        key={qa.id}
                                                                        user={qa}
                                                                        onDelete={handleDelete}
                                                                        onHover={handleHoverUser}
                                                                        disableDrag={true}
                                                                    />
                                                                ))
                                                            ) : (
                                                                <div className="org-node qa1">QA</div>
                                                            ))}
                                                    </div>

                                                    <div className="qc-column">
                                                        {!hiddenRoles.includes("QC") &&
                                                            (qcMembers.length > 0 ? (
                                                                qcMembers.map((qc) => (
                                                                    <DraggableUser
                                                                        key={qc.id}
                                                                        user={qc}
                                                                        onDelete={handleDelete}
                                                                        onHover={handleHoverUser}
                                                                        disableDrag={true}
                                                                    />
                                                                ))
                                                            ) : (
                                                                <div className="org-node qc1">QC</div>
                                                            ))}
                                                    </div>

                                                    <div className="production-column">
                                                        {!hiddenRoles.includes("Production") &&
                                                            (productionMembers.length > 0 ? (
                                                                productionMembers.map((p) => (
                                                                    <DraggableUser
                                                                        key={p.id}
                                                                        user={p}
                                                                        onDelete={handleDelete}
                                                                        onHover={handleHoverUser}
                                                                        disableDrag={true}
                                                                    />
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
                            <div className="legend-item all-item" onClick={() => setHiddenRoles([])}>
                                <span className="legend-color all-color"></span>ALL
                            </div>
                            {!hiddenRoles.includes("Domain") && (
                                <div className="legend-item" onClick={() => handleLegendClick("Domain")}>
                                    <span className="legend-color domain-color"></span>Domain
                                </div>
                            )}
                            {!hiddenRoles.includes("TeamLead") && (
                                <div className="legend-item" onClick={() => handleLegendClick("TeamLead")}>
                                    <span className="legend-color tl-color"></span>Team Lead
                                </div>
                            )}
                            {/* har role ka legend alag se check hota hai */}
                            {!hiddenRoles.includes("QA") && (
                                <div className="legend-item" onClick={() => handleLegendClick("QA")}>
                                    <span className="legend-color qa-color"></span>QA
                                </div>
                            )}
                            {!hiddenRoles.includes("QC") && (
                                <div className="legend-item" onClick={() => handleLegendClick("QC")}>
                                    <span className="legend-color qc-color"></span>QC
                                </div>
                            )}
                            {!hiddenRoles.includes("Production") && (
                                <div className="legend-item" onClick={() => handleLegendClick("Production")}>
                                    <span className="legend-color prod-color"></span>Production
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        );

    return (
        <div className="org-page">
            {/* ---------- Screen par success / error message ---------- */}
            {toast && (
                <div
                    role="status"
                    style={{
                        ...toastBaseStyle,
                        background: toastColors[toast.type] || toastColors.success,
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
                            lineHeight: 1,
                        }}
                    >
                        ✕
                    </button>
                </div>
            )}

            {/* ---------- Delete confirm (screen par) ---------- */}
            {deleteTarget && (
                <div
                    style={confirmOverlayStyle}
                    onClick={() => !deleting && setDeleteTarget(null)}
                >
                    <div style={confirmModalStyle} onClick={(e) => e.stopPropagation()}>
                        <div
                            style={{
                                fontSize: "16px",
                                fontWeight: 700,
                                marginBottom: "8px",
                                color: "#111827",
                            }}
                        >
                            Delete User?
                        </div>
                        <div style={{ fontSize: "14px", color: "#4b5563", marginBottom: "18px" }}>
                            Are you sure you want to delete "{deleteTarget.name}"
                            {deleteTarget.role ? ` (${deleteTarget.role})` : ""}? This user will be
                            permanently deleted!
                        </div>
                        <div style={{ display: "flex", justifyContent: "center", gap: "12px" }}>
                            <button
                                type="button"
                                style={{
                                    ...confirmBtnBase,
                                    background: "#dc2626",
                                    opacity: deleting ? 0.6 : 1,
                                }}
                                onClick={confirmDelete}
                                disabled={deleting}
                            >
                                {deleting ? "Deleting..." : "Yes, Delete"}
                            </button>
                            <button
                                type="button"
                                style={{ ...confirmBtnBase, background: "#6b7280" }}
                                onClick={() => setDeleteTarget(null)}
                                disabled={deleting}
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <UserReportModal open={openReport} user={selectedUser} />
            <div className="org-container">
                <div className="org-topbar">
                    <div className="org-title-center">
                        <h2>Organogram</h2>
                    </div>

                    <div className="export-wrapper">
                        <button
                            type="button"
                            className="export-btned"
                            onClick={() => setOpenExport(!openExport)}
                        >
                            <FaFileExport /> Export
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

                <div className="org-tab-wrapper">
                    {tabs.map((tab) => (
                        <div
                            key={tab.id}
                            className={`org-tab-card ${activeTab === tab.id ? "active" : ""}`}
                            onClick={() => setActiveTab(tab.id)}
                        >
                            <div className="org-icon">{tab.icon}</div>
                            <div className="org-info">
                                <h3>{tab.label}</h3>
                                <span>{tab.desc}</span>
                            </div>
                        </div>
                    ))}
                </div>

                <div className="capacity-summary-card">
                    <div className="capacity-metrics single-metric">
                        <div className="metric-item">
                            <span>Capacity Number</span>
                            <strong className="total-highlight">{totalEmployeesCount}</strong>
                        </div>
                    </div>
                </div>

                <div className="org-body-box">
                    <button
                        type="button"
                        className="org-view-fullscreen-btn"
                        onClick={() => setIsFullScreen(true)}
                        title="View"
                    >
                        <FaExpand />
                        <span>View</span>
                    </button>

                    {renderTreeContent(treeRef)}
                </div>

                {isFullScreen && (
                    <div className="org-popup-overlay" onClick={() => setIsFullScreen(false)}>
                        <div className="org-popup-content" onClick={(e) => e.stopPropagation()}>
                            <button
                                type="button"
                                className="org-popup-close-btn"
                                onClick={() => setIsFullScreen(false)}
                            >
                                <FaCompress /> Close
                            </button>
                            <div className="org-tree-popup-container">
                                {renderTreeContent(popupTreeRef)}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default Organogram;
