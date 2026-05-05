const { DataTypes } = require('sequelize');
const sequelize = require('../../src/config/database');

const PhanBoVatDung = sequelize.define('PhanBoVatDung', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  mua_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'quanli_muavatdung', key: 'id' },
  },
  phong_id: {
    type: DataTypes.STRING(4),
    allowNull: false,
    references: { model: 'quanli_phong', key: 'ma_phong' },
  },
  so_luong: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
}, {
  tableName: 'quanli_phanbovatdung',
  timestamps: false,
  indexes: [
    {
      unique: true,
      fields: ['mua_id', 'phong_id'],
    },
  ],
});

module.exports = PhanBoVatDung;
