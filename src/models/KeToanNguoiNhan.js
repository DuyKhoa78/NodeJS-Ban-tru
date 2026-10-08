const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const KeToanNguoiNhan = sequelize.define('KeToanNguoiNhan', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  ky_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: 'ID kỳ tổng hợp',
  },
  nhan_su_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'ID giáo viên trong quanli_giaovien nếu có',
  },
  ma_dinh_danh: {
    type: DataTypes.STRING(50),
    allowNull: true,
  },
  ho_ten: {
    type: DataTypes.STRING(255),
    allowNull: false,
  },
  so_tai_khoan: {
    type: DataTypes.STRING(50),
    allowNull: true,
  },
  tong_tien: {
    type: DataTypes.DECIMAL(15, 2),
    defaultValue: 0,
  },
  da_thanh_toan: {
    type: DataTypes.DECIMAL(15, 2),
    defaultValue: 0,
  },
  trang_thai_tt: {
    type: DataTypes.STRING(20),
    defaultValue: 'chua_chi',
    comment: 'chua_chi | chi_mot_phan | da_chi_du',
  },
  ghi_chu: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  stt: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
}, {
  tableName: 'core_ke_toan_nguoi_nhan',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
});

module.exports = KeToanNguoiNhan;
