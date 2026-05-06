const { DataTypes } = require('sequelize');
const sequelize = require('../../src/config/database');

const CauHinhHeThong = sequelize.define('CauHinhHeThong', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    defaultValue: 1,
  },
  nam_hoc: {
    type: DataTypes.STRING(20),
    defaultValue: '2025-2026',
  },
  nguoi_phu_trach: {
    type: DataTypes.STRING(100),
    defaultValue: 'Tạ Thị Diệu Lê',
  },
  ten_truong: {
    type: DataTypes.STRING(200),
    defaultValue: 'LÊ THỊ HỒNG GẤM',
  },
  ngay_cap_nhat: {
    type: DataTypes.DATEONLY,
    allowNull: true,
  },

}, {
  tableName: 'core_cauhinhhethong',
  timestamps: false,
});

module.exports = CauHinhHeThong;
