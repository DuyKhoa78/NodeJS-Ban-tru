require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { HocSinh, LichSuPhanPhong, sequelize } = require('../src/models');
const { invalidateStaticCaches } = require('../src/utils/appCache');

async function resetAllRooms() {
  const t = await sequelize.transaction();
  try {
    console.log('1. Đang sao lưu danh sách phòng học sinh trước khi xóa...');
    const allStudents = await HocSinh.findAll({
      attributes: ['id', 'ho_ten', 'lop', 'gioi_tinh', 'ma_phong_an_id', 'ma_phong_ngu_id', 'dang_hoc'],
      order: [['lop', 'ASC'], ['ho_ten', 'ASC']],
      transaction: t,
    });

    const backupDir = path.join(__dirname, '..', 'backup');
    if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
    const backupFile = path.join(backupDir, `backup_before_unassign_rooms_${Date.now()}.json`);
    fs.writeFileSync(backupFile, JSON.stringify(allStudents, null, 2), 'utf8');
    console.log(`✅ Đã lưu file backup an toàn tại: ${backupFile}`);

    console.log('2. Đang chốt mốc phân phòng lịch sử đến ngày hôm qua (2026-09-24)...');
    const [closedCount] = await LichSuPhanPhong.update(
      { den_ngay: '2026-09-24' },
      { 
        where: { den_ngay: null },
        transaction: t 
      }
    );
    console.log(`✅ Đã đóng mốc kết thúc phòng cũ cho ${closedCount} bản ghi lịch sử.`);

    console.log('3. Đang xóa phân phòng ăn và phòng ngủ của toàn bộ học sinh...');
    const [updatedCount] = await HocSinh.update(
      { ma_phong_an_id: null, ma_phong_ngu_id: null },
      { where: {}, transaction: t }
    );
    console.log(`✅ Đã đặt ma_phong_an_id = NULL và ma_phong_ngu_id = NULL cho ${updatedCount} học sinh.`);

    await t.commit();
    invalidateStaticCaches();
    console.log('🎉 Hoàn tất thành công toàn bộ quá trình xóa phân phòng!');
    process.exit(0);
  } catch (err) {
    await t.rollback();
    console.error('❌ Lỗi khi thực hiện:', err);
    process.exit(1);
  }
}

resetAllRooms();
