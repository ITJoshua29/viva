const express = require('express');

const pool = require('../db');
const { authenticate, requireAdmin } = require('../middleware/auth');
const {
  sendApprovalEmail,
  sendRejectionEmail,
  sendCompletionEmail,
} = require('../utils/email');

const router = express.Router();

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/services
// Admin: all service requests + user email
// User: own service requests only
// ─────────────────────────────────────────────────────────────────────────────
router.get('/', authenticate, async (req, res) => {
  try {
    let rows;

    if (req.user.role === 'admin') {
      [rows] = await pool.execute(
        `SELECT sr.*, u.email AS user_email, u.full_name AS user_full_name
         FROM service_requests sr
         JOIN users u ON sr.user_id = u.id
         ORDER BY sr.created_at DESC`
      );
    } else {
      [rows] = await pool.execute(
        `SELECT sr.*, u.email AS user_email, u.full_name AS user_full_name
         FROM service_requests sr
         JOIN users u ON sr.user_id = u.id
         WHERE sr.user_id = ?
         ORDER BY sr.created_at DESC`,
        [req.user.id]
      );
    }

    return res.status(200).json({
      success: true,
      data: rows,
    });
  } catch (err) {
    console.error('[Services] GET / error:', err);
    return res.status(500).json({
      success: false,
      message: 'An internal server error occurred.',
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/services
// Create a new service request
// ─────────────────────────────────────────────────────────────────────────────
router.post('/', authenticate, async (req, res) => {
  try {
    const { room, requestType, details } = req.body;

    if (!room || !requestType) {
      return res.status(400).json({
        success: false,
        message: 'room and requestType are required.',
      });
    }

    const [result] = await pool.execute(
      `INSERT INTO service_requests (user_id, room, request_type, details, status)
       VALUES (?, ?, ?, ?, 'Pending')`,
      [req.user.id, room, requestType, details || null]
    );

    const [rows] = await pool.execute(
      'SELECT * FROM service_requests WHERE id = ?',
      [result.insertId]
    );

    return res.status(201).json({
      success: true,
      message: 'Service request submitted successfully. Awaiting admin approval.',
      data: rows[0],
    });
  } catch (err) {
    console.error('[Services] POST / error:', err);
    return res.status(500).json({
      success: false,
      message: 'An internal server error occurred.',
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/services/:id/approve   (admin only)
// Approves a service request
// ─────────────────────────────────────────────────────────────────────────────
router.put('/:id/approve', authenticate, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const [rows] = await pool.execute(
      `SELECT sr.*, u.email AS user_email, u.full_name AS user_full_name
       FROM service_requests sr
       JOIN users u ON sr.user_id = u.id
       WHERE sr.id = ?`,
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Service request not found.',
      });
    }

    const serviceRequest = rows[0];

    if (serviceRequest.status === 'Approved' || serviceRequest.status === 'Completed') {
      return res.status(400).json({
        success: false,
        message: `Service request is already ${serviceRequest.status.toLowerCase()}.`,
      });
    }

    // Update status to Approved
    await pool.execute(
      "UPDATE service_requests SET status = 'Approved' WHERE id = ?",
      [id]
    );

    // Send approval email (non-blocking on failure)
    await sendApprovalEmail(
      serviceRequest.user_email,
      serviceRequest.user_full_name,
      'service request',
      {
        'Room':         serviceRequest.room,
        'Request Type': serviceRequest.request_type,
        'Details':      serviceRequest.details || 'N/A',
      }
    );

    return res.status(200).json({
      success: true,
      message: 'Service request approved successfully.',
    });
  } catch (err) {
    console.error('[Services] PUT /:id/approve error:', err);
    return res.status(500).json({
      success: false,
      message: 'An internal server error occurred.',
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/services/:id/reject   (admin only)
// Rejects a service request
// ─────────────────────────────────────────────────────────────────────────────
router.put('/:id/reject', authenticate, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body; // admin's rejection reason

    const [rows] = await pool.execute(
      `SELECT sr.*, u.email AS user_email, u.full_name AS user_full_name
       FROM service_requests sr
       JOIN users u ON sr.user_id = u.id
       WHERE sr.id = ?`,
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Service request not found.' });
    }

    const serviceRequest = rows[0];

    if (serviceRequest.status === 'Rejected') {
      return res.status(400).json({ success: false, message: 'Service request is already rejected.' });
    }

    // Save status + reason atomically
    await pool.execute(
      "UPDATE service_requests SET status = 'Rejected', rejection_reason = ? WHERE id = ?",
      [reason || null, id]
    );

    // Notify guest with the reason
    await sendRejectionEmail(
      serviceRequest.user_email,
      serviceRequest.user_full_name,
      'service request',
      {
        'Room':             serviceRequest.room,
        'Request Type':     serviceRequest.request_type,
        'Details':          serviceRequest.details || 'N/A',
        'Rejection Reason': reason || 'No reason provided.',
      }
    );

    return res.status(200).json({
      success: true,
      message: 'Service request rejected and guest notified.',
    });
  } catch (err) {
    console.error('[Services] PUT /:id/reject error:', err);
    return res.status(500).json({ success: false, message: 'An internal server error occurred.' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/services/:id/complete   (admin only)
// Marks a service request as Completed
// ─────────────────────────────────────────────────────────────────────────────
router.put('/:id/complete', authenticate, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const [rows] = await pool.execute(
      `SELECT sr.*, u.email AS user_email, u.full_name AS user_full_name
       FROM service_requests sr
       JOIN users u ON sr.user_id = u.id
       WHERE sr.id = ?`,
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Service request not found.',
      });
    }

    const serviceRequest = rows[0];

    if (serviceRequest.status === 'Completed') {
      return res.status(400).json({
        success: false,
        message: 'Service request is already completed.',
      });
    }

    // Update status to Completed
    await pool.execute(
      "UPDATE service_requests SET status = 'Completed' WHERE id = ?",
      [id]
    );

    // Send completion email (non-blocking on failure)
    await sendCompletionEmail(
      serviceRequest.user_email,
      serviceRequest.user_full_name,
      {
        'Room':         serviceRequest.room,
        'Request Type': serviceRequest.request_type,
        'Details':      serviceRequest.details || 'N/A',
      }
    );

    return res.status(200).json({
      success: true,
      message: 'Service request marked as completed.',
    });
  } catch (err) {
    console.error('[Services] PUT /:id/complete error:', err);
    return res.status(500).json({
      success: false,
      message: 'An internal server error occurred.',
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/services/:id
// Deletes a service request (owner or admin)
// ─────────────────────────────────────────────────────────────────────────────
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;

    const [rows] = await pool.execute(
      'SELECT * FROM service_requests WHERE id = ?',
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Service request not found.',
      });
    }

    const serviceRequest = rows[0];

    // Authorization: owner or admin only
    if (req.user.role !== 'admin' && serviceRequest.user_id !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Forbidden. You do not have permission to delete this service request.',
      });
    }

    await pool.execute(
      'DELETE FROM service_requests WHERE id = ?',
      [id]
    );

    return res.status(200).json({
      success: true,
      message: 'Service request deleted successfully.',
    });
  } catch (err) {
    console.error('[Services] DELETE /:id error:', err);
    return res.status(500).json({
      success: false,
      message: 'An internal server error occurred.',
    });
  }
});

module.exports = router;
