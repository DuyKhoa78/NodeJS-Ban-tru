require('dotenv').config();
const { sequelize, LichTrucCoDinh, GiaoVien, Phong } = require('../src/models');

async function main() {
  console.log('🔄 Đang kết nối cơ sở dữ liệu...');
  await sequelize.authenticate();
  console.log('✅ Kết nối CSDL thành công.');

  const gvs = await GiaoVien.findAll({ raw: true });
  const gvMap = new Map();
  gvs.forEach(g => gvMap.set(g.ho_ten.trim().toLowerCase(), g.id));

  function getGvId(name) {
    const id = gvMap.get(name.trim().toLowerCase());
    if (!id) throw new Error(`Không tìm thấy giáo viên: "${name}" trong CSDL`);
    return id;
  }

  // Cập nhật cấu hình phòng ăn nếu cần
  await Phong.update({ sl_diem_danh: 3, sl_ho_tro: 2 }, { where: { ma_phong: 'HT.A' } });
  await Phong.update({ sl_diem_danh: 1, sl_ho_tro: 1 }, { where: { ma_phong: ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8'] } });
  console.log('✅ Đã cập nhật giới hạn số lượng GV điểm danh / giám sát cho các phòng ăn.');

  // Danh sách phân công trực ăn (Cố định Thứ 2 -> Thứ 5: thu 0, 1, 2, 3):
  const assignments = [
    // 1. HT A: Đào Thị Cẩm Hạnh (ĐD)
    { phongs: ['HT.A'], gv: 'Đào Thị Cẩm Hạnh', nhiem_vu: 0 },
    // 2. HT A: Phan Thanh Nhật (ĐD)
    { phongs: ['HT.A'], gv: 'Phan Thanh Nhật', nhiem_vu: 0 },
    // 3. HT A: Lý Công Thành (ĐD)
    { phongs: ['HT.A'], gv: 'Lý Công Thành', nhiem_vu: 0 },
    // 4. HT A: Đỗ Văn Thương (GS)
    { phongs: ['HT.A'], gv: 'Đỗ Văn Thương', nhiem_vu: 1 },
    // 5. HT A: Mai Quỳnh Châu (GS)
    { phongs: ['HT.A'], gv: 'Mai Quỳnh Châu', nhiem_vu: 1 },

    // 6. Phòng ăn 1 (P1): Đặng Thị Yến (ĐD)
    { phongs: ['P1'], gv: 'Đặng Thị Yến', nhiem_vu: 0 },
    // 8. Phòng ăn 1 (P1): Bùi Thanh Toàn (GS)
    { phongs: ['P1'], gv: 'Bùi Thanh Toàn', nhiem_vu: 1 },

    // 7. Phòng ăn 2 (P2): Cao Thị Mai Huệ (ĐD)
    { phongs: ['P2'], gv: 'Cao Thị Mai Huệ', nhiem_vu: 0 },
    // 9. Phòng ăn 2 (P2): Hồ Quang Thịnh (GS)
    { phongs: ['P2'], gv: 'Hồ Quang Thịnh', nhiem_vu: 1 },

    // 10. Phòng ăn 3, 4 (P3, P4): Lê Hoàng Hà (ĐD)
    { phongs: ['P3', 'P4'], gv: 'Lê Hoàng Hà', nhiem_vu: 0 },

    // 11. Phòng ăn 5 (P5): Huỳnh Duy Khoa (ĐD)
    { phongs: ['P5'], gv: 'Huỳnh Duy Khoa', nhiem_vu: 0 },

    // 13. Phòng ăn 3, 4, 5 (P3, P4, P5): Lê Thị Huyền Nhung (GS)
    { phongs: ['P3', 'P4', 'P5'], gv: 'Lê Thị Huyền Nhung', nhiem_vu: 1 },

    // 12. Phòng ăn 6, 7, 8 (P6, P7, P8): Bùi Phùng Đức Anh (ĐD)
    { phongs: ['P6', 'P7', 'P8'], gv: 'Bùi Phùng Đức Anh', nhiem_vu: 0 },

    // 14. Phòng ăn 6, 7, 8 (P6, P7, P8): Đỗ Ngọc Bích Vân (GS)
    { phongs: ['P6', 'P7', 'P8'], gv: 'Đỗ Ngọc Bích Vân', nhiem_vu: 1 },
  ];

  const diningRooms = ['HT.A', 'P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8'];
  const recordsToInsert = [];

  for (const a of assignments) {
    const gvId = getGvId(a.gv);
    for (const p of a.phongs) {
      for (let thu = 0; thu < 4; thu++) { // Thứ 2 (0) -> Thứ 5 (3)
        recordsToInsert.push({
          ma_phong_id: p,
          ma_gv_id: gvId,
          thu,
          nhiem_vu: a.nhiem_vu,
        });
      }
    }
  }

  console.log(`⚡ Chuẩn bị thêm ${recordsToInsert.length} bản ghi lịch trực ăn cố định vào CSDL...`);

  const t = await sequelize.transaction();
  try {
    // Chỉ xóa các phòng ăn trong LichTrucCoDinh, không đụng đến phòng ngủ!
    await LichTrucCoDinh.destroy({
      where: { ma_phong_id: diningRooms },
      transaction: t,
    });

    await LichTrucCoDinh.bulkCreate(recordsToInsert, {
      transaction: t,
      ignoreDuplicates: true,
    });

    await t.commit();
    console.log('🎉 Đã lưu toàn bộ lịch trực ăn cố định thành công!');
  } catch (err) {
    await t.rollback();
    console.error('❌ Lỗi lưu lịch trực ăn:', err);
    process.exit(1);
  }

  // Thống kê kết quả
  const totalEating = await LichTrucCoDinh.count({ where: { ma_phong_id: diningRooms } });
  const totalSleeping = await LichTrucCoDinh.count({ where: { ma_phong_id: { [sequelize.Sequelize.Op.notIn]: diningRooms } } });
  const grandTotal = await LichTrucCoDinh.count();

  console.log(`\n📊 THỐNG KÊ LỊCH TRỰC CỐ ĐỊNH:`);
  console.log(`   - Tổng phân công Ca Ăn: ${totalEating} lượt`);
  console.log(`   - Tổng phân công Ca Ngủ: ${totalSleeping} lượt`);
  console.log(`   - Tổng cộng toàn hệ thống: ${grandTotal} lượt`);

  // Kiểm tra chi tiết từng phòng ăn
  console.log('\n🍽️ CHI TIẾT PHÂN CÔNG TỪNG PHÒNG ĂN (Thứ 2 - Thứ 5):');
  for (const p of diningRooms) {
    const gvsInRoom = await LichTrucCoDinh.findAll({
      where: { ma_phong_id: p, thu: 0 }, // Vì cố định nên Thứ 2 đại diện cả tuần
      include: [{ model: GiaoVien, as: 'giao_vien' }],
      order: [['nhiem_vu', 'ASC']],
    });
    console.log(`   [${p}]: ${gvsInRoom.map(r => `${r.giao_vien.ho_ten} (${r.nhiem_vu === 0 ? 'ĐD' : 'GS'})`).join(', ')}`);
  }

  process.exit(0);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
