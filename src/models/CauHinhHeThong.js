const { DataTypes } = require('sequelize');
const sequelize = require('../../src/config/database');

const CauHinhHeThong = sequelize.define('CauHinhHeThong', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    defaultValue: 1,
  },
  nam_hoc: {
    type: DataTypes.STRING(20),
    defaultValue: '2026-2027',
  },
  nguoi_phu_trach: {
    type: DataTypes.STRING(100),
    defaultValue: 'T? Th? Di?u L�',
  },
  ten_truong: {
    type: DataTypes.STRING(200),
    defaultValue: 'L� TH? H?NG G?M',
  },
  ngay_cap_nhat: {
    type: DataTypes.DATEONLY,
    allowNull: true,
  },
  ma_bao_mat_gv: {
    type: DataTypes.STRING(10),
    defaultValue: 'BT789',
    comment: 'Mã bảo mật 5 ký tự báo cáo trực GV',
  },
  bao_tri: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    comment: 'Chế độ bảo trì toàn hệ thống',
  },
  thong_bao_bao_tri: {
    type: DataTypes.STRING(500),
    defaultValue: 'Hệ thống Quản lý Bán trú đang được bảo trì và nâng cấp định kỳ. Quý Thầy Cô vui lòng quay lại sau ít phút!',
    comment: 'Nội dung thông báo bảo trì',
  },
  thoi_gian_bao_tri: {
    type: DataTypes.STRING(100),
    defaultValue: 'Dự kiến hoàn tất trong 15-30 phút',
    comment: 'Thời gian dự kiến bảo trì',
  },
}, {
  tableName: 'core_cauhinhhethong',
  timestamps: false,
});

module.exports = CauHinhHeThong;

