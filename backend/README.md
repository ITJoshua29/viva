# MaxViva Hotel — Backend API

Node.js + Express + MySQL2 backend for the MaxViva Hotel Management System.

---

## Quick Start

### Step 1 — Install MySQL
Make sure MySQL is installed and running on your machine.
- Download: https://dev.mysql.com/downloads/installer/
- Default host: `localhost`, default port: `3306`

### Step 2 — Create the Database
Open MySQL Workbench (or any MySQL client) and run:
```
source C:/Users/user/OneDrive/Desktop/HOTEL1/backend/schema.sql
```
Or paste the contents of `schema.sql` directly.

### Step 3 — Configure `.env`
Edit `HOTEL1/backend/.env` with your actual values:
```
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_mysql_password_here
DB_NAME=hotel_management
PORT=3000
JWT_SECRET=hotel_maxviva_jwt_secret_2024
JWT_EXPIRES_IN=7d

EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your_gmail@gmail.com
EMAIL_PASS=your_gmail_app_password
EMAIL_FROM=MaxViva Hotel <your_gmail@gmail.com>

APP_URL=http://localhost:4200
```

> **Gmail App Password**: Go to Google Account → Security → 2-Step Verification → App Passwords → Generate one for "Mail".

### Step 4 — Seed the Admin User
```bash
cd HOTEL1/backend
node seed-admin.js
```
This creates: `admin@maxviva.com` / `Admin@123`

### Step 5 — Start the Backend
```bash
# Production
npm start

# Development (auto-restart on changes)
npm run dev
```

The server runs at: **http://localhost:3000**

### Step 6 — Start the Angular Frontend
```bash
cd HOTEL1/Hotel-Management
npm start
```

The frontend runs at: **http://localhost:4200**

---

## API Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | /api/auth/register | No | Register new user |
| POST | /api/auth/login | No | User login |
| POST | /api/auth/admin-login | No | Admin login |
| POST | /api/auth/forgot-password | No | Send reset email |
| POST | /api/auth/reset-password | No | Reset password with token |
| GET | /api/auth/verify-token/:token | No | Verify reset token |
| GET | /api/users/me | User | Get profile |
| PUT | /api/users/me | User | Update profile |
| PUT | /api/users/me/password | User | Change password |
| GET | /api/reservations | User | Get reservations |
| GET | /api/reservations/rooms-status | Any | Get room availability |
| POST | /api/reservations | User | Create reservation |
| PUT | /api/reservations/:id/approve | Admin | Approve + create billing |
| PUT | /api/reservations/:id/reject | Admin | Reject reservation |
| DELETE | /api/reservations/:id | Owner/Admin | Cancel reservation |
| GET | /api/services | User | Get service requests |
| POST | /api/services | User | Create service request |
| PUT | /api/services/:id/approve | Admin | Approve request |
| PUT | /api/services/:id/complete | Admin | Mark complete |
| DELETE | /api/services/:id | Owner/Admin | Cancel request |
| GET | /api/billings | User | Get billings |
| POST | /api/billings/:id/pay | User | Pay (partial/full) |
| PUT | /api/billings/:id/due-date | Admin | Set due date + notify |

---

## Default Admin Credentials
- **Email**: admin@maxviva.com
- **Password**: Admin@123

---

## Email Notifications Sent
- Reservation Approved → email to user
- Reservation Rejected → email to user
- Service Request Approved → email to user
- Service Request Completed → email to user
- Billing Due Date Set → email to user
- Forgot Password → reset link email
