require('dotenv').config();
const pool = require('./db');

(async () => {
  // Check room_statuses table
  try {
    const [r] = await pool.query('SELECT COUNT(*) as c FROM room_statuses');
    console.log('room_statuses EXISTS, rows:', r[0].c);
  } catch(e) {
    console.log('room_statuses MISSING:', e.message);
  }

  // Check reservations.status ENUM
  try {
    const [r] = await pool.query("SHOW COLUMNS FROM reservations WHERE Field = 'status'");
    console.log('reservations.status type:', r[0].Type);
  } catch(e) {
    console.log('reservations error:', e.message);
  }

  // Check rooms/status API response
  try {
    const [maint] = await pool.query('SELECT * FROM room_statuses LIMIT 5');
    console.log('room_statuses sample:', maint);
  } catch(e) {
    console.log('Cannot read room_statuses:', e.message);
  }

  process.exit(0);
})();
