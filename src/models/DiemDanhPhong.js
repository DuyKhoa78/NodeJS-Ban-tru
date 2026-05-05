const { DataTypes } = require('sequelize');
const sequelize = require('../../src/config/database');

const DiemDanhPhong = sequelize.define('DiemDanhPhong', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  ma_phong_id: {
    type: DataTypes.STRING(4),
    allowNull: false,
    references: { model: 'quanli_phong', key: 'ma_phong' },
  },
  ngay: {
    type: DataTypes.DATEONLY,
    defaultValue: DataTypes.NOW,
  },
  loai_truc: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: '0=An, 1=Ngu',
  },
  da_diem_danh: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
  thoi_gian: {
    type: DataTypes.DATE,
    allowNull: true,
  },
}, {
  tableName: 'nghiepvu_diemdanhphong',
  timestamps: false,
  indexes: [
    {
      unique: true,
      fields: ['ma_phong_id', 'ngay', 'loai_truc'],
    },
  ],
});

module.exports = DiemDanhPhong;
