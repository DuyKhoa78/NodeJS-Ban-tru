const express = require('express');
const router = express.Router();
const { StaffUser } = require('../models');
const { loginRequired, attachUser, roleRequired } = require('../middleware/auth');
const { hashPassword, verifyPassword } = require('../utils/password');
const { generateOTP, sendOTPEmail } = require('../utils/otp');

router.use(attachUser);

// ─── QUẢN LÝ TÀI KHOẢN (Admin only) ─────────────────────────────────────────

/**
 * GET /api/taikhoan/
 * Trả danh sách users
 */
router.get('/api/taikhoan/', loginRequired, roleRequired('admin'), async (req, res) => {
  try {
    const users = await StaffUser.findAll({
      attributes: { exclude: ['password'] },
      order: [['id', 'ASC']],
    });
    return res.json({ ok: true, users });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * POST /api/taikhoan/save/
 * Tạo hoặc cập nhật user
 * Body: { id, username, fullname, position, role, is_active, password }
 */
router.post('/api/taikhoan/save/', loginRequired, roleRequired('admin'), async (req, res) => {
  try {
    const { id, username, fullname, position, role, is_active, password } = req.body;

    if (!username) return res.status(400).json({ ok: false, error: 'Username không được để trống' });

    const validRoles = ['admin', 'hoc_vu', 'quan_ly', 'ke_toan'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({ ok: false, error: 'Role không hợp lệ' });
    }

    if (id) {
      // Update
      const user = await StaffUser.findByPk(id);
      if (!user) return res.status(404).json({ ok: false, error: 'Không tìm thấy tài khoản' });

      // Không cho sửa username sang trùng người khác
      const dup = await StaffUser.findOne({ where: { username } });
      if (dup && dup.id !== parseInt(id)) {
        return res.status(400).json({ ok: false, error: 'Username đã tồn tại' });
      }

      await user.update({ username, fullname, position, role, is_active });
      return res.json({ ok: true, message: 'Cập nhật tài khoản thành công' });
    } else {
      // Create
      if (!password) return res.status(400).json({ ok: false, error: 'Mật khẩu không được để trống khi tạo mới' });
      const dup = await StaffUser.findOne({ where: { username } });
      if (dup) return res.status(400).json({ ok: false, error: 'Username đã tồn tại' });

      const hashed = await hashPassword(password);
      const newUser = await StaffUser.create({
        username, fullname, position, role,
        password: hashed,
        is_active: is_active !== undefined ? is_active : true,
        is_superuser: false,
        date_joined: new Date(),
      });
      return res.json({ ok: true, message: 'Tạo tài khoản thành công', id: newUser.id });
    }
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * POST /api/taikhoan/delete/
 * Body: { id }
 */
router.post('/api/taikhoan/delete/', loginRequired, roleRequired('admin'), async (req, res) => {
  try {
    const { id } = req.body;
    const currentUser = req.session.user;

    if (parseInt(id) === currentUser.id) {
      return res.status(400).json({ ok: false, error: 'Không thể xóa tài khoản đang đăng nhập' });
    }

    const user = await StaffUser.findByPk(id);
    if (!user) return res.status(404).json({ ok: false, error: 'Không tìm thấy tài khoản' });
    if (user.is_superuser) return res.status(400).json({ ok: false, error: 'Không thể xóa superuser' });

    await user.destroy();
    return res.json({ ok: true, message: 'Đã xóa tài khoản' });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * POST /api/taikhoan/reset-pw/
 * Body: { id, new_password }
 */
router.post('/api/taikhoan/reset-pw/', loginRequired, roleRequired('admin'), async (req, res) => {
  try {
    const { id, new_password } = req.body;
    if (!new_password || new_password.length < 6) {
      return res.status(400).json({ ok: false, error: 'Mật khẩu mới ít nhất 6 ký tự' });
    }

    const user = await StaffUser.findByPk(id);
    if (!user) return res.status(404).json({ ok: false, error: 'Không tìm thấy tài khoản' });

    const hashed = await hashPassword(new_password);
    await user.update({ password: hashed });
    return res.json({ ok: true, message: 'Đặt lại mật khẩu thành công' });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── PROFILE (Login required) ──────────────────────────────────────────────

/**
 * GET /api/profile/
 * Trả thông tin profile của user hiện tại
 */
router.get('/api/profile/', loginRequired, async (req, res) => {
  try {
    const user = await StaffUser.findByPk(req.session.userId, {
      attributes: { exclude: ['password'] },
    });
    return res.json({ ok: true, user });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * POST /api/profile/save/
 * Cập nhật thông tin cá nhân (không bao gồm password)
 * Body: { fullname, position, email }
 */
router.post('/api/profile/save/', loginRequired, async (req, res) => {
  try {
    const { fullname, position, email } = req.body;
    const user = await StaffUser.findByPk(req.session.userId);
    if (!user) return res.status(404).json({ ok: false, error: 'Không tìm thấy người dùng' });

    await user.update({ fullname, position, email });

    // Cập nhật session
    req.session.user = {
      ...req.session.user,
      fullname: user.fullname,
      position: user.position,
      email: user.email,
    };

    return res.json({ ok: true, message: 'Cập nhật thông tin thành công' });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * POST /api/profile/change-password/
 * Đổi mật khẩu trực tiếp bằng mật khẩu hiện tại
 * Body: { current_password, new_password }
 */
router.post('/api/profile/change-password/', loginRequired, async (req, res) => {
  try {
    const { current_password, new_password } = req.body;
    if (!current_password || !new_password) {
      return res.status(400).json({ ok: false, error: 'Vui lòng nhập đầy đủ mật khẩu hiện tại và mật khẩu mới' });
    }
    if (new_password.length < 6) {
      return res.status(400).json({ ok: false, error: 'Mật khẩu mới phải có ít nhất 6 ký tự' });
    }

    const user = await StaffUser.findByPk(req.session.userId);
    if (!user) return res.status(404).json({ ok: false, error: 'Không tìm thấy người dùng' });

    const isValid = await verifyPassword(current_password, user.password);
    if (!isValid) {
      return res.status(401).json({ ok: false, error: 'Mật khẩu hiện tại không đúng' });
    }

    const hashed = await hashPassword(new_password);
    await user.update({ password: hashed });

    return res.json({ ok: true, message: 'Đổi mật khẩu thành công!' });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * POST /api/profile/send-otp/
 * Kiểm tra mật khẩu hiện tại → gửi OTP email
 * Body: { current_password, new_password }
 */
router.post('/api/profile/send-otp/', loginRequired, async (req, res) => {
  try {
    const { current_password, new_password } = req.body;
    if (!new_password || new_password.length < 6) {
      return res.status(400).json({ ok: false, error: 'Mật khẩu mới ít nhất 6 ký tự' });
    }

    const user = await StaffUser.findByPk(req.session.userId);
    const isValid = await verifyPassword(current_password, user.password);
    if (!isValid) {
      return res.status(401).json({ ok: false, error: 'Mật khẩu hiện tại không đúng' });
    }

    if (!user.email) {
      return res.status(400).json({ ok: false, error: 'Tài khoản chưa có email' });
    }

    const otp = generateOTP();
    // Lưu OTP vào session (5 phút)
    req.session.otp_code = otp;
    req.session.otp_time = Date.now();
    req.session.new_password = new_password;

    await sendOTPEmail(user.email, otp);

    return res.json({ ok: true, message: `OTP đã được gửi đến ${user.email}` });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * POST /api/profile/verify-otp/
 * Xác minh OTP → đổi mật khẩu
 * Body: { otp }
 */
router.post('/api/profile/verify-otp/', loginRequired, async (req, res) => {
  try {
    const { otp } = req.body;
    const { otp_code, otp_time, new_password } = req.session;

    if (!otp_code) {
      return res.status(400).json({ ok: false, error: 'Chưa gửi OTP' });
    }

    // Kiểm tra hết hạn (5 phút = 300000ms)
    if (Date.now() - otp_time > 300000) {
      delete req.session.otp_code;
      delete req.session.otp_time;
      delete req.session.new_password;
      return res.status(400).json({ ok: false, error: 'OTP đã hết hạn, vui lòng gửi lại' });
    }

    if (otp !== otp_code) {
      return res.status(400).json({ ok: false, error: 'OTP không đúng' });
    }

    const user = await StaffUser.findByPk(req.session.userId);
    const hashed = await hashPassword(new_password);
    await user.update({ password: hashed });

    // Xóa OTP khỏi session
    delete req.session.otp_code;
    delete req.session.otp_time;
    delete req.session.new_password;

    return res.json({ ok: true, message: 'Đổi mật khẩu thành công' });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
