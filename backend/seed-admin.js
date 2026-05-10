/**
 * seed-admin.js
 * Run this once to insert the default admin user into the database.
 * Usage: node seed-admin.js
 */

require('dotenv').config();
const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');

const ADMIN_EMAIL    = 'admin@maxviva.com';
const ADMIN_PASSWORD = 'Admin@123';
const ADMIN_NAME     = 'MaxViva Admin';
const SALT_ROUNDS    = 10;

async function seedAdmin() {
  let connection;

  try {
    // Create a direct connection (not a pool) for this one-off script
    connection = await mysql.createConnection({
      host:     process.env.DB_HOST     || 'localhost',
      user:     process.env.DB_USER     || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME     || 'hotel_management',
    });

    console.log('[Seed] Connected to MySQL database.');

    // Hash the admin password
    console.log('[Seed] Hashing admin password...');
    const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, SALT_ROUNDS);

    // Insert admin user — INSERT IGNORE prevents duplicate errors if admin already exists
    const [result] = await connection.execute(
      `INSERT IGNORE INTO users
         (email, password_hash, full_name, role)
       VALUES (?, ?, ?, 'admin')`,
      [ADMIN_EMAIL, passwordHash, ADMIN_NAME]
    );

    if (result.affectedRows === 0) {
      console.log('[Seed] Admin user already exists — no changes made.');
    } else {
      console.log('[Seed] ✅ Admin user created successfully!');
      console.log(`       Email    : ${ADMIN_EMAIL}`);
      console.log(`       Password : ${ADMIN_PASSWORD}`);
      console.log(`       Role     : admin`);
    }
  } catch (err) {
    console.error('[Seed] ❌ Error seeding admin user:', err.message);
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
      console.log('[Seed] Database connection closed.');
    }
    process.exit(0);
  }
}

seedAdmin();
