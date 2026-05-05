const nodemailer = require('nodemailer');

/**
 * Tạo mã OTP 6 chữ số ngẫu nhiên
 * @returns {string}
 */
function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * Tạo Nodemailer transporter từ env config
 */
function createTransporter() {
  if (process.env.NODE_ENV === 'development' && !process.env.EMAIL_USER) {
    // Dev mode: in OTP ra console
    return null;
  }
  return nodemailer.createTransport({
    host: process.env.EMAIL_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.EMAIL_PORT) || 587,
    secure: false,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });
}

/**
 * Gửi email chứa OTP để đổi mật khẩu
 * @param {string} toEmail
 * @param {string} otpCode
 */
async function sendOTPEmail(toEmail, otpCode) {
  const transporter = createTransporter();

  const mailOptions = {
    from: process.env.EMAIL_FROM || 'noreply@lthg.edu.vn',
    to: toEmail,
    subject: 'Mã xác nhận đổi mật khẩu - LTHG Bán trú',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 480px; margin: auto; padding: 24px; border: 1px solid #eee; border-radius: 8px;">
        <h2 style="color: #1e3a5f;">Đổi mật khẩu tài khoản</h2>
        <p>Mã OTP của bạn là:</p>
        <div style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #1e3a5f; text-align: center; padding: 16px; background: #f0f4ff; border-radius: 8px; margin: 16px 0;">
          ${otpCode}
        </div>
        <p style="color: #666;">Mã có hiệu lực trong <strong>5 phút</strong>. Không chia sẻ mã này cho bất kỳ ai.</p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;">
        <p style="color: #999; font-size: 12px;">Hệ thống quản lý bán trú - THPT Lê Thị Hồng Gấm</p>
      </div>
    `,
  };

  if (!transporter) {
    // Dev fallback: in ra console
    console.log('📧 [DEV] OTP Email to:', toEmail, '| Code:', otpCode);
    return;
  }

  await transporter.sendMail(mailOptions);
}

module.exports = { generateOTP, sendOTPEmail };
