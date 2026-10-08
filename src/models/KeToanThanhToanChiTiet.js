const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const KeToanThanhToanChiTiet = sequelize.define('KeToanThanhToanChiTiet', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  ky_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  nguoi_nhan_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  so_tien: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false,
  },
  ngay_chi: {
    type: DataTypes.DATEONLY,
    allowNull: false,
    defaultValue: DataTypes.NOW,
  },
  hinh_thuc: {
    type: DataTypes.STRING(50),
    defaultValue: 'chuyen_khoan',
    comment: 'chuyen_khoan | tien_mat',
  },
  so_chung_tu: {
    type: DataTypes.STRING(100),
    allowNull: true,
  },
  nguoi_thao_tac_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  nguoi_thao_tac_ten: {
    type: DataTypes.STRING(255),
    allowNull: true,
  },
  ghi_chu: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  created_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
  },
}, {
  tableName: 'core_ke_toan_thanh_toan_chi_tiet',
  timestamps: false,
});

module.exports = KeToanThanhToanChiTiet;
