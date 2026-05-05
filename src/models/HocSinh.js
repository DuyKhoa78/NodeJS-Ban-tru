const { DataTypes } = require('sequelize');
const sequelize = require('../../src/config/database');

const HocSinh = sequelize.define('HocSinh', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  ho_ten: {
    type: DataTypes.STRING(100),
    allowNull: false,
  },
  gioi_tinh: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: '0=Nam, 1=Nu',
  },
  lop: {
    type: DataTypes.STRING(10),
    allowNull: false,
  },
  dang_hoc: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
  },
  ghi_chu: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  ma_phong_an_id: {
    type: DataTypes.STRING(4),
    allowNull: true,
    references: { model: 'quanli_phong', key: 'ma_phong' },
  },
  ma_phong_ngu_id: {
    type: DataTypes.STRING(4),
    allowNull: true,
    references: { model: 'quanli_phong', key: 'ma_phong' },
  },
}, {
  tableName: 'quanli_hocsinh',
  timestamps: false,
});

module.exports = HocSinh;
