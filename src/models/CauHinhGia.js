const { DataTypes } = require('sequelize');
const sequelize = require('../../src/config/database');

const CauHinhGia = sequelize.define('CauHinhGia', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  loai_truc: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: '0=An, 1=Ngu',
  },
  don_gia: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
  },
  ngay_ap_dung: {
    type: DataTypes.DATEONLY,
    defaultValue: DataTypes.NOW,
  },
  nguoi_cap_nhat_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: { model: 'accounts_staffuser', key: 'id' },
  },
}, {
  tableName: 'core_caulhinhgia',
  timestamps: false,
  indexes: [
    {
      unique: true,
      fields: ['loai_truc', 'ngay_ap_dung'],
    },
  ],
});

module.exports = CauHinhGia;
