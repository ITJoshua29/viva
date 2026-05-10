const express = require('express');
const bcrypt  = require('bcrypt');

const pool = require('../db');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

const SALT_ROUNDS = 10;

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/users/me
// Returns the authenticated user's profile (no password_hash)
// ─────────────────────────────────────────────────────────────────────────────
router.get('/me', authenticate, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT id, email, full_name, age, sex, country, occupation,
              phone_number, profile_image, role, created_at
       FROM users
       WHERE id = ?`,
      [req.user.id]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found.',
      });
    }

    const user = rows[0];

    return res.status(200).json({
      success: true,
      data: {
        id:           user.id,
        email:        user.email,
        fullName:     user.full_name,
        age:          user.age,
        sex:          user.sex,
        country:      user.country,
        occupation:   user.occupation,
        phoneNumber:  user.phone_number,
        profileImage: user.profile_image,
        role:         user.role,
        createdAt:    user.created_at,
      },
    });
  } catch (err) {
    console.error('[Users] GET /me error:', err);
    return res.status(500).json({
      success: false,
      message: 'An internal server error occurred.',
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/users/me
// Updates the authenticated user's profile
// ─────────────────────────────────────────────────────────────────────────────
router.put('/me', authenticate, async (req, res) => {
  try {
    const { fullName, age, sex, country, occupation, phoneNumber, profileImage } = req.body;

    // Build update query dynamically based on provided fields
    const fields  = [];
    const values  = [];

    if (fullName     !== undefined) { fields.push('full_name = ?');    values.push(fullName); }
    if (age          !== undefined) { fields.push('age = ?');          values.push(age); }
    if (sex          !== undefined) { fields.push('sex = ?');          values.push(sex); }
    if (country      !== undefined) { fields.push('country = ?');      values.push(country); }
    if (occupation   !== undefined) { fields.push('occupation = ?');   values.push(occupation); }
    if (phoneNumber  !== undefined) { fields.push('phone_number = ?'); values.push(phoneNumber); }
    if (profileImage !== undefined) { fields.push('profile_image = ?'); values.push(profileImage); }

    if (fields.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No update fields provided.',
      });
    }

    values.push(req.user.id);

    await pool.execute(
      `UPDATE users SET ${fields.join(', ')} WHERE id = ?`,
      values
    );

    // Return updated user
    const [rows] = await pool.execute(
      `SELECT id, email, full_name, age, sex, country, occupation,
              phone_number, profile_image, role, created_at
       FROM users WHERE id = ?`,
      [req.user.id]
    );

    const user = rows[0];

    return res.status(200).json({
      success: true,
      message: 'Profile updated successfully.',
      data: {
        id:           user.id,
        email:        user.email,
        fullName:     user.full_name,
        age:          user.age,
        sex:          user.sex,
        country:      user.country,
        occupation:   user.occupation,
        phoneNumber:  user.phone_number,
        profileImage: user.profile_image,
        role:         user.role,
        createdAt:    user.created_at,
      },
    });
  } catch (err) {
    console.error('[Users] PUT /me error:', err);
    return res.status(500).json({
      success: false,
      message: 'An internal server error occurred.',
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/users/me/password
// Changes the authenticated user's password
// ─────────────────────────────────────────────────────────────────────────────
router.put('/me/password', authenticate, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'currentPassword and newPassword are required.',
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'New password must be at least 6 characters long.',
      });
    }

    // Fetch current password hash
    const [rows] = await pool.execute(
      'SELECT id, password_hash FROM users WHERE id = ?',
      [req.user.id]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found.',
      });
    }

    const user = rows[0];

    // Verify current password
    const isMatch = await bcrypt.compare(currentPassword, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Current password is incorrect.',
      });
    }

    // Hash and save new password
    const newHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
    await pool.execute(
      'UPDATE users SET password_hash = ? WHERE id = ?',
      [newHash, req.user.id]
    );

    return res.status(200).json({
      success: true,
      message: 'Password changed successfully.',
    });
  } catch (err) {
    console.error('[Users] PUT /me/password error:', err);
    return res.status(500).json({
      success: false,
      message: 'An internal server error occurred.',
    });
  }
});

module.exports = router;
