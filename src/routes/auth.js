const express = require('express');
const router = express.Router();
const { StaffUser } = require('../models');
const { verifyPassword, hashPassword } = require('../utils/password');

/**
 * POST /login/
 * Body: { username, password, remember }
 */
router.post('/login/', async (req, res) => {
  try {
    const { username, password, remember } = req.body;

    if (!username || !password) {
      return res.status(400).json({ ok: false, error: 'Vui lòng nhập tên đăng nhập và mật khẩu' });
    }

    const user = await StaffUser.findOne({ where: { username, is_active: true } });
    if (!user) {
      return res.status(401).json({ ok: false, error: 'Tên đăng nhập hoặc mật khẩu không đúng' });
    }

    const isValid = await verifyPassword(password, user.password);
    if (!isValid) {
      return res.status(401).json({ ok: false, error: 'Tên đăng nhập hoặc mật khẩu không đúng' });
    }

    // ─── Tính toán permission flags dựa theo role ───────────────────────────
    const isAdmin    = user.is_superuser || user.role === 'admin';
    const isHocVu    = user.role === 'hoc_vu';
    const isQuanLy   = user.role === 'quan_ly';
    const isKeToan   = user.role === 'ke_toan';

    const roleDisplayMap = {
      admin:   'Quản trị viên',
      hoc_vu:  'Giáo viên / Học vụ',
      quan_ly: 'Quản lý',
      ke_toan: 'Kế toán',
    };

    const sessionUser = {
      id:           user.id,
      username:     user.username,
      fullname:     user.fullname,
      position:     user.position,
      role:         user.role,
      role_display: roleDisplayMap[user.role] || user.role,
      email:        user.email,
      avatar_url:   user.avatar_url || null,
      is_active:    user.is_active,
      is_superuser: user.is_superuser,
      // ─── Permission flags (dùng trên frontend để hiện/ẩn menu) ───
      is_admin:               isAdmin,
      is_hoc_vu:              isHocVu,
      is_quan_ly:             isQuanLy,
      is_ke_toan:             isKeToan,
      can_diem_danh:          isAdmin || isHocVu,
      can_quan_ly_danh_muc:   isAdmin || isQuanLy,
      can_quan_tri:           isAdmin,
    };

    // Thiết lập session
    req.session.userId = user.id;
    req.session.user   = sessionUser;

    // Thời hạn session
    if (remember) {
      req.session.cookie.maxAge = parseInt(process.env.SESSION_REMEMBER_AGE) || 2592000000;
    } else {
      req.session.cookie.expires = false; // hết khi đóng browser
    }

    return res.json({
      ok: true,
      user: sessionUser,
      redirect: '/',
    });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ ok: false, error: 'Lỗi hệ thống' });
  }
});

/**
 * POST /logout/
 */
router.post('/logout/', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ ok: false, error: 'Không thể đăng xuất' });
    }
    res.clearCookie('connect.sid');
    return res.json({ ok: true, redirect: '/login/' });
  });
});

/**
 * GET /api/auth/me
 * Trả thông tin user hiện tại đang đăng nhập
 */
router.get('/api/auth/me', async (req, res) => {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ ok: false, error: 'Chưa đăng nhập' });
  }
  try {
    const user = await StaffUser.findByPk(req.session.userId);
    if (!user || !user.is_active) {
      req.session.destroy();
      return res.status(401).json({ ok: false, error: 'Tài khoản không tồn tại hoặc bị khóa' });
    }
    // Update session user fields that might have changed (like avatar_url, fullname, etc.)
    req.session.user.avatar_url = user.avatar_url;
    req.session.user.fullname = user.fullname;
    req.session.user.role = user.role;
    
    return res.json({ ok: true, user: req.session.user });
  } catch (err) {
    return res.status(500).json({ ok: false, error: 'Lỗi máy chủ' });
  }
});

module.exports = router;
