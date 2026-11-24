// server.js
import express from 'express';
import cors from 'cors';
import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// In-memory OTP store: Map<email, { otp: string, expiresAt: number, attempts: number }>
const otpStore = new Map();

/**
 * Configure Nodemailer transporter.
 * If EMAIL_USER and EMAIL_PASS are set in .env, it uses Gmail / custom SMTP.
 * Otherwise, it runs in Dev Mode and logs the OTP code directly to console.
 */
function getTransporter() {
  const user = process.env.EMAIL_USER || process.env.SMTP_USER;
  const pass = process.env.EMAIL_PASS || process.env.SMTP_PASS;
  const host = process.env.SMTP_HOST || 'smtp.gmail.com';
  const port = parseInt(process.env.SMTP_PORT || '465', 10);
  const secure = port === 465;

  if (!user || !pass) {
    return null;
  }

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass }
  });
}

/**
 * Endpoint: POST /api/send-otp
 * Body: { email }
 */
app.post('/api/send-otp', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ success: false, message: 'Please provide a valid email address.' });
    }

    const cleanEmail = email.toLowerCase().trim();

    // Generate secure 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes

    otpStore.set(cleanEmail, { otp, expiresAt, attempts: 0 });

    const transporter = getTransporter();

    if (transporter) {
      const mailOptions = {
        from: `"Student Sphere" <${process.env.EMAIL_USER || process.env.SMTP_USER}>`,
        to: cleanEmail,
        subject: `Your Student Sphere Verification Code: ${otp}`,
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 520px; margin: 0 auto; padding: 32px 24px; border: 1px solid #e2e8f0; border-radius: 12px; background: #ffffff;">
            <div style="font-size: 20px; font-weight: 800; color: #166534; margin-bottom: 20px;">Student Sphere<span style="color:#22c55e;">.</span></div>
            <h2 style="color: #0f172a; margin-top: 0; font-size: 22px; font-weight: 700;">Verify your email address</h2>
            <p style="color: #475569; font-size: 15px; line-height: 1.6;">Welcome to Student Sphere! Use the 6-digit verification code below to complete creating your account:</p>
            <div style="margin: 28px 0; padding: 20px; text-align: center; background: #f0fdf4; border: 1.5px dashed #86efac; border-radius: 10px;">
              <span style="font-size: 34px; font-weight: 800; letter-spacing: 8px; color: #15803d; font-family: monospace;">${otp}</span>
            </div>
            <p style="color: #64748b; font-size: 13px; line-height: 1.5;">This code will expire in 10 minutes. If you did not request this verification, you can safely ignore this email.</p>
          </div>
        `
      };

      await transporter.sendMail(mailOptions);
      console.log(`[OTP] Sent verification email to: ${cleanEmail}`);
      return res.json({ success: true, message: `Verification code sent to ${cleanEmail}.` });
    } else {
      // Dev Mode: Log to console
      console.log(`\n======================================================`);
      console.log(`[STUDENT SPHERE OTP DEV MODE]`);
      console.log(`Recipient: ${cleanEmail}`);
      console.log(`Verification Code (OTP): ${otp}`);
      console.log(`Notice: Configure EMAIL_USER & EMAIL_PASS in .env to send real emails.`);
      console.log(`======================================================\n`);

      return res.json({
        success: true,
        devMode: true,
        devOtp: otp,
        message: `Verification code sent to ${cleanEmail}! (Dev mode: OTP logged to console)`
      });
    }
  } catch (error) {
    console.error('Error sending OTP:', error);
    return res.status(500).json({ success: false, message: 'Failed to send verification code. ' + error.message });
  }
});

/**
 * Endpoint: POST /api/verify-otp
 * Body: { email, otp }
 */
app.post('/api/verify-otp', (req, res) => {
  try {
    const { email, otp } = req.body;
    if (!email || !otp) {
      return res.status(400).json({ success: false, message: 'Email and OTP code are required.' });
    }

    const cleanEmail = email.toLowerCase().trim();
    const cleanOtp = otp.toString().trim();

    const record = otpStore.get(cleanEmail);
    if (!record) {
      return res.status(400).json({ success: false, message: 'No verification code found. Please request a new code.' });
    }

    if (Date.now() > record.expiresAt) {
      otpStore.delete(cleanEmail);
      return res.status(400).json({ success: false, message: 'Verification code has expired. Please request a new code.' });
    }

    record.attempts += 1;
    if (record.attempts > 5) {
      otpStore.delete(cleanEmail);
      return res.status(400).json({ success: false, message: 'Too many failed attempts. Please request a new code.' });
    }

    if (record.otp !== cleanOtp) {
      return res.status(400).json({ success: false, message: 'Incorrect verification code. Please try again.' });
    }

    // Success: clear OTP so it cannot be reused
    otpStore.delete(cleanEmail);
    return res.json({ success: true, message: 'Email verified successfully!' });
  } catch (error) {
    console.error('Error verifying OTP:', error);
    return res.status(500).json({ success: false, message: 'Verification error. ' + error.message });
  }
});

app.listen(PORT, () => {
  console.log(`[Student Sphere Backend] OTP & API service listening on http://localhost:${PORT}`);
});
