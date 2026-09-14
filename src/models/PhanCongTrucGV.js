const { DataTypes } = require('sequelize');
const sequelize = require('../../src/config/database');

const PhanCongTrucGV = sequelize.define('PhanCongTrucGV', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  ma_gv_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'quanli_giaovien', key: 'id' },
  },
  ma_gv_truc_thay_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: { model: 'quanli_giaovien', key: 'id' },
  },
  ten_gv_truc_thay: {
    type: DataTypes.STRING(255),
    allowNull: true,
    comment: 'Họ tên người ngoài danh sách GV khi trực thay thủ công',
  },
  ma_phong_id: {
    type: DataTypes.STRING(4),
    allowNull: false,
    references: { model: 'quanli_phong', key: 'ma_phong' },
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
  xac_nhan_truc: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
  },
  nhiem_vu: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    comment: '0=DiemDanh, 1=GiamSat',
  },
  // ─── Audit Fields ─────────────────────────────────────────────────
  ngay_cap_nhat: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'Thời điểm cập nhật lần cuối',
  },
  nguoi_cap_nhat_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: { model: 'accounts_staffuser', key: 'id' },
    comment: 'ID tài khoản đã cập nhật',
  },
}, {
  tableName: 'nghiepvu_phancongtrucgv',
  timestamps: false,
  indexes: [
    {
      unique: true,
      fields: ['ma_gv_id', 'ngay', 'loai_truc', 'ma_phong_id'],
      // Lưu ý nghiệp vụ: Một GV có thể phụ trách cụm phòng nhỏ liền kề trong cùng ca trực (ví dụ: P6-P7-P8),
      // do đó ma_phong_id là thành phần bắt buộc của unique index để đảm bảo tính toàn vẹn dữ liệu.
    },
  ],
});

module.exports = PhanCongTrucGV;
