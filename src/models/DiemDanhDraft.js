const { DataTypes } = require('sequelize');
const sequelize = require('../../src/config/database');

const DiemDanhDraft = sequelize.define('DiemDanhDraft', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
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
  ma_phong_id: {
    type: DataTypes.STRING(4),
    allowNull: false,
    references: { model: 'quanli_phong', key: 'ma_phong' },
  },
  ma_gv_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: { model: 'accounts_staffuser', key: 'id' },
    comment: 'Tài khoản giáo viên đang thực hiện điểm danh nháp',
  },
  // Lưu mảng các học sinh đã được quét/xác nhận: [{ id, ho_ten, lop, status, scanned_at }]
  danh_sach_hs: {
    type: DataTypes.JSONB,
    defaultValue: [],
    comment: 'Danh sách học sinh đã quét trong ca',
  },
  is_chot: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    comment: 'true nếu phòng này đã được chốt lên Tổng',
  },
  updated_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
  },
}, {
  tableName: 'nghiepvu_diemdanh_draft',
  timestamps: false,
  indexes: [
    {
      unique: true,
      fields: ['ngay', 'loai_truc', 'ma_phong_id'],
    },
  ],
});

module.exports = DiemDanhDraft;
