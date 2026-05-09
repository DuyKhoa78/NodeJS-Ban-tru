const express = require('express');
const router = express.Router();
const { Op } = require('sequelize');
const ExcelJS = require('exceljs');
const NodeCache = require('node-cache');
const {
  HocSinh, GiaoVien, Phong, DiemDanhHS, DiemDanhPhong,
  PhanCongTrucGV, LichTrucCoDinh, CauHinhGia, CauHinhHeThong, StaffUser, sequelize, CauHinhTuan, CauHinhNgay
} = require('../models');
const { loginRequired, attachUser, roleRequired } = require('../middleware/auth');
const {
  phanCongLichKhung,
  buildPhanCongTuanFromKhung,
  validateAssignments,
} = require('../utils/schedulerUtils');

router.use(attachUser);

// ── In-memory cache ──────────────────────────────────────────────────
// Dữ liệu tĩnh (HS, phòng): TTL 5 phút để đồng bộ kịp thời khi có thay đổi
const appCache = new NodeCache({ stdTTL: 300, checkperiod: 60 });

// Hàm xóa cache liên quan đến dữ liệu HS/phòng (gọi sau khi save/delete)
function invalidateStaticCaches() {
  appCache.del(['phong_an', 'phong_ngu', 'hocsinh_full']);
}

// ── helpers ──────────────────────────────────────────────────────────
function getMondayOfWeek(dateStr) {
  const d = dateStr ? new Date(dateStr) : new Date();
  const day = d.getDay() || 7;
  d.setDate(d.getDate() - day + 1);
  return d.toISOString().split('T')[0];
}
function addDays(dateStr, n) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + n);
  return d.toISOString().split('T')[0];
}
function toDate(str) { return new Date(str).toISOString().split('T')[0]; }

/** ─── WEEK CONFIG ─── */

/** GET /api/lichtruc/config-tuan/?tuan= */
router.get('/api/lichtruc/config-tuan/', loginRequired, async (req, res) => {
  try {
    const { tuan } = req.query;
    if (!tuan) return res.status(400).json({ ok: false, error: 'Thiếu tham số tuần' });
    const monday = getMondayOfWeek(tuan);
    const config = await CauHinhTuan.findByPk(monday);
    return res.json({ ok: true, config: config || { tuan: monday, show_t5: false } });
  } catch (err) { return res.status(500).json({ ok: false, error: err.message }); }
});

/** POST /api/lichtruc/config-tuan/save/ */
router.post('/api/lichtruc/config-tuan/save/', loginRequired, roleRequired('admin', 'quan_ly'), async (req, res) => {
  try {
    const { tuan, show_t5 } = req.body;
    if (!tuan) return res.status(400).json({ ok: false, error: 'Thiếu tham số tuần' });
    const monday = getMondayOfWeek(tuan);
    await CauHinhTuan.upsert({ tuan: monday, show_t5 });
    return res.json({ ok: true, message: 'Đã lưu cấu hình tuần' });
  } catch (err) { return res.status(500).json({ ok: false, error: err.message }); }
});

// ══════════════════════════════════════════════
// CẤU HÌNH NGÀY ĐẶC BIỆT
// ══════════════════════════════════════════════

/** GET /api/cauhinh-ngay/?ngay=YYYY-MM-DD */
router.get('/api/cauhinh-ngay/', loginRequired, roleRequired('admin', 'quan_ly'), async (req, res) => {
  try {
    const { ngay } = req.query;
    if (!ngay) return res.status(400).json({ ok: false, error: 'Thiếu tham số ngày' });
    const config = await CauHinhNgay.findByPk(ngay);
    return res.json({ ok: true, config: config ? config.toJSON() : null });
  } catch (err) { return res.status(500).json({ ok: false, error: err.message }); }
});

/** GET /api/cauhinh-ngay/range/?tu=YYYY-MM-DD&den=YYYY-MM-DD */
router.get('/api/cauhinh-ngay/range/', loginRequired, async (req, res) => {
  try {
    const { tu, den } = req.query;
    if (!tu || !den) return res.status(400).json({ ok: false, error: 'Thiếu tham số tu/den' });
    const list = await CauHinhNgay.findAll({
      where: { ngay: { [Op.between]: [tu, den] } },
      order: [['ngay', 'ASC']],
    });
    // Build map { 'YYYY-MM-DD': { lop_ap_dung, hs_loai_tru, hs_them_vao, ghi_chu } }
    const map = {};
    list.forEach(c => { map[c.ngay] = parseCauHinhNgay(c); });
    return res.json({ ok: true, map });
  } catch (err) { return res.status(500).json({ ok: false, error: err.message }); }
});

/** POST /api/cauhinh-ngay/save/ */
router.post('/api/cauhinh-ngay/save/', loginRequired, roleRequired('admin', 'quan_ly'), async (req, res) => {
  try {
    const { ngay, lop_ap_dung, hs_loai_tru, hs_them_vao, ghi_chu, phong_tam_an, phong_tam_ngu, lop_phong_an, lop_phong_ngu } = req.body;
    if (!ngay) return res.status(400).json({ ok: false, error: 'Thiếu tham số ngày' });
    await CauHinhNgay.upsert({
      ngay,
      lop_ap_dung: lop_ap_dung && lop_ap_dung.length > 0 ? JSON.stringify(lop_ap_dung) : null,
      hs_loai_tru: hs_loai_tru && hs_loai_tru.length > 0 ? JSON.stringify(hs_loai_tru) : null,
      hs_them_vao: hs_them_vao && hs_them_vao.length > 0 ? JSON.stringify(hs_them_vao) : null,
      phong_tam_an: phong_tam_an || null,
      phong_tam_ngu: phong_tam_ngu || null,
      // lop_phong_an/ngu: object { '10A1': 'A20', '10A2': 'A20', '10A3': 'A30' }
      lop_phong_an: lop_phong_an && Object.keys(lop_phong_an).length > 0 ? JSON.stringify(lop_phong_an) : null,
      lop_phong_ngu: lop_phong_ngu && Object.keys(lop_phong_ngu).length > 0 ? JSON.stringify(lop_phong_ngu) : null,
      ghi_chu: ghi_chu || null,
    });
    return res.json({ ok: true, message: 'Đã lưu cấu hình ngày' });
  } catch (err) { return res.status(500).json({ ok: false, error: err.message }); }
});

/** POST /api/cauhinh-ngay/delete/ */
router.post('/api/cauhinh-ngay/delete/', loginRequired, roleRequired('admin', 'quan_ly'), async (req, res) => {
  try {
    const { ngay } = req.body;
    if (!ngay) return res.status(400).json({ ok: false, error: 'Thiếu tham số ngày' });
    await CauHinhNgay.destroy({ where: { ngay } });
    return res.json({ ok: true, message: 'Đã xóa cấu hình ngày đặc biệt' });
  } catch (err) { return res.status(500).json({ ok: false, error: err.message }); }
});

// ══════════════════════════════════════════════
// ĐIỂM DANH
// ══════════════════════════════════════════════

/** GET /api/phong/:loai - loai=an|ngu */
router.get('/api/phong/:loai', loginRequired, roleRequired('admin', 'hoc_vu', 'quan_ly'), async (req, res) => {
  try {
    const loaiStr = req.params.loai; // 'an' | 'ngu'
    const loai = loaiStr === 'an' ? 0 : 1;
    const cacheKey = `phong_${loaiStr}`;

    const cached = appCache.get(cacheKey);
    if (cached) {
      res.set('X-Cache', 'HIT');
      return res.json({ ok: true, phong: cached });
    }

    const list = await Phong.findAll({ where: { loai_phong: loai }, order: [['ma_phong', 'ASC']] });
    const plain = list.map(p => p.toJSON());
    appCache.set(cacheKey, plain);
    res.set('X-Cache', 'MISS');
    return res.json({ ok: true, phong: plain });
  } catch (err) { return res.status(500).json({ ok: false, error: err.message }); }
});

/** GET /api/hocsinh/:loai - loai=an|ngu */
router.get('/api/hocsinh/:loai', loginRequired, roleRequired('admin', 'hoc_vu'), async (req, res) => {
  try {
    const loai = req.params.loai;
    const cacheKey = 'hocsinh_full';

    let data = appCache.get(cacheKey);
    if (!data) {
      const list = await HocSinh.findAll({
        where: { dang_hoc: true },
        attributes: ['id', 'ho_ten', 'lop', 'gioi_tinh', 'ma_phong_an_id', 'ma_phong_ngu_id'],
        include: [
          { association: 'phong_an', attributes: ['ma_phong'] },
          { association: 'phong_ngu', attributes: ['ma_phong', 'gioi_tinh'] },
        ],
        order: [['lop', 'ASC'], ['ho_ten', 'ASC']],
      });
      data = list.map(hs => ({
        id: hs.id,
        ho_ten: hs.ho_ten,
        lop: hs.lop,
        khoi: parseInt(hs.lop.slice(0, 2)),
        gioi_tinh: hs.gioi_tinh,
        phong_an: hs.phong_an?.ma_phong || null,
        phong_ngu: hs.phong_ngu?.ma_phong || null,
      }));
      appCache.set(cacheKey, data);
      res.set('X-Cache', 'MISS');
    } else {
      res.set('X-Cache', 'HIT');
    }

    // Lọc theo loại nếu cần
    const filtered = loai === 'an'
      ? data.filter(hs => hs.phong_an)
      : data.filter(hs => hs.phong_ngu);

    return res.json({ ok: true, hocsinh: filtered });
  } catch (err) { return res.status(500).json({ ok: false, error: err.message }); }
});

// Export invalidate function để dùng ở nơi khác nếu cần
router.invalidateStaticCaches = invalidateStaticCaches;

/** GET /api/diemdanh/range/?tu=YYYY-MM-DD&den=YYYY-MM-DD&loai=an|ngu */
router.get('/api/diemdanh/range/', loginRequired, roleRequired('admin', 'hoc_vu'), async (req, res) => {
  try {
    const { tu, den, loai } = req.query;
    if (!tu || !den) return res.status(400).json({ ok: false, error: 'Thiếu tham số tu/den' });
    const records = await DiemDanhHS.findAll({
      where: { ngay: { [Op.between]: [tu, den] } },
      attributes: ['ma_hs_id', 'ngay', 'diem_danh_an', 'diem_danh_ngu'],
    });
    // Build map: { [ma_hs_id]: { [YYYY-MM-DD]: { an: 0|1|2|null, ngu: 0|1|2|null } } }
    const map = {};
    records.forEach(r => {
      const hsId = r.ma_hs_id;
      const ngay = r.ngay; // YYYY-MM-DD string
      if (!map[hsId]) map[hsId] = {};
      map[hsId][ngay] = { an: r.diem_danh_an, ngu: r.diem_danh_ngu };
    });
    return res.json({ ok: true, map, tu, den });
  } catch (err) { return res.status(500).json({ ok: false, error: err.message }); }
});

/** GET /api/diemdanh/?ngay=&loai= */
router.get('/api/diemdanh/', loginRequired, roleRequired('admin', 'hoc_vu'), async (req, res) => {
  try {
    const { ngay, loai } = req.query;
    const ngayFilter = ngay || new Date().toISOString().split('T')[0];
    const records = await DiemDanhHS.findAll({
      where: { ngay: ngayFilter },
      include: [{ association: 'hoc_sinh', attributes: ['id', 'ho_ten', 'lop', 'ma_phong_an_id', 'ma_phong_ngu_id'] }],
    });

    // Kiểm tra xem ngày này có lịch bán trú không
    let hasSchedule = false;
    const dateObj = new Date(ngayFilter + 'T00:00:00');
    const dow = dateObj.getDay(); // 0=CN, 1=T2, ..., 4=T5, 5=T6

    if (dow === 0 || dow === 6) {
      // Cuối tuần không bao giờ có bán trú
      hasSchedule = false;
    } else if (dow === 4) {
      // Thứ 5: có lịch nếu cờ show_t5 = true HOẶC đã có GV được phân công thực tế
      const mon = new Date(dateObj);
      mon.setDate(dateObj.getDate() - 3); // Thứ 5 - 3 = Thứ 2 (đầu tuần)
      const monStr = mon.toISOString().split('T')[0];
      const cauHinhTuan = await CauHinhTuan.findByPk(monStr);
      const showT5 = cauHinhTuan?.show_t5 ?? false;
      const loaiTrucQuery = loai === 'ngu' ? 1 : 0;
      const pcCountT5 = await PhanCongTrucGV.count({ where: { ngay: ngayFilter, loai_truc: loaiTrucQuery } });
      hasSchedule = showT5 || pcCountT5 > 0;
    } else {
      // T2-T4, T6: kiểm tra bình thường theo PhanCong
      const loaiTrucQuery = loai === 'ngu' ? 1 : 0;
      const pcCount = await PhanCongTrucGV.count({ where: { ngay: ngayFilter, loai_truc: loaiTrucQuery } });
      hasSchedule = pcCount > 0;
    }

    // Trả về kèm cấu hình ngày (có hs_them_vao) cho frontend
    const cauhinhNgay = await CauHinhNgay.findByPk(ngayFilter);
    if (cauhinhNgay && cauhinhNgay.is_nghi) {
      hasSchedule = false;
    }

    return res.json({
      ok: true, records, ngay: ngayFilter, has_schedule: hasSchedule,
      cauhinh_ngay: parseCauHinhNgay(cauhinhNgay),
    });
  } catch (err) { return res.status(500).json({ ok: false, error: err.message }); }
});

// ─── Helper: lấy thông tin cấu hình ngày đặc biệt dưới dạng plain object ───
function parseCauHinhNgay(c) {
  if (!c) return null;
  return {
    lop_ap_dung: c.lop_ap_dung ? JSON.parse(c.lop_ap_dung) : null,
    hs_loai_tru: c.hs_loai_tru ? JSON.parse(c.hs_loai_tru) : null,
    hs_them_vao: c.hs_them_vao ? JSON.parse(c.hs_them_vao) : null,
    phong_tam_an: c.phong_tam_an || null,
    phong_tam_ngu: c.phong_tam_ngu || null,
    // lop_phong_an/ngu: object { '10A1': 'A20', '10A2': 'A30' } or null
    lop_phong_an: c.lop_phong_an ? JSON.parse(c.lop_phong_an) : null,
    lop_phong_ngu: c.lop_phong_ngu ? JSON.parse(c.lop_phong_ngu) : null,
    ghi_chu: c.ghi_chu,
    is_nghi: c.is_nghi || false,
  };
}

// ─── Helper: kiểm tra 1 HS có được phép tham gia bán trú ngày đó không ───
function isHsAllowed(hs, cauhinhNgay) {
  if (!cauhinhNgay) return true; // Không có cấu hình đặc biệt → toàn trường
  if (cauhinhNgay.is_nghi) return false; // Toàn trường nghỉ
  const lopList = cauhinhNgay.lop_ap_dung ? JSON.parse(cauhinhNgay.lop_ap_dung) : null;
  const hsLoaiTru = cauhinhNgay.hs_loai_tru ? JSON.parse(cauhinhNgay.hs_loai_tru) : null;
  const hsThemVao = cauhinhNgay.hs_them_vao ? JSON.parse(cauhinhNgay.hs_them_vao) : null;
  // Nếu được thêm tay (vì dụ: HS ngoài khối) → luôn được phép
  if (hsThemVao && hsThemVao.some(x => x.id === hs.id)) return true;
  if (lopList && lopList.length > 0) {
    if (!lopList.includes(hs.lop)) return false;
  }
  if (hsLoaiTru && hsLoaiTru.length > 0) {
    if (hsLoaiTru.includes(hs.id)) return false;
  }
  return true;
}

/** POST /api/diemdanh/save/ */
router.post('/api/diemdanh/save/', loginRequired, roleRequired('admin', 'hoc_vu'), async (req, res) => {
  try {
    const { loai, records } = req.body;
    if (!records || !Array.isArray(records) || records.length === 0) {
      return res.status(400).json({ ok: false, error: 'Thiếu dữ liệu records' });
    }

    const reqNgay = records[0].ngay;

    // Lấy thời gian hiện tại theo múi giờ Việt Nam
    const now = new Date();
    const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(now);
    
    // // Ràng buộc 1: Chỉ cho phép điểm danh đúng ngày hiện tại
    // if (reqNgay > todayStr) {
    //   return res.status(400).json({ ok: false, error: 'Chưa tới ngày điểm danh.' });
    // }
    // if (reqNgay < todayStr) {
    //   return res.status(400).json({ ok: false, error: 'Đã qua ngày điểm danh. Không thể điểm danh bù.' });
    // }

    // // Ràng buộc 2: Thời gian từ 10:55 đến 14:00
    // const timeStr = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', hour12: false }).format(now);
    // const [vnHour, vnMinute] = timeStr.split(':').map(Number);
    // const totalMins = vnHour * 60 + vnMinute;
    // if (totalMins < 655 || totalMins > 840) { // 10*60+55 = 655, 14*60 = 840
    //   return res.status(400).json({ ok: false, error: 'Hệ thống chỉ cho phép điểm danh trong khung giờ từ 10:55 đến 14:00.' });
    // }

    // // Ràng buộc 3: Ngày hôm đó phải có lịch trực tương ứng được Admin phân công
    // const loaiTrucQuery = loai === 'ngu' ? 1 : 0;
    // const pcCount = await PhanCongTrucGV.count({ where: { ngay: reqNgay, loai_truc: loaiTrucQuery } });
    // if (pcCount === 0) {
    //   return res.status(400).json({ ok: false, error: 'Hôm nay không có lịch bán trú (chưa có phân công trực giáo viên).' });
    // }

    const field = loai === 'an' ? 'diem_danh_an' : 'diem_danh_ngu';
    const t = await sequelize.transaction();
    try {
      const oppositeField = loai === 'an' ? 'diem_danh_ngu' : 'diem_danh_an';
      const data = records.map(r => ({
        ma_hs_id: r.ma_hs,
        ngay: r.ngay,
        [field]: r.status,
        // Khi tạo mới row, field kia chưa có thì set explicitly là null (tránh db default 0)
        // Lưu ý updateOnDuplicate chỉ update [field, 'ghi_chu'] nên dữ liệu field kia ko bị ghi đè thành null nếu row đã tồn tại
        [oppositeField]: null,
        ghi_chu: r.ghi_chu || null
      }));

      await DiemDanhHS.bulkCreate(data, {
        updateOnDuplicate: [field, 'ghi_chu'],
        transaction: t
      });
      await t.commit();
      return res.json({ ok: true, message: `Đã lưu ${records.length} bản ghi điểm danh` });
    } catch (e) { await t.rollback(); throw e; }
  } catch (err) { return res.status(500).json({ ok: false, error: err.message }); }
});

// ══════════════════════════════════════════════
// LỊCH TRỰC
// ══════════════════════════════════════════════

/** GET /api/lichtruc/week/?tuan= */
router.get('/api/lichtruc/week/', loginRequired, roleRequired('admin', 'quan_ly'), async (req, res) => {
  try {
    const tuan = getMondayOfWeek(req.query.tuan);
    const cuoi = addDays(tuan, 6);
    const records = await PhanCongTrucGV.findAll({
      where: { ngay: { [Op.between]: [tuan, cuoi] } },
      include: [
        { association: 'giao_vien', attributes: ['id', 'ho_ten', 'gioi_tinh', 'nhiem_vu'] },
        { association: 'giao_vien_truc_thay', attributes: ['id', 'ho_ten'] },
        { association: 'phong', attributes: ['ma_phong', 'loai_phong', 'gioi_tinh'] },
      ],
      order: [['ngay', 'ASC'], ['loai_truc', 'ASC']],
    });
    return res.json({ ok: true, records, tuan });
  } catch (err) { return res.status(500).json({ ok: false, error: err.message }); }
});

/** GET /api/lichtruc/week-public/?tuan= */
router.get('/api/lichtruc/week-public/', loginRequired, async (req, res) => {
  try {
    const tuan = getMondayOfWeek(req.query.tuan);
    const cuoi = addDays(tuan, 6);
    const [records, gv_list, phong_list, [cauhinh]] = await Promise.all([
      PhanCongTrucGV.findAll({ where: { ngay: { [Op.between]: [tuan, cuoi] } }, order: [['ngay', 'ASC']] }),
      GiaoVien.findAll({ where: { dang_lam: true }, attributes: ['id', 'ho_ten', 'gioi_tinh', 'nhiem_vu', 'lich_ranh'] }),
      Phong.findAll({ attributes: ['ma_phong', 'loai_phong', 'gioi_tinh'] }),
      CauHinhHeThong.findOrCreate({ where: { id: 1 }, defaults: { nam_hoc: '2025-2026', nguoi_phu_trach: 'Tạ Thị Diệu Lê', ten_truong: 'LÊ THỊ HỒNG GẤM' } }),
    ]);
    return res.json({ ok: true, records, tuan, gv_list, phong_list, nam_hoc: cauhinh.nam_hoc, nguoi_phu_trach: cauhinh.nguoi_phu_trach, ten_truong: cauhinh.ten_truong });
  } catch (err) { return res.status(500).json({ ok: false, error: err.message }); }
});

/** GET /api/lichtruc/month/?thang=YYYY-MM */
router.get('/api/lichtruc/month/', loginRequired, async (req, res) => {
  try {
    const [year, month] = (req.query.thang || new Date().toISOString().slice(0, 7)).split('-');
    const start = `${year}-${month}-01`;
    const end = new Date(parseInt(year), parseInt(month), 0).toISOString().split('T')[0];
    const records = await PhanCongTrucGV.findAll({
      where: { ngay: { [Op.between]: [start, end] } },
      include: [{ association: 'giao_vien', attributes: ['id', 'ho_ten'] }, { association: 'phong', attributes: ['ma_phong', 'loai_phong'] }],
      order: [['ngay', 'ASC']],
    });
    return res.json({ ok: true, records, thang: `${year}-${month}` });
  } catch (err) { return res.status(500).json({ ok: false, error: err.message }); }
});

/** POST /api/lichtruc/save/ */
router.post('/api/lichtruc/save/', loginRequired, roleRequired('admin', 'quan_ly'), async (req, res) => {
  try {
    const { id, ma_gv_id, ma_phong_id, ngay, loai_truc, xac_nhan_truc, ma_gv_truc_thay_id } = req.body;
    const phong = await Phong.findByPk(ma_phong_id);
    if (!phong || phong.loai_phong !== parseInt(loai_truc)) {
      return res.status(400).json({ ok: false, error: 'Loại phòng không khớp loại trực' });
    }

    const gv = await GiaoVien.findByPk(ma_gv_id);
    if (!gv) return res.status(400).json({ ok: false, error: 'Giáo viên không tồn tại' });

    // 1. KIỂM TRA GIỚI TÍNH (Cho phòng ngủ)
    const targetGvId = ma_gv_truc_thay_id || ma_gv_id;
    const targetGv = targetGvId === ma_gv_id ? gv : await GiaoVien.findByPk(targetGvId);
    
    if (phong.loai_phong === 1 && phong.gioi_tinh !== null) {
      if (targetGv.gioi_tinh !== phong.gioi_tinh) {
        return res.status(400).json({ ok: false, error: `Phòng ngủ ${phong.gioi_tinh === 0 ? 'Nam' : 'Nữ'} chỉ cho phép giáo viên ${phong.gioi_tinh === 0 ? 'Nam' : 'Nữ'} trực.` });
      }
    }

    // 2. KIỂM TRA TRÙNG LỊCH (Bận ở phòng khác cùng buổi)
    const busy = await PhanCongTrucGV.findOne({
      where: {
        ngay,
        loai_truc: parseInt(loai_truc),
        [Op.or]: [
          { ma_gv_id: targetGvId, ma_gv_truc_thay_id: null }, // Đang trực chính ở phòng khác
          { ma_gv_truc_thay_id: targetGvId } // Đang trực thay ở phòng khác
        ],
        id: { [Op.ne]: id || 0 }
      }
    });
    if (busy) {
      return res.status(400).json({ ok: false, error: `Giáo viên ${targetGv.ho_ten} đã có lịch trực ở phòng ${busy.ma_phong_id} trong cùng buổi này.` });
    }

    // RÀNG BUỘC TRỰC THAY
    if (ma_gv_truc_thay_id) {
      if (parseInt(ma_gv_truc_thay_id) === parseInt(ma_gv_id)) {
        return res.status(400).json({ ok: false, error: 'Giáo viên không thể trực thay cho chính mình' });
      }
    } else {
      // CHỈ KIỂM TRA GIỚI HẠN KHI THÊM MỚI (KHÔNG PHẢI TRỰC THAY)
      const slToiDa = gv.nhiem_vu === 0 ? (phong.sl_diem_danh || 1) : (phong.sl_ho_tro || 1);
      const hienTai = await PhanCongTrucGV.count({
        where: { ma_phong_id, ngay, loai_truc: parseInt(loai_truc), id: { [Op.ne]: id || 0 } },
        include: [{
          model: GiaoVien,
          as: 'giao_vien',
          where: { nhiem_vu: gv.nhiem_vu }
        }]
      });

      if (hienTai >= slToiDa) {
        return res.status(400).json({
          ok: false,
          error: `Phòng ${ma_phong_id} đã đủ số lượng giáo viên ${gv.nhiem_vu === 0 ? 'điểm danh' : 'hỗ trợ'} (Tối đa: ${slToiDa})`
        });
      }
    }
    const data = {
      ma_gv_id, ma_phong_id, ngay,
      loai_truc: parseInt(loai_truc),
      xac_nhan_truc: xac_nhan_truc !== false,
      ma_gv_truc_thay_id: ma_gv_truc_thay_id || null,
      ngay_cap_nhat: new Date(),
      nguoi_cap_nhat_id: req.session?.user?.id || null,
    };
    const fetchFull = async (recordId) => PhanCongTrucGV.findByPk(recordId, {
      include: [
        { association: 'giao_vien', attributes: ['id', 'ho_ten', 'nhiem_vu', 'gioi_tinh'] },
        { association: 'giao_vien_truc_thay', attributes: ['id', 'ho_ten', 'nhiem_vu'] },
      ]
    });
    if (id) {
      await PhanCongTrucGV.update(data, { where: { id } });
      const updated = await fetchFull(id);
      return res.json({ ok: true, message: 'Cập nhật phân công thành công', record: updated });
    }
    const pc = await PhanCongTrucGV.create(data);
    const full = await fetchFull(pc.id);
    return res.json({ ok: true, message: 'Tạo phân công thành công', record: full });
  } catch (err) { return res.status(500).json({ ok: false, error: err.message }); }
});

/** POST /api/lichtruc/delete/ */
router.post('/api/lichtruc/delete/', loginRequired, roleRequired('admin', 'quan_ly'), async (req, res) => {
  try {
    const { id } = req.body;
    await PhanCongTrucGV.destroy({ where: { id } });
    return res.json({ ok: true, message: 'Đã xóa phân công' });
  } catch (err) { return res.status(500).json({ ok: false, error: err.message }); }
});

/** POST /admin/lichtruc/:pk/xoa/ */
router.post('/admin/lichtruc/:pk/xoa/', loginRequired, roleRequired('admin', 'quan_ly'), async (req, res) => {
  try {
    await PhanCongTrucGV.destroy({ where: { id: req.params.pk } });
    return res.json({ ok: true, message: 'Đã xóa' });
  } catch (err) { return res.status(500).json({ ok: false, error: err.message }); }
});

// ══════════════════════════════════════════════
// LỊCH KHUNG CỐ ĐỊNH
// ══════════════════════════════════════════════

/** GET /api/lichtruc_khung/ */
router.get('/api/lichtruc_khung/', loginRequired, roleRequired('admin', 'quan_ly'), async (req, res) => {
  try {
    const list = await LichTrucCoDinh.findAll({
      include: [{ association: 'giao_vien', attributes: ['id', 'ho_ten', 'gioi_tinh'] }, { association: 'phong', attributes: ['ma_phong', 'loai_phong', 'gioi_tinh', 'sl_diem_danh', 'sl_ho_tro'] }],
      order: [['thu', 'ASC']],
    });
    return res.json({ ok: true, lich_khung: list });
  } catch (err) { return res.status(500).json({ ok: false, error: err.message }); }
});

/** POST /api/lichtruc_khung/save/ */
router.post('/api/lichtruc_khung/save/', loginRequired, roleRequired('admin', 'quan_ly'), async (req, res) => {
  try {
    const { ma_phong_id, ma_gv_id, thu, nhiem_vu = 0 } = req.body;
    
    // 1. Kiểm tra tồn tại
    const phong = await Phong.findByPk(ma_phong_id);
    const gv = await GiaoVien.findByPk(ma_gv_id);
    if (!phong || !gv) return res.status(400).json({ ok: false, error: 'Phòng hoặc Giáo viên không tồn tại' });

    // 2. Kiểm tra giới hạn số lượng GV theo nhiem_vu từ request
    const slToiDa = nhiem_vu === 0 ? (phong.sl_diem_danh || 1) : (phong.sl_ho_tro || 1);
    const hienTai = await LichTrucCoDinh.count({
      where: { ma_phong_id, thu, nhiem_vu },
    });

    if (hienTai >= slToiDa) {
      return res.status(400).json({ 
        ok: false, 
        error: `Phòng ${ma_phong_id} đã đủ số lượng GV ${nhiem_vu === 0 ? 'điểm danh' : 'hỗ trợ'} cho ngày này (Tối đa: ${slToiDa})` 
      });
    }

    const [item, created] = await LichTrucCoDinh.findOrCreate({
      where: { ma_gv_id, thu, ma_phong_id },
      defaults: { ma_phong_id, ma_gv_id, thu: parseInt(thu), nhiem_vu: parseInt(nhiem_vu) },
    });
    // Nếu đã tồn tại nhưng đổi nhiem_vu
    if (!created && item.nhiem_vu !== parseInt(nhiem_vu)) {
      await item.update({ nhiem_vu: parseInt(nhiem_vu) });
    }
    return res.json({ ok: true, message: created ? 'Thêm lịch khung thành công' : 'Lịch khung đã tồn tại', id: item.id });
  } catch (err) { return res.status(500).json({ ok: false, error: err.message }); }
});

/** POST /api/lichtruc_khung/delete/ */
router.post('/api/lichtruc_khung/delete/', loginRequired, roleRequired('admin', 'quan_ly'), async (req, res) => {
  try {
    const { id } = req.body;
    if (!id) return res.status(400).json({ ok: false, error: 'Thiếu id' });
    await LichTrucCoDinh.destroy({ where: { id } });
    return res.json({ ok: true, message: 'Đã xóa lịch khung' });
  } catch (err) { return res.status(500).json({ ok: false, error: err.message }); }
});

/** POST /api/lichtruc_khung/auto/ - Tự động xếp lịch khung (Weighted Round-Robin) */
router.post('/api/lichtruc_khung/auto/', loginRequired, roleRequired('admin', 'quan_ly'), async (req, res) => {
  try {
    const t = await sequelize.transaction();
    try {
      // Xóa toàn bộ lịch khung cũ
      await LichTrucCoDinh.destroy({ where: {}, truncate: true, transaction: t });

      // Lấy danh sách phòng và GV
      const phongs = await Phong.findAll({ transaction: t });
      const gvAll  = await GiaoVien.findAll({ where: { dang_lam: true }, transaction: t });

      if (gvAll.length === 0) {
        await t.rollback();
        return res.status(400).json({ ok: false, error: 'Không có giáo viên nào đang làm việc' });
      }

      // ── Chạy thuật toán Weighted Round-Robin ──────────────────────────
      // Phương án A: dùng gv.nhiem_vu mặc định khi xếp tự động
      const lichKhung = phanCongLichKhung({ phongs, gvAll });

      if (lichKhung.length === 0) {
        await t.rollback();
        return res.status(400).json({ ok: false, error: 'Không thể tạo lịch: GV không có ngày rảnh hoặc chưa có phòng' });
      }

      // Gắn nhiem_vu mặc định từ GV vào mỗi bản ghi lịch khung
      const gvMap = {};
      gvAll.forEach(gv => { gvMap[gv.id] = gv; });
      const lichKhungWithNV = lichKhung.map(k => ({
        ...k,
        nhiem_vu: gvMap[k.ma_gv_id]?.nhiem_vu ?? 0,
      }));

      // Validate
      const warnings = [];
      for (let thu = 0; thu < 5; thu++) {
        const ngayLich = lichKhungWithNV.filter(k => k.thu === thu).map(k => ({
          ma_gv_id: k.ma_gv_id,
          ma_phong_id: k.ma_phong_id,
          loai_truc: phongs.find(p => p.ma_phong === k.ma_phong_id)?.loai_phong,
        }));
        const { warnings: w } = validateAssignments(ngayLich, phongs, gvAll);
        warnings.push(...w.map(msg => `[T${thu + 2}] ${msg}`));
      }

      await LichTrucCoDinh.bulkCreate(lichKhungWithNV, { transaction: t, ignoreDuplicates: true });
      await t.commit();

      // Tính thống kê cân bằng tải
      const loadStats = {};
      lichKhung.forEach(k => { loadStats[k.ma_gv_id] = (loadStats[k.ma_gv_id] || 0) + 1; });
      const loads = Object.values(loadStats);
      const minLoad = loads.length ? Math.min(...loads) : 0;
      const maxLoad = loads.length ? Math.max(...loads) : 0;

      return res.json({
        ok: true,
        message: `Đã tạo ${lichKhung.length} lịch khung. Cân bằng tải: ${minLoad}–${maxLoad} buổi/GV/tuần`,
        total: lichKhung.length,
        can_bang: { min: minLoad, max: maxLoad, gv_duoc_xep: Object.keys(loadStats).length },
        warnings: warnings.length > 0 ? warnings : undefined,
      });
    } catch (e) { await t.rollback(); throw e; }
  } catch (err) { return res.status(500).json({ ok: false, error: err.message }); }
});

/** POST /api/lichtruc/apply-khung/ - Nạp lịch khung vào lịch thực tế */
router.post('/api/lichtruc/apply-khung/', loginRequired, roleRequired('admin', 'quan_ly'), async (req, res) => {
  try {
    const { tuan, force = false } = req.body;
    const monday = getMondayOfWeek(tuan);
    const nguoi_cap_nhat_id = req.session?.user?.id || null;
    const now = new Date();
    const t = await sequelize.transaction();
    let inserted = 0, skipped = 0;
    try {
      // Nếu ghi đè, xóa sạch lịch cũ của tuần đó (T2-T6)
      if (force) {
        const friday = addDays(monday, 4);
        await PhanCongTrucGV.destroy({
          where: { ngay: { [Op.between]: [monday, friday] } },
          transaction: t,
        });
        // Xóa cờ is_nghi nếu có
        await CauHinhNgay.destroy({ where: { ngay: { [Op.between]: [monday, friday] }, is_nghi: true }, transaction: t });
      }

      for (let i = 0; i < 5; i++) {
        const ngay = addDays(monday, i);
        const khung = await LichTrucCoDinh.findAll({
          where: { thu: i },
          include: [{ association: 'phong', attributes: ['ma_phong', 'loai_phong'] }],
          transaction: t,
        });
        for (const k of khung) {
          const loai_truc = k.phong.loai_phong;
          
          // Nếu không ghi đè (vì force=true đã xóa sạch ở trên rồi nên không cần check exists ở đây nếu force=true)
          if (!force) {
            const exists = await PhanCongTrucGV.findOne({
              where: { ma_gv_id: k.ma_gv_id, ngay, loai_truc, ma_phong_id: k.ma_phong_id },
              transaction: t,
            });
            if (exists) { skipped++; continue; }
          }

          await PhanCongTrucGV.create({
            ma_gv_id: k.ma_gv_id,
            ma_phong_id: k.ma_phong_id,
            ngay, loai_truc,
            xac_nhan_truc: true,
            ngay_cap_nhat: now,
            nguoi_cap_nhat_id,
          }, { transaction: t });
          inserted++;
        }
      }
      await t.commit();
      return res.json({
        ok: true,
        message: `Nạp xong tuần ${monday}. Thêm/cập nhật: ${inserted}, bỏ qua: ${skipped}`,
        inserted, skipped, tuan: monday,
      });
    } catch (e) { await t.rollback(); throw e; }
  } catch (err) { return res.status(500).json({ ok: false, error: err.message }); }
});

/** POST /api/lichtruc/apply-day-bu/ - Nạp lịch 1 ngày cố định vào 1 ngày thực tế (Dạy bù) */
router.post('/api/lichtruc/apply-day-bu/', loginRequired, roleRequired('admin', 'quan_ly'), async (req, res) => {
  try {
    const { targetDate, sourceThu, force = false } = req.body; // sourceThu: 0=T2, ..., 4=T6
    if (!targetDate || sourceThu === undefined) return res.status(400).json({ ok: false, error: 'Thiếu thông tin ngày' });

    const nguoi_cap_nhat_id = req.session?.user?.id || null;
    const now = new Date();
    const t = await sequelize.transaction();
    let inserted = 0, skipped = 0;

    try {
      // Bỏ cờ is_nghi nếu ngày này đang bị đánh dấu nghỉ
      await CauHinhNgay.destroy({ where: { ngay: targetDate, is_nghi: true }, transaction: t });

      const khung = await LichTrucCoDinh.findAll({
        where: { thu: sourceThu },
        include: [{ association: 'phong', attributes: ['ma_phong', 'loai_phong'] }],
        transaction: t,
      });

      for (const k of khung) {
        const loai_truc = k.phong.loai_phong;
        const exists = await PhanCongTrucGV.findOne({
          where: { ma_gv_id: k.ma_gv_id, ngay: targetDate, loai_truc, ma_phong_id: k.ma_phong_id },
          transaction: t,
        });

        if (exists) {
          if (!force) { skipped++; continue; }
          await exists.update({ ngay_cap_nhat: now, nguoi_cap_nhat_id }, { transaction: t });
          inserted++;
          continue;
        }

        await PhanCongTrucGV.create({
          ma_gv_id: k.ma_gv_id,
          ma_phong_id: k.ma_phong_id,
          ngay: targetDate, 
          loai_truc,
          xac_nhan_truc: true,
          ngay_cap_nhat: now,
          nguoi_cap_nhat_id,
        }, { transaction: t });
        inserted++;
      }

      await t.commit();
      return res.json({ ok: true, message: `Đã nạp lịch Thứ ${sourceThu + 2} vào ngày ${targetDate}. Thêm/cập nhật: ${inserted}, bỏ qua: ${skipped}` });
    } catch (e) { await t.rollback(); throw e; }
  } catch (err) { return res.status(500).json({ ok: false, error: err.message }); }
});

/** POST /api/lichtruc/clear-day/ - Xóa lịch nguyên 1 ngày (Đánh dấu nghỉ bán trú) */
router.post('/api/lichtruc/clear-day/', loginRequired, roleRequired('admin', 'quan_ly'), async (req, res) => {
  try {
    const { ngay } = req.body;
    if (!ngay) return res.status(400).json({ ok: false, error: 'Thiếu thông tin ngày' });
    const count = await PhanCongTrucGV.destroy({ where: { ngay } });
    const countDiemDanh = await DiemDanhHS.destroy({ where: { ngay } });
    await DiemDanhPhong.destroy({ where: { ngay } });
    await CauHinhNgay.upsert({ ngay, is_nghi: true, lop_ap_dung: null, hs_loai_tru: null, hs_them_vao: null, ghi_chu: null });
    return res.json({ ok: true, message: `Đã xóa toàn bộ ${count} phân công GV và ${countDiemDanh} điểm danh HS ngày ${ngay}. Hôm nay sẽ nghỉ bán trú.` });
  } catch (err) { return res.status(500).json({ ok: false, error: err.message }); }
});

/** GET /api/lichtruc/audit-log/?tuan= - Xem lịch sử cập nhật phân công */
router.get('/api/lichtruc/audit-log/', loginRequired, roleRequired('admin', 'quan_ly'), async (req, res) => {
  try {
    const tuan = getMondayOfWeek(req.query.tuan);
    const cuoi = addDays(tuan, 6);
    const records = await PhanCongTrucGV.findAll({
      where: {
        ngay: { [Op.between]: [tuan, cuoi] },
        ngay_cap_nhat: { [Op.ne]: null },
      },
      include: [
        { association: 'giao_vien', attributes: ['id', 'ho_ten'] },
        { association: 'phong', attributes: ['ma_phong', 'loai_phong'] },
      ],
      order: [['ngay_cap_nhat', 'DESC']],
    });
    // Lấy thông tin người cập nhật
    const nguoiIds = [...new Set(records.filter(r => r.nguoi_cap_nhat_id).map(r => r.nguoi_cap_nhat_id))];
    const nguoiList = nguoiIds.length > 0
      ? await StaffUser.findAll({ where: { id: { [Op.in]: nguoiIds } }, attributes: ['id', 'fullname', 'username'] })
      : [];
    const nguoiMap = {};
    nguoiList.forEach(u => { nguoiMap[u.id] = u; });

    const data = records.map(r => ({
      id: r.id,
      giao_vien: r.giao_vien?.ho_ten,
      phong: r.phong?.ma_phong,
      loai_truc: r.loai_truc === 0 ? 'Ăn' : 'Ngủ',
      ngay: r.ngay,
      ngay_cap_nhat: r.ngay_cap_nhat,
      nguoi_cap_nhat: r.nguoi_cap_nhat_id ? (nguoiMap[r.nguoi_cap_nhat_id]?.fullname || nguoiMap[r.nguoi_cap_nhat_id]?.username) : null,
    }));
    return res.json({ ok: true, data, tuan });
  } catch (err) { return res.status(500).json({ ok: false, error: err.message }); }
});

// ══════════════════════════════════════════════
// BÁO CÁO
// ══════════════════════════════════════════════

/** GET /api/baocao/diemdanh/?loai=&thang=&nam=&lop= */
router.get('/api/baocao/diemdanh/', loginRequired, async (req, res) => {
  try {
    const { loai, thang, nam, lop } = req.query;
    const year = nam || new Date().getFullYear();
    const month = thang || (new Date().getMonth() + 1);
    const start = `${year}-${String(month).padStart(2, '0')}-01`;
    const end = new Date(parseInt(year), parseInt(month), 0).toISOString().split('T')[0];

    const hsWhere = { dang_hoc: true };
    if (lop) hsWhere.lop = lop;

    const hsList = await HocSinh.findAll({ where: hsWhere, attributes: ['id', 'ho_ten', 'lop', 'gioi_tinh'] });
    const hsIds = hsList.map(h => h.id);

    const records = await DiemDanhHS.findAll({ where: { ma_hs_id: { [Op.in]: hsIds }, ngay: { [Op.between]: [start, end] } } });

    // Lấy tất cả cấu hình ngày đặc biệt trong tháng
    const cauhinhNgayList = await CauHinhNgay.findAll({
      where: { ngay: { [Op.between]: [start, end] } },
    });
    const cauhinhNgayMap = {}; // { 'YYYY-MM-DD': CauHinhNgay }
    cauhinhNgayList.forEach(c => { cauhinhNgayMap[c.ngay] = c; });

    // Lấy tất cả ngày có bán trú ăn trong tháng
    const pcAnRecords = await PhanCongTrucGV.findAll({
      where: { ngay: { [Op.between]: [start, end] }, loai_truc: 0 },
      attributes: [[sequelize.fn('DISTINCT', sequelize.col('ngay')), 'ngay']],
      raw: true,
    });
    const ngayBanTruAn = pcAnRecords.map(r => r.ngay).sort();

    // Lấy tất cả ngày có bán trú ngủ trong tháng
    const pcNguRecords = await PhanCongTrucGV.findAll({
      where: { ngay: { [Op.between]: [start, end] }, loai_truc: 1 },
      attributes: [[sequelize.fn('DISTINCT', sequelize.col('ngay')), 'ngay']],
      raw: true,
    });
    const ngayBanTruNgu = pcNguRecords.map(r => r.ngay).sort();

    const ddMap = {};
    records.forEach(r => {
      if (!ddMap[r.ma_hs_id]) ddMap[r.ma_hs_id] = [];
      ddMap[r.ma_hs_id].push(r);
    });

    const data = hsList.map(hs => {
      const recs = ddMap[hs.id] || [];
      // Tính số ngày HS thực sự phải tham gia (loại trừ ngày đặc biệt không dành cho HS đó)
      const ngayPhai_An = ngayBanTruAn.filter(ngay => isHsAllowed(hs, cauhinhNgayMap[ngay] || null));
      const ngayPhai_Ngu = ngayBanTruNgu.filter(ngay => isHsAllowed(hs, cauhinhNgayMap[ngay] || null));
      return {
        id: hs.id, ho_ten: hs.ho_ten, lop: hs.lop, gioi_tinh: hs.gioi_tinh,
        so_ngay_phai_di_an: ngayPhai_An.length,
        so_ngay_phai_di_ngu: ngayPhai_Ngu.length,
        so_ngay_co_mat_an: recs.filter(r => r.diem_danh_an === 0 && ngayPhai_An.includes(r.ngay)).length,
        so_ngay_vang_an: recs.filter(r => r.diem_danh_an === 1 && ngayPhai_An.includes(r.ngay)).length,
        so_ngay_phep_an: recs.filter(r => r.diem_danh_an === 2 && ngayPhai_An.includes(r.ngay)).length,
        so_ngay_co_mat_ngu: recs.filter(r => r.diem_danh_ngu === 0 && ngayPhai_Ngu.includes(r.ngay)).length,
        so_ngay_vang_ngu: recs.filter(r => r.diem_danh_ngu === 1 && ngayPhai_Ngu.includes(r.ngay)).length,
        so_ngay_phep_ngu: recs.filter(r => r.diem_danh_ngu === 2 && ngayPhai_Ngu.includes(r.ngay)).length,
      };
    });

    return res.json({ ok: true, data, thang: `${year}-${month}` });
  } catch (err) { return res.status(500).json({ ok: false, error: err.message }); }
});

/** GET /api/baocao/export-an/?thang=MM&nam=YYYY - Xuất báo cáo điểm danh ăn chính thức theo tháng */
router.get('/api/baocao/export-an/', loginRequired, async (req, res) => {
  try {
    const { thang, nam } = req.query;
    const year = parseInt(nam) || new Date().getFullYear();
    const month = parseInt(thang) || (new Date().getMonth() + 1);
    const start = `${year}-${String(month).padStart(2, '0')}-01`;
    const end = new Date(year, month, 0).toISOString().split('T')[0];

    // 1. Lấy các ngày thực sự có bán trú (ăn) trong tháng từ PhanCongTrucGV
    const phanCongRecords = await PhanCongTrucGV.findAll({
      where: { ngay: { [Op.between]: [start, end] }, loai_truc: 0 },
      attributes: [[sequelize.fn('DISTINCT', sequelize.col('ngay')), 'ngay']],
      order: [['ngay', 'ASC']],
      raw: true,
    });
    const ngayBanTru = phanCongRecords.map(r => r.ngay).sort();

    // 2. Lấy danh sách phòng ăn
    const phongList = await Phong.findAll({ where: { loai_phong: 0 }, order: [['ma_phong', 'ASC']] });

    // 3. Lấy danh sách học sinh kèm phòng ăn
    const hsList = await HocSinh.findAll({
      where: { dang_hoc: true },
      include: [{ association: 'phong_an', attributes: ['ma_phong'] }],
      order: [['lop', 'ASC'], ['ho_ten', 'ASC']],
    });
    const hsIds = hsList.map(h => h.id);

    // 4a. Lấy cấu hình ngày đặc biệt trong tháng (cho export)
    const cauhinhNgayListAn = await CauHinhNgay.findAll({
      where: { ngay: { [Op.between]: [start, end] } },
    });
    const ngayDacBietMapAn = {};
    cauhinhNgayListAn.forEach(c => {
      ngayDacBietMapAn[c.ngay] = {
        lop_ap_dung: c.lop_ap_dung ? JSON.parse(c.lop_ap_dung) : null,
        hs_loai_tru: c.hs_loai_tru ? JSON.parse(c.hs_loai_tru) : null,
      };
    });

    // 4b. Lấy toàn bộ dữ liệu điểm danh ăn trong tháng
    const ddRecords = await DiemDanhHS.findAll({
      where: { ma_hs_id: { [Op.in]: hsIds }, ngay: { [Op.between]: [start, end] } },
      attributes: ['ma_hs_id', 'ngay', 'diem_danh_an'],
    });

    // Build ddMap: { hsId: { 'YYYY-MM-DD': 0|1|2 } }
    const ddMap = {};
    ddRecords.forEach(r => {
      if (!ddMap[r.ma_hs_id]) ddMap[r.ma_hs_id] = {};
      ddMap[r.ma_hs_id][r.ngay] = r.diem_danh_an;
    });

    // 5. Gom học sinh theo phòng, gắn dữ liệu điểm danh từng ngày
    const dataByPhong = {};
    phongList.forEach(p => { dataByPhong[p.ma_phong] = []; });

    hsList.forEach(hs => {
      const maPhong = hs.phong_an?.ma_phong;
      if (!maPhong || !dataByPhong[maPhong]) return;
      const hsDD = ddMap[hs.id] || {};
      // Chỉ lấy giá trị của các ngày có bán trú thực tế
      const diemdanh = {};
      ngayBanTru.forEach(ngay => {
        diemdanh[ngay] = hsDD[ngay] !== undefined ? hsDD[ngay] : null;
      });
      const hasAny = Object.values(diemdanh).some(v => v !== null);
      dataByPhong[maPhong].push({
        id: hs.id,
        ho_ten: hs.ho_ten,
        lop: hs.lop,
        gioi_tinh: hs.gioi_tinh,
        phong_an: maPhong,
        diemdanh,
        so_ngay_co_mat: Object.values(diemdanh).filter(v => v === 0).length,
        so_ngay_vang: Object.values(diemdanh).filter(v => v === 1).length,
        so_ngay_phep: Object.values(diemdanh).filter(v => v === 2).length,
        da_diemdanh: hasAny,
      });
    });

    // 6. Lấy cấu hình hệ thống
    const [cauhinh] = await CauHinhHeThong.findOrCreate({
      where: { id: 1 },
      defaults: { nam_hoc: '2025-2026', nguoi_phu_trach: 'Người phụ trách' }
    });

    return res.json({
      ok: true,
      thang: `${year}-${String(month).padStart(2, '0')}`,
      so_thang: month,
      so_nam: year,
      ngay_ban_tru: ngayBanTru,
      tong_buoi_bantru: ngayBanTru.length,
      phong_list: phongList.map(p => p.ma_phong),
      data: dataByPhong,
      ngay_dac_biet_map: ngayDacBietMapAn,   // { 'YYYY-MM-DD': { lop_ap_dung, hs_loai_tru } }
      nam_hoc: cauhinh.nam_hoc,
      nguoi_phu_trach: cauhinh.nguoi_phu_trach,
    });
  } catch (err) { return res.status(500).json({ ok: false, error: err.message }); }
});

/** GET /api/baocao/export-ngu/?thang=MM&nam=YYYY - Xuất báo cáo điểm danh ngủ chính thức theo tháng */
router.get('/api/baocao/export-ngu/', loginRequired, async (req, res) => {
  try {
    const { thang, nam } = req.query;
    const year = parseInt(nam) || new Date().getFullYear();
    const month = parseInt(thang) || (new Date().getMonth() + 1);
    const start = `${year}-${String(month).padStart(2, '0')}-01`;
    const end = new Date(year, month, 0).toISOString().split('T')[0];

    // 1. Các ngày có bán trú (ngủ) từ PhanCongTrucGV
    const phanCongRecords = await PhanCongTrucGV.findAll({
      where: { ngay: { [Op.between]: [start, end] }, loai_truc: 1 },
      attributes: [[sequelize.fn('DISTINCT', sequelize.col('ngay')), 'ngay']],
      order: [['ngay', 'ASC']],
      raw: true,
    });
    const ngayBanTru = phanCongRecords.map(r => r.ngay).sort();

    // 2. Danh sách phòng ngủ
    const phongList = await Phong.findAll({ where: { loai_phong: 1 }, order: [['ma_phong', 'ASC']] });

    // 3. Học sinh kèm phòng ngủ
    const hsList = await HocSinh.findAll({
      where: { dang_hoc: true },
      include: [{ association: 'phong_ngu', attributes: ['ma_phong', 'gioi_tinh'] }],
      order: [['lop', 'ASC'], ['ho_ten', 'ASC']],
    });
    const hsIds = hsList.map(h => h.id);

    // 4a. Lấy cấu hình ngày đặc biệt trong tháng (cho export ngủ)
    const cauhinhNgayListNgu = await CauHinhNgay.findAll({
      where: { ngay: { [Op.between]: [start, end] } },
    });
    const ngayDacBietMapNgu = {};
    cauhinhNgayListNgu.forEach(c => {
      ngayDacBietMapNgu[c.ngay] = {
        lop_ap_dung: c.lop_ap_dung ? JSON.parse(c.lop_ap_dung) : null,
        hs_loai_tru: c.hs_loai_tru ? JSON.parse(c.hs_loai_tru) : null,
      };
    });

    // 4b. Điểm danh ngủ trong tháng
    const ddRecords = await DiemDanhHS.findAll({
      where: { ma_hs_id: { [Op.in]: hsIds }, ngay: { [Op.between]: [start, end] } },
      attributes: ['ma_hs_id', 'ngay', 'diem_danh_ngu'],
    });
    const ddMap = {};
    ddRecords.forEach(r => {
      if (!ddMap[r.ma_hs_id]) ddMap[r.ma_hs_id] = {};
      ddMap[r.ma_hs_id][r.ngay] = r.diem_danh_ngu;
    });

    // 5. Gom theo phòng ngủ
    const dataByPhong = {};
    phongList.forEach(p => { dataByPhong[p.ma_phong] = []; });
    hsList.forEach(hs => {
      const maPhong = hs.phong_ngu?.ma_phong;
      if (!maPhong || !dataByPhong[maPhong]) return;
      const hsDD = ddMap[hs.id] || {};
      const diemdanh = {};
      ngayBanTru.forEach(ngay => { diemdanh[ngay] = hsDD[ngay] !== undefined ? hsDD[ngay] : null; });
      const hasAny = Object.values(diemdanh).some(v => v !== null);
      dataByPhong[maPhong].push({
        id: hs.id, ho_ten: hs.ho_ten, lop: hs.lop, gioi_tinh: hs.gioi_tinh,
        phong_ngu: maPhong, diemdanh,
        so_ngay_co_mat: Object.values(diemdanh).filter(v => v === 0).length,
        so_ngay_vang: Object.values(diemdanh).filter(v => v === 1).length,
        so_ngay_phep: Object.values(diemdanh).filter(v => v === 2).length,
        da_diemdanh: hasAny,
      });
    });

    // 6. Cấu hình hệ thống
    const [cauhinh] = await CauHinhHeThong.findOrCreate({
      where: { id: 1 },
      defaults: { nam_hoc: '2025-2026', nguoi_phu_trach: 'Người phụ trách' }
    });

    return res.json({
      ok: true,
      thang: `${year}-${String(month).padStart(2, '0')}`,
      so_thang: month, so_nam: year,
      ngay_ban_tru: ngayBanTru,
      tong_buoi_bantru: ngayBanTru.length,
      phong_list: phongList.map(p => p.ma_phong),
      data: dataByPhong,
      ngay_dac_biet_map: ngayDacBietMapNgu,   // { 'YYYY-MM-DD': { lop_ap_dung, hs_loai_tru } }
      nam_hoc: cauhinh.nam_hoc,
      nguoi_phu_trach: cauhinh.nguoi_phu_trach,
    });
  } catch (err) { return res.status(500).json({ ok: false, error: err.message }); }
});

/** GET /api/baocao/tong-hop-lop/?thang=MM&nam=YYYY&lop=
 *  Xuất tổng hợp số buổi ăn/ngủ thực tế, vắng, phép từng HS theo lớp.
 *  Dùng để gửi GVCN và thu tiền HS.
 */
router.get('/api/baocao/tong-hop-lop/', loginRequired, async (req, res) => {
  try {
    const { thang, nam, lop } = req.query;
    const year = parseInt(nam) || new Date().getFullYear();
    const month = parseInt(thang) || (new Date().getMonth() + 1);
    const start = `${year}-${String(month).padStart(2, '0')}-01`;
    const end = new Date(year, month, 0).toISOString().split('T')[0];

    // 1. Ngày bán trú ăn & ngủ
    const [pcAn, pcNgu] = await Promise.all([
      PhanCongTrucGV.findAll({
        where: { ngay: { [Op.between]: [start, end] }, loai_truc: 0 },
        attributes: [[sequelize.fn('DISTINCT', sequelize.col('ngay')), 'ngay']],
        raw: true,
      }),
      PhanCongTrucGV.findAll({
        where: { ngay: { [Op.between]: [start, end] }, loai_truc: 1 },
        attributes: [[sequelize.fn('DISTINCT', sequelize.col('ngay')), 'ngay']],
        raw: true,
      }),
    ]);
    const ngayAn = pcAn.map(r => r.ngay).sort();
    const ngayNgu = pcNgu.map(r => r.ngay).sort();

    // 2. Danh sách HS
    const hsWhere = { dang_hoc: true };
    if (lop) hsWhere.lop = lop;
    const hsList = await HocSinh.findAll({
      where: hsWhere,
      attributes: ['id', 'ho_ten', 'lop', 'gioi_tinh'],
      order: [['lop', 'ASC'], ['ho_ten', 'ASC']],
    });
    const hsIds = hsList.map(h => h.id);

    // 3. Cấu hình ngày đặc biệt
    const cauhinhNgayList = await CauHinhNgay.findAll({
      where: { ngay: { [Op.between]: [start, end] } },
    });
    const cauhinhNgayMap = {};
    cauhinhNgayList.forEach(c => { cauhinhNgayMap[c.ngay] = c; });

    // 4. Records điểm danh
    const ddRecords = await DiemDanhHS.findAll({
      where: { ma_hs_id: { [Op.in]: hsIds }, ngay: { [Op.between]: [start, end] } },
      attributes: ['ma_hs_id', 'ngay', 'diem_danh_an', 'diem_danh_ngu'],
    });
    const ddMap = {};
    ddRecords.forEach(r => {
      if (!ddMap[r.ma_hs_id]) ddMap[r.ma_hs_id] = {};
      ddMap[r.ma_hs_id][r.ngay] = { an: r.diem_danh_an, ngu: r.diem_danh_ngu };
    });

    // 5. Giá ăn/ngủ từ cấu hình giá
    const giaConfig = await CauHinhGia.findOne({ order: [['id', 'DESC']] });
    const giaAn = giaConfig?.don_gia_an || 0;
    const giaNgu = giaConfig?.don_gia_ngu || 0;

    // 6. Tính toán từng HS
    const data = hsList.map(hs => {
      const recs = ddMap[hs.id] || {};
      // Số ngày HS phải tham gia (loại trừ ngày đặc biệt không dành cho HS)
      const phaiAn = ngayAn.filter(ngay => isHsAllowed(hs, cauhinhNgayMap[ngay] || null));
      const phaiNgu = ngayNgu.filter(ngay => isHsAllowed(hs, cauhinhNgayMap[ngay] || null));

      const vangAn  = phaiAn.filter(ng => recs[ng]?.an === 1).length;
      const phepAn  = phaiAn.filter(ng => recs[ng]?.an === 2).length;
      const coMatAn = phaiAn.length - vangAn - phepAn; // Thực tế là những buổi có mặt (kể cả chưa chốt điểm danh)

      const vangNgu  = phaiNgu.filter(ng => recs[ng]?.ngu === 1).length;
      const phepNgu  = phaiNgu.filter(ng => recs[ng]?.ngu === 2).length;
      const coMatNgu = phaiNgu.length - vangNgu - phepNgu;

      const buoiAnThucTe  = coMatAn;
      const buoiNguThucTe = coMatNgu;
      const tienAn  = (phaiAn.length - phepAn) * giaAn; // Vắng không trừ tiền, chỉ phép mới trừ
      const tienNgu = (phaiNgu.length - phepNgu) * giaNgu;

      return {
        id: hs.id,
        ho_ten: hs.ho_ten,
        lop: hs.lop,
        gioi_tinh: hs.gioi_tinh,
        tong_buoi_an: phaiAn.length,
        co_mat_an: coMatAn,
        vang_an: vangAn,
        phep_an: phepAn,
        tong_buoi_ngu: phaiNgu.length,
        co_mat_ngu: coMatNgu,
        vang_ngu: vangNgu,
        phep_ngu: phepNgu,
        buoi_an_thuc_te: buoiAnThucTe,
        buoi_ngu_thuc_te: buoiNguThucTe,
        tien_an: tienAn,
        tien_ngu: tienNgu,
        tong_tien: tienAn + tienNgu,
      };
    });

    // 7. Cấu hình hệ thống
    const [cauhinh] = await CauHinhHeThong.findOrCreate({
      where: { id: 1 },
      defaults: { nam_hoc: '2025-2026', nguoi_phu_trach: 'Người phụ trách' }
    });

    return res.json({
      ok: true,
      so_thang: month, so_nam: year,
      tong_buoi_an: ngayAn.length, tong_buoi_ngu: ngayNgu.length,
      gia_an: giaAn, gia_ngu: giaNgu,
      nam_hoc: cauhinh.nam_hoc,
      nguoi_phu_trach: cauhinh.nguoi_phu_trach,
      data,
    });
  } catch (err) { return res.status(500).json({ ok: false, error: err.message }); }
});

/** GET /api/baocao/luong-gv/?thang=&nam= */
router.get('/api/baocao/luong-gv/', loginRequired, async (req, res) => {
  try {
    const year = req.query.nam || new Date().getFullYear();
    const month = req.query.thang || (new Date().getMonth() + 1);
    const start = `${year}-${String(month).padStart(2, '0')}-01`;
    const end = new Date(parseInt(year), parseInt(month), 0).toISOString().split('T')[0];

    const phanCong = await PhanCongTrucGV.findAll({
      where: { ngay: { [Op.between]: [start, end] }, xac_nhan_truc: true },
      include: [{ association: 'giao_vien', attributes: ['id', 'ho_ten'] }],
    });

    const giaAn = await CauHinhGia.findOne({ where: { loai_truc: 0, ngay_ap_dung: { [Op.lte]: end } }, order: [['ngay_ap_dung', 'DESC']] });
    const giaNgu = await CauHinhGia.findOne({ where: { loai_truc: 1, ngay_ap_dung: { [Op.lte]: end } }, order: [['ngay_ap_dung', 'DESC']] });

    const don_gia_an = giaAn ? parseFloat(giaAn.don_gia) : 0;
    const don_gia_ngu = giaNgu ? parseFloat(giaNgu.don_gia) : 0;

    const gvMap = {};
    phanCong.forEach(pc => {
      const id = pc.ma_gv_id;
      if (!gvMap[id]) gvMap[id] = { id, ho_ten: pc.giao_vien?.ho_ten || '', so_ca_an: 0, so_ca_ngu: 0, tong_tien: 0 };
      if (pc.loai_truc === 0) { gvMap[id].so_ca_an++; gvMap[id].tong_tien += don_gia_an; }
      else { gvMap[id].so_ca_ngu++; gvMap[id].tong_tien += don_gia_ngu; }
    });

    return res.json({ ok: true, data: Object.values(gvMap), don_gia_an, don_gia_ngu, thang: `${year}-${month}` });
  } catch (err) { return res.status(500).json({ ok: false, error: err.message }); }
});

/** GET /api/baocao/full/ */
router.get('/api/baocao/full/', loginRequired, async (req, res) => {
  try {
    const now = new Date();
    const months = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({ year: d.getFullYear(), month: d.getMonth() + 1 });
    }

    const results = [];
    for (const { year, month } of months) {
      const start = `${year}-${String(month).padStart(2, '0')}-01`;
      const end = new Date(year, month, 0).toISOString().split('T')[0];
      const [tongHS, diemDanh] = await Promise.all([
        HocSinh.count({ where: { dang_hoc: true } }),
        DiemDanhHS.count({ where: { ngay: { [Op.between]: [start, end] }, diem_danh_an: 0 } }),
      ]);
      results.push({ thang: `${year}-${String(month).padStart(2, '0')}`, tong_hs: tongHS, tong_diemdanh: diemDanh });
    }
    return res.json({ ok: true, data: results });
  } catch (err) { return res.status(500).json({ ok: false, error: err.message }); }
});

// ── EXPORT EXCEL ──────────────────────────────────────────────────
/** GET /api/lichtruc/export/?tuan= */
router.get('/api/lichtruc/export/', loginRequired, roleRequired('admin', 'quan_ly'), async (req, res) => {
  try {
    const tuan = getMondayOfWeek(req.query.tuan);
    // Lấy 2 tuần (10 ngày T2-T6)
    const days = [];
    for (let w = 0; w < 2; w++) for (let d = 0; d < 5; d++) days.push(addDays(tuan, w * 7 + d));

    const start = days[0], end = days[days.length - 1];
    const records = await PhanCongTrucGV.findAll({
      where: { ngay: { [Op.between]: [start, end] } },
      include: [{ association: 'giao_vien', attributes: ['ho_ten'] }, { association: 'phong', attributes: ['ma_phong', 'loai_phong'] }],
      order: [['ngay', 'ASC']],
    });

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Lịch trực');

    ws.getRow(1).values = ['Ngày', 'Phòng', 'Loại', 'Giáo viên'];
    ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1e3a5f' } };
    ws.columns = [{ width: 14 }, { width: 10 }, { width: 10 }, { width: 28 }];

    let rowIdx = 2;
    for (const r of records) {
      const row = ws.getRow(rowIdx++);
      row.values = [r.ngay, r.phong?.ma_phong, r.loai_truc === 0 ? 'Ăn' : 'Ngủ', r.giao_vien?.ho_ten];
      row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: r.loai_truc === 0 ? 'FFfef3c7' : 'FFede9fe' } };
    }

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="lichtruc_${tuan}.xlsx"`);
    await wb.xlsx.write(res);
    res.end();
  } catch (err) { return res.status(500).json({ ok: false, error: err.message }); }
});

module.exports = router;
