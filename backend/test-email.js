/**
 * test-email.js
 * Run this to verify your Gmail App Password is working.
 * Usage:  node test-email.js
 */

require('dotenv').config();
const nodemailer = require('nodemailer');

const EMAIL_USER = process.env.EMAIL_USER;
const EMAIL_PASS = process.env.EMAIL_PASS;

if (!EMAIL_USER || !EMAIL_PASS) {
  console.error('\n❌  EMAIL_USER or EMAIL_PASS is missing in your .env file.\n');
  process.exit(1);
}

console.log('\n🔍  Testing email configuration...');
console.log(`    EMAIL_USER : ${EMAIL_USER}`);
console.log(`    EMAIL_PASS : ${'*'.repeat(EMAIL_PASS.length)} (${EMAIL_PASS.length} chars)\n`);

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: { user: EMAIL_USER, pass: EMAIL_PASS },
});

transporter.verify((err, success) => {
  if (err) {
    console.error('❌  Connection FAILED:', err.message);
    console.error('\n── Common Fixes ──────────────────────────────────────────');
    console.error('  1. You must use a Gmail APP PASSWORD, not your regular password.');
    console.error('  2. Go to: https://myaccount.google.com/apppasswords');
    console.error('  3. Enable 2-Step Verification first, then generate an App Password.');
    console.error('  4. Copy the 16-character code (remove spaces) into EMAIL_PASS in .env');
    console.error('  5. Make sure EMAIL_USER is your full Gmail address (e.g. you@gmail.com)');
    console.error('──────────────────────────────────────────────────────────\n');
    process.exit(1);
  }

  console.log('✅  Gmail connection verified! Sending test email...\n');

  transporter.sendMail({
    from: `MaxViva Hotel <${EMAIL_USER}>`,
    to: EMAIL_USER,       // sends to yourself as a test
    subject: '[MaxViva Hotel] ✅ Email Test Successful',
    html: `
      <div style="font-family:sans-serif;max-width:500px;margin:40px auto;padding:30px;
                  background:#f8f9fc;border-radius:10px;border:1px solid #e0e0e0;">
        <h2 style="color:#0f3460;">✅ Email is Working!</h2>
        <p>Your MaxViva Hotel email system is configured correctly.</p>
        <p style="color:#666;font-size:13px;">
          Sent from: <strong>${EMAIL_USER}</strong><br>
          Server: Gmail SMTP via App Password
        </p>
      </div>
    `,
  }, (sendErr, info) => {
    if (sendErr) {
      console.error('❌  Send FAILED:', sendErr.message);
      process.exit(1);
    }
    console.log('🎉  Test email sent successfully!');
    console.log(`    Message ID : ${info.messageId}`);
    console.log(`    Check your inbox at: ${EMAIL_USER}\n`);
    process.exit(0);
  });
});
