const { DataTypes } = require('sequelize');
const sequelize = require('../../src/config/database');

const PhanCongTrucGV = sequelize.define('PhanCongTrucGV', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  ma_gv_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'quanli_giaovien', key: 'id' },
  },
  ma_gv_truc_thay_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: { model: 'quanli_giaovien', key: 'id' },
  },
  ma_phong_id: {
    type: DataTypes.STRING(4),
    allowNull: false,
    references: { model: 'quanli_phong', key: 'ma_phong' },
  },
  ngay: {
    type: DataTypes.DATEONLY,
    allowNull: false,
  },
  loai_truc: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: '0=An, 1=Ngu',
  },
  xac_nhan_truc: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
  },
  // ─── Audit Fields ─────────────────────────────────────────────────
  ngay_cap_nhat: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'Thời điểm cập nhật lần cuối',
  },
  nguoi_cap_nhat_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: { model: 'accounts_staffuser', key: 'id' },
    comment: 'ID tài khoản đã cập nhật',
  },
}, {
  tableName: 'nghiepvu_phancongtrucgv',
  timestamps: false,
  indexes: [
    {
      unique: true,
      fields: ['ma_gv_id', 'ngay', 'loai_truc', 'ma_phong_id'],
    },
  ],
});

module.exports = PhanCongTrucGV;
