const NodeCache = require('node-cache');
const { StaffUser } = require('../models');
const { buildSessionUser } = require('../utils/userSession');
const { verifyToken } = require('../utils/token');

// Cache thông tin user trong 5 phút để tránh query DB trên mọi request
const userAuthCache = new NodeCache({ stdTTL: 300, checkperiod: 60 });

/**
 * Middleware: Attach user vào req.user từ Token (Authorization header) hoặc Session
 */
async function attachUser(req, res, next) {
  // 1. Kiểm tra Token từ Header Authorization (Bearer <token>)
  const authHeader = req.headers.authorization || req.headers.Authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7).trim();
    const payload = verifyToken(token);
    if (payload && payload.userId) {
      try {
        let sessionUser = userAuthCache.get(payload.userId);
        if (!sessionUser) {
          const user = await StaffUser.findByPk(payload.userId);
          if (user && user.is_active) {
            sessionUser = buildSessionUser(user);
            userAuthCache.set(payload.userId, sessionUser);
          }
        }
        if (sessionUser && sessionUser.is_active) {
          req.user = sessionUser;
          req.userId = payload.userId;
          if (req.session) {
            req.session.userId = payload.userId;
            req.session.user = sessionUser;
          }
          return next();
        }
      } catch (err) {
        return next(err);
      }
    }
  }

  // 2. Fallback: Kiểm tra Session Cookie
  if (req.session && req.session.userId && !req.user) {
    try {
      const user = await StaffUser.findByPk(req.session.userId);
      if (user && user.is_active) {
        const sessionUser = buildSessionUser(user);
        req.user = sessionUser;
        req.userId = user.id;
        req.session.user = sessionUser;
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
    req.userId = req.session.userId;
  }
  next();
}

/**
 * Middleware: Yêu cầu đăng nhập
 * - API path → JSON 401
 * - Trang web → redirect /login/
 */
function loginRequired(req, res, next) {
  const isAuth = Boolean(req.user || req.userId || (req.session && req.session.userId));
  if (!isAuth) {
    if (req.path.startsWith('/api/')) {
      return res.status(401).json({ ok: false, error: 'Chưa đăng nhập' });
    }
    return res.redirect('/login/');
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

