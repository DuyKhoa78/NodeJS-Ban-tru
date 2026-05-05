/**
 * Script xóa dữ liệu (TRUNCATE) các bảng nghiệp vụ
 * Giữ lại: quanli_phong, quanli_hocsinh, quanli_giaovien, accounts_staffuser
 *           core_cauhinh_he_thong, core_cauhinh_gia
 * Xóa sạch: tất cả bảng điểm danh, lịch trực, vật dụng, cấu hình tuần
 */
require('dotenv').config();
const { Sequelize } = require('sequelize');
const seq = new Sequelize(process.env.DATABASE_URL, { dialect: 'postgres', logging: false });

const TABLES_TO_CLEAR = [
  'nghiepvu_diemdanhhs',        // Điểm danh học sinh
  'nghiepvu_diemdanhphong',     // Điểm danh phòng
  'nghiepvu_phancongtrucgv',    // Phân công trực giáo viên
  'nghiepvu_lichtruccodinh',    // Lịch trực cố định
  'nghiepvu_muavatdung',        // Mua vật dụng
  'nghiepvu_phanbovatdung',     // Phân bổ vật dụng
  'core_cauhinh_tuan',          // Cấu hình tuần (show_t5...)
];

async function run() {
  console.log('⚠️  Bắt đầu xóa dữ liệu...\n');
  for (const table of TABLES_TO_CLEAR) {
    try {
      const [result] = await seq.query(`DELETE FROM "${table}"`);
      console.log(`✅ Đã xóa: ${table}`);
    } catch (e) {
      console.log(`❌ Lỗi xóa ${table}: ${e.message}`);
    }
  }
  console.log('\n✅ Hoàn thành! Các bảng đã được xóa sạch dữ liệu.');
  console.log('📌 Giữ nguyên: quanli_phong, quanli_hocsinh, quanli_giaovien, accounts_staffuser, core_cauhinh_he_thong, core_cauhinh_gia');
  await seq.close();
}

run();
