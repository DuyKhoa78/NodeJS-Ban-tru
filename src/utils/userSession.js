/**
 * Xây dựng object sessionUser đầy đủ các thuộc tính và permission flags
 */
function buildSessionUser(user) {
  const isAdmin    = Boolean(user.is_superuser || user.role === 'admin');
  const isHocVu    = user.role === 'hoc_vu';
  const isQuanLy   = user.role === 'quan_ly';
  const isKeToan   = user.role === 'ke_toan';
  const isGiaoVien = user.role === 'giao_vien';

  const roleDisplayMap = {
    admin:     'Quản trị viên',
    hoc_vu:    'Học vụ bán trú',
    quan_ly:   'Quản lý',
    ke_toan:   'Kế toán',
    giao_vien: 'Giáo viên trực',
  };

  return {
    id:                   user.id,
    username:             user.username,
    fullname:             user.fullname || '',
    position:             user.position || '',
    role:                 user.role,
    role_display:         roleDisplayMap[user.role] || user.role,
    giao_vien_id:         user.giao_vien_id || null,
    email:                user.email || '',
    avatar_url:           user.avatar_url || null,
    is_active:            Boolean(user.is_active),
    is_superuser:         Boolean(user.is_superuser),

    // ─── Permission flags (dùng cho Frontend & Middleware) ───
    is_admin:             isAdmin,
    is_hoc_vu:            isHocVu,
    is_quan_ly:           isQuanLy,
    is_ke_toan:           isKeToan,
    is_giao_vien:         isGiaoVien,
    can_diem_danh:        isAdmin || isHocVu || isGiaoVien,
    can_quan_ly_danh_muc: isAdmin || isQuanLy,
    can_quan_tri:         isAdmin,
  };
}

module.exports = { buildSessionUser };
