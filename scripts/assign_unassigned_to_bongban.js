require('dotenv').config();
const { sequelize, HocSinh, Phong, LichSuPhanPhong } = require('../src/models');
const { appCache } = require('../src/utils/cache');
const { Op } = require('sequelize');

async function run() {
  console.log('🔄 BẮT ĐẦU ĐƯA HỌC SINH CHƯA CÓ PHÒNG NGỦ VÀO PHÒNG BÓNG BÀN...');
  await sequelize.authenticate();

  const t = await sequelize.transaction();
  try {
    // 1. Cập nhật sức chứa phòng BONG_BAN
    const bongBan = await Phong.findByPk('BONG_BAN', { transaction: t });
    if (bongBan) {
      await bongBan.update({ suc_chua: 110, sl_diem_danh: 2, sl_ho_tro: 1 }, { transaction: t });
      console.log('✅ Đã cập nhật sức chứa phòng BONG_BAN: 110 chỗ.');
    }

    // 2. Tìm tất cả HS đang học chưa có phòng ngủ
    const students = await HocSinh.findAll({
      where: {
        dang_hoc: true,
        [Op.or]: [
          { ma_phong_ngu_id: null },
          { ma_phong_ngu_id: '' }
        ]
      },
      transaction: t
    });

    console.log(`📋 Tìm thấy ${students.length} học sinh đang học chưa có phòng ngủ.`);

    const todayStr = '2026-09-26';
    let count = 0;

    for (const hs of students) {
      // Đóng lịch sử phân phòng ngủ cũ nếu có
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

      // Tạo lịch sử phân phòng ngủ mới
      await LichSuPhanPhong.create({
        ma_hs_id: hs.id,
        loai_phong: 1,
        ma_phong_id: 'BONG_BAN',
        tu_ngay: todayStr,
        den_ngay: null,
        ghi_chu: 'Phân vào phòng bóng bàn'
      }, { transaction: t });

      // Cập nhật ma_phong_ngu_id cho học sinh
      await hs.update({ ma_phong_ngu_id: 'BONG_BAN' }, { transaction: t });
      count++;
    }

    await t.commit();
    console.log(`✅ Đã đưa thành công ${count} học sinh vào phòng BONG_BAN!`);

    // Xóa cache
    appCache.flushAll();
    console.log('✅ Đã xóa toàn bộ in-memory cache.');

    // Kiểm tra lại
    const remain = await HocSinh.count({
      where: {
        dang_hoc: true,
        [Op.or]: [
          { ma_phong_ngu_id: null },
          { ma_phong_ngu_id: '' }
        ]
      }
    });
    const inBongBan = await HocSinh.count({
      where: {
        dang_hoc: true,
        ma_phong_ngu_id: 'BONG_BAN'
      }
    });
    console.log(`🔍 KIỂM TRA:`);
    console.log(`- Số HS đang học chưa có phòng ngủ còn lại: ${remain}`);
    console.log(`- Tổng số HS đang trong phòng BONG_BAN: ${inBongBan}`);
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
