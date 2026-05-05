const express = require('express');
const router = express.Router();
const { Op } = require('sequelize');
const { HocSinh, DiemDanhHS, CauHinhHeThong } = require('../models');
const { loginRequired, attachUser } = require('../middleware/auth');

// Áp dụng middleware cho toàn bộ route này
router.use(attachUser);

/**
 * GET /api/dashboard/
 * Trả thống kê cho Dashboard
 */
router.get('/api/dashboard/', loginRequired, async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];

    // Tổng số học sinh đang học
    const allHS = await HocSinh.findAll({
      where: { dang_hoc: true },
      attributes: ['id', 'gioi_tinh', 'lop', 'ma_phong_an_id', 'ma_phong_ngu_id'],
    });

    const total = allHS.length;
    const male = allHS.filter(h => h.gioi_tinh === 0).length;
    const female = allHS.filter(h => h.gioi_tinh === 1).length;
    const hsIds = allHS.map(h => h.id);

    // Lấy điểm danh hôm nay
    const diemDanhToday = await DiemDanhHS.findAll({
      where: { ma_hs_id: { [Op.in]: hsIds }, ngay: today },
      attributes: ['ma_hs_id', 'diem_danh_an', 'diem_danh_ngu'],
    });

    const ddMap = {};
    diemDanhToday.forEach(dd => { ddMap[dd.ma_hs_id] = dd; });

    // Tính toán tổng
    let eating = 0, sleeping = 0, absent_eat = 0, absent_sleep = 0;
    allHS.forEach(hs => {
      const dd = ddMap[hs.id];
      if (!dd || dd.diem_danh_an === 0) eating++;
      else absent_eat++;
      if (!dd || dd.diem_danh_ngu === 0) sleeping++;
      else absent_sleep++;
    });
    const absent = Math.max(absent_eat, absent_sleep);

    // Tính theo khối
    const khoiStats = {};
    ['10', '11', '12'].forEach(khoi => {
      const hsKhoi = allHS.filter(h => h.lop.startsWith(khoi));
      const totalK = hsKhoi.length;
      const maleK = hsKhoi.filter(h => h.gioi_tinh === 0).length;
      const femaleK = hsKhoi.filter(h => h.gioi_tinh === 1).length;
      let eatK = 0, sleepK = 0, phepK = 0, vangK = 0;
      hsKhoi.forEach(hs => {
        const dd = ddMap[hs.id];
        if (!dd || dd.diem_danh_an === 0) eatK++;
        if (!dd || dd.diem_danh_ngu === 0) sleepK++;
        if (dd) {
          if (dd.diem_danh_an === 2 || dd.diem_danh_ngu === 2) phepK++;
          if (dd.diem_danh_an === 1 || dd.diem_danh_ngu === 1) vangK++;
        }
      });
      khoiStats[khoi] = {
        total: totalK,
        male: maleK,
        female: femaleK,
        eating: eatK,
        sleeping: sleepK,
        phep: phepK,
        vang: vangK,
        eat_pct: totalK > 0 ? Math.round((eatK / totalK) * 100) : 0,
        sleep_pct: totalK > 0 ? Math.round((sleepK / totalK) * 100) : 0,
      };
    });

    // Cấu hình hệ thống
    const [cauhinh] = await CauHinhHeThong.findOrCreate({
      where: { id: 1 },
      defaults: {
        nam_hoc: '2025-2026',
        nguoi_phu_trach: 'Tạ Thị Diệu Lê',
        ten_truong: 'LÊ THỊ HỒNG GẤM',
      },
    });

    return res.json({
      ok: true,
      stat: {
        total, male, female,
        eating, sleeping, absent,
        absent_eat, absent_sleep,
        khoi: khoiStats,
      },
      nam_hoc: cauhinh.nam_hoc,
      nguoi_phu_trach: cauhinh.nguoi_phu_trach,
      ten_truong: cauhinh.ten_truong,
      ngay_hom_nay: today,
    });
  } catch (err) {
    console.error('Dashboard error:', err);
    return res.status(500).json({ ok: false, error: 'Lỗi tải dashboard' });
  }
});

module.exports = router;
