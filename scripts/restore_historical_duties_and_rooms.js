const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { sequelize, Phong, PhanCongTrucGV, DiemDanhPhong, DiemDanhDraft, GiaoVien } = require('../src/models');

async function run() {
  console.log('🔄 BẮT ĐẦU KHÔI PHỤC PHÒNG LỊCH SỬ VÀ DỮ LIỆU CÔNG TRỰC BỊ THIẾU...');
  await sequelize.authenticate();
  console.log('✅ Đã kết nối cơ sở dữ liệu.');

  // 1. Đảm bảo cột dang_dung tồn tại trong quanli_phong
  await sequelize.query('ALTER TABLE "quanli_phong" ADD COLUMN IF NOT EXISTS "dang_dung" BOOLEAN DEFAULT true;');
  console.log('✅ Đã đảm bảo cột dang_dung trong quanli_phong.');

  // Đặt các phòng hiện tại là dang_dung = true
  await sequelize.query('UPDATE "quanli_phong" SET "dang_dung" = true WHERE "dang_dung" IS NULL;');

  // 2. Thêm lại 6 phòng lịch sử với dang_dung = false
  const historicalRooms = [
    { ma_phong: 'HT.A', loai_phong: 0, suc_chua: 340, gioi_tinh: null, sl_diem_danh: 3, sl_ho_tro: 3, dang_dung: false },
    { ma_phong: 'A20',  loai_phong: 1, suc_chua: 116, gioi_tinh: 0,    sl_diem_danh: 2, sl_ho_tro: 1, dang_dung: false },
    { ma_phong: 'E',    loai_phong: 1, suc_chua: 80,  gioi_tinh: 0,    sl_diem_danh: 1, sl_ho_tro: 1, dang_dung: false },
    { ma_phong: 'E1',   loai_phong: 1, suc_chua: 56,  gioi_tinh: 0,    sl_diem_danh: 1, sl_ho_tro: 1, dang_dung: false },
    { ma_phong: 'E2',   loai_phong: 1, suc_chua: 92,  gioi_tinh: 1,    sl_diem_danh: 1, sl_ho_tro: 1, dang_dung: false },
    { ma_phong: 'E3',   loai_phong: 1, suc_chua: 90,  gioi_tinh: 1,    sl_diem_danh: 1, sl_ho_tro: 1, dang_dung: false }
  ];

  for (const hr of historicalRooms) {
    const [p, created] = await Phong.findOrCreate({
      where: { ma_phong: hr.ma_phong },
      defaults: hr
    });
    if (!created) {
      await p.update({ dang_dung: false });
    }
    console.log(`  🏠 Phòng lịch sử: ${hr.ma_phong} (dang_dung = false)`);
  }

  // 3. Đọc dữ liệu backup
  const backupPath = path.join(__dirname, '../../__BACKUP_2026-09-25_THAY_PHONG/backup_full_2026-09-25T02-10-23-974Z.json');
  if (!fs.existsSync(backupPath)) {
    throw new Error('Không tìm thấy file backup: ' + backupPath);
  }
  const backupData = JSON.parse(fs.readFileSync(backupPath, 'utf8'));

  // 4. Khôi phục PhanCongTrucGV bị thiếu
  const currentPC = await PhanCongTrucGV.findAll({ raw: true });
  const pcKey = p => `${p.ngay}_${p.ma_phong_id}_${p.ma_gv_id}_${p.loai_truc}`;
  const currentPCSet = new Set(currentPC.map(pcKey));

  const missingPC = backupData.PhanCongTrucGV.filter(p => !currentPCSet.has(pcKey(p)));
  console.log(`📦 Tìm thấy ${missingPC.length} bản ghi PhanCongTrucGV cần khôi phục.`);

  if (missingPC.length > 0) {
    // Chuẩn bị records để bulk insert (bỏ id để auto increment an toàn hoặc giữ id nếu không trùng)
    const pcToInsert = missingPC.map(p => ({
      ma_gv_id: p.ma_gv_id,
      ma_gv_truc_thay_id: p.ma_gv_truc_thay_id || null,
      ten_gv_truc_thay: p.ten_gv_truc_thay || null,
      ma_phong_id: p.ma_phong_id,
      ngay: p.ngay,
      loai_truc: p.loai_truc,
      xac_nhan_truc: p.xac_nhan_truc !== false,
      nhiem_vu: p.nhiem_vu ?? 0,
      ngay_cap_nhat: p.ngay_cap_nhat || null,
      nguoi_cap_nhat_id: p.nguoi_cap_nhat_id || null
    }));
    await PhanCongTrucGV.bulkCreate(pcToInsert);
    console.log(`✅ Đã khôi phục thành công ${pcToInsert.length} bản ghi PhanCongTrucGV!`);
  }

  // 5. Khôi phục DiemDanhPhong bị thiếu
  const currentDP = await DiemDanhPhong.findAll({ raw: true });
  const dpKey = p => `${p.ngay}_${p.ma_phong_id || p.ma_phong}_${p.loai_truc !== undefined ? p.loai_truc : p.loai}`;
  const currentDPSet = new Set(currentDP.map(dpKey));

  const missingDP = backupData.DiemDanhPhong.filter(p => !currentDPSet.has(dpKey(p)));
  console.log(`📦 Tìm thấy ${missingDP.length} bản ghi DiemDanhPhong cần khôi phục.`);

  if (missingDP.length > 0) {
    const dpToInsert = missingDP.map(p => ({
      ma_phong_id: p.ma_phong_id || p.ma_phong,
      ngay: p.ngay,
      loai_truc: p.loai_truc !== undefined ? p.loai_truc : p.loai,
      da_diem_danh: p.da_diem_danh !== false,
      thoi_gian: p.thoi_gian || null,
      trang_thai_chot: p.trang_thai_chot || 0,
      ma_gv_chot_id: p.ma_gv_chot_id || null,
      ghi_chu_chot: p.ghi_chu_chot || null
    }));
    await DiemDanhPhong.bulkCreate(dpToInsert);
    console.log(`✅ Đã khôi phục thành công ${dpToInsert.length} bản ghi DiemDanhPhong!`);
  }

  // 6. Khôi phục DiemDanhDraft bị thiếu
  const currentDD = await DiemDanhDraft.findAll({ raw: true });
  const currentDDSet = new Set(currentDD.map(dpKey));

  const missingDD = backupData.DiemDanhDraft.filter(p => !currentDDSet.has(dpKey(p)));
  console.log(`📦 Tìm thấy ${missingDD.length} bản ghi DiemDanhDraft cần khôi phục.`);

  if (missingDD.length > 0) {
    const ddToInsert = missingDD.map(p => ({
      ma_phong_id: p.ma_phong_id || p.ma_phong,
      ngay: p.ngay,
      loai_truc: p.loai_truc !== undefined ? p.loai_truc : p.loai,
      ma_gv_id: p.ma_gv_id || null,
      danh_sach_hs: p.danh_sach_hs || {},
      is_chot: p.is_chot || false,
      updated_at: p.updated_at || new Date()
    }));
    await DiemDanhDraft.bulkCreate(ddToInsert);
    console.log(`✅ Đã khôi phục thành công ${ddToInsert.length} bản ghi DiemDanhDraft!`);
  }

  // 7. Kiểm tra kết quả Bảng lương cho Bùi Phùng Đức Anh và toàn bộ giáo viên
  const gvDucAnh = await GiaoVien.findOne({ where: { ho_ten: 'Bùi Phùng Đức Anh' } });
  if (gvDucAnh) {
    const pcDucAnh = await PhanCongTrucGV.findAll({ where: { ma_gv_id: gvDucAnh.id }, raw: true });
    const caAn = pcDucAnh.filter(p => p.loai_truc === 0 && p.ngay <= '2026-09-26');
    const caNgu = pcDucAnh.filter(p => p.loai_truc === 1 && p.ngay <= '2026-09-26');
    console.log('\n🔍 KIỂM TRA BÙI PHÙNG ĐỨC ANH:');
    console.log(`- Ca Ăn (01/09 - 26/09): ${caAn.length} ca`);
    console.log(`- Ca Ngủ (01/09 - 26/09): ${caNgu.length} ca`);
    console.log(`- Thành tiền dự kiến: ${(caAn.length * 100000 + caNgu.length * 180000).toLocaleString('vi-VN')}đ`);
  }

  console.log('\n🎉 HOÀN TẤT KHÔI PHỤC DỮ LIỆU LỊCH SỬ!');
}

run().then(() => process.exit(0)).catch(e => {
  console.error('❌ Lỗi:', e);
  process.exit(1);
});
