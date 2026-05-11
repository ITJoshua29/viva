const pool = require('./db');
async function run() {
  try {
    await pool.execute(
      'ALTER TABLE service_requests ADD COLUMN rejection_reason TEXT NULL DEFAULT NULL AFTER details'
    );
    console.log('Done: rejection_reason column added');
  } catch (e) {
    if (e.code === 'ER_DUP_FIELDNAME') {
      console.log('Column already exists — skipping');
    } else {
      throw e;
    }
  }
  process.exit(0);
}
run().catch(e => { console.error(e.message); process.exit(1); });
