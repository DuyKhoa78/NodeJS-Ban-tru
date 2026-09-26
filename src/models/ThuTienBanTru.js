const { DataTypes } = require('sequelize');
const sequelize = require('../../src/config/database');

const ThuTienBanTru = sequelize.define('ThuTienBanTru', {
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
  dot: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'Đợt thanh toán (1, 2, ...)',
  },
  thang: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'Tháng thanh toán (1-12)',
  },
  nam: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 2026,
  },
  so_phieu: {
    type: DataTypes.STRING(50),
    allowNull: true,
    unique: true,
    comment: 'Số biên lai / Phiếu thu',
  },
  so_tien_phai_thu: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: false,
    defaultValue: 0,
  },
  so_tien_da_thu: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: false,
    defaultValue: 0,
  },
  so_tien_mien_giam: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: false,
    defaultValue: 0,
  },
  ly_do_mien_giam: {
    type: DataTypes.STRING(255),
    allowNull: true,
  },
  trang_thai: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    comment: '0: Chưa thu, 1: Đã thu đủ, 2: Thu một phần, 3: Miễn giảm 100%',
  },
  hinh_thuc_thu: {
    type: DataTypes.STRING(30),
    allowNull: true,
    comment: 'tien_mat | chuyen_khoan | vi_dien_tu',
  },
  ngay_thu: {
    type: DataTypes.DATEONLY,
    allowNull: true,
  },
  nguoi_thu_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: { model: 'accounts_staffuser', key: 'id' },
  },
  ghi_chu: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  is_khoa: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    comment: 'Đã khóa sổ kế toán, không cho chỉnh sửa',
  },
}, {
  tableName: 'nghiepvu_thutien_bantru',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    {
      unique: true,
      fields: ['ma_hs_id', 'dot', 'thang', 'nam'],
    },
  ],
});

module.exports = ThuTienBanTru;
