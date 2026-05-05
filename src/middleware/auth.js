const { StaffUser } = require('../models');

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

        req.session.user = {
          id: user.id,
          username: user.username,
          fullname: user.fullname,
          position: user.position,
          role: user.role,
          role_display: roleDisplayMap[user.role] || user.role,
          email: user.email,
          is_active: user.is_active,
          is_superuser: user.is_superuser,
          is_admin:               isAdmin,
          is_hoc_vu:              isHocVu,
          is_quan_ly:             isQuanLy,
          is_ke_toan:             isKeToan,
          can_diem_danh:          isAdmin || isHocVu,
          can_quan_ly_danh_muc:   isAdmin || isQuanLy,
          can_quan_tri:           isAdmin,
        };
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
