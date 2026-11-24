import { defineConfig } from 'vite';
import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

dotenv.config();

// In-memory OTP store for development & testing
const otpStore = new Map();

function getTransporter() {
  const user = process.env.EMAIL_USER || process.env.SMTP_USER;
  const pass = process.env.EMAIL_PASS || process.env.SMTP_PASS;
  const host = process.env.SMTP_HOST || 'smtp.gmail.com';
  const port = parseInt(process.env.SMTP_PORT || '465', 10);
  if (!user || !pass) return null;
  return nodemailer.createTransport({ host, port, secure: port === 465, auth: { user, pass } });
}

export default defineConfig({
  plugins: [
    {
      name: 'otp-api-middleware',
      configureServer(server) {
        server.middlewares.use(async (req, res, next) => {
          if (req.url === '/api/send-otp' && req.method === 'POST') {
            let body = '';
            req.on('data', (chunk) => { body += chunk; });
            req.on('end', async () => {
              try {
                const { email } = JSON.parse(body || '{}');
                if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
                  res.statusCode = 400;
                  res.setHeader('Content-Type', 'application/json');
                  return res.end(JSON.stringify({ success: false, message: 'Please provide a valid email address.' }));
                }

                const cleanEmail = email.toLowerCase().trim();
                const otp = Math.floor(100000 + Math.random() * 900000).toString();
                otpStore.set(cleanEmail, { otp, expiresAt: Date.now() + 10 * 60 * 1000, attempts: 0 });

                const transporter = getTransporter();
                if (transporter) {
                  await transporter.sendMail({
                    from: `"Student Sphere" <${process.env.EMAIL_USER || process.env.SMTP_USER}>`,
                    to: cleanEmail,
                    subject: `Your Student Sphere Verification Code: ${otp}`,
                    html: `
                      <div style="font-family: sans-serif; max-width: 500px; padding: 24px; border: 1px solid #e2e8f0; border-radius: 10px;">
                        <h2 style="color: #166534;">Student Sphere Verification</h2>
                        <p>Your 6-digit registration verification code is:</p>
                        <div style="font-size: 32px; font-weight: 800; letter-spacing: 6px; color: #15803d; padding: 16px; background: #f0fdf4; text-align: center; border-radius: 8px;">
                          ${otp}
                        </div>
                        <p style="color: #64748b; font-size: 13px;">Expires in 10 minutes.</p>
                      </div>
                    `
                  });
                  res.setHeader('Content-Type', 'application/json');
                  return res.end(JSON.stringify({ success: true, message: `Verification code sent to ${cleanEmail}.` }));
                } else {
                  console.log(`\n======================================================`);
                  console.log(`[STUDENT SPHERE OTP DEV MODE]`);
                  console.log(`Recipient: ${cleanEmail}`);
                  console.log(`Verification Code (OTP): ${otp}`);
                  console.log(`======================================================\n`);
                  res.setHeader('Content-Type', 'application/json');
                  return res.end(JSON.stringify({
                    success: true,
                    devMode: true,
                    devOtp: otp,
                    message: `Verification code sent to ${cleanEmail}! (Dev mode: OTP logged to console)`
                  }));
                }
              } catch (err) {
                res.statusCode = 500;
                res.setHeader('Content-Type', 'application/json');
                return res.end(JSON.stringify({ success: false, message: 'Server error: ' + err.message }));
              }
            });
            return;
          }

          if (req.url === '/api/verify-otp' && req.method === 'POST') {
            let body = '';
            req.on('data', (chunk) => { body += chunk; });
            req.on('end', () => {
              try {
                const { email, otp } = JSON.parse(body || '{}');
                const cleanEmail = (email || '').toLowerCase().trim();
                const record = otpStore.get(cleanEmail);

                res.setHeader('Content-Type', 'application/json');
                if (!record) {
                  res.statusCode = 400;
                  return res.end(JSON.stringify({ success: false, message: 'No verification code found. Please request a new code.' }));
                }

                if (Date.now() > record.expiresAt) {
                  otpStore.delete(cleanEmail);
                  res.statusCode = 400;
                  return res.end(JSON.stringify({ success: false, message: 'Verification code expired.' }));
                }

                record.attempts += 1;
                if (record.attempts > 5) {
                  otpStore.delete(cleanEmail);
                  res.statusCode = 400;
                  return res.end(JSON.stringify({ success: false, message: 'Too many failed attempts.' }));
                }

                if (record.otp !== (otp || '').trim()) {
                  res.statusCode = 400;
                  return res.end(JSON.stringify({ success: false, message: 'Incorrect verification code.' }));
                }

                otpStore.delete(cleanEmail);
                return res.end(JSON.stringify({ success: true, message: 'Email verified successfully!' }));
              } catch (err) {
                res.statusCode = 500;
                res.setHeader('Content-Type', 'application/json');
                return res.end(JSON.stringify({ success: false, message: 'Verification error: ' + err.message }));
              }
            });
            return;
          }

          next();
        });
      }
    }
  ]
});
