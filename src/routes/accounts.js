const express = require('express');
const router = express.Router();
const { StaffUser } = require('../models');
const { loginRequired, attachUser, roleRequired, invalidateUserCache } = require('../middleware/auth');
const { hashPassword, verifyPassword } = require('../utils/password');
const { generateOTP, sendOTPEmail, hashOTP } = require('../utils/otp');

router.use(attachUser);

// ─── QUẢN LÝ TÀI KHOẢN (Admin only) ─────────────────────────────────────────

/**
 * GET /api/taikhoan/
 * Trả danh sách users
 */
router.get('/api/taikhoan/', loginRequired, roleRequired('admin'), async (req, res) => {
  try {
    const { GiaoVien } = require('../models');
    const users = await StaffUser.findAll({
      attributes: { exclude: ['password'] },
      include: [{ model: GiaoVien, as: 'giao_vien', attributes: ['id', 'ho_ten'] }],
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
 * Body: { id, username, fullname, position, role, is_active, password, giao_vien_id }
 */
router.post('/api/taikhoan/save/', loginRequired, roleRequired('admin'), async (req, res) => {
  try {
    const { id, username, fullname, position, role, is_active, password, giao_vien_id } = req.body;
    const currentUser = req.user || req.session?.user;

    if (!username) return res.status(400).json({ ok: false, error: 'Username không được để trống' });

    const validRoles = ['admin', 'hoc_vu', 'quan_ly', 'ke_toan', 'giao_vien'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({ ok: false, error: 'Role không hợp lệ' });
    }

    const gvId = role === 'giao_vien' && giao_vien_id ? parseInt(giao_vien_id, 10) : null;

    if (id) {
      // Update
      const user = await StaffUser.findByPk(id);
      if (!user) return res.status(404).json({ ok: false, error: 'Không tìm thấy tài khoản' });

      // RÀNG BUỘC: Admin con (không phải Super Admin) không được chỉnh sửa tài khoản Super Admin
      if (user.is_superuser && !currentUser?.is_superuser) {
        return res.status(403).json({ ok: false, error: 'Bạn không có quyền chỉnh sửa tài khoản Super Admin' });
      }

      // RÀNG BUỘC: Không ai được phép vô hiệu hóa tài khoản Super Admin
      if (user.is_superuser && is_active === false) {
        return res.status(400).json({ ok: false, error: 'Không thể vô hiệu hóa tài khoản Super Admin' });
      }

      // RÀNG BUỘC: Tài khoản Super Admin bắt buộc phải giữ vai trò admin
      if (user.is_superuser && role !== 'admin') {
        return res.status(400).json({ ok: false, error: 'Tài khoản Super Admin bắt buộc phải có vai trò admin' });
      }

      // Không cho sửa username sang trùng người khác
      const dup = await StaffUser.findOne({ where: { username } });
      if (dup && dup.id !== parseInt(id)) {
        return res.status(400).json({ ok: false, error: 'Username đã tồn tại' });
      }

      await user.update({
        username,
        fullname,
        position,
        role: user.is_superuser ? 'admin' : role,
        giao_vien_id: gvId,
        is_active: user.is_superuser ? true : is_active,
      });

      invalidateUserCache(user.id);
      await user.increment('token_version', { by: 1 }).catch(() => {});

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
        giao_vien_id: gvId,
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
    const currentUser = req.user || req.session?.user;

    if (parseInt(id) === currentUser?.id) {
      return res.status(400).json({ ok: false, error: 'Không thể xóa tài khoản đang đăng nhập' });
    }

    const user = await StaffUser.findByPk(id);
    if (!user) return res.status(404).json({ ok: false, error: 'Không tìm thấy tài khoản' });

    // RÀNG BUỘC: Không thể xóa tài khoản Super Admin
    if (user.is_superuser) {
      return res.status(403).json({ ok: false, error: 'Không thể xóa tài khoản Super Admin' });
    }

    // RÀNG BUỘC: Admin con không được xóa tài khoản Quản trị viên khác
    if (user.role === 'admin' && !currentUser?.is_superuser) {
      return res.status(403).json({ ok: false, error: 'Chỉ Super Admin mới có quyền xóa tài khoản Quản trị viên' });
    }

    invalidateUserCache(id);
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
    const currentUser = req.user || req.session?.user;

    if (!new_password || new_password.length < 8) {
      return res.status(400).json({ ok: false, error: 'Mật khẩu mới phải có ít nhất 8 ký tự' });
    }

    const user = await StaffUser.findByPk(id);
    if (!user) return res.status(404).json({ ok: false, error: 'Không tìm thấy tài khoản' });

    // RÀNG BUỘC: Admin con không được đặt lại mật khẩu cho tài khoản Super Admin
    if (user.is_superuser && !currentUser?.is_superuser) {
      return res.status(403).json({ ok: false, error: 'Bạn không có quyền đặt lại mật khẩu cho tài khoản Super Admin' });
    }

    const hashed = await hashPassword(new_password);
    await user.update({ password: hashed });

    invalidateUserCache(user.id);
    await user.increment('token_version', { by: 1 }).catch(() => {});

    return res.json({ ok: true, message: 'Đặt lại mật khẩu thành công' });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── PROFILE (Login required) ──────────────────────────────────────────────

/**
 * GET /api/profile/
 * Trả thông tin user đang đăng nhập
 */
router.get('/api/profile/', loginRequired, async (req, res) => {
  try {
    const userId = req.userId || (req.user && req.user.id) || req.session.userId;
    const user = await StaffUser.findByPk(userId, {
      attributes: { exclude: ['password'] },
    });
    if (!user) return res.status(404).json({ ok: false, error: 'Không tìm thấy thông tin' });
    return res.json({ ok: true, user });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * POST /api/profile/update/
 * Body: { fullname, email, position }
 */
router.post('/api/profile/update/', loginRequired, async (req, res) => {
  try {
    const { fullname, email, position } = req.body;
    const userId = req.userId || (req.user && req.user.id) || req.session.userId;
    const user = await StaffUser.findByPk(userId);
    if (!user) return res.status(404).json({ ok: false, error: 'Không tìm thấy người dùng' });

    await user.update({
      fullname: fullname !== undefined ? fullname : user.fullname,
      email: email !== undefined ? email : user.email,
      position: position !== undefined ? position : user.position,
    });

    invalidateUserCache(user.id);
    return res.json({ ok: true, message: 'Cập nhật thông tin thành công!' });
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
    if (new_password.length < 8) {
      return res.status(400).json({ ok: false, error: 'Mật khẩu mới phải có ít nhất 8 ký tự' });
    }

    const userId = req.userId || (req.user && req.user.id) || req.session.userId;
    const user = await StaffUser.findByPk(userId);
    if (!user) return res.status(404).json({ ok: false, error: 'Không tìm thấy người dùng' });

    const isValid = await verifyPassword(current_password, user.password);
    if (!isValid) {
      return res.status(401).json({ ok: false, error: 'Mật khẩu hiện tại không đúng' });
    }

    const hashed = await hashPassword(new_password);
    await user.update({ password: hashed });

    invalidateUserCache(user.id);
    await user.increment('token_version', { by: 1 }).catch(() => {});

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
    if (!new_password || new_password.length < 8) {
      return res.status(400).json({ ok: false, error: 'Mật khẩu mới phải có ít nhất 8 ký tự' });
    }

    // Giới hạn gửi lại OTP tối thiểu 60 giây
    if (req.session?.otp_time && (Date.now() - req.session.otp_time < 60000)) {
      const waitSec = Math.ceil((60000 - (Date.now() - req.session.otp_time)) / 1000);
      return res.status(429).json({ ok: false, error: `Vui lòng đợi ${waitSec} giây trước khi yêu cầu gửi lại mã OTP` });
    }

    const userId = req.userId || (req.user && req.user.id) || req.session.userId;
    const user = await StaffUser.findByPk(userId);
    if (!user) return res.status(404).json({ ok: false, error: 'Không tìm thấy tài khoản' });

    const isValid = await verifyPassword(current_password, user.password);
    if (!isValid) {
      return res.status(401).json({ ok: false, error: 'Mật khẩu hiện tại không đúng' });
    }

    if (!user.email) {
      return res.status(400).json({ ok: false, error: 'Tài khoản chưa có email để nhận mã OTP' });
    }

    const otp = generateOTP();
    // Lưu OTP dạng hash vào session (hạn 5 phút)
    if (req.session) {
      req.session.otp_hash = hashOTP(otp);
      req.session.otp_time = Date.now();
      req.session.otp_attempts = 0;
      req.session.otp_new_password = new_password;
    }

    await sendOTPEmail(user.email, otp);

    return res.json({ ok: true, message: `Mã OTP đã được gửi đến ${user.email}` });
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
    const { otp_hash, otp_time, otp_new_password } = req.session || {};

    if (!otp_hash || !otp_new_password) {
      return res.status(400).json({ ok: false, error: 'Chưa có yêu cầu OTP hoặc mã đã được sử dụng' });
    }

    // Kiểm tra hết hạn (5 phút = 300000ms)
    if (Date.now() - otp_time > 300000) {
      delete req.session.otp_hash;
      delete req.session.otp_time;
      delete req.session.otp_new_password;
      delete req.session.otp_attempts;
      return res.status(400).json({ ok: false, error: 'Mã OTP đã hết hạn, vui lòng yêu cầu mã mới' });
    }

    // Giới hạn số lần thử (tối đa 5 lần)
    req.session.otp_attempts = (req.session.otp_attempts || 0) + 1;
    if (req.session.otp_attempts > 5) {
      delete req.session.otp_hash;
      delete req.session.otp_time;
      delete req.session.otp_new_password;
      delete req.session.otp_attempts;
      return res.status(429).json({ ok: false, error: 'Bạn đã nhập sai OTP quá 5 lần. Mã OTP đã bị hủy để bảo mật.' });
    }

    // Xác minh mã OTP bằng hash SHA-256
    if (hashOTP(otp) !== otp_hash) {
      const remaining = 5 - req.session.otp_attempts;
      return res.status(400).json({ ok: false, error: `Mã OTP không chính xác (còn ${remaining} lần thử)` });
    }

    const userId = req.userId || (req.user && req.user.id) || req.session.userId;
    const user = await StaffUser.findByPk(userId);
    if (!user) return res.status(404).json({ ok: false, error: 'Không tìm thấy tài khoản' });

    const hashed = await hashPassword(otp_new_password);
    await user.update({ password: hashed });

    // Thu hồi token cũ và xóa cache user
    invalidateUserCache(user.id);
    await user.increment('token_version', { by: 1 }).catch(() => {});

    // Xóa OTP khỏi session
    delete req.session.otp_hash;
    delete req.session.otp_time;
    delete req.session.otp_new_password;
    delete req.session.otp_attempts;

    return res.json({ ok: true, message: 'Đổi mật khẩu thành công' });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
