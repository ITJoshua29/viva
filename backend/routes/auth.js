require("dotenv").config();
const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { v4: uuidv4 } = require("uuid");

const pool = require("../db");
const { authenticate } = require("../middleware/auth");
const {
  sendPasswordResetEmail,
  sendPasswordChangeVerificationEmail,
} = require("../utils/email");

const router = express.Router();

const SALT_ROUNDS = 10;

// ─── Helper: sign JWT ─────────────────────────────────────────────────────────

function signToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || "7d" },
  );
}

// ─── Helper: strip sensitive fields from user row ────────────────────────────

function sanitizeUser(user) {
  const {
    password_hash,
    reset_token,
    reset_expires,
    change_pw_token,
    change_pw_hash,
    change_pw_expires,
    ...safe
  } = user;
  return safe;
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/auth/register
// ─────────────────────────────────────────────────────────────────────────────
router.post("/register", async (req, res) => {
  try {
    const {
      email,
      password,
      fullName,
      age,
      sex,
      country,
      occupation,
      phoneNumber,
    } = req.body;

    if (!email || !password || !fullName) {
      return res.status(400).json({
        success: false,
        message: "email, password, and fullName are required.",
      });
    }

    // Check for duplicate email
    const [existing] = await pool.execute(
      "SELECT id FROM users WHERE email = ?",
      [email.toLowerCase().trim()],
    );
    if (existing.length > 0) {
      return res.status(409).json({
        success: false,
        message: "An account with that email already exists.",
      });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    // Insert new user
    const [result] = await pool.execute(
      `INSERT INTO users
         (email, password_hash, full_name, age, sex, country, occupation, phone_number, role)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'user')`,
      [
        email.toLowerCase().trim(),
        passwordHash,
        fullName,
        age || null,
        sex || null,
        country || null,
        occupation || null,
        phoneNumber || null,
      ],
    );

    const newUserId = result.insertId;

    // Fetch the newly created user
    const [rows] = await pool.execute("SELECT * FROM users WHERE id = ?", [
      newUserId,
    ]);
    const user = rows[0];
    const token = signToken(user);

    return res.status(201).json({
      success: true,
      message: "Account created successfully.",
      data: {
        token,
        user: sanitizeUser(user),
      },
    });
  } catch (err) {
    console.error("[Auth] Register error:", err);
    return res.status(500).json({
      success: false,
      message: "An internal server error occurred.",
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/auth/login
// ─────────────────────────────────────────────────────────────────────────────
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "email and password are required.",
      });
    }

    // Find user by email
    const [rows] = await pool.execute("SELECT * FROM users WHERE email = ?", [
      email.toLowerCase().trim(),
    ]);

    if (rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password.",
      });
    }

    const user = rows[0];

    // Compare password
    const passwordMatch = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatch) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password.",
      });
    }

    const token = signToken(user);

    return res.status(200).json({
      success: true,
      message: "Login successful.",
      data: {
        token,
        isAdmin: user.role === "admin",
        user: {
          id: user.id,
          email: user.email,
          fullName: user.full_name,
          age: user.age,
          sex: user.sex,
          country: user.country,
          occupation: user.occupation,
          phoneNumber: user.phone_number,
          profileImage: user.profile_image,
          role: user.role,
          createdAt: user.created_at,
        },
      },
    });
  } catch (err) {
    console.error("[Auth] Login error:", err);
    return res.status(500).json({
      success: false,
      message: "An internal server error occurred.",
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/auth/admin-login
// ─────────────────────────────────────────────────────────────────────────────
router.post("/admin-login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "email and password are required.",
      });
    }

    const [rows] = await pool.execute("SELECT * FROM users WHERE email = ?", [
      email.toLowerCase().trim(),
    ]);

    if (rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password.",
      });
    }

    const user = rows[0];

    const passwordMatch = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatch) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password.",
      });
    }

    if (user.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Access denied. Admin credentials required.",
      });
    }

    const token = signToken(user);

    return res.status(200).json({
      success: true,
      message: "Admin login successful.",
      data: {
        token,
        isAdmin: true,
        user: {
          id: user.id,
          email: user.email,
          fullName: user.full_name,
          age: user.age,
          sex: user.sex,
          country: user.country,
          occupation: user.occupation,
          phoneNumber: user.phone_number,
          profileImage: user.profile_image,
          role: user.role,
          createdAt: user.created_at,
        },
      },
    });
  } catch (err) {
    console.error("[Auth] Admin-login error:", err);
    return res.status(500).json({
      success: false,
      message: "An internal server error occurred.",
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/auth/forgot-password
// ─────────────────────────────────────────────────────────────────────────────
router.post("/forgot-password", async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: "email is required.",
      });
    }

    const [rows] = await pool.execute(
      "SELECT id, email, full_name FROM users WHERE email = ?",
      [email.toLowerCase().trim()],
    );

    // Always return success to prevent email enumeration
    if (rows.length === 0) {
      return res.status(200).json({
        success: true,
        message: "If that email is registered, a reset link has been sent.",
      });
    }

    const user = rows[0];
    const resetToken = uuidv4();
    const resetExpires = Date.now() + 3600000; // 1 hour from now

    // Save reset token to DB
    await pool.execute(
      "UPDATE users SET reset_token = ?, reset_expires = ? WHERE id = ?",
      [resetToken, resetExpires, user.id],
    );

    const resetLink = `${process.env.APP_URL}/reset-password?token=${resetToken}`;

    // Send email (non-blocking on failure)
    await sendPasswordResetEmail(user.email, resetLink);

    return res.status(200).json({
      success: true,
      message: "If that email is registered, a reset link has been sent.",
    });
  } catch (err) {
    console.error("[Auth] Forgot-password error:", err);
    return res.status(500).json({
      success: false,
      message: "An internal server error occurred.",
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/auth/reset-password
// ─────────────────────────────────────────────────────────────────────────────
router.post("/reset-password", async (req, res) => {
  try {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
      return res.status(400).json({
        success: false,
        message: "token and newPassword are required.",
      });
    }

    // Find user with a valid (non-expired) token
    const [rows] = await pool.execute(
      "SELECT * FROM users WHERE reset_token = ? AND reset_expires > ?",
      [token, Date.now()],
    );

    if (rows.length === 0) {
      return res.status(400).json({
        success: false,
        message: "This password reset link is invalid or has expired.",
      });
    }

    const user = rows[0];

    // Hash new password
    const newHash = await bcrypt.hash(newPassword, SALT_ROUNDS);

    // Update password and clear reset fields
    await pool.execute(
      "UPDATE users SET password_hash = ?, reset_token = NULL, reset_expires = NULL WHERE id = ?",
      [newHash, user.id],
    );

    return res.status(200).json({
      success: true,
      message: "Password has been reset successfully. You can now log in.",
    });
  } catch (err) {
    console.error("[Auth] Reset-password error:", err);
    return res.status(500).json({
      success: false,
      message: "An internal server error occurred.",
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/auth/verify-token/:token
// ─────────────────────────────────────────────────────────────────────────────
router.get("/verify-token/:token", async (req, res) => {
  try {
    const { token } = req.params;

    if (!token) {
      return res.status(400).json({
        success: false,
        data: { valid: false },
        message: "Token is required.",
      });
    }

    const [rows] = await pool.execute(
      "SELECT id FROM users WHERE reset_token = ? AND reset_expires > ?",
      [token, Date.now()],
    );

    const valid = rows.length > 0;

    return res.status(200).json({
      success: true,
      data: { valid },
      message: valid ? "Token is valid." : "Token is invalid or has expired.",
    });
  } catch (err) {
    console.error("[Auth] Verify-token error:", err);
    return res.status(500).json({
      success: false,
      data: { valid: false },
      message: "An internal server error occurred.",
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/auth/request-change-password  (authenticated users only)
//
// Step 1 of 2: Validates the current password, hashes the new one, stores it
// temporarily, then fires a confirmation email.  The password is NOT changed
// yet — the user must click the link in the email to finalise.
// ─────────────────────────────────────────────────────────────────────────────
router.post("/request-change-password", authenticate, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: "currentPassword and newPassword are required.",
      });
    }

    // 1. Fetch the full user row so we can verify the current password hash
    const [rows] = await pool.execute("SELECT * FROM users WHERE id = ?", [
      req.user.id,
    ]);

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "User not found.",
      });
    }

    const user = rows[0];

    // 2. Verify the current password
    const passwordMatch = await bcrypt.compare(
      currentPassword,
      user.password_hash,
    );
    if (!passwordMatch) {
      return res.status(401).json({
        success: false,
        message: "Current password is incorrect.",
      });
    }

    // 3. Validate new password strength
    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: "New password must be at least 6 characters long.",
      });
    }

    // 4. Hash the new password and store it temporarily — it is NOT applied yet
    const newHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
    const token = uuidv4();
    const expiresAt = Date.now() + 3600000; // 1 hour from now

    await pool.execute(
      `UPDATE users
          SET change_pw_token   = ?,
              change_pw_hash    = ?,
              change_pw_expires = ?
        WHERE id = ?`,
      [token, newHash, expiresAt, user.id],
    );

    // 5. Build and send the confirmation email
    const confirmLink = `${process.env.APP_URL}/confirm-password?token=${token}`;

    await sendPasswordChangeVerificationEmail(
      user.email,
      user.full_name,
      confirmLink,
    );

    return res.status(200).json({
      success: true,
      message:
        "Verification email sent. Check your inbox to confirm the change.",
    });
  } catch (err) {
    console.error("[Auth] Request-change-password error:", err);
    return res.status(500).json({
      success: false,
      message: "An internal server error occurred.",
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/auth/confirm-change-password/:token  (no authentication required)
//
// Step 2 of 2: Called when the user clicks the link in the confirmation email.
// Looks up the pending change by token, checks expiry, then atomically applies
// the pre-hashed password and clears all pending-change fields.
// ─────────────────────────────────────────────────────────────────────────────
router.get("/confirm-change-password/:token", async (req, res) => {
  try {
    const { token } = req.params;

    if (!token) {
      return res.status(400).json({
        success: false,
        message: "Confirmation token is required.",
      });
    }

    // 1. Find a user whose pending-change token matches and hasn't expired
    const [rows] = await pool.execute(
      `SELECT id, change_pw_hash
         FROM users
        WHERE change_pw_token   = ?
          AND change_pw_expires > ?`,
      [token, Date.now()],
    );

    if (rows.length === 0) {
      return res.status(400).json({
        success: false,
        message:
          "This link is invalid or has expired. Please request a new password change.",
      });
    }

    const user = rows[0];

    // 2. Apply the pre-hashed password and clear all pending-change fields atomically
    await pool.execute(
      `UPDATE users
          SET password_hash     = ?,
              change_pw_token   = NULL,
              change_pw_hash    = NULL,
              change_pw_expires = NULL
        WHERE id = ?`,
      [user.change_pw_hash, user.id],
    );

    return res.status(200).json({
      success: true,
      message:
        "Password changed successfully! Please log in again with your new password.",
    });
  } catch (err) {
    console.error("[Auth] Confirm-change-password error:", err);
    return res.status(500).json({
      success: false,
      message: "An internal server error occurred.",
    });
  }
});

module.exports = router;
