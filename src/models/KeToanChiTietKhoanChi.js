const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const KeToanChiTietKhoanChi = sequelize.define('KeToanChiTietKhoanChi', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  nguoi_nhan_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  ky_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  khoan_chi_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  ma_khoan_chi: {
    type: DataTypes.STRING(50),
    allowNull: false,
  },
  loai_tinh: {
    type: DataTypes.STRING(30),
    allowNull: true,
  },
  tan_suat: {
    type: DataTypes.STRING(30),
    defaultValue: 'dinh_ky',
    comment: 'dinh_ky | mot_lan',
  },
  so_ngay: {
    type: DataTypes.DECIMAL(8, 2),
    defaultValue: 0,
  },
  don_gia: {
    type: DataTypes.DECIMAL(15, 2),
    defaultValue: 0,
  },
  tien_nguon: {
    type: DataTypes.DECIMAL(15, 2),
    defaultValue: 0,
  },
  tien_nhap: {
    type: DataTypes.DECIMAL(15, 2),
    defaultValue: 0,
  },
  tien_dieu_chinh: {
    type: DataTypes.DECIMAL(15, 2),
    defaultValue: 0,
  },
  ly_do_dieu_chinh: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  thanh_tien: {
    type: DataTypes.DECIMAL(15, 2),
    defaultValue: 0,
  },
  nguon_cap_nhat: {
    type: DataTypes.STRING(50),
    defaultValue: 'manual',
    comment: 'manual | nguon_truc_ngu | nguon_truc_an | copy_ky_truoc',
  },
  ghi_chu: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
}, {
  tableName: 'core_ke_toan_chi_tiet_khoan_chi',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
});

module.exports = KeToanChiTietKhoanChi;
