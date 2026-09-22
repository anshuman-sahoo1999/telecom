const db = require("../config/db");

// ➕ CREATE USER
exports.createUser = (req, res) => {
    const { 
        name, 
        emp_id, 
        email, 
        role, 
        domain, 
        memberType, 
        totalExperience, 
        telecomExperience, 
        skillSets, 
        region, 
        mobileNo 
    } = req.body;

    if (!name || !role) {
        return res.status(400).json({
            success: false,
            message: "Name and Role are required"
        });
    }

    const formattedDomain = Array.isArray(domain) ? domain.join(",") : (domain || "");
    let rawMemberType = Array.isArray(memberType) ? memberType.join(",") : (memberType || "");
    const formattedMemberType = rawMemberType ? rawMemberType.slice(0, 10) : null;

    const sql = `
        INSERT INTO users 
        (name, emp_id, email, role, domain, memberType, totalExperience, telecomExperience, skillSets, region, mobileNo) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const values = [
        name, 
        emp_id || null, 
        email || null, 
        role, 
        formattedDomain, 
        formattedMemberType, 
        ["TeamLead", "TeamMember"].includes(role) ? totalExperience : null, 
        ["TeamLead", "TeamMember"].includes(role) ? telecomExperience : null, 
        ["TeamLead", "TeamMember"].includes(role) ? skillSets : null, 
        ["TeamLead", "TeamMember"].includes(role) ? region : null, 
        ["TeamLead", "TeamMember"].includes(role) ? mobileNo : null
    ];

    db.query(sql, values, (err, result) => {
        if (err) {
            return res.status(500).json({
                success: false,
                message: err.message
            });
        }

        res.status(201).json({
            success: true,
            message: "User created successfully",
            userId: result.insertId
        });
    });
};


// 📄 GET ALL USERS
exports.getUsers = (req, res) => {
    const sql = "SELECT * FROM users ORDER BY id DESC";

    db.query(sql, (err, result) => {
        if (err) {
            return res.status(500).json({
                success: false,
                message: err.message
            });
        }

        res.status(200).json({
            success: true,
            count: result.length,
            users: result,
            data: result
        });
    });
};


// 🔍 GET USER BY ID
exports.getUserById = (req, res) => {
    const sql = "SELECT * FROM users WHERE id = ?";

    db.query(sql, [req.params.id], (err, result) => {
        if (err) {
            return res.status(500).json({
                success: false,
                message: err.message
            });
        }

        if (result.length === 0) {
            return res.status(404).json({
                success: false,
                message: "User not found"
            });
        }

        res.status(200).json({
            success: true,
            data: result[0]
        });
    });
};


// ✏️ UPDATE USER
exports.updateUser = (req, res) => {
    const { 
        name, 
        emp_id, 
        email, 
        role, 
        domain, 
        memberType, 
        totalExperience, 
        telecomExperience, 
        skillSets, 
        region, 
        mobileNo 
    } = req.body;

    const formattedDomain = Array.isArray(domain) ? domain.join(",") : (domain || "");
    let rawMemberType = Array.isArray(memberType) ? memberType.join(",") : (memberType || "");
    const formattedMemberType = rawMemberType ? rawMemberType.slice(0, 10) : null;

    const sql = `
        UPDATE users 
        SET name=?, emp_id=?, email=?, role=?, domain=?, memberType=?, totalExperience=?, telecomExperience=?, skillSets=?, region=?, mobileNo=? 
        WHERE id=?
    `;

    const values = [
        name, 
        emp_id || null, 
        email || null, 
        role, 
        formattedDomain, 
        formattedMemberType, 
        ["TeamLead", "TeamMember"].includes(role) ? totalExperience : null, 
        ["TeamLead", "TeamMember"].includes(role) ? telecomExperience : null, 
        ["TeamLead", "TeamMember"].includes(role) ? skillSets : null, 
        ["TeamLead", "TeamMember"].includes(role) ? region : null, 
        ["TeamLead", "TeamMember"].includes(role) ? mobileNo : null,
        req.params.id
    ];

    db.query(sql, values, (err, result) => {
        if (err) {
            return res.status(500).json({
                success: false,
                message: err.message
            });
        }

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


// ❌ DELETE USER
exports.deleteUser = (req, res) => {
    const sql = "DELETE FROM users WHERE id=?";

    db.query(sql, [req.params.id], (err, result) => {
        if (err) {
            return res.status(500).json({
                success: false,
                message: err.message
            });
        }

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
