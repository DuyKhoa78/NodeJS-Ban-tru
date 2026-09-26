require('dotenv').config();
const { sequelize, Phong, GiaoVien, LichTrucCoDinh, PhanCongTrucGV } = require('../src/models');
const { Op } = require('sequelize');

async function run() {
  console.log('🔄 BẮT ĐẦU CẬP NHẬT LỊCH TRỰC NAM THEO NGUYÊN TẮC MỚI...');
  await sequelize.authenticate();

  const maleRoomCodes = ['D11', 'D12', 'D13', 'D31', 'D32', 'D33', 'D41', 'D42', 'D43', 'BONG_BAN', 'A21'];

  const t = await sequelize.transaction();
  try {
    // 1. Cập nhật sl_diem_danh cho các phòng
    // 3 phòng cụm D11-D13 có 2 GV -> sl_diem_danh = 2
    await Phong.update({ sl_diem_danh: 2, sl_ho_tro: 0 }, { where: { ma_phong: ['D11', 'D12', 'D13'] }, transaction: t });
    // D31, D32, D33: 3 GV cho 3 phòng -> chia mỗi người 1 phòng -> sl_diem_danh = 1
    await Phong.update({ sl_diem_danh: 1, sl_ho_tro: 0 }, { where: { ma_phong: ['D31', 'D32', 'D33'] }, transaction: t });
    // D41, D42, D43: 3 GV cho 3 phòng -> chia mỗi người 1 phòng -> sl_diem_danh = 1
    await Phong.update({ sl_diem_danh: 1, sl_ho_tro: 0 }, { where: { ma_phong: ['D41', 'D42', 'D43'] }, transaction: t });
    // BONG_BAN: 2 GV có tên trên phòng -> sl_diem_danh = 2
    await Phong.update({ sl_diem_danh: 2, sl_ho_tro: 0 }, { where: { ma_phong: 'BONG_BAN' }, transaction: t });
    // A21: 1 GV -> sl_diem_danh = 1
    await Phong.update({ sl_diem_danh: 1, sl_ho_tro: 0 }, { where: { ma_phong: 'A21' }, transaction: t });

    console.log('✅ Đã cập nhật số lượng GV điểm danh cho các phòng.');

    // 2. Lấy ID giáo viên
    const gvs = await GiaoVien.findAll({ raw: true, transaction: t });
    const gvMap = new Map();
    gvs.forEach(g => gvMap.set(g.ho_ten.trim().toLowerCase(), g));

    function getGvId(name) {
      const g = gvMap.get(name.trim().toLowerCase());
      if (!g) throw new Error(`Không tìm thấy GV: ${name}`);
      return g.id;
    }

    const gvNhat = getGvId('Phan Thanh Nhật');
    const gvCam = getGvId('Nguyễn Ngọc Cầm');
    const gvDucAnh = getGvId('Bùi Phùng Đức Anh');
    const gvThanh = getGvId('Lý Công Thành');
    const gvToan = getGvId('Bùi Thanh Toàn');
    const gvKhoa = getGvId('Huỳnh Duy Khoa');
    const gvThuong = getGvId('Đỗ Văn Thương');
    const gvThinh = getGvId('Hồ Quang Thịnh');
    const gvLam = getGvId('Trần Bá Lâm');
    const gvTan = getGvId('Trần Nhật Tân');
    const gvHa = getGvId('Lê Hoàng Hà');

    // 3. Xóa lịch trực cố định cũ của các phòng nam này
    await LichTrucCoDinh.destroy({
      where: { ma_phong_id: { [Op.in]: maleRoomCodes } },
      transaction: t
    });

    const dutyDays = [0, 1, 2, 3]; // T2, T3, T4, T5
    const newKhung = [];

    for (const d of dutyDays) {
      // 2 GV cho 3 phòng: Cả 2 GV đều có tên trên cả 3 phòng D11, D12, D13
      newKhung.push({ ma_phong_id: 'D11', ma_gv_id: gvNhat, thu: d, nhiem_vu: 0 });
      newKhung.push({ ma_phong_id: 'D11', ma_gv_id: gvCam, thu: d, nhiem_vu: 0 });
      newKhung.push({ ma_phong_id: 'D12', ma_gv_id: gvNhat, thu: d, nhiem_vu: 0 });
      newKhung.push({ ma_phong_id: 'D12', ma_gv_id: gvCam, thu: d, nhiem_vu: 0 });
      newKhung.push({ ma_phong_id: 'D13', ma_gv_id: gvNhat, thu: d, nhiem_vu: 0 });
      newKhung.push({ ma_phong_id: 'D13', ma_gv_id: gvCam, thu: d, nhiem_vu: 0 });

      // 3 GV cho 3 phòng: chia ra mỗi người 1 phòng
      newKhung.push({ ma_phong_id: 'D31', ma_gv_id: gvDucAnh, thu: d, nhiem_vu: 0 });
      newKhung.push({ ma_phong_id: 'D32', ma_gv_id: gvThanh, thu: d, nhiem_vu: 0 });
      newKhung.push({ ma_phong_id: 'D33', ma_gv_id: gvToan, thu: d, nhiem_vu: 0 });

      // 3 GV cho 3 phòng: chia ra mỗi người 1 phòng
      newKhung.push({ ma_phong_id: 'D41', ma_gv_id: gvKhoa, thu: d, nhiem_vu: 0 });
      newKhung.push({ ma_phong_id: 'D42', ma_gv_id: gvThuong, thu: d, nhiem_vu: 0 });
      newKhung.push({ ma_phong_id: 'D43', ma_gv_id: gvThinh, thu: d, nhiem_vu: 0 });

      // 2 GV cho 1 phòng bóng bàn lớn: cả 2 người đều có tên trên phòng
      newKhung.push({ ma_phong_id: 'BONG_BAN', ma_gv_id: gvLam, thu: d, nhiem_vu: 0 });
      newKhung.push({ ma_phong_id: 'BONG_BAN', ma_gv_id: gvTan, thu: d, nhiem_vu: 0 });

      // 1 GV 1 phòng
      newKhung.push({ ma_phong_id: 'A21', ma_gv_id: gvHa, thu: d, nhiem_vu: 0 });
    }

    await LichTrucCoDinh.bulkCreate(newKhung, { transaction: t });
    console.log(`✅ Đã lưu ${newKhung.length} bản ghi lịch trực cố định mới.`);

    // 4. Đồng bộ vào PhanCongTrucGV cho tuần tới: 2026-09-28 (T2) đến 2026-10-01 (T5)
    await PhanCongTrucGV.destroy({
      where: {
        ngay: { [Op.between]: ['2026-09-28', '2026-10-01'] },
        loai_truc: 1,
        ma_phong_id: { [Op.in]: maleRoomCodes }
      },
      transaction: t
    });

    const dates = ['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01'];
    const newPhanCong = [];
    dates.forEach((ngay, idx) => {
      const dayKhung = newKhung.filter(k => k.thu === idx);
      dayKhung.forEach(k => {
        newPhanCong.push({
          ma_gv_id: k.ma_gv_id,
          ma_phong_id: k.ma_phong_id,
          ngay,
          loai_truc: 1,
          nhiem_vu: 0,
          xac_nhan_truc: true
        });
      });
    });

    await PhanCongTrucGV.bulkCreate(newPhanCong, { transaction: t });
    console.log(`✅ Đã đồng bộ ${newPhanCong.length} bản ghi phân công ca trực tuần 28/09 - 01/10.`);

    await t.commit();
    console.log('🎉 GIAO DỊCH THÀNH CÔNG!');
  } catch (err) {
    await t.rollback();
    console.error('❌ LỖI:', err);
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
