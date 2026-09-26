const { DataTypes } = require('sequelize');
const sequelize = require('../../src/config/database');

const CauHinhDotThanhToan = sequelize.define('CauHinhDotThanhToan', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  dot: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: 'Số thứ tự đợt (1, 2, 3...)',
  },
  label: {
    type: DataTypes.STRING(255),
    allowNull: false,
    comment: 'Nhãn hiển thị đợt thanh toán',
  },
  tu_ngay: {
    type: DataTypes.DATEONLY,
    allowNull: false,
    comment: 'Ngày bắt đầu đợt (YYYY-MM-DD)',
  },
  den_ngay: {
    type: DataTypes.DATEONLY,
    allowNull: false,
    comment: 'Ngày kết thúc đợt (YYYY-MM-DD)',
  },
  nam_hoc: {
    type: DataTypes.STRING(20),
    allowNull: false,
    defaultValue: '2026-2027',
  },
  ghi_chu: {
    type: DataTypes.STRING(255),
    allowNull: true,
  },
  is_khoa: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    comment: 'Khóa sổ kỳ kế toán đợt này (không cho sửa điểm danh / phân công)',
  },
}, {
  tableName: 'core_cauhinh_dot_thanhtoan',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    {
      unique: true,
      fields: ['nam_hoc', 'dot'],
    },
  ],
});

module.exports = CauHinhDotThanhToan;
