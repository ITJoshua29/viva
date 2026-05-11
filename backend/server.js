require("dotenv").config();

const express = require("express");
const cors = require("cors");

// ─── Route modules ────────────────────────────────────────────────────────────
const authRouter = require("./routes/auth");
const usersRouter = require("./routes/users");
const reservationsRouter = require("./routes/reservations");
const servicesRouter = require("./routes/services");
const billingsRouter = require("./routes/billings");
const roomsRouter = require("./routes/rooms");

// ─── App ─────────────────────────────────────────────────────────────────────
const app = express();
const PORT = process.env.PORT || 3000;

// ─── Middleware ───────────────────────────────────────────────────────────────

// CORS — allow any localhost origin (Angular can start on any port)
const allowedOrigin = (origin, callback) => {
  if (!origin || /^http:\/\/localhost(:\d+)?$/.test(origin)) {
    return callback(null, true);
  }
  if (process.env.APP_URL && origin === process.env.APP_URL) {
    return callback(null, true);
  }
  callback(new Error("CORS: origin not allowed — " + origin));
};

app.use(
  cors({
    origin: allowedOrigin,
    credentials: true,
    allowedHeaders: ["Authorization", "Content-Type"],
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  }),
);

// Handle preflight OPTIONS requests
app.options("*", cors());

// Parse incoming JSON bodies
app.use(express.json({ limit: "10mb" })); // 10 mb limit supports base64 profile images

// ─── Health check ─────────────────────────────────────────────────────────────

app.get("/api/health", (req, res) => {
  res.status(200).json({
    success: true,
    message: "MaxViva Hotel API is running.",
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || "development",
  });
});

// ─── Routes ───────────────────────────────────────────────────────────────────

app.use("/api/auth", authRouter);
app.use("/api/users", usersRouter);
app.use("/api/reservations", reservationsRouter);
app.use("/api/services", servicesRouter);
app.use("/api/billings", billingsRouter);
app.use("/api/rooms", roomsRouter);

// ─── 404 handler ─────────────────────────────────────────────────────────────

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Route not found: ${req.method} ${req.originalUrl}`,
  });
});

// ─── Global error handler ─────────────────────────────────────────────────────

app.use((err, req, res, next) => {
  console.error("[Server] Unhandled error:", err);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || "An unexpected server error occurred.",
  });
});

// ─── Start ────────────────────────────────────────────────────────────────────

const server = app.listen(PORT, () => {
  console.log("╔══════════════════════════════════════════════╗");
  console.log("║         MaxViva Hotel — Backend API          ║");
  console.log("╚══════════════════════════════════════════════╝");
  console.log(`  ✅  Server running on http://localhost:${PORT}`);
  console.log(`  📡  CORS origin  : all localhost ports${process.env.APP_URL ? ' + ' + process.env.APP_URL : ''}`);
  console.log(`  🌍  Environment  : ${process.env.NODE_ENV || "development"}`);
  console.log("──────────────────────────────────────────────");
  console.log("  Available endpoints:");
  console.log("    GET  /api/health");
  console.log("    POST /api/auth/register");
  console.log("    POST /api/auth/login");
  console.log("    POST /api/auth/admin-login");
  console.log("    POST /api/auth/forgot-password");
  console.log("    POST /api/auth/reset-password");
  console.log("    GET  /api/auth/verify-token/:token");
  console.log("    GET  /api/users/me");
  console.log("    PUT  /api/users/me");
  console.log("    PUT  /api/users/me/password");
  console.log("    GET  /api/reservations");
  console.log("    GET  /api/reservations/rooms-status");
  console.log("    POST /api/reservations");
  console.log("    PUT  /api/reservations/:id/approve");
  console.log("    PUT  /api/reservations/:id/reject");
  console.log("    DEL  /api/reservations/:id");
  console.log("    GET  /api/services");
  console.log("    POST /api/services");
  console.log("    PUT  /api/services/:id/approve");
  console.log("    PUT  /api/services/:id/complete");
  console.log("    DEL  /api/services/:id");
  console.log("    GET  /api/billings");
  console.log("    POST /api/billings/:id/pay");
  console.log("    PUT  /api/billings/:id/due-date");
  console.log("    GET  /api/rooms/status");
  console.log("    PUT  /api/rooms/:room/maintenance");
  console.log("──────────────────────────────────────────────");
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(`\n❌  Port ${PORT} is already in use.`);
    console.error(`   Stop the other process first, then restart.\n`);
    process.exit(1);
  } else {
    throw err;
  }
});

module.exports = app;

