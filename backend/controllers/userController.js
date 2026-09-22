const db = require("../config/db");

exports.createUser = (req, res) => {
    const { 
        name, emp_id, email, password, role, domain, 
        memberType, totalExperience, telecomExperience, 
        skillSets, region, mobileNo 
    } = req.body;

    const formattedDomain = Array.isArray(domain) ? domain.join(",") : (domain || "");
    const formattedMemberType = Array.isArray(memberType) ? memberType.join(",") : (memberType || "");

    const sql = `
        INSERT INTO users 
        (name, emp_id, email, password, role, domain, memberType, totalExperience, telecomExperience, skillSets, region, mobileNo) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const values = [
        name, emp_id || null, email || null, password || null, role, 
        formattedDomain, formattedMemberType, totalExperience || null, 
        telecomExperience || null, skillSets || null, region || null, mobileNo || null
    ];

    db.query(sql, values, (err, result) => {
        if (err) {
            return res.status(500).json({ success: false, message: err.message });
        }
        res.status(201).json({ success: true, message: "User created successfully", userId: result.insertId });
    });
};

// 📄 GET ALL USERS
exports.getUsers = (req, res) => {
    const sql = "SELECT * FROM user ORDER BY id DESC";

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
            users: result, // Frontend expects res.data.users[cite: 2]
            data: result
        });
    });
};


// 🔍 GET USER BY ID
exports.getUserById = (req, res) => {
    const sql = "SELECT * FROM user WHERE id = ?";

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
        empId, 
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

    const finalEmpId = emp_id || empId;

    const sql = `UPDATE user SET 
        name=?, empId=?, email=?, role=?, domain=?, memberType=?, 
        totalExperience=?, telecomExperience=?, skillSets=?, region=?, mobileNo=? 
        WHERE id=?`;

    const values = [
        name, 
        finalEmpId, 
        email || null, 
        role, 
        Array.isArray(domain) ? domain.join(",") : (domain || ""), 
        Array.isArray(memberType) ? memberType.join(",") : (memberType || ""), 
        totalExperience || null, 
        telecomExperience || null, 
        skillSets || null, 
        region || null, 
        mobileNo || null,
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
    const sql = "DELETE FROM user WHERE id=?";

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
