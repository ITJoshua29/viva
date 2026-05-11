const pool = require('./db');

async function seed() {
  // Marianne (user_id=3) — Room 103
  const [r1] = await pool.execute(
    "INSERT INTO reservations (user_id, guest_name, room, check_in, check_out, status) VALUES (3, 'Marianne Achas', 'Room 103', '2026-05-10', '2026-05-15', 'Approved')"
  );
  await pool.execute(
    "INSERT INTO billings (reservation_id, user_id, guest_name, room, total_amount, paid_amount, balance, due_date, status) VALUES (?, 3, 'Marianne Achas', 'Room 103', 4000, 0, 4000, '2026-05-15', 'Unpaid')",
    [r1.insertId]
  );
  console.log('Marianne billing created — reservation_id:', r1.insertId);

  // Danica (user_id=4) — Room 106
  const [r2] = await pool.execute(
    "INSERT INTO reservations (user_id, guest_name, room, check_in, check_out, status) VALUES (4, 'Danicaacojedo123', 'Room 106', '2026-05-12', '2026-05-17', 'Approved')"
  );
  await pool.execute(
    "INSERT INTO billings (reservation_id, user_id, guest_name, room, total_amount, paid_amount, balance, due_date, status) VALUES (?, 4, 'Danicaacojedo123', 'Room 106', 5500, 0, 5500, '2026-05-17', 'Unpaid')",
    [r2.insertId]
  );
  console.log('Danica billing created — reservation_id:', r2.insertId);

  // Show all billings
  const [all] = await pool.execute('SELECT id, user_id, guest_name, room, status, total_amount FROM billings ORDER BY id');
  console.log('\nAll billings in DB:');
  all.forEach(b => console.log(` id=${b.id} user=${b.user_id} (${b.guest_name}) room=${b.room} status=${b.status} amount=${b.total_amount}`));

  process.exit(0);
}

seed().catch(e => { console.error('Seed error:', e.message); process.exit(1); });
