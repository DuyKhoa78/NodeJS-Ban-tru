const express = require('express');
const router = express.Router();
const { Op } = require('sequelize');
const NodeCache = require('node-cache');
const { HocSinh, DiemDanhHS, CauHinhHeThong, PhanCongTrucGV, CauHinhTuan, CauHinhNgay } = require('../models');
const { loginRequired, attachUser } = require('../middleware/auth');

// ── Cache nhẹ cho dữ liệu ít thay đổi (dashboard: 3 phút, cauhinh: 1 giờ) ──
const dashboardCache = new NodeCache({ stdTTL: 180, checkperiod: 60 });
const coreCache = new NodeCache({ stdTTL: 3600, checkperiod: 300 });

// Áp dụng middleware cho toàn bộ route này
router.use(attachUser);

/** GET /api/health - kiểm tra backend còn sống, dùng cho UptimeRobot */
router.get('/api/health', (req, res) => {
  res.set('Cache-Control', 'no-store');
  return res.json({ ok: true, ts: Date.now() });
});

/**
 * GET /api/dashboard/
 * Trả thống kê cho Dashboard
 */
router.get('/api/dashboard/', loginRequired, async (req, res) => {
  try {
    // Lấy ngày hôm nay theo giờ Việt Nam (tránh lệch múi giờ UTC)
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());

    // Cache allHS 30 phút vì HS ít thay đổi trong ngày
    const HS_CACHE_KEY = 'dashboard_allHS';
    let allHS = coreCache.get(HS_CACHE_KEY);
    if (!allHS) {
      const rows = await HocSinh.findAll({
        where: { dang_hoc: true },
        attributes: ['id', 'ho_ten', 'gioi_tinh', 'lop', 'ma_phong_an_id', 'ma_phong_ngu_id'],
      });
      allHS = rows.map(r => r.toJSON());
      coreCache.set(HS_CACHE_KEY, allHS);
    }

    // Cache cấu hình 1 giờ
    let cauhinh = coreCache.get('cauhinh');
    if (!cauhinh) {
      const [ch] = await CauHinhHeThong.findOrCreate({
        where: { id: 1 },
        defaults: { nam_hoc: '2025-2026', nguoi_phu_trach: 'Tạ Thị Diệu Lê', ten_truong: 'LÊ THỊ HỒNG GẤM' },
      });
      cauhinh = ch.toJSON();
      coreCache.set('cauhinh', cauhinh);
    }

    const total = allHS.length;
    const male = allHS.filter(h => h.gioi_tinh === 0).length;
    const female = allHS.filter(h => h.gioi_tinh === 1).length;
    const hsIds = allHS.map(h => h.id);

    // Điểm danh hôm nay – luôn fetch mới (real-time)
    const diemDanhToday = await DiemDanhHS.findAll({
      where: { ma_hs_id: { [Op.in]: hsIds }, ngay: today },
      attributes: ['ma_hs_id', 'diem_danh_an', 'diem_danh_ngu'],
    });

    // Kiểm tra xem hôm nay có lịch bán trú không
    let hasSchedule = false;
    const dateObj = new Date(today + 'T00:00:00');
    const dow = dateObj.getDay();
    if (dow !== 0 && dow !== 6) {
      if (dow === 4) {
        const mon = new Date(dateObj);
        mon.setDate(dateObj.getDate() - 3);
        const monStr = mon.toISOString().split('T')[0];
        const cauHinhTuan = await CauHinhTuan.findByPk(monStr);
        const showT5 = cauHinhTuan?.show_t5 ?? false;
        const pcCountT5 = await PhanCongTrucGV.count({ where: { ngay: today } });
        hasSchedule = showT5 || pcCountT5 > 0;
      } else {
        const pcCount = await PhanCongTrucGV.count({ where: { ngay: today } });
        hasSchedule = pcCount > 0;
      }
    }
    const cauhinhNgay = await CauHinhNgay.findByPk(today);
    if (cauhinhNgay && cauhinhNgay.is_nghi) {
      hasSchedule = false;
    }

    const ddMap = {};
    diemDanhToday.forEach(dd => { ddMap[dd.ma_hs_id] = dd; });

    let eating = 0, sleeping = 0, absent_eat = 0, absent_sleep = 0;
    let chua_dd_an = 0, chua_dd_ngu = 0;
    const list_vang_an = [];
    const list_vang_ngu = [];

    allHS.forEach(hs => {
      const dd = ddMap[hs.id];
      const has_an = dd && dd.diem_danh_an !== null;
      const has_ngu = dd && dd.diem_danh_ngu !== null;

      if (has_an) {
        if (dd.diem_danh_an === 1 || dd.diem_danh_an === 2) {
          absent_eat++;
          list_vang_an.push({ id: hs.id, ho_ten: hs.ho_ten, lop: hs.lop, type: dd.diem_danh_an });
        } else { eating++; }
      } else { chua_dd_an++; }

      if (has_ngu) {
        if (dd.diem_danh_ngu === 1 || dd.diem_danh_ngu === 2) {
          absent_sleep++;
          list_vang_ngu.push({ id: hs.id, ho_ten: hs.ho_ten, lop: hs.lop, type: dd.diem_danh_ngu });
        } else { sleeping++; }
      } else { chua_dd_ngu++; }
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
        if (!(dd && (dd.diem_danh_an === 1 || dd.diem_danh_an === 2))) eatK++;
        if (!(dd && (dd.diem_danh_ngu === 1 || dd.diem_danh_ngu === 2))) sleepK++;
        if (dd) {
          if (dd.diem_danh_an === 2 || dd.diem_danh_ngu === 2) phepK++;
          if (dd.diem_danh_an === 1 || dd.diem_danh_ngu === 1) vangK++;
        }
      });
      khoiStats[khoi] = {
        total: totalK, male: maleK, female: femaleK,
        eating: eatK, sleeping: sleepK, phep: phepK, vang: vangK,
        eat_pct: totalK > 0 ? Math.round((eatK / totalK) * 100) : 0,
        sleep_pct: totalK > 0 ? Math.round((sleepK / totalK) * 100) : 0,
      };
    });

    return res.json({
      ok: true,
      stat: {
        total, male, female,
        eating, sleeping, absent,
        absent_eat, absent_sleep,
        chua_dd_an, chua_dd_ngu,
        list_vang_an, list_vang_ngu,
        khoi: khoiStats,
      },
      nam_hoc: cauhinh.nam_hoc,
      nguoi_phu_trach: cauhinh.nguoi_phu_trach,
      ten_truong: cauhinh.ten_truong,
      ngay_hom_nay: today,
      has_schedule: hasSchedule,
    });
  } catch (err) {
    console.error('Dashboard error:', err);
    return res.status(500).json({ ok: false, error: 'Lỗi tải dashboard' });
  }
});

module.exports = router;
