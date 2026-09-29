const { DataTypes } = require('sequelize');
const sequelize = require('../../src/config/database');

const ThanhToanLuongGV = sequelize.define('ThanhToanLuongGV', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  ky_truc_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: 'ID kỳ trực (core_kytrucgv)',
  },
  ma_gv_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'ID giáo viên (quanli_giaovien) - null nếu ngoài danh sách hoặc thanh toán gộp',
  },
  ten_gv: {
    type: DataTypes.STRING(255),
    allowNull: false,
    comment: 'Tên giáo viên hoặc nhân sự ngoài danh sách',
  },
  so_tien: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false,
    comment: 'Số tiền thanh toán',
  },
  ngay_thanh_toan: {
    type: DataTypes.DATEONLY,
    allowNull: false,
    defaultValue: DataTypes.NOW,
    comment: 'Ngày thanh toán',
  },
  hinh_thuc: {
    type: DataTypes.STRING(50),
    defaultValue: 'chuyen_khoan',
    comment: 'chuyen_khoan | tien_mat',
  },
  nguoi_thao_tac_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  nguoi_thao_tac_ten: {
    type: DataTypes.STRING(255),
    allowNull: true,
  },
  ghi_chu: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  trang_thai: {
    type: DataTypes.STRING(20),
    allowNull: false,
    defaultValue: 'thanh_cong',
    comment: 'thanh_cong | da_huy',
  },
  ly_do_huy: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  ngay_huy: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  nguoi_huy_ten: {
    type: DataTypes.STRING(255),
    allowNull: true,
  },
}, {
  tableName: 'core_thanhtoan_luonggv',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    {
      fields: ['ky_truc_id'],
    },
    {
      fields: ['ma_gv_id'],
    },
    {
      fields: ['trang_thai'],
    },
  ],
});

module.exports = ThanhToanLuongGV;
