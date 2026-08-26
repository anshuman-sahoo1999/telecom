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
exports.login = async (req, res) => {
  try {
    const { login_id, password } = req.body;

    // MASTER LOGIN
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
      if (err) {
        console.error("Login SQL Error:", err);
        return res.status(500).json({ success: false, message: err.sqlMessage || err });
      }

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
          ], (updateErr) => {
            if (updateErr) console.error("Experience Update Error:", updateErr);
          });
        }

        const { password: _, ...safeUser } = user;

        res.json({
          success: true,
          role: safeUser.role,
          domain: safeUser.domain || null,
          user: safeUser
        });

      } catch (bcryptErr) {
        console.error("Bcrypt Compare Error:", bcryptErr);
        return res.status(500).json({ success: false, message: bcryptErr.message });
      }
    });
  } catch (e) {
    console.error("Login Controller Catch Error:", e);
    return res.status(500).json({ success: false, message: e.message });
  }
};

// =======================================
// CREATE USER
// =======================================
exports.createUser = async (req, res) => {
  try {
    let { name, emp_id, email, password, role, domain, memberType, totalExperience, telecomExperience, skillSets, region, mobileNo } = req.body;

    email = (email || "").trim().toLowerCase().replace(/\s/g, "");

    const finalPassword = password && password.trim() !== "" ? password : "123456";
    const hashedPassword = await bcrypt.hash(finalPassword, SALT_ROUNDS);

    const finalDomain = Array.isArray(domain)
      ? domain.join(",")
      : domain || null;

    // memberType ki length limit varchar(10) ko dhyan me rakhte hue slice kar diya hai
    let rawMemberType = Array.isArray(memberType)
      ? memberType.join(",")
      : memberType || null;
      
    const finalMemberType = rawMemberType ? rawMemberType.slice(0, 10) : null;

    const sql = `
      INSERT INTO users 
      (name, emp_id, email, password, role, domain, memberType, totalExperience, telecomExperience, skillSets, region, mobileNo)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const values = [
      name,
      emp_id,
      email,
      hashedPassword,
      role,
      finalDomain,
      finalMemberType,
      ["Team Lead", "Team Member"].includes(role) ? totalExperience : null,
      ["Team Lead", "Team Member"].includes(role) ? telecomExperience : null,
      ["Team Lead", "Team Member"].includes(role) ? skillSets : null,
      ["Team Lead", "Team Member"].includes(role) ? region : null,
      ["Team Lead", "Team Member"].includes(role) ? mobileNo : null
    ];

    db.query(sql, values, (err) => {
      if (err) {
        console.error("SQL Error in createUser:", err);
        return res.status(500).json({ 
          success: false, 
          message: err.sqlMessage || err.message || "Database insert failed" 
        });
      }

      res.json({
        success: true,
        message: "User Created Successfully"
      });
    });
  } catch (e) {
    console.error("Catch Error in createUser:", e);
    return res.status(500).json({ success: false, message: e.message });
  }
};

// =======================================
// GET ALL USERS (RAW)
// =======================================
exports.getUsers = (req, res) => {
  const sql = `SELECT * FROM users`;

  db.query(sql, (err, result) => {
    if (err) {
      console.error("GetUsers Error:", err);
      return res.status(500).json({ success: false, message: err.sqlMessage || err });
    }

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
    if (err) {
      console.error("GetAllUserDetails Error:", err);
      return res.status(500).json({ success: false, message: err.sqlMessage || err });
    }

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
  let { name, emp_id, email, role, domain, memberType, totalExperience, telecomExperience, skillSets, region, mobileNo } = req.body;

  email = (email || "").trim().toLowerCase();

  const finalDomain = Array.isArray(domain)
    ? domain.join(",")
    : domain || null;

  let rawMemberType = Array.isArray(memberType)
    ? memberType.join(",")
    : memberType || null;
    
  const finalMemberType = rawMemberType ? rawMemberType.slice(0, 10) : null;

  const sql = `
    UPDATE users
    SET
      name = ?, emp_id = ?, email = ?, role = ?, domain = ?, memberType = ?, totalExperience = ?, telecomExperience = ?, skillSets = ?, region = ?, mobileNo = ?
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
      if (err) {
        console.error("UpdateUser Error:", err);
        return res.status(500).json({ success: false, message: err.sqlMessage || err });
      }

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
  try {
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
      if (err) {
        console.error("UpdatePassword Error:", err);
        return res.status(500).json({ success: false, message: err.sqlMessage || err });
      }

      res.json({
        success: true,
        message: "Password Updated Successfully"
      });
    });
  } catch (e) {
    console.error("UpdatePassword Catch Error:", e);
    return res.status(500).json({ success: false, message: e.message });
  }
};

// =======================================
// DELETE USER
// =======================================
exports.deleteUser = (req, res) => {
  const sql = `DELETE FROM users WHERE id = ?`;

  db.query(sql, [req.params.id], (err) => {
    if (err) {
      console.error("DeleteUser Error:", err);
      return res.status(500).json({ success: false, message: err.sqlMessage || err });
    }

    res.json({
      success: true,
      message: "User Deleted Successfully"
    });
  });
};

// =======================================
// UPDATE USER POSITION
// =======================================
exports.updateUserPosition = (req, res) => {
  const { id } = req.params;
  const { domain, memberType } = req.body;

  let rawMemberType = Array.isArray(memberType)
    ? memberType.join(",")
    : memberType || null;
    
  const finalMemberType = rawMemberType ? rawMemberType.slice(0, 10) : null;

  const sql = `
    UPDATE users
    SET domain = ?, memberType = ?
    WHERE id = ?
  `;

  db.query(sql, [domain, finalMemberType, id], (err) => {
    if (err) {
      console.error("UpdateUserPosition Error:", err);
      return res.status(500).json({ success: false, message: err.sqlMessage || err });
    }

    res.json({
      success: true,
      message: "User position updated"
    });
  });
};

// =======================================
// GET TL BY DOMAIN
// =======================================
exports.getTlByDomain = (req, res) => {
  const domain = req.query.domain;

  const sql = `
    SELECT id, name, domain, role
    FROM users
    WHERE role = 'TeamLead'
    AND domain LIKE ?
  `;

  db.query(sql, [`%${domain}%`], (err, result) => {
    if (err) {
      console.error("GetTlByDomain Error:", err);
      return res.status(500).json({ success: false, message: err.sqlMessage || err });
    }

    res.json({
      success: true,
      data: result
    });
  });
};
