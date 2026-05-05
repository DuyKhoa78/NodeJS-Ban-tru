const { DataTypes } = require('sequelize');
const sequelize = require('../../src/config/database');

const StaffUser = sequelize.define('StaffUser', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  username: {
    type: DataTypes.STRING(150),
    allowNull: false,
    unique: true,
  },
  password: {
    type: DataTypes.STRING(255),
    allowNull: false,
  },
  fullname: {
    type: DataTypes.STRING(255),
    defaultValue: '',
  },
  position: {
    type: DataTypes.STRING(255),
    defaultValue: '',
  },
  role: {
    type: DataTypes.ENUM('admin', 'hoc_vu', 'quan_ly', 'ke_toan'),
    defaultValue: 'ke_toan',
  },
  email: {
    type: DataTypes.STRING(254),
    allowNull: true,
  },
  is_active: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
  },
  is_superuser: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
  date_joined: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
  },
}, {
  tableName: 'accounts_staffuser',
  timestamps: false,
});

// ─── Virtual Getters ──────────────────────────────────────────────────────────
StaffUser.prototype.get_is_admin = function () {
  return this.is_superuser || this.role === 'admin';
};
StaffUser.prototype.get_is_hoc_vu = function () {
  return this.role === 'hoc_vu';
};
StaffUser.prototype.get_is_quan_ly = function () {
  return this.role === 'quan_ly';
};
StaffUser.prototype.get_is_ke_toan = function () {
  return this.role === 'ke_toan';
};
StaffUser.prototype.can_diem_danh = function () {
  return this.is_superuser || this.role === 'admin' || this.role === 'hoc_vu';
};
StaffUser.prototype.can_quan_ly_danh_muc = function () {
  return this.is_superuser || this.role === 'admin' || this.role === 'quan_ly';
};
StaffUser.prototype.can_quan_tri = function () {
  return this.is_superuser || this.role === 'admin';
};

module.exports = StaffUser;
