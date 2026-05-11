const pool = require('./db');

async function resetBillings() {
  // Reset billings to have some Unpaid/Partial status for testing payments
  // Marianne (id=8): 4000 total, paid 0 → Unpaid
  await pool.execute(
    "UPDATE billings SET paid_amount = 0, balance = 4000, status = 'Unpaid' WHERE id = 8"
  );
  // Danica (id=9): 5500 total, paid 2000 → Partial
  await pool.execute(
    "UPDATE billings SET paid_amount = 2000, balance = 3500, status = 'Partial' WHERE id = 9"
  );
  // Joshua (id=5): 4500 total, paid 0 → Unpaid
  await pool.execute(
    "UPDATE billings SET paid_amount = 0, balance = 4500, status = 'Unpaid' WHERE id = 5"
  );
  // Joshua (id=6): 7000 total, paid 0 → Unpaid
  await pool.execute(
    "UPDATE billings SET paid_amount = 0, balance = 7000, status = 'Unpaid' WHERE id = 6"
  );
  // Joshua (id=7): leave as Paid for variety

  // Verify
  const [bills] = await pool.execute(
    'SELECT id, user_id, room, status, total_amount, paid_amount, balance FROM billings ORDER BY user_id, id'
  );
  console.log('=== BILLING RECORDS AFTER RESET ===');
  bills.forEach(b =>
    console.log(` id=${b.id} user_id=${b.user_id} ${b.room} | ${b.status} | total=₱${b.total_amount} | paid=₱${b.paid_amount} | balance=₱${b.balance}`)
  );
  process.exit(0);
}

resetBillings().catch(e => { console.error(e.message); process.exit(1); });
