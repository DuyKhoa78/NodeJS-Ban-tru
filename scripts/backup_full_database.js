/**
 * scripts/backup_full_database.js
 * Sao lưu toàn bộ các bảng trong cơ sở dữ liệu ra file JSON
 */
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const {
  sequelize,
  StaffUser,
  Phong,
  GiaoVien,
  HocSinh,
  DiemDanhHS,
  DiemDanhPhong,
  DiemDanhDraft,
  PhanCongTrucGV,
  LichTrucCoDinh,
  MuaVatDung,
  PhanBoVatDung,
  CauHinhGia,
  CauHinhHeThong,
  CauHinhTuan,
  CauHinhNgay,
  LichSuThaoTac,
  BaoCaoTruc,
} = require('../src/models');

async function runBackup() {
  console.log('🔄 Đang kết nối cơ sở dữ liệu để sao lưu...');
  await sequelize.authenticate();
  console.log('✅ Kết nối database thành công.');

  const backupDir = path.join(__dirname, '..', 'backup');
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  const now = new Date();
  const timestamp = now.toISOString().replace(/[:.]/g, '-');
  const backupFileName = `backup_full_${timestamp}.json`;
  const backupFilePath = path.join(backupDir, backupFileName);

  console.log('📦 Bắt đầu đọc dữ liệu từ tất cả các bảng...');

  const backupData = {
    metadata: {
      timestamp: now.toISOString(),
      reason: 'Backup trước khi sửa lỗi bảo mật P0, QR điểm danh và các cải thiện hệ thống',
    },
    StaffUser: await StaffUser.findAll({ raw: true }).catch(e => ({ error: e.message })),
    Phong: await Phong.findAll({ raw: true }).catch(e => ({ error: e.message })),
    GiaoVien: await GiaoVien.findAll({ raw: true }).catch(e => ({ error: e.message })),
    HocSinh: await HocSinh.findAll({ raw: true }).catch(e => ({ error: e.message })),
    DiemDanhHS: await DiemDanhHS.findAll({ raw: true }).catch(e => ({ error: e.message })),
    DiemDanhPhong: await DiemDanhPhong.findAll({ raw: true }).catch(e => ({ error: e.message })),
    DiemDanhDraft: DiemDanhDraft ? await DiemDanhDraft.findAll({ raw: true }).catch(e => ({ error: e.message })) : [],
    PhanCongTrucGV: await PhanCongTrucGV.findAll({ raw: true }).catch(e => ({ error: e.message })),
    LichTrucCoDinh: await LichTrucCoDinh.findAll({ raw: true }).catch(e => ({ error: e.message })),
    MuaVatDung: await MuaVatDung.findAll({ raw: true }).catch(e => ({ error: e.message })),
    PhanBoVatDung: await PhanBoVatDung.findAll({ raw: true }).catch(e => ({ error: e.message })),
    CauHinhGia: await CauHinhGia.findAll({ raw: true }).catch(e => ({ error: e.message })),
    CauHinhHeThong: await CauHinhHeThong.findAll({ raw: true }).catch(e => ({ error: e.message })),
    CauHinhTuan: await CauHinhTuan.findAll({ raw: true }).catch(e => ({ error: e.message })),
    CauHinhNgay: await CauHinhNgay.findAll({ raw: true }).catch(e => ({ error: e.message })),
    LichSuThaoTac: await LichSuThaoTac.findAll({ raw: true }).catch(e => ({ error: e.message })),
    BaoCaoTruc: BaoCaoTruc ? await BaoCaoTruc.findAll({ raw: true }).catch(e => ({ error: e.message })) : [],
  };

  fs.writeFileSync(backupFilePath, JSON.stringify(backupData, null, 2), 'utf-8');

  const stats = fs.statSync(backupFilePath);
  console.log(`\n==============================================`);
  console.log(`🎉 SAO LƯU THÀNH CÔNG!`);
  console.log(`📁 File: ${backupFilePath}`);
  console.log(`📊 Dung lượng: ${(stats.size / 1024).toFixed(2)} KB`);
  console.log(`- StaffUser: ${Array.isArray(backupData.StaffUser) ? backupData.StaffUser.length : 0}`);
  console.log(`- Học sinh: ${Array.isArray(backupData.HocSinh) ? backupData.HocSinh.length : 0}`);
  console.log(`- Giáo viên: ${Array.isArray(backupData.GiaoVien) ? backupData.GiaoVien.length : 0}`);
  console.log(`- Điểm danh HS: ${Array.isArray(backupData.DiemDanhHS) ? backupData.DiemDanhHS.length : 0}`);
  console.log(`- Điểm danh Phòng: ${Array.isArray(backupData.DiemDanhPhong) ? backupData.DiemDanhPhong.length : 0}`);
  console.log(`- Bản nháp (Draft): ${Array.isArray(backupData.DiemDanhDraft) ? backupData.DiemDanhDraft.length : 0}`);
  console.log(`- Phân công trực GV: ${Array.isArray(backupData.PhanCongTrucGV) ? backupData.PhanCongTrucGV.length : 0}`);
  console.log(`==============================================\n`);

  process.exit(0);
}

runBackup().catch((err) => {
  console.error('❌ Lỗi khi thực hiện sao lưu:', err);
  process.exit(1);
});
