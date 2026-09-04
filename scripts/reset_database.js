require('dotenv').config();
const fs = require('fs');
const path = require('path');
const {
  sequelize,
  StaffUser,
  Phong,
  GiaoVien,
  HocSinh,
  MuaVatDung,
  PhanBoVatDung,
  CauHinhGia,
  CauHinhHeThong,
  DiemDanhHS,
  DiemDanhPhong,
  PhanCongTrucGV,
  LichTrucCoDinh,
  CauHinhTuan,
  CauHinhNgay,
  LichSuThaoTac,
} = require('../src/models');

async function main() {
  console.log('🔄 Đang kết nối cơ sở dữ liệu...');
  await sequelize.authenticate();
  console.log('✅ Kết nối cơ sở dữ liệu thành công.');

  // 1. Sao lưu dữ liệu
  console.log('📦 Bắt đầu sao lưu toàn bộ dữ liệu trước khi reset...');
  const backupData = {
    timestamp: new Date().toISOString(),
    StaffUser: await StaffUser.findAll({ raw: true }),
    Phong: await Phong.findAll({ raw: true }),
    GiaoVien: await GiaoVien.findAll({ raw: true }),
    HocSinh: await HocSinh.findAll({ raw: true }),
    DiemDanhHS: await DiemDanhHS.findAll({ raw: true }),
    DiemDanhPhong: await DiemDanhPhong.findAll({ raw: true }),
    PhanCongTrucGV: await PhanCongTrucGV.findAll({ raw: true }),
    LichTrucCoDinh: await LichTrucCoDinh.findAll({ raw: true }),
    MuaVatDung: await MuaVatDung.findAll({ raw: true }),
    PhanBoVatDung: await PhanBoVatDung.findAll({ raw: true }),
    CauHinhGia: await CauHinhGia.findAll({ raw: true }),
    CauHinhHeThong: await CauHinhHeThong.findAll({ raw: true }),
    CauHinhTuan: await CauHinhTuan.findAll({ raw: true }),
    CauHinhNgay: await CauHinhNgay.findAll({ raw: true }),
    LichSuThaoTac: await LichSuThaoTac.findAll({ raw: true }),
  };

  const backupDir = path.join(__dirname, '..', 'backup');
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  const backupFileName = `backup_before_reset_${Date.now()}.json`;
  const backupFilePath = path.join(backupDir, backupFileName);
  fs.writeFileSync(backupFilePath, JSON.stringify(backupData, null, 2), 'utf-8');
  console.log(`✅ Đã sao lưu dữ liệu vào: ${backupFilePath}`);
  console.log(`   - Số HS đã sao lưu: ${backupData.HocSinh.length}`);
  console.log(`   - Số điểm danh đã sao lưu: ${backupData.DiemDanhHS.length}`);

  // 2. Thực hiện xóa dữ liệu trong transaction
  console.log('⚡ Bắt đầu tiến hành reset dữ liệu theo yêu cầu...');
  const t = await sequelize.transaction();

  try {
    // Xóa điểm danh học sinh
    await DiemDanhHS.destroy({ where: {}, truncate: false, transaction: t });
    console.log('  ✔ Đã xóa toàn bộ điểm danh học sinh (DiemDanhHS)');

    // Xóa điểm danh phòng
    await DiemDanhPhong.destroy({ where: {}, truncate: false, transaction: t });
    console.log('  ✔ Đã xóa toàn bộ điểm danh phòng (DiemDanhPhong)');

    // Xóa phân công trực
    await PhanCongTrucGV.destroy({ where: {}, truncate: false, transaction: t });
    console.log('  ✔ Đã xóa phân công trực giáo viên (PhanCongTrucGV)');

    // Xóa lịch trực khung cố định
    await LichTrucCoDinh.destroy({ where: {}, truncate: false, transaction: t });
    console.log('  ✔ Đã xóa lịch trực khung cố định (LichTrucCoDinh)');

    // Xóa học sinh
    await HocSinh.destroy({ where: {}, truncate: false, transaction: t });
    console.log('  ✔ Đã xóa toàn bộ học sinh (HocSinh)');

    // Xóa phân bổ vật dụng và mua vật dụng
    await PhanBoVatDung.destroy({ where: {}, truncate: false, transaction: t });
    await MuaVatDung.destroy({ where: {}, truncate: false, transaction: t });
    console.log('  ✔ Đã xóa dữ liệu vật dụng');

    // Xóa giáo viên
    await GiaoVien.destroy({ where: {}, truncate: false, transaction: t });
    console.log('  ✔ Đã xóa danh sách giáo viên (GiaoVien)');

    // Xóa cấu hình ngày và tuần
    await CauHinhNgay.destroy({ where: {}, truncate: false, transaction: t });
    await CauHinhTuan.destroy({ where: {}, truncate: false, transaction: t });
    console.log('  ✔ Đã xóa cấu hình ngày & tuần (CauHinhNgay, CauHinhTuan)');

    // Xóa nhật ký thao tác
    await LichSuThaoTac.destroy({ where: {}, truncate: false, transaction: t });
    console.log('  ✔ Đã xóa nhật ký thao tác (LichSuThaoTac)');

    // Cấu hình giá: Đặt lại về 2 mức giá chuẩn mặc định (0: Ăn trưa 100k, 1: Ngủ trưa 180k)
    await CauHinhGia.destroy({ where: {}, truncate: false, transaction: t });
    await CauHinhGia.bulkCreate([
      { id: 1, loai_truc: 0, don_gia: 100000, ngay_ap_dung: '2026-05-01' },
      { id: 2, loai_truc: 1, don_gia: 180000, ngay_ap_dung: '2026-05-01' },
    ], { transaction: t });
    console.log('  ✔ Đã đặt lại cấu hình giá mặc định (100.000đ ăn trưa, 180.000đ ngủ trưa)');

    // Reset sequences trong Postgres (nếu có)
    const resetSeqQueries = [
      "SELECT setval(pg_get_serial_sequence('quanli_hocsinh', 'id'), 1, false);",
      "SELECT setval(pg_get_serial_sequence('quanli_giaovien', 'id'), 1, false);",
      "SELECT setval(pg_get_serial_sequence('nghiepvu_diemdanhhs', 'id'), 1, false);",
      "SELECT setval(pg_get_serial_sequence('core_caulhinhgia', 'id'), 2, true);",
      "SELECT setval(pg_get_serial_sequence('core_lichsuthaotac', 'id'), 1, false);",
    ];

    for (const q of resetSeqQueries) {
      try {
        await sequelize.query(q, { transaction: t });
      } catch (err) {
        // Bỏ qua nếu bảng không dùng sequence tiêu chuẩn
      }
    }
    console.log('  ✔ Đã reset các sequence ID về ban đầu');

    await t.commit();
    console.log('🎉 Giao dịch (Transaction) đã hoàn tất thành công!');
  } catch (error) {
    await t.rollback();
    console.error('❌ Có lỗi xảy ra, đã rollback toàn bộ thay đổi:', error);
    process.exit(1);
  }

  // 3. Kiểm tra lại số lượng bản ghi sau khi xóa
  console.log('\n📊 THỐNG KÊ SAU KHI RESET:');
  const postCounts = {
    'Tài khoản (StaffUser)': await StaffUser.count(),
    'Phòng (Phong)': await Phong.count(),
    'Học sinh (HocSinh)': await HocSinh.count(),
    'Điểm danh HS (DiemDanhHS)': await DiemDanhHS.count(),
    'Điểm danh Phòng (DiemDanhPhong)': await DiemDanhPhong.count(),
    'Giáo viên (GiaoVien)': await GiaoVien.count(),
    'Lịch trực khung (LichTrucCoDinh)': await LichTrucCoDinh.count(),
    'Phân công trực (PhanCongTrucGV)': await PhanCongTrucGV.count(),
    'Cấu hình giá (CauHinhGia)': await CauHinhGia.count(),
    'Cấu hình hệ thống (CauHinhHeThong)': await CauHinhHeThong.count(),
    'Cấu hình ngày (CauHinhNgay)': await CauHinhNgay.count(),
    'Cấu hình tuần (CauHinhTuan)': await CauHinhTuan.count(),
    'Lịch sử thao tác (LichSuThaoTac)': await LichSuThaoTac.count(),
  };

  console.table(postCounts);
  console.log('✅ Hoàn tất thành công!');
  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
