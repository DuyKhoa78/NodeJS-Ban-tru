require('dotenv').config();
const { sequelize, Phong, GiaoVien, LichTrucCoDinh, PhanCongTrucGV } = require('../src/models');
const { Op } = require('sequelize');

async function main() {
  console.log('🔄 Đang kết nối cơ sở dữ liệu...');
  await sequelize.authenticate();
  console.log('✅ Kết nối database thành công.');

  // 1. Cập nhật cấu hình phòng ăn SANH
  const [sanhUpdated] = await Phong.update(
    { sl_diem_danh: 3, sl_ho_tro: 2, dang_dung: true },
    { where: { ma_phong: 'SANH' } }
  );
  console.log(`✅ Đã cập nhật giới hạn phòng SANH (sl_diem_danh=3, sl_ho_tro=2). Rows affected: ${sanhUpdated}`);

  // 2. Tìm danh sách GV trực HTA cũ:
  // Đào Thị Cẩm Hạnh (ĐD), Phan Thanh Nhật (ĐD), Lý Công Thành (ĐD), Đỗ Văn Thương (GS), Mai Quỳnh Châu (GS)
  const gvNames = [
    { ho_ten: 'Đào Thị Cẩm Hạnh', nhiem_vu: 0 },
    { ho_ten: 'Phan Thanh Nhật', nhiem_vu: 0 },
    { ho_ten: 'Lý Công Thành', nhiem_vu: 0 },
    { ho_ten: 'Đỗ Văn Thương', nhiem_vu: 1 },
    { ho_ten: 'Mai Quỳnh Châu', nhiem_vu: 1 },
  ];

  const allGVs = await GiaoVien.findAll({ raw: true });
  const gvMap = new Map();
  allGVs.forEach(g => gvMap.set(g.ho_ten.trim().toLowerCase(), g.id));

  const teacherAssignments = gvNames.map(item => {
    const gvId = gvMap.get(item.ho_ten.trim().toLowerCase());
    if (!gvId) throw new Error(`Không tìm thấy GV: ${item.ho_ten}`);
    return {
      ma_gv_id: gvId,
      ho_ten: item.ho_ten,
      nhiem_vu: item.nhiem_vu
    };
  });

  console.log('📋 Danh sách 5 GV chuyển sang trực Sảnh (SANH):', teacherAssignments);

  const t = await sequelize.transaction();
  try {
    // 3. Cập nhật / tạo mới LichTrucCoDinh cho SANH (Thứ 2 -> Thứ 5: thu 0..3)
    await LichTrucCoDinh.destroy({
      where: { ma_phong_id: 'SANH' },
      transaction: t,
    });

    const fixedRecords = [];
    for (const tcher of teacherAssignments) {
      for (let thu = 0; thu < 4; thu++) {
        fixedRecords.push({
          ma_phong_id: 'SANH',
          ma_gv_id: tcher.ma_gv_id,
          thu,
          nhiem_vu: tcher.nhiem_vu,
        });
      }
    }
    await LichTrucCoDinh.bulkCreate(fixedRecords, { transaction: t });
    console.log(`✅ Đã tạo ${fixedRecords.length} lượt trực cố định tại SANH (Thứ 2 -> Thứ 5).`);

    // 4. Cập nhật PhanCongTrucGV các tuần tới (>= 2026-09-28)
    // Xóa các phân công cũ của SANH ở tương lai nếu có
    await PhanCongTrucGV.destroy({
      where: {
        ma_phong_id: 'SANH',
        loai_truc: 0,
        ngay: { [Op.gte]: '2026-09-28' },
      },
      transaction: t,
    });

    // Thêm phân công trực ca Ăn tại SANH cho tuần tới (2026-09-28 -> 2026-10-01)
    const upcomingDates = ['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01'];
    const pcRecords = [];
    for (const ngay of upcomingDates) {
      for (const tcher of teacherAssignments) {
        pcRecords.push({
          ma_phong_id: 'SANH',
          ma_gv_id: tcher.ma_gv_id,
          ngay,
          loai_truc: 0, // Ca Ăn
          nhiem_vu: tcher.nhiem_vu,
          xac_nhan_truc: true,
          ngay_cap_nhat: new Date(),
        });
      }
    }
    await PhanCongTrucGV.bulkCreate(pcRecords, { transaction: t });
    console.log(`✅ Đã tạo ${pcRecords.length} lượt phân công trực ca Ăn tại SANH từ 2026-09-28 đến 2026-10-01.`);

    await t.commit();
    console.log('🎉 Toàn bộ giao dịch hoàn tất thành công!');
  } catch (err) {
    await t.rollback();
    console.error('❌ Thất bại:', err);
    process.exit(1);
  }

  // 5. Kiểm tra lại kết quả
  const countFixed = await LichTrucCoDinh.count({ where: { ma_phong_id: 'SANH' } });
  const countPC = await PhanCongTrucGV.count({
    where: { ma_phong_id: 'SANH', loai_truc: 0, ngay: { [Op.gte]: '2026-09-28' } }
  });
  console.log(`\n📊 KẾT QUẢ KIỂM TRA:`);
  console.log(`   - Lịch trực cố định SANH: ${countFixed} bản ghi`);
  console.log(`   - Phân công ca ăn tuần tới tại SANH: ${countPC} bản ghi`);
}

main().then(() => process.exit(0)).catch(err => {
  console.error(err);
  process.exit(1);
});
