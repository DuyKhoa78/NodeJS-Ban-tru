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
const CauHinhNgay = require('./CauHinhNgay');
const LichSuThaoTac = require('./LichSuThaoTac');
const BaoCaoTruc = require('./BaoCaoTruc');
const DiemDanhDraft = require('./DiemDanhDraft');
const LichSuPhanPhong = require('./LichSuPhanPhong');
const CauHinhDotThanhToan = require('./CauHinhDotThanhToan');
const ThuTienBanTru = require('./ThuTienBanTru');
const KyTrucGV = require('./KyTrucGV');
const ThanhToanLuongGV = require('./ThanhToanLuongGV');

// ─── Associations ─────────────────────────────────────────────────────────────

// StaffUser ↔ GiaoVien
StaffUser.belongsTo(GiaoVien, { foreignKey: 'giao_vien_id', as: 'giao_vien' });
GiaoVien.hasOne(StaffUser, { foreignKey: 'giao_vien_id', as: 'user_account' });

// HocSinh ↔ Phong (phòng ăn & phòng ngủ)
HocSinh.belongsTo(Phong, { foreignKey: 'ma_phong_an_id', as: 'phong_an' });
HocSinh.belongsTo(Phong, { foreignKey: 'ma_phong_ngu_id', as: 'phong_ngu' });
Phong.hasMany(HocSinh, { foreignKey: 'ma_phong_an_id', as: 'hocsinh_an' });
Phong.hasMany(HocSinh, { foreignKey: 'ma_phong_ngu_id', as: 'hocsinh_ngu' });

// LichSuPhanPhong ↔ HocSinh, Phong
HocSinh.hasMany(LichSuPhanPhong, { foreignKey: 'ma_hs_id', as: 'lich_su_phong' });
LichSuPhanPhong.belongsTo(HocSinh, { foreignKey: 'ma_hs_id', as: 'hoc_sinh' });
LichSuPhanPhong.belongsTo(Phong, { foreignKey: 'ma_phong_id', as: 'phong' });
Phong.hasMany(LichSuPhanPhong, { foreignKey: 'ma_phong_id', as: 'lich_su_phan_phong' });

// DiemDanhHS ↔ Phong (Snapshot phòng ăn & ngủ)
DiemDanhHS.belongsTo(Phong, { foreignKey: 'ma_phong_an_id', as: 'phong_an' });
DiemDanhHS.belongsTo(Phong, { foreignKey: 'ma_phong_ngu_id', as: 'phong_ngu' });

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

// DiemDanhPhong ↔ StaffUser
DiemDanhPhong.belongsTo(StaffUser, { foreignKey: 'ma_gv_chot_id', as: 'nguoi_chot' });
StaffUser.hasMany(DiemDanhPhong, { foreignKey: 'ma_gv_chot_id', as: 'phong_da_chot' });

// DiemDanhDraft ↔ Phong
DiemDanhDraft.belongsTo(Phong, { foreignKey: 'ma_phong_id', as: 'phong' });
Phong.hasMany(DiemDanhDraft, { foreignKey: 'ma_phong_id', as: 'draft_diem_danh' });

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

// ThuTienBanTru ↔ HocSinh, StaffUser
ThuTienBanTru.belongsTo(HocSinh, { foreignKey: 'ma_hs_id', as: 'hoc_sinh' });
HocSinh.hasMany(ThuTienBanTru, { foreignKey: 'ma_hs_id', as: 'phieu_thu' });
ThuTienBanTru.belongsTo(StaffUser, { foreignKey: 'nguoi_thu_id', as: 'nguoi_thu' });

// KyTrucGV ↔ ThanhToanLuongGV
KyTrucGV.hasMany(ThanhToanLuongGV, { foreignKey: 'ky_truc_id', as: 'danh_sach_thanh_toan' });
ThanhToanLuongGV.belongsTo(KyTrucGV, { foreignKey: 'ky_truc_id', as: 'ky_truc' });
ThanhToanLuongGV.belongsTo(GiaoVien, { foreignKey: 'ma_gv_id', as: 'giao_vien' });
GiaoVien.hasMany(ThanhToanLuongGV, { foreignKey: 'ma_gv_id', as: 'lich_su_nhan_luong' });
ThanhToanLuongGV.belongsTo(StaffUser, { foreignKey: 'nguoi_thao_tac_id', as: 'nguoi_thao_tac' });

// ─── Kế toán: Tổng hợp chi trả công tác bán trú ───────────────────────────
const KeToanDanhMucKhoanChi = require('./KeToanDanhMucKhoanChi');
const KeToanKyTongHop = require('./KeToanKyTongHop');
const KeToanNguoiNhan = require('./KeToanNguoiNhan');
const KeToanChiTietKhoanChi = require('./KeToanChiTietKhoanChi');
const KeToanThanhToanChiTiet = require('./KeToanThanhToanChiTiet');
const KeToanLichSuThietLap = require('./KeToanLichSuThietLap');

KeToanKyTongHop.hasMany(KeToanNguoiNhan, { foreignKey: 'ky_id', as: 'danh_sach_nguoi_nhan' });
KeToanNguoiNhan.belongsTo(KeToanKyTongHop, { foreignKey: 'ky_id', as: 'ky_tong_hop' });

KeToanNguoiNhan.belongsTo(GiaoVien, { foreignKey: 'nhan_su_id', as: 'giao_vien' });

KeToanNguoiNhan.hasMany(KeToanChiTietKhoanChi, { foreignKey: 'nguoi_nhan_id', as: 'chi_tiet_khoan_chi' });
KeToanChiTietKhoanChi.belongsTo(KeToanNguoiNhan, { foreignKey: 'nguoi_nhan_id', as: 'nguoi_nhan' });

KeToanChiTietKhoanChi.belongsTo(KeToanDanhMucKhoanChi, { foreignKey: 'khoan_chi_id', as: 'danh_muc' });
KeToanDanhMucKhoanChi.hasMany(KeToanChiTietKhoanChi, { foreignKey: 'khoan_chi_id', as: 'chi_tiet' });

KeToanKyTongHop.hasMany(KeToanThanhToanChiTiet, { foreignKey: 'ky_id', as: 'lich_su_thanh_toan' });
KeToanNguoiNhan.hasMany(KeToanThanhToanChiTiet, { foreignKey: 'nguoi_nhan_id', as: 'lich_su_thanh_toan' });

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
  DiemDanhDraft,
  PhanCongTrucGV,
  LichTrucCoDinh,
  CauHinhTuan,
  CauHinhNgay,
  LichSuThaoTac,
  BaoCaoTruc,
  LichSuPhanPhong,
  CauHinhDotThanhToan,
  ThuTienBanTru,
  KyTrucGV,
  ThanhToanLuongGV,
  KeToanDanhMucKhoanChi,
  KeToanKyTongHop,
  KeToanNguoiNhan,
  KeToanChiTietKhoanChi,
  KeToanThanhToanChiTiet,
  KeToanLichSuThietLap,
};
