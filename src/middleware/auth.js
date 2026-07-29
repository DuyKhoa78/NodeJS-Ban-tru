const { StaffUser } = require('../models');
const { buildSessionUser } = require('../utils/userSession');

/**
 * Middleware: Yêu cầu đăng nhập
 * - API path → JSON 401
 * - Trang web → redirect /login/
 */
function loginRequired(req, res, next) {
  if (!req.session || !req.session.userId) {
    if (req.path.startsWith('/api/')) {
      return res.status(401).json({ ok: false, error: 'Chưa đăng nhập' });
    }
    return res.redirect('/login/');
  }
  next();
}

/**
 * Middleware: Attach user vào req.user từ session
 */
async function attachUser(req, res, next) {
  if (req.session && req.session.userId && !req.user) {
    try {
      const user = await StaffUser.findByPk(req.session.userId);
      if (user && user.is_active) {
        req.user = user;
        req.session.user = buildSessionUser(user);
      } else {
        req.session.destroy();
        if (req.path.startsWith('/api/')) {
          return res.status(401).json({ ok: false, error: 'Tài khoản không tồn tại' });
        }
        return res.redirect('/login/');
      }
    } catch (err) {
      return next(err);
    }
  } else if (req.session && req.session.user) {
    req.user = req.session.user;
  }
  next();
}

/**
 * Middleware factory: Yêu cầu role cụ thể
 * @param  {...string} roles - danh sách roles được phép
 */
function roleRequired(...roles) {
  return (req, res, next) => {
    const user = req.user || req.session?.user;
    if (!user) {
      if (req.path.startsWith('/api/')) {
        return res.status(401).json({ ok: false, error: 'Chưa đăng nhập' });
      }
      return res.redirect('/login/');
    }
    if (user.is_superuser || roles.includes(user.role)) {
      return next();
    }
    if (req.path.startsWith('/api/')) {
      return res.status(403).json({ ok: false, error: 'Không có quyền thực hiện thao tác này' });
    }
    return res.redirect('/');
  };
}

module.exports = { loginRequired, attachUser, roleRequired };
