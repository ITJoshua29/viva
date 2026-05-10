-- ============================================================
-- Hotel Management System - Database Schema
-- MaxViva Hotel
-- ============================================================

-- Create and use the database
CREATE DATABASE IF NOT EXISTS hotel_management
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE hotel_management;

-- ============================================================
-- TABLE: users
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
  id               INT AUTO_INCREMENT PRIMARY KEY,
  email            VARCHAR(255) NOT NULL UNIQUE,
  password_hash    VARCHAR(255) NOT NULL,
  full_name        VARCHAR(255) NOT NULL,
  age              INT,
  sex              VARCHAR(20),
  country          VARCHAR(100),
  occupation       VARCHAR(100),
  phone_number     VARCHAR(30),
  profile_image    TEXT,
  role             ENUM('user', 'admin') NOT NULL DEFAULT 'user',
  reset_token      VARCHAR(255) DEFAULT NULL,
  reset_expires    BIGINT DEFAULT NULL,
  created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- TABLE: reservations
-- ============================================================
CREATE TABLE IF NOT EXISTS reservations (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  user_id      INT NOT NULL,
  guest_name   VARCHAR(255) NOT NULL,
  room         VARCHAR(50) NOT NULL,
  check_in     DATE NOT NULL,
  check_out    DATE NOT NULL,
  status       ENUM('Pending', 'Approved', 'Rejected') NOT NULL DEFAULT 'Pending',
  created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_reservations_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- TABLE: service_requests
-- ============================================================
CREATE TABLE IF NOT EXISTS service_requests (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  user_id       INT NOT NULL,
  room          VARCHAR(50) NOT NULL,
  request_type  VARCHAR(100) NOT NULL,
  details       TEXT,
  status        ENUM('Pending', 'Approved', 'Completed') NOT NULL DEFAULT 'Pending',
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_service_requests_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- TABLE: billings
-- ============================================================
CREATE TABLE IF NOT EXISTS billings (
  id               INT AUTO_INCREMENT PRIMARY KEY,
  reservation_id   INT DEFAULT NULL,
  user_id          INT NOT NULL,
  guest_name       VARCHAR(255) NOT NULL,
  room             VARCHAR(50) NOT NULL,
  total_amount     DECIMAL(10, 2) NOT NULL,
  paid_amount      DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  balance          DECIMAL(10, 2) NOT NULL,
  due_date         DATE,
  status           ENUM('Unpaid', 'Partial', 'Paid', 'Overdue') NOT NULL DEFAULT 'Unpaid',
  created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_billings_reservation
    FOREIGN KEY (reservation_id) REFERENCES reservations(id) ON DELETE SET NULL,
  CONSTRAINT fk_billings_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- Indexes for performance
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_reservations_user_id  ON reservations(user_id);
CREATE INDEX IF NOT EXISTS idx_reservations_room      ON reservations(room);
CREATE INDEX IF NOT EXISTS idx_service_requests_user  ON service_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_billings_user_id       ON billings(user_id);
CREATE INDEX IF NOT EXISTS idx_billings_reservation   ON billings(reservation_id);
CREATE INDEX IF NOT EXISTS idx_users_reset_token      ON users(reset_token);

-- ============================================================
-- Default Admin User
-- NOTE: The password_hash below is a placeholder.
-- Run `node seed-admin.js` to insert the properly hashed admin
-- user into the database before starting the application.
-- Credentials: email=admin@maxviva.com, password=Admin@123
-- ============================================================
-- INSERT IGNORE INTO users (email, password_hash, full_name, role)
-- VALUES ('admin@maxviva.com', '<run seed-admin.js>', 'MaxViva Admin', 'admin');
