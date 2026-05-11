/**
 * migrate2.js — Fix missing DB structures:
 * 1. Create room_statuses table
 * 2. Add 'Cancelled' to reservations.status ENUM
 */
require('dotenv').config();
const pool = require('./db');

async function run() {
  console.log('\n🔧  Running migration 2...\n');

  // ── 1. Create room_statuses table ─────────────────────────────────────
  try {
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS room_statuses (
        room_number        VARCHAR(50) NOT NULL PRIMARY KEY,
        maintenance_status ENUM('Available','Under Repair') NOT NULL DEFAULT 'Available',
        notes              TEXT DEFAULT NULL,
        updated_at         TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('  ✅  Created room_statuses table');
  } catch (e) {
    console.error('  ❌  room_statuses:', e.message);
  }

  // ── 2. Add 'Cancelled' to reservations.status ENUM ───────────────────
  try {
    await pool.execute(
      `ALTER TABLE reservations MODIFY COLUMN status ENUM('Pending','Approved','Rejected','Cancelled') NOT NULL DEFAULT 'Pending'`
    );
    console.log("  ✅  Added 'Cancelled' to reservations.status ENUM");
  } catch (e) {
    console.error('  ❌  reservations.status:', e.message);
  }

  // ── 3. Verify ─────────────────────────────────────────────────────────
  try {
    const [r] = await pool.query('SELECT COUNT(*) as c FROM room_statuses');
    console.log('  ✔   room_statuses row count:', r[0].c);
  } catch (e) {
    console.error('  ❌  Verify failed:', e.message);
  }

  try {
    const [r] = await pool.query("SHOW COLUMNS FROM reservations WHERE Field = 'status'");
    console.log('  ✔   reservations.status ENUM:', r[0].Type);
  } catch (e) {
    console.error('  ❌  Verify failed:', e.message);
  }

  console.log('\n✅  Migration 2 complete!\n');
  process.exit(0);
}

run().catch(e => {
  console.error('Migration failed:', e.message);
  process.exit(1);
});
