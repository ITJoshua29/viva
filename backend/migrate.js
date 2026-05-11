/**
 * migrate.js — One-time migration to fix:
 * 1. Add missing change_pw_token/hash/expires columns to users table
 * 2. Add 'Rejected' to service_requests.status ENUM
 */
require('dotenv').config();
const pool = require('./db');

async function run() {
  console.log('\n🔧  Running database migrations...\n');

  // ── 1. Add missing password-change columns to users ──────────────────────
  const pwCols = [
    ["change_pw_token",   "VARCHAR(255) DEFAULT NULL"],
    ["change_pw_hash",    "VARCHAR(255) DEFAULT NULL"],
    ["change_pw_expires", "BIGINT DEFAULT NULL"],
  ];

  for (const [col, def] of pwCols) {
    try {
      await pool.execute(`ALTER TABLE users ADD COLUMN ${col} ${def}`);
      console.log(`  ✅  Added users.${col}`);
    } catch (e) {
      if (e.code === 'ER_DUP_FIELDNAME') {
        console.log(`  ⏭️  users.${col} already exists — skipped`);
      } else {
        console.error(`  ❌  Error adding users.${col}:`, e.message);
      }
    }
  }

  // ── 2. Add 'Rejected' to service_requests.status ENUM ───────────────────
  try {
    await pool.execute(
      `ALTER TABLE service_requests MODIFY COLUMN status ENUM('Pending','Approved','Completed','Rejected') NOT NULL DEFAULT 'Pending'`
    );
    console.log(`  ✅  Added 'Rejected' to service_requests.status ENUM`);
  } catch (e) {
    console.error(`  ❌  Error modifying service_requests.status:`, e.message);
  }

  console.log('\n✅  Migration complete!\n');
  process.exit(0);
}

run().catch(e => {
  console.error('Migration failed:', e.message);
  process.exit(1);
});
