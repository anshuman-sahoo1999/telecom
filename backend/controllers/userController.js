const db = require("../config/db");
const bcrypt = require("bcrypt");

// ➕ CREATE USER (Auth Route Handler)
exports.registerUser = exports.createUser = async (req, res) => {
    try {
        const {
            name,
            emp_id,
            empId,
            email,
            password,
            role,
            domain,
            memberType,
            totalExperience,
            telecomExperience,
            skillSets,
            region,
            mobileNo
        } = req.body;

        if (!name || !email || !role || !password) {
            return res.status(400).json({
                success: false,
                message: "Name, Email, Role, and Password are required"
            });
        }

        // Password Hash
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // Formatting arrays/strings for MySQL
        const finalEmpId = emp_id || empId || null;
        const formattedDomain = Array.isArray(domain) ? domain.join(",") : domain || null;
        const formattedMemberType = Array.isArray(memberType) ? memberType.join(",") : memberType || null;

        const sql = `
            INSERT INTO user 
            (name, emp_id, email, password, role, domain, memberType, totalExperience, telecomExperience, skillSets, region, mobileNo) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

        const values = [
            name,
            finalEmpId,
            email,
            hashedPassword,
            role,
            formattedDomain,
            formattedMemberType,
            totalExperience || null,
            telecomExperience || null,
            skillSets || null,
            region || null,
            mobileNo || null
        ];

        db.query(sql, values, (err, result) => {
            if (err) {
                console.error("Database Insert Error:", err);
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
    } catch (error) {
        console.error("Server Error:", error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

// ✏️ UPDATE USER (Auth Route Handler)
exports.updateUser = async (req, res) => {
    try {
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

        const finalEmpId = emp_id || empId || null;
        const formattedDomain = Array.isArray(domain) ? domain.join(",") : domain || null;
        const formattedMemberType = Array.isArray(memberType) ? memberType.join(",") : memberType || null;

        const sql = `
            UPDATE user 
            SET name=?, emp_id=?, email=?, role=?, domain=?, memberType=?, totalExperience=?, telecomExperience=?, skillSets=?, region=?, mobileNo=? 
            WHERE id=?
        `;

        const values = [
            name,
            finalEmpId,
            email,
            role,
            formattedDomain,
            formattedMemberType,
            totalExperience || null,
            telecomExperience || null,
            skillSets || null,
            region || null,
            mobileNo || null,
            req.params.id
        ];

        db.query(sql, values, (err, result) => {
            if (err) {
                console.error("Database Update Error:", err);
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
    } catch (error) {
        console.error("Server Update Error:", error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};
