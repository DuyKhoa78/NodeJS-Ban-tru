require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { DiemDanhHS, DiemDanhPhong, DiemDanhDraft } = require('../src/models');
const { Op } = require('sequelize');

async function cleanAttendanceRange() {
  const tuNgay = '2026-09-14';
  const denNgay = '2026-09-18';
  const whereRange = { ngay: { [Op.between]: [tuNgay, denNgay] } };

  // 1. Sao lưu trước khi xóa
  const hsRecords = await DiemDanhHS.findAll({ where: whereRange });
  const phongRecords = await DiemDanhPhong.findAll({ where: whereRange });
  const draftRecords = await DiemDanhDraft.findAll({ where: whereRange });

  const backupDir = path.join(__dirname, '../backup');
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupFile = path.join(backupDir, `backup_diemdanh_${tuNgay}_to_${denNgay}_${timestamp}.json`);
  fs.writeFileSync(backupFile, JSON.stringify({ hsRecords, phongRecords, draftRecords }, null, 2));
  console.log(`✅ Đã sao lưu an toàn ${hsRecords.length} bản ghi DiemDanhHS, ${phongRecords.length} DiemDanhPhong, ${draftRecords.length} DiemDanhDraft vào: ${backupFile}`);

  // 2. Xóa các bản ghi
  const delHs = await DiemDanhHS.destroy({ where: whereRange });
  const delPhong = await DiemDanhPhong.destroy({ where: whereRange });
  const delDraft = await DiemDanhDraft.destroy({ where: whereRange });

  console.log(`🗑️ Đã xóa:`);
  console.log(`   - ${delHs} bản ghi điểm danh học sinh (DiemDanhHS) từ ${tuNgay} đến ${denNgay}`);
  console.log(`   - ${delPhong} bản ghi chốt phòng (DiemDanhPhong)`);
  console.log(`   - ${delDraft} bản ghi nháp quét QR (DiemDanhDraft)`);

  process.exit(0);
}

cleanAttendanceRange().catch(err => {
  console.error('Lỗi khi xóa bản ghi điểm danh:', err);
  process.exit(1);
});
