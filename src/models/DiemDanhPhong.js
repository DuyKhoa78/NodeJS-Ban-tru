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
  trang_thai_chot: {
    type: DataTypes.STRING(20),
    defaultValue: 'chua_chot',
    comment: 'chua_chot | da_chot | tu_dong_chot | khong_diem_danh',
  },
  ma_gv_chot_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: { model: 'accounts_staffuser', key: 'id' },
    comment: 'Tài khoản người đã bấm chốt (hoặc null nếu tự động)',
  },
  ghi_chu_chot: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Ghi chú chốt điểm danh (ví dụ: Chốt đúng hạn, Hệ thống tự động chốt lúc 11:30)',
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
