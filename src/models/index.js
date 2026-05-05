const sequelize = require('../../src/config/database');

// Import all models
const StaffUser = require('./StaffUser');
const Phong = require('./Phong');
const GiaoVien = require('./GiaoVien');
const HocSinh = require('./HocSinh');
const MuaVatDung = require('./MuaVatDung');
const PhanBoVatDung = require('./PhanBoVatDung');
const CauHinhGia = require('./CauHinhGia');
const CauHinhHeThong = require('./CauHinhHeThong');
const DiemDanhHS = require('./DiemDanhHS');
const DiemDanhPhong = require('./DiemDanhPhong');
const PhanCongTrucGV = require('./PhanCongTrucGV');
const LichTrucCoDinh = require('./LichTrucCoDinh');
const CauHinhTuan = require('./CauHinhTuan');

// ─── Associations ─────────────────────────────────────────────────────────────

// HocSinh ↔ Phong (phòng ăn & phòng ngủ)
HocSinh.belongsTo(Phong, { foreignKey: 'ma_phong_an_id', as: 'phong_an' });
HocSinh.belongsTo(Phong, { foreignKey: 'ma_phong_ngu_id', as: 'phong_ngu' });
Phong.hasMany(HocSinh, { foreignKey: 'ma_phong_an_id', as: 'hocsinh_an' });
Phong.hasMany(HocSinh, { foreignKey: 'ma_phong_ngu_id', as: 'hocsinh_ngu' });

// MuaVatDung ↔ PhanBoVatDung
MuaVatDung.hasMany(PhanBoVatDung, { foreignKey: 'mua_id', as: 'phan_bo' });
PhanBoVatDung.belongsTo(MuaVatDung, { foreignKey: 'mua_id', as: 'mua' });
PhanBoVatDung.belongsTo(Phong, { foreignKey: 'phong_id', as: 'phong' });
Phong.hasMany(PhanBoVatDung, { foreignKey: 'phong_id', as: 'phan_bo_vat_dung' });

// CauHinhGia ↔ StaffUser
CauHinhGia.belongsTo(StaffUser, { foreignKey: 'nguoi_cap_nhat_id', as: 'nguoi_cap_nhat' });

// DiemDanhHS ↔ HocSinh
DiemDanhHS.belongsTo(HocSinh, { foreignKey: 'ma_hs_id', as: 'hoc_sinh' });
HocSinh.hasMany(DiemDanhHS, { foreignKey: 'ma_hs_id', as: 'diem_danh' });

// DiemDanhPhong ↔ Phong
DiemDanhPhong.belongsTo(Phong, { foreignKey: 'ma_phong_id', as: 'phong' });
Phong.hasMany(DiemDanhPhong, { foreignKey: 'ma_phong_id', as: 'diem_danh_phong' });

// PhanCongTrucGV ↔ GiaoVien, Phong
PhanCongTrucGV.belongsTo(GiaoVien, { foreignKey: 'ma_gv_id', as: 'giao_vien' });
PhanCongTrucGV.belongsTo(GiaoVien, { foreignKey: 'ma_gv_truc_thay_id', as: 'giao_vien_truc_thay' });
PhanCongTrucGV.belongsTo(Phong, { foreignKey: 'ma_phong_id', as: 'phong' });
GiaoVien.hasMany(PhanCongTrucGV, { foreignKey: 'ma_gv_id', as: 'phan_cong' });
Phong.hasMany(PhanCongTrucGV, { foreignKey: 'ma_phong_id', as: 'phan_cong_truc' });

// LichTrucCoDinh ↔ GiaoVien, Phong
LichTrucCoDinh.belongsTo(GiaoVien, { foreignKey: 'ma_gv_id', as: 'giao_vien' });
LichTrucCoDinh.belongsTo(Phong, { foreignKey: 'ma_phong_id', as: 'phong' });
GiaoVien.hasMany(LichTrucCoDinh, { foreignKey: 'ma_gv_id', as: 'lich_truc_co_dinh' });
Phong.hasMany(LichTrucCoDinh, { foreignKey: 'ma_phong_id', as: 'lich_truc_co_dinh' });

module.exports = {
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
};
