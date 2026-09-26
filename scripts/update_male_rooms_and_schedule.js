require('dotenv').config();
const { sequelize, Phong, HocSinh, GiaoVien, LichTrucCoDinh, LichSuPhanPhong } = require('../src/models');
const { Op } = require('sequelize');

async function run() {
  console.log('🔄 BẮT ĐẦU CẬP NHẬT PHÒNG NAM, PHÂN PHÒNG HỌC SINH VÀ LỊCH TRỰC GIÁO VIÊN NAM...');
  await sequelize.authenticate();
  console.log('✅ Đã kết nối cơ sở dữ liệu.');

  const todayStr = new Date().toISOString().split('T')[0];

  const t = await sequelize.transaction();
  try {
    // ════════════════════════════════════════════════════════════
    // 1. CẬP NHẬT / TẠO PHÒNG NAM TRONG quanli_phong
    // ════════════════════════════════════════════════════════════
    const maleRoomsConfig = [
      { ma_phong: 'D11', suc_chua: 25, sl_diem_danh: 2, sl_ho_tro: 1 },
      { ma_phong: 'D12', suc_chua: 25, sl_diem_danh: 2, sl_ho_tro: 1 },
      { ma_phong: 'D13', suc_chua: 25, sl_diem_danh: 2, sl_ho_tro: 1 },
      { ma_phong: 'D31', suc_chua: 35, sl_diem_danh: 1, sl_ho_tro: 1 },
      { ma_phong: 'D32', suc_chua: 35, sl_diem_danh: 1, sl_ho_tro: 1 },
      { ma_phong: 'D33', suc_chua: 35, sl_diem_danh: 1, sl_ho_tro: 1 },
      { ma_phong: 'D41', suc_chua: 35, sl_diem_danh: 1, sl_ho_tro: 1 },
      { ma_phong: 'D42', suc_chua: 33, sl_diem_danh: 1, sl_ho_tro: 1 },
      { ma_phong: 'D43', suc_chua: 35, sl_diem_danh: 1, sl_ho_tro: 1 },
      { ma_phong: 'BONG_BAN', suc_chua: 60, sl_diem_danh: 2, sl_ho_tro: 1 },
      { ma_phong: 'A21', suc_chua: 50, sl_diem_danh: 1, sl_ho_tro: 1 },
    ];

    for (const r of maleRoomsConfig) {
      const [room, created] = await Phong.findOrCreate({
        where: { ma_phong: r.ma_phong },
        defaults: {
          ma_phong: r.ma_phong,
          loai_phong: 1,
          suc_chua: r.suc_chua,
          gioi_tinh: 0,
          sl_diem_danh: r.sl_diem_danh,
          sl_ho_tro: r.sl_ho_tro
        },
        transaction: t
      });
      if (!created) {
        await room.update({
          loai_phong: 1,
          suc_chua: r.suc_chua,
          gioi_tinh: 0,
          sl_diem_danh: r.sl_diem_danh,
          sl_ho_tro: r.sl_ho_tro
        }, { transaction: t });
        console.log(`  🏠 Đã cập nhật phòng: ${r.ma_phong} (Sức chứa: ${r.suc_chua})`);
      } else {
        console.log(`  ✨ Đã tạo mới phòng: ${r.ma_phong} (Sức chứa: ${r.suc_chua})`);
      }
    }

    // ════════════════════════════════════════════════════════════
    // 2. PHÂN PHÒNG HỌC SINH NAM THEO LỚP
    // ════════════════════════════════════════════════════════════
    const classMapping = {
      'D11': ['12A8'],
      'D12': ['12A9', '12A10'],
      'D13': ['11A4', '11A6'],
      'D31': ['10A2', '10A4', '12A3'],
      'D32': ['10A5', '10A7', '12A6'],
      'D33': ['12A1', '12A2', '12A4'],
      'D41': ['10A1', '10A3', '11A9'],
      'D42': ['10A6', '10A8'],
      'D43': ['10A9', '10A10'],
      'BONG_BAN': ['11A5', '11A7', '11A8', '12A5'],
      'A21': ['11A1', '11A2', '11A3', '12A7']
    };

    let totalUpdatedHs = 0;
    for (const [targetRoom, classes] of Object.entries(classMapping)) {
      const students = await HocSinh.findAll({
        where: {
          gioi_tinh: 0,
          dang_hoc: true,
          lop: { [Op.in]: classes }
        },
        transaction: t
      });

      console.log(`  👦 Phòng ${targetRoom}: Phân ${students.length} HS nam (Lớp: ${classes.join(', ')})`);

      for (const hs of students) {
        if (hs.ma_phong_ngu_id !== targetRoom) {
          const oldRoom = hs.ma_phong_ngu_id;
          // Đóng mốc lịch sử cũ
          await LichSuPhanPhong.update(
            { den_ngay: todayStr },
            {
              where: {
                ma_hs_id: hs.id,
                loai_phong: 1,
                den_ngay: null
              },
              transaction: t
            }
          );
          // Mở mốc lịch sử mới
          await LichSuPhanPhong.create({
            ma_hs_id: hs.id,
            loai_phong: 1,
            ma_phong_id: targetRoom,
            tu_ngay: todayStr,
            den_ngay: null,
            ghi_chu: `Phân lại phòng ngủ theo danh sách chuẩn từ ${oldRoom || 'Chưa xếp'} sang ${targetRoom}`
          }, { transaction: t });

          // Cập nhật học sinh
          await hs.update({ ma_phong_ngu_id: targetRoom }, { transaction: t });
          totalUpdatedHs++;
        }
      }
    }
    console.log(`✅ Đã cập nhật phòng ngủ cho ${totalUpdatedHs} học sinh nam.`);

    // ════════════════════════════════════════════════════════════
    // 3. CẬP NHẬT PHÂN CÔNG GIÁO VIÊN NAM TRỰC NGỦ CỐ ĐỊNH
    // ════════════════════════════════════════════════════════════
    const gvs = await GiaoVien.findAll({ raw: true, transaction: t });
    const gvMap = new Map();
    gvs.forEach(g => gvMap.set(g.ho_ten.trim().toLowerCase(), g));

    function getGvId(name) {
      const g = gvMap.get(name.trim().toLowerCase());
      if (!g) throw new Error(`Không tìm thấy giáo viên: ${name}`);
      return g.id;
    }

    // Xóa lịch trực ngủ cố định của các phòng nam này trước khi gán mới
    const maleRoomCodes = maleRoomsConfig.map(r => r.ma_phong);
    const deletedCount = await LichTrucCoDinh.destroy({
      where: { ma_phong_id: { [Op.in]: maleRoomCodes } },
      transaction: t
    });
    console.log(`  🗑️ Đã làm mới ${deletedCount} bản ghi lịch trực cũ của phòng nam.`);

    // Các ngày trực: Thứ 2 (0), Thứ 3 (1), Thứ 4 (2), Thứ 5 (3)
    const dutyDays = [0, 1, 2, 3];
    const newSchedule = [];

    // Nhóm 1: D11, D12, D13 -> Phan Thanh Nhật & Nguyễn Ngọc Cầm
    const gvNhat = getGvId('Phan Thanh Nhật');
    const gvCam = getGvId('Nguyễn Ngọc Cầm');
    for (const d of dutyDays) {
      // D11: Thầy Nhật chính (ĐD), Thầy Cầm hỗ trợ
      newSchedule.push({ ma_phong_id: 'D11', ma_gv_id: gvNhat, thu: d, nhiem_vu: 0 });
      newSchedule.push({ ma_phong_id: 'D11', ma_gv_id: gvCam, thu: d, nhiem_vu: 1 });

      // D12: Thầy Cầm chính (ĐD), Thầy Nhật hỗ trợ
      newSchedule.push({ ma_phong_id: 'D12', ma_gv_id: gvCam, thu: d, nhiem_vu: 0 });
      newSchedule.push({ ma_phong_id: 'D12', ma_gv_id: gvNhat, thu: d, nhiem_vu: 1 });

      // D13: Thầy Nhật chính (ĐD), Thầy Cầm hỗ trợ
      newSchedule.push({ ma_phong_id: 'D13', ma_gv_id: gvNhat, thu: d, nhiem_vu: 0 });
      newSchedule.push({ ma_phong_id: 'D13', ma_gv_id: gvCam, thu: d, nhiem_vu: 1 });
    }

    // Nhóm 2: D31, D32, D33 -> Bùi Phùng Đức Anh, Lý Công Thành, Bùi Thanh Toàn
    const gvDucAnh = getGvId('Bùi Phùng Đức Anh');
    const gvThanh = getGvId('Lý Công Thành');
    const gvToan = getGvId('Bùi Thanh Toàn');
    for (const d of dutyDays) {
      newSchedule.push({ ma_phong_id: 'D31', ma_gv_id: gvDucAnh, thu: d, nhiem_vu: 0 });
      newSchedule.push({ ma_phong_id: 'D32', ma_gv_id: gvThanh, thu: d, nhiem_vu: 0 });
      newSchedule.push({ ma_phong_id: 'D33', ma_gv_id: gvToan, thu: d, nhiem_vu: 0 });
    }

    // Nhóm 3: D41, D42, D43 -> Huỳnh Duy Khoa, Đỗ Văn Thương, Hồ Quang Thịnh
    const gvKhoa = getGvId('Huỳnh Duy Khoa');
    const gvThuong = getGvId('Đỗ Văn Thương');
    const gvThinh = getGvId('Hồ Quang Thịnh');
    for (const d of dutyDays) {
      newSchedule.push({ ma_phong_id: 'D41', ma_gv_id: gvKhoa, thu: d, nhiem_vu: 0 });
      newSchedule.push({ ma_phong_id: 'D42', ma_gv_id: gvThuong, thu: d, nhiem_vu: 0 });
      newSchedule.push({ ma_phong_id: 'D43', ma_gv_id: gvThinh, thu: d, nhiem_vu: 0 });
    }

    // Nhóm 4: BONG_BAN -> Trần Bá Lâm & Trần Nhật Tân
    const gvLam = getGvId('Trần Bá Lâm');
    const gvTan = getGvId('Trần Nhật Tân');
    for (const d of dutyDays) {
      newSchedule.push({ ma_phong_id: 'BONG_BAN', ma_gv_id: gvLam, thu: d, nhiem_vu: 0 });
      newSchedule.push({ ma_phong_id: 'BONG_BAN', ma_gv_id: gvTan, thu: d, nhiem_vu: 1 });
    }

    // Nhóm 5: A21 -> Lê Hoàng Hà
    const gvHa = getGvId('Lê Hoàng Hà');
    for (const d of dutyDays) {
      newSchedule.push({ ma_phong_id: 'A21', ma_gv_id: gvHa, thu: d, nhiem_vu: 0 });
    }

    await LichTrucCoDinh.bulkCreate(newSchedule, { transaction: t });
    console.log(`✅ Đã phân công thành công ${newSchedule.length} ca trực cố định cho các GV nam.`);

    await t.commit();
    console.log('🎉 TOÀN BỘ GIAO DỊCH ĐÃ ĐƯỢC LƯU THÀNH CÔNG VÀO CSDL!');
  } catch (err) {
    await t.rollback();
    console.error('❌ LỖI GIAO DỊCH, ĐÃ ROLLBACK:', err);
    process.exit(1);
  }
}

run().then(() => {
  console.log('🏁 Hoàn tất.');
  process.exit(0);
}).catch(e => {
  console.error(e);
  process.exit(1);
});
