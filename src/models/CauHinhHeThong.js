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
        defaultValue: 'Vũ Quốc Phong',
    },
    ten_truong: {
        type: DataTypes.STRING(200),
        defaultValue: 'Lê Thị Hồng Gấm',
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
    tien_an: {
        type: DataTypes.INTEGER,
        defaultValue: 38000,
        comment: 'Tiền ăn bán trú học sinh (đồng/suất/ngày)',
    },
    link_google_form: {
        type: DataTypes.STRING(500),
        allowNull: true,
        defaultValue: '',
        comment: 'Link Google Form dự phòng để GV gửi báo cáo nếu cần',
    },
    phu_cap_truc_tbi: {
        type: DataTypes.INTEGER,
        defaultValue: 100000,
        comment: 'Phụ cấp Trực Thiết bị (đồng/ca)',
    },
    phu_cap_gs_ban_tru: {
        type: DataTypes.INTEGER,
        defaultValue: 250000,
        comment: 'Phụ cấp Giám sát bán trú (đồng/ca)',
    },
    phu_cap_gs_an: {
        type: DataTypes.INTEGER,
        defaultValue: 100000,
        comment: 'Phụ cấp Giám sát ăn (đồng/ca)',
    },
    phu_cap_y_te: {
        type: DataTypes.INTEGER,
        defaultValue: 70000,
        comment: 'Phụ cấp Y tế (đồng/ca)',
    },
}, {
    tableName: 'core_cauhinhhethong',
    timestamps: false,
});

module.exports = CauHinhHeThong;

