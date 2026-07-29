const { DataTypes } = require('sequelize');
const sequelize = require('../../src/config/database');

const LichSuThaoTac = sequelize.define('LichSuThaoTac', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  loai: {
    type: DataTypes.STRING(50), // 'THIET_LAP' | 'VAT_DUNG'
    allowNull: false,
  },
  noidung: {
    type: DataTypes.TEXT,
    allowNull: false,
  },
  nguoi_thao_tac_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  nguoi_thao_tac_ten: {
    type: DataTypes.STRING(100),
    allowNull: false,
  },
  chuc_vu: {
    type: DataTypes.STRING(50),
    allowNull: true,
  },
  created_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
  },
}, {
  tableName: 'core_lichsuthaotac',
  timestamps: false,
});

module.exports = LichSuThaoTac;
