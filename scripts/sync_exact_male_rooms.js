require('dotenv').config();
const { sequelize, HocSinh, Phong, LichSuPhanPhong } = require('../src/models');
const { appCache } = require('../src/utils/cache');
const { Op } = require('sequelize');

const exactMapping = {
  'D11': { classes: ['12A8'], expected: 24, suc_chua: 25 },
  'D12': { classes: ['12A9', '12A10'], expected: 22, suc_chua: 25 },
  'D13': { classes: ['11A4', '11A6'], expected: 24, suc_chua: 25 },
  'D31': { classes: ['10A2', '10A4', '12A3'], expected: 35, suc_chua: 35 },
  'D32': { classes: ['10A5', '10A7', '12A6'], expected: 35, suc_chua: 35 },
  'D33': { classes: ['12A1', '12A2', '12A4'], expected: 35, suc_chua: 35 },
  'D41': { classes: ['10A1', '10A3', '11A9'], expected: 33, suc_chua: 35 },
  'D42': { classes: ['10A6', '10A8'], expected: 30, suc_chua: 33 },
  'D43': { classes: ['10A9', '10A10'], expected: 33, suc_chua: 35 },
  'BONG_BAN': { classes: ['11A5', '11A7', '11A8', '12A5'], expected: 58, suc_chua: 60 },
  'A21': { classes: ['11A1', '11A2', '11A3', '12A7'], expected: 45, suc_chua: 50 },
};

async function run() {
  console.log('🔄 BẮT ĐẦU ĐỒNG BỘ PHÒNG NGỦ HỌC SINH NAM THEO BẢNG CHUẨN...');
  await sequelize.authenticate();

  const t = await sequelize.transaction();
  try {
    const todayStr = '2026-09-26';

    for (const [roomCode, cfg] of Object.entries(exactMapping)) {
      // 1. Cập nhật sức chứa phòng
      await Phong.update(
        { suc_chua: cfg.suc_chua, dang_dung: true, loai_phong: 1, gioi_tinh: 0 },
        { where: { ma_phong: roomCode }, transaction: t }
      );

      // 2. Tìm tất cả học sinh nam đang học thuộc các lớp này
      const students = await HocSinh.findAll({
        where: {
          gioi_tinh: 0,
          dang_hoc: true,
          lop: { [Op.in]: cfg.classes }
        },
        transaction: t
      });

      console.log(`🏠 Phòng ${roomCode.padEnd(10)}: Cần ${cfg.expected} HS | Tìm thấy: ${students.length} HS (Lớp: ${cfg.classes.join(', ')})`);

      for (const hs of students) {
        if (hs.ma_phong_ngu_id !== roomCode) {
          // Đóng lịch sử cũ
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

          // Tạo lịch sử mới
          await LichSuPhanPhong.create({
            ma_hs_id: hs.id,
            loai_phong: 1,
            ma_phong_id: roomCode,
            tu_ngay: todayStr,
            den_ngay: null,
            ghi_chu: `Phân vào phòng ${roomCode} theo sơ đồ chuẩn`
          }, { transaction: t });

          // Cập nhật ma_phong_ngu_id
          await hs.update({ ma_phong_ngu_id: roomCode }, { transaction: t });
        }
      }
    }

    await t.commit();
    console.log('✅ Giao dịch cập nhật phòng ngủ nam hoàn tất!');

    // Invalidate caches
    if (appCache && typeof appCache.flushAll === 'function') {
      appCache.flushAll();
    }

    // 3. Đối soát lại toàn bộ phòng nam
    console.log('\n📊 ĐỐI SOÁT TOÀN BỘ PHÂN PHÒNG NAM TRONG CSDL:');
    for (const [roomCode, cfg] of Object.entries(exactMapping)) {
      const count = await HocSinh.count({
        where: {
          gioi_tinh: 0,
          dang_hoc: true,
          ma_phong_ngu_id: roomCode
        }
      });
      const ok = count === cfg.expected ? '✅ ĐÚNG' : '❌ SAI';
      console.log(`${roomCode.padEnd(10)}: ${String(count).padStart(2)}/${cfg.expected} HS -> ${ok}`);
    }

    const unassigned = await HocSinh.count({
      where: {
        gioi_tinh: 0,
        dang_hoc: true,
        [Op.or]: [
          { ma_phong_ngu_id: null },
          { ma_phong_ngu_id: '' }
        ]
      }
    });
    console.log(`\nSố HS nam đang học chưa có phòng ngủ: ${unassigned}`);
  } catch (err) {
    await t.rollback();
    console.error('❌ Lỗi giao dịch:', err);
    process.exit(1);
  }
}

run().then(() => process.exit(0)).catch(e => {
  console.error(e);
  process.exit(1);
});
