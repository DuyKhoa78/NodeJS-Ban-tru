const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const KeToanDanhMucKhoanChi = sequelize.define('KeToanDanhMucKhoanChi', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  ma_khoan_chi: {
    type: DataTypes.STRING(50),
    allowNull: false,
    unique: true,
  },
  ten_khoan_chi: {
    type: DataTypes.STRING(255),
    allowNull: false,
  },
  loai_tinh: {
    type: DataTypes.STRING(30),
    allowNull: false,
    defaultValue: 'truc_tiep',
    comment: 'nguon_truc_ngu | nguon_truc_an | truc_tiep | so_ngay_don_gia',
  },
  don_gia_mac_dinh: {
    type: DataTypes.DECIMAL(15, 2),
    defaultValue: 0,
  },
  tan_suat: {
    type: DataTypes.STRING(30),
    defaultValue: 'dinh_ky',
    comment: 'dinh_ky | phat_sinh | mot_lan',
  },
  thu_tu_hien_thi: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
  kich_hoat: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
  },
  ghi_chu: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
}, {
  tableName: 'core_ke_toan_danh_muc_khoan_chi',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
});

module.exports = KeToanDanhMucKhoanChi;
