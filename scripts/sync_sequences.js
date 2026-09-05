require('dotenv').config();
const { sequelize, HocSinh } = require('../src/models');

async function main() {
  await sequelize.authenticate();
  console.log('Connected to DB.');

  // Đồng bộ sequence học sinh
  await sequelize.query(`
    SELECT setval('quanli_hocsinh_id_seq', COALESCE((SELECT MAX(id) FROM quanli_hocsinh), 1), true);
  `);
  
  // Đồng bộ sequence giáo viên (nếu có)
  try {
    await sequelize.query(`
      SELECT setval('quanli_giaovien_id_seq', COALESCE((SELECT MAX(id) FROM quanli_giaovien), 1), true);
    `);
  } catch (e) {
    console.log('quanli_giaovien_id_seq not found or skipped:', e.message);
  }

  // Đồng bộ sequence lịch trực cố định (nếu có)
  try {
    await sequelize.query(`
      SELECT setval('nghiepvu_lichtruccodinh_id_seq', COALESCE((SELECT MAX(id) FROM nghiepvu_lichtruccodinh), 1), true);
    `);
  } catch (e) {
    console.log('nghiepvu_lichtruccodinh_id_seq skipped:', e.message);
  }

  const [seq] = await sequelize.query(`SELECT last_value, is_called FROM quanli_hocsinh_id_seq;`);
  console.log('✅ New quanli_hocsinh_id_seq value:', seq);

  // Thử tạo một học sinh kiểm tra
  const testStudent = await HocSinh.create({
    ho_ten: 'Trịnh Phúc Đăng Ánh',
    gioi_tinh: 0,
    lop: '10A8',
    ma_phong_an_id: 'P2',
    ma_phong_ngu_id: 'A20',
    dang_hoc: true,
    ghi_chu: 'Học sinh test tạo mới'
  });
  console.log('🎉 Thêm thử học sinh thành công! ID mới:', testStudent.id);

  // Xóa học sinh test sau khi xác nhận thành công
  await testStudent.destroy();
  console.log('🗑️ Đã dọn học sinh test thành công.');

  // Đồng bộ lại lần nữa
  await sequelize.query(`
    SELECT setval('quanli_hocsinh_id_seq', COALESCE((SELECT MAX(id) FROM quanli_hocsinh), 1), true);
  `);

  process.exit(0);
}

main().catch(err => {
  console.error('❌ Lỗi:', err);
  process.exit(1);
});
