const express = require('express');
const router = express.Router();
const { StaffUser } = require('../models');
const { verifyPassword, hashPassword } = require('../utils/password');
const { buildSessionUser } = require('../utils/userSession');
const { generateToken } = require('../utils/token');

/**
 * Xử lý Đăng nhập chung cho POST /login/ và POST /api/auth/login
 */
async function handleLogin(req, res) {
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

    // Kiểm tra chế độ bảo trì: Chỉ cho phép Super Admin đăng nhập
    try {
      const { CauHinhHeThong } = require('../models');
      const heThong = await CauHinhHeThong.findByPk(1);
      if (heThong && heThong.bao_tri) {
        const isSuperAdmin = Boolean(user.is_superuser || user.role === 'super_admin');
        if (!isSuperAdmin) {
          return res.status(503).json({
            ok: false,
            maintenance: true,
            error: heThong.thong_bao_bao_tri || 'Hệ thống đang bảo trì vui lòng quay lại sau.',
            thoi_gian: heThong.thoi_gian_bao_tri || 'Dự kiến hoàn tất trong ít phút',
          });
        }
      }
    } catch (err) {
      console.error('Error checking maintenance during login:', err);
    }

    const sessionUser = buildSessionUser(user);

    // Thời hạn token & session: ghi nhớ 30 ngày nếu chọn "nhớ tôi", ngược lại 24 giờ
    const expiresInMs = remember
      ? (parseInt(process.env.SESSION_REMEMBER_AGE) || 2592000000)
      : (parseInt(process.env.SESSION_MAX_AGE) || 86400000);

    // Sinh Bearer Token độc lập với cookie (giúp tránh hoàn toàn lỗi chặn Third-Party Cookie)
    const token = generateToken(user.id, expiresInMs);

    // Thiết lập session (song song cho các môi trường hỗ trợ cookie)
    if (req.session) {
      req.session.userId = user.id;
      req.session.user   = sessionUser;
      if (req.session.cookie) {
        req.session.cookie.maxAge = expiresInMs;
      }
      return req.session.save((err) => {
        if (err) {
          console.error('Session save warning:', err);
        }
        return res.json({
          ok: true,
          user: sessionUser,
          token,
          redirect: '/',
        });
      });
    }

    return res.json({
      ok: true,
      user: sessionUser,
      token,
      redirect: '/',
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
}

/**
 * Xử lý Đăng xuất chung
 */
function handleLogout(req, res) {
  if (req.session) {
    req.session.destroy(() => {});
  }
  res.clearCookie('connect.sid');
  return res.json({ ok: true, redirect: '/login/' });
}

// Routes Đăng nhập (hỗ trợ cả đường dẫn cũ và mới /api/auth/login)
router.post('/login/', handleLogin);
router.post('/login', handleLogin);
router.post('/api/login', handleLogin);
router.post('/api/login/', handleLogin);
router.post('/api/auth/login', handleLogin);
router.post('/api/auth/login/', handleLogin);

// Routes Đăng xuất
router.post('/logout/', handleLogout);
router.post('/logout', handleLogout);
router.post('/api/logout', handleLogout);
router.post('/api/logout/', handleLogout);
router.post('/api/auth/logout', handleLogout);
router.post('/api/auth/logout/', handleLogout);

/**
 * GET /api/auth/me
 * Trả thông tin user hiện tại đang đăng nhập (hỗ trợ cả Token & Session)
 */
router.get('/api/auth/me', async (req, res) => {
  const currentUserId = req.userId || req.user?.id || req.session?.userId;
  if (!currentUserId) {
    return res.status(401).json({ ok: false, error: 'Chưa đăng nhập' });
  }
  try {
    const user = await StaffUser.findByPk(currentUserId);
    if (!user || !user.is_active) {
      if (req.session) req.session.destroy();
      return res.status(401).json({ ok: false, error: 'Tài khoản không tồn tại hoặc bị khóa' });
    }
    
    const sessionUser = buildSessionUser(user);
    if (req.session) req.session.user = sessionUser;
    
    return res.json({ ok: true, user: sessionUser });
  } catch (err) {
    return res.status(500).json({ ok: false, error: 'Lỗi máy chủ' });
  }
});

module.exports = router;

