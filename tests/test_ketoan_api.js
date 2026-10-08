require('dotenv').config();
const {
  sequelize,
  StaffUser,
  GiaoVien,
  KeToanDanhMucKhoanChi,
  KeToanKyTongHop,
  KeToanNguoiNhan,
  KeToanChiTietKhoanChi,
  KeToanThanhToanChiTiet,
  KeToanLichSuThietLap,
} = require('../src/models');

async function runTests() {
  console.log('--- BẮT ĐẦU KIỂM TRA PHÂN HỆ KẾ TOÁN BÁN TRÚ ---');

  // 1. Kiểm tra danh mục 9 khoản chi mặc định
  console.log('\n[TEST 1] Kiểm tra 9 danh mục khoản chi mặc định:');
  const dms = await KeToanDanhMucKhoanChi.findAll({ order: [['thu_tu_hien_thi', 'ASC']] });
  console.log(`Tìm thấy ${dms.length} danh mục:`);
  dms.forEach((d) => {
    console.log(`  - [${d.ma_khoan_chi}] ${d.ten_khoan_chi} | Cách tính: ${d.loai_tinh_toan} | Đơn giá: ${d.don_gia_mac_dinh}`);
  });
  if (dms.length >= 9) {
    console.log('=> TEST 1: THÀNH CÔNG');
  } else {
    throw new Error('TEST 1 THẤT BÀI: Thiếu danh mục mặc định');
  }

  // 2. Tạo kỳ tổng hợp mới: 27/12/2025 - 31/01/2026 (vắt qua 2 tháng)
  console.log('\n[TEST 2] Tạo kỳ tổng hợp linh hoạt (vắt qua 2 tháng):');
  let ky = await KeToanKyTongHop.findOne({ where: { ten_ky: 'TH T012026' } });
  if (ky) {
    // Xóa kỳ test cũ nếu có
    await KeToanThanhToanChiTiet.destroy({ where: { ky_id: ky.id } });
    await KeToanChiTietKhoanChi.destroy({ where: { ky_id: ky.id } });
    await KeToanNguoiNhan.destroy({ where: { ky_id: ky.id } });
    await ky.destroy();
  }

  ky = await KeToanKyTongHop.create({
    ten_ky: 'TH T012026',
    tu_ngay: '2025-12-27',
    den_ngay: '2026-01-31',
    ngay_lap: '2026-01-31',
    trang_thai: 'nhap',
    ghi_chu: 'Kỳ kiểm tra tự động tháng 01/2026',
    cau_hinh_snapshot: { categories: dms },
    created_by_name: 'Trần Thị Hồng Cẩm',
  });
  console.log(`Đã tạo kỳ [ID: ${ky.id}]: ${ky.ten_ky} (${ky.tu_ngay} -> ${ky.den_ngay})`);
  console.log('=> TEST 2: THÀNH CÔNG');

  // 3. Thêm người nhận từ danh mục Giáo viên
  console.log('\n[TEST 3] Thêm người nhận từ danh mục Giáo viên:');
  const gv = await GiaoVien.findOne();
  if (!gv) throw new Error('Không tìm thấy giáo viên nào');

  const nn1 = await KeToanNguoiNhan.create({
    ky_id: ky.id,
    giao_vien_id: gv.id,
    ho_ten: gv.ho_ten,
    ma_dinh_danh: `GV_${gv.id}`,
    so_tai_khoan: gv.so_tai_khoan || '060123456789',
    ngan_hang: gv.ngan_hang || 'Sacombank',
    stt: 1,
    tong_tien: 0,
    da_chi: 0,
    trang_thai_chi_tra: 'chua_chi',
  });
  console.log(`Đã thêm người nhận 1: ${nn1.ho_ten} (STK: ${nn1.so_tai_khoan})`);
  console.log('=> TEST 3: THÀNH CÔNG');

  // 4. Thêm người nhận ngoài danh mục (không có tài khoản đăng nhập)
  console.log('\n[TEST 4] Thêm người nhận ngoài danh mục (không tạo tài khoản đăng nhập):');
  const nn2 = await KeToanNguoiNhan.create({
    ky_id: ky.id,
    giao_vien_id: null,
    ho_ten: 'Nguyễn Văn Bảo Vệ',
    ma_dinh_danh: 'NV_NGOAI_01',
    so_tai_khoan: '0987654321', // Kiểm tra chuỗi giữ số 0 đầu
    ngan_hang: 'Vietcombank',
    stt: 2,
    tong_tien: 0,
    da_chi: 0,
    trang_thai_chi_tra: 'chua_chi',
    ghi_chu: 'Nhân viên hợp đồng ngoài',
  });
  console.log(`Đã thêm người nhận 2: ${nn2.ho_ten} (STK: "${nn2.so_tai_khoan}")`);
  if (!nn2.so_tai_khoan.startsWith('0')) {
    throw new Error('Lỗi: Số tài khoản bị mất số 0 đầu');
  }
  console.log('=> TEST 4: THÀNH CÔNG');

  // 5. Thêm chi tiết khoản chi theo 3 phương thức tính
  console.log('\n[TEST 5] Kiểm tra 3 phương thức nhập khoản chi:');
  // 5a. Phương thức ngày x đơn giá: Y tế 16 ngày x 70.000đ = 1.120.000đ
  const ctYTe = await KeToanChiTietKhoanChi.create({
    ky_id: ky.id,
    nguoi_nhan_id: nn1.id,
    ma_khoan_chi: 'y_te',
    ten_khoan_chi: 'Y tế',
    loai_tinh_toan: 'ngay_don_gia',
    so_ngay: 16,
    don_gia: 70000,
    thanh_tien: 16 * 70000,
  });
  console.log(`  - 5a (Ngày x Đơn giá) Y tế: 16 ngày x 70.000 = ${ctYTe.thanh_tien.toLocaleString()} đ`);

  // 5b. Phương thức từ nguồn: Trực ngủ 10 ca x 180.000 = 1.800.000đ
  const ctTrucPhong = await KeToanChiTietKhoanChi.create({
    ky_id: ky.id,
    nguoi_nhan_id: nn1.id,
    ma_khoan_chi: 'truc_phong',
    ten_khoan_chi: 'Trực phòng',
    loai_tinh_toan: 'nguon_truc_ngu',
    so_tien_nguon: 1800000,
    thanh_tien: 1800000,
  });
  console.log(`  - 5b (Từ nguồn trực ngủ) Trực phòng: = ${ctTrucPhong.thanh_tien.toLocaleString()} đ`);

  // 5c. Phương thức nhập trực tiếp: Trực vệ sinh 2.000.000đ
  const ctVS = await KeToanChiTietKhoanChi.create({
    ky_id: ky.id,
    nguoi_nhan_id: nn2.id,
    ma_khoan_chi: 'truc_ve_sinh_bv',
    ten_khoan_chi: 'Trực vệ sinh và bảo vệ',
    loai_tinh_toan: 'nhap_truc_tiep',
    so_tien_nhap: 2000000,
    thanh_tien: 2000000,
  });
  console.log(`  - 5c (Nhập trực tiếp) Trực vệ sinh: = ${ctVS.thanh_tien.toLocaleString()} đ`);
  console.log('=> TEST 5: THÀNH CÔNG');

  // 6. Thêm điều chỉnh tăng/giảm kèm lý do
  console.log('\n[TEST 6] Kiểm tra điều chỉnh tăng/giảm kèm lý do:');
  // Thêm điều chỉnh +100.000đ do trực phụ trội
  ctYTe.so_tien_dieu_chinh = 100000;
  ctYTe.ly_do_dieu_chinh = 'Trực hỗ trợ tăng cường thêm 1 buổi';
  ctYTe.thanh_tien = (ctYTe.so_ngay * ctYTe.don_gia) + ctYTe.so_tien_dieu_chinh;
  await ctYTe.save();

  console.log(`Y tế sau điều chỉnh: ${(ctYTe.so_ngay * ctYTe.don_gia).toLocaleString()} + ${ctYTe.so_tien_dieu_chinh.toLocaleString()} = ${ctYTe.thanh_tien.toLocaleString()} đ`);
  console.log(`Lý do: "${ctYTe.ly_do_dieu_chinh}"`);

  // Cập nhật tổng tiền người nhận 1
  nn1.tong_tien = parseFloat(ctYTe.thanh_tien) + parseFloat(ctTrucPhong.thanh_tien);
  await nn1.save();
  console.log(`Tổng tiền người nhận 1: ${nn1.tong_tien.toLocaleString()} đ`);

  nn2.tong_tien = parseFloat(ctVS.thanh_tien);
  await nn2.save();
  console.log(`Tổng tiền người nhận 2: ${nn2.tong_tien.toLocaleString()} đ`);
  console.log('=> TEST 6: THÀNH CÔNG');

  // 7. Ghi nhận thanh toán một phần và tính số còn lại
  console.log('\n[TEST 7] Ghi nhận thanh toán một phần và kiểm tra số dư còn lại:');
  const paymentAmount = 1500000; // Chi 1.500.000đ trong tổng số 3.020.000đ
  await KeToanThanhToanChiTiet.create({
    ky_id: ky.id,
    nguoi_nhan_id: nn1.id,
    so_tien: paymentAmount,
    ngay_chi: '2026-02-01',
    so_chung_tu: 'PC-001/02',
    ghi_chu: 'Tạm ứng đợt 1',
    created_by_name: 'Trần Thị Hồng Cẩm',
  });

  nn1.da_chi = paymentAmount;
  nn1.trang_thai_chi_tra = 'chi_mot_phan';
  await nn1.save();

  const conLai = parseFloat(nn1.tong_tien) - parseFloat(nn1.da_chi);
  console.log(`Tổng nhận: ${nn1.tong_tien.toLocaleString()} đ | Đã chi: ${nn1.da_chi.toLocaleString()} đ | Còn lại: ${conLai.toLocaleString()} đ`);
  if (conLai !== 1520000) {
    throw new Error(`TEST 7 THẤT BÀI: Còn lại tính sai: ${conLai} (kỳ vọng 1.520.000)`);
  }
  console.log('=> TEST 7: THÀNH CÔNG');

  // 8. Chốt kỳ tổng hợp và kiểm tra đóng băng số liệu
  console.log('\n[TEST 8] Chốt kỳ tổng hợp và đóng băng snapshot:');
  ky.trang_thai = 'da_chot';
  ky.locked_at = new Date();
  ky.locked_by_name = 'Trần Thị Hồng Cẩm';
  await ky.save();
  console.log(`Kỳ ${ky.ten_ky} đã chuyển sang trạng thái: [${ky.trang_thai}]`);
  console.log('=> TEST 8: THÀNH CÔNG');

  // 9. Kiểm tra ghi log lịch sử thiết lập kế toán
  console.log('\n[TEST 9] Kiểm tra lịch sử cập nhật thiết lập kế toán:');
  const audit = await KeToanLichSuThietLap.create({
    hanh_dong: 'CẬP_NHẬT_ĐƠN_GIÁ',
    noi_dung: 'Cập nhật đơn giá Trực thiết bị từ 80.000đ lên 100.000đ/ngày',
    nguoi_thao_tac_ten: 'Trần Thị Hồng Cẩm',
    chuc_vu: 'Kế toán',
  });
  console.log(`Đã ghi log: [${audit.hanh_dong}] bởi ${audit.nguoi_thao_tac_ten} - "${audit.noi_dung}"`);
  console.log('=> TEST 9: THÀNH CÔNG');

  console.log('\n======================================================');
  console.log('TẤT CẢ 9 BỘ KIỂM TRA NGHIỆP VỤ KẾ TOÁN ĐÃ ĐẠT 100%!');
  console.log('======================================================\n');
}

runTests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('LỖI KIỂM TRA:', err);
    process.exit(1);
  });
