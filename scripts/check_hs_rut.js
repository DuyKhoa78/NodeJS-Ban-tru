require('dotenv').config();
const { DiemDanhHS, HocSinh, sequelize } = require('../src/models');
const fs = require('fs');
const path = require('path');

async function main() {
  console.log('=== 1. KIỂM TRA CÁC CỘT CỦA BẢNG quanli_hocsinh ===');
  const [cols] = await sequelize.query(`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'quanli_hocsinh'
  `);
  console.log('Columns:', cols.map(c => c.column_name).join(', '));

  console.log('\n=== 2. HỌC SINH CÓ dang_hoc = false HOẶC CÓ ngay_rut ===');
  const [rutHs] = await sequelize.query(`
    SELECT id, ho_ten, lop, dang_hoc, ngay_vao, ngay_rut, ghi_chu 
    FROM quanli_hocsinh 
    WHERE dang_hoc = false OR ngay_rut IS NOT NULL
    ORDER BY id ASC
  `);
  console.table(rutHs);

  const targetIds = rutHs.map(h => h.id);
  console.log('\n=== 3. LỊCH SỬ ĐIỂM DANH CỦA CÁC HS NÀY (TỪ 07/09 ĐẾN 11/09) ===');
  const [ddList] = await sequelize.query(`
    SELECT ma_hs_id, ngay, diem_danh_an, diem_danh_ngu, ghi_chu, thoi_gian_diem_danh_an, thoi_gian_diem_danh_ngu
    FROM nghiepvu_diemdanhhs
    WHERE ma_hs_id IN (${targetIds.join(',')})
      AND ngay >= '2026-09-07' AND ngay <= '2026-09-11'
    ORDER BY ma_hs_id, ngay ASC
  `);
  console.table(ddList);

  console.log('\n=== 4. KIỂM TRA DỮ LIỆU TRONG CÁC FILE BACKUP ===');
  const backupDir = path.join(__dirname, '../backup');
  if (fs.existsSync(backupDir)) {
    const files = fs.readdirSync(backupDir).filter(f => f.endsWith('.json'));
    for (const file of files) {
      const filePath = path.join(backupDir, file);
      try {
        const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        if (content.HocSinh && Array.isArray(content.HocSinh)) {
          const matched = content.HocSinh.filter(h => targetIds.includes(h.id));
          console.log(`\nFile: ${file} (có ${content.HocSinh.length} HS)`);
          matched.forEach(m => {
            console.log(`  HS ${m.id} (${m.ho_ten}): dang_hoc = ${m.dang_hoc}, ngay_rut = ${m.ngay_rut}`);
          });
        }
      } catch (e) {
        // ignore
      }
    }
  }

  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
