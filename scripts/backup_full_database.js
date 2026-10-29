/**
 * scripts/backup_full_database.js
 * Sao lưu toàn bộ các bảng trong cơ sở dữ liệu ra file JSON
 */
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const models = require('../src/models');
const { sequelize } = models;

const MODEL_NAMES = [
  'StaffUser',
  'Phong',
  'GiaoVien',
  'HocSinh',
  'DiemDanhHS',
  'DiemDanhPhong',
  'DiemDanhDraft',
  'PhanCongTrucGV',
  'LichTrucCoDinh',
  'MuaVatDung',
  'PhanBoVatDung',
  'CauHinhGia',
  'CauHinhHeThong',
  'CauHinhTuan',
  'CauHinhNgay',
  'LichSuThaoTac',
  'BaoCaoTruc',
  'LichSuPhanPhong',
  'CauHinhDotThanhToan',
  'ThuTienBanTru',
  'KyTrucGV',
  'ThanhToanLuongGV',
  'KeToanDanhMucKhoanChi',
  'KeToanKyTongHop',
  'KeToanNguoiNhan',
  'KeToanChiTietKhoanChi',
  'KeToanThanhToanChiTiet',
  'KeToanLichSuThietLap',
];

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
      reason: 'Full Database Backup (toàn bộ 28 bảng hệ thống Bán Trú & Kế Toán)',
      total_tables: MODEL_NAMES.length,
    },
  };

  for (const name of MODEL_NAMES) {
    const model = models[name];
    if (model && typeof model.findAll === 'function') {
      backupData[name] = await model.findAll({ raw: true }).catch(e => ({ error: e.message }));
    } else {
      backupData[name] = [];
    }
  }

  fs.writeFileSync(backupFilePath, JSON.stringify(backupData, null, 2), 'utf-8');

  // Đồng thời lưu thêm bản sao ra thư mục gốc dự án (__BACKUP_2026-10-30_FULL)
  const rootBackupDir = path.join(__dirname, '..', '..', '__BACKUP_2026-10-30_FULL');
  if (!fs.existsSync(rootBackupDir)) {
    fs.mkdirSync(rootBackupDir, { recursive: true });
  }
  const rootBackupFilePath = path.join(rootBackupDir, backupFileName);
  fs.copyFileSync(backupFilePath, rootBackupFilePath);

  const stats = fs.statSync(backupFilePath);
  console.log(`\n==============================================`);
  console.log(`🎉 SAO LƯU TOÀN BỘ DỮ LIỆU THÀNH CÔNG!`);
  console.log(`📁 File 1: ${backupFilePath}`);
  console.log(`📁 File 2: ${rootBackupFilePath}`);
  console.log(`📊 Dung lượng: ${(stats.size / 1024).toFixed(2)} KB (${(stats.size / (1024 * 1024)).toFixed(2)} MB)`);
  for (const name of MODEL_NAMES) {
    const rows = Array.isArray(backupData[name]) ? backupData[name].length : `Lỗi: ${backupData[name]?.error}`;
    console.log(`- ${name.padEnd(25)}: ${rows} bản ghi`);
  }
  console.log(`==============================================\n`);

  process.exit(0);
}

runBackup().catch((err) => {
  console.error('❌ Lỗi khi thực hiện sao lưu:', err);
  process.exit(1);
});
