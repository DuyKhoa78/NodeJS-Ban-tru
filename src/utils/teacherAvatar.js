/**
 * Quản lý danh sách và cấp phát ngẫu nhiên ảnh đại diện giáo viên (GV0 đến GV15)
 * Cung cấp cơ chế random hàng ngày (1 ngày đổi ngẫu nhiên 1 lần)
 */

const GV_AVATARS = [
  '/gv0.jpg',
  '/gv1.png',
  '/gv2.jpg',
  '/gv3.png',
  '/gv4.png',
  '/gv5.jpg',
  '/gv6.jpg',
  '/gv7.jpg',
  '/gv8.jpg',
  '/gv9.png',
  '/gv10.png',
  '/gv11.png',
  '/gv12.jpg',
  '/gv13.jpg',
  '/gv14.jpg',
  '/gv15.png',
];

/**
 * Lấy khóa ngày hiện tại YYYY-MM-DD theo múi giờ Việt Nam (UTC+7)
 */
function getVietnamDateKey(d = new Date()) {
  const vnDate = new Date(d.getTime() + (7 * 60 + d.getTimezoneOffset()) * 60000);
  const y = vnDate.getFullYear();
  const m = String(vnDate.getMonth() + 1).padStart(2, '0');
  const day = String(vnDate.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Thuật toán tính ảnh đại diện ngẫu nhiên cho giáo viên theo ngày
 * - Nhất quán trong cùng 1 ngày (không bị đổi loạn xạ mỗi lần F5)
 * - Tự động đổi ngẫu nhiên sang ảnh mới khi bước sang ngày tiếp theo (00:00)
 * - Mỗi giáo viên khác nhau sẽ có hạt giống (seed) khác nhau nên ảnh nhận được khác nhau
 */
function getDailyTeacherAvatar(userOrId, date = new Date()) {
  const idKey = typeof userOrId === 'object' && userOrId !== null
    ? (userOrId.id || userOrId.username || '1')
    : String(userOrId || '1');
  const dateKey = typeof date === 'string' ? date : getVietnamDateKey(date);

  // Tạo hash từ id và ngày
  const seed = `gv_${idKey}_salt_${dateKey}`;
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) - hash + seed.charCodeAt(i)) | 0;
  }

  const index = Math.abs(hash) % GV_AVATARS.length;
  return GV_AVATARS[index];
}

/**
 * Đồng bộ ảnh ngẫu nhiên trong ngày vào Database cho tất cả tài khoản giáo viên
 */
async function syncDailyTeacherAvatars(StaffUser) {
  try {
    const teachers = await StaffUser.findAll({
      where: { role: 'giao_vien' },
    });

    const todayKey = getVietnamDateKey();
    let updatedCount = 0;

    for (const t of teachers) {
      // Nếu chưa có avatar hoặc đang dùng ảnh trong pool gvX thì cập nhật ảnh ngẫu nhiên hôm nay
      const currentAvatar = t.avatar_url || '';
      const isGvPoolAvatar = !currentAvatar || currentAvatar.match(/^\/gv\d+\.(jpg|png)$/);

      if (isGvPoolAvatar) {
        const todayAvatar = getDailyTeacherAvatar(t.id, todayKey);
        if (t.avatar_url !== todayAvatar) {
          await t.update({ avatar_url: todayAvatar });
          updatedCount++;
        }
      }
    }

    if (updatedCount > 0) {
      console.log(`[Daily Avatar] Đã cập nhật ảnh ngẫu nhiên ngày ${todayKey} cho ${updatedCount} tài khoản giáo viên.`);
    }
  } catch (err) {
    console.error('[Daily Avatar] Lỗi đồng bộ ảnh giáo viên hàng ngày:', err.message);
  }
}

module.exports = {
  GV_AVATARS,
  getVietnamDateKey,
  getDailyTeacherAvatar,
  syncDailyTeacherAvatars,
};
