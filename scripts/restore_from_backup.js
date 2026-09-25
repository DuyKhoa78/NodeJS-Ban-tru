/**
 * scripts/restore_from_backup.js
 * Khôi phục cơ sở dữ liệu từ file backup JSON
 * Cách dùng: node scripts/restore_from_backup.js [đường_dẫn_file_backup.json]
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

async function runRestore() {
  const backupDir = path.join(__dirname, '..', 'backup');
  let targetFile = process.argv[2];

  if (!targetFile) {
    // Tìm file backup_full_ mới nhất
    const files = fs.readdirSync(backupDir)
      .filter(f => f.startsWith('backup_full_') && f.endsWith('.json'))
      .sort()
      .reverse();

    if (files.length === 0) {
      console.error('❌ Không tìm thấy file backup nào trong thư mục backup/');
      process.exit(1);
    }
    targetFile = path.join(backupDir, files[0]);
  } else if (!path.isAbsolute(targetFile)) {
    targetFile = path.resolve(process.cwd(), targetFile);
  }

  if (!fs.existsSync(targetFile)) {
    console.error(`❌ File backup không tồn tại: ${targetFile}`);
    process.exit(1);
  }

  console.log(`📦 Đọc dữ liệu từ: ${targetFile}`);
  const data = JSON.parse(fs.readFileSync(targetFile, 'utf-8'));

  console.log('🔄 Đang kết nối CSDL...');
  await sequelize.authenticate();
  console.log('✅ Kết nối database thành công.');

  const tx = await sequelize.transaction();
  try {
    console.log('⚠️  Đang xóa dữ liệu cũ theo thứ tự ràng buộc khóa ngoại...');
    if (DiemDanhDraft) await DiemDanhDraft.destroy({ where: {}, transaction: tx, truncate: { cascade: true } }).catch(() => DiemDanhDraft.destroy({ where: {}, transaction: tx }));
    if (DiemDanhHS) await DiemDanhHS.destroy({ where: {}, transaction: tx, truncate: { cascade: true } }).catch(() => DiemDanhHS.destroy({ where: {}, transaction: tx }));
    if (DiemDanhPhong) await DiemDanhPhong.destroy({ where: {}, transaction: tx, truncate: { cascade: true } }).catch(() => DiemDanhPhong.destroy({ where: {}, transaction: tx }));
    if (BaoCaoTruc) await BaoCaoTruc.destroy({ where: {}, transaction: tx, truncate: { cascade: true } }).catch(() => BaoCaoTruc.destroy({ where: {}, transaction: tx }));
    if (PhanCongTrucGV) await PhanCongTrucGV.destroy({ where: {}, transaction: tx, truncate: { cascade: true } }).catch(() => PhanCongTrucGV.destroy({ where: {}, transaction: tx }));
    if (LichTrucCoDinh) await LichTrucCoDinh.destroy({ where: {}, transaction: tx, truncate: { cascade: true } }).catch(() => LichTrucCoDinh.destroy({ where: {}, transaction: tx }));
    if (PhanBoVatDung) await PhanBoVatDung.destroy({ where: {}, transaction: tx, truncate: { cascade: true } }).catch(() => PhanBoVatDung.destroy({ where: {}, transaction: tx }));
    if (MuaVatDung) await MuaVatDung.destroy({ where: {}, transaction: tx, truncate: { cascade: true } }).catch(() => MuaVatDung.destroy({ where: {}, transaction: tx }));
    if (CauHinhNgay) await CauHinhNgay.destroy({ where: {}, transaction: tx, truncate: { cascade: true } }).catch(() => CauHinhNgay.destroy({ where: {}, transaction: tx }));
    if (CauHinhTuan) await CauHinhTuan.destroy({ where: {}, transaction: tx, truncate: { cascade: true } }).catch(() => CauHinhTuan.destroy({ where: {}, transaction: tx }));
    if (CauHinhGia) await CauHinhGia.destroy({ where: {}, transaction: tx, truncate: { cascade: true } }).catch(() => CauHinhGia.destroy({ where: {}, transaction: tx }));
    if (CauHinhHeThong) await CauHinhHeThong.destroy({ where: {}, transaction: tx, truncate: { cascade: true } }).catch(() => CauHinhHeThong.destroy({ where: {}, transaction: tx }));
    if (LichSuThaoTac) await LichSuThaoTac.destroy({ where: {}, transaction: tx, truncate: { cascade: true } }).catch(() => LichSuThaoTac.destroy({ where: {}, transaction: tx }));
    if (HocSinh) await HocSinh.destroy({ where: {}, transaction: tx, truncate: { cascade: true } }).catch(() => HocSinh.destroy({ where: {}, transaction: tx }));
    if (StaffUser) await StaffUser.destroy({ where: {}, transaction: tx, truncate: { cascade: true } }).catch(() => StaffUser.destroy({ where: {}, transaction: tx }));
    if (GiaoVien) await GiaoVien.destroy({ where: {}, transaction: tx, truncate: { cascade: true } }).catch(() => GiaoVien.destroy({ where: {}, transaction: tx }));
    if (Phong) await Phong.destroy({ where: {}, transaction: tx, truncate: { cascade: true } }).catch(() => Phong.destroy({ where: {}, transaction: tx }));

    console.log('📥 Đang khôi phục dữ liệu từng bảng...');

    if (Array.isArray(data.Phong) && data.Phong.length > 0) {
      await Phong.bulkCreate(data.Phong, { transaction: tx });
      console.log(`- Phong: ${data.Phong.length}`);
    }
    if (Array.isArray(data.GiaoVien) && data.GiaoVien.length > 0) {
      await GiaoVien.bulkCreate(data.GiaoVien, { transaction: tx });
      console.log(`- GiaoVien: ${data.GiaoVien.length}`);
    }
    if (Array.isArray(data.StaffUser) && data.StaffUser.length > 0) {
      await StaffUser.bulkCreate(data.StaffUser, { transaction: tx });
      console.log(`- StaffUser: ${data.StaffUser.length}`);
    }
    if (Array.isArray(data.HocSinh) && data.HocSinh.length > 0) {
      await HocSinh.bulkCreate(data.HocSinh, { transaction: tx });
      console.log(`- HocSinh: ${data.HocSinh.length}`);
    }
    if (Array.isArray(data.CauHinhHeThong) && data.CauHinhHeThong.length > 0) {
      await CauHinhHeThong.bulkCreate(data.CauHinhHeThong, { transaction: tx });
      console.log(`- CauHinhHeThong: ${data.CauHinhHeThong.length}`);
    }
    if (Array.isArray(data.CauHinhGia) && data.CauHinhGia.length > 0) {
      await CauHinhGia.bulkCreate(data.CauHinhGia, { transaction: tx });
      console.log(`- CauHinhGia: ${data.CauHinhGia.length}`);
    }
    if (Array.isArray(data.CauHinhTuan) && data.CauHinhTuan.length > 0) {
      await CauHinhTuan.bulkCreate(data.CauHinhTuan, { transaction: tx });
      console.log(`- CauHinhTuan: ${data.CauHinhTuan.length}`);
    }
    if (Array.isArray(data.CauHinhNgay) && data.CauHinhNgay.length > 0) {
      await CauHinhNgay.bulkCreate(data.CauHinhNgay, { transaction: tx });
      console.log(`- CauHinhNgay: ${data.CauHinhNgay.length}`);
    }
    if (Array.isArray(data.MuaVatDung) && data.MuaVatDung.length > 0) {
      await MuaVatDung.bulkCreate(data.MuaVatDung, { transaction: tx });
      console.log(`- MuaVatDung: ${data.MuaVatDung.length}`);
    }
    if (Array.isArray(data.PhanBoVatDung) && data.PhanBoVatDung.length > 0) {
      await PhanBoVatDung.bulkCreate(data.PhanBoVatDung, { transaction: tx });
      console.log(`- PhanBoVatDung: ${data.PhanBoVatDung.length}`);
    }
    if (Array.isArray(data.LichTrucCoDinh) && data.LichTrucCoDinh.length > 0) {
      await LichTrucCoDinh.bulkCreate(data.LichTrucCoDinh, { transaction: tx });
      console.log(`- LichTrucCoDinh: ${data.LichTrucCoDinh.length}`);
    }
    if (Array.isArray(data.PhanCongTrucGV) && data.PhanCongTrucGV.length > 0) {
      await PhanCongTrucGV.bulkCreate(data.PhanCongTrucGV, { transaction: tx });
      console.log(`- PhanCongTrucGV: ${data.PhanCongTrucGV.length}`);
    }
    if (Array.isArray(data.DiemDanhPhong) && data.DiemDanhPhong.length > 0) {
      await DiemDanhPhong.bulkCreate(data.DiemDanhPhong, { transaction: tx });
      console.log(`- DiemDanhPhong: ${data.DiemDanhPhong.length}`);
    }
    if (Array.isArray(data.DiemDanhHS) && data.DiemDanhHS.length > 0) {
      // Chia thành các lô nhỏ 1000 bản ghi để tránh quá tải query parameter limit
      const chunkSize = 1000;
      for (let i = 0; i < data.DiemDanhHS.length; i += chunkSize) {
        await DiemDanhHS.bulkCreate(data.DiemDanhHS.slice(i, i + chunkSize), { transaction: tx });
      }
      console.log(`- DiemDanhHS: ${data.DiemDanhHS.length}`);
    }
    if (Array.isArray(data.DiemDanhDraft) && data.DiemDanhDraft.length > 0) {
      await DiemDanhDraft.bulkCreate(data.DiemDanhDraft, { transaction: tx });
      console.log(`- DiemDanhDraft: ${data.DiemDanhDraft.length}`);
    }
    if (Array.isArray(data.BaoCaoTruc) && data.BaoCaoTruc.length > 0) {
      await BaoCaoTruc.bulkCreate(data.BaoCaoTruc, { transaction: tx });
      console.log(`- BaoCaoTruc: ${data.BaoCaoTruc.length}`);
    }
    if (Array.isArray(data.LichSuThaoTac) && data.LichSuThaoTac.length > 0) {
      await LichSuThaoTac.bulkCreate(data.LichSuThaoTac, { transaction: tx });
      console.log(`- LichSuThaoTac: ${data.LichSuThaoTac.length}`);
    }

    await tx.commit();
    console.log('\n==============================================');
    console.log('🎉 KHÔI PHỤC DỮ LIỆU THÀNH CÔNG!');
    console.log('==============================================\n');
    process.exit(0);
  } catch (err) {
    await tx.rollback();
    console.error('❌ Lỗi khi khôi phục dữ liệu, đã rollback toàn bộ:', err);
    process.exit(1);
  }
}

runRestore().catch(err => {
  console.error('Lỗi ngoại lệ:', err);
  process.exit(1);
});
