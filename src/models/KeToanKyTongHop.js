const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const KeToanKyTongHop = sequelize.define('KeToanKyTongHop', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  ten_ky: {
    type: DataTypes.STRING(255),
    allowNull: false,
  },
  tu_ngay: {
    type: DataTypes.DATEONLY,
    allowNull: false,
  },
  den_ngay: {
    type: DataTypes.DATEONLY,
    allowNull: false,
  },
  ngay_lap: {
    type: DataTypes.DATEONLY,
    defaultValue: DataTypes.NOW,
  },
  trang_thai: {
    type: DataTypes.STRING(20),
    defaultValue: 'dang_dien_ra',
    comment: 'dang_dien_ra | da_chot',
  },
  ngay_chot: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  nguoi_chot_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  nguoi_chot_ten: {
    type: DataTypes.STRING(255),
    allowNull: true,
  },
  snapshot_cau_hinh: {
    type: DataTypes.JSONB,
    allowNull: true,
  },
  tong_so_nguoi: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
  tong_tien: {
    type: DataTypes.DECIMAL(15, 2),
    defaultValue: 0,
  },
  tong_da_thanh_toan: {
    type: DataTypes.DECIMAL(15, 2),
    defaultValue: 0,
  },
  ghi_chu: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  created_by_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  created_by_name: {
    type: DataTypes.STRING(255),
    allowNull: true,
  },
}, {
  tableName: 'core_ke_toan_ky_tong_hop',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
});

module.exports = KeToanKyTongHop;
