const { DataTypes } = require('sequelize');
const sequelize = require('../../src/config/database');

const DiemDanhHS = sequelize.define('DiemDanhHS', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  ma_hs_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'quanli_hocsinh', key: 'id' },
  },
  ngay: {
    type: DataTypes.DATEONLY,
    defaultValue: DataTypes.NOW,
  },
  diem_danh_an: {
    type: DataTypes.INTEGER,
    defaultValue: null,
    comment: '0=CoMat, 1=Vang, 2=Phep, null=Chưa điểm danh',
  },
  diem_danh_ngu: {
    type: DataTypes.INTEGER,
    defaultValue: null,
    comment: '0=CoMat, 1=Vang, 2=Phep, null=Chưa điểm danh',
  },
  ghi_chu: {
    type: DataTypes.STRING(255),
    allowNull: true,
  },
}, {
  tableName: 'nghiepvu_diemdanhhs',
  timestamps: false,
  indexes: [
    {
      unique: true,
      fields: ['ma_hs_id', 'ngay'],
    },
  ],
});

module.exports = DiemDanhHS;
