const { DataTypes } = require('sequelize');
const sequelize = require('../../src/config/database');

const CauHinhTuan = sequelize.define('CauHinhTuan', {
  tuan: {
    type: DataTypes.DATEONLY,
    primaryKey: true,
  },
  show_t5: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
  show_t6: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
}, {
  tableName: 'core_cauhinh_tuan',
  timestamps: false,
});

module.exports = CauHinhTuan;
