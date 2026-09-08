const express = require("express");
const router = express.Router();

const {
  login,
  createUser,
  getUsers,
  deleteUser,
  updateUser,
  updatePassword,
  getAllUserDetails,
  updateUserPosition,
  getTlByDomain  // ✅ ADD THIS
} = require("../controllers/authController");

// LOGIN
router.post("/login", login);

router.post("/create-user", createUser);

router.get("/users", getUsers);

router.get("/all-user-details", getAllUserDetails);

// UPDATE FULL USER
router.put("/update-user/:id", updateUser);

// 🔥 NEW: DRAG & DROP POSITION UPDATE
router.put("/update-position/:id", updateUserPosition);

// DELETE USER
router.delete("/delete-user/:id", deleteUser);

// PASSWORD UPDATE
router.put("/update-password/:id", updatePassword);
router.get("/tl/bydomain", getTlByDomain);

module.exports = router;