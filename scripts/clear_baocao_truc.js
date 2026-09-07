require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { sequelize, BaoCaoTruc } = require('../src/models');

async function main() {
  console.log('🔄 Đang kết nối cơ sở dữ liệu...');
  await sequelize.authenticate();
  console.log('✅ Kết nối CSDL thành công.');

  // 1. Sao lưu dữ liệu Báo cáo ca trực trước khi xóa
  console.log('📦 Bắt đầu sao lưu dữ liệu Báo cáo ca trực giáo viên...');
  const baocaoList = await BaoCaoTruc.findAll({ raw: true, order: [['id', 'ASC']] });

  console.log(`   - Số bản ghi Báo cáo ca trực hiện tại: ${baocaoList.length}`);

  const backupDir = path.join(__dirname, '..', 'backup');
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupFileName = `backup_baocao_truc_${timestamp}.json`;
  const backupFilePath = path.join(backupDir, backupFileName);

  const backupData = {
    timestamp: new Date().toISOString(),
    total_records: baocaoList.length,
    records: baocaoList,
  };

  fs.writeFileSync(backupFilePath, JSON.stringify(backupData, null, 2), 'utf-8');
  console.log(`✅ Đã sao lưu dữ liệu an toàn vào:\n   ${backupFilePath}`);

  // 2. Thực hiện xóa trong Transaction
  console.log('⚡ Bắt đầu tiến hành xóa dữ liệu Báo cáo ca trực...');
  const t = await sequelize.transaction();

  try {
    const deletedCount = await BaoCaoTruc.destroy({
      where: {},
      truncate: true,
      restartIdentity: true,
      cascade: false,
      transaction: t,
    });

    // Reset sequence ID về 1
    await sequelize.query(
      `SELECT setval(pg_get_serial_sequence('nghiepvu_baocaotruc', 'id'), 1, false);`,
      { transaction: t }
    ).catch(() => {});

    await t.commit();
    console.log(`🎉 ĐÃ XÓA THÀNH CÔNG toàn bộ dữ liệu bảng Báo cáo ca trực (nghiepvu_baocaotruc).`);
    console.log(`   - ID tự tăng đã được đặt lại về 1.`);
    console.log(`   - Danh mục Học sinh, Giáo viên, Phòng, Điểm danh, Lịch trực được bảo toàn nguyên vẹn 100%.`);
  } catch (err) {
    await t.rollback();
    console.error('❌ Có lỗi xảy ra trong quá trình xóa. Đã rollback dữ liệu:', err.message);
    process.exit(1);
  }

  process.exit(0);
}

main().catch(err => {
  console.error('Lỗi nghiêm trọng:', err);
  process.exit(1);
});
