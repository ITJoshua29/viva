/**
 * setup.js
 * Run this ONCE before starting the server.
 * Creates the database, all tables, and seeds the admin user.
 *
 * Usage: node setup.js
 */

require("dotenv").config();
const mysql = require("mysql2/promise");
const bcrypt = require("bcrypt");

async function setup() {
  let connection;

  try {
    console.log("");
    console.log("╔══════════════════════════════════════════╗");
    console.log("║    MaxViva Hotel — Database Setup         ║");
    console.log("╚══════════════════════════════════════════╝");
    console.log("");

    // Connect WITHOUT specifying a database first
    connection = await mysql.createConnection({
      host: process.env.DB_HOST || "localhost",
      user: process.env.DB_USER || "root",
      password: process.env.DB_PASSWORD || "",
    });

    console.log("✅  Connected to MySQL server.");

    // ── Step 1: Create & select database ────────────────────────────────────
    await connection.query(
      "CREATE DATABASE IF NOT EXISTS hotel_management CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci",
    );
    await connection.query("USE hotel_management");
    console.log('✅  Database "hotel_management" ready.');

    // ── Step 2: Create tables ────────────────────────────────────────────────
    await connection.query(`
      CREATE TABLE IF NOT EXISTS users (
        id            INT AUTO_INCREMENT PRIMARY KEY,
        email         VARCHAR(255) NOT NULL UNIQUE,
        password_hash VARCHAR(255) NOT NULL,
        full_name     VARCHAR(255) NOT NULL,
        age           INT,
        sex           VARCHAR(20),
        country       VARCHAR(100),
        occupation    VARCHAR(100),
        phone_number  VARCHAR(30),
        profile_image TEXT,
        role          ENUM('user','admin') NOT NULL DEFAULT 'user',
        reset_token   VARCHAR(255) DEFAULT NULL,
        reset_expires BIGINT DEFAULT NULL,
        created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('✅  Table "users" ready.');

    await connection.query(`
      CREATE TABLE IF NOT EXISTS reservations (
        id          INT AUTO_INCREMENT PRIMARY KEY,
        user_id     INT NOT NULL,
        guest_name  VARCHAR(255) NOT NULL,
        room        VARCHAR(50)  NOT NULL,
        check_in    DATE NOT NULL,
        check_out   DATE NOT NULL,
        status      ENUM('Pending','Approved','Rejected') NOT NULL DEFAULT 'Pending',
        created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_res_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('✅  Table "reservations" ready.');

    await connection.query(`
      CREATE TABLE IF NOT EXISTS service_requests (
        id           INT AUTO_INCREMENT PRIMARY KEY,
        user_id      INT NOT NULL,
        room         VARCHAR(50)  NOT NULL,
        request_type VARCHAR(100) NOT NULL,
        details      TEXT,
        status       ENUM('Pending','Approved','Completed') NOT NULL DEFAULT 'Pending',
        created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_sr_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('✅  Table "service_requests" ready.');

    await connection.query(`
      CREATE TABLE IF NOT EXISTS billings (
        id             INT AUTO_INCREMENT PRIMARY KEY,
        reservation_id INT DEFAULT NULL,
        user_id        INT NOT NULL,
        guest_name     VARCHAR(255) NOT NULL,
        room           VARCHAR(50)  NOT NULL,
        total_amount   DECIMAL(10,2) NOT NULL,
        paid_amount    DECIMAL(10,2) NOT NULL DEFAULT 0.00,
        balance        DECIMAL(10,2) NOT NULL,
        due_date       DATE,
        status         ENUM('Unpaid','Partial','Paid','Overdue') NOT NULL DEFAULT 'Unpaid',
        created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_bill_res  FOREIGN KEY (reservation_id) REFERENCES reservations(id) ON DELETE SET NULL,
        CONSTRAINT fk_bill_user FOREIGN KEY (user_id)        REFERENCES users(id)        ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('✅  Table "billings" ready.');

    await connection.query(`
      CREATE TABLE IF NOT EXISTS room_statuses (
        id                  INT AUTO_INCREMENT PRIMARY KEY,
        room_number         VARCHAR(50)  NOT NULL UNIQUE,
        maintenance_status  ENUM('Available','Under Repair') NOT NULL DEFAULT 'Available',
        notes               TEXT,
        updated_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('✅  Table "room_statuses" ready.');

    // Seed all 12 rooms (INSERT IGNORE so re-runs are safe)
    for (let i = 101; i <= 112; i++) {
      await connection.query(
        `INSERT IGNORE INTO room_statuses (room_number, maintenance_status) VALUES (?, 'Available')`,
        [`Room ${i}`],
      );
    }
    console.log("✅  Room statuses seeded (12 rooms).");

    // ── Step 2b: Add password-change verification columns (safe to re-run) ─────
    try {
      await connection.query(
        `ALTER TABLE users ADD COLUMN IF NOT EXISTS change_pw_token   VARCHAR(255) DEFAULT NULL`,
      );
      await connection.query(
        `ALTER TABLE users ADD COLUMN IF NOT EXISTS change_pw_hash    VARCHAR(500) DEFAULT NULL`,
      );
      await connection.query(
        `ALTER TABLE users ADD COLUMN IF NOT EXISTS change_pw_expires BIGINT       DEFAULT NULL`,
      );
      console.log('✅  Password-change columns ready on "users".');
    } catch (e) {
      // Some MySQL versions don't support IF NOT EXISTS for ALTER TABLE —
      // swallow the error; columns already exist.
      console.log("ℹ️   Password-change columns already exist (skipped).");
    }

    // ── Step 3: Seed admin user ──────────────────────────────────────────────
    const ADMIN_EMAIL = "admin@maxviva.com";
    const ADMIN_PASSWORD = "Admin@123";
    const ADMIN_NAME = "MaxViva Admin";

    const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 10);

    const [result] = await connection.query(
      `INSERT IGNORE INTO users (email, password_hash, full_name, role)
       VALUES (?, ?, ?, 'admin')`,
      [ADMIN_EMAIL, passwordHash, ADMIN_NAME],
    );

    if (result.affectedRows === 0) {
      console.log("ℹ️   Admin user already exists — skipped.");
    } else {
      console.log("✅  Admin user created:");
      console.log(`       Email    : ${ADMIN_EMAIL}`);
      console.log(`       Password : ${ADMIN_PASSWORD}`);
    }

    console.log("");
    console.log("🎉  Setup complete! Now run:  npm start");
    console.log("");
  } catch (err) {
    console.error("");
    console.error("❌  Setup failed:", err.message);
    console.error("");
    console.error("Common fixes:");
    console.error("  • Set the correct DB_PASSWORD in your .env file");
    console.error("  • Make sure MySQL is running");
    console.error('  • Windows: open Services → start "MySQL80" or "MySQL"');
    console.error("");
    process.exit(1);
  } finally {
    if (connection) await connection.end();
  }
}

setup();
