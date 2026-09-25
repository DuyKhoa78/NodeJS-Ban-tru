const { DataTypes } = require('sequelize');
const sequelize = require('../../src/config/database');

const LichSuPhanPhong = sequelize.define('LichSuPhanPhong', {
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
  loai_phong: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: '0=Ăn, 1=Ngủ',
  },
  ma_phong_id: {
    type: DataTypes.STRING(10),
    allowNull: true,
    references: { model: 'quanli_phong', key: 'ma_phong' },
  },
  tu_ngay: {
    type: DataTypes.DATEONLY,
    allowNull: false,
    comment: 'Ngày bắt đầu ở phòng này',
  },
  den_ngay: {
    type: DataTypes.DATEONLY,
    allowNull: true,
    comment: 'Ngày kết thúc ở phòng này (NULL nếu đang ở)',
  },
  ghi_chu: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  created_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
  },
}, {
  tableName: 'quanli_lichsuphanphong',
  timestamps: false,
  indexes: [
    {
      fields: ['ma_hs_id', 'loai_phong', 'tu_ngay'],
    },
    {
      fields: ['ma_phong_id', 'loai_phong', 'tu_ngay', 'den_ngay'],
    },
  ],
});

module.exports = LichSuPhanPhong;
