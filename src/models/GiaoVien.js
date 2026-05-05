const { DataTypes } = require('sequelize');
const sequelize = require('../../src/config/database');

const GiaoVien = sequelize.define('GiaoVien', {
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
  so_dien_thoai: {
    type: DataTypes.STRING(15),
    allowNull: true,
    unique: true,
  },
  nhiem_vu: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: '0=DiemDanh, 1=HoTro',
  },
  dang_lam: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
  },
  lich_ranh: {
    type: DataTypes.JSONB,
    defaultValue: [false, false, false, false, false],
    comment: '[T2,T3,T4,T5,T6] - true nếu rảnh',
  },
}, {
  tableName: 'quanli_giaovien',
  timestamps: false,
});

module.exports = GiaoVien;
