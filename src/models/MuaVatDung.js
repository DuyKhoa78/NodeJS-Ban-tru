const { DataTypes } = require('sequelize');
const sequelize = require('../../src/config/database');

const MuaVatDung = sequelize.define('MuaVatDung', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  nam_hoc: {
    type: DataTypes.STRING(10),
    allowNull: false,
    comment: 'VD: 24-25',
  },
  lan_mua: {
    type: DataTypes.INTEGER,
    defaultValue: 1,
  },
  loai_vat_dung: {
    type: DataTypes.ENUM('CHIEU', 'GOI', 'VO_GOI'),
    allowNull: false,
  },
  so_luong: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  ngay_mua: {
    type: DataTypes.DATEONLY,
    defaultValue: DataTypes.NOW,
  },
}, {
  tableName: 'quanli_muavatdung',
  timestamps: false,
  indexes: [
    {
      unique: true,
      fields: ['nam_hoc', 'lan_mua', 'loai_vat_dung'],
    },
  ],
});

module.exports = MuaVatDung;
