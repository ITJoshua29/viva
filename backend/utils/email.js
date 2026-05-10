require("dotenv").config();
const nodemailer = require("nodemailer");

// ─── Transporter ─────────────────────────────────────────────────────────────
// Uses Gmail App Password (NOT your regular Gmail password).
// Generate one at: https://myaccount.google.com/apppasswords
// Requires 2-Step Verification to be enabled on your Google Account.

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS, // 16-char App Password, no spaces
  },
});

// Verify transporter on startup (non-fatal)
transporter.verify((err) => {
  if (err) {
    console.error("[Email] ⚠️  Transporter verification failed:", err.message);
    console.error(
      "[Email] → Check EMAIL_USER and EMAIL_PASS in your .env file.",
    );
    console.error(
      "[Email] → Make sure you are using a Gmail App Password (not your regular password).",
    );
    console.error("[Email] → Guide: https://myaccount.google.com/apppasswords");
  } else {
    console.log(
      "[Email] ✅  Gmail transporter ready — emails will be delivered.",
    );
  }
});

// ─── Shared HTML layout ───────────────────────────────────────────────────────

function wrapInLayout(bodyContent) {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>MaxViva Hotel</title>
  <style>
    body  { margin:0; padding:0; background:#f4f6f9; font-family:'Segoe UI',Arial,sans-serif; color:#333; }
    .wrap { max-width:600px; margin:40px auto; background:#fff; border-radius:10px;
            box-shadow:0 4px 20px rgba(0,0,0,0.08); overflow:hidden; }
    .header { background:linear-gradient(135deg,#1a1a2e 0%,#16213e 60%,#0f3460 100%);
              padding:36px 40px; text-align:center; }
    .header h1 { margin:0; color:#e2b96f; font-size:28px; letter-spacing:2px; }
    .header p  { margin:6px 0 0; color:#c9d1e0; font-size:13px; letter-spacing:1px; }
    .body  { padding:36px 40px; }
    .body h2 { margin-top:0; color:#0f3460; font-size:20px; }
    .body p  { line-height:1.7; color:#555; font-size:15px; }
    .detail-box { background:#f8f9fc; border-left:4px solid #e2b96f; border-radius:6px;
                  padding:16px 20px; margin:20px 0; }
    .detail-box p { margin:6px 0; font-size:14px; color:#444; }
    .detail-box strong { color:#0f3460; }
    .btn { display:inline-block; margin:20px 0; padding:14px 32px; background:#e2b96f;
           color:#1a1a2e; font-weight:700; font-size:15px; text-decoration:none;
           border-radius:6px; letter-spacing:0.5px; }
    .footer { background:#f8f9fc; padding:20px 40px; text-align:center;
              border-top:1px solid #eee; }
    .footer p { margin:4px 0; font-size:12px; color:#999; }
    .footer a { color:#e2b96f; text-decoration:none; }
    .status-approved { color:#27ae60; font-weight:700; }
    .status-rejected { color:#e74c3c; font-weight:700; }
    .status-completed { color:#2980b9; font-weight:700; }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="header">
      <h1>MaxViva Hotel</h1>
      <p>Luxury &bull; Comfort &bull; Excellence</p>
    </div>
    <div class="body">
      ${bodyContent}
    </div>
    <div class="footer">
      <p>&copy; ${new Date().getFullYear()} MaxViva Hotel. All rights reserved.</p>
      <p>If you have questions, contact us at <a href="mailto:support@maxviva.com">support@maxviva.com</a></p>
    </div>
  </div>
</body>
</html>`;
}

// ─── Send helper ─────────────────────────────────────────────────────────────

async function sendMail({ to, subject, html }) {
  try {
    const info = await transporter.sendMail({
      from: process.env.EMAIL_FROM || "MaxViva Hotel <noreply@maxviva.com>",
      to,
      subject,
      html,
    });
    console.log(
      `[Email] Sent "${subject}" to ${to} — MessageId: ${info.messageId}`,
    );
    return info;
  } catch (err) {
    console.error(`[Email] Failed to send "${subject}" to ${to}:`, err.message);
    // Don't throw — email failure should not break the API flow
  }
}

// ─── Exported functions ───────────────────────────────────────────────────────

/**
 * Sends an approval notification email for a reservation or service request.
 * @param {string} to       - Recipient email address
 * @param {string} name     - Guest/user full name
 * @param {string} type     - 'reservation' | 'service request'
 * @param {object} details  - Extra detail fields { room, checkIn, checkOut, requestType, etc. }
 */
async function sendApprovalEmail(to, name, type, details) {
  const typeLabel = type.charAt(0).toUpperCase() + type.slice(1);
  const detailRows = Object.entries(details)
    .map(([k, v]) => `<p><strong>${k}:</strong> ${v}</p>`)
    .join("");

  const html = wrapInLayout(`
    <h2>Your ${typeLabel} Has Been <span class="status-approved">Approved</span>! 🎉</h2>
    <p>Dear <strong>${name}</strong>,</p>
    <p>
      We are pleased to inform you that your <strong>${type}</strong> at MaxViva Hotel
      has been <span class="status-approved">approved</span> by our team.
    </p>
    <div class="detail-box">
      <p><strong>Details:</strong></p>
      ${detailRows}
    </div>
    <p>
      Thank you for choosing MaxViva Hotel. We look forward to providing you with
      an exceptional experience. If you have any questions, please don't hesitate
      to contact our front desk.
    </p>
    <p>Warm regards,<br/><strong>MaxViva Hotel Management</strong></p>
  `);

  await sendMail({
    to,
    subject: `[MaxViva Hotel] Your ${typeLabel} Has Been Approved`,
    html,
  });
}

/**
 * Sends a rejection notification email for a reservation or service request.
 * @param {string} to       - Recipient email address
 * @param {string} name     - Guest/user full name
 * @param {string} type     - 'reservation' | 'service request'
 * @param {object} details  - Extra detail fields
 */
async function sendRejectionEmail(to, name, type, details) {
  const typeLabel = type.charAt(0).toUpperCase() + type.slice(1);
  const detailRows = Object.entries(details)
    .map(([k, v]) => `<p><strong>${k}:</strong> ${v}</p>`)
    .join("");

  const html = wrapInLayout(`
    <h2>Update on Your ${typeLabel}</h2>
    <p>Dear <strong>${name}</strong>,</p>
    <p>
      We regret to inform you that your <strong>${type}</strong> at MaxViva Hotel
      has been <span class="status-rejected">rejected</span> at this time.
    </p>
    <div class="detail-box">
      <p><strong>Details:</strong></p>
      ${detailRows}
    </div>
    <p>
      We apologise for any inconvenience caused. Please feel free to submit a new
      request or contact our front desk for alternative arrangements. We value your
      patronage and hope to serve you soon.
    </p>
    <p>Warm regards,<br/><strong>MaxViva Hotel Management</strong></p>
  `);

  await sendMail({
    to,
    subject: `[MaxViva Hotel] Your ${typeLabel} Has Been Rejected`,
    html,
  });
}

/**
 * Sends a service-request completion notification email.
 * @param {string} to       - Recipient email address
 * @param {string} name     - Guest/user full name
 * @param {object} details  - Extra detail fields { room, requestType, etc. }
 */
async function sendCompletionEmail(to, name, details) {
  const detailRows = Object.entries(details)
    .map(([k, v]) => `<p><strong>${k}:</strong> ${v}</p>`)
    .join("");

  const html = wrapInLayout(`
    <h2>Your Service Request Has Been <span class="status-completed">Completed</span>!</h2>
    <p>Dear <strong>${name}</strong>,</p>
    <p>
      We are happy to let you know that your service request at MaxViva Hotel
      has been <span class="status-completed">completed</span> by our staff.
    </p>
    <div class="detail-box">
      <p><strong>Details:</strong></p>
      ${detailRows}
    </div>
    <p>
      We hope everything met your expectations. Your comfort is our top priority.
      If there is anything else we can do for you, please let us know.
    </p>
    <p>Warm regards,<br/><strong>MaxViva Hotel Management</strong></p>
  `);

  await sendMail({
    to,
    subject: "[MaxViva Hotel] Your Service Request Has Been Completed",
    html,
  });
}

/**
 * Sends a password-reset link email.
 * @param {string} to        - Recipient email address
 * @param {string} resetLink - Full URL with token for password reset
 */
async function sendPasswordResetEmail(to, resetLink) {
  const html = wrapInLayout(`
    <h2>Password Reset Request</h2>
    <p>Hello,</p>
    <p>
      We received a request to reset the password for the MaxViva Hotel account
      associated with this email address. If you did not make this request,
      you can safely ignore this email.
    </p>
    <p>To reset your password, click the button below. This link will expire in <strong>1 hour</strong>.</p>
    <div style="text-align:center;">
      <a class="btn" href="${resetLink}">Reset My Password</a>
    </div>
    <p>Or copy and paste this link into your browser:</p>
    <div class="detail-box">
      <p style="word-break:break-all;font-size:13px;">${resetLink}</p>
    </div>
    <p>
      For security reasons, this link will expire in 1 hour. After that,
      you will need to submit a new password reset request.
    </p>
    <p>Warm regards,<br/><strong>MaxViva Hotel Security Team</strong></p>
  `);

  await sendMail({
    to,
    subject: "[MaxViva Hotel] Password Reset Request",
    html,
  });
}

/**
 * Sends a 2-step password-change verification email.
 * The user must click the link to confirm and apply the new password.
 *
 * @param {string} to          - Recipient email address
 * @param {string} name        - User's full name
 * @param {string} confirmLink - Full URL containing the one-time confirmation token
 */
async function sendPasswordChangeVerificationEmail(to, name, confirmLink) {
  const html = wrapInLayout(`
    <h2>Password Change Request</h2>
    <p>Dear <strong>${name}</strong>,</p>
    <p>
      We received a request to change the password for your MaxViva Hotel account.
      If this was you, click the button below to confirm.
      This link expires in <strong>1 hour</strong>.
    </p>
    <div style="text-align:center;">
      <a class="btn"
         href="${confirmLink}"
         style="background:#e2b96f;color:#1a1a2e;display:inline-block;
                padding:14px 32px;font-weight:700;font-size:15px;
                text-decoration:none;border-radius:6px;letter-spacing:0.5px;
                margin:20px 0;">
        ✅ Yes, It&rsquo;s Me &mdash; Confirm Change
      </a>
    </div>
    <p style="color:#555;font-size:14px;">
      If you did <strong>NOT</strong> request this change, please ignore this email.
      Your password will remain unchanged.
    </p>
    <p style="color:#e74c3c;font-weight:600;font-size:14px;">
      ⚠️ Do not share this link with anyone.
    </p>
    <p>Warm regards,<br/><strong>MaxViva Hotel Security Team</strong></p>
  `);

  await sendMail({
    to,
    subject: "[MaxViva Hotel] Confirm Your Password Change",
    html,
  });
}

/**
 * Sends a billing due-date notification email.
 * @param {string} to      - Recipient email address
 * @param {string} name    - Guest/user full name
 * @param {string} room    - Room identifier (e.g. "Room 101")
 * @param {string} dueDate - Due date string (YYYY-MM-DD or human-readable)
 * @param {number} amount  - Outstanding balance amount
 */
async function sendBillingDueDateEmail(to, name, room, dueDate, amount) {
  const formattedAmount = parseFloat(amount).toLocaleString("en-PH", {
    style: "currency",
    currency: "PHP",
  });

  const html = wrapInLayout(`
    <h2>Billing Due Date Notification</h2>
    <p>Dear <strong>${name}</strong>,</p>
    <p>
      This is a reminder that a payment is due for your stay at MaxViva Hotel.
      Please review the billing details below and arrange payment before the due date
      to avoid any late charges.
    </p>
    <div class="detail-box">
      <p><strong>Room:</strong> ${room}</p>
      <p><strong>Outstanding Balance:</strong> ${formattedAmount}</p>
      <p><strong>Due Date:</strong> ${dueDate}</p>
    </div>
    <p>
      You can make your payment at the front desk or through our online portal.
      If you have already made a payment, please disregard this message.
    </p>
    <p>
      Thank you for your prompt attention to this matter.
    </p>
    <p>Warm regards,<br/><strong>MaxViva Hotel Billing Department</strong></p>
  `);

  await sendMail({
    to,
    subject: "[MaxViva Hotel] Billing Due Date Reminder",
    html,
  });
}

/**
 * Sends a payment receipt email after admin or user processes a payment.
 * @param {string} to          - Recipient email
 * @param {string} name        - Guest full name
 * @param {string} room        - Room identifier
 * @param {string} paymentType - 'partial' | 'full'
 * @param {number} paidAmount  - Amount just paid in this transaction
 * @param {number} balance     - Remaining balance after payment
 * @param {string} newStatus   - New billing status (Partial / Paid)
 */
async function sendPaymentReceiptEmail(
  to,
  name,
  room,
  paymentType,
  paidAmount,
  balance,
  newStatus,
) {
  const formattedPaid = parseFloat(paidAmount).toLocaleString("en-PH", {
    style: "currency",
    currency: "PHP",
  });
  const formattedBalance = parseFloat(balance).toLocaleString("en-PH", {
    style: "currency",
    currency: "PHP",
  });
  const isPaid = newStatus === "Paid";

  const html = wrapInLayout(`
    <h2>Payment ${isPaid ? '<span class="status-approved">Received — Fully Paid</span>' : 'Received — <span class="status-completed">Partial Payment</span>'}</h2>
    <p>Dear <strong>${name}</strong>,</p>
    <p>
      We have recorded a <strong>${paymentType === "full" ? "full" : "partial"} payment</strong>
      for your stay at MaxViva Hotel. Here are the details:
    </p>
    <div class="detail-box">
      <p><strong>Room:</strong> ${room}</p>
      <p><strong>Amount Paid:</strong> ${formattedPaid}</p>
      <p><strong>Remaining Balance:</strong> ${formattedBalance}</p>
      <p><strong>Payment Status:</strong> ${newStatus}</p>
    </div>
    ${
      isPaid
        ? '<p style="color:#27ae60;font-weight:700;">✅ Your account is fully settled. Thank you!</p>'
        : `<p>Please note that a remaining balance of <strong>${formattedBalance}</strong> is still outstanding. Kindly settle it before your check-out date.</p>`
    }
    <p>Warm regards,<br/><strong>MaxViva Hotel Billing Department</strong></p>
  `);

  await sendMail({
    to,
    subject: `[MaxViva Hotel] Payment Receipt — ${newStatus}`,
    html,
  });
}

module.exports = {
  sendApprovalEmail,
  sendRejectionEmail,
  sendCompletionEmail,
  sendPasswordResetEmail,
  sendPasswordChangeVerificationEmail,
  sendBillingDueDateEmail,
  sendPaymentReceiptEmail,
};
