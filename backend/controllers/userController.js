const db = require("../config/db");

// ➕ CREATE USER
exports.createUser = (req, res) => {
    const { name, empId, role } = req.body;

    if (!name || !empId || !role) {
        return res.status(400).json({
            success: false,
            message: "Name, EmpId, Role required"
        });
    }

    const sql = "INSERT INTO user (name, empId, role) VALUES (?, ?, ?)";

    db.query(sql, [name, empId, role], (err, result) => {
        if (err) {
            return res.status(500).json({
                success: false,
                message: err.message
            });
        }

        res.status(201).json({
            success: true,
            message: "User created successfully",
            userId: result.insertId,
            data: { name, empId, role }
        });
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
            data: result
        });
    });
};


// 🔍 GET USER BY ID (OPTIONAL BUT USEFUL)
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
    const { name, empId, role } = req.body;

    const sql = "UPDATE user SET name=?, empId=?, role=? WHERE id=?";

    db.query(sql, [name, empId, role, req.params.id], (err, result) => {
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