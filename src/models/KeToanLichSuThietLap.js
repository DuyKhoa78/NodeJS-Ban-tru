const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const KeToanLichSuThietLap = sequelize.define('KeToanLichSuThietLap', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  hanh_dong: {
    type: DataTypes.STRING(100),
    allowNull: false,
    comment: 'CAP_NHAT_KHOAN_CHI | THEM_KHOAN_CHI | DOI_DON_GIA | CHOT_KY | MO_LAI_KY',
  },
  noi_dung: {
    type: DataTypes.TEXT,
    allowNull: false,
  },
  nguoi_thao_tac_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  nguoi_thao_tac_ten: {
    type: DataTypes.STRING(255),
    allowNull: false,
  },
  chuc_vu: {
    type: DataTypes.STRING(50),
    defaultValue: 'Kế toán',
  },
  created_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
  },
}, {
  tableName: 'core_ke_toan_lich_su_thiet_lap',
  timestamps: false,
});

module.exports = KeToanLichSuThietLap;
