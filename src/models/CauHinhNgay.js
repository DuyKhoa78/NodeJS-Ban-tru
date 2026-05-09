const { DataTypes } = require('sequelize');
const sequelize = require('../../src/config/database');

/**
 * Cấu hình ngày đặc biệt: ngày chỉ một số lớp nhất định tham gia bán trú.
 * - lop_ap_dung: null = toàn trường, JSON array string = ['10A1','10A2']
 * - hs_loai_tru: null = không loại trừ ai, JSON array number = [5,12,33] (id hs)
 */
const CauHinhNgay = sequelize.define('CauHinhNgay', {
  ngay: {
    type: DataTypes.DATEONLY,
    primaryKey: true,
  },
  lop_ap_dung: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'JSON array lớp được phép bán trú, null = toàn trường. VD: ["10A1","10A2"]',
  },
  hs_loai_tru: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'JSON array id HS bị loại trừ thêm. VD: [5,12,33]',
  },
  hs_them_vao: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'JSON array HS thêm tay với phòng riêng. VD: [{"id":7,"phong_an":"A01","phong_ngu":"N01"},...]',
  },
  lop_phong_an: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'JSON object gán lớp → phòng ăn. VD: {"10A1":"A01","10A2":"A02"}',
  },
  lop_phong_ngu: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'JSON object gán lớp ở phòng ngủ. VD: {"10A1":"N01","10A2":"N02"}',
  },
  phong_tam_an: {
    type: DataTypes.STRING(50),
    allowNull: true,
  },
  phong_tam_ngu: {
    type: DataTypes.STRING(50),
    allowNull: true,
  },
  ghi_chu: {
    type: DataTypes.STRING(255),
    allowNull: true,
  },
  is_nghi: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    comment: 'Đánh dấu true nếu ngày này toàn trường nghỉ bán trú',
  },
}, {
  tableName: 'core_cauhinh_ngay',
  timestamps: false,
});

module.exports = CauHinhNgay;
