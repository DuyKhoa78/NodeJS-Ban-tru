require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { sequelize, PhanCongTrucGV, LichTrucCoDinh } = require('../src/models');

async function main() {
  console.log('🔄 Đang kết nối cơ sở dữ liệu...');
  await sequelize.authenticate();
  console.log('✅ Kết nối CSDL thành công.');

  // 1. Sao lưu dữ liệu lịch trực trước khi xóa
  console.log('📦 Bắt đầu sao lưu dữ liệu lịch trực giáo viên & cố định...');
  const phanCongList = await PhanCongTrucGV.findAll({ raw: true, order: [['id', 'ASC']] });
  const lichKhungList = await LichTrucCoDinh.findAll({ raw: true, order: [['id', 'ASC']] });

  console.log(`   - Số bản ghi Phân công trực GV thực tế: ${phanCongList.length}`);
  console.log(`   - Số bản ghi Lịch trực khung cố định: ${lichKhungList.length}`);

  const backupDir = path.join(__dirname, '..', 'backup');
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupFileName = `backup_duty_schedules_${timestamp}.json`;
  const backupFilePath = path.join(backupDir, backupFileName);

  const backupData = {
    timestamp: new Date().toISOString(),
    PhanCongTrucGV: phanCongList,
    LichTrucCoDinh: lichKhungList,
  };

  fs.writeFileSync(backupFilePath, JSON.stringify(backupData, null, 2), 'utf-8');
  console.log(`✅ Đã sao lưu dữ liệu an toàn vào:\n   ${backupFilePath}`);

  // 2. Thực hiện xóa trong Transaction
  console.log('⚡ Bắt đầu tiến hành xóa dữ liệu trong CSDL...');
  const t = await sequelize.transaction();

  try {
    const deletedPC = await PhanCongTrucGV.destroy({ where: {}, transaction: t });
    console.log(`  ✔ Đã xóa toàn bộ phân công trực GV thực tế (số lượng: ${deletedPC})`);

    const deletedLK = await LichTrucCoDinh.destroy({ where: {}, transaction: t });
    console.log(`  ✔ Đã xóa toàn bộ lịch trực cố định (số lượng: ${deletedLK})`);

    // Reset sequences nếu có
    try {
      await sequelize.query("SELECT setval(pg_get_serial_sequence('nghiepvu_phancongtrucgv', 'id'), 1, false);", { transaction: t });
      await sequelize.query("SELECT setval(pg_get_serial_sequence('nghiepvu_lichtruccodinh', 'id'), 1, false);", { transaction: t });
      console.log('  ✔ Đã reset sequence ID của 2 bảng về 1');
    } catch (seqErr) {
      console.warn('  ⚠️ Bỏ qua reset sequence:', seqErr.message);
    }

    await t.commit();
    console.log('🎉 Giao dịch (Transaction) đã hoàn tất thành công!');
  } catch (err) {
    await t.rollback();
    console.error('❌ Lỗi khi xóa dữ liệu, đã rollback toàn bộ:', err);
    process.exit(1);
  }

  // 3. Kiểm tra lại kết quả
  const countPC = await PhanCongTrucGV.count();
  const countLK = await LichTrucCoDinh.count();
  console.log('\n📊 KẾT QUẢ KIỂM TRA SAU KHI XÓA:');
  console.log(`   - Phân công trực GV (PhanCongTrucGV): ${countPC}`);
  console.log(`   - Lịch trực cố định (LichTrucCoDinh): ${countLK}`);

  if (countPC === 0 && countLK === 0) {
    console.log('✅ Cả 2 bảng lịch trực đã sạch hoàn toàn, sẵn sàng thiết lập Lịch mới!');
  } else {
    console.warn('⚠️ Vẫn còn bản ghi chưa xóa xong!');
  }

  process.exit(0);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
