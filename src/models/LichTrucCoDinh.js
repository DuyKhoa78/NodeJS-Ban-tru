const { DataTypes } = require('sequelize');
const sequelize = require('../../src/config/database');

const LichTrucCoDinh = sequelize.define('LichTrucCoDinh', {
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
  ma_gv_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'quanli_giaovien', key: 'id' },
  },
  thu: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: '0=T2, 1=T3, 2=T4, 3=T5, 4=T6',
  },
  nhiem_vu: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    comment: '0=Điểm danh, 1=Hỗ trợ',
  },
}, {
  tableName: 'nghiepvu_lichtruccodinh',
  timestamps: false,
  indexes: [
    {
      unique: true,
      fields: ['ma_gv_id', 'thu', 'ma_phong_id'],
    },
  ],
});


module.exports = LichTrucCoDinh;
