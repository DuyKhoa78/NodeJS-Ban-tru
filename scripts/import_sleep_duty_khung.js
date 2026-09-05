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

  // Cập nhật sl_diem_danh và sl_ho_tro cho các phòng nếu cần
  await Phong.update({ sl_diem_danh: 2, sl_ho_tro: 1 }, { where: { ma_phong: ['D41', 'D42', 'D43'] } });
  await Phong.update({ sl_diem_danh: 1, sl_ho_tro: 1 }, { where: { ma_phong: ['D21', 'D22', 'D23', 'D31', 'D32', 'D33', 'E', 'E1', 'E2', 'E3', 'A21'] } });
  await Phong.update({ sl_diem_danh: 3, sl_ho_tro: 1 }, { where: { ma_phong: 'A20' } });
  console.log('✅ Đã cập nhật giới hạn số lượng GV điểm danh / hỗ trợ cho các phòng.');

  // Danh sách phân công từ ảnh của người dùng:
  // thu: 0 = Thứ 2, 1 = Thứ 3, 2 = Thứ 4, 3 = Thứ 5
  const assignments = [
    // 1. A20 nam: Trần Bá Lâm, Bùi Phùng Đức Anh, Huỳnh Duy Khoa, Phan Thanh Nhật (Cố định)
    {
      phongs: ['A20'],
      gv: 'Trần Bá Lâm',
      thus: [0, 1, 2, 3],
      nhiem_vu: 0,
    },
    {
      phongs: ['A20'],
      gv: 'Bùi Phùng Đức Anh',
      thus: [0, 1, 2, 3],
      nhiem_vu: 0,
    },
    {
      phongs: ['A20'],
      gv: 'Phan Thanh Nhật',
      thus: [0, 1, 2, 3],
      nhiem_vu: 0,
    },
    {
      phongs: ['A20'],
      gv: 'Huỳnh Duy Khoa',
      thus: [0, 1, 2, 3],
      nhiem_vu: 1,
    },

    // 2. E nam: Lê Hoàng Hà, Đỗ Văn Thương (Cố định)
    {
      phongs: ['E'],
      gv: 'Lê Hoàng Hà',
      thus: [0, 1, 2, 3],
      nhiem_vu: 0,
    },
    {
      phongs: ['E'],
      gv: 'Đỗ Văn Thương',
      thus: [0, 1, 2, 3],
      nhiem_vu: 1,
    },

    // 3. D41, 42, 43 nam: Lý Công Thành (CĐ), Bùi Thanh Toàn (CĐ), Trần Nhật Tân (T2, T3), Nguyễn Ngọc Cầm (T4, T5)
    {
      phongs: ['D41', 'D42', 'D43'],
      gv: 'Lý Công Thành',
      thus: [0, 1, 2, 3],
      nhiem_vu: 0,
    },
    {
      phongs: ['D41', 'D42', 'D43'],
      gv: 'Bùi Thanh Toàn',
      thus: [0, 1, 2, 3],
      nhiem_vu: 1,
    },
    {
      phongs: ['D41', 'D42', 'D43'],
      gv: 'Trần Nhật Tân',
      thus: [0, 1],
      nhiem_vu: 0,
    },
    {
      phongs: ['D41', 'D42', 'D43'],
      gv: 'Nguyễn Ngọc Cầm',
      thus: [2, 3],
      nhiem_vu: 0,
    },

    // 4. E1 nam: Hồ Quang Thịnh (Cố định)
    {
      phongs: ['E1'],
      gv: 'Hồ Quang Thịnh',
      thus: [0, 1, 2, 3],
      nhiem_vu: 0,
    },

    // 5. E2 nữ: Trần Thị Kim Thoại, Đỗ Ngọc Bích Vân (Cố định)
    {
      phongs: ['E2'],
      gv: 'Trần Thị Kim Thoại',
      thus: [0, 1, 2, 3],
      nhiem_vu: 0,
    },
    {
      phongs: ['E2'],
      gv: 'Đỗ Ngọc Bích Vân',
      thus: [0, 1, 2, 3],
      nhiem_vu: 1,
    },

    // 6. E3 nữ: Trần Nhật Thiên Thanh (T2, T5), Đinh Thị Tuyết Lan (T3, T4), Trần Thị Khánh Huyền (T2, T3), Cao Thị Mai Huệ (T4, T5)
    {
      phongs: ['E3'],
      gv: 'Trần Nhật Thiên Thanh',
      thus: [0, 3],
      nhiem_vu: 0,
    },
    {
      phongs: ['E3'],
      gv: 'Đinh Thị Tuyết Lan',
      thus: [1, 2],
      nhiem_vu: 0,
    },
    {
      phongs: ['E3'],
      gv: 'Trần Thị Khánh Huyền',
      thus: [0, 1],
      nhiem_vu: 1,
    },
    {
      phongs: ['E3'],
      gv: 'Cao Thị Mai Huệ',
      thus: [2, 3],
      nhiem_vu: 1,
    },

    // 7. D21, D22, D23 nữ: Lê Thị Huyền Nhung (T3, T4), Nguyễn Thị Nhung (T2, T5), Hoàng Thanh Thủy (T2, T5), Mai Thị Tường Vi (T3, T4)
    {
      phongs: ['D21', 'D22', 'D23'],
      gv: 'Nguyễn Thị Nhung',
      thus: [0, 3],
      nhiem_vu: 0,
    },
    {
      phongs: ['D21', 'D22', 'D23'],
      gv: 'Hoàng Thanh Thủy',
      thus: [0, 3],
      nhiem_vu: 1,
    },
    {
      phongs: ['D21', 'D22', 'D23'],
      gv: 'Lê Thị Huyền Nhung',
      thus: [1, 2],
      nhiem_vu: 0,
    },
    {
      phongs: ['D21', 'D22', 'D23'],
      gv: 'Mai Thị Tường Vi',
      thus: [1, 2],
      nhiem_vu: 1,
    },

    // 8. D31, 32, 33 nữ: Phạm Thị Thanh Hà, Đặng Thị Yến (Cố định)
    {
      phongs: ['D31', 'D32', 'D33'],
      gv: 'Phạm Thị Thanh Hà',
      thus: [0, 1, 2, 3],
      nhiem_vu: 0,
    },
    {
      phongs: ['D31', 'D32', 'D33'],
      gv: 'Đặng Thị Yến',
      thus: [0, 1, 2, 3],
      nhiem_vu: 1,
    },

    // 9. A21: Đào Thị Cẩm Hạnh (Cố định)
    {
      phongs: ['A21'],
      gv: 'Đào Thị Cẩm Hạnh',
      thus: [0, 1, 2, 3],
      nhiem_vu: 0,
    },
  ];

  // Xây dựng danh sách bản ghi
  const recordsToInsert = [];
  for (const a of assignments) {
    const gvId = getGvId(a.gv);
    for (const p of a.phongs) {
      for (const thu of a.thus) {
        recordsToInsert.push({
          ma_phong_id: p,
          ma_gv_id: gvId,
          thu,
          nhiem_vu: a.nhiem_vu,
        });
      }
    }
  }

  console.log(`⚡ Chuẩn bị thêm ${recordsToInsert.length} bản ghi lịch trực cố định ngủ vào CSDL...`);

  const t = await sequelize.transaction();
  try {
    // Xóa lịch trực ngủ cũ trong LichTrucCoDinh (chỉ các phòng ngủ)
    const sleepRooms = ['A20', 'A21', 'E', 'E1', 'E2', 'E3', 'D41', 'D42', 'D43', 'D21', 'D22', 'D23', 'D31', 'D32', 'D33'];
    await LichTrucCoDinh.destroy({
      where: { ma_phong_id: sleepRooms },
      transaction: t,
    });

    await LichTrucCoDinh.bulkCreate(recordsToInsert, {
      transaction: t,
      ignoreDuplicates: true,
    });

    await t.commit();
    console.log('🎉 Đã lưu toàn bộ lịch trực ngủ cố định thành công!');
  } catch (err) {
    await t.rollback();
    console.error('❌ Lỗi khi lưu:', err);
    process.exit(1);
  }

  // Thống kê kết quả
  const total = await LichTrucCoDinh.count();
  console.log(`\n📊 TỔNG SỐ LỊCH TRỰC CỐ ĐỊNH TRONG CSDL: ${total}`);

  // Thống kê theo ngày
  const days = ['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5'];
  for (let i = 0; i < 4; i++) {
    const count = await LichTrucCoDinh.count({ where: { thu: i } });
    console.log(`   - ${days[i]}: ${count} lượt phân công phòng`);
  }

  process.exit(0);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
