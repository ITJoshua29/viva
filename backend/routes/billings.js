const express = require("express");

const pool = require("../db");
const { authenticate, requireAdmin } = require("../middleware/auth");
const {
  sendBillingDueDateEmail,
  sendPaymentReceiptEmail,
} = require("../utils/email");

const router = express.Router();

// ─────────────────────────────────────────────────────────────────────────────
// Helper: auto-update Overdue status for billings
// Any billing where balance > 0 and due_date < CURRENT DATE → set Overdue
// ─────────────────────────────────────────────────────────────────────────────
async function syncOverdueStatuses() {
  try {
    await pool.execute(
      `UPDATE billings
       SET status = 'Overdue'
       WHERE balance > 0
         AND due_date < CURDATE()
         AND status NOT IN ('Paid', 'Overdue')`,
    );
  } catch (err) {
    console.error("[Billings] syncOverdueStatuses error:", err.message);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/billings
// Admin: all billings + user email
// User: own billings only
// Auto-syncs Overdue status before responding
// ─────────────────────────────────────────────────────────────────────────────
router.get("/", authenticate, async (req, res) => {
  try {
    // Sync overdue statuses before fetching
    await syncOverdueStatuses();

    let rows;

    if (req.user.role === "admin") {
      [rows] = await pool.execute(
        `SELECT b.*, u.email AS user_email, u.full_name AS user_full_name
         FROM billings b
         JOIN users u ON b.user_id = u.id
         ORDER BY b.created_at DESC`,
      );
    } else {
      [rows] = await pool.execute(
        `SELECT b.*, u.email AS user_email, u.full_name AS user_full_name
         FROM billings b
         JOIN users u ON b.user_id = u.id
         WHERE b.user_id = ?
         ORDER BY b.created_at DESC`,
        [req.user.id],
      );
    }

    return res.status(200).json({
      success: true,
      data: rows,
    });
  } catch (err) {
    console.error("[Billings] GET / error:", err);
    return res.status(500).json({
      success: false,
      message: "An internal server error occurred.",
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/billings/:id/pay
// Processes a payment (partial or full) for a billing record
// Body: { paymentType: 'partial' | 'full' }
// ─────────────────────────────────────────────────────────────────────────────
router.post("/:id/pay", authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { paymentType } = req.body;

    if (!paymentType || !["partial", "full"].includes(paymentType)) {
      return res.status(400).json({
        success: false,
        message: 'paymentType must be "partial" or "full".',
      });
    }

    // Fetch the billing record
    const [rows] = await pool.execute("SELECT * FROM billings WHERE id = ?", [
      id,
    ]);

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Billing record not found.",
      });
    }

    const billing = rows[0];

    // Authorization: owner or admin
    if (req.user.role !== "admin" && billing.user_id !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: "Forbidden. You do not have permission to pay this billing.",
      });
    }

    if (billing.status === "Paid") {
      return res.status(400).json({
        success: false,
        message: "This billing has already been fully paid.",
      });
    }

    const totalAmount = parseFloat(billing.total_amount);
    let paidAmount = parseFloat(billing.paid_amount);
    let balance;
    let newStatus;

    if (paymentType === "full") {
      // Full payment: clear entire balance
      paidAmount = totalAmount;
      balance = 0;
      newStatus = "Paid";
    } else {
      // Partial payment: pay half of the total amount
      const partialPayment = totalAmount / 2;
      paidAmount = Math.min(paidAmount + partialPayment, totalAmount);
      balance = totalAmount - paidAmount;

      if (balance <= 0) {
        balance = 0;
        newStatus = "Paid";
      } else {
        newStatus = "Partial";
      }
    }

    // Update the billing record
    await pool.execute(
      "UPDATE billings SET paid_amount = ?, balance = ?, status = ? WHERE id = ?",
      [paidAmount.toFixed(2), balance.toFixed(2), newStatus, id],
    );

    // Fetch updated record
    const [updatedRows] = await pool.execute(
      `SELECT b.*, u.email AS user_email, u.full_name AS user_full_name
       FROM billings b
       JOIN users u ON b.user_id = u.id
       WHERE b.id = ?`,
      [id],
    );

    const updated = updatedRows[0];

    // Send payment receipt email to user (non-blocking)
    await sendPaymentReceiptEmail(
      updated.user_email,
      updated.user_full_name,
      updated.room,
      paymentType,
      paidAmount.toFixed(2),
      balance.toFixed(2),
      newStatus,
    );

    return res.status(200).json({
      success: true,
      message: `Payment processed successfully. Status: ${newStatus}.`,
      data: updated,
    });
  } catch (err) {
    console.error("[Billings] POST /:id/pay error:", err);
    return res.status(500).json({
      success: false,
      message: "An internal server error occurred.",
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/billings/:id/due-date   (admin only)
// Updates the due date for a billing record and notifies the user
// Body: { dueDate: 'YYYY-MM-DD' }
// ─────────────────────────────────────────────────────────────────────────────
router.put("/:id/due-date", authenticate, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { dueDate } = req.body;

    if (!dueDate) {
      return res.status(400).json({
        success: false,
        message: "dueDate is required.",
      });
    }

    // Validate date format
    const parsedDate = new Date(dueDate);
    if (isNaN(parsedDate.getTime())) {
      return res.status(400).json({
        success: false,
        message: "Invalid dueDate format. Use YYYY-MM-DD.",
      });
    }

    // Format to YYYY-MM-DD for MySQL
    const dueDateStr = parsedDate.toISOString().slice(0, 10);

    // Fetch the billing record with user info
    const [rows] = await pool.execute(
      `SELECT b.*, u.email AS user_email, u.full_name AS user_full_name
       FROM billings b
       JOIN users u ON b.user_id = u.id
       WHERE b.id = ?`,
      [id],
    );

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Billing record not found.",
      });
    }

    const billing = rows[0];

    // Update the due date
    await pool.execute("UPDATE billings SET due_date = ? WHERE id = ?", [
      dueDateStr,
      id,
    ]);

    // Send due-date notification email to the user (non-blocking on failure)
    await sendBillingDueDateEmail(
      billing.user_email,
      billing.user_full_name,
      billing.room,
      dueDateStr,
      billing.balance,
    );

    return res.status(200).json({
      success: true,
      message: "Due date updated and user has been notified.",
      data: {
        billingId: parseInt(id),
        dueDate: dueDateStr,
      },
    });
  } catch (err) {
    console.error("[Billings] PUT /:id/due-date error:", err);
    return res.status(500).json({
      success: false,
      message: "An internal server error occurred.",
    });
  }
});

module.exports = router;
