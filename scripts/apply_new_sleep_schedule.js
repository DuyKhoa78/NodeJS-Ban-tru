require('dotenv').config();
const { sequelize, LichTrucCoDinh, GiaoVien, Phong } = require('../src/models');

async function main() {
  console.log('🔄 Đang kết nối cơ sở dữ liệu...');
  await sequelize.authenticate();
  console.log('✅ Kết nối CSDL thành công.');

  // 1. Kiểm tra tất cả phòng ngủ trong DB
  const sleepingRooms = await Phong.findAll({ where: { loai_phong: 1 }, raw: true });
  const roomCodes = new Set(sleepingRooms.map(r => r.ma_phong));
  console.log(`🏠 Tìm thấy ${sleepingRooms.length} phòng ngủ trong CSDL.`);

  // 2. Kiểm tra danh sách giáo viên
  const gvs = await GiaoVien.findAll({ raw: true });
  const gvByName = new Map();
  gvs.forEach(g => gvByName.set(g.ho_ten.trim().toLowerCase(), g));

  function getGv(name) {
    const g = gvByName.get(name.trim().toLowerCase());
    if (!g) throw new Error(`Không tìm thấy giáo viên: "${name}" trong CSDL`);
    return g;
  }

  // 3. Cấu hình phân công theo yêu cầu:
  // thu: 0 = Thứ 2, 1 = Thứ 3, 2 = Thứ 4, 3 = Thứ 5
  // Đối với phòng 3 giáo viên thì chia ra 1 người 1 phòng (D31, D32, D33 & D41, D42, D43)
  const scheduleConfig = [
    // ══════════════════════════════════════════════════
    // PHÒNG NỮ
    // ══════════════════════════════════════════════════
    { room: 'HTA_1', gv: 'Phạm Thị Thanh Hà', thus: [0, 1, 2, 3], nhiem_vu: 0 },
    { room: 'HTA_2', gv: 'Trần Thị Kim Thoại', thus: [0, 1, 2, 3], nhiem_vu: 0 },
    { room: 'HTA_3', gv: 'Đặng Thị Yến', thus: [0, 1, 2, 3], nhiem_vu: 0 },
    { room: 'HTA_4', gv: 'Cao Thị Mai Huệ', thus: [0, 1, 2, 3], nhiem_vu: 0 },
    { room: 'HTA_5', gv: 'Đào Thị Cẩm Hạnh', thus: [0, 1, 2, 3], nhiem_vu: 0 },

    { room: 'HTA20_1', gv: 'Lê Thị Huyền Nhung', thus: [0, 1, 2, 3], nhiem_vu: 0 },
    { room: 'HTA20_2', gv: 'Đỗ Ngọc Bích Vân', thus: [0, 1, 2, 3], nhiem_vu: 0 },
    // HTA20_3: Mai Thị Tường Vi (thứ 3, thứ 4), Đinh Thị Tuyết Lan (thứ 2, thứ 5)
    { room: 'HTA20_3', gv: 'Đinh Thị Tuyết Lan', thus: [0, 3], nhiem_vu: 0 },
    { room: 'HTA20_3', gv: 'Mai Thị Tường Vi', thus: [1, 2], nhiem_vu: 0 },

    { room: 'D21', gv: 'Trần Nhật Thiên Thanh', thus: [0, 1, 2, 3], nhiem_vu: 0 },

    // D22: Hoàng Thanh Thủy (Thứ 2, thứ 5), Trần Thị Khánh Huyền (Thứ 3, thứ 4)
    { room: 'D22', gv: 'Hoàng Thanh Thủy', thus: [0, 3], nhiem_vu: 0 },
    { room: 'D22', gv: 'Trần Thị Khánh Huyền', thus: [1, 2], nhiem_vu: 0 },

    { room: 'D23', gv: 'Nguyễn Thị Nhung', thus: [0, 1, 2, 3], nhiem_vu: 0 },

    // ══════════════════════════════════════════════════
    // PHÒNG NAM
    // ══════════════════════════════════════════════════
    { room: 'D11', gv: 'Phan Thanh Nhật', thus: [0, 1, 2, 3], nhiem_vu: 0 },

    // Cụm D31, D32, D33: chia đều 1 người 1 phòng
    { room: 'D31', gv: 'Bùi Phùng Đức Anh', thus: [0, 1, 2, 3], nhiem_vu: 0 },
    { room: 'D32', gv: 'Lý Công Thành', thus: [0, 1, 2, 3], nhiem_vu: 0 },
    { room: 'D33', gv: 'Nguyễn Ngọc Cầm', thus: [0, 1, 2, 3], nhiem_vu: 0 },

    // Cụm D41, D42, D43: chia đều 1 người 1 phòng
    { room: 'D41', gv: 'Huỳnh Duy Khoa', thus: [0, 1, 2, 3], nhiem_vu: 0 },
    { room: 'D42', gv: 'Đỗ Văn Thương', thus: [0, 1, 2, 3], nhiem_vu: 0 },
    { room: 'D43', gv: 'Hồ Quang Thịnh', thus: [0, 1, 2, 3], nhiem_vu: 0 },

    // Cụm C11, C12: Bùi Thanh Toàn trực cả 2 phòng
    { room: 'C11', gv: 'Bùi Thanh Toàn', thus: [0, 1, 2, 3], nhiem_vu: 0 },
    { room: 'C12', gv: 'Bùi Thanh Toàn', thus: [0, 1, 2, 3], nhiem_vu: 0 },

    // Cụm C13, C14: Trần Bá Lâm trực cả 2 phòng
    { room: 'C13', gv: 'Trần Bá Lâm', thus: [0, 1, 2, 3], nhiem_vu: 0 },
    { room: 'C14', gv: 'Trần Bá Lâm', thus: [0, 1, 2, 3], nhiem_vu: 0 },

    // A21: Lê Hoàng Hà
    { room: 'A21', gv: 'Lê Hoàng Hà', thus: [0, 1, 2, 3], nhiem_vu: 0 }
  ];

  // 4. Validate toàn bộ dữ liệu trước khi chạy transaction
  const recordsToInsert = [];
  const assignedSleepingRooms = new Set();

  for (const item of scheduleConfig) {
    if (!roomCodes.has(item.room)) {
      throw new Error(`Phòng "${item.room}" không tồn tại trong danh sách phòng ngủ CSDL!`);
    }
    assignedSleepingRooms.add(item.room);

    const gv = getGv(item.gv);
    const room = sleepingRooms.find(r => r.ma_phong === item.room);

    // Kiểm tra giới tính
    if (room.gioi_tinh !== null && gv.gioi_tinh !== room.gioi_tinh) {
      throw new Error(`Lỗi giới tính: GV ${gv.ho_ten} (${gv.gioi_tinh === 0 ? 'Nam' : 'Nữ'}) không khớp phòng ${room.ma_phong} (${room.gioi_tinh === 0 ? 'Nam' : 'Nữ'})`);
    }

    for (const thu of item.thus) {
      recordsToInsert.push({
        ma_phong_id: item.room,
        ma_gv_id: gv.id,
        thu,
        nhiem_vu: item.nhiem_vu ?? 0
      });
    }
  }

  console.log(`✅ Toàn bộ ${recordsToInsert.length} lượt phân công phòng ngủ đã được xác thực (Giới tính & ID chuẩn).`);
  console.log(`🏠 Số phòng ngủ được phân công: ${assignedSleepingRooms.size}/${sleepingRooms.length}`);

  // Kiểm tra phòng ngủ chưa được gán
  const unassignedRooms = [...roomCodes].filter(r => !assignedSleepingRooms.has(r));
  if (unassignedRooms.length > 0) {
    console.warn('⚠️ Cảnh báo: Có phòng ngủ chưa được gán:', unassignedRooms);
  } else {
    console.log('🌟 Toàn bộ 100% phòng ngủ trong CSDL đã có phân công chính xác!');
  }

  // 5. Thực hiện Transaction: Xóa chỉ các phòng ngủ, giữ nguyên phòng ăn
  const sleepRoomCodes = Array.from(roomCodes);
  const t = await sequelize.transaction();
  try {
    const deletedCount = await LichTrucCoDinh.destroy({
      where: { ma_phong_id: sleepRoomCodes },
      transaction: t
    });
    console.log(`🗑️ Đã xóa ${deletedCount} bản ghi lịch trực ngủ cũ trong LichTrucCoDinh.`);

    const createdRecords = await LichTrucCoDinh.bulkCreate(recordsToInsert, {
      transaction: t
    });
    console.log(`✨ Đã thêm ${createdRecords.length} bản ghi lịch trực ngủ mới vào LichTrucCoDinh.`);

    await t.commit();
    console.log('🎉 GIAO DỊCH THÀNH CÔNG! Đã lưu lịch trực cố định mới.');
  } catch (err) {
    await t.rollback();
    console.error('❌ Lỗi giao dịch, đã rollback:', err);
    process.exit(1);
  }

  // 6. Kiểm tra lại dữ liệu sau khi lưu
  const total = await LichTrucCoDinh.count();
  const eatingCount = await LichTrucCoDinh.count({ where: { ma_phong_id: { [sequelize.Sequelize.Op.notIn]: sleepRoomCodes } } });
  const sleepingCount = await LichTrucCoDinh.count({ where: { ma_phong_id: sleepRoomCodes } });

  console.log('\n📊 THỐNG KÊ LỊCH TRỰC CỐ ĐỊNH:');
  console.log(`   - Tổng số bản ghi: ${total}`);
  console.log(`   - Lịch ca ăn: ${eatingCount} (bảo toàn nguyên vẹn)`);
  console.log(`   - Lịch ca ngủ: ${sleepingCount}`);

  const days = ['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5'];
  for (let i = 0; i < 4; i++) {
    const c = await LichTrucCoDinh.count({ where: { thu: i, ma_phong_id: sleepRoomCodes } });
    console.log(`   - ${days[i]} (ngủ): ${c} phòng được trực`);
  }

  process.exit(0);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
