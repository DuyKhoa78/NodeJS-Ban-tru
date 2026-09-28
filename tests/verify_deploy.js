require('dotenv').config();
const {
  sequelize,
  StaffUser,
  GiaoVien,
  HocSinh,
  Phong,
  PhanCongTrucGV,
  LichTrucCoDinh,
  CauHinhHeThong,
  CauHinhNgay,
  CauHinhGia,
  DiemDanhHS,
  DiemDanhPhong,
  DiemDanhDraft,
  BaoCaoTruc
} = require('../src/models');

async function verifyAll() {
  console.log('====================================================');
  console.log('🚀 KIỂM TRA TOÀN DIỆN HỆ THỐNG TRƯỚC KHI DEPLOY');
  console.log('====================================================\n');

  let passed = 0;
  let failed = 0;

  async function check(name, fn) {
    try {
      const result = await fn();
      console.log(`✅ [PASS] ${name}: ${result || 'OK'}`);
      passed++;
    } catch (err) {
      console.error(`❌ [FAIL] ${name}: ${err.message}`);
      failed++;
    }
  }

  // 1. Database Connection
  await check('Kết nối cơ sở dữ liệu PostgreSQL (Supabase)', async () => {
    await sequelize.authenticate();
    return 'Đã kết nối thành công';
  });

  // 2. Cấu hình Hệ thống
  await check('Bảng CauHinhHeThong', async () => {
    const config = await CauHinhHeThong.findByPk(1);
    if (!config) throw new Error('Chưa khởi tạo CauHinhHeThong (id=1)');
    return `Năm học ${config.nam_hoc || '2026-2027'}, Bảo trì: ${config.bao_tri ? 'Đang BẬT' : 'TẮT'}`;
  });

  // 3. Tài khoản người dùng
  await check('Tài khoản StaffUser & Phân quyền', async () => {
    const users = await StaffUser.findAll();
    if (users.length === 0) throw new Error('Không có tài khoản nào');
    const roles = [...new Set(users.map(u => u.role))];
    const admin = users.find(u => u.role === 'admin' || u.is_superuser);
    if (!admin) throw new Error('Thiếu tài khoản quản trị (admin/super_admin)');
    return `Tổng ${users.length} tài khoản, gồm các vai trò: [${roles.join(', ')}]`;
  });

  // 4. Danh mục Giáo viên
  await check('Danh mục Giáo viên (GiaoVien)', async () => {
    const gvs = await GiaoVien.findAll();
    return `Tổng ${gvs.length} giáo viên trong hệ thống`;
  });

  // 5. Danh mục Phòng
  await check('Danh mục Phòng (Phòng Ăn & Phòng Ngủ)', async () => {
    const phongs = await Phong.findAll();
    const an = phongs.filter(p => p.loai_phong === 0);
    const ngu = phongs.filter(p => p.loai_phong === 1);
    return `Tổng ${phongs.length} phòng (${an.length} phòng ăn, ${ngu.length} phòng ngủ)`;
  });

  // 6. Danh sách Học sinh
  await check('Dữ liệu Học sinh (HocSinh)', async () => {
    const count = await HocSinh.count();
    const active = await HocSinh.count({ where: { dang_hoc: true } });
    return `Tổng ${count} học sinh (${active} đang học)`;
  });

  // 7. Lịch trực & Phân công
  await check('Phân công trực (PhanCongTrucGV) & Khung cố định', async () => {
    const pcCount = await PhanCongTrucGV.count();
    const khungCount = await LichTrucCoDinh.count();
    return `Phân công theo ngày: ${pcCount} lượt, Lịch khung: ${khungCount} lượt`;
  });

  // 8. Dữ liệu Điểm danh & Nháp
  await check('Dữ liệu Điểm danh (DiemDanhHS, DiemDanhPhong, DiemDanhDraft)', async () => {
    const hsCount = await DiemDanhHS.count();
    const phongCount = await DiemDanhPhong.count();
    const draftCount = await DiemDanhDraft.count();
    return `HS: ${hsCount} lượt, Phòng chốt: ${phongCount} lượt, Bản nháp: ${draftCount} bản`;
  });

  // 9. Báo cáo ca trực
  await check('Báo cáo trực (BaoCaoTruc)', async () => {
    const bcCount = await BaoCaoTruc.count();
    return `Tổng ${bcCount} báo cáo ca trực đã lưu`;
  });

  // 10. Cấu hình giá
  await check('Cấu hình giá tiền bán trú (CauHinhGia)', async () => {
    const giaCount = await CauHinhGia.count();
    return `${giaCount} mục cấu hình giá`;
  });

  // 11. Cơ chế Token JWT & Security
  await check('Cơ chế Token JWT & Token Version', async () => {
    const { generateToken, verifyToken } = require('../src/utils/token');
    const token = generateToken(1, 0, 3600000);
    const payload = verifyToken(token);
    if (!payload || payload.userId !== 1) throw new Error('Token verification failed');
    return 'Token sinh và xác thực chuẩn xác';
  });

  // 12. Password Hashing
  await check('Cơ chế Mã hóa Mật khẩu (bcrypt)', async () => {
    const { hashPassword, verifyPassword } = require('../src/utils/password');
    const hash = await hashPassword('Test123456@');
    const match = await verifyPassword('Test123456@', hash);
    if (!match) throw new Error('Password mismatch');
    return 'Bcrypt hashing hoạt động chính xác';
  });

  console.log('\n====================================================');
  console.log(`🏁 KẾT QUẢ KIỂM TRA: ${passed}/${passed + failed} HẠNG MỤC ĐẠT`);
  console.log('====================================================');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

verifyAll();
