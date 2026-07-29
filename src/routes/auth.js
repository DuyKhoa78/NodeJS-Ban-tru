const express = require('express');
const router = express.Router();
const { StaffUser } = require('../models');
const { verifyPassword, hashPassword } = require('../utils/password');

const { buildSessionUser } = require('../utils/userSession');

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

    const sessionUser = buildSessionUser(user);

    // Thiết lập session
    req.session.userId = user.id;
    req.session.user   = sessionUser;

    // Thời hạn session
    if (remember) {
      req.session.cookie.maxAge = parseInt(process.env.SESSION_REMEMBER_AGE) || 2592000000; // 30 ngày
    } else {
      req.session.cookie.maxAge = parseInt(process.env.SESSION_MAX_AGE) || 86400000; // 24 giờ
    }

    // Đảm bảo session được ghi thành công vào Database trước khi trả response về cho client (tránh bất đồng bộ làm out đăng nhập)
    return req.session.save((err) => {
      if (err) {
        console.error('Session save error:', err);
        return res.status(500).json({ ok: false, error: 'Không thể lưu phiên đăng nhập vào hệ thống' });
      }
      return res.json({
        ok: true,
        user: sessionUser,
        redirect: '/',
      });
    });
  } catch (err) {
    console.error('Login error:', err);
    if (err.name === 'SequelizeConnectionError' || err.code === 'XX000' || (err.message && (err.message.includes('tenant/user') || err.message.includes('ENOTFOUND')))) {
      return res.status(503).json({
        ok: false,
        error: 'Không thể kết nối Cơ sở dữ liệu (Supabase có thể đang bị tạm dừng - Pause). Vui lòng vào Supabase Dashboard để Restore project.'
      });
    }
    return res.status(500).json({ ok: false, error: 'Lỗi hệ thống: ' + (err.message || 'Không xác định') });
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
    
    const sessionUser = buildSessionUser(user);
    req.session.user = sessionUser;
    
    return res.json({ ok: true, user: sessionUser });
  } catch (err) {
    return res.status(500).json({ ok: false, error: 'Lỗi máy chủ' });
  }
});

module.exports = router;
