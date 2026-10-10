require('dotenv').config();
const { sequelize } = require('../src/models');

async function cleanForDeploy() {
  console.log('🔄 BẮT ĐẦU DỌN SẠCH DỮ LIỆU KẾ TOÁN ĐỂ DEPLOY...');
  const t = await sequelize.transaction();
  try {
    // Xóa dữ liệu các bảng kế toán và restart identity về 1 (id bắt đầu từ 1 khi tạo mới, hiện tại = 0)
    await sequelize.query(`
      TRUNCATE TABLE 
        core_ke_toan_thanh_toan_chi_tiet,
        core_ke_toan_chi_tiet_khoan_chi,
        core_ke_toan_nguoi_nhan,
        core_ke_toan_ky_tong_hop,
        core_ke_toan_lich_su_thiet_lap
      RESTART IDENTITY CASCADE;
    `, { transaction: t });

    await t.commit();
    console.log('✅ ĐÃ DỌN SẠCH HOÀN TOÀN:');
    console.log('   - 0 kỳ tổng hợp (Đã xóa kỳ Tháng 09/2026)');
    console.log('   - 0 người nhận / chi tiết / thanh toán');
    console.log('   - 0 lịch sử thao tác thiết lập');
    console.log('   - Sequences đã RESTART IDENTITY về ban đầu');

    // Kiểm tra lại
    const [kys] = await sequelize.query('SELECT count(*) FROM core_ke_toan_ky_tong_hop');
    const [logs] = await sequelize.query('SELECT count(*) FROM core_ke_toan_lich_su_thiet_lap');
    console.log(`📊 Số kỳ hiện tại: ${kys[0].count}`);
    console.log(`📊 Số lịch sử thao tác: ${logs[0].count}`);
    process.exit(0);
  } catch (err) {
    await t.rollback();
    console.error('❌ Lỗi khi dọn dẹp:', err);
    process.exit(1);
  }
}

cleanForDeploy();
