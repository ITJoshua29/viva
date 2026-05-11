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
    // Fire-and-forget — don't block the response waiting for overdue sync
    syncOverdueStatuses().catch(() => {});

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
// ACID: SELECT FOR UPDATE prevents race conditions on concurrent payments
// Body: { paymentType: 'partial' | 'full', amount?: number, paymentMethod?: 'gcash' | 'cash' }
// ─────────────────────────────────────────────────────────────────────────────
router.post("/:id/pay", authenticate, async (req, res) => {
  const { id } = req.params;
  const { paymentType, paymentMethod, amount } = req.body;

  if (!paymentType || !["partial", "full"].includes(paymentType)) {
    return res.status(400).json({ success: false, message: 'paymentType must be "partial" or "full".' });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // Lock billing row — prevents two simultaneous payments (Isolation)
    const [rows] = await conn.execute(
      "SELECT * FROM billings WHERE id = ? FOR UPDATE",
      [id],
    );

    if (rows.length === 0) {
      await conn.rollback();
      return res.status(404).json({ success: false, message: "Billing record not found." });
    }

    const billing = rows[0];

    if (req.user.role !== "admin" && billing.user_id !== req.user.id) {
      await conn.rollback();
      return res.status(403).json({ success: false, message: "Forbidden. You do not have permission to pay this billing." });
    }

    if (billing.status === "Paid") {
      await conn.rollback();
      return res.status(400).json({ success: false, message: "This billing has already been fully paid." });
    }

    // ── Calculate amounts (Consistency) ──────────────────────────────────────
    const totalAmount    = parseFloat(billing.total_amount);
    let   paidAmount     = parseFloat(billing.paid_amount);
    const currentBalance = parseFloat(billing.balance);
    let   balance, newStatus;

    if (paymentType === "full") {
      paidAmount = totalAmount;
      balance    = 0;
      newStatus  = "Paid";
    } else {
      let partialPayment;
      if (amount && !isNaN(parseFloat(amount))) {
        partialPayment = parseFloat(amount);
        if (partialPayment <= 0) {
          await conn.rollback();
          return res.status(400).json({ success: false, message: "Payment amount must be greater than zero." });
        }
        if (partialPayment > currentBalance) {
          await conn.rollback();
          return res.status(400).json({
            success: false,
            message: `Amount (${partialPayment.toFixed(2)}) cannot exceed balance (${currentBalance.toFixed(2)}).`,
          });
        }
      } else {
        partialPayment = totalAmount / 2;
      }
      paidAmount = Math.min(paidAmount + partialPayment, totalAmount);
      balance    = totalAmount - paidAmount;
      newStatus  = balance <= 0 ? (balance = 0, "Paid") : "Partial";
    }

    // ── Persist payment (Atomicity) ───────────────────────────────────────────
    await conn.execute(
      "UPDATE billings SET paid_amount = ?, balance = ?, status = ? WHERE id = ?",
      [paidAmount.toFixed(2), balance.toFixed(2), newStatus, id],
    );

    // Commit — changes are durable (Durability)
    await conn.commit();

    // Fetch updated record after commit
    const [updatedRows] = await pool.execute(
      `SELECT b.*, u.email AS user_email, u.full_name AS user_full_name
       FROM billings b JOIN users u ON b.user_id = u.id WHERE b.id = ?`,
      [id],
    );
    const updated = updatedRows[0];

    // Email sent AFTER commit — failure never rolls back the payment
    sendPaymentReceiptEmail(
      updated.user_email, updated.user_full_name, updated.room,
      paymentType, paidAmount.toFixed(2), balance.toFixed(2), newStatus,
    ).catch((e) => console.error("[Billings] Receipt email failed:", e.message));

    return res.status(200).json({
      success: true,
      message: `Payment processed via ${paymentMethod || "cash"}. Status: ${newStatus}.`,
      data: updated,
      paymentMethod: paymentMethod || "cash",
    });
  } catch (err) {
    await conn.rollback(); // Atomicity — undo if anything fails
    console.error("[Billings] POST /:id/pay error:", err);
    return res.status(500).json({ success: false, message: "An internal server error occurred." });
  } finally {
    conn.release();
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
