const db = require("../config/db");
const bcrypt = require("bcryptjs");

const SALT_ROUNDS = 10;
const shouldIncreaseYear = (lastUpdated) => {
  if (!lastUpdated) return false;

  const last = new Date(lastUpdated);
  const now = new Date();

  return now.getFullYear() > last.getFullYear();
};

// =======================================
// LOGIN
// =======================================
exports.login = (req, res) => {
  const { login_id, password } = req.body;

  // MASTER LOGIN (still plain for admin shortcut)
  if (login_id === "masteradmin@ecometrix.co.in" && password === "Madmin@123") {
    return res.json({
      success: true,
      role: "MASTER",
      domain: null,
      user: {
        name: "Master Admin"
      }
    });
  }

  const sql = `
    SELECT * FROM users
    WHERE emp_id = ?
    OR email = ?
  `;

  db.query(sql, [login_id, login_id], async (err, result) => {
    if (err) return res.status(500).json(err);

    if (result.length === 0) {
      return res.status(401).json({
        success: false,
        message: "User Not Found"
      });
    }

    const user = result[0];

    try {
      // Password Check
      const isMatch = await bcrypt.compare(password, user.password);

      if (!isMatch) {
        return res.status(401).json({
          success: false,
          message: "Wrong Password"
        });
      }

      // Experience update logic
      if (shouldIncreaseYear(user.lastExpUpdate)) {
        user.totalExperience = Number(user.totalExperience || 0) + 1;
        user.telecomExperience = Number(user.telecomExperience || 0) + 1;

        const sqlUpdate = `
          UPDATE users 
          SET totalExperience = ?, telecomExperience = ?, lastExpUpdate = NOW()
          WHERE id = ?
        `;

        db.query(sqlUpdate, [
          user.totalExperience,
          user.telecomExperience,
          user.id
        ]);
      }

      // Password hata kar user object send karein
      const { password: _, ...safeUser } = user;

      res.json({
        success: true,
        role: safeUser.role,
        domain: safeUser.domain || null,
        user: safeUser // Isme memberType (QA/QC/Production) front-end tak jayega
      });

    } catch (e) {
      return res.status(500).json(e);
    }
  });
};

