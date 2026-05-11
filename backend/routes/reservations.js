const express = require("express");

const pool = require("../db");
const { authenticate, requireAdmin } = require("../middleware/auth");
const { sendApprovalEmail, sendRejectionEmail } = require("../utils/email");

const router = express.Router();

// ─── Room Pricing ─────────────────────────────────────────────────────────────
// Room 101 => 2500 + (1 * 500) = 3000
// Room 102 => 2500 + (2 * 500) = 3500  … and so on

function getRoomPrice(roomName) {
  const match = roomName.match(/\d+/);
  if (!match) return 3500;
  const num = parseInt(match[0]) - 100; // 101->1, 102->2, etc.
  return 2500 + num * 500;
}

// ─── All 12 rooms ─────────────────────────────────────────────────────────────

const ALL_ROOMS = Array.from({ length: 12 }, (_, i) => `Room ${101 + i}`);

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/reservations
// Admin: all reservations + user email
// User: own reservations only
// ─────────────────────────────────────────────────────────────────────────────
router.get("/", authenticate, async (req, res) => {
  try {
    let rows;

    if (req.user.role === "admin") {
      [rows] = await pool.execute(
        `SELECT r.*, u.email AS user_email, u.full_name AS user_full_name
         FROM reservations r
         JOIN users u ON r.user_id = u.id
         ORDER BY r.created_at DESC`,
      );
    } else {
      [rows] = await pool.execute(
        `SELECT r.*, u.email AS user_email, u.full_name AS user_full_name
         FROM reservations r
         JOIN users u ON r.user_id = u.id
         WHERE r.user_id = ?
         ORDER BY r.created_at DESC`,
        [req.user.id],
      );
    }

    return res.status(200).json({
      success: true,
      data: rows,
    });
  } catch (err) {
    console.error("[Reservations] GET / error:", err);
    return res.status(500).json({
      success: false,
      message: "An internal server error occurred.",
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/reservations/rooms-status
// Returns all 12 rooms with their current booking status
// ─────────────────────────────────────────────────────────────────────────────
router.get("/rooms-status", async (req, res) => {
  try {
    // Get maintenance statuses (graceful fallback if table doesn't exist yet)
    let maintMap = {};
    try {
      const [maintRows] = await pool.query(
        "SELECT room_number, maintenance_status, notes FROM room_statuses",
      );
      maintRows.forEach((r) => {
        maintMap[r.room_number] = r.maintenance_status;
      });
    } catch (_tableErr) {
      // room_statuses table not yet created — treat all as Available
    }

    // Get active reservations
    const [activeReservations] = await pool.execute(
      "SELECT room, status FROM reservations WHERE status IN ('Pending', 'Approved')",
    );
    const roomStatusMap = {};
    activeReservations.forEach((r) => {
      if (!roomStatusMap[r.room] || r.status === "Approved") {
        roomStatusMap[r.room] = r.status;
      }
    });

    const roomsStatus = ALL_ROOMS.map((room) => {
      let status = "Available";
      if (maintMap[room] === "Under Repair") {
        status = "Under Repair";
      } else if (roomStatusMap[room]) {
        status = "Occupied";
      }
      return {
        room,
        status,
        price: getRoomPrice(room),
        isBooked: Boolean(roomStatusMap[room]),
        isUnderRepair: maintMap[room] === "Under Repair",
      };
    });

    return res.status(200).json({ success: true, data: roomsStatus });
  } catch (err) {
    console.error("[Reservations] GET /rooms-status error:", err);
    return res.status(500).json({
      success: false,
      message: "An internal server error occurred.",
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/reservations
// Create a new reservation
// ─────────────────────────────────────────────────────────────────────────────
router.post("/", authenticate, async (req, res) => {
  try {
    const { guestName, room, checkIn, checkOut } = req.body;

    if (!guestName || !room || !checkIn || !checkOut) {
      return res.status(400).json({
        success: false,
        message: "guestName, room, checkIn, and checkOut are required.",
      });
    }

    // Validate dates
    const checkInDate = new Date(checkIn);
    const checkOutDate = new Date(checkOut);
    if (isNaN(checkInDate.getTime()) || isNaN(checkOutDate.getTime())) {
      return res.status(400).json({
        success: false,
        message: "Invalid checkIn or checkOut date format.",
      });
    }
    if (checkOutDate <= checkInDate) {
      return res.status(400).json({
        success: false,
        message: "checkOut date must be after checkIn date.",
      });
    }

    // Check if room already has a Pending or Approved reservation
    const [conflict] = await pool.execute(
      `SELECT id FROM reservations
       WHERE room = ? AND status IN ('Pending', 'Approved')`,
      [room],
    );

    if (conflict.length > 0) {
      return res.status(409).json({
        success: false,
        message: `Room "${room}" is already reserved or pending approval.`,
      });
    }

    // Format dates as YYYY-MM-DD for MySQL DATE columns
    const checkInStr = checkInDate.toISOString().slice(0, 10);
    const checkOutStr = checkOutDate.toISOString().slice(0, 10);

    const [result] = await pool.execute(
      `INSERT INTO reservations (user_id, guest_name, room, check_in, check_out, status)
       VALUES (?, ?, ?, ?, ?, 'Pending')`,
      [req.user.id, guestName, room, checkInStr, checkOutStr],
    );

    const [rows] = await pool.execute(
      "SELECT * FROM reservations WHERE id = ?",
      [result.insertId],
    );

    return res.status(201).json({
      success: true,
      message: "Reservation created successfully. Awaiting admin approval.",
      data: rows[0],
    });
  } catch (err) {
    console.error("[Reservations] POST / error:", err);
    return res.status(500).json({
      success: false,
      message: "An internal server error occurred.",
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/reservations/:id/approve   (admin only)
// ACID: Wrapped in a transaction — reservation update + billing insert are atomic
// ─────────────────────────────────────────────────────────────────────────────
router.put("/:id/approve", authenticate, requireAdmin, async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const { id } = req.params;

    // Lock the row to prevent concurrent approvals (Isolation)
    const [rows] = await conn.execute(
      `SELECT r.*, u.email AS user_email, u.full_name AS user_full_name
       FROM reservations r
       JOIN users u ON r.user_id = u.id
       WHERE r.id = ? FOR UPDATE`,
      [id],
    );

    if (rows.length === 0) {
      await conn.rollback();
      return res.status(404).json({ success: false, message: "Reservation not found." });
    }

    const reservation = rows[0];

    if (reservation.status === "Approved") {
      await conn.rollback();
      return res.status(400).json({ success: false, message: "Reservation is already approved." });
    }

    // 1) Update reservation status (Atomicity — part 1)
    await conn.execute(
      "UPDATE reservations SET status = 'Approved' WHERE id = ?",
      [id],
    );

    // 2) Create billing record only if one does not exist (Consistency)
    const totalAmount = getRoomPrice(reservation.room);
    const dueDate    = reservation.check_out;

    const [existingBilling] = await conn.execute(
      "SELECT id FROM billings WHERE reservation_id = ?",
      [id],
    );

    if (existingBilling.length === 0) {
      // Atomicity — part 2: billing insert is inside the same transaction
      await conn.execute(
        `INSERT INTO billings
           (reservation_id, user_id, guest_name, room, total_amount, paid_amount, balance, due_date, status)
         VALUES (?, ?, ?, ?, ?, 0, ?, ?, 'Unpaid')`,
        [id, reservation.user_id, reservation.guest_name, reservation.room, totalAmount, totalAmount, dueDate],
      );
    }

    // Commit — both writes are durable together (Durability)
    await conn.commit();

    // Email is sent AFTER commit so a mail failure never rolls back DB changes
    sendApprovalEmail(
      reservation.user_email,
      reservation.user_full_name,
      "reservation",
      {
        "Guest Name": reservation.guest_name,
        Room: reservation.room,
        "Check-in":  reservation.check_in,
        "Check-out": reservation.check_out,
        "Total Bill": `PHP ${totalAmount.toLocaleString()}`,
        "Due Date":  dueDate,
      },
    ).catch((emailErr) => console.error("[Reservations] Approval email failed:", emailErr.message));

    return res.status(200).json({
      success: true,
      message: "Reservation approved and billing record created.",
      data: { reservationId: parseInt(id), billingTotal: totalAmount, dueDate },
    });
  } catch (err) {
    await conn.rollback(); // Atomicity — undo all changes if any step fails
    console.error("[Reservations] PUT /:id/approve error:", err);
    return res.status(500).json({ success: false, message: "An internal server error occurred." });
  } finally {
    conn.release(); // Always return connection to pool
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/reservations/:id/reject   (admin only)
// Rejects a reservation
// ─────────────────────────────────────────────────────────────────────────────
router.put("/:id/reject", authenticate, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const [rows] = await pool.execute(
      `SELECT r.*, u.email AS user_email, u.full_name AS user_full_name
       FROM reservations r
       JOIN users u ON r.user_id = u.id
       WHERE r.id = ?`,
      [id],
    );

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Reservation not found.",
      });
    }

    const reservation = rows[0];

    if (reservation.status === "Rejected") {
      return res.status(400).json({
        success: false,
        message: "Reservation is already rejected.",
      });
    }

    // Update reservation status
    await pool.execute(
      "UPDATE reservations SET status = 'Rejected' WHERE id = ?",
      [id],
    );

    // Send rejection email (non-blocking on failure)
    await sendRejectionEmail(
      reservation.user_email,
      reservation.user_full_name,
      "reservation",
      {
        "Guest Name": reservation.guest_name,
        Room: reservation.room,
        "Check-in": reservation.check_in,
        "Check-out": reservation.check_out,
      },
    );

    return res.status(200).json({
      success: true,
      message: "Reservation rejected successfully.",
    });
  } catch (err) {
    console.error("[Reservations] PUT /:id/reject error:", err);
    return res.status(500).json({
      success: false,
      message: "An internal server error occurred.",
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/reservations/:id
// ACID: Wrapped in a transaction — billing delete + reservation delete are atomic
// ─────────────────────────────────────────────────────────────────────────────
router.delete("/:id", authenticate, async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const { id } = req.params;

    // Lock row to prevent concurrent deletes (Isolation)
    const [rows] = await conn.execute(
      "SELECT * FROM reservations WHERE id = ? FOR UPDATE",
      [id],
    );

    if (rows.length === 0) {
      await conn.rollback();
      return res.status(404).json({ success: false, message: "Reservation not found." });
    }

    const reservation = rows[0];

    if (req.user.role !== "admin" && reservation.user_id !== req.user.id) {
      await conn.rollback();
      return res.status(403).json({ success: false, message: "Forbidden. You do not have permission to delete this reservation." });
    }

    // 1) Delete associated billing (Atomicity — part 1)
    await conn.execute("DELETE FROM billings WHERE reservation_id = ?", [id]);

    // 2) Delete the reservation (Atomicity — part 2)
    await conn.execute("DELETE FROM reservations WHERE id = ?", [id]);

    // Both deletes committed together (Durability)
    await conn.commit();

    return res.status(200).json({ success: true, message: "Reservation deleted successfully." });
  } catch (err) {
    await conn.rollback(); // Atomicity — undo both deletes if either fails
    console.error("[Reservations] DELETE /:id error:", err);
    return res.status(500).json({ success: false, message: "An internal server error occurred." });
  } finally {
    conn.release();
  }
});

module.exports = router;
