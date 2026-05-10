require('dotenv').config();
const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'hotel_management',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  timezone: '+00:00',
});

// Test connection on startup
pool.getConnection()
  .then((conn) => {
    console.log('[DB] MySQL connection pool established successfully.');
    conn.release();
  })
  .catch((err) => {
    console.error('[DB] Failed to connect to MySQL:', err.message);
    process.exit(1);
  });

module.exports = pool;
