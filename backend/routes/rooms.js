const express = require('express');
const pool = require('../db');
const { authenticate, requireAdmin } = require('../middleware/auth');

const router = express.Router();

const ALL_ROOMS = Array.from({ length: 12 }, (_, i) => `Room ${101 + i}`);

function getRoomPrice(roomName) {
  const match = roomName.match(/\d+/);
  if (!match) return 3500;
  const num = parseInt(match[0]) - 100;
  return 2500 + (num * 500);
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/rooms/status
// Returns all 12 rooms with combined status:
//   Priority: Under Repair > Occupied (Pending/Approved reservation) > Available
// ─────────────────────────────────────────────────────────────────────────────
router.get('/status', async (req, res) => {
  try {
    // 1. Get maintenance statuses
    const [maintRows] = await pool.query(
      'SELECT room_number, maintenance_status, notes FROM room_statuses'
    );
    const maintMap = {};
    maintRows.forEach(r => { maintMap[r.room_number] = { status: r.maintenance_status, notes: r.notes }; });

    // 2. Get active reservations
    const [resRows] = await pool.query(
      "SELECT room FROM reservations WHERE status IN ('Pending','Approved')"
    );
    const occupiedRooms = new Set(resRows.map(r => r.room));

    // 3. Build combined status
    const roomsStatus = ALL_ROOMS.map(room => {
      let status = 'Available';
      const maint = maintMap[room];
      if (maint && maint.status === 'Under Repair') {
        status = 'Under Repair';
      } else if (occupiedRooms.has(room)) {
        status = 'Occupied';
      }
      return {
        room,
        status,
        price: getRoomPrice(room),
        notes: (maint && maint.notes) || null,
        isBooked: occupiedRooms.has(room),
        isUnderRepair: maint?.status === 'Under Repair',
      };
    });

    return res.status(200).json({ success: true, data: roomsStatus });
  } catch (err) {
    console.error('[Rooms] GET /status error:', err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/rooms/:room/maintenance   (admin only)
// Body: { maintenanceStatus: 'Available' | 'Under Repair', notes: '' }
// ─────────────────────────────────────────────────────────────────────────────
router.put('/:room/maintenance', authenticate, requireAdmin, async (req, res) => {
  try {
    const room = decodeURIComponent(req.params.room);
    const { maintenanceStatus, notes } = req.body;

    if (!['Available', 'Under Repair'].includes(maintenanceStatus)) {
      return res.status(400).json({
        success: false,
        message: 'maintenanceStatus must be "Available" or "Under Repair".',
      });
    }

    // Upsert — insert or update on duplicate room_number
    await pool.query(
      `INSERT INTO room_statuses (room_number, maintenance_status, notes)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE maintenance_status = VALUES(maintenance_status), notes = VALUES(notes)`,
      [room, maintenanceStatus, notes || null]
    );

    return res.status(200).json({
      success: true,
      message: `Room ${room} status updated to "${maintenanceStatus}".`,
      data: { room, maintenanceStatus, notes: notes || null },
    });
  } catch (err) {
    console.error('[Rooms] PUT /:room/maintenance error:', err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/rooms/:room/checkout   (admin only)
// Force-marks an Occupied room as Available by cancelling its active reservation.
// Used when a guest has physically checked out and admin needs to free the room.
// ─────────────────────────────────────────────────────────────────────────────
router.put('/:room/checkout', authenticate, requireAdmin, async (req, res) => {
  try {
    const room = decodeURIComponent(req.params.room);

    // Find active reservation(s) for this room
    const [activeRes] = await pool.query(
      `SELECT id FROM reservations
       WHERE room = ? AND status IN ('Pending', 'Approved')`,
      [room]
    );

    if (activeRes.length === 0) {
      return res.status(400).json({
        success: false,
        message: `Room "${room}" has no active reservation to clear.`,
      });
    }

    // Cancel all active reservations for this room
    const ids = activeRes.map(r => r.id);
    await pool.query(
      `UPDATE reservations SET status = 'Cancelled' WHERE id IN (?)`,
      [ids]
    );

    // Also delete associated billing records to keep things clean
    await pool.query(
      `DELETE FROM billings WHERE reservation_id IN (?)`,
      [ids]
    );

    return res.status(200).json({
      success: true,
      message: `Room "${room}" has been marked as Available. ${ids.length} reservation(s) cancelled.`,
      data: { room, cancelledReservations: ids.length },
    });
  } catch (err) {
    console.error('[Rooms] PUT /:room/checkout error:', err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
});

module.exports = router;
