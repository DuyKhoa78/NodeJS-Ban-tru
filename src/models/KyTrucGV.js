const { DataTypes } = require('sequelize');
const sequelize = require('../../src/config/database');

const KyTrucGV = sequelize.define('KyTrucGV', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  ten_ky: {
    type: DataTypes.STRING(255),
    allowNull: false,
    comment: 'Tên kỳ trực (vd: Kỳ 1, Kỳ 2...)',
  },
  tu_ngay: {
    type: DataTypes.DATEONLY,
    allowNull: false,
    comment: 'Ngày bắt đầu kỳ (YYYY-MM-DD)',
  },
  den_ngay: {
    type: DataTypes.DATEONLY,
    allowNull: true,
    comment: 'Ngày kết thúc kỳ (YYYY-MM-DD) - null nếu kỳ đang mở',
  },
  trang_thai: {
    type: DataTypes.STRING(20),
    allowNull: false,
    defaultValue: 'dang_dien_ra',
    comment: 'dang_dien_ra | da_chot',
  },
  ngay_chot: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'Thời điểm thực hiện chốt kỳ',
  },
  nguoi_chot_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  nguoi_chot_ten: {
    type: DataTypes.STRING(255),
    allowNull: true,
  },
  tong_so_gv: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
  tong_ca_an: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
  tong_ca_ngu: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
  tong_tien: {
    type: DataTypes.DECIMAL(15, 2),
    defaultValue: 0,
  },
  ghi_chu: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  nam_hoc: {
    type: DataTypes.STRING(20),
    allowNull: false,
    defaultValue: '2026-2027',
  },
}, {
  tableName: 'core_kytrucgv',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    {
      fields: ['tu_ngay', 'den_ngay'],
    },
    {
      fields: ['trang_thai'],
    },
  ],
});

module.exports = KyTrucGV;
