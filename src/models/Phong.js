const { DataTypes } = require('sequelize');
const sequelize = require('../../src/config/database');

const Phong = sequelize.define('Phong', {
  ma_phong: {
    type: DataTypes.STRING(10),
    primaryKey: true,
  },
  loai_phong: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: '0=An, 1=Ngu',
  },
  suc_chua: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  gioi_tinh: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: '0=Nam, 1=Nu; NULL nếu phòng ăn',
  },
  sl_diem_danh: {
    type: DataTypes.INTEGER,
    defaultValue: 1,
  },
  sl_ho_tro: {
    type: DataTypes.INTEGER,
    defaultValue: 1,
  },
  dang_dung: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
    comment: 'true=Đang sử dụng, false=Lịch sử/Đã lưu trữ',
  },
}, {
  tableName: 'quanli_phong',
  timestamps: false,
});

module.exports = Phong;
