const db = require("../config/db");

// ---------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------
const TEAM_ROLES = ["TeamLead", "TeamMember"];
const isTeamRole = (role) => TEAM_ROLES.includes(role);

// Array ya string, dono se comma-separated string banao
const toDomainString = (domain) =>
    Array.isArray(domain)
        ? domain.map((d) => String(d).trim()).filter(Boolean).join(",")
        : (domain || "").toString().trim();

const toMemberTypeString = (memberType) => {
    const raw = Array.isArray(memberType)
        ? memberType.map((m) => String(m).trim()).filter(Boolean).join(",")
        : (memberType || "").toString().trim();
    return raw ? raw.slice(0, 10) : null;
};

// Khaali value ko NULL banao, baaki trim karke rakho
const clean = (v) => {
    if (v === undefined || v === null) return null;
    const s = String(v).trim();
    return s === "" ? null : s;
};

// Team Lead / Team Member ke extra fields. Baaki roles ke liye NULL.
const teamFields = (role, body) => {
    if (!isTeamRole(role)) return [null, null, null, null, null];
    return [
        clean(body.totalExperience),
        clean(body.telecomExperience),
        clean(body.skillSets),
        clean(body.region),
        clean(body.mobileNo)
    ];
};

// Frontend ko hamesha ye 5 fields mile (null ki jagah khaali string)
const normalizeUser = (u) => ({
    ...u,
    totalExperience: u.totalExperience ?? "",
    telecomExperience: u.telecomExperience ?? "",
    skillSets: u.skillSets ?? "",
    region: u.region ?? "",
    mobileNo: u.mobileNo ?? ""
});

const sendDbError = (res, err) => {
    if (err && err.code === "ER_DUP_ENTRY") {
        return res.status(409).json({
            success: false,
            message: "Employee ID or Email already exists"
        });
    }
    return res.status(500).json({
        success: false,
        message: err.message
    });
};

// ---------------------------------------------------------------------
// ➕ CREATE USER
// ---------------------------------------------------------------------
exports.createUser = (req, res) => {
    const { name, emp_id, email, role, domain, memberType } = req.body;

    if (!name || !role) {
        return res.status(400).json({
            success: false,
            message: "Name and Role are required"
        });
    }

    const sql = `
        INSERT INTO users
        (name, emp_id, email, role, domain, memberType, totalExperience, telecomExperience, skillSets, region, mobileNo)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const values = [
        String(name).trim(),
        clean(emp_id),
        clean(email),
        role,
        toDomainString(domain),
        toMemberTypeString(memberType),
        ...teamFields(role, req.body)
    ];

    db.query(sql, values, (err, result) => {
        if (err) return sendDbError(res, err);

        res.status(201).json({
            success: true,
            message: "User created successfully",
            userId: result.insertId
        });
    });
};

// ---------------------------------------------------------------------
// 📄 GET ALL USERS
// ---------------------------------------------------------------------
exports.getUsers = (req, res) => {
    const sql = "SELECT * FROM users ORDER BY id DESC";

    db.query(sql, (err, result) => {
        if (err) return sendDbError(res, err);

        const users = result.map(normalizeUser);

        res.status(200).json({
            success: true,
            count: users.length,
            users,
            data: users
        });
    });
};

// ---------------------------------------------------------------------
// 🔍 GET USER BY ID
// ---------------------------------------------------------------------
exports.getUserById = (req, res) => {
    const sql = "SELECT * FROM users WHERE id = ?";

    db.query(sql, [req.params.id], (err, result) => {
        if (err) return sendDbError(res, err);

        if (result.length === 0) {
            return res.status(404).json({
                success: false,
                message: "User not found"
            });
        }

        res.status(200).json({
            success: true,
            data: normalizeUser(result[0])
        });
    });
};

// ---------------------------------------------------------------------
// ✏️ UPDATE USER
// ---------------------------------------------------------------------
exports.updateUser = (req, res) => {
    const { name, emp_id, email, role, domain, memberType } = req.body;

    if (!name || !role) {
        return res.status(400).json({
            success: false,
            message: "Name and Role are required"
        });
    }

    const sql = `
        UPDATE users
        SET name=?, emp_id=?, email=?, role=?, domain=?, memberType=?,
            totalExperience=?, telecomExperience=?, skillSets=?, region=?, mobileNo=?
        WHERE id=?
    `;

    const values = [
        String(name).trim(),
        clean(emp_id),
        clean(email),
        role,
        toDomainString(domain),
        toMemberTypeString(memberType),
        ...teamFields(role, req.body),
        req.params.id
    ];

    db.query(sql, values, (err, result) => {
        if (err) return sendDbError(res, err);

        if (result.affectedRows === 0) {
            return res.status(404).json({
                success: false,
                message: "User not found"
            });
        }

        res.status(200).json({
            success: true,
            message: "User updated successfully"
        });
    });
};

// ---------------------------------------------------------------------
// ❌ DELETE USER
// ---------------------------------------------------------------------
exports.deleteUser = (req, res) => {
    const sql = "DELETE FROM users WHERE id=?";

    db.query(sql, [req.params.id], (err, result) => {
        if (err) return sendDbError(res, err);

        if (result.affectedRows === 0) {
            return res.status(404).json({
                success: false,
                message: "User not found"
            });
        }

        res.status(200).json({
            success: true,
            message: "User deleted successfully"
        });
    });
};
