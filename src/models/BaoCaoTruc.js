const { DataTypes } = require('sequelize');
const sequelize = require('../../src/config/database');

const BaoCaoTruc = sequelize.define('BaoCaoTruc', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  ngay: {
    type: DataTypes.DATEONLY,
    allowNull: false,
    comment: 'Ngày báo cáo YYYY-MM-DD',
  },
  ca_truc: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: '0=Ăn trưa, 1=Nghỉ trưa',
  },
  ma_phong: {
    type: DataTypes.STRING(20),
    allowNull: false,
    comment: 'Mã phòng (A20, E2, P.1, HT.A...)',
  },
  ho_ten_gv: {
    type: DataTypes.STRING(100),
    allowNull: false,
    comment: 'Họ tên giáo viên báo cáo',
  },
  sdt_xac_nhan: {
    type: DataTypes.STRING(15),
    allowNull: true,
    comment: 'SĐT xác nhận (nếu có)',
  },
  ma_xac_thuc: {
    type: DataTypes.STRING(20),
    allowNull: true,
    comment: 'Mã bảo mật 5 ký tự do GV nhập',
  },
  is_hop_le: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
    comment: 'Trạng thái khớp mã bảo mật',
  },
  so_hs_vang: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    comment: 'Số lượng HS vắng',
  },
  danh_sach_vang: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Chi tiết HS vắng (tên, lớp)',
  },
  hs_vi_pham: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Học sinh quậy phá, mất trật tự, vi phạm nội quy',
  },
  tinh_hinh: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Tình hình trật tự, nề nếp, vệ sinh',
  },
  ghi_chu: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Đề xuất, phản ánh khác',
  },
  nguon: {
    type: DataTypes.STRING(50),
    defaultValue: 'google_form',
    comment: 'Nguồn báo cáo: google_form, web_form, zalo...',
  },
  created_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
  },
}, {
  tableName: 'nghiepvu_baocaotruc',
  timestamps: false,
});

module.exports = BaoCaoTruc;