// =======================================
// CREATE USER
// =======================================
exports.createUser = async (req, res) => {
  let { name, emp_id, email, password, role, domain, memberType, totalExperience, telecomExperience, skillSets, region, mobileNo } = req.body;

  email = (email || "").trim().toLowerCase().replace(/\s/g, "");

  const finalPassword =
    password && password.trim() !== "" ? password : "123456";

  const hashedPassword = await bcrypt.hash(finalPassword, SALT_ROUNDS);

  const finalDomain = Array.isArray(domain)
    ? domain.join(",")
    : domain || null;

  const sql = `
    INSERT INTO users 
(name, emp_id, email, password, role, domain, memberType, totalExperience, telecomExperience, skillSets, region, mobileNo)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  db.query(
    sql,
    [
      name,
      emp_id,
      email,
      hashedPassword,
      role,
      finalDomain,
      memberType || null,
      ["Team Lead", "Team Member"].includes(role) ? totalExperience : null,
      ["Team Lead", "Team Member"].includes(role) ? telecomExperience : null,
      ["Team Lead", "Team Member"].includes(role) ? skillSets : null,
      ["Team Lead", "Team Member"].includes(role) ? region : null,
      ["Team Lead", "Team Member"].includes(role) ? mobileNo : null
    ],
    (err) => {
      if (err) return res.status(500).json(err);

      res.json({
        success: true,
        message: "User Created Successfully"
      });
    }
  );
};

// =======================================
// GET ALL USERS (RAW)
// =======================================
exports.getUsers = (req, res) => {
  const sql = `SELECT * FROM users`;

  db.query(sql, (err, result) => {
    if (err) return res.status(500).json(err);

    res.json(result);
  });
};

// =======================================
// GET USERS (TABLE FORMAT)
// =======================================
exports.getAllUserDetails = (req, res) => {
  const sql = `
SELECT id, name, emp_id, email, role, domain, memberType,
totalExperience, telecomExperience, skillSets, region, mobileNo
    FROM users
    ORDER BY id DESC
  `;

  db.query(sql, (err, result) => {
    if (err) return res.status(500).json(err);

    const data = result.map((item, index) => ({
      slno: index + 1,
      id: item.id,
      name: item.name,
      emp_id: item.emp_id,
      email: item.email,
      role: item.role,
      domain: item.domain,
      memberType: item.memberType,
      totalExperience: item.totalExperience,
      telecomExperience: item.telecomExperience,
      skillSets: item.skillSets,
      region: item.region,
      mobileNo: item.mobileNo

    }));

    res.json({
      success: true,
      users: data
    });
  });
};

// =======================================
// UPDATE USER
// =======================================
exports.updateUser = (req, res) => {
  let { name, emp_id, email, password, role, domain, memberType, totalExperience, telecomExperience, skillSets, region, mobileNo } = req.body;

  email = (email || "").trim().toLowerCase();

  const finalDomain =
    ["Team Lead", "Team Member"].includes(role)
      ? Array.isArray(domain)
        ? domain.join(",")
        : domain
      : null;

  const finalMemberType =
    role === "Team Member" ? memberType || null : null;

  const sql = `
  UPDATE users
  SET
    name = ?,emp_id = ?,email = ?,role = ?,domain = ?,memberType = ?,totalExperience = ?,telecomExperience = ?,skillSets = ?,region = ?,mobileNo = ?
  WHERE id = ?
`;

  db.query(
    sql,
    [
      name,
      emp_id,
      email,
      role,
      finalDomain,
      finalMemberType,
      ["Team Lead", "Team Member"].includes(role) ? totalExperience : null,
      ["Team Lead", "Team Member"].includes(role) ? telecomExperience : null,
      ["Team Lead", "Team Member"].includes(role) ? skillSets : null,
      ["Team Lead", "Team Member"].includes(role) ? region : null,
      ["Team Lead", "Team Member"].includes(role) ? mobileNo : null,
      req.params.id
    ],
    (err) => {
      if (err) return res.status(500).json(err);

      res.json({
        success: true,
        message: "User Updated Successfully"
      });
    }
  );
};

// =======================================
// UPDATE PASSWORD ONLY (BCRYPT)
// =======================================
exports.updatePassword = async (req, res) => {
  const { password } = req.body;

  if (!password || password.trim() === "") {
    return res.status(400).json({
      success: false,
      message: "Password required"
    });
  }

  const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

  const sql = `
    UPDATE users
    SET password = ?
    WHERE id = ?
  `;

  db.query(sql, [hashedPassword, req.params.id], (err) => {
    if (err) return res.status(500).json(err);

    res.json({
      success: true,
      message: "Password Updated Successfully"
    });
  });
};

// =======================================
// DELETE USER
// =======================================
exports.deleteUser = (req, res) => {
  const sql = `DELETE FROM users WHERE id = ?`;

  db.query(sql, [req.params.id], (err) => {
    if (err) return res.status(500).json(err);

    res.json({
      success: true,
      message: "User Deleted Successfully"
    });
  });
};
exports.updateUserPosition = (req, res) => {
  const { id } = req.params;
  const { domain, memberType } = req.body;

  const sql = `
    UPDATE users
    SET domain = ?, memberType = ?
    WHERE id = ?
  `;

  db.query(sql, [domain, memberType, id], (err) => {
    if (err) return res.status(500).json(err);

    res.json({
      success: true,
      message: "User position updated"
    });
  });
};
exports.getTlByDomain = (req, res) => {
  const domain = req.query.domain;

  const sql = `
    SELECT id, name, domain, role
    FROM users
    WHERE role = 'TeamLead'
    AND domain LIKE ?
  `;

  db.query(sql, [`%${domain}%`], (err, result) => {
    if (err) return res.status(500).json(err);

    res.json({
      success: true,
      data: result
    });
  });
};