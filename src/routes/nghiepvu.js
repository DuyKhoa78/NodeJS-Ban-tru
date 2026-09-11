const express = require('express');
const router = express.Router();
const { Op } = require('sequelize');
const ExcelJS = require('exceljs');
const NodeCache = require('node-cache');
const {
    HocSinh, GiaoVien, Phong, DiemDanhHS, DiemDanhPhong, DiemDanhDraft,
    PhanCongTrucGV, LichTrucCoDinh, CauHinhGia, CauHinhHeThong, StaffUser, sequelize, CauHinhTuan, CauHinhNgay,
    BaoCaoTruc
} = require('../models');
const { loginRequired, attachUser, roleRequired } = require('../middleware/auth');
const {
    phanCongLichKhung,
    buildPhanCongTuanFromKhung,
    validateAssignments,
} = require('../utils/schedulerUtils');

router.use(attachUser);

// ── In-memory cache ──────────────────────────────────────────────────
const { appCache, invalidateStaticCaches } = require('../utils/appCache');

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
        return res.json({ ok: true, config: config || { tuan: monday, show_t6: false, show_t5: false } });
    } catch (err) { return res.status(500).json({ ok: false, error: err.message }); }
});

/** POST /api/lichtruc/config-tuan/save/ */
router.post('/api/lichtruc/config-tuan/save/', loginRequired, roleRequired('admin', 'quan_ly'), async (req, res) => {
    try {
        const { tuan, show_t6, show_t5 } = req.body;
        if (!tuan) return res.status(400).json({ ok: false, error: 'Thiếu tham số tuần' });
        const monday = getMondayOfWeek(tuan);
        await CauHinhTuan.upsert({
            tuan: monday,
            show_t6: show_t6 !== undefined ? show_t6 : false,
            show_t5: show_t5 !== undefined ? show_t5 : false,
        });
        return res.json({ ok: true, message: 'Đã lưu cấu hình tuần' });
    } catch (err) { return res.status(500).json({ ok: false, error: err.message }); }
});

// ══════════════════════════════════════════════
// CẤU HÌNH NGÀY ĐẶC BIỆT
// ══════════════════════════════════════════════

/** GET /api/cauhinh-ngay/?ngay=YYYY-MM-DD */
router.get('/api/cauhinh-ngay/', loginRequired, roleRequired('admin', 'quan_ly', 'hoc_vu', 'ke_toan', 'giao_vien'), async (req, res) => {
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
router.get('/api/phong/:loai', loginRequired, roleRequired('admin', 'hoc_vu', 'quan_ly', 'giao_vien'), async (req, res) => {
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
router.get('/api/hocsinh/:loai', loginRequired, roleRequired('admin', 'hoc_vu', 'quan_ly', 'giao_vien'), async (req, res) => {
    try {
        const loai = req.params.loai;
        const cacheKey = 'hocsinh_full';

        let data = appCache.get(cacheKey);
        if (!data) {
            const list = await HocSinh.findAll({
                attributes: ['id', 'ho_ten', 'lop', 'gioi_tinh', 'ma_phong_an_id', 'ma_phong_ngu_id', 'dang_hoc', 'ngay_vao', 'ngay_rut'],
                include: [
                    { association: 'phong_an', attributes: ['ma_phong'] },
                    { association: 'phong_ngu', attributes: ['ma_phong', 'gioi_tinh'] },
                ],
                order: [['id', 'ASC']],
            });
            data = list.map(hs => ({
                id: hs.id,
                ho_ten: hs.ho_ten,
                lop: hs.lop,
                khoi: parseInt(hs.lop.slice(0, 2)),
                gioi_tinh: hs.gioi_tinh,
                dang_hoc: hs.dang_hoc,
                ngay_vao: hs.ngay_vao,
                ngay_rut: hs.ngay_rut,
                phong_an: hs.phong_an?.ma_phong || null,
                phong_ngu: hs.phong_ngu?.ma_phong || null,
            }));
            appCache.set(cacheKey, data);
            res.set('X-Cache', 'MISS');
        } else {
            res.set('X-Cache', 'HIT');
        }

        // Lọc theo loại nếu cần
        let filtered = loai === 'an'
            ? data.filter(hs => hs.phong_an)
            : loai === 'ngu'
            ? data.filter(hs => hs.phong_ngu)
            : data;

        // Nếu có truyền ngày cụ thể thì lọc các HS có hiệu lực tại ngày đó
        if (req.query.ngay) {
            const d = req.query.ngay;
            filtered = filtered.filter(hs => (!hs.ngay_vao || hs.ngay_vao <= d) && (!hs.ngay_rut || hs.ngay_rut >= d));
        }

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

// ─── Vietnam Time & Auto-Rescue Helpers ─────────────────────────────
function getVietnamTime(dateObj = new Date()) {
    const timeStr = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Asia/Ho_Chi_Minh',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    }).format(dateObj);
    const dateStr = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Ho_Chi_Minh',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).format(dateObj);
    const [h, m] = timeStr.split(':').map(Number);
    return { h, m, totalMins: h * 60 + m, timeStr, todayStr: dateStr };
}

async function checkAndAutoRescueRooms(targetNgay) {
    // Tắt hoàn toàn tự động chốt vắng vì nhà trường chưa triển khai quét mã QR.
    // Tránh việc hệ thống tự động ghi vắng tất cả học sinh khi điểm danh thủ công.
    return;
}

/** GET /api/diemdanh/?ngay=&loai= */
router.get('/api/diemdanh/', loginRequired, roleRequired('admin', 'hoc_vu', 'giao_vien'), async (req, res) => {
    try {
        const { ngay, loai } = req.query;
        const ngayFilter = ngay || new Date().toISOString().split('T')[0];

        // Auto-rescue chỉ chạy khi GV truy cập (cứu dữ liệu nháp nếu GV quên chốt).
        // Admin/Học vụ tự điểm danh tay → KHÔNG chạy auto-rescue (tránh tự động ghi vắng tất cả).
        const isAdminOrHocVu = req.user.is_admin || req.user.is_superuser || req.user.role === 'hoc_vu' || req.user.role === 'admin';
        if (!isAdminOrHocVu) {
            await checkAndAutoRescueRooms(ngayFilter);
        }

        const records = await DiemDanhHS.findAll({
            where: { ngay: ngayFilter },
            include: [{ association: 'hoc_sinh', attributes: ['id', 'ho_ten', 'lop', 'ma_phong_an_id', 'ma_phong_ngu_id'] }],
        });

        // Lấy trạng thái chốt của các phòng trong ca này
        const loaiTrucQuery = loai === 'ngu' ? 1 : 0;
        const phongStatuses = await DiemDanhPhong.findAll({
            where: { ngay: ngayFilter, loai_truc: loaiTrucQuery }
        });

        // Nếu là giáo viên, xác định phòng được phân công
        let assignedRooms = null;
        let myAssignments = null;
        if (req.user.role === 'giao_vien') {
            let gvId = req.user.giao_vien_id;
            if (!gvId) {
                const gvObj = await GiaoVien.findOne({ where: { ho_ten: req.user.username } });
                if (gvObj) gvId = gvObj.id;
            }
            if (gvId) {
                myAssignments = await PhanCongTrucGV.findAll({
                    where: {
                        ngay: ngayFilter,
                        loai_truc: loaiTrucQuery,
                        [Op.or]: [{ ma_gv_id: gvId }, { ma_gv_truc_thay_id: gvId }]
                    }
                });
                assignedRooms = myAssignments.map(a => a.ma_phong_id);
            } else {
                assignedRooms = [];
                myAssignments = [];
            }
        }

        // Kiểm tra xem ngày này có lịch bán trú không
        let hasSchedule = false;
        const dateObj = new Date(ngayFilter + 'T12:00:00');
        const dow = dateObj.getDay(); // 0=CN, 1=T2, ..., 4=T5, 5=T6

        if (dow === 0 || dow === 6) {
            hasSchedule = false;
        } else if (dow === 5) {
            const monStr = getMondayOfWeek(ngayFilter);
            const cauHinhTuan = await CauHinhTuan.findByPk(monStr);
            const showT6 = cauHinhTuan?.show_t6 ?? false;
            const pcCountT6 = await PhanCongTrucGV.count({ where: { ngay: ngayFilter, loai_truc: loaiTrucQuery } });
            // Thứ 6 chỉ có lịch trực khi được mở thứ 6 VÀ thực tế có phân công trực
            hasSchedule = showT6 && pcCountT6 > 0;
        } else {
            const pcCount = await PhanCongTrucGV.count({ where: { ngay: ngayFilter, loai_truc: loaiTrucQuery } });
            hasSchedule = pcCount > 0;
        }

        // Trả về kèm cấu hình ngày cho frontend
        const cauhinhNgay = await CauHinhNgay.findByPk(ngayFilter);
        if (cauhinhNgay && cauhinhNgay.is_nghi) {
            hasSchedule = false;
        }

        return res.json({
            ok: true,
            records,
            ngay: ngayFilter,
            has_schedule: hasSchedule,
            cauhinh_ngay: parseCauHinhNgay(cauhinhNgay),
            phong_statuses: phongStatuses,
            assigned_rooms: assignedRooms,
            my_assignments: myAssignments,
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

        // Kiểm tra quyền và khung giờ điểm danh:
        // Admin/Superuser có thể điểm danh bất kỳ lúc nào.
        // Học vụ (hoc_vu) chỉ được điểm danh trong khung giờ từ 11:00 đến 14:00.
        const isSpecialAdmin = Boolean(req.user?.is_admin || req.user?.is_superuser);
        if (!isSpecialAdmin) {
            const now = new Date();
            const timeStr = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', hour12: false }).format(now);
            const [vnHour, vnMinute] = timeStr.split(':').map(Number);
            const totalMins = vnHour * 60 + vnMinute;
            // 11h00 = 660 mins, 14h00 = 840 mins
            if (totalMins < 660 || totalMins > 840) {
                return res.status(400).json({
                    ok: false,
                    error: 'Học vụ chỉ có thể thực hiện điểm danh từ lúc 11:00 đến 14:00. Ngoài khung giờ này, vui lòng liên hệ Admin.'
                });
            }
        }

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

/** POST /api/diemdanh/bao-phep-truoc/ - Báo vắng phép trước cho HS mà không tự động đổi các bạn khác thành Có mặt */
router.post('/api/diemdanh/bao-phep-truoc/', loginRequired, roleRequired('admin', 'hoc_vu', 'quan_ly'), async (req, res) => {
    try {
        const { ma_hs_list, tu_ngay, den_ngay, ca, ghi_chu } = req.body;
        if (!ma_hs_list || !Array.isArray(ma_hs_list) || ma_hs_list.length === 0) {
            return res.status(400).json({ ok: false, error: 'Vui lòng chọn ít nhất 1 học sinh' });
        }
        if (!tu_ngay) {
            return res.status(400).json({ ok: false, error: 'Vui lòng chọn ngày bắt đầu' });
        }
        const startDate = tu_ngay;
        const endDate = den_ngay || tu_ngay;
        const loaiCa = ca || 'ca_ngay'; // 'an' | 'ngu' | 'ca_ngay'

        // Tạo danh sách các ngày hợp lệ
        const dates = [];
        let curr = new Date(startDate + 'T00:00:00');
        const end = new Date(endDate + 'T00:00:00');

        if (curr > end) {
            return res.status(400).json({ ok: false, error: 'Ngày bắt đầu không được lớn hơn ngày kết thúc' });
        }

        while (curr <= end) {
            const dow = curr.getDay(); // 0 = CN, 6 = T7
            if (dow !== 0 && dow !== 6) {
                const yyyy = curr.getFullYear();
                const mm = String(curr.getMonth() + 1).padStart(2, '0');
                const dd = String(curr.getDate()).padStart(2, '0');
                dates.push(`${yyyy}-${mm}-${dd}`);
            }
            curr.setDate(curr.getDate() + 1);
        }

        if (dates.length === 0) {
            return res.status(400).json({ ok: false, error: 'Khoảng thời gian đã chọn rơi vào cuối tuần, không có ngày học bán trú' });
        }

        const t = await sequelize.transaction();
        try {
            const existingRecords = await DiemDanhHS.findAll({
                where: {
                    ma_hs_id: { [Op.in]: ma_hs_list },
                    ngay: { [Op.in]: dates },
                },
                transaction: t,
            });

            const recordMap = new Map();
            existingRecords.forEach(r => {
                recordMap.set(`${r.ma_hs_id}_${r.ngay}`, r);
            });

            let count = 0;
            for (const ma_hs of ma_hs_list) {
                for (const d of dates) {
                    const key = `${ma_hs}_${d}`;
                    const rec = recordMap.get(key);

                    if (rec) {
                        const updates = {};
                        if (loaiCa === 'an' || loaiCa === 'ca_ngay') {
                            updates.diem_danh_an = 2; // 2 = Phép
                        }
                        if (loaiCa === 'ngu' || loaiCa === 'ca_ngay') {
                            updates.diem_danh_ngu = 2; // 2 = Phép
                        }
                        if (ghi_chu && ghi_chu.trim()) {
                            updates.ghi_chu = ghi_chu.trim();
                        }
                        await rec.update(updates, { transaction: t });
                    } else {
                        const newRow = {
                            ma_hs_id: ma_hs,
                            ngay: d,
                            diem_danh_an: (loaiCa === 'an' || loaiCa === 'ca_ngay') ? 2 : null,
                            diem_danh_ngu: (loaiCa === 'ngu' || loaiCa === 'ca_ngay') ? 2 : null,
                            ghi_chu: ghi_chu && ghi_chu.trim() ? ghi_chu.trim() : null,
                        };
                        await DiemDanhHS.create(newRow, { transaction: t });
                    }
                    count++;
                }
            }

            await t.commit();
            return res.json({
                ok: true,
                message: `Đã ghi nhận vắng phép thành công cho ${ma_hs_list.length} học sinh (${dates.length} ngày)`,
                totalUpdated: count,
                dates,
            });
        } catch (e) {
            await t.rollback();
            throw e;
        }
    } catch (err) {
        return res.status(500).json({ ok: false, error: err.message });
    }
});

/** POST /api/diemdanh/huy-phep/ - Hủy báo vắng phép cho HS */
router.post('/api/diemdanh/huy-phep/', loginRequired, roleRequired('admin', 'hoc_vu', 'quan_ly'), async (req, res) => {
    try {
        const { ma_hs_id, ngay, ca } = req.body;
        if (!ma_hs_id || !ngay) {
            return res.status(400).json({ ok: false, error: 'Thiếu thông tin học sinh hoặc ngày' });
        }
        const loaiCa = ca || 'ca_ngay'; // 'an' | 'ngu' | 'ca_ngay'
        const rec = await DiemDanhHS.findOne({ where: { ma_hs_id, ngay } });
        if (!rec) {
            return res.json({ ok: true, message: 'Không tìm thấy dữ liệu điểm danh cần hủy' });
        }

        const updates = {};
        if (loaiCa === 'an' || loaiCa === 'ca_ngay') {
            updates.diem_danh_an = null;
        }
        if (loaiCa === 'ngu' || loaiCa === 'ca_ngay') {
            updates.diem_danh_ngu = null;
        }

        const finalAn = updates.diem_danh_an !== undefined ? updates.diem_danh_an : rec.diem_danh_an;
        const finalNgu = updates.diem_danh_ngu !== undefined ? updates.diem_danh_ngu : rec.diem_danh_ngu;

        if (finalAn === null && finalNgu === null) {
            await rec.destroy();
        } else {
            await rec.update(updates);
        }

        return res.json({ ok: true, message: 'Đã hủy vắng phép thành công' });
    } catch (err) {
        return res.status(500).json({ ok: false, error: err.message });
    }
});

/** GET /api/diemdanh/danh-sach-phep/ - Danh sách học sinh đã báo phép trong ngày/khoảng ngày */
router.get('/api/diemdanh/danh-sach-phep/', loginRequired, roleRequired('admin', 'hoc_vu', 'quan_ly', 'giao_vien'), async (req, res) => {
    try {
        const { ngay, tu, den } = req.query;
        let whereCondition = {};
        if (tu && den) {
            whereCondition.ngay = { [Op.between]: [tu, den] };
        } else if (ngay) {
            whereCondition.ngay = ngay;
        } else {
            whereCondition.ngay = new Date().toISOString().split('T')[0];
        }

        whereCondition[Op.or] = [
            { diem_danh_an: 2 },
            { diem_danh_ngu: 2 }
        ];

        const records = await DiemDanhHS.findAll({
            where: whereCondition,
            include: [{
                association: 'hoc_sinh',
                attributes: ['id', 'ho_ten', 'lop', 'gioi_tinh', 'ma_phong_an_id', 'ma_phong_ngu_id'],
                include: [
                    { association: 'phong_an', attributes: ['ma_phong'] },
                    { association: 'phong_ngu', attributes: ['ma_phong'] },
                ]
            }],
            order: [['ngay', 'DESC'], ['ma_hs_id', 'ASC']],
        });

        const list = records.map(r => ({
            id: r.id,
            ma_hs_id: r.ma_hs_id,
            ngay: r.ngay,
            diem_danh_an: r.diem_danh_an,
            diem_danh_ngu: r.diem_danh_ngu,
            ghi_chu: r.ghi_chu,
            hoc_sinh: r.hoc_sinh ? {
                id: r.hoc_sinh.id,
                ho_ten: r.hoc_sinh.ho_ten,
                lop: r.hoc_sinh.lop,
                gioi_tinh: r.hoc_sinh.gioi_tinh,
                phong_an: r.hoc_sinh.phong_an?.ma_phong || null,
                phong_ngu: r.hoc_sinh.phong_ngu?.ma_phong || null,
            } : null,
        }));

        return res.json({ ok: true, list });
    } catch (err) {
        return res.status(500).json({ ok: false, error: err.message });
    }
});

// ══════════════════════════════════════════════
// GIÁO VIÊN & ĐIỂM DANH QR / CHỐT PHÒNG
// ══════════════════════════════════════════════

/** GET /api/giao-vien/ca-truc-hom-nay - Lấy lịch trực và trạng thái phòng của giáo viên hôm nay */
router.get('/api/giao-vien/ca-truc-hom-nay', loginRequired, async (req, res) => {
    try {
        const vn = getVietnamTime();
        const todayStr = vn.todayStr;

        // Auto rescue nếu đã quá giờ cắt
        await checkAndAutoRescueRooms(todayStr);

        let gvId = req.user.giao_vien_id;
        if (!gvId) {
            const gvObj = await GiaoVien.findOne({ where: { ho_ten: req.user.username } });
            if (gvObj) gvId = gvObj.id;
        }

        if (!gvId && req.user.role === 'giao_vien') {
            return res.status(404).json({ ok: false, error: 'Không tìm thấy hồ sơ giáo viên liên kết với tài khoản này' });
        }

        // Lấy danh sách phân công của giáo viên hôm nay
        const whereClause = { ngay: todayStr };
        if (req.user.role === 'giao_vien') {
            whereClause[Op.or] = [{ ma_gv_id: gvId }, { ma_gv_truc_thay_id: gvId }];
        }

        const assignments = await PhanCongTrucGV.findAll({
            where: whereClause,
            include: [
                { association: 'phong', attributes: ['ma_phong', 'loai_phong', 'gioi_tinh'] },
                { association: 'giao_vien', attributes: ['id', 'ho_ten'] }
            ],
            order: [['loai_truc', 'ASC']]
        });

        // Với mỗi phân công, lấy trạng thái DiemDanhPhong, DiemDanhDraft, và tổng số HS phòng
        const result = [];
        for (const pc of assignments) {
            const loaiTruc = pc.loai_truc; // 0=An, 1=Ngu
            const maPhong = pc.ma_phong_id;

            // Đếm học sinh trong phòng
            const fieldPhong = loaiTruc === 0 ? 'ma_phong_an_id' : 'ma_phong_ngu_id';
            const totalStudents = await HocSinh.count({ where: { [fieldPhong]: maPhong, dang_hoc: true } });

            // Trạng thái chốt
            const phongStatus = await DiemDanhPhong.findOne({
                where: { ngay: todayStr, loai_truc: loaiTruc, ma_phong_id: maPhong }
            });

            // Bản nháp đang lưu
            const draft = await DiemDanhDraft.findOne({
                where: { ngay: todayStr, loai_truc: loaiTruc, ma_phong_id: maPhong }
            });

            const draftCount = (draft && Array.isArray(draft.danh_sach_hs))
                ? draft.danh_sach_hs.filter(d => d.status === 0).length
                : 0;

            // Khung giờ điểm danh:
            // Ăn: 10:55 (655) -> 11:30 (690)
            // Ngủ: 11:30 (690) -> 12:00 (720)
            const startMins = loaiTruc === 0 ? 655 : 690;
            const endMins = loaiTruc === 0 ? 690 : 720;
            const startStr = loaiTruc === 0 ? '10:55' : '11:30';
            const endStr = loaiTruc === 0 ? '11:30' : '12:00';

            let timeState = 'sap_den'; // 'sap_den' | 'dang_dien_ra' | 'da_qua_gio'
            if (vn.totalMins < startMins) timeState = 'sap_den';
            else if (vn.totalMins <= endMins) timeState = 'dang_dien_ra';
            else timeState = 'da_qua_gio';

            // Phân quyền điểm danh:
            // Trực ăn: chỉ GV có nhiem_vu = 0 (Điểm danh) mới được điểm danh
            // Trực ngủ: cả nhiem_vu = 0 và 1 đều được điểm danh
            let canDiemDanh = true;
            let noteQuyen = '';
            if (req.user.role === 'giao_vien') {
                if (loaiTruc === 0 && pc.nhiem_vu !== 0) {
                    canDiemDanh = false;
                    noteQuyen = 'Thầy/Cô được phân công Giám sát ca ăn. Chỉ GV phân công Điểm danh mới thực hiện điểm danh ca ăn.';
                }
            }

            result.push({
                id: pc.id,
                ngay: pc.ngay,
                loai_truc: pc.loai_truc,
                nhiem_vu: pc.nhiem_vu, // 0=Điểm danh, 1=Giám sát
                ma_phong_id: pc.ma_phong_id,
                phong: pc.phong,
                total_students: totalStudents,
                draft_count: draftCount,
                trang_thai_chot: phongStatus?.trang_thai_chot || 'chua_chot',
                da_diem_danh: Boolean(phongStatus?.da_diem_danh),
                thoi_gian_chot: phongStatus?.thoi_gian || null,
                ghi_chu_chot: phongStatus?.ghi_chu_chot || null,
                khung_gio: {
                    start: startStr,
                    end: endStr,
                    state: timeState,
                    mins_remaining: timeState === 'dang_dien_ra' ? (endMins - vn.totalMins) : 0,
                },
                can_diem_danh: canDiemDanh,
                note_quyen: noteQuyen,
            });
        }

        return res.json({
            ok: true,
            today: todayStr,
            current_time: vn.timeStr,
            current_mins: vn.totalMins,
            assignments: result
        });
    } catch (err) {
        return res.status(500).json({ ok: false, error: err.message });
    }
});

/** POST /api/diemdanh/draft-sync/ - Lưu nháp dữ liệu quét mã QR (Zero data loss) */
router.post('/api/diemdanh/draft-sync/', loginRequired, roleRequired('admin', 'hoc_vu', 'giao_vien'), async (req, res) => {
    try {
        const { ngay, loai_truc, ma_phong_id, danh_sach_hs } = req.body;
        if (!ngay || loai_truc === undefined || !ma_phong_id) {
            return res.status(400).json({ ok: false, error: 'Thiếu thông tin ngày, ca trực hoặc phòng' });
        }

        const loaiTrucNum = Number(loai_truc);

        // Kiểm tra phân công nếu là giáo viên
        if (req.user.role === 'giao_vien') {
            let gvId = req.user.giao_vien_id;
            if (!gvId) {
                const gvObj = await GiaoVien.findOne({ where: { ho_ten: req.user.username } });
                if (gvObj) gvId = gvObj.id;
            }
            const pc = await PhanCongTrucGV.findOne({
                where: {
                    ngay,
                    loai_truc: loaiTrucNum,
                    ma_phong_id,
                    [Op.or]: [{ ma_gv_id: gvId }, { ma_gv_truc_thay_id: gvId }]
                }
            });
            if (!pc) {
                return res.status(403).json({ ok: false, error: 'Thầy/Cô không được phân công trực phòng này trong ca đã chọn' });
            }
        }

        const cleanList = Array.isArray(danh_sach_hs) ? danh_sach_hs : [];

        await DiemDanhDraft.upsert({
            ngay,
            loai_truc: loaiTrucNum,
            ma_phong_id,
            ma_gv_id: req.user.id,
            danh_sach_hs: cleanList,
            updated_at: new Date()
        });

        return res.json({
            ok: true,
            saved_at: new Date().toISOString(),
            count: cleanList.length,
            message: 'Đã đồng bộ dữ liệu nháp an toàn lên máy chủ'
        });
    } catch (err) {
        return res.status(500).json({ ok: false, error: err.message });
    }
});

/** GET /api/diemdanh/draft/ - Lấy bản nháp phục hồi khi GV tải lại trang hoặc đổi thiết bị */
router.get('/api/diemdanh/draft/', loginRequired, roleRequired('admin', 'hoc_vu', 'giao_vien'), async (req, res) => {
    try {
        const { ngay, loai_truc, ma_phong_id } = req.query;
        if (!ngay || loai_truc === undefined || !ma_phong_id) {
            return res.status(400).json({ ok: false, error: 'Thiếu thông tin ngày, ca hoặc mã phòng' });
        }

        const loaiTrucNum = Number(loai_truc);

        // Auto rescue chỉ chạy cho GV (Admin tự điểm danh tay)
        const isAdminOrHocVu2 = req.user.is_admin || req.user.is_superuser || req.user.role === 'hoc_vu' || req.user.role === 'admin';
        if (!isAdminOrHocVu2) {
            await checkAndAutoRescueRooms(ngay);
        }

        const draft = await DiemDanhDraft.findOne({
            where: { ngay, loai_truc: loaiTrucNum, ma_phong_id }
        });

        const phongStatus = await DiemDanhPhong.findOne({
            where: { ngay, loai_truc: loaiTrucNum, ma_phong_id }
        });

        return res.json({
            ok: true,
            draft: draft || null,
            phong_status: phongStatus || null
        });
    } catch (err) {
        return res.status(500).json({ ok: false, error: err.message });
    }
});

/** POST /api/diemdanh/chot-phong/ - Chốt dữ liệu điểm danh phòng lên Tổng (Dành riêng cho Admin / Học vụ) */
router.post('/api/diemdanh/chot-phong/', loginRequired, roleRequired('admin', 'hoc_vu'), async (req, res) => {
    try {
        const { ngay, loai_truc, ma_phong_id, danh_sach_hs, ghi_chu } = req.body;
        if (!ngay || loai_truc === undefined || !ma_phong_id) {
            return res.status(400).json({ ok: false, error: 'Thiếu dữ liệu yêu cầu' });
        }

        const loaiTrucNum = Number(loai_truc);
        const vn = getVietnamTime();

        // Nếu là giáo viên, kiểm tra khung giờ và phân công nhiệm vụ
        if (req.user.role === 'giao_vien') {
            const startMins = loaiTrucNum === 0 ? 655 : 690;
            const endMins = loaiTrucNum === 0 ? 690 : 720;
            const timeLabel = loaiTrucNum === 0 ? '10h55 - 11h30' : '11h30 - 12h00';

            // Chỉ cho phép điểm danh ngày hôm nay
            if (ngay !== vn.todayStr) {
                return res.status(400).json({ ok: false, error: 'Giáo viên chỉ có thể điểm danh trong ngày trực hôm nay.' });
            }

            if (vn.totalMins < startMins || vn.totalMins > endMins) {
                return res.status(400).json({
                    ok: false,
                    error: `Ngoài khung giờ điểm danh của ca (${timeLabel}). Hiện tại: ${vn.timeStr}.`
                });
            }

            let gvId = req.user.giao_vien_id;
            if (!gvId) {
                const gvObj = await GiaoVien.findOne({ where: { ho_ten: req.user.username } });
                if (gvObj) gvId = gvObj.id;
            }
            const pc = await PhanCongTrucGV.findOne({
                where: {
                    ngay,
                    loai_truc: loaiTrucNum,
                    ma_phong_id,
                    [Op.or]: [{ ma_gv_id: gvId }, { ma_gv_truc_thay_id: gvId }]
                }
            });
            if (!pc) {
                return res.status(403).json({ ok: false, error: 'Thầy/Cô không được phân công phòng này trong ca trực hôm nay.' });
            }
            if (loaiTrucNum === 0 && pc.nhiem_vu !== 0) {
                return res.status(403).json({ ok: false, error: 'Thầy/Cô được phân công Giám sát ca ăn, không có quyền chốt điểm danh.' });
            }
        }

        const fieldPhong = loaiTrucNum === 0 ? 'ma_phong_an_id' : 'ma_phong_ngu_id';
        const allStudents = await HocSinh.findAll({
            where: { [fieldPhong]: ma_phong_id, dang_hoc: true }
        });

        // Kiểm tra các bạn đã được báo Phép trước (bởi Admin)
        const existingDD = await DiemDanhHS.findAll({
            where: {
                ngay,
                ma_hs_id: { [Op.in]: allStudents.map(s => s.id) }
            }
        });
        const existingMap = {};
        existingDD.forEach(d => { existingMap[d.ma_hs_id] = d; });

        const scannedMap = {};
        if (Array.isArray(danh_sach_hs)) {
            danh_sach_hs.forEach(item => {
                scannedMap[item.id] = item;
            });
        }

        const fieldStatus = loaiTrucNum === 0 ? 'diem_danh_an' : 'diem_danh_ngu';
        const fieldPhuongThuc = loaiTrucNum === 0 ? 'phuong_thuc_an' : 'phuong_thuc_ngu';
        const fieldThoiGian = loaiTrucNum === 0 ? 'thoi_gian_diem_danh_an' : 'thoi_gian_diem_danh_ngu';
        const oppositeField = loaiTrucNum === 0 ? 'diem_danh_ngu' : 'diem_danh_an';

        const t = await sequelize.transaction();
        try {
            const recordsToSave = [];
            for (const hs of allStudents) {
                const cur = existingMap[hs.id];
                const scanned = scannedMap[hs.id];
                // Lấy trạng thái từ danh sách gửi lên, nếu không có thì giữ trạng thái hiện tại hoặc mặc định Có mặt (0)
                let finalStatus;
                if (scanned && scanned.status !== undefined && scanned.status !== null) {
                    const stNum = Number(scanned.status);
                    if (stNum === 0 || stNum === 1 || stNum === 2) {
                        finalStatus = stNum;
                    } else {
                        finalStatus = 1; // Chưa điểm danh thì ghi nhận VẮNG
                    }
                } else if (cur && cur[fieldStatus] !== null && cur[fieldStatus] !== undefined) {
                    finalStatus = cur[fieldStatus];
                } else {
                    finalStatus = 1; // Chưa điểm danh thì ghi nhận VẮNG
                }

                let phuongThuc = scanned?.phuong_thuc || (cur ? cur[fieldPhuongThuc] : 'thu_cong');
                let thoiGian = scanned?.scanned_at || new Date();

                recordsToSave.push({
                    ma_hs_id: hs.id,
                    ngay,
                    [fieldStatus]: finalStatus,
                    [fieldPhuongThuc]: phuongThuc,
                    [fieldThoiGian]: thoiGian,
                    [oppositeField]: cur ? cur[oppositeField] : null,
                    nguoi_diem_danh_id: req.user.id,
                    ghi_chu: scanned?.ghi_chu || (cur ? cur.ghi_chu : null)
                });
            }

            if (recordsToSave.length > 0) {
                await DiemDanhHS.bulkCreate(recordsToSave, {
                    updateOnDuplicate: [fieldStatus, fieldPhuongThuc, fieldThoiGian, 'nguoi_diem_danh_id', 'ghi_chu'],
                    transaction: t
                });
            }

            // Ghi nhận trạng thái chốt phòng
            await DiemDanhPhong.upsert({
                ma_phong_id,
                ngay,
                loai_truc: loaiTrucNum,
                da_diem_danh: true,
                thoi_gian: new Date(),
                trang_thai_chot: 'da_chot',
                ma_gv_chot_id: req.user.id,
                ghi_chu_chot: ghi_chu || 'Giáo viên chốt điểm danh thành công lên Tổng'
            }, { transaction: t });

            // Cập nhật trạng thái draft
            await DiemDanhDraft.upsert({
                ngay,
                loai_truc: loaiTrucNum,
                ma_phong_id,
                ma_gv_id: req.user.id,
                danh_sach_hs: Array.isArray(danh_sach_hs) ? danh_sach_hs : [],
                is_chot: true,
                updated_at: new Date()
            }, { transaction: t });

            await t.commit();

            let countCoMat = 0, countVang = 0, countPhep = 0;
            recordsToSave.forEach(r => {
                const s = r[fieldStatus];
                if (s === 0) countCoMat++;
                else if (s === 1) countVang++;
                else if (s === 2) countPhep++;
            });

            return res.json({
                ok: true,
                message: `Đã chốt danh sách phòng ${ma_phong_id} thành công (${countCoMat} có mặt, ${countVang} vắng, ${countPhep} phép).`,
                counts: { comat: countCoMat, vang: countVang, phep: countPhep }
            });
        } catch (err) {
            await t.rollback();
            throw err;
        }
    } catch (err) {
        return res.status(500).json({ ok: false, error: err.message });
    }
});

/** GET /api/baocao/tinh-hinh-chot-phong/ - Giám sát tiến độ chốt điểm danh theo phòng */
router.get('/api/baocao/tinh-hinh-chot-phong/', loginRequired, async (req, res) => {
    try {
        const { ngay, loai } = req.query;
        const vn = getVietnamTime();
        const targetNgay = ngay || vn.todayStr;
        const loaiTrucNum = (loai === 'ngu' || loai === '1') ? 1 : 0;

        // Auto rescue chỉ chạy cho GV (Admin tự điểm danh tay)
        const isAdminOrHocVu3 = req.user.is_admin || req.user.is_superuser || req.user.role === 'hoc_vu' || req.user.role === 'admin';
        if (!isAdminOrHocVu3) {
            await checkAndAutoRescueRooms(targetNgay);
        }

        // Lấy tất cả phân công của ca này
        const phanCongs = await PhanCongTrucGV.findAll({
            where: { ngay: targetNgay, loai_truc: loaiTrucNum },
            include: [
                { association: 'phong', attributes: ['ma_phong', 'loai_phong', 'gioi_tinh'] },
                { association: 'giao_vien', attributes: ['id', 'ho_ten', 'so_dien_thoai'] },
                { association: 'giao_vien_truc_thay', attributes: ['id', 'ho_ten', 'so_dien_thoai'] }
            ]
        });

        // Gom nhóm theo phòng
        const roomMap = {};
        phanCongs.forEach(pc => {
            if (!roomMap[pc.ma_phong_id]) {
                roomMap[pc.ma_phong_id] = {
                    ma_phong: pc.ma_phong_id,
                    phong: pc.phong,
                    giao_vien: [],
                };
            }
            const gvActive = pc.giao_vien_truc_thay || pc.giao_vien;
            roomMap[pc.ma_phong_id].giao_vien.push({
                id: gvActive?.id,
                ho_ten: gvActive?.ho_ten,
                so_dien_thoai: gvActive?.so_dien_thoai,
                nhiem_vu: pc.nhiem_vu, // 0=Điểm danh, 1=Giám sát
                is_truc_thay: Boolean(pc.giao_vien_truc_thay_id)
            });
        });

        const phongStatuses = await DiemDanhPhong.findAll({
            where: { ngay: targetNgay, loai_truc: loaiTrucNum },
            include: [{ association: 'phong', attributes: ['ma_phong'] }]
        });
        const statusMap = {};
        phongStatuses.forEach(ps => { statusMap[ps.ma_phong_id] = ps; });

        const drafts = await DiemDanhDraft.findAll({
            where: { ngay: targetNgay, loai_truc: loaiTrucNum }
        });
        const draftMap = {};
        drafts.forEach(dr => { draftMap[dr.ma_phong_id] = dr; });

        const fieldPhong = loaiTrucNum === 0 ? 'ma_phong_an_id' : 'ma_phong_ngu_id';
        const fieldStatus = loaiTrucNum === 0 ? 'diem_danh_an' : 'diem_danh_ngu';

        const result = [];
        for (const ma_phong of Object.keys(roomMap)) {
            const item = roomMap[ma_phong];
            const ps = statusMap[ma_phong];
            const dr = draftMap[ma_phong];

            const totalHs = await HocSinh.count({
                where: { [fieldPhong]: ma_phong, dang_hoc: true }
            });

            // Lấy kết quả thực tế trên DiemDanhHS nếu đã có
            const ddRecords = await DiemDanhHS.findAll({
                include: [{
                    association: 'hoc_sinh',
                    where: { [fieldPhong]: ma_phong, dang_hoc: true },
                    attributes: ['id']
                }],
                where: { ngay: targetNgay }
            });

            let comat = 0;
            let vang = 0;
            let phep = 0;
            ddRecords.forEach(r => {
                const st = r[fieldStatus];
                if (st === 0) comat++;
                else if (st === 1) vang++;
                else if (st === 2) phep++;
            });

            const draftCount = (dr && Array.isArray(dr.danh_sach_hs))
                ? dr.danh_sach_hs.filter(x => x.status === 0).length
                : 0;

            const isCompleted = ps?.trang_thai_chot === 'da_chot' || Boolean(ps?.da_diem_danh);

            result.push({
                ma_phong,
                phong: item.phong,
                giao_vien: item.giao_vien,
                total_hs: totalHs,
                is_completed: isCompleted,
                trang_thai_chot: isCompleted ? 'da_chot' : 'chua_chot',
                thoi_gian_chot: ps?.thoi_gian || null,
                ghi_chu_chot: ps?.ghi_chu_chot || null,
                draft_count: draftCount,
                stats: isCompleted ? { comat, vang, phep, chua_diem_danh: 0 } : null
            });
        }

        return res.json({
            ok: true,
            ngay: targetNgay,
            loai_truc: loaiTrucNum,
            current_time: vn.timeStr,
            rooms: result
        });
    } catch (err) {
        return res.status(500).json({ ok: false, error: err.message });
    }
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

        let gv_list = appCache.get('gv_active_list');
        let phong_list = appCache.get('phong_all_list');
        let cauhinh = appCache.get('cauhinh_hethong');

        const tasks = [
            PhanCongTrucGV.findAll({ where: { ngay: { [Op.between]: [tuan, cuoi] } }, order: [['ngay', 'ASC']] })
        ];

        if (!gv_list) {
            tasks.push(GiaoVien.findAll({ where: { dang_lam: true }, attributes: ['id', 'ho_ten', 'gioi_tinh', 'nhiem_vu', 'lich_ranh'] }).then(res => {
                const plain = res.map(r => r.toJSON());
                appCache.set('gv_active_list', plain);
                return plain;
            }));
        }
        if (!phong_list) {
            tasks.push(Phong.findAll({ attributes: ['ma_phong', 'loai_phong', 'gioi_tinh'] }).then(res => {
                const plain = res.map(r => r.toJSON());
                appCache.set('phong_all_list', plain);
                return plain;
            }));
        }
        if (!cauhinh) {
            tasks.push(CauHinhHeThong.findOrCreate({ where: { id: 1 }, defaults: { nam_hoc: '2026-2027', nguoi_phu_trach: 'Tạ Thị Diệu Lê', ten_truong: 'LÊ THỊ HỒNG GẤM' } }).then(([ch]) => {
                const plain = ch.toJSON();
                appCache.set('cauhinh_hethong', plain);
                return plain;
            }));
        }

        const results = await Promise.all(tasks);
        const records = results[0];

        return res.json({
            ok: true,
            records,
            tuan,
            gv_list: gv_list || appCache.get('gv_active_list') || [],
            phong_list: phong_list || appCache.get('phong_all_list') || [],
            nam_hoc: cauhinh?.nam_hoc || appCache.get('cauhinh_hethong')?.nam_hoc || '2026-2027',
            nguoi_phu_trach: cauhinh?.nguoi_phu_trach || appCache.get('cauhinh_hethong')?.nguoi_phu_trach || 'Tạ Thị Diệu Lê',
            ten_truong: cauhinh?.ten_truong || appCache.get('cauhinh_hethong')?.ten_truong || 'LÊ THỊ HỒNG GẤM'
        });
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
        const { id, ma_gv_id, ma_phong_id, ngay, loai_truc, xac_nhan_truc, ma_gv_truc_thay_id, nhiem_vu } = req.body;
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

        // 2. KIỂM TRA TRÙNG: 1 GV có thể trực nhiều phòng trong cùng ca/ngày.
        // Chỉ chặn nếu GV đã được thêm vào CHÍNH PHÒNG NÀY trong ca trực này.
        const alreadyInThisRoom = await PhanCongTrucGV.findOne({
            where: {
                ngay,
                loai_truc: parseInt(loai_truc),
                ma_phong_id,
                [Op.or]: [
                    { ma_gv_id: targetGvId, ma_gv_truc_thay_id: null },
                    { ma_gv_truc_thay_id: targetGvId }
                ],
                id: { [Op.ne]: id || 0 }
            }
        });
        if (alreadyInThisRoom) {
            return res.status(400).json({ ok: false, error: `Giáo viên ${targetGv.ho_ten} đã có trong danh sách phân công tại phòng ${ma_phong_id} trong ca trực này rồi.` });
        }

        const assignedNV = nhiem_vu !== undefined && nhiem_vu !== null ? parseInt(nhiem_vu) : (gv.nhiem_vu || 0);

        // RÀNG BUỘC TRỰC THAY
        if (ma_gv_truc_thay_id) {
            if (parseInt(ma_gv_truc_thay_id) === parseInt(ma_gv_id)) {
                return res.status(400).json({ ok: false, error: 'Giáo viên không thể trực thay cho chính mình' });
            }
        } else {
            // CHỈ KIỂM TRA GIỚI HẠN KHI THÊM MỚI (KHÔNG PHẢI TRỰC THAY)
            const slToiDa = assignedNV === 0 ? (phong.sl_diem_danh || 1) : (phong.sl_ho_tro || 1);
            const hienTai = await PhanCongTrucGV.count({
                where: { ma_phong_id, ngay, loai_truc: parseInt(loai_truc), nhiem_vu: assignedNV, id: { [Op.ne]: id || 0 } }
            });

            if (hienTai >= slToiDa) {
                return res.status(400).json({
                    ok: false,
                    error: `Phòng ${ma_phong_id} đã đủ số lượng giáo viên ${assignedNV === 0 ? 'điểm danh' : 'giám sát'} (Tối đa: ${slToiDa})`
                });
            }
        }
        const data = {
            ma_gv_id, ma_phong_id, ngay,
            loai_truc: parseInt(loai_truc),
            nhiem_vu: assignedNV,
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

/** POST /api/lichtruc_khung/copy-day/ - Sao chép phân công từ một thứ sang các thứ khác */
router.post('/api/lichtruc_khung/copy-day/', loginRequired, roleRequired('admin', 'quan_ly'), async (req, res) => {
    try {
        const { fromThu = 0, toThus = [1, 2, 3] } = req.body;
        if (typeof fromThu !== 'number' || !Array.isArray(toThus) || toThus.length === 0) {
            return res.status(400).json({ ok: false, error: 'Tham số không hợp lệ' });
        }

        const sourceRecords = await LichTrucCoDinh.findAll({
            where: { thu: fromThu },
        });

        if (sourceRecords.length === 0) {
            const thuNames = ['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6'];
            return res.status(400).json({ ok: false, error: `Không có dữ liệu phân công nào ở ${thuNames[fromThu] || 'Thứ ' + (fromThu + 2)} để sao chép` });
        }

        const t = await sequelize.transaction();
        try {
            // Xóa các bản ghi ở các thứ đích
            await LichTrucCoDinh.destroy({
                where: { thu: { [Op.in]: toThus } },
                transaction: t,
            });

            // Tạo các bản ghi mới
            const newRecords = [];
            for (const targetThu of toThus) {
                for (const src of sourceRecords) {
                    newRecords.push({
                        ma_phong_id: src.ma_phong_id,
                        ma_gv_id: src.ma_gv_id,
                        thu: targetThu,
                        nhiem_vu: src.nhiem_vu,
                    });
                }
            }

            await LichTrucCoDinh.bulkCreate(newRecords, { transaction: t });
            await t.commit();

            const thuNames = ['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6'];
            return res.json({
                ok: true,
                message: `Đã sao chép thành công ${sourceRecords.length} phân công từ ${thuNames[fromThu] || 'T' + (fromThu + 2)} sang ${toThus.map(th => thuNames[th] || 'T' + (th + 2)).join(', ')} (${newRecords.length} lượt phân công).`,
                copiedCount: newRecords.length,
            });
        } catch (e) {
            await t.rollback();
            throw e;
        }
    } catch (err) {
        return res.status(500).json({ ok: false, error: err.message });
    }
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
            const gvAll = await GiaoVien.findAll({ where: { dang_lam: true }, transaction: t });

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
        const { tuan, force = true } = req.body;
        const monday = getMondayOfWeek(tuan);
        const nguoi_cap_nhat_id = req.session?.user?.id || null;
        const now = new Date();
        const t = await sequelize.transaction();
        let inserted = 0, skipped = 0;
        try {
            // Nếu ghi đè (mặc định), xóa sạch lịch cũ của tuần đó từ Thứ 2 đến Thứ 5 (Thứ 6 không bị ảnh hưởng)
            if (force) {
                const thursday = addDays(monday, 3);
                await PhanCongTrucGV.destroy({
                    where: { ngay: { [Op.between]: [monday, thursday] } },
                    transaction: t,
                });
                // Xóa cờ is_nghi nếu có trong khoảng T2-T5
                await CauHinhNgay.destroy({ where: { ngay: { [Op.between]: [monday, thursday] }, is_nghi: true }, transaction: t });
            }

            // Chỉ nạp Thứ 2 -> Thứ 5 (i = 0..3). Thứ 6 là ngày dạy bù / nghỉ, Admin tự thêm khi cần.
            for (let i = 0; i < 4; i++) {
                const ngay = addDays(monday, i);
                const khung = await LichTrucCoDinh.findAll({
                    where: { thu: i },
                    include: [{ association: 'phong', attributes: ['ma_phong', 'loai_phong'] }],
                    transaction: t,
                });
                for (const k of khung) {
                    const loai_truc = k.phong.loai_phong;

                    // Nếu không ghi đè, chỉ điền vào nếu phòng này chưa có giáo viên nào trực trong buổi đó
                    if (!force) {
                        const countInRoom = await PhanCongTrucGV.count({
                            where: { ngay, loai_truc, ma_phong_id: k.ma_phong_id },
                            transaction: t,
                        });
                        if (countInRoom > 0) {
                            skipped++;
                            continue;
                        }
                    }

                    await PhanCongTrucGV.create({
                        ma_gv_id: k.ma_gv_id,
                        ma_phong_id: k.ma_phong_id,
                        ngay, loai_truc,
                        nhiem_vu: k.nhiem_vu ?? 0,
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
                message: `Đồng bộ thành công tuần ${monday}. Đã nạp: ${inserted} lượt trực${skipped ? `, bỏ qua: ${skipped}` : ''}.`,
                inserted, skipped, tuan: monday,
            });
        } catch (e) { await t.rollback(); throw e; }
    } catch (err) { return res.status(500).json({ ok: false, error: err.message }); }
});

/** POST /api/lichtruc/apply-day-bu/ - Nạp lịch 1 ngày cố định vào 1 ngày thực tế (Dạy bù) */
router.post('/api/lichtruc/apply-day-bu/', loginRequired, roleRequired('admin', 'quan_ly'), async (req, res) => {
    try {
        const { targetDate, sourceThu, force = true } = req.body; // sourceThu: 0=T2, ..., 4=T6
        if (!targetDate || sourceThu === undefined) return res.status(400).json({ ok: false, error: 'Thiếu thông tin ngày' });

        const nguoi_cap_nhat_id = req.session?.user?.id || null;
        const now = new Date();
        const t = await sequelize.transaction();
        let inserted = 0, skipped = 0;

        try {
            // Bỏ cờ is_nghi nếu ngày này đang bị đánh dấu nghỉ
            await CauHinhNgay.destroy({ where: { ngay: targetDate, is_nghi: true }, transaction: t });

            if (force) {
                await PhanCongTrucGV.destroy({ where: { ngay: targetDate }, transaction: t });
            }

            const khung = await LichTrucCoDinh.findAll({
                where: { thu: sourceThu },
                include: [{ association: 'phong', attributes: ['ma_phong', 'loai_phong'] }],
                transaction: t,
            });

            for (const k of khung) {
                const loai_truc = k.phong.loai_phong;
                if (!force) {
                    const countInRoom = await PhanCongTrucGV.count({
                        where: { ngay: targetDate, loai_truc, ma_phong_id: k.ma_phong_id },
                        transaction: t,
                    });
                    if (countInRoom > 0) {
                        skipped++;
                        continue;
                    }
                }

                await PhanCongTrucGV.create({
                    ma_gv_id: k.ma_gv_id,
                    ma_phong_id: k.ma_phong_id,
                    ngay: targetDate,
                    loai_truc,
                    nhiem_vu: k.nhiem_vu ?? 0,
                    xac_nhan_truc: true,
                    ngay_cap_nhat: now,
                    nguoi_cap_nhat_id,
                }, { transaction: t });
                inserted++;
            }

            await t.commit();
            return res.json({ ok: true, message: `Đã nạp lịch Thứ ${sourceThu + 2} vào ngày ${targetDate}. Đã nạp: ${inserted} lượt trực${skipped ? `, bỏ qua: ${skipped}` : ''}.` });
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

        // 3. Lấy danh sách học sinh kèm phòng ăn (đang học HOẶC rút từ trong/sau tháng này)
        const hsList = await HocSinh.findAll({
            where: {
                [Op.and]: [
                    {
                        [Op.or]: [
                            { dang_hoc: true },
                            { ngay_rut: { [Op.gte]: start } },
                        ]
                    },
                    {
                        [Op.or]: [
                            { ngay_vao: null },
                            { ngay_vao: { [Op.lte]: end } },
                        ]
                    }
                ]
            },
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
                ngay_vao: hs.ngay_vao,
                ngay_rut: hs.ngay_rut,
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
            defaults: { nam_hoc: '2026-2027', nguoi_phu_trach: 'Người phụ trách' }
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

        // 3. Học sinh kèm phòng ngủ (đang học HOẶC rút từ trong/sau tháng này)
        const hsList = await HocSinh.findAll({
            where: {
                [Op.and]: [
                    {
                        [Op.or]: [
                            { dang_hoc: true },
                            { ngay_rut: { [Op.gte]: start } },
                        ]
                    },
                    {
                        [Op.or]: [
                            { ngay_vao: null },
                            { ngay_vao: { [Op.lte]: end } },
                        ]
                    }
                ]
            },
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
                phong_ngu: maPhong,
                ngay_vao: hs.ngay_vao,
                ngay_rut: hs.ngay_rut,
                diemdanh,
                so_ngay_co_mat: Object.values(diemdanh).filter(v => v === 0).length,
                so_ngay_vang: Object.values(diemdanh).filter(v => v === 1).length,
                so_ngay_phep: Object.values(diemdanh).filter(v => v === 2).length,
                da_diemdanh: hasAny,
            });
        });

        // 6. Cấu hình hệ thống
        const [cauhinh] = await CauHinhHeThong.findOrCreate({
            where: { id: 1 },
            defaults: { nam_hoc: '2026-2027', nguoi_phu_trach: 'Người phụ trách' }
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

/**
 * GET /api/baocao/tong-hop-lop/?thang=MM&nam=YYYY&lop=10A1
 * Tổng hợp chuyên cần và tính tiền ăn/ngủ theo từng HS, gom theo lớp
 * Lấy cả học sinh rút bán trú trong tháng để tính tiền chính xác
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

        // 2. Danh sách HS (đang học HOẶC rút từ trong/sau tháng này, và vào trước/trong tháng này)
        const hsWhere = {
            [Op.and]: [
                {
                    [Op.or]: [
                        { dang_hoc: true },
                        { ngay_rut: { [Op.gte]: start } },
                    ]
                },
                {
                    [Op.or]: [
                        { ngay_vao: null },
                        { ngay_vao: { [Op.lte]: end } },
                    ]
                }
            ]
        };
        if (lop) hsWhere.lop = lop;
        const hsList = await HocSinh.findAll({
            where: hsWhere,
            attributes: ['id', 'ho_ten', 'lop', 'gioi_tinh', 'dang_hoc', 'ngay_vao', 'ngay_rut'],
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
            // Số ngày HS phải tham gia: nằm trong khoảng [hs.ngay_vao, hs.ngay_rut] VÀ được phép theo ngày đặc biệt
            const phaiAn = ngayAn.filter(ngay => {
                if (hs.ngay_vao && ngay < hs.ngay_vao) return false;
                if (hs.ngay_rut && ngay > hs.ngay_rut) return false;
                return isHsAllowed(hs, cauhinhNgayMap[ngay] || null);
            });
            const phaiNgu = ngayNgu.filter(ngay => {
                if (hs.ngay_vao && ngay < hs.ngay_vao) return false;
                if (hs.ngay_rut && ngay > hs.ngay_rut) return false;
                return isHsAllowed(hs, cauhinhNgayMap[ngay] || null);
            });

            const vangAn = phaiAn.filter(ng => recs[ng]?.an === 1).length;
            const phepAn = phaiAn.filter(ng => recs[ng]?.an === 2).length;
            const coMatAn = phaiAn.length - vangAn - phepAn; // Thực tế là những buổi có mặt (kể cả chưa chốt điểm danh)

            const vangNgu = phaiNgu.filter(ng => recs[ng]?.ngu === 1).length;
            const phepNgu = phaiNgu.filter(ng => recs[ng]?.ngu === 2).length;
            const coMatNgu = phaiNgu.length - vangNgu - phepNgu;

            const buoiAnThucTe = coMatAn;
            const buoiNguThucTe = coMatNgu;
            const tienAn = (phaiAn.length - phepAn) * giaAn; // Vắng không trừ tiền, chỉ phép mới trừ
            const tienNgu = (phaiNgu.length - phepNgu) * giaNgu;

            // Ghi chú thời gian vào / rút bán trú
            const ghiChuParts = [];
            if (hs.ngay_vao && hs.ngay_vao >= start && hs.ngay_vao <= end) {
                const [vy, vm, vd] = hs.ngay_vao.split('-');
                ghiChuParts.push(`Vào ${vd}/${vm}`);
            }
            if (hs.ngay_rut && hs.ngay_rut >= start && hs.ngay_rut <= end) {
                const [ry, rm, rd] = hs.ngay_rut.split('-');
                ghiChuParts.push(`Rút ${rd}/${rm}`);
            } else if (!hs.dang_hoc && hs.ngay_rut) {
                const [ry, rm, rd] = hs.ngay_rut.split('-');
                ghiChuParts.push(`Rút ${rd}/${rm}`);
            }

            return {
                id: hs.id,
                ho_ten: hs.ho_ten,
                lop: hs.lop,
                gioi_tinh: hs.gioi_tinh,
                dang_hoc: hs.dang_hoc,
                ngay_vao: hs.ngay_vao,
                ngay_rut: hs.ngay_rut,
                ghi_chu: ghiChuParts.join(', '),
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
            defaults: { nam_hoc: '2026-2027', nguoi_phu_trach: 'Người phụ trách' }
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

/** GET /api/baocao/luong-gv/?tu_ngay=&den_ngay=&thang=&nam= */
router.get('/api/baocao/luong-gv/', loginRequired, async (req, res) => {
    try {
        let start, end;
        if (req.query.tu_ngay && req.query.den_ngay) {
            start = req.query.tu_ngay;
            end = req.query.den_ngay;
        } else {
            const year = req.query.nam || new Date().getFullYear();
            const month = req.query.thang || (new Date().getMonth() + 1);
            start = `${year}-${String(month).padStart(2, '0')}-01`;
            end = new Date(parseInt(year), parseInt(month), 0).toISOString().split('T')[0];
        }

        const phanCong = await PhanCongTrucGV.findAll({
            where: { ngay: { [Op.between]: [start, end] } },
            include: [{ association: 'giao_vien', attributes: ['id', 'ho_ten'] }],
        });

        const giaAn = await CauHinhGia.findOne({ where: { loai_truc: 0, ngay_ap_dung: { [Op.lte]: end } }, order: [['ngay_ap_dung', 'DESC']] });
        const giaNgu = await CauHinhGia.findOne({ where: { loai_truc: 1, ngay_ap_dung: { [Op.lte]: end } }, order: [['ngay_ap_dung', 'DESC']] });

        const don_gia_an = giaAn ? parseFloat(giaAn.don_gia) : 0;
        const don_gia_ngu = giaNgu ? parseFloat(giaNgu.don_gia) : 0;

        // Đếm lượt trực DISTINCT theo (gv, ngày, ca) – 1 GV trực nhiều phòng cùng ca/ngày chỉ tính 1 lượt
        const gvMap = {};
        const seenShift = new Set();
        phanCong.forEach(pc => {
            const id = pc.ma_gv_id;
            if (!gvMap[id]) gvMap[id] = {
                id,
                ho_ten: pc.giao_vien?.ho_ten || '',
                so_ca_an: 0,
                so_ca_ngu: 0,
                tong_tien: 0,
                ngay_an: [],
                ngay_ngu: []
            };

            const shiftKey = `${id}_${pc.ngay}_${pc.loai_truc}`;
            if (seenShift.has(shiftKey)) return; // Đã tính lượt này rồi, bỏ qua (GV trực nhiều phòng)
            seenShift.add(shiftKey);

            if (pc.loai_truc === 0) {
                gvMap[id].so_ca_an++;
                gvMap[id].tong_tien += don_gia_an;
                gvMap[id].ngay_an.push(pc.ngay);
            } else {
                gvMap[id].so_ca_ngu++;
                gvMap[id].tong_tien += don_gia_ngu;
                gvMap[id].ngay_ngu.push(pc.ngay);
            }
        });
        const quanLy = await StaffUser.findOne({ where: { role: 'quan_ly', is_active: true } });
        const keToan = await StaffUser.findOne({ where: { role: 'ke_toan', is_active: true } });

        return res.json({
            ok: true,
            data: Object.values(gvMap),
            don_gia_an,
            don_gia_ngu,
            quan_ly_name: quanLy ? (quanLy.fullname || quanLy.username) : '',
            ke_toan_name: keToan ? (keToan.fullname || keToan.username) : ''
        });
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

// ══════════════════════════════════════════════
// BÁO CÁO TRỰC GV TỪ GOOGLE FORM / WEBHOOK
// ══════════════════════════════════════════════

/** Helper parse ngày chuẩn YYYY-MM-DD */
function getVietnamTodayYMD() {
    return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });
}

/** Helper trích xuất giá trị đầu tiên khác rỗng từ danh sách đối số hoặc mảng */
function pickFirstNonEmpty(...candidates) {
    for (const c of candidates) {
        if (Array.isArray(c)) {
            for (const item of c) {
                if (item !== null && item !== undefined && String(item).trim() !== '') {
                    return String(item).trim();
                }
            }
        } else if (c !== null && c !== undefined && String(c).trim() !== '') {
            return String(c).trim();
        }
    }
    return '';
}

/**
 * Trích xuất ngày chuẩn YYYY-MM-DD và thời điểm nộp submittedAt từ chuỗi ngày / timestamp
 * Hỗ trợ các định dạng:
 * - DD/MM/YYYY HH:mm:ss (Ví dụ: "06/09/2026 21:46:16")
 * - DD/MM/YYYY
 * - YYYY-MM-DD
 * - ISO string
 */
function parseVNSubmissionDate(input) {
    if (!input) return { ngay: getVietnamTodayYMD(), submittedAt: new Date() };
    if (input instanceof Date && !isNaN(input.getTime())) {
        return {
            ngay: input.toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }),
            submittedAt: input
        };
    }
    const str = String(input).trim();
    if (!str) return { ngay: getVietnamTodayYMD(), submittedAt: new Date() };

    const pad = (n) => String(n).padStart(2, '0');

    // 1. Khớp dạng DD/MM/YYYY hoặc DD/MM/YYYY HH:mm:ss hoặc D/M/YYYY H:m:s
    const dmyMatch = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[T\s](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);
    if (dmyMatch) {
        const [, d, m, y, h, min, s] = dmyMatch;
        const ngay = `${y}-${pad(m)}-${pad(d)}`;
        const hour = h !== undefined ? pad(h) : '12';
        const minute = min !== undefined ? pad(min) : '00';
        const second = s !== undefined ? pad(s) : '00';
        const isoString = `${ngay}T${hour}:${minute}:${second}+07:00`;
        const submittedAt = new Date(isoString);
        return {
            ngay,
            submittedAt: !isNaN(submittedAt.getTime()) ? submittedAt : new Date()
        };
    }

    // 2. Khớp dạng YYYY-MM-DD HH:mm:ss hoặc YYYY-MM-DDTHH:mm:ss (có hoặc không có timezone)
    const ymdMatch = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?(?:\.\d+)?(Z|[+-]\d{2}:?\d{2})?$/i);
    if (ymdMatch) {
        const [, y, m, d, h, min, s, tz] = ymdMatch;
        const ngay = `${y}-${pad(m)}-${pad(d)}`;
        // Nếu đã có múi giờ tường minh (Z hoặc +07:00)
        if (tz) {
            const parsed = new Date(str);
            if (!isNaN(parsed.getTime())) {
                const vnNgay = parsed.toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });
                return { ngay: vnNgay, submittedAt: parsed };
            }
        }
        // Nếu không có múi giờ tường minh (giờ VN cục bộ do Google Form/Sheets gửi) -> Luôn gắn +07:00
        const hour = h !== undefined ? pad(h) : '12';
        const minute = min !== undefined ? pad(min) : '00';
        const second = s !== undefined ? pad(s) : '00';
        const isoString = `${ngay}T${hour}:${minute}:${second}+07:00`;
        const submittedAt = new Date(isoString);
        return {
            ngay,
            submittedAt: !isNaN(submittedAt.getTime()) ? submittedAt : new Date()
        };
    }

    const parsed = new Date(str);
    if (!isNaN(parsed.getTime())) {
        return {
            ngay: parsed.toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }),
            submittedAt: parsed
        };
    }
    return { ngay: getVietnamTodayYMD(), submittedAt: new Date() };
}

function normalizeDateStr(input) {
    return parseVNSubmissionDate(input).ngay;
}

/** Helper parse ca trực (0=Ăn trưa, 1=Nghỉ trưa) */
function normalizeCaTruc(input) {
    if (input === 0 || input === '0') return 0;
    if (input === 1 || input === 1 || input === '1') return 1;
    const str = String(input || '').toLowerCase();
    if (str.includes('ngủ') || str.includes('nghi') || str.includes('nghỉ')) return 1;
    return 0; // Mặc định là Ăn
}

/**
 * POST /api/webhook/google-form-baocao
 * Nhận báo cáo tình hình trực của GV qua Google Apps Script Webhook
 * Hỗ trợ cả 2 nhánh Trực ăn & Trực ngủ (cột 3..7 hoặc cột 8..12) từ Google Form / Google Sheets
 */
router.post('/api/webhook/google-form-baocao', async (req, res) => {
    try {
        const token = req.query.token || req.headers['x-webhook-secret'] || req.body.token || req.body.secret_key;
        const validSecret = process.env.SESSION_SECRET || 'bantru-lthg-secret-key-2025';

        if (token && token !== validSecret && token !== 'bantru-webhook-2026') {
            return res.status(403).json({ ok: false, error: 'Mã xác thực Webhook không hợp lệ' });
        }

        // 1. Kiểm tra nếu payload được gửi dưới dạng mảng (Array / Row từ Google Sheets)
        let bodyObj = req.body || {};
        const rawArray = Array.isArray(req.body)
            ? req.body
            : (Array.isArray(req.body?.values)
                ? req.body.values
                : (Array.isArray(req.body?.row) ? req.body.row : null));

        if (rawArray && rawArray.length >= 4) {
            // Thứ tự cột theo Sheet mới của User (13 cột):
            // 0: Dấu thời gian | 1: Ca trực
            // Ca ăn: 2: Họ và tên giáo viên | 3: Phòng ăn | 4: Tình hình chung | 5: Sỉ số | 6: Ghi chú/Góp ý
            // Ca ngủ: 7: Họ và tên | 8: Phòng ngủ | 9: Sỉ số | 10: Tình hình chung | 11: Ghi nhận HS vi phạm nề nếp (Nếu có) | 12: Ghi chú/Góp ý
            const rawCa = rawArray[1] || '';
            const isCaNgu = String(rawCa).toLowerCase().includes('ngủ') ||
                            String(rawCa).toLowerCase().includes('nghi') ||
                            (Boolean(rawArray[8]) && !rawArray[3]);

            const isNew13ColSheet = rawArray.length >= 13 ||
                (!isNaN(parseInt(rawArray[5], 10)) && String(rawArray[5]).trim() !== '') ||
                (Boolean(rawArray[9]) && !isNaN(parseInt(rawArray[9], 10)));

            if (isNew13ColSheet) {
                bodyObj = {
                    timestamp: rawArray[0],
                    ca_truc: isCaNgu ? 'Trực ngủ' : 'Trực ăn',
                    ho_ten_gv: isCaNgu ? (rawArray[7] || '') : (rawArray[2] || ''),
                    ma_phong: isCaNgu ? (rawArray[8] || '') : (rawArray[3] || ''),
                    si_so: isCaNgu ? (rawArray[9] || '') : (rawArray[5] || ''),
                    tinh_hinh: isCaNgu ? (rawArray[10] || 'Tốt') : (rawArray[4] || 'Tốt'),
                    hs_vi_pham: isCaNgu ? (rawArray[11] || '') : '',
                    ghi_chu: isCaNgu ? (rawArray[12] || '') : (rawArray[6] || ''),
                    nguon: 'google_sheet_row'
                };
            } else {
                bodyObj = {
                    timestamp: rawArray[0],
                    ca_truc: isCaNgu ? 'Trực ngủ' : 'Trực ăn',
                    ho_ten_gv: isCaNgu ? (rawArray[7] || '') : (rawArray[2] || ''),
                    ma_phong: isCaNgu ? (rawArray[8] || '') : (rawArray[3] || ''),
                    tinh_hinh: isCaNgu ? (rawArray[9] || 'Tốt') : (rawArray[4] || 'Tốt'),
                    hs_vi_pham: isCaNgu ? (rawArray[10] || '') : (rawArray[5] || ''),
                    ghi_chu: isCaNgu ? (rawArray[11] || '') : (rawArray[6] || ''),
                    nguon: 'google_sheet_row'
                };
            }
        }

        // 2. Trích xuất Ca trực
        let ca_truc_raw = pickFirstNonEmpty(
            bodyObj.ca_truc,
            bodyObj['Ca trực'],
            bodyObj['ca'],
            bodyObj['1. Ca trực']
        );
        // Tự động suy luận Ca trực nếu chưa có nhưng có câu hỏi phòng ăn / phòng ngủ
        if (!ca_truc_raw) {
            if (pickFirstNonEmpty(bodyObj['Phòng ngủ'], bodyObj.phong_ngu)) {
                ca_truc_raw = 'Trực ngủ';
            } else if (pickFirstNonEmpty(bodyObj['Phòng ăn'], bodyObj.phong_an)) {
                ca_truc_raw = 'Trực ăn';
            }
        }
        const caChuan = normalizeCaTruc(ca_truc_raw);

        // 3. Trích xuất Mã phòng (Phòng ăn hoặc Phòng ngủ)
        let ma_phong_raw = '';
        if (caChuan === 1) {
            ma_phong_raw = pickFirstNonEmpty(
                bodyObj['Phòng ngủ'],
                bodyObj.phong_ngu,
                bodyObj.ma_phong,
                bodyObj.phong,
                bodyObj['2. Mã phòng trực'],
                bodyObj['Phòng'],
                bodyObj['Phòng ăn'],
                bodyObj.phong_an
            );
        } else {
            ma_phong_raw = pickFirstNonEmpty(
                bodyObj['Phòng ăn'],
                bodyObj.phong_an,
                bodyObj.ma_phong,
                bodyObj.phong,
                bodyObj['2. Mã phòng trực'],
                bodyObj['Phòng'],
                bodyObj['Phòng ngủ'],
                bodyObj.phong_ngu
            );
        }

        // 4. Trích xuất Họ tên Giáo viên
        // Ca ăn dùng "Họ và tên giáo viên", Ca ngủ dùng "Họ và tên"
        let ho_ten_gv_raw = '';
        if (caChuan === 1) {
            ho_ten_gv_raw = pickFirstNonEmpty(
                bodyObj['Họ và tên'],
                bodyObj['Họ tên'],
                bodyObj['Họ và tên giáo viên'],
                bodyObj.ho_ten_gv,
                bodyObj.ho_ten,
                bodyObj.ten_gv,
                bodyObj['3. Họ và tên Giáo viên trực'],
                bodyObj['Giáo viên trực']
            );
        } else {
            ho_ten_gv_raw = pickFirstNonEmpty(
                bodyObj['Họ và tên giáo viên'],
                bodyObj['Họ và tên'],
                bodyObj['Họ tên'],
                bodyObj.ho_ten_gv,
                bodyObj.ho_ten,
                bodyObj.ten_gv,
                bodyObj['3. Họ và tên Giáo viên trực'],
                bodyObj['Giáo viên trực']
            );
        }

        if (!ma_phong_raw || !ho_ten_gv_raw) {
            return res.status(400).json({
                ok: false,
                error: 'Thiếu thông tin bắt buộc: ma_phong (Phòng ăn / Phòng ngủ) hoặc ho_ten_gv (Họ và tên giáo viên)',
                received: {
                    ca_truc: ca_truc_raw,
                    ma_phong: ma_phong_raw,
                    ho_ten_gv: ho_ten_gv_raw,
                }
            });
        }

        // 5. Trích xuất Tình hình chung
        const tinh_hinh_raw = pickFirstNonEmpty(
            bodyObj.tinh_hinh,
            bodyObj['Tình hình chung'],
            bodyObj['Tình hình nề nếp chung'],
            bodyObj['5. Tình hình nề nếp chung'],
            bodyObj['Tình hình']
        ) || 'Bình thường';

        // 6. Trích xuất Sỉ số phòng (hỗ trợ nhiều mẫu câu hỏi trên Google Form)
        let si_so_raw = pickFirstNonEmpty(
            bodyObj.si_so,
            bodyObj['Sỉ số'],
            bodyObj['Sĩ số'],
            bodyObj['sỉ số'],
            bodyObj['sĩ số'],
            bodyObj['4. Sỉ số'],
            bodyObj['3. Sỉ số'],
            bodyObj['4. Sĩ số'],
            bodyObj['3. Sĩ số'],
            bodyObj['Số lượng'],
            bodyObj['Sĩ số phòng'],
            bodyObj['Sỉ số phòng'],
            bodyObj['Số lượng học sinh'],
            bodyObj['Sĩ số có mặt']
        );
        if (!si_so_raw && typeof bodyObj === 'object') {
            const siSoKey = Object.keys(bodyObj).find(k => {
                const lk = k.toLowerCase();
                return lk.includes('sỉ') || lk.includes('sĩ') || lk.includes('si_so');
            });
            if (siSoKey) si_so_raw = bodyObj[siSoKey];
        }

        // Tự động tính Sĩ số theo số học sinh được phân vào phòng nếu form bỏ trống
        if (!si_so_raw && ma_phong_raw) {
            try {
                const parts = String(ma_phong_raw).split(/[,;\-\/]+/).map(s => s.trim().toUpperCase()).filter(Boolean);
                const colField = caChuan === 1 ? 'ma_phong_ngu_id' : 'ma_phong_an_id';
                const countHs = await HocSinh.count({ where: { [colField]: parts } });
                if (countHs > 0) {
                    si_so_raw = String(countHs);
                } else {
                    const pMatch = await Phong.findOne({ where: { ma_phong: parts[0], loai_phong: caChuan } });
                    if (pMatch && pMatch.suc_chua) si_so_raw = String(pMatch.suc_chua);
                }
            } catch (errCount) {
                console.warn('Lỗi tự động tính sĩ số phòng webhook:', errCount.message);
            }
        }

        // 7. Trích xuất Ghi nhận HS vi phạm (hỗ trợ cả nề nếp và nền nếp, có (Nếu có))
        const viPhamContent = pickFirstNonEmpty(
            bodyObj.hs_vi_pham,
            bodyObj.hs_bat_thuong,
            bodyObj['Ghi nhận HS vi phạm nề nếp (Nếu có)'],
            bodyObj['Ghi nhận HS vi phạm nề nếp'],
            bodyObj['Ghi nhận HS vi phạm nền nếp'],
            bodyObj['Ghi nhận HS vi phạm nền nếp (Nếu có)'],
            bodyObj['Học sinh bất thường / Quậy phá / Sự cố (nếu có)'],
            bodyObj['4. Học sinh bất thường / Quậy phá / Sự cố (nếu có)'],
            bodyObj['Học sinh vi phạm'],
            bodyObj['HS vi phạm'],
            bodyObj.danh_sach_vi_pham,
            bodyObj.hs_quay_pha,
            bodyObj.danh_sach_quay_pha
        );

        // 8. Trích xuất Ghi chú / Góp ý / Đề xuất CSVC
        const ghiChuContent = pickFirstNonEmpty(
            bodyObj.ghi_chu,
            bodyObj['Ghi chú/Góp ý'],
            bodyObj['Ghi chú / Góp ý'],
            bodyObj['Ghi chú'],
            bodyObj['Góp ý'],
            bodyObj['6. Ghi chú / Đề xuất cơ sở vật chất'],
            bodyObj['Ghi chú / Đề xuất cơ sở vật chất']
        );

        // 9. Trích xuất Ngày & Giờ nộp (Dấu thời gian)
        const timeInput = pickFirstNonEmpty(
            bodyObj.thoi_gian_nop,
            bodyObj.timestamp,
            bodyObj.ngay,
            bodyObj['Dấu thời gian'],
            bodyObj['Timestamp'],
            bodyObj['Thời gian']
        );
        const { ngay: ngayChuan, submittedAt } = parseVNSubmissionDate(timeInput);

        const vangNum = parseInt(bodyObj.so_hs_vang, 10) || 0;
        const maNhap = String(bodyObj.ma_xac_thuc || bodyObj.sdt_xac_nhan || '').trim().toUpperCase();

        let isHopLe = true;
        let matchedTeacher = null;
        let hoTenChuan = String(ho_ten_gv_raw).trim();

        if (maNhap) {
            matchedTeacher = await GiaoVien.findOne({
                where: { ma_bao_mat: maNhap }
            });
            if (matchedTeacher) {
                hoTenChuan = matchedTeacher.ho_ten;
            }
        }

        const record = await BaoCaoTruc.create({
            ngay: ngayChuan,
            ca_truc: caChuan,
            ma_phong: String(ma_phong_raw).trim().toUpperCase(),
            ho_ten_gv: hoTenChuan || (matchedTeacher ? matchedTeacher.ho_ten : 'Giáo viên trực'),
            ma_xac_thuc: maNhap || null,
            sdt_xac_nhan: bodyObj.sdt_xac_nhan ? String(bodyObj.sdt_xac_nhan).trim() : null,
            is_hop_le: isHopLe,
            si_so: si_so_raw ? String(si_so_raw).trim() : null,
            so_hs_vang: Math.max(0, vangNum),
            danh_sach_vang: String(bodyObj.danh_sach_vang || '').trim(),
            hs_vi_pham: viPhamContent,
            tinh_hinh: tinh_hinh_raw,
            ghi_chu: ghiChuContent,
            nguon: bodyObj.nguon || (rawArray ? 'google_sheet' : 'google_form'),
            created_at: !isNaN(submittedAt.getTime()) ? submittedAt : new Date(),
        });

        return res.json({
            ok: true,
            message: 'Đã nhận báo cáo ca trực thành công',
            id: record.id,
            is_hop_le: isHopLe,
            data: {
                ngay: record.ngay,
                ca_truc: record.ca_truc === 0 ? 'Ăn trưa' : 'Nghỉ trưa',
                ma_phong: record.ma_phong,
                ho_ten_gv: record.ho_ten_gv,
                si_so: record.si_so,
                tinh_hinh: record.tinh_hinh,
                hs_vi_pham: record.hs_vi_pham,
                ghi_chu: record.ghi_chu,
                created_at: record.created_at,
            },
        });
    } catch (err) {
        console.error('Lỗi Webhook Báo Cáo GV:', err);
        return res.status(500).json({ ok: false, error: err.message });
    }
});

/**
 * GET /api/baocaotruc/
 * Lấy danh sách báo cáo trực GV theo Ngày / Tuần / Tháng (Admin, Quản lý, Học vụ)
 */
router.get('/api/baocaotruc/', loginRequired, async (req, res) => {
    try {
        const { mode, ca_truc } = req.query;
        let start, end;

        if (mode === 'month') {
            const year = parseInt(req.query.nam, 10) || new Date().getFullYear();
            const month = parseInt(req.query.thang, 10) || (new Date().getMonth() + 1);
            const lastDay = new Date(year, month, 0).getDate();
            start = `${year}-${String(month).padStart(2, '0')}-01`;
            end = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
        } else if (mode === 'week') {
            if (req.query.tu_ngay && req.query.den_ngay) {
                start = req.query.tu_ngay;
                end = req.query.den_ngay;
            } else {
                const parts = (req.query.ngay || getVietnamTodayYMD()).split('-').map(Number);
                const ref = new Date(parts[0], parts[1] - 1, parts[2]);
                const day = ref.getDay() || 7;
                const mon = new Date(ref);
                mon.setDate(ref.getDate() - day + 1);
                const fri = new Date(mon);
                fri.setDate(mon.getDate() + 4);
                const pad = (n) => String(n).padStart(2, '0');
                start = `${mon.getFullYear()}-${pad(mon.getMonth() + 1)}-${pad(mon.getDate())}`;
                end = `${fri.getFullYear()}-${pad(fri.getMonth() + 1)}-${pad(fri.getDate())}`;
            }
        } else if (req.query.tu_ngay && req.query.den_ngay) {
            start = req.query.tu_ngay;
            end = req.query.den_ngay;
        } else {
            // Mặc định là 'day'
            start = req.query.ngay || getVietnamTodayYMD();
            end = start;
        }

        const where = {
            ngay: start === end ? start : { [Op.between]: [start, end] }
        };

        if (ca_truc !== undefined && ca_truc !== '' && ca_truc !== 'all') {
            where.ca_truc = parseInt(ca_truc, 10);
        }

        const records = await BaoCaoTruc.findAll({
            where,
            order: [['ngay', 'DESC'], ['created_at', 'DESC'], ['id', 'DESC']],
        });

        // Lấy cấu hình hệ thống
        const heThong = await CauHinhHeThong.findByPk(1);

        // Lấy danh sách tất cả phòng để kiểm tra tiến độ nộp báo cáo
        const allPhong = await Phong.findAll({
            attributes: ['ma_phong', 'loai_phong', 'suc_chua'],
            order: [['loai_phong', 'ASC'], ['ma_phong', 'ASC']],
        });

        // Tính số lượng học sinh thực tế từng phòng để tự động điền Sĩ số nếu form thiếu
        const allHocSinh = await HocSinh.findAll({
            attributes: ['ma_phong_an_id', 'ma_phong_ngu_id'],
            raw: true,
        });
        const hsCountsAn = {};
        const hsCountsNgu = {};
        allHocSinh.forEach(h => {
            if (h.ma_phong_an_id) hsCountsAn[h.ma_phong_an_id] = (hsCountsAn[h.ma_phong_an_id] || 0) + 1;
            if (h.ma_phong_ngu_id) hsCountsNgu[h.ma_phong_ngu_id] = (hsCountsNgu[h.ma_phong_ngu_id] || 0) + 1;
        });

        const pCapMap = {};
        allPhong.forEach(p => {
            pCapMap[`${p.loai_phong}_${p.ma_phong.toUpperCase()}`] = p.suc_chua;
        });

        const getRoomStudentCount = (ma_phong, ca_truc) => {
            if (!ma_phong) return null;
            const caNum = Number(ca_truc) === 1 ? 1 : 0;
            const countsMap = (caNum === 0) ? hsCountsAn : hsCountsNgu;
            const parts = String(ma_phong).split(/[,;\-\/]+/).map(s => s.trim().toUpperCase()).filter(Boolean);
            if (parts.length === 0) return null;

            let totalCount = 0;
            let totalCap = 0;
            for (const part of parts) {
                if (countsMap[part] !== undefined) {
                    totalCount += countsMap[part];
                }
                const cap = pCapMap[`${caNum}_${part}`];
                if (cap) totalCap += cap;
            }
            if (totalCount > 0) return String(totalCount);
            if (totalCap > 0) return String(totalCap);
            return null;
        };

        const recordsWithSiSo = records.map(r => {
            const plain = r.toJSON ? r.toJSON() : { ...r };
            if (!plain.si_so || String(plain.si_so).trim() === '') {
                plain.si_so = getRoomStudentCount(plain.ma_phong, plain.ca_truc);
            }
            return plain;
        });

        // Chỉ tính phòng chưa nộp nếu start === end (xem theo ngày cụ thể)
        let phongChuaBaoCaoAn = [];
        let phongChuaBaoCaoNgu = [];

        if (start === end) {
            const reportedRoomsAn = new Set(records.filter(r => r.ca_truc === 0).map(r => r.ma_phong));
            const reportedRoomsNgu = new Set(records.filter(r => r.ca_truc === 1).map(r => r.ma_phong));

            phongChuaBaoCaoAn = allPhong
                .filter(p => p.loai_phong === 0 && !reportedRoomsAn.has(p.ma_phong))
                .map(p => p.ma_phong);

            phongChuaBaoCaoNgu = allPhong
                .filter(p => p.loai_phong === 1 && !reportedRoomsNgu.has(p.ma_phong))
                .map(p => p.ma_phong);
        }

        const coViPhamRecords = records.filter(r => r.hs_vi_pham && r.hs_vi_pham.trim());
        const coVangRecords = records.filter(r => (r.danh_sach_vang && r.danh_sach_vang.trim()) || (r.so_hs_vang && r.so_hs_vang > 0));

        // Thống kê theo GV (tổng ca ăn, ca ngủ của từng GV trong tuần/tháng)
        const gvSummaryMap = {};
        records.forEach(r => {
            const gvName = r.ho_ten_gv || 'Khác';
            if (!gvSummaryMap[gvName]) {
                gvSummaryMap[gvName] = { ho_ten: gvName, so_ca_an: 0, so_ca_ngu: 0, tong_ca: 0 };
            }
            if (r.ca_truc === 0) gvSummaryMap[gvName].so_ca_an++;
            else gvSummaryMap[gvName].so_ca_ngu++;
            gvSummaryMap[gvName].tong_ca++;
        });

        const stats = {
            total: records.length,
            caAnCount: records.filter(r => r.ca_truc === 0).length,
            caNguCount: records.filter(r => r.ca_truc === 1).length,
            coViPhamCount: coViPhamRecords.length,
            coVangCount: coVangRecords.length,
            totalVang: records.reduce((sum, r) => sum + (r.so_hs_vang || 0), 0),
            totalPhongAn: allPhong.filter(p => p.loai_phong === 0).length,
            totalPhongNgu: allPhong.filter(p => p.loai_phong === 1).length,
            gvSummary: Object.values(gvSummaryMap).sort((a, b) => b.tong_ca - a.tong_ca),
        };

        return res.json({
            ok: true,
            mode: mode || (start === end ? 'day' : 'range'),
            tu_ngay: start,
            den_ngay: end,
            records: recordsWithSiSo,
            stats,
            ma_bao_mat_hien_tai: heThong?.ma_bao_mat_gv || 'BT789',
            ten_truong: heThong?.ten_truong || 'LÊ THỊ HỒNG GẤM',
            nam_hoc: heThong?.nam_hoc || '2026-2027',
            nguoi_phu_trach: heThong?.nguoi_phu_trach || 'Tạ Thị Diệu Lê',
            phongChuaBaoCaoAn,
            phongChuaBaoCaoNgu,
        });
    } catch (err) {
        return res.status(500).json({ ok: false, error: err.message });
    }
});

/**
 * POST /api/baocaotruc/delete/
 * Xóa 1 bản ghi báo cáo trực
 */
router.post('/api/baocaotruc/delete/', loginRequired, roleRequired('admin', 'quan_ly'), async (req, res) => {
    try {
        const { id } = req.body;
        if (!id) return res.status(400).json({ ok: false, error: 'Thiếu ID bản ghi' });

        const deleted = await BaoCaoTruc.destroy({ where: { id } });
        if (!deleted) return res.status(404).json({ ok: false, error: 'Không tìm thấy bản ghi' });

        return res.json({ ok: true, message: 'Đã xóa bản ghi báo cáo thành công' });
    } catch (err) {
        return res.status(500).json({ ok: false, error: err.message });
    }
});

/**
 * POST /api/baocaotruc/delete-range/
 * Xóa toàn bộ báo cáo trực theo Ngày / Tuần / Tháng sau khi đã xuất báo cáo
 */
router.post('/api/baocaotruc/delete-range/', loginRequired, roleRequired('admin', 'quan_ly'), async (req, res) => {
    try {
        const { tu_ngay, den_ngay, thang, nam, ca_truc } = req.body;
        let where = {};
        if (thang && nam) {
            const year = parseInt(nam, 10);
            const month = parseInt(thang, 10);
            const lastDay = new Date(year, month, 0).getDate();
            const start = `${year}-${String(month).padStart(2, '0')}-01`;
            const end = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
            where.ngay = { [Op.between]: [start, end] };
        } else if (tu_ngay && den_ngay) {
            where.ngay = tu_ngay === den_ngay ? tu_ngay : { [Op.between]: [tu_ngay, den_ngay] };
        } else {
            return res.status(400).json({ ok: false, error: 'Thiếu thông tin khoảng thời gian cần xóa' });
        }

        if (ca_truc !== undefined && ca_truc !== '' && ca_truc !== 'all') {
            where.ca_truc = parseInt(ca_truc, 10);
        }

        const count = await BaoCaoTruc.destroy({ where });
        return res.json({ ok: true, message: `Đã xóa thành công ${count} lượt báo cáo`, count });
    } catch (err) {
        return res.status(500).json({ ok: false, error: err.message });
    }
});

module.exports = router;
