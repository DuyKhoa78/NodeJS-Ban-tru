const express = require('express');
const router = express.Router();
const { Op } = require('sequelize');
const ExcelJS = require('exceljs');
const NodeCache = require('node-cache');
const {
    HocSinh, GiaoVien, Phong, DiemDanhHS, DiemDanhPhong, DiemDanhDraft,
    PhanCongTrucGV, LichTrucCoDinh, CauHinhGia, CauHinhHeThong, StaffUser, sequelize, CauHinhTuan, CauHinhNgay,
    BaoCaoTruc, LichSuPhanPhong, CauHinhDotThanhToan, ThuTienBanTru, KyTrucGV, ThanhToanLuongGV, LichSuThaoTac,
    KeToanKyTongHop
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
function getLastDayYMD(year, month) {
    const y = parseInt(year, 10);
    const m = parseInt(month, 10);
    const lastDay = new Date(y, m, 0).getDate();
    return `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
}

/** Điều kiện lọc ca trực mà giáo viên gvId thực tế đang chịu trách nhiệm (bao gồm trực thay, loại trừ ca đã có người khác trực thay) */
function getTeacherActiveDutyCondition(gvId) {
    return {
        [Op.or]: [
            { ma_gv_truc_thay_id: gvId },
            {
                ma_gv_id: gvId,
                ma_gv_truc_thay_id: null,
                [Op.or]: [
                    { ten_gv_truc_thay: null },
                    { ten_gv_truc_thay: '' }
                ]
            }
        ]
    };
}

/** Tìm gvId cho tài khoản (dành cho Giáo viên hoặc Học vụ) */
async function resolveGvIdForUser(user) {
    if (!user) return null;
    let gvId = user.giao_vien_id;
    if (!gvId) {
        const gvObj = await GiaoVien.findOne({
            where: {
                [Op.or]: [
                    { ho_ten: user.username },
                    { ho_ten: user.fullname }
                ]
            }
        });
        if (gvObj) gvId = gvObj.id;
    }
    return gvId || null;
}

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
        const isAll = req.query.all === 'true' || req.query.include_inactive === 'true';
        const cacheKey = `phong_${loaiStr}_${isAll ? 'all' : 'active'}`;

        const cached = appCache.get(cacheKey);
        if (cached) {
            res.set('X-Cache', 'HIT');
            return res.json({ ok: true, phong: cached });
        }

        const where = { loai_phong: loai };
        if (!isAll) {
            where.dang_dung = true;
        }

        const list = await Phong.findAll({ where, order: [['ma_phong', 'ASC']] });
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

        // Lọc theo loại và lịch sử phòng theo ngày nếu có truyền tham số ngay
        let filtered;
        if (req.query.ngay) {
            const d = req.query.ngay;
            const lsRecords = await LichSuPhanPhong.findAll({
                where: {
                    tu_ngay: { [Op.lte]: d },
                    [Op.or]: [
                        { den_ngay: null },
                        { den_ngay: { [Op.gte]: d } },
                    ],
                },
                attributes: ['ma_hs_id', 'loai_phong', 'ma_phong_id'],
            });
            const lsMap = {};
            lsRecords.forEach(r => {
                lsMap[`${r.ma_hs_id}_${r.loai_phong}`] = r.ma_phong_id;
            });

            filtered = data.map(hs => {
                const pAn = lsMap[`${hs.id}_0`] !== undefined ? lsMap[`${hs.id}_0`] : hs.phong_an;
                const pNgu = lsMap[`${hs.id}_1`] !== undefined ? lsMap[`${hs.id}_1`] : hs.phong_ngu;
                return { ...hs, phong_an: pAn, phong_ngu: pNgu };
            }).filter(hs => {
                if (loai === 'an' && !hs.phong_an) return false;
                if (loai === 'ngu' && !hs.phong_ngu) return false;
                if (hs.ngay_vao && hs.ngay_vao > d) return false;
                if (hs.ngay_rut && hs.ngay_rut <= d) return false;
                if (!hs.dang_hoc && (!hs.ngay_rut || hs.ngay_rut <= d)) return false;
                return true;
            });
        } else {
            filtered = loai === 'an'
                ? data.filter(hs => hs.phong_an && hs.dang_hoc !== false)
                : loai === 'ngu'
                    ? data.filter(hs => hs.phong_ngu && hs.dang_hoc !== false)
                    : data.filter(hs => hs.dang_hoc !== false);
        }

        if (req.query.active_only === 'true' || req.query.dang_hoc === 'true' || req.query.active === 'true' || req.query.active === '1') {
            filtered = filtered.filter(hs => hs.dang_hoc !== false);
        }

        return res.json({ ok: true, hocsinh: filtered });
    } catch (err) { return res.status(500).json({ ok: false, error: err.message }); }
});

// Export invalidate function để dùng ở nơi khác nếu cần
router.invalidateStaticCaches = invalidateStaticCaches;

/** GET /api/diemdanh/range/?tu=YYYY-MM-DD&den=YYYY-MM-DD&loai=an|ngu */
router.get('/api/diemdanh/range/', loginRequired, roleRequired('admin', 'hoc_vu', 'quan_ly', 'giao_vien'), async (req, res) => {
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

const lastRescueChecks = new Map();

async function checkAndAutoRescueRooms(targetNgay) {
    try {
        const vn = getVietnamTime();
        const isToday = targetNgay === vn.todayStr;
        const isPastDate = targetNgay < vn.todayStr;

        if (!isToday && !isPastDate) {
            // Ngày trong tương lai -> không tự động chốt
            return;
        }

        // Throttle: Không chạy lại nếu vừa chạy kiểm tra trong vòng 30 giây qua cho cùng ngày
        const lastRun = lastRescueChecks.get(targetNgay) || 0;
        if (Date.now() - lastRun < 30000) {
            return;
        }
        lastRescueChecks.set(targetNgay, Date.now());

        // Xác định ca nào đã quá giờ:
        // Ca Ăn kết thúc lúc 11h30 (690 phút)
        // Ca Ngủ kết thúc lúc 12h05 (725 phút)
        const eligibleLoais = [];
        if (isPastDate) {
            eligibleLoais.push(0, 1);
        } else if (isToday) {
            if (vn.totalMins >= 690) eligibleLoais.push(0);
            if (vn.totalMins >= 725) eligibleLoais.push(1);
        }

        if (eligibleLoais.length === 0) return;

        for (const loaiTrucNum of eligibleLoais) {
            const fieldPhong = loaiTrucNum === 0 ? 'ma_phong_an_id' : 'ma_phong_ngu_id';
            const fieldStatus = loaiTrucNum === 0 ? 'diem_danh_an' : 'diem_danh_ngu';
            const fieldPhuongThuc = loaiTrucNum === 0 ? 'phuong_thuc_an' : 'phuong_thuc_ngu';
            const fieldThoiGian = loaiTrucNum === 0 ? 'thoi_gian_diem_danh_an' : 'thoi_gian_diem_danh_ngu';

            // Tìm các phân công trực của ca này (1 query)
            const phanCongs = await PhanCongTrucGV.findAll({
                where: { ngay: targetNgay, loai_truc: loaiTrucNum },
                attributes: ['ma_phong_id']
            });
            const assignedRooms = [...new Set(phanCongs.map(p => p.ma_phong_id))];
            if (assignedRooms.length === 0) continue;

            // Kiểm tra trạng thái chốt của toàn bộ các phòng trong 1 query
            const existingChots = await DiemDanhPhong.findAll({
                where: { ngay: targetNgay, loai_truc: loaiTrucNum, ma_phong_id: { [Op.in]: assignedRooms } }
            });
            const completedRooms = new Set(
                existingChots.filter(ec => ec.trang_thai_chot === 'da_chot' || ec.da_diem_danh).map(ec => ec.ma_phong_id)
            );
            const uncompletedRooms = assignedRooms.filter(r => !completedRooms.has(r));
            if (uncompletedRooms.length === 0) continue;

            // Lấy toàn bộ draft của các phòng chưa hoàn tất (1 query)
            const drafts = await DiemDanhDraft.findAll({
                where: { ngay: targetNgay, loai_truc: loaiTrucNum, ma_phong_id: { [Op.in]: uncompletedRooms } }
            });
            const draftMap = {};
            drafts.forEach(dr => {
                if (dr && Array.isArray(dr.danh_sach_hs)) {
                    draftMap[dr.ma_phong_id] = dr.danh_sach_hs;
                }
            });

            // Lấy toàn bộ học sinh của các phòng chưa hoàn tất (1 query)
            const allHsList = await HocSinh.findAll({
                where: {
                    [fieldPhong]: { [Op.in]: uncompletedRooms },
                    [Op.or]: [
                        { dang_hoc: true },
                        { ngay_rut: { [Op.gt]: targetNgay } }
                    ]
                }
            });
            if (allHsList.length === 0) continue;

            // Lấy toàn bộ điểm danh đã có (1 query)
            const existingDD = await DiemDanhHS.findAll({
                where: {
                    ngay: targetNgay,
                    ma_hs_id: { [Op.in]: allHsList.map(h => h.id) }
                }
            });
            const existingMap = {};
            existingDD.forEach(d => { existingMap[d.ma_hs_id] = d; });

            // Nhóm học sinh theo phòng để xử lý theo batch
            const hsByRoom = {};
            allHsList.forEach(hs => {
                const room = hs[fieldPhong];
                if (!hsByRoom[room]) hsByRoom[room] = [];
                hsByRoom[room].push(hs);
            });

            const allRecordsToSave = [];
            const phongUpserts = [];

            for (const ma_phong of uncompletedRooms) {
                const roomHs = hsByRoom[ma_phong] || [];
                if (roomHs.length === 0) continue;

                const draftItems = draftMap[ma_phong] || [];
                const draftItemsMap = {};
                draftItems.forEach(item => { draftItemsMap[item.id] = item; });

                for (const hs of roomHs) {
                    const ex = existingMap[hs.id];
                    const dr = draftItemsMap[hs.id];

                    // Nếu đã được báo Phép trước (2), giữ nguyên
                    if (ex && ex[fieldStatus] === 2) {
                        continue;
                    }

                    // Nếu học sinh đã có trạng thái điểm danh trước đó (khác null và undefined), giữ nguyên, KHÔNG ghi đè dữ liệu hoặc ghi chú!
                    if (ex && ex[fieldStatus] !== null && ex[fieldStatus] !== undefined) {
                        continue;
                    }

                    let finalStatus = 1; // Mặc định Vắng nếu không chốt và chưa quét
                    let phuongThuc = 'auto_he_thong_lay_ve';
                    let thoiGian = new Date();
                    let ghiChu = null;

                    if (dr && dr.status !== undefined && dr.status !== null) {
                        finalStatus = dr.status;
                        phuongThuc = dr.phuong_thuc || 'qr';
                        thoiGian = dr.time || dr.scanned_at || new Date();
                        ghiChu = dr.ghi_chu || null;
                    }

                    allRecordsToSave.push({
                        ma_hs_id: hs.id,
                        ngay: targetNgay,
                        [fieldPhong]: ma_phong,
                        [fieldStatus]: finalStatus,
                        [fieldPhuongThuc]: phuongThuc,
                        [fieldThoiGian]: thoiGian,
                        ghi_chu: ghiChu
                    });
                }

                phongUpserts.push({
                    ma_phong_id: ma_phong,
                    ngay: targetNgay,
                    loai_truc: loaiTrucNum,
                    da_diem_danh: true,
                    thoi_gian: new Date(),
                    trang_thai_chot: 'da_chot',
                    ma_gv_chot_id: null, // Hệ thống tự động thu thập
                    ghi_chu_chot: 'Hệ thống tự động thu thập và chốt sổ sau khi hết giờ ca trực'
                });
            }

            if (allRecordsToSave.length > 0 || phongUpserts.length > 0) {
                const t = await sequelize.transaction();
                try {
                    if (allRecordsToSave.length > 0) {
                        await DiemDanhHS.bulkCreate(allRecordsToSave, {
                            updateOnDuplicate: [fieldStatus, fieldPhuongThuc, fieldThoiGian, 'ghi_chu', fieldPhong],
                            transaction: t
                        });
                    }
                    for (const pu of phongUpserts) {
                        await DiemDanhPhong.upsert(pu, { transaction: t });
                    }
                    await t.commit();
                } catch (saveErr) {
                    await t.rollback();
                    console.error('Lỗi khi tự động thu thập phòng theo lô:', saveErr.message);
                }
            }
        }
    } catch (e) {
        console.error('checkAndAutoRescueRooms error:', e.message);
    }
}

/** GET /api/diemdanh/?ngay=&loai= */
router.get('/api/diemdanh/', loginRequired, roleRequired('admin', 'hoc_vu', 'giao_vien'), async (req, res) => {
    try {
        const { ngay, loai } = req.query;
        const ngayFilter = ngay || new Date().toISOString().split('T')[0];

        // Auto-rescue chỉ chạy khi nhân sự trực (GV/Học vụ) truy cập
        // Admin tự thao tác tay → KHÔNG chạy auto-rescue
        const isAdmin = req.user.is_admin || req.user.is_superuser || req.user.role === 'admin';
        if (!isAdmin) {
            await checkAndAutoRescueRooms(ngayFilter);
        }

        const records = await DiemDanhHS.findAll({
            where: { ngay: ngayFilter },
            attributes: ['id', 'ma_hs_id', 'diem_danh_an', 'diem_danh_ngu', 'ghi_chu', 'ma_phong_an_id', 'ma_phong_ngu_id'],
        });

        // Lấy trạng thái chốt của các phòng trong ca này
        const loaiTrucQuery = loai === 'ngu' ? 1 : 0;
        const rawPhongStatuses = await DiemDanhPhong.findAll({
            where: { ngay: ngayFilter, loai_truc: loaiTrucQuery },
            include: [{
                model: StaffUser,
                as: 'nguoi_chot',
                attributes: ['id', 'username', 'fullname', 'role', 'giao_vien_id'],
                include: [{
                    model: GiaoVien,
                    as: 'giao_vien',
                    attributes: ['id', 'ho_ten']
                }]
            }]
        });

        const phongStatuses = rawPhongStatuses.map(ps => {
            const item = ps.toJSON ? ps.toJSON() : ps;
            let tenNguoiChot = null;
            if (item.nguoi_chot) {
                tenNguoiChot = item.nguoi_chot.fullname || item.nguoi_chot.giao_vien?.ho_ten || item.nguoi_chot.username;
            } else if (item.ma_gv_chot_id === null && (item.trang_thai_chot === 'da_chot' || item.da_diem_danh)) {
                tenNguoiChot = 'Hệ thống';
            }
            const isCompleted = item.trang_thai_chot === 'da_chot' || Boolean(item.da_diem_danh);
            const isAutoChot = Boolean(isCompleted && (item.ma_gv_chot_id === null || tenNguoiChot === 'Hệ thống' || item.ghi_chu_chot?.includes('Hệ thống')));
            const isGvChot = Boolean(isCompleted && !isAutoChot);
            return {
                ...item,
                ten_nguoi_chot: tenNguoiChot,
                is_auto_chot: isAutoChot,
                is_gv_chot: isGvChot
            };
        });

        // Nếu là giáo viên hoặc học vụ, xác định phòng được phân công
        let assignedRooms = null;
        let myAssignments = null;
        if (req.user.role === 'giao_vien' || req.user.role === 'hoc_vu') {
            const gvId = await resolveGvIdForUser(req.user);
            if (gvId) {
                myAssignments = await PhanCongTrucGV.findAll({
                    where: {
                        ngay: ngayFilter,
                        loai_truc: loaiTrucQuery,
                        ...getTeacherActiveDutyCondition(gvId)
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

        const baoCaoRecords = await BaoCaoTruc.findAll({
            where: {
                ngay: ngayFilter,
                ca_truc: loaiTrucQuery
            },
            attributes: ['id', 'ma_phong', 'ho_ten_gv', 'si_so', 'created_at']
        });

        const vnNow = new Date(Date.now() + 7 * 3600 * 1000);
        const curMinutes = vnNow.getUTCHours() * 60 + vnNow.getUTCMinutes();
        const todayVn = vnNow.toISOString().split('T')[0];
        const isCaAn = loaiTrucQuery === 0;
        const minMinutes = isCaAn ? 675 : 700; // 11:15 hoặc 11:40
        const maxMinutes = isCaAn ? 705 : 765; // 11:45 hoặc 12:45
        let timeState = 'trong_gio';
        if (ngayFilter === todayVn) {
            if (curMinutes < minMinutes) timeState = 'chua_den';
            else if (curMinutes >= maxMinutes) timeState = 'qua_gio';
            else timeState = 'trong_gio';
        } else if (ngayFilter < todayVn) {
            timeState = 'qua_gio';
        } else {
            timeState = 'chua_den';
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
            bao_cao_records: baoCaoRecords,
            khung_gio_bao_cao: {
                state: timeState,
                is_het_gio: timeState === 'qua_gio',
                gio_mo: isCaAn ? '11:15' : '11:40',
                gio_dong: isCaAn ? '11:45' : '12:45'
            }
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
router.post('/api/diemdanh/save/', loginRequired, roleRequired('admin', 'hoc_vu', 'giao_vien'), async (req, res) => {
    try {
        const { loai, records } = req.body;
        if (!records || !Array.isArray(records) || records.length === 0) {
            return res.status(400).json({ ok: false, error: 'Thiếu dữ liệu records' });
        }

        const reqNgay = records[0].ngay;
        const loaiPhongNum = loai === 'an' ? 0 : 1;

        // Quy định: Toàn bộ người dùng (kể cả Admin) không được thao tác với những ngày chưa đến
        const vn = getVietnamTime();
        if (reqNgay > vn.todayStr) {
            return res.status(400).json({
                ok: false,
                error: `Không thể điểm danh cho ngày chưa đến (${reqNgay}). Hệ thống chỉ cho phép thao tác với ngày hiện tại và ngày quá khứ.`
            });
        }

        // Kiểm tra xem ngày điểm danh có thuộc đợt thanh toán đã bị khóa sổ không
        const dotKhoa = await CauHinhDotThanhToan.findOne({
            where: {
                is_khoa: true,
                tu_ngay: { [Op.lte]: reqNgay },
                den_ngay: { [Op.gte]: reqNgay }
            }
        });
        if (dotKhoa) {
            return res.status(403).json({
                ok: false,
                error: `Đợt thanh toán "${dotKhoa.label}" đã bị khóa sổ kế toán. Không thể cập nhật điểm danh cho ngày ${reqNgay}.`
            });
        }

        // Kiểm tra quyền và khung giờ điểm danh:
        // Admin/Superuser có thể điểm danh bất kỳ lúc nào.
        const isSpecialAdmin = Boolean(req.user?.is_admin || req.user?.is_superuser);
        if (!isSpecialAdmin) {
            const vn = getVietnamTime();

            if (req.user.role === 'giao_vien' || req.user.role === 'hoc_vu') {
                const gvId = await resolveGvIdForUser(req.user);
                const pcList = await PhanCongTrucGV.findAll({
                    where: {
                        ngay: reqNgay,
                        loai_truc: loaiPhongNum,
                        ...getTeacherActiveDutyCondition(gvId)
                    }
                });
                if (pcList.length === 0) {
                    return res.status(403).json({
                        ok: false,
                        error: `Bạn không có lịch phân công trực ca ${loai === 'an' ? 'ăn' : 'ngủ'} trong ngày ${reqNgay}.`
                    });
                }
                const assignedRoomsSet = new Set(pcList.map(pc => pc.ma_phong_id));
                for (const r of records) {
                    if (r.ma_phong && !assignedRoomsSet.has(r.ma_phong)) {
                        return res.status(403).json({
                            ok: false,
                            error: `Bạn không được phân công trực phòng ${r.ma_phong}, không thể điểm danh cho phòng này.`
                        });
                    }
                }

                if (req.user.role === 'giao_vien') {
                    // Chỉ mở vào đúng ngày trực và đúng khung giờ: Ăn (10h55 – 11h30), Ngủ (11h30 – 12h05)
                    if (reqNgay !== vn.todayStr) {
                        return res.status(403).json({
                            ok: false,
                            error: `Theo quy định, hệ thống chỉ mở điểm danh vào đúng ngày trực (${reqNgay}) trong khung giờ ca ${loai === 'an' ? 'ăn' : 'ngủ'}.`
                        });
                    }
                    const startMins = loai === 'an' ? 655 : 690;
                    const endMins = loai === 'an' ? 690 : 725;
                    const timeLabel = loai === 'an' ? '10h55 – 11h30' : '11h30 – 12h05';
                    if (vn.totalMins < startMins || vn.totalMins >= endMins) {
                        return res.status(403).json({
                            ok: false,
                            error: `Khung giờ điểm danh ca ${loai === 'an' ? 'ăn' : 'ngủ'} là từ ${timeLabel} (khóa lúc ${loai === 'an' ? '11h30' : '12h05'}). Hiện tại hệ thống đang khóa.`
                        });
                    }
                } else if (req.user.role === 'hoc_vu') {
                    // Học vụ điểm danh theo phòng phân công từ 10:55 đến 14:00
                    if (vn.totalMins < 655 || vn.totalMins > 840) {
                        return res.status(400).json({
                            ok: false,
                            error: 'Học vụ chỉ có thể thực hiện điểm danh từ lúc 10:55 đến 14:00. Ngoài khung giờ này, vui lòng liên hệ Admin.'
                        });
                    }
                }
            }
        }

        const field = loai === 'an' ? 'diem_danh_an' : 'diem_danh_ngu';
        const fieldPhong = loai === 'an' ? 'ma_phong_an_id' : 'ma_phong_ngu_id';
        const t = await sequelize.transaction();
        try {
            const oppositeField = loai === 'an' ? 'diem_danh_ngu' : 'diem_danh_an';
            const hsIds = records.map(r => r.ma_hs);

            // Tìm snapshot phòng tại ngày reqNgay từ LichSuPhanPhong
            const lsRecords = await LichSuPhanPhong.findAll({
                where: {
                    ma_hs_id: { [Op.in]: hsIds },
                    loai_phong: loaiPhongNum,
                    tu_ngay: { [Op.lte]: reqNgay },
                    [Op.or]: [
                        { den_ngay: null },
                        { den_ngay: { [Op.gte]: reqNgay } },
                    ],
                },
                attributes: ['ma_hs_id', 'ma_phong_id'],
                order: [['tu_ngay', 'ASC']],
                transaction: t,
            });
            const lsMap = {};
            lsRecords.forEach(r => { lsMap[r.ma_hs_id] = r.ma_phong_id; });

            // Fallback từ quanli_hocsinh nếu chưa có trong lịch sử
            const fallbackHS = await HocSinh.findAll({
                where: { id: { [Op.in]: hsIds } },
                attributes: ['id', 'ma_phong_an_id', 'ma_phong_ngu_id'],
                transaction: t,
            });
            const fallbackMap = {};
            fallbackHS.forEach(h => {
                fallbackMap[h.id] = loai === 'an' ? h.ma_phong_an_id : h.ma_phong_ngu_id;
            });

            // Chỉ lưu những học sinh có trạng thái cụ thể (0: Có mặt, 1: Vắng, 2: Phép)
            // Nếu r.status là null hoặc undefined (chưa chọn) thì không cập nhật để giữ trống
            const validRecords = records.filter(r => r.status !== null && r.status !== undefined);
            if (validRecords.length === 0) {
                await t.rollback();
                return res.json({ ok: true, message: 'Không có bản ghi điểm danh nào cần cập nhật' });
            }

            // Quy định: Giáo viên khi điểm danh không được ghi phép (chỉ có Admin/Học vụ mới có quyền báo phép)
            if (req.user.role === 'giao_vien') {
                const existingPhepList = await DiemDanhHS.findAll({
                    where: {
                        ma_hs_id: { [Op.in]: validRecords.map(r => r.ma_hs) },
                        ngay: reqNgay,
                        [field]: 2
                    },
                    attributes: ['ma_hs_id'],
                    transaction: t
                });
                const phepSet = new Set(existingPhepList.map(p => p.ma_hs_id));

                for (const r of validRecords) {
                    if (r.status === 2 && !phepSet.has(r.ma_hs)) {
                        await t.rollback();
                        return res.status(403).json({
                            ok: false,
                            error: 'Giáo viên không có quyền ghi phép cho học sinh khi điểm danh. Thao tác báo nghỉ phép do Ban quản lý/Admin phụ trách.'
                        });
                    }
                    // Nếu học sinh đã có phép do Admin duyệt trước đó, giáo viên không thể thay đổi
                    if (phepSet.has(r.ma_hs) && r.status !== 2) {
                        r.status = 2;
                    }
                }
            }

            const data = validRecords.map(r => ({
                ma_hs_id: r.ma_hs,
                ngay: r.ngay,
                [field]: r.status,
                [fieldPhong]: r.ma_phong || lsMap[r.ma_hs] || fallbackMap[r.ma_hs] || null,
                [oppositeField]: null,
                ...(r.ghi_chu ? { ghi_chu: r.ghi_chu } : {})
            }));

            const updateFields = [field, fieldPhong];
            if (validRecords.some(r => r.ghi_chu)) {
                updateFields.push('ghi_chu');
            }

            await DiemDanhHS.bulkCreate(data, {
                updateOnDuplicate: updateFields,
                transaction: t
            });
            await t.commit();
            return res.json({ ok: true, message: `Đã lưu ${validRecords.length} bản ghi điểm danh` });
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

            const hsRecords = await HocSinh.findAll({
                where: { id: { [Op.in]: ma_hs_list } },
                attributes: ['id', 'dang_hoc', 'ngay_vao', 'ngay_rut', 'ma_phong_an_id', 'ma_phong_ngu_id'],
                transaction: t,
            });
            const hsMap = new Map(hsRecords.map(h => [h.id, h]));

            let count = 0;
            for (const ma_hs of ma_hs_list) {
                const hsInfo = hsMap.get(ma_hs);
                for (const d of dates) {
                    // Bỏ qua học sinh đã rút bán trú hoặc chưa vào học
                    if (hsInfo) {
                        if (hsInfo.dang_hoc === false && (!hsInfo.ngay_rut || d >= hsInfo.ngay_rut)) continue;
                        if (hsInfo.ngay_rut && d >= hsInfo.ngay_rut) continue;
                        if (hsInfo.ngay_vao && d < hsInfo.ngay_vao) continue;
                    }
                    const key = `${ma_hs}_${d}`;
                    const rec = recordMap.get(key);

                    if (rec) {
                        const updates = {};
                        if (loaiCa === 'an' || loaiCa === 'ca_ngay') {
                            updates.diem_danh_an = 2; // 2 = Phép
                            if (!rec.ma_phong_an_id && hsInfo?.ma_phong_an_id) updates.ma_phong_an_id = hsInfo.ma_phong_an_id;
                        }
                        if (loaiCa === 'ngu' || loaiCa === 'ca_ngay') {
                            updates.diem_danh_ngu = 2; // 2 = Phép
                            if (!rec.ma_phong_ngu_id && hsInfo?.ma_phong_ngu_id) updates.ma_phong_ngu_id = hsInfo.ma_phong_ngu_id;
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
                            ma_phong_an_id: hsInfo?.ma_phong_an_id || null,
                            ma_phong_ngu_id: hsInfo?.ma_phong_ngu_id || null,
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
        let targetNgay = req.query.ngay || vn.todayStr;

        // Auto rescue nếu đã quá giờ cắt
        await checkAndAutoRescueRooms(targetNgay);

        let gvId = await resolveGvIdForUser(req.user);

        if (!gvId && (req.user.role === 'giao_vien' || req.user.role === 'hoc_vu')) {
            return res.status(404).json({ ok: false, error: 'Không tìm thấy hồ sơ giáo viên/nhân sự liên kết với tài khoản này' });
        }

        // Lấy danh sách phân công của giáo viên hoặc học vụ (chỉ lấy ca trực thực tế đảm nhiệm)
        let whereClause = { ngay: targetNgay };
        if (req.user.role === 'giao_vien' || req.user.role === 'hoc_vu') {
            whereClause[Op.and] = [
                getTeacherActiveDutyCondition(gvId)
            ];
        }

        let assignments = await PhanCongTrucGV.findAll({
            where: whereClause,
            include: [
                { association: 'phong', attributes: ['ma_phong', 'loai_phong', 'gioi_tinh'] },
                { association: 'giao_vien', attributes: ['id', 'ho_ten'] }
            ],
            order: [['loai_truc', 'ASC']]
        });

        // Lấy danh sách phân công của giáo viên (chạy thật theo ngày thực tế)
        let isTestDate = false;

        const anRooms = assignments.filter(a => a.loai_truc === 0).map(a => a.ma_phong_id);
        const nguRooms = assignments.filter(a => a.loai_truc === 1).map(a => a.ma_phong_id);
        const allAssignedRoomCodes = [...new Set([...anRooms, ...nguRooms])];

        // 1 query cho tất cả học sinh thuộc các phòng phân công
        const allStudents = allAssignedRoomCodes.length > 0 ? await HocSinh.findAll({
            where: {
                [Op.or]: [
                    { ma_phong_an_id: { [Op.in]: anRooms } },
                    { ma_phong_ngu_id: { [Op.in]: nguRooms } }
                ],
                dang_hoc: true
            },
            attributes: ['id', 'ho_ten', 'lop', 'gioi_tinh', 'ma_phong_an_id', 'ma_phong_ngu_id']
        }) : [];

        // 1 query cho toàn bộ trạng thái chốt của các phòng
        const allStatuses = allAssignedRoomCodes.length > 0 ? await DiemDanhPhong.findAll({
            where: {
                ngay: targetNgay,
                ma_phong_id: { [Op.in]: allAssignedRoomCodes }
            }
        }) : [];
        const statusMap = {};
        allStatuses.forEach(ps => { statusMap[`${ps.loai_truc}_${ps.ma_phong_id}`] = ps; });

        // 1 query cho toàn bộ draft của các phòng
        const allDrafts = allAssignedRoomCodes.length > 0 ? await DiemDanhDraft.findAll({
            where: {
                ngay: targetNgay,
                ma_phong_id: { [Op.in]: allAssignedRoomCodes }
            }
        }) : [];
        const draftMap = {};
        allDrafts.forEach(d => { draftMap[`${d.loai_truc}_${d.ma_phong_id}`] = d; });

        // 1 query cho toàn bộ điểm danh của các học sinh
        const allHsIds = allStudents.map(s => s.id);
        const allDD = allHsIds.length > 0 ? await DiemDanhHS.findAll({
            where: {
                ngay: targetNgay,
                ma_hs_id: { [Op.in]: allHsIds }
            },
            attributes: ['ma_hs_id', 'diem_danh_an', 'diem_danh_ngu', 'ghi_chu']
        }) : [];
        const ddMapAn = {};
        const ddMapNgu = {};
        allDD.forEach(r => {
            if (r.diem_danh_an !== null && r.diem_danh_an !== undefined) {
                ddMapAn[r.ma_hs_id] = { status: r.diem_danh_an, ghi_chu: r.ghi_chu };
            }
            if (r.diem_danh_ngu !== null && r.diem_danh_ngu !== undefined) {
                ddMapNgu[r.ma_hs_id] = { status: r.diem_danh_ngu, ghi_chu: r.ghi_chu };
            }
        });

        // Với mỗi phân công, tổng hợp dữ liệu in-memory siêu tốc
        const result = [];
        for (const pc of assignments) {
            const loaiTruc = pc.loai_truc; // 0=An, 1=Ngu
            const maPhong = pc.ma_phong_id;

            const studentsInRoom = allStudents.filter(s => (loaiTruc === 0 ? s.ma_phong_an_id : s.ma_phong_ngu_id) === maPhong);
            const totalStudents = studentsInRoom.length;

            // Trạng thái chốt
            const phongStatus = statusMap[`${loaiTruc}_${maPhong}`];

            // Bản nháp đang lưu
            const draft = draftMap[`${loaiTruc}_${maPhong}`];
            const draftCount = (draft && Array.isArray(draft.danh_sach_hs))
                ? draft.danh_sach_hs.filter(d => d.status === 0).length
                : 0;

            const ddMap = { ...(loaiTruc === 0 ? ddMapAn : ddMapNgu) };
            if (draft && Array.isArray(draft.danh_sach_hs)) {
                draft.danh_sach_hs.forEach(item => {
                    if (!ddMap[item.id] || ddMap[item.id].status === null) {
                        ddMap[item.id] = { status: item.status, ghi_chu: item.ghi_chu };
                    }
                });
            }

            let soCoMat = 0;
            let soVang = 0;
            let soPhep = 0;
            const dsVang = [];

            studentsInRoom.forEach(s => {
                const info = ddMap[s.id];
                if (info) {
                    if (info.status === 0) {
                        soCoMat++;
                    } else if (info.status === 1) {
                        soVang++;
                        dsVang.push({
                            id: s.id,
                            ma_hs: s.id,
                            ho_ten: s.ho_ten,
                            lop: s.lop,
                            loai: 'Vắng không phép',
                            ghi_chu: info.ghi_chu || '',
                            ma_phong_id: maPhong
                        });
                    } else if (info.status === 2) {
                        soPhep++;
                        dsVang.push({
                            id: s.id,
                            ma_hs: s.id,
                            ho_ten: s.ho_ten,
                            lop: s.lop,
                            loai: 'Vắng có phép',
                            ghi_chu: info.ghi_chu || '',
                            ma_phong_id: maPhong
                        });
                    }
                }
            });

            const daDiemDanhCount = soCoMat + soVang + soPhep;

            // Khung giờ điểm danh:
            // Ăn: 10:55 (655) -> 11:30 (690)
            // Ngủ: 11:30 (690) -> 12:05 (725)
            const startMins = loaiTruc === 0 ? 655 : 690;
            const endMins = loaiTruc === 0 ? 690 : 725;
            const startStr = loaiTruc === 0 ? '10:55' : '11:30';
            const endStr = loaiTruc === 0 ? '11:30' : '12:05';

            let timeState = 'sap_den'; // 'sap_den' | 'dang_dien_ra' | 'da_qua_gio'
            if (targetNgay === vn.todayStr) {
                if (vn.totalMins < startMins) timeState = 'sap_den';
                else if (vn.totalMins < endMins) timeState = 'dang_dien_ra';
                else timeState = 'da_qua_gio';
            } else if (targetNgay > vn.todayStr) {
                timeState = 'sap_den';
            } else {
                timeState = 'da_qua_gio';
            }

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

            // Kiểm tra trạng thái báo cáo ca trực của phòng (hỗ trợ cả báo cáo đơn phòng và báo cáo gộp liên phòng)
            const bcRecord = await BaoCaoTruc.findOne({
                where: {
                    ngay: targetNgay,
                    ca_truc: loaiTruc,
                    [Op.or]: [
                        { ma_phong: maPhong },
                        { ma_phong: { [Op.like]: `%${maPhong}%` } }
                    ]
                },
                order: [['id', 'DESC']]
            });

            // Khung giờ báo cáo quy định:
            // Ăn: 11h15 (675) -> 12h00 (720)
            // Ngủ: 11h45 (705) -> 13h00 (780)
            const bcStartMins = loaiTruc === 0 ? 675 : 705;
            const bcEndMins = loaiTruc === 0 ? 720 : 780;
            const bcStartStr = loaiTruc === 0 ? '11:15' : '11:45';
            const bcEndStr = loaiTruc === 0 ? '12:00' : '13:00';

            let bcTimeState = 'sap_den'; // 'sap_den' | 'dang_dien_ra' | 'da_qua_gio'
            if (targetNgay === vn.todayStr) {
                if (vn.totalMins < bcStartMins) bcTimeState = 'sap_den';
                else if (vn.totalMins <= bcEndMins) bcTimeState = 'dang_dien_ra';
                else bcTimeState = 'da_qua_gio';
            } else if (targetNgay > vn.todayStr) {
                bcTimeState = 'sap_den';
            } else {
                bcTimeState = 'da_qua_gio';
            }

            const isChot = Boolean(phongStatus && (phongStatus.trang_thai_chot === 'da_chot' || phongStatus.da_diem_danh));
            const isAdmin = req.user.role === 'admin' || req.user.role === 'quan_ly' || req.user.is_superuser;
            let canReport = true;
            let reportLockReason = '';

            if (!isAdmin) {
                if (!isChot && loaiTruc !== 2) {
                    canReport = false;
                    reportLockReason = `Cần chốt điểm danh phòng ${maPhong} trước`;
                } else if (bcTimeState === 'sap_den') {
                    canReport = false;
                    reportLockReason = `Chưa tới giờ báo cáo (Mở lúc ${bcStartStr})`;
                } else if (bcTimeState === 'da_qua_gio') {
                    canReport = false;
                    reportLockReason = `Đã hết giờ báo cáo (Đóng lúc ${bcEndStr})`;
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
                so_co_mat: soCoMat,
                so_vang: soVang,
                so_phep: soPhep,
                tong_vang: soVang + soPhep,
                da_diem_danh_count: daDiemDanhCount,
                danh_sach_vang: dsVang,
                trang_thai_chot: phongStatus?.trang_thai_chot || 'chua_chot',
                da_diem_danh: Boolean(phongStatus?.da_diem_danh),
                is_chot: isChot,
                is_auto_chot: Boolean(isChot && (phongStatus?.ma_gv_chot_id === null || phongStatus?.ghi_chu_chot?.includes('Hệ thống'))),
                is_gv_chot: Boolean(isChot && phongStatus?.ma_gv_chot_id !== null && !phongStatus?.ghi_chu_chot?.includes('Hệ thống')),
                ma_gv_chot_id: phongStatus?.ma_gv_chot_id || null,
                thoi_gian_chot: phongStatus?.thoi_gian || null,
                ghi_chu_chot: phongStatus?.ghi_chu_chot || null,
                khung_gio: {
                    start: startStr,
                    end: endStr,
                    state: timeState,
                    mins_remaining: timeState === 'dang_dien_ra' ? (endMins - vn.totalMins) : 0,
                },
                bao_cao: bcRecord ? {
                    id: bcRecord.id,
                    da_bao_cao: true,
                    ho_ten_gv: bcRecord.ho_ten_gv,
                    created_at: bcRecord.created_at,
                    tinh_hinh: bcRecord.tinh_hinh,
                } : null,
                khung_gio_bao_cao: {
                    start: bcStartStr,
                    end: bcEndStr,
                    state: bcTimeState,
                    mins_remaining: bcTimeState === 'dang_dien_ra' ? (bcEndMins - vn.totalMins) : 0,
                },
                can_diem_danh: canDiemDanh,
                note_quyen: noteQuyen,
                can_report: canReport,
                report_lock_reason: reportLockReason,
            });
        }

        return res.json({
            ok: true,
            today: targetNgay,
            is_test_date: isTestDate,
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

        const vn = getVietnamTime();
        if (ngay > vn.todayStr) {
            return res.status(400).json({ ok: false, error: `Không thể đồng bộ điểm danh cho ngày chưa đến (${ngay}).` });
        }

        const loaiTrucNum = Number(loai_truc);

        // Kiểm tra phân công nếu là giáo viên hoặc học vụ
        if (req.user.role === 'giao_vien' || req.user.role === 'hoc_vu') {
            const gvId = await resolveGvIdForUser(req.user);
            const pc = await PhanCongTrucGV.findOne({
                where: {
                    ngay,
                    loai_truc: loaiTrucNum,
                    ma_phong_id,
                    ...getTeacherActiveDutyCondition(gvId)
                }
            });
            if (!pc) {
                return res.status(403).json({ ok: false, error: 'Bạn không được phân công trực phòng này trong ca đã chọn' });
            }
            if (pc.nhiem_vu !== 0) {
                return res.status(403).json({ ok: false, error: 'Bạn có nhiệm vụ Giám sát, không có quyền điểm danh hoặc đồng bộ dữ liệu phòng này' });
            }
            if (req.user.role === 'giao_vien') {
                const vn = getVietnamTime();
                if (ngay !== vn.todayStr) {
                    return res.status(403).json({ ok: false, error: `Hệ thống chỉ mở vào đúng ngày trực (${ngay}) trong khung giờ quy định.` });
                }
                const startMins = loaiTrucNum === 0 ? 655 : 690;
                const endMins = loaiTrucNum === 0 ? 690 : 725;
                const timeLabel = loaiTrucNum === 0 ? '10h55 – 11h30' : '11h30 – 12h05';
                if (vn.totalMins < startMins || vn.totalMins >= endMins) {
                    return res.status(403).json({ ok: false, error: `Khung giờ điểm danh ca ${loaiTrucNum === 0 ? 'ăn' : 'ngủ'} là từ ${timeLabel}. Hiện tại hệ thống đang khóa.` });
                }
            }
        }

        let cleanList = Array.isArray(danh_sach_hs) ? danh_sach_hs : [];
        if (req.user.role === 'giao_vien') {
            const fieldStatus = loaiTrucNum === 0 ? 'diem_danh_an' : 'diem_danh_ngu';
            const hsPhep = await DiemDanhHS.findAll({
                where: {
                    ma_hs_id: { [Op.in]: cleanList.filter(item => item.status === 2).map(item => item.id) },
                    ngay,
                    [fieldStatus]: 2
                },
                attributes: ['ma_hs_id']
            });
            const phepSet = new Set(hsPhep.map(p => p.ma_hs_id));
            cleanList = cleanList.map(item => {
                if (item.status === 2 && !phepSet.has(item.id)) {
                    return { ...item, status: 1 };
                }
                return item;
            });
        }

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

        // Kiểm tra phân công nếu là giáo viên hoặc học vụ (không cho phép xem bản nháp phòng người khác)
        if (req.user.role === 'giao_vien' || req.user.role === 'hoc_vu') {
            const gvId = await resolveGvIdForUser(req.user);
            const pc = await PhanCongTrucGV.findOne({
                where: {
                    ngay,
                    loai_truc: loaiTrucNum,
                    ma_phong_id,
                    ...getTeacherActiveDutyCondition(gvId)
                }
            });
            if (!pc) {
                return res.status(403).json({ ok: false, error: 'Bạn không được phân công trực phòng này trong ca đã chọn' });
            }
            if (pc.nhiem_vu !== 0) {
                return res.status(403).json({ ok: false, error: 'Bạn có nhiệm vụ Giám sát, không có quyền xem bản nháp điểm danh phòng này' });
            }
        }

        // Auto rescue chỉ chạy cho GV/Học vụ (Admin tự điểm danh tay)
        const isAdminOrHocVu2 = req.user.is_admin || req.user.is_superuser || req.user.role === 'admin';
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

/** POST /api/diemdanh/chot-phong/ - Chốt dữ liệu điểm danh phòng lên Tổng (Dành cho Admin / Học vụ / Giáo viên) */
router.post('/api/diemdanh/chot-phong/', loginRequired, roleRequired('admin', 'hoc_vu', 'giao_vien'), async (req, res) => {
    try {
        const { ngay, loai_truc, ma_phong_id, danh_sach_hs, ghi_chu } = req.body;
        if (!ngay || loai_truc === undefined || !ma_phong_id) {
            return res.status(400).json({ ok: false, error: 'Thiếu dữ liệu yêu cầu' });
        }

        // Kiểm tra xem ngày chốt có thuộc đợt thanh toán đã bị khóa sổ kế toán không
        const dotKhoa = await CauHinhDotThanhToan.findOne({
            where: {
                is_khoa: true,
                tu_ngay: { [Op.lte]: ngay },
                den_ngay: { [Op.gte]: ngay }
            }
        });
        if (dotKhoa) {
            return res.status(403).json({
                ok: false,
                error: `Đợt thanh toán "${dotKhoa.label}" đã bị khóa sổ kế toán. Không thể chốt hoặc sửa đổi điểm danh cho ngày ${ngay}.`
            });
        }

        const loaiTrucNum = Number(loai_truc);
        const vn = getVietnamTime();

        // Quy định: Toàn bộ người dùng (kể cả Admin) không được chốt sổ với những ngày chưa đến
        if (ngay > vn.todayStr) {
            return res.status(400).json({
                ok: false,
                error: `Không thể chốt sổ điểm danh cho ngày chưa đến (${ngay}). Hệ thống chỉ cho phép thao tác với ngày hiện tại và ngày quá khứ.`
            });
        }

        // Nếu là giáo viên hoặc học vụ, kiểm tra phân công nhiệm vụ
        if (req.user.role === 'giao_vien' || req.user.role === 'hoc_vu') {
            const gvId = await resolveGvIdForUser(req.user);
            const pc = await PhanCongTrucGV.findOne({
                where: {
                    ngay,
                    loai_truc: loaiTrucNum,
                    ma_phong_id,
                    ...getTeacherActiveDutyCondition(gvId)
                }
            });
            if (!pc) {
                return res.status(403).json({ ok: false, error: 'Bạn không được phân công phòng này trong ca trực đã chọn.' });
            }
            if (loaiTrucNum === 0 && pc.nhiem_vu !== 0) {
                return res.status(403).json({ ok: false, error: 'Bạn được phân công Giám sát ca ăn, không có quyền chốt điểm danh.' });
            }
            if (req.user.role === 'giao_vien') {
                if (ngay !== vn.todayStr) {
                    return res.status(403).json({ ok: false, error: `Theo quy định, hệ thống chỉ mở chốt sổ vào đúng ngày trực (${ngay}) trong khung giờ ca ${loaiTrucNum === 0 ? 'ăn' : 'ngủ'}.` });
                }
                const startMins = loaiTrucNum === 0 ? 655 : 690;
                const endMins = loaiTrucNum === 0 ? 690 : 725;
                const timeLabel = loaiTrucNum === 0 ? '10h55 – 11h30' : '11h30 – 12h05';
                if (vn.totalMins < startMins || vn.totalMins >= endMins) {
                    return res.status(403).json({ ok: false, error: `Khung giờ chốt sổ ca ${loaiTrucNum === 0 ? 'ăn' : 'ngủ'} là từ ${timeLabel}. Hiện tại hệ thống đang khóa.` });
                }
            }
        }

        const cauhinhNgay = await CauHinhNgay.findOne({ where: { ngay } });

        const fieldPhong = loaiTrucNum === 0 ? 'ma_phong_an_id' : 'ma_phong_ngu_id';
        const dbStudents = await HocSinh.findAll({
            where: {
                [fieldPhong]: ma_phong_id,
                [Op.or]: [
                    { dang_hoc: true },
                    { ngay_rut: { [Op.gt]: ngay } }
                ]
            },
            attributes: ['id', 'ho_ten', 'lop', 'gioi_tinh', 'dang_hoc', 'ngay_vao', 'ngay_rut']
        });

        // Kết hợp với danh_sach_hs do client gửi lên (bảo đảm học sinh tạm/đặc biệt không bị bỏ sót)
        const studentMap = new Map();
        dbStudents.forEach(s => studentMap.set(s.id, { id: s.id, ho_ten: s.ho_ten, lop: s.lop, ngay_vao: s.ngay_vao, ngay_rut: s.ngay_rut, dang_hoc: s.dang_hoc }));
        if (Array.isArray(danh_sach_hs)) {
            danh_sach_hs.forEach(item => {
                if (!studentMap.has(item.id)) {
                    studentMap.set(item.id, item);
                }
            });
        }
        const allStudents = Array.from(studentMap.values());

        // Lọc học sinh thực tế phải tham gia trong ngày (loại trừ ngày nghỉ/miễn theo CauHinhNgay và HS chưa vào/đã rút)
        const validStudents = allStudents.filter(hs => {
            if (hs.ngay_vao && hs.ngay_vao > ngay) return false;
            if (hs.ngay_rut && hs.ngay_rut <= ngay) return false;
            if (!hs.dang_hoc && (!hs.ngay_rut || hs.ngay_rut <= ngay)) return false;
            return isHsAllowed(hs, cauhinhNgay);
        });

        // Kiểm tra các bạn đã được báo Phép trước (bởi Admin)
        const existingDD = await DiemDanhHS.findAll({
            where: {
                ngay,
                ma_hs_id: { [Op.in]: validStudents.map(s => s.id) }
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

        const t = await sequelize.transaction();
        try {
            const fieldPhong = loaiTrucNum === 0 ? 'ma_phong_an_id' : 'ma_phong_ngu_id';
            const fieldStatus = loaiTrucNum === 0 ? 'diem_danh_an' : 'diem_danh_ngu';
            const fieldPhuongThuc = loaiTrucNum === 0 ? 'phuong_thuc_an' : 'phuong_thuc_ngu';
            const fieldThoiGian = loaiTrucNum === 0 ? 'thoi_gian_diem_danh_an' : 'thoi_gian_diem_danh_ngu';

            const recordsToSave = [];
            for (const hs of validStudents) {
                const ex = existingMap[hs.id];
                const sc = scannedMap[hs.id];

                let finalStatus = 1; // Mặc định là Vắng nếu chưa quét
                let phuongThuc = 'auto_vang';
                let thoiGian = new Date();

                // Ưu tiên 1: Đã được báo Phép trước đó
                if (ex && ex[fieldStatus] === 2) {
                    finalStatus = 2;
                    phuongThuc = ex[fieldPhuongThuc] || 'phep';
                    thoiGian = ex[fieldThoiGian] || new Date();
                } else if (sc) {
                    if (req.user.role === 'giao_vien' && sc.status === 2) {
                        finalStatus = 1; // Giáo viên không được tự gán phép nếu chưa được Admin duyệt phép từ trước
                    } else {
                        finalStatus = sc.status; // 0=Có mặt, 1=Vắng, 2=Phép
                    }
                    phuongThuc = sc.phuong_thuc || 'qr';
                    thoiGian = sc.time || new Date();
                }

                recordsToSave.push({
                    ma_hs_id: hs.id,
                    ngay,
                    [fieldPhong]: ma_phong_id,
                    [fieldStatus]: finalStatus,
                    [fieldPhuongThuc]: phuongThuc,
                    [fieldThoiGian]: thoiGian,
                    nguoi_diem_danh_id: req.user.id,
                    ghi_chu: sc?.ghi_chu || null
                });
            }

            if (recordsToSave.length > 0) {
                await DiemDanhHS.bulkCreate(recordsToSave, {
                    updateOnDuplicate: [fieldStatus, fieldPhuongThuc, fieldThoiGian, 'nguoi_diem_danh_id', 'ghi_chu', fieldPhong],
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

/** POST /api/diemdanh/mo-chot/ - Mở lại chốt điểm danh phòng (cho phép GV điểm danh hoặc kiểm thử lại) */
router.post('/api/diemdanh/mo-chot/', loginRequired, roleRequired('admin', 'hoc_vu', 'quan_ly', 'giao_vien'), async (req, res) => {
    try {
        const { ngay, loai_truc, ma_phong_id, reset_hs } = req.body;
        if (!ngay || loai_truc === undefined) {
            return res.status(400).json({ ok: false, error: 'Thiếu thông tin ngày hoặc ca trực' });
        }

        const vn = getVietnamTime();
        if (ngay > vn.todayStr) {
            return res.status(400).json({ ok: false, error: `Không thể thao tác mở chốt cho ngày chưa đến (${ngay}).` });
        }

        const loaiTrucNum = Number(loai_truc);
        const whereClause = { ngay, loai_truc: loaiTrucNum };
        if (ma_phong_id) whereClause.ma_phong_id = ma_phong_id;

        // Xóa bản ghi chốt phòng trong DiemDanhPhong
        await DiemDanhPhong.destroy({ where: whereClause });

        // Xóa bản nháp liên quan để cho phép quét mới hoàn toàn
        await DiemDanhDraft.destroy({ where: whereClause });

        // Nếu reset_hs = true hoặc khi mở phòng kiểm thử, xóa trạng thái điểm danh của HS
        if (reset_hs && ma_phong_id) {
            const fieldPhong = loaiTrucNum === 0 ? 'ma_phong_an_id' : 'ma_phong_ngu_id';
            const students = await HocSinh.findAll({ where: { [fieldPhong]: ma_phong_id }, attributes: ['id'] });
            const sIds = students.map(s => s.id);
            if (sIds.length > 0) {
                if (loaiTrucNum === 0) {
                    await DiemDanhHS.update({ diem_danh_an: null, phuong_thuc_an: null, thoi_gian_diem_danh_an: null }, { where: { ngay, ma_hs_id: { [Op.in]: sIds } } });
                } else {
                    await DiemDanhHS.update({ diem_danh_ngu: null, phuong_thuc_ngu: null, thoi_gian_diem_danh_ngu: null }, { where: { ngay, ma_hs_id: { [Op.in]: sIds } } });
                }
            }
        }

        return res.json({
            ok: true,
            message: ma_phong_id ? `Đã mở chốt phòng ${ma_phong_id} thành công` : `Đã mở chốt ca trực ngày ${ngay} thành công`
        });
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

        const allRoomCodes = Object.keys(roomMap);

        // 1. Lấy toàn bộ số HS của các phòng trong 1 query duy nhất
        const allStudents = await HocSinh.findAll({
            where: { [fieldPhong]: { [Op.in]: allRoomCodes }, dang_hoc: true },
            attributes: ['id', fieldPhong]
        });
        const totalHsMap = {};
        const hsIdToRoomMap = {};
        allStudents.forEach(hs => {
            const r = hs[fieldPhong];
            totalHsMap[r] = (totalHsMap[r] || 0) + 1;
            hsIdToRoomMap[hs.id] = r;
        });

        // 2. Lấy toàn bộ kết quả điểm danh của ngày trong 1 query duy nhất
        const allDDRecords = await DiemDanhHS.findAll({
            where: { ngay: targetNgay },
            attributes: ['ma_hs_id', fieldStatus, fieldPhong]
        });
        const roomStatsMap = {};
        allDDRecords.forEach(r => {
            const room = r[fieldPhong] || hsIdToRoomMap[r.ma_hs_id];
            if (!room) return;
            if (!roomStatsMap[room]) roomStatsMap[room] = { comat: 0, vang: 0, phep: 0 };
            const st = r[fieldStatus];
            if (st === 0) roomStatsMap[room].comat++;
            else if (st === 1) roomStatsMap[room].vang++;
            else if (st === 2) roomStatsMap[room].phep++;
        });

        // 3. Lấy tên giáo viên chốt trong 1 query duy nhất
        const gvUserIds = [...new Set(phongStatuses.map(ps => ps.ma_gv_chot_id).filter(Boolean))];
        const staffUsers = gvUserIds.length > 0 ? await StaffUser.findAll({
            where: { id: { [Op.in]: gvUserIds } },
            attributes: ['id', 'fullname', 'username']
        }) : [];
        const gvNameMap = {};
        staffUsers.forEach(u => { gvNameMap[u.id] = u.fullname || u.username; });

        const result = [];
        for (const ma_phong of allRoomCodes) {
            const item = roomMap[ma_phong];
            const ps = statusMap[ma_phong];
            const dr = draftMap[ma_phong];

            const totalHs = totalHsMap[ma_phong] || 0;
            const stats = roomStatsMap[ma_phong] || { comat: 0, vang: 0, phep: 0 };
            const comat = stats.comat;
            const vang = stats.vang;
            const phep = stats.phep;

            const draftCount = (dr && Array.isArray(dr.danh_sach_hs))
                ? dr.danh_sach_hs.filter(x => x.status === 0).length
                : 0;

            const isCompleted = ps?.trang_thai_chot === 'da_chot' || Boolean(ps?.da_diem_danh);
            const tenGvChot = ps?.ma_gv_chot_id ? (gvNameMap[ps.ma_gv_chot_id] || null) : null;
            const isAutoChot = Boolean(isCompleted && (ps?.ma_gv_chot_id === null || !tenGvChot || ps?.ghi_chu_chot?.includes('Hệ thống')));
            const isGvChot = Boolean(isCompleted && !isAutoChot);

            result.push({
                ma_phong,
                phong: item.phong,
                giao_vien: item.giao_vien,
                total_hs: totalHs,
                is_completed: isCompleted,
                is_auto_chot: isAutoChot,
                is_gv_chot: isGvChot,
                trang_thai_chot: isCompleted ? 'da_chot' : 'chua_chot',
                thoi_gian_chot: ps?.thoi_gian || null,
                ghi_chu_chot: ps?.ghi_chu_chot || null,
                ma_gv_chot_id: ps?.ma_gv_chot_id || null,
                ten_gv_chot: tenGvChot,
                draft_count: draftCount,
                stats: { comat, vang, phep, chua_diem_danh: Math.max(0, totalHs - (comat + vang + phep)) }
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
        if (!cauhinh) {
            tasks.push(CauHinhHeThong.findOrCreate({ where: { id: 1 }, defaults: { nam_hoc: '2026-2027', nguoi_phu_trach: 'Vũ Quốc Phong', ten_truong: 'LÊ THỊ HỒNG GẤM' } }).then(([ch]) => {
                const plain = ch.toJSON();
                appCache.set('cauhinh_hethong', plain);
                return plain;
            }));
        }

        const results = await Promise.all(tasks);
        const records = results[0];

        // Lấy danh sách phòng: chỉ lấy phòng đang dùng (dang_dung = true),
        // và chỉ nạp thêm phòng cũ nếu tuần này THỰC SỰ có ca trực lịch sử ở phòng đó.
        const activePhongs = await Phong.findAll({
            where: { dang_dung: true },
            attributes: ['ma_phong', 'loai_phong', 'gioi_tinh', 'dang_dung'],
            order: [['loai_phong', 'ASC'], ['ma_phong', 'ASC']]
        });
        const activeCodes = new Set(activePhongs.map(p => p.ma_phong));
        const recordRoomCodes = new Set(records.map(r => r.ma_phong_id).filter(Boolean));
        const missingHistoricalCodes = [...recordRoomCodes].filter(code => !activeCodes.has(code));
        let extraPhongs = [];
        if (missingHistoricalCodes.length > 0) {
            extraPhongs = await Phong.findAll({
                where: { ma_phong: missingHistoricalCodes },
                attributes: ['ma_phong', 'loai_phong', 'gioi_tinh', 'dang_dung'],
                order: [['loai_phong', 'ASC'], ['ma_phong', 'ASC']]
            });
        }
        const phong_list = [...activePhongs.map(p => p.toJSON()), ...extraPhongs.map(p => p.toJSON())];

        return res.json({
            ok: true,
            records,
            tuan,
            gv_list: gv_list || appCache.get('gv_active_list') || [],
            phong_list,
            nam_hoc: cauhinh?.nam_hoc || appCache.get('cauhinh_hethong')?.nam_hoc || '2026-2027',
            nguoi_phu_trach: cauhinh?.nguoi_phu_trach || appCache.get('cauhinh_hethong')?.nguoi_phu_trach || 'Vũ Quốc Phong',
            ten_truong: cauhinh?.ten_truong || appCache.get('cauhinh_hethong')?.ten_truong || 'LÊ THỊ HỒNG GẤM'
        });
    } catch (err) { return res.status(500).json({ ok: false, error: err.message }); }
});

/** GET /api/lichtruc/month/?thang=YYYY-MM */
router.get('/api/lichtruc/month/', loginRequired, async (req, res) => {
    try {
        const [year, month] = (req.query.thang || new Date().toISOString().slice(0, 7)).split('-');
        const start = `${year}-${month}-01`;
        const end = getLastDayYMD(year, month);
        const records = await PhanCongTrucGV.findAll({
            where: { ngay: { [Op.between]: [start, end] } },
            include: [{ association: 'giao_vien', attributes: ['id', 'ho_ten'] }, { association: 'phong', attributes: ['ma_phong', 'loai_phong'] }],
            order: [['ngay', 'ASC']],
        });
        return res.json({ ok: true, records, thang: `${year}-${month}` });
    } catch (err) { return res.status(500).json({ ok: false, error: err.message }); }
});

const ALLOWED_CLUSTERS = [
    ['P6', 'P7', 'P8'],
    ['P3', 'P4', 'P5'],
    ['D21', 'D22', 'D23'],
    ['D11', 'D12', 'D13'],
    ['D31', 'D32', 'D33'],
    ['D41', 'D42', 'D43'],
    ['C11', 'C12'],
    ['C13', 'C14']
];

function areRoomsInSameCluster(rA, rB) {
    if (rA === rB) return true;
    return ALLOWED_CLUSTERS.some(cluster => cluster.includes(rA) && cluster.includes(rB));
}

/** POST /api/lichtruc/save/ */
router.post('/api/lichtruc/save/', loginRequired, roleRequired('admin', 'quan_ly'), async (req, res) => {
    const t = await sequelize.transaction();
    try {
        const { id, ma_gv_id, ma_phong_id, ngay, loai_truc, xac_nhan_truc, ma_gv_truc_thay_id, ten_gv_truc_thay, nhiem_vu } = req.body;
        const isNgoai = Boolean(ten_gv_truc_thay && String(ten_gv_truc_thay).trim());
        const phong = await Phong.findByPk(ma_phong_id, { transaction: t });
        if (!phong || phong.loai_phong !== parseInt(loai_truc)) {
            await t.rollback();
            return res.status(400).json({ ok: false, error: 'Loại phòng không khớp loại ca trực' });
        }

        const gv = await GiaoVien.findByPk(ma_gv_id, { transaction: t });
        if (!gv) {
            await t.rollback();
            return res.status(400).json({ ok: false, error: 'Giáo viên không tồn tại' });
        }

        // RÀNG BUỘC: Không cho sửa phân công khi ca trực phòng này đã chốt sổ (trừ Super Admin)
        const isFinalized = await DiemDanhPhong.findOne({
            where: {
                ngay,
                loai_truc: parseInt(loai_truc),
                ma_phong_id,
                [Op.or]: [
                    { trang_thai_chot: { [Op.in]: ['da_chot', 'tu_dong_chot'] } },
                    { da_diem_danh: true }
                ]
            },
            transaction: t
        });
        const currentUser = req.user || req.session?.user;
        if (isFinalized && !currentUser?.is_superuser && !currentUser?.is_admin) {
            await t.rollback();
            return res.status(403).json({ ok: false, error: 'Ca trực phòng này đã được chốt sổ điểm danh, không thể thay đổi phân công.' });
        }

        // 1. KIỂM TRA GIỚI TÍNH (Cho phòng ngủ) - Chỉ kiểm tra nếu là GV trong trường
        if (!isNgoai) {
            const targetGvId = ma_gv_truc_thay_id || ma_gv_id;
            const targetGv = targetGvId === ma_gv_id ? gv : await GiaoVien.findByPk(targetGvId, { transaction: t });

            if (phong.loai_phong === 1 && phong.gioi_tinh !== null && !ma_gv_truc_thay_id) {
                if (targetGv.gioi_tinh !== phong.gioi_tinh) {
                    await t.rollback();
                    return res.status(400).json({ ok: false, error: `Phòng ngủ ${phong.gioi_tinh === 0 ? 'Nam' : 'Nữ'} chỉ cho phép giáo viên ${phong.gioi_tinh === 0 ? 'Nam' : 'Nữ'} trực.` });
                }
            }

            // 2. KIỂM TRA PHÂN CÔNG PHÒNG & CỤM PHÒNG LIÊN THÔNG
            const otherAssignments = await PhanCongTrucGV.findAll({
                where: {
                    ngay,
                    loai_truc: parseInt(loai_truc),
                    [Op.or]: [
                        { ma_gv_id: targetGvId, ma_gv_truc_thay_id: null },
                        { ma_gv_truc_thay_id: targetGvId }
                    ],
                    id: { [Op.ne]: id || 0 }
                },
                transaction: t
            });

            for (const existing of otherAssignments) {
                if (existing.ma_phong_id === ma_phong_id) {
                    await t.rollback();
                    return res.status(400).json({ ok: false, error: `Giáo viên ${targetGv.ho_ten} đã có trong danh sách phân công tại phòng ${ma_phong_id} trong ca trực này rồi.` });
                }
            }
        }

        const assignedNV = nhiem_vu !== undefined && nhiem_vu !== null ? parseInt(nhiem_vu) : (gv.nhiem_vu || 0);

        // RÀNG BUỘC TRỰC THAY
        if (ma_gv_truc_thay_id && !isNgoai) {
            if (parseInt(ma_gv_truc_thay_id) === parseInt(ma_gv_id)) {
                await t.rollback();
                return res.status(400).json({ ok: false, error: 'Giáo viên không thể trực thay cho chính mình' });
            }
        } else if (!isNgoai && !ma_gv_truc_thay_id) {
            // CHỈ KIỂM TRA GIỚI HẠN KHI THÊM MỚI (KHÔNG PHẢI TRỰC THAY)
            const slToiDa = assignedNV === 0 ? (phong.sl_diem_danh || 1) : (phong.sl_ho_tro || 1);
            const hienTai = await PhanCongTrucGV.count({
                where: { ma_phong_id, ngay, loai_truc: parseInt(loai_truc), nhiem_vu: assignedNV, id: { [Op.ne]: id || 0 } },
                transaction: t
            });

            if (hienTai >= slToiDa) {
                await t.rollback();
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
            ma_gv_truc_thay_id: isNgoai ? null : (ma_gv_truc_thay_id || null),
            ten_gv_truc_thay: isNgoai ? String(ten_gv_truc_thay).trim() : null,
            ngay_cap_nhat: new Date(),
            nguoi_cap_nhat_id: req.session?.user?.id || null,
        };

        const fetchFull = async (recordId) => PhanCongTrucGV.findByPk(recordId, {
            include: [
                { association: 'giao_vien', attributes: ['id', 'ho_ten', 'nhiem_vu', 'gioi_tinh'] },
                { association: 'giao_vien_truc_thay', attributes: ['id', 'ho_ten', 'nhiem_vu'] },
            ],
            transaction: t
        });

        if (id) {
            await PhanCongTrucGV.update(data, { where: { id }, transaction: t });
            const updated = await fetchFull(id);
            await t.commit();
            return res.json({ ok: true, message: 'Cập nhật phân công thành công', record: updated });
        }

        const pc = await PhanCongTrucGV.create(data, { transaction: t });
        const full = await fetchFull(pc.id);
        await t.commit();
        return res.json({ ok: true, message: 'Tạo phân công thành công', record: full });
    } catch (err) {
        await t.rollback();
        return res.status(500).json({ ok: false, error: err.message });
    }
});

/** POST /api/lichtruc/delete/ */
router.post('/api/lichtruc/delete/', loginRequired, roleRequired('admin', 'quan_ly'), async (req, res) => {
    try {
        const { id } = req.body;
        const pc = await PhanCongTrucGV.findByPk(id);
        if (!pc) return res.status(404).json({ ok: false, error: 'Không tìm thấy phân công' });

        const isFinalized = await DiemDanhPhong.findOne({
            where: {
                ngay: pc.ngay,
                loai_truc: pc.loai_truc,
                ma_phong_id: pc.ma_phong_id,
                [Op.or]: [
                    { trang_thai_chot: { [Op.in]: ['da_chot', 'tu_dong_chot'] } },
                    { da_diem_danh: true }
                ]
            }
        });
        const currentUser = req.user || req.session?.user;
        if (isFinalized && !currentUser?.is_superuser && !currentUser?.is_admin) {
            return res.status(403).json({ ok: false, error: 'Ca trực phòng này đã được chốt sổ điểm danh, không thể xóa phân công.' });
        }

        await PhanCongTrucGV.destroy({ where: { id } });
        return res.json({ ok: true, message: 'Đã xóa phân công' });
    } catch (err) { return res.status(500).json({ ok: false, error: err.message }); }
});

/** POST /admin/lichtruc/:pk/xoa/ */
router.post('/admin/lichtruc/:pk/xoa/', loginRequired, roleRequired('admin', 'quan_ly'), async (req, res) => {
    try {
        const pc = await PhanCongTrucGV.findByPk(req.params.pk);
        if (!pc) return res.status(404).json({ ok: false, error: 'Không tìm thấy phân công' });

        const isFinalized = await DiemDanhPhong.findOne({
            where: {
                ngay: pc.ngay,
                loai_truc: pc.loai_truc,
                ma_phong_id: pc.ma_phong_id,
                [Op.or]: [
                    { trang_thai_chot: { [Op.in]: ['da_chot', 'tu_dong_chot'] } },
                    { da_diem_danh: true }
                ]
            }
        });
        const currentUser = req.user || req.session?.user;
        if (isFinalized && !currentUser?.is_superuser && !currentUser?.is_admin) {
            return res.status(403).json({ ok: false, error: 'Ca trực phòng này đã được chốt sổ điểm danh, không thể xóa phân công.' });
        }

        await PhanCongTrucGV.destroy({ where: { id: req.params.pk } });
        return res.json({ ok: true, message: 'Đã xóa' });
    } catch (err) { return res.status(500).json({ ok: false, error: err.message }); }
});

/** GET /api/lichtruc/day/?ngay=YYYY-MM-DD - Lấy danh sách phân công trực theo ngày cho điểm danh */
router.get('/api/lichtruc/day/', loginRequired, roleRequired('admin', 'quan_ly'), async (req, res) => {
    try {
        const ngay = req.query.ngay || new Date().toISOString().split('T')[0];
        const records = await PhanCongTrucGV.findAll({
            where: { ngay },
            include: [
                { association: 'giao_vien', attributes: ['id', 'ho_ten', 'gioi_tinh', 'nhiem_vu'] },
                { association: 'giao_vien_truc_thay', attributes: ['id', 'ho_ten', 'gioi_tinh', 'nhiem_vu'] },
                { association: 'phong', attributes: ['ma_phong', 'loai_phong', 'gioi_tinh', 'sl_diem_danh', 'sl_ho_tro'] },
            ],
            order: [
                ['loai_truc', 'ASC'],
                ['ma_phong_id', 'ASC'],
                ['nhiem_vu', 'ASC']
            ],
        });
        return res.json({ ok: true, records, ngay });
    } catch (err) {
        return res.status(500).json({ ok: false, error: err.message });
    }
});

/** POST /api/lichtruc/diem-danh/ - Cập nhật trạng thái điểm danh cho 1 ca */
router.post('/api/lichtruc/diem-danh/', loginRequired, roleRequired('admin', 'quan_ly'), async (req, res) => {
    try {
        const { id, xac_nhan_truc } = req.body;
        if (!id) return res.status(400).json({ ok: false, error: 'Thiếu id phân công' });

        const pc = await PhanCongTrucGV.findByPk(id);
        if (!pc) return res.status(404).json({ ok: false, error: 'Không tìm thấy phân công' });

        const vn = getVietnamTime();
        if (pc.ngay > vn.todayStr) {
            return res.status(400).json({ ok: false, error: `Không thể điểm danh giáo viên trực cho ngày chưa đến (${pc.ngay}).` });
        }

        await pc.update({
            xac_nhan_truc: xac_nhan_truc !== false,
            ngay_cap_nhat: new Date(),
            nguoi_cap_nhat_id: req.session?.user?.id || null,
        });

        return res.json({ ok: true, message: 'Đã cập nhật điểm danh', xac_nhan_truc: pc.xac_nhan_truc, id });
    } catch (err) {
        return res.status(500).json({ ok: false, error: err.message });
    }
});

/** POST /api/lichtruc/diem-danh-all/ - Điểm danh tất cả có mặt trong ngày/ca */
router.post('/api/lichtruc/diem-danh-all/', loginRequired, roleRequired('admin', 'quan_ly'), async (req, res) => {
    try {
        const { ngay, xac_nhan_truc = true, loai_truc } = req.body;
        if (!ngay) return res.status(400).json({ ok: false, error: 'Thiếu ngày' });

        const vn = getVietnamTime();
        if (ngay > vn.todayStr) {
            return res.status(400).json({ ok: false, error: `Không thể điểm danh giáo viên trực cho ngày chưa đến (${ngay}).` });
        }

        const where = { ngay };
        if (loai_truc !== undefined && loai_truc !== null && loai_truc !== '') {
            where.loai_truc = parseInt(loai_truc);
        }

        const [count] = await PhanCongTrucGV.update(
            {
                xac_nhan_truc: xac_nhan_truc !== false,
                ngay_cap_nhat: new Date(),
                nguoi_cap_nhat_id: req.session?.user?.id || null,
            },
            { where }
        );

        return res.json({ ok: true, message: `Đã cập nhật ${count} ca trực thành công`, count });
    } catch (err) {
        return res.status(500).json({ ok: false, error: err.message });
    }
});

/** POST /api/lichtruc/huy-truc-thay/ - Hủy trực thay, đưa ca về lại giáo viên ban đầu */
router.post('/api/lichtruc/huy-truc-thay/', loginRequired, roleRequired('admin', 'quan_ly'), async (req, res) => {
    try {
        const { id } = req.body;
        if (!id) return res.status(400).json({ ok: false, error: 'Thiếu id phân công' });

        const pc = await PhanCongTrucGV.findByPk(id);
        if (!pc) return res.status(404).json({ ok: false, error: 'Không tìm thấy phân công' });

        // RÀNG BUỘC: Không cho hủy trực thay khi ca trực phòng này đã chốt sổ (trừ Super Admin)
        const isFinalized = await DiemDanhPhong.findOne({
            where: {
                ngay: pc.ngay,
                loai_truc: pc.loai_truc,
                ma_phong_id: pc.ma_phong_id,
                [Op.or]: [
                    { trang_thai_chot: { [Op.in]: ['da_chot', 'tu_dong_chot'] } },
                    { da_diem_danh: true }
                ]
            }
        });
        const currentUser = req.user || req.session?.user;
        if (isFinalized && !currentUser?.is_superuser && !currentUser?.is_admin) {
            return res.status(403).json({ ok: false, error: 'Ca trực phòng này đã được chốt sổ điểm danh, không thể thay đổi phân công.' });
        }

        await pc.update({
            ma_gv_truc_thay_id: null,
            ten_gv_truc_thay: null,
            ngay_cap_nhat: new Date(),
            nguoi_cap_nhat_id: req.session?.user?.id || null,
        });

        const updated = await PhanCongTrucGV.findByPk(id, {
            include: [
                { association: 'giao_vien', attributes: ['id', 'ho_ten', 'nhiem_vu', 'gioi_tinh'] },
                { association: 'giao_vien_truc_thay', attributes: ['id', 'ho_ten', 'nhiem_vu'] },
            ]
        });

        return res.json({ ok: true, message: 'Đã hủy trực thay thành công', record: updated });
    } catch (err) {
        return res.status(500).json({ ok: false, error: err.message });
    }
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
    const t = await sequelize.transaction();
    try {
        const { ma_phong_id, ma_gv_id, thu, nhiem_vu = 0 } = req.body;

        // 1. Kiểm tra tồn tại
        const phong = await Phong.findByPk(ma_phong_id, { transaction: t });
        const gv = await GiaoVien.findByPk(ma_gv_id, { transaction: t });
        if (!phong || !gv) {
            await t.rollback();
            return res.status(400).json({ ok: false, error: 'Phòng hoặc Giáo viên không tồn tại' });
        }

        // 2. Ràng buộc giới tính phòng ngủ
        if (phong.loai_phong === 1 && phong.gioi_tinh !== null && gv.gioi_tinh !== phong.gioi_tinh) {
            await t.rollback();
            return res.status(400).json({ ok: false, error: `Phòng ngủ ${phong.gioi_tinh === 0 ? 'Nam' : 'Nữ'} chỉ cho phép giáo viên ${phong.gioi_tinh === 0 ? 'Nam' : 'Nữ'} trực.` });
        }

        // 3. Kiểm tra giới hạn số lượng GV theo nhiem_vu
        const slToiDa = nhiem_vu === 0 ? (phong.sl_diem_danh || 1) : (phong.sl_ho_tro || 1);
        const hienTai = await LichTrucCoDinh.count({
            where: { ma_phong_id, thu: parseInt(thu), nhiem_vu: parseInt(nhiem_vu) },
            transaction: t
        });

        if (hienTai >= slToiDa) {
            await t.rollback();
            return res.status(400).json({
                ok: false,
                error: `Phòng ${ma_phong_id} đã đủ số lượng GV ${nhiem_vu === 0 ? 'điểm danh' : 'hỗ trợ'} cho ngày này (Tối đa: ${slToiDa})`
            });
        }

        const [item, created] = await LichTrucCoDinh.findOrCreate({
            where: { ma_gv_id, thu: parseInt(thu), ma_phong_id },
            defaults: { ma_phong_id, ma_gv_id, thu: parseInt(thu), nhiem_vu: parseInt(nhiem_vu) },
            transaction: t
        });

        // Nếu đã tồn tại nhưng đổi nhiem_vu
        if (!created && item.nhiem_vu !== parseInt(nhiem_vu)) {
            await item.update({ nhiem_vu: parseInt(nhiem_vu) }, { transaction: t });
        }

        await t.commit();
        return res.json({ ok: true, message: created ? 'Thêm lịch khung thành công' : 'Lịch khung đã tồn tại', id: item.id });
    } catch (err) {
        await t.rollback();
        return res.status(500).json({ ok: false, error: err.message });
    }
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

/** POST /api/lichtruc_khung/auto/ - [DEPRECATED] Không sử dụng xếp lịch tự động */
router.post('/api/lichtruc_khung/auto/', loginRequired, roleRequired('admin', 'quan_ly'), async (req, res) => {
    return res.status(400).json({
        ok: false,
        error: 'Chức năng xếp lịch tự động đã ngừng hoạt động. Lịch phân công cố định do Ban Quản trị xếp trực tiếp để đảm bảo tính chính xác.'
    });
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

/** GET /api/baocao/diemdanh/?loai=&thang=&nam=&lop=&tu_ngay=&den_ngay= */
router.get('/api/baocao/diemdanh/', loginRequired, async (req, res) => {
    try {
        const { loai, thang, nam, lop, tu_ngay, den_ngay } = req.query;
        let start, end;
        if (tu_ngay && den_ngay) {
            if (tu_ngay > den_ngay) {
                return res.status(400).json({ ok: false, error: 'Từ ngày không được lớn hơn Đến ngày' });
            }
            start = tu_ngay;
            end = den_ngay;
        } else {
            const year = nam || new Date().getFullYear();
            const month = thang || (new Date().getMonth() + 1);
            start = `${year}-${String(month).padStart(2, '0')}-01`;
            end = getLastDayYMD(year, month);
        }

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

        return res.json({ ok: true, data, tu_ngay: start, den_ngay: end, thang: `${start.slice(0, 7)}` });
    } catch (err) { return res.status(500).json({ ok: false, error: err.message }); }
});

/** GET /api/baocao/hs-vang-ngay/?ngay=YYYY-MM-DD&loai=all|an|ngu&lop= */
router.get('/api/baocao/hs-vang-ngay/', loginRequired, async (req, res) => {
    try {
        const { ngay, loai = 'all', lop } = req.query;
        const targetDate = ngay || new Date().toISOString().split('T')[0];

        // 1. Lọc danh sách học sinh đang học
        const hsWhere = { dang_hoc: true };
        if (lop) hsWhere.lop = lop;

        const hsList = await HocSinh.findAll({
            where: hsWhere,
            attributes: ['id', 'ho_ten', 'lop', 'gioi_tinh', 'ma_phong_an_id', 'ma_phong_ngu_id', 'ngay_vao', 'ngay_rut'],
            order: [['lop', 'ASC'], ['ho_ten', 'ASC']]
        });
        const hsMap = {};
        const hsIds = [];
        hsList.forEach(h => {
            if (h.ngay_vao && targetDate < h.ngay_vao) return;
            if (h.ngay_rut && targetDate >= h.ngay_rut) return;
            if (h.dang_hoc === false && (!h.ngay_rut || targetDate >= h.ngay_rut)) return;
            hsMap[h.id] = h;
            hsIds.push(h.id);
        });

        // 2. Lấy dữ liệu điểm danh của ngày này (kèm snapshot phòng)
        const ddRecords = await DiemDanhHS.findAll({
            where: {
                ngay: targetDate,
                ma_hs_id: { [Op.in]: hsIds }
            },
            attributes: ['ma_hs_id', 'ngay', 'diem_danh_an', 'diem_danh_ngu', 'ghi_chu', 'thoi_gian_diem_danh_an', 'thoi_gian_diem_danh_ngu', 'ma_phong_an_id', 'ma_phong_ngu_id']
        });

        const ddMap = {};
        ddRecords.forEach(r => {
            ddMap[r.ma_hs_id] = r;
        });

        // 3. Lọc danh sách học sinh vắng / phép
        let tong_vang_an = 0;
        let tong_phep_an = 0;
        let tong_vang_ngu = 0;
        let tong_phep_ngu = 0;

        const danh_sach = [];

        hsIds.forEach(id => {
            const hs = hsMap[id];
            const dd = ddMap[id] || {};
            const an = dd.diem_danh_an;
            const ngu = dd.diem_danh_ngu;

            if (an === 1) tong_vang_an++;
            if (an === 2) tong_phep_an++;
            if (ngu === 1) tong_vang_ngu++;
            if (ngu === 2) tong_phep_ngu++;

            let isMatch = false;
            if (loai === 'an') {
                isMatch = (an === 1 || an === 2);
            } else if (loai === 'ngu') {
                isMatch = (ngu === 1 || ngu === 2);
            } else {
                isMatch = (an === 1 || an === 2 || ngu === 1 || ngu === 2);
            }

            if (isMatch) {
                danh_sach.push({
                    id: hs.id,
                    ho_ten: hs.ho_ten,
                    lop: hs.lop,
                    gioi_tinh: hs.gioi_tinh,
                    ma_phong_an_id: dd.ma_phong_an_id || hs.ma_phong_an_id,
                    ma_phong_ngu_id: dd.ma_phong_ngu_id || hs.ma_phong_ngu_id,
                    diem_danh_an: an !== undefined ? an : null,
                    diem_danh_ngu: ngu !== undefined ? ngu : null,
                    ghi_chu: dd.ghi_chu || null,
                    thoi_gian_diem_danh_an: dd.thoi_gian_diem_danh_an || null,
                    thoi_gian_diem_danh_ngu: dd.thoi_gian_diem_danh_ngu || null,
                });
            }
        });

        // 4. Lấy cấu hình hệ thống
        const cauhinh = await CauHinhHeThong.findByPk(1);

        return res.json({
            ok: true,
            ngay: targetDate,
            loai,
            lop: lop || null,
            nam_hoc: cauhinh?.nam_hoc || '2026-2027',
            ten_truong: cauhinh?.ten_truong || 'LÊ THỊ HỒNG GẤM',
            nguoi_phu_trach: cauhinh?.nguoi_phu_trach || 'Vũ Quốc Phong',
            tong_hs: hsIds.length,
            tong_vang_an,
            tong_phep_an,
            tong_vang_ngu,
            tong_phep_ngu,
            so_luong_loc: danh_sach.length,
            danh_sach
        });
    } catch (err) {
        return res.status(500).json({ ok: false, error: err.message });
    }
});

/** GET /api/baocao/export-an/?thang=MM&nam=YYYY - Xuất báo cáo điểm danh ăn chính thức theo tháng */
router.get('/api/baocao/export-an/', loginRequired, async (req, res) => {
    try {
        const { thang, nam } = req.query;
        const year = parseInt(nam) || new Date().getFullYear();
        const month = parseInt(thang) || (new Date().getMonth() + 1);
        const start = `${year}-${String(month).padStart(2, '0')}-01`;
        const end = getLastDayYMD(year, month);

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

        // 4b. Lấy toàn bộ dữ liệu điểm danh ăn trong tháng (kèm snapshot phòng)
        const ddRecords = await DiemDanhHS.findAll({
            where: { ma_hs_id: { [Op.in]: hsIds }, ngay: { [Op.between]: [start, end] } },
            attributes: ['ma_hs_id', 'ngay', 'diem_danh_an', 'ma_phong_an_id'],
        });

        // Lịch sử phân phòng ăn có hiệu lực trong tháng này
        const lsAnRecords = await LichSuPhanPhong.findAll({
            where: {
                loai_phong: 0,
                tu_ngay: { [Op.lte]: end },
                [Op.or]: [
                    { den_ngay: null },
                    { den_ngay: { [Op.gte]: start } },
                ],
            },
            attributes: ['ma_hs_id', 'ma_phong_id', 'tu_ngay'],
            order: [['tu_ngay', 'ASC']],
        });
        const studentRoomMapAn = {};
        lsAnRecords.forEach(r => { studentRoomMapAn[r.ma_hs_id] = r.ma_phong_id; });
        ddRecords.forEach(r => {
            if (r.ma_phong_an_id) studentRoomMapAn[r.ma_hs_id] = r.ma_phong_an_id;
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
            const maPhong = studentRoomMapAn[hs.id] || hs.phong_an?.ma_phong;
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
            phong_list: phongList.filter(p => dataByPhong[p.ma_phong] && dataByPhong[p.ma_phong].length > 0).map(p => p.ma_phong),
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
        const end = getLastDayYMD(year, month);

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

        // 4b. Điểm danh ngủ trong tháng (kèm snapshot phòng)
        const ddRecords = await DiemDanhHS.findAll({
            where: { ma_hs_id: { [Op.in]: hsIds }, ngay: { [Op.between]: [start, end] } },
            attributes: ['ma_hs_id', 'ngay', 'diem_danh_ngu', 'ma_phong_ngu_id'],
        });

        // Lịch sử phân phòng ngủ có hiệu lực trong tháng này
        const lsNguRecords = await LichSuPhanPhong.findAll({
            where: {
                loai_phong: 1,
                tu_ngay: { [Op.lte]: end },
                [Op.or]: [
                    { den_ngay: null },
                    { den_ngay: { [Op.gte]: start } },
                ],
            },
            attributes: ['ma_hs_id', 'ma_phong_id', 'tu_ngay'],
            order: [['tu_ngay', 'ASC']],
        });
        const studentRoomMapNgu = {};
        lsNguRecords.forEach(r => { studentRoomMapNgu[r.ma_hs_id] = r.ma_phong_id; });
        ddRecords.forEach(r => {
            if (r.ma_phong_ngu_id) studentRoomMapNgu[r.ma_hs_id] = r.ma_phong_ngu_id;
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
            const maPhong = studentRoomMapNgu[hs.id] || hs.phong_ngu?.ma_phong;
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
            phong_list: phongList.filter(p => dataByPhong[p.ma_phong] && dataByPhong[p.ma_phong].length > 0).map(p => p.ma_phong),
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
router.get('/api/baocao/tong-hop-lop/', loginRequired, roleRequired('admin', 'quan_ly', 'ke_toan', 'hieu_truong'), async (req, res) => {
    try {
        const { thang, nam, lop, tu_ngay, den_ngay, dot } = req.query;
        const year = parseInt(nam) || new Date().getFullYear();
        const month = parseInt(thang) || (new Date().getMonth() + 1);
        const start = tu_ngay || `${year}-${String(month).padStart(2, '0')}-01`;
        const end = den_ngay || getLastDayYMD(year, month);

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

        // 5. Giá ăn từ Cấu hình giá (loại 2 = Suất ăn HS) hoặc Thiết lập hệ thống
        const [cauhinh] = await CauHinhHeThong.findOrCreate({
            where: { id: 1 },
            defaults: { nam_hoc: '2026-2027', nguoi_phu_trach: 'Người phụ trách', tien_an: 38000 }
        });
        const defaultTienAn = cauhinh?.tien_an || 38000;
        const customGiaAn = (req.query.don_gia_an !== undefined && req.query.don_gia_an !== '' && req.query.don_gia_an !== 'null')
            ? parseFloat(req.query.don_gia_an)
            : null;

        // Lấy lịch sử giá suất ăn HS
        const allGiaTienAnHS = await CauHinhGia.findAll({
            where: { loai_truc: 2, ngay_ap_dung: { [Op.lte]: end } },
            order: [['ngay_ap_dung', 'ASC']],
            raw: true,
        });

        const getDonGiaTienAnHS = (ngay) => {
            if (customGiaAn !== null && !isNaN(customGiaAn) && customGiaAn > 0) {
                return customGiaAn;
            }
            const matched = allGiaTienAnHS.filter(g => g.ngay_ap_dung <= ngay).pop();
            return matched ? parseFloat(matched.don_gia) : defaultTienAn;
        };
        const giaAn = (customGiaAn !== null && !isNaN(customGiaAn) && customGiaAn > 0) ? customGiaAn : getDonGiaTienAnHS(end);
        const giaNgu = 0;

        // 6. Tính toán từng HS
        const data = hsList.map(hs => {
            const recs = ddMap[hs.id] || {};
            // Số ngày HS phải tham gia: nằm trong khoảng [hs.ngay_vao, hs.ngay_rut] VÀ được phép theo ngày đặc biệt
            const phaiAn = ngayAn.filter(ngay => {
                if (hs.ngay_vao && ngay < hs.ngay_vao) return false;
                if (hs.ngay_rut && ngay >= hs.ngay_rut) return false;
                if (hs.dang_hoc === false && (!hs.ngay_rut || ngay >= hs.ngay_rut)) return false;
                return isHsAllowed(hs, cauhinhNgayMap[ngay] || null);
            });
            const phaiNgu = ngayNgu.filter(ngay => {
                if (hs.ngay_vao && ngay < hs.ngay_vao) return false;
                if (hs.ngay_rut && ngay >= hs.ngay_rut) return false;
                if (hs.dang_hoc === false && (!hs.ngay_rut || ngay >= hs.ngay_rut)) return false;
                return isHsAllowed(hs, cauhinhNgayMap[ngay] || null);
            });

            const vangAn = phaiAn.filter(ng => recs[ng]?.an === 1).length;
            const phepAn = phaiAn.filter(ng => recs[ng]?.an === 2).length;
            const coMatAn = phaiAn.filter(ng => recs[ng]?.an === 0).length; // Chỉ tính những buổi thực tế điểm danh có mặt (an === 0)

            const vangNgu = phaiNgu.filter(ng => recs[ng]?.ngu === 1).length;
            const phepNgu = phaiNgu.filter(ng => recs[ng]?.ngu === 2).length;
            const coMatNgu = phaiNgu.filter(ng => recs[ng]?.ngu === 0).length;

            const buoiAnThucTe = coMatAn;
            const buoiNguThucTe = coMatNgu;

            let tienAn = 0;
            phaiAn.forEach(ng => {
                if (recs[ng]?.an !== 2) { // Không có phép (vắng vẫn tính tiền ăn, chỉ phép mới trừ)
                    tienAn += getDonGiaTienAnHS(ng);
                }
            });
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


        return res.json({
            ok: true,
            so_thang: month, so_nam: year,
            dot: dot || null,
            tu_ngay: start, den_ngay: end,
            tong_buoi_an: ngayAn.length, tong_buoi_ngu: ngayNgu.length,
            gia_an: giaAn, gia_ngu: giaNgu,
            nam_hoc: cauhinh.nam_hoc,
            nguoi_phu_trach: cauhinh.nguoi_phu_trach,
            data,
        });
    } catch (err) { return res.status(500).json({ ok: false, error: err.message }); }
});

/**
 * GET /api/baocao/suat-an-thang/?thang=MM&nam=YYYY
 * Báo cáo tổng hợp số lượng suất ăn hàng ngày theo tháng cho bên cung cấp suất ăn bán trú
 */
router.get('/api/baocao/suat-an-thang/', loginRequired, async (req, res) => {
    try {
        const { thang, nam, tu_ngay, den_ngay } = req.query;
        const year = parseInt(nam) || new Date().getFullYear();
        const month = parseInt(thang) || (new Date().getMonth() + 1);
        const pMonth = String(month).padStart(2, '0');
        const lastDayNum = new Date(year, month, 0).getDate();

        // Xác định khoảng thời gian báo cáo: hỗ trợ chu kỳ tuần có ngày từ tháng cũ (vd: bắt đầu từ 30/09 cho tháng 10)
        const start = (tu_ngay && /^\d{4}-\d{2}-\d{2}$/.test(tu_ngay))
            ? tu_ngay
            : `${year}-${pMonth}-01`;
        const end = (den_ngay && /^\d{4}-\d{2}-\d{2}$/.test(den_ngay))
            ? den_ngay
            : `${year}-${pMonth}-${String(lastDayNum).padStart(2, '0')}`;

        // 1. Lấy các ngày có bán trú trong khoảng [start, end] từ PhanCongTrucGV (loai_truc: 0) và DiemDanhHS (diem_danh_an)
        const [pcAn, ddDates, cauhinhNgayList] = await Promise.all([
            PhanCongTrucGV.findAll({
                where: { ngay: { [Op.between]: [start, end] }, loai_truc: 0 },
                attributes: [[sequelize.fn('DISTINCT', sequelize.col('ngay')), 'ngay']],
                raw: true,
            }),
            DiemDanhHS.findAll({
                where: {
                    ngay: { [Op.between]: [start, end] },
                    diem_danh_an: { [Op.ne]: null }
                },
                attributes: [[sequelize.fn('DISTINCT', sequelize.col('ngay')), 'ngay']],
                raw: true,
            }),
            CauHinhNgay.findAll({
                where: { ngay: { [Op.between]: [start, end] } },
            }),
        ]);

        const cauhinhNgayMap = {};
        cauhinhNgayList.forEach(c => { cauhinhNgayMap[c.ngay] = c; });

        const dateSet = new Set();
        pcAn.forEach(r => { if (r.ngay) dateSet.add(r.ngay); });
        ddDates.forEach(r => { if (r.ngay) dateSet.add(r.ngay); });

        // Nếu chưa có lịch phân công hoặc điểm danh, tự động lấy các ngày trong tuần (T2 - T6) không bị cấu hình nghỉ
        if (dateSet.size === 0) {
            let curr = new Date(start + 'T00:00:00');
            const stop = new Date(end + 'T00:00:00');
            while (curr <= stop) {
                const dow = curr.getDay();
                const curY = curr.getFullYear();
                const curM = String(curr.getMonth() + 1).padStart(2, '0');
                const curD = String(curr.getDate()).padStart(2, '0');
                const dStr = `${curY}-${curM}-${curD}`;
                if (dow >= 1 && dow <= 5) {
                    if (!cauhinhNgayMap[dStr] || !cauhinhNgayMap[dStr].is_nghi) {
                        dateSet.add(dStr);
                    }
                }
                curr.setDate(curr.getDate() + 1);
            }
        }

        // Lọc bỏ những ngày cấu hình toàn trường nghỉ (is_nghi = true)
        const activeDates = Array.from(dateSet).filter(dStr => {
            return !(cauhinhNgayMap[dStr] && cauhinhNgayMap[dStr].is_nghi);
        }).sort();

        // 2. Lấy danh sách học sinh ăn bán trú trong khoảng thời gian [start, end]
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
            attributes: ['id', 'ho_ten', 'lop', 'gioi_tinh', 'dang_hoc', 'ngay_vao', 'ngay_rut', 'ma_phong_an_id'],
            order: [['lop', 'ASC'], ['ho_ten', 'ASC']],
        });

        // Chỉ xét những học sinh có đăng ký ăn bán trú (có phòng ăn hoặc học sinh đã rút bán trú trong kỳ)
        const lunchStudents = hsList.filter(h => h.ma_phong_an_id || h.ngay_rut);
        const lunchHsIds = lunchStudents.map(h => h.id);

        // 3. Lấy bản ghi điểm danh ăn trong khoảng [start, end]
        const ddRecords = await DiemDanhHS.findAll({
            where: {
                ma_hs_id: { [Op.in]: lunchHsIds },
                ngay: { [Op.between]: [start, end] },
            },
            attributes: ['ma_hs_id', 'ngay', 'diem_danh_an', 'ghi_chu'],
        });

        const ddMap = {}; // { 'YYYY-MM-DD': { hsId: { an: 0|1|2, ghi_chu: string } } }
        ddRecords.forEach(r => {
            if (!ddMap[r.ngay]) ddMap[r.ngay] = {};
            ddMap[r.ngay][r.ma_hs_id] = { an: r.diem_danh_an, ghi_chu: r.ghi_chu };
        });

        // 4. Tính toán cho từng ngày
        const days = activeDates.map((ngayStr, idx) => {
            const d = new Date(ngayStr + 'T00:00:00');
            const dayNum = d.getDate();
            const monthNum = d.getMonth() + 1;
            const itemYear = d.getFullYear();
            const ngayFormatted = `${String(dayNum).padStart(2, '0')}/${String(monthNum).padStart(2, '0')}/${itemYear}`;

            // Danh sách HS hợp lệ trong ngày này
            const cfg = cauhinhNgayMap[ngayStr] || null;
            const validHs = lunchStudents.filter(hs => {
                if (hs.ngay_vao && ngayStr < hs.ngay_vao) return false;
                if (hs.ngay_rut && ngayStr >= hs.ngay_rut) return false;
                if (hs.dang_hoc === false && (!hs.ngay_rut || ngayStr >= hs.ngay_rut)) return false;
                return isHsAllowed(hs, cfg);
            });

            const dayDD = ddMap[ngayStr] || {};
            let hsPhep = 0;
            let hsVang = 0;
            let hsCoMat = 0;
            let hsChuaDD = 0;

            validHs.forEach(hs => {
                const rec = dayDD[hs.id];
                if (rec && rec.an !== null && rec.an !== undefined) {
                    if (rec.an === 2) hsPhep++;
                    else if (rec.an === 1) hsVang++;
                    else if (rec.an === 0) hsCoMat++;
                } else {
                    hsChuaDD++;
                }
            });

            // Số lượng suất ăn = Tổng HS ăn hợp lệ - Số HS vắng có phép
            const hasAttendance = (hsPhep + hsVang + hsCoMat) > 0;
            const slSuatAn = hasAttendance ? (validHs.length - hsPhep) : validHs.length;

            let ghiChu = '';
            if (cfg?.mo_ta) {
                ghiChu = cfg.mo_ta;
            }

            return {
                stt: idx + 1,
                ngay: ngayStr,
                ngay_format: ngayFormatted,
                sl_suat_an: slSuatAn,
                hs_phep: hsPhep,
                hs_vang: hsVang,
                hs_co_mat: hsCoMat,
                tong_dang_ky: validHs.length,
                da_diem_danh: hasAttendance,
                ghi_chu: ghiChu,
            };
        });

        // 5. Cấu hình hệ thống & thông tin người ký
        const [cauhinh] = await CauHinhHeThong.findOrCreate({
            where: { id: 1 },
            defaults: { nam_hoc: '2026-2027', ten_truong: 'TRƯỜNG THPT LÊ THI HỒNG GẤM', nguoi_phu_trach: 'Mai Quỳnh Châu' }
        });

        const rawTen = cauhinh.ten_truong || 'LÊ THỊ HỒNG GẤM';
        const formattedTenTruong = (rawTen.includes('TRƯỜNG') || rawTen.includes('TRUNG TÂM'))
            ? rawTen
            : `TRƯỜNG THPT ${rawTen}`;

        const tongSuatAn = days.reduce((sum, d) => sum + Number(d.sl_suat_an || 0), 0);
        const tongPhep = days.reduce((sum, d) => sum + Number(d.hs_phep || 0), 0);

        return res.json({
            ok: true,
            thang: month,
            nam: year,
            thang_str: `${String(month).padStart(2, '0')}/${year}`,
            tu_ngay: start,
            den_ngay: end,
            nam_hoc: cauhinh.nam_hoc || '2026-2027',
            so_gd: 'SỞ GIÁO DỤC VÀ ĐÀO TẠO TP. HỒ CHÍ MINH',
            ten_truong: formattedTenTruong,
            bo_phan: 'BỘ PHẬN BÁN TRÚ',
            nguoi_lap_bang: 'Mai Quỳnh Châu',
            dai_dien_cong_ty: 'Lê Thị Ngọc Bích',
            giam_doc: 'Vũ Quốc Phong',
            dia_danh: 'Thành phố Hồ Chí Minh',
            days,
            tong_suat_an: tongSuatAn,
            tong_phep: tongPhep,
        });
    } catch (err) {
        console.error('Error suat-an-thang:', err);
        return res.status(500).json({ ok: false, error: err.message });
    }
});

// ── Helper tính tiền trực giáo viên theo khoảng ngày ─────────────────
async function calculateTeacherDutySalary(start, end) {
    const todayVN = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());
    const effectiveEnd = end > todayVN ? todayVN : end;

    let phanCong = [];
    if (start <= effectiveEnd) {
        phanCong = await PhanCongTrucGV.findAll({
            where: {
                ngay: { [Op.between]: [start, effectiveEnd] },
                xac_nhan_truc: { [Op.ne]: false },
            },
            include: [
                { association: 'giao_vien', attributes: ['id', 'ho_ten', 'so_tai_khoan'] },
                { association: 'giao_vien_truc_thay', attributes: ['id', 'ho_ten', 'so_tai_khoan'] }
            ],
            order: [['ngay', 'ASC']]
        });
    }

    const allCauHinhGia = await CauHinhGia.findAll({
        where: {
            loai_truc: { [Op.in]: [0, 1] },
            ngay_ap_dung: { [Op.lte]: effectiveEnd }
        },
        order: [['ngay_ap_dung', 'ASC']],
        raw: true
    });

    const getDonGiaGV = (ngay, loaiTruc) => {
        const matched = allCauHinhGia
            .filter(g => g.loai_truc === loaiTruc && g.ngay_ap_dung <= ngay)
            .pop();
        if (matched) return parseFloat(matched.don_gia);
        return loaiTruc === 0 ? 100000 : 180000;
    };

    const don_gia_an = getDonGiaGV(effectiveEnd, 0);
    const don_gia_ngu = getDonGiaGV(effectiveEnd, 1);

    const gvMap = {};
    const seenShift = new Set();
    phanCong.forEach(pc => {
        let actualId, actualName, isNgoai = false, gvDbId = null, gvStk = '';
        const isSubstitute = Boolean(
            (pc.ten_gv_truc_thay && pc.ten_gv_truc_thay.trim()) ||
            pc.ma_gv_truc_thay_id
        );

        if (pc.ten_gv_truc_thay && pc.ten_gv_truc_thay.trim()) {
            const cleanName = pc.ten_gv_truc_thay.trim();
            actualId = `ngoai_${cleanName}`;
            actualName = cleanName;
            isNgoai = true;
        } else if (pc.ma_gv_truc_thay_id) {
            actualId = pc.ma_gv_truc_thay_id;
            actualName = pc.giao_vien_truc_thay?.ho_ten || `GV #${pc.ma_gv_truc_thay_id}`;
            gvDbId = pc.ma_gv_truc_thay_id;
            gvStk = pc.giao_vien_truc_thay?.so_tai_khoan || '';
        } else {
            actualId = pc.ma_gv_id;
            actualName = pc.giao_vien?.ho_ten || `GV #${pc.ma_gv_id}`;
            gvDbId = pc.ma_gv_id;
            gvStk = pc.giao_vien?.so_tai_khoan || '';
        }

        if (!gvMap[actualId]) gvMap[actualId] = {
            id: actualId,
            ma_gv_id: gvDbId,
            ho_ten: actualName,
            so_tai_khoan: gvStk,
            is_ngoai: isNgoai,
            so_ca_an: 0,
            so_ca_ngu: 0,
            so_ca_truc_thay: 0,
            so_ca_bi_thay: 0,
            tong_tien: 0,
            ngay_an: [],
            ngay_ngu: [],
            chi_tiet_truc_thay: [],
            chi_tiet_bi_thay: [],
            ca_chi_tiet: [],
        };
        if (!gvMap[actualId].so_tai_khoan && gvStk) {
            gvMap[actualId].so_tai_khoan = gvStk;
        }

        const shiftKey = `${actualId}_${pc.ngay}_${pc.loai_truc}`;
        if (seenShift.has(shiftKey)) return;
        seenShift.add(shiftKey);

        const donGia = getDonGiaGV(pc.ngay, pc.loai_truc);
        gvMap[actualId].ca_chi_tiet.push({
            ngay: pc.ngay,
            loai_truc: pc.loai_truc,
            phong: pc.ma_phong_id,
            don_gia: donGia
        });

        if (pc.loai_truc === 0) {
            gvMap[actualId].so_ca_an++;
            gvMap[actualId].tong_tien += donGia;
            gvMap[actualId].ngay_an.push(pc.ngay);
        } else {
            gvMap[actualId].so_ca_ngu++;
            gvMap[actualId].tong_tien += donGia;
            gvMap[actualId].ngay_ngu.push(pc.ngay);
        }

        if (isSubstitute) {
            gvMap[actualId].so_ca_truc_thay++;
            gvMap[actualId].chi_tiet_truc_thay.push({
                ngay: pc.ngay,
                loai_truc: pc.loai_truc,
                phong: pc.ma_phong_id,
                thay_cho: pc.giao_vien?.ho_ten || `GV #${pc.ma_gv_id}`
            });

            const originalId = pc.ma_gv_id;
            const originalName = pc.giao_vien?.ho_ten || `GV #${pc.ma_gv_id}`;
            if (!gvMap[originalId]) {
                gvMap[originalId] = {
                    id: originalId,
                    ma_gv_id: originalId,
                    ho_ten: originalName,
                    is_ngoai: false,
                    so_ca_an: 0,
                    so_ca_ngu: 0,
                    so_ca_truc_thay: 0,
                    so_ca_bi_thay: 0,
                    tong_tien: 0,
                    ngay_an: [],
                    ngay_ngu: [],
                    chi_tiet_truc_thay: [],
                    chi_tiet_bi_thay: [],
                    ca_chi_tiet: [],
                };
            }
            gvMap[originalId].so_ca_bi_thay++;
            gvMap[originalId].chi_tiet_bi_thay.push({
                ngay: pc.ngay,
                loai_truc: pc.loai_truc,
                phong: pc.ma_phong_id,
                nguoi_thay: actualName
            });
        }
    });

    const gvList = Object.values(gvMap);
    const totCaAn = gvList.reduce((a, b) => a + b.so_ca_an, 0);
    const totCaNgu = gvList.reduce((a, b) => a + b.so_ca_ngu, 0);
    const totTien = gvList.reduce((a, b) => a + b.tong_tien, 0);

    return {
        gvList,
        don_gia_an,
        don_gia_ngu,
        totCaAn,
        totCaNgu,
        totTien,
        todayVN,
        effectiveEnd
    };
}

/** GET /api/baocao/luong-gv/?tu_ngay=&den_ngay=&thang=&nam= (Tương thích ngược) */
router.get('/api/baocao/luong-gv/', loginRequired, roleRequired('admin', 'quan_ly', 'ke_toan', 'hieu_truong'), async (req, res) => {
    try {
        let start, end;
        if (req.query.tu_ngay && req.query.den_ngay) {
            start = req.query.tu_ngay;
            end = req.query.den_ngay;
        } else {
            const year = req.query.nam || new Date().getFullYear();
            const month = req.query.thang || (new Date().getMonth() + 1);
            start = `${year}-${String(month).padStart(2, '0')}-01`;
            end = getLastDayYMD(year, month);
        }

        const calc = await calculateTeacherDutySalary(start, end);
        const quanLy = await StaffUser.findOne({ where: { role: 'quan_ly', is_active: true } });
        const keToan = await StaffUser.findOne({ where: { role: 'ke_toan', is_active: true } });

        return res.json({
            ok: true,
            data: calc.gvList,
            don_gia_an: calc.don_gia_an,
            don_gia_ngu: calc.don_gia_ngu,
            today: calc.todayVN,
            effective_end: calc.effectiveEnd,
            quan_ly_name: quanLy ? (quanLy.fullname || quanLy.username) : '',
            ke_toan_name: keToan ? (keToan.fullname || keToan.username) : ''
        });
    } catch (err) {
        return res.status(500).json({ ok: false, error: err.message });
    }
});

/** GET /api/baocao/cong-an-chi-tiet/?tu_ngay=&den_ngay= - Bảng tính công ăn bán trú chi tiết theo ngày lấy từ CSDL */
router.get('/api/baocao/cong-an-chi-tiet/', loginRequired, roleRequired('admin', 'quan_ly', 'ke_toan', 'hieu_truong'), async (req, res) => {
    try {
        let start = req.query.tu_ngay;
        let end = req.query.den_ngay;

        if (!start || !end) {
            const year = req.query.nam || new Date().getFullYear();
            const month = req.query.thang || (new Date().getMonth() + 1);
            start = `${year}-${String(month).padStart(2, '0')}-01`;
            end = getLastDayYMD(year, month);
        }

        // Lấy đơn giá ăn từ CauHinhHeThong hoặc CauHinhGia
        let donGiaAn = 100000;
        let donGiaYTe = 70000;
        let donGiaGsBanTru = 250000;
        const cauHinh = await CauHinhHeThong.findOne();
        if (cauHinh) {
            if (cauHinh.phu_cap_gs_an) donGiaAn = parseInt(cauHinh.phu_cap_gs_an) || 100000;
            if (cauHinh.phu_cap_y_te) donGiaYTe = parseInt(cauHinh.phu_cap_y_te) || 70000;
            if (cauHinh.phu_cap_gs_ban_tru) donGiaGsBanTru = parseInt(cauHinh.phu_cap_gs_ban_tru) || 250000;
        } else {
            const chg = await CauHinhGia.findOne({
                where: {
                    loai_truc: 0,
                    ngay_ap_dung: { [Op.lte]: end }
                },
                order: [['ngay_ap_dung', 'DESC']],
                raw: true
            });
            if (chg && chg.don_gia) donGiaAn = parseFloat(chg.don_gia);
        }

        // Lấy toàn bộ phân công trực ăn (loai_truc = 0) trong khoảng [start, end]
        const phanCong = await PhanCongTrucGV.findAll({
            where: {
                ngay: { [Op.between]: [start, end] },
                loai_truc: 0,
                xac_nhan_truc: { [Op.ne]: false }
            },
            include: [
                { association: 'giao_vien', attributes: ['id', 'ho_ten', 'so_tai_khoan', 'nhiem_vu'] },
                { association: 'giao_vien_truc_thay', attributes: ['id', 'ho_ten', 'so_tai_khoan', 'nhiem_vu'] }
            ],
            order: [['ngay', 'ASC']]
        });

        // Tập hợp danh sách ngày làm việc có trực ăn
        const activeDatesSet = new Set();
        phanCong.forEach(pc => activeDatesSet.add(pc.ngay));
        const activeDates = Array.from(activeDatesSet).sort();

        const workDays = activeDates.map(dateStr => {
            const d = new Date(dateStr + 'T00:00:00');
            const dow = d.getDay(); // 0=CN, 1=T2, 2=T3, 3=T4, 4=T5, 5=T6, 6=T7
            const dowStr = (dow === 1) ? '2' : (dow === 2) ? '3' : (dow === 3) ? '4' : (dow === 4) ? '5' : (dow === 5) ? '6' : (dow === 6) ? '7' : 'CN';
            const parts = dateStr.split('-');
            return {
                dateStr,
                dowStr,
                dayMonth: `${parts[2]}/${parts[1]}`,
                day: parseInt(parts[2], 10),
            };
        });

        // Nhóm theo giáo viên (mỗi ngày mỗi GV tính tối đa 1 ca)
        const gvMap = {};
        const seenShift = new Set();

        phanCong.forEach(pc => {
            let actualId, actualName, isNgoai = false, gvDbId = null, gvStk = '', nhiemVu = 0;
            if (pc.ten_gv_truc_thay && pc.ten_gv_truc_thay.trim()) {
                const cleanName = pc.ten_gv_truc_thay.trim();
                actualId = `ngoai_${cleanName}`;
                actualName = cleanName;
                isNgoai = true;
                nhiemVu = 0;
            } else if (pc.ma_gv_truc_thay_id) {
                actualId = pc.ma_gv_truc_thay_id;
                actualName = pc.giao_vien_truc_thay?.ho_ten || `GV #${pc.ma_gv_truc_thay_id}`;
                gvDbId = pc.ma_gv_truc_thay_id;
                gvStk = pc.giao_vien_truc_thay?.so_tai_khoan || '';
                nhiemVu = pc.giao_vien_truc_thay?.nhiem_vu !== undefined && pc.giao_vien_truc_thay?.nhiem_vu !== null
                    ? pc.giao_vien_truc_thay.nhiem_vu
                    : (pc.nhiem_vu ?? 0);
            } else {
                actualId = pc.ma_gv_id;
                actualName = pc.giao_vien?.ho_ten || `GV #${pc.ma_gv_id}`;
                gvDbId = pc.ma_gv_id;
                gvStk = pc.giao_vien?.so_tai_khoan || '';
                nhiemVu = pc.giao_vien?.nhiem_vu !== undefined && pc.giao_vien?.nhiem_vu !== null
                    ? pc.giao_vien.nhiem_vu
                    : (pc.nhiem_vu ?? 0);
            }

            if (!gvMap[actualId]) {
                gvMap[actualId] = {
                    id: actualId,
                    ma_gv_id: gvDbId,
                    ho_ten: actualName,
                    so_tai_khoan: gvStk,
                    is_ngoai: isNgoai,
                    nhiem_vu: nhiemVu,
                    ngay_an: [],
                    so_ca: 0
                };
            }
            if (!gvMap[actualId].so_tai_khoan && gvStk) {
                gvMap[actualId].so_tai_khoan = gvStk;
            }

            const shiftKey = `${actualId}_${pc.ngay}`;
            if (seenShift.has(shiftKey)) return;
            seenShift.add(shiftKey);

            gvMap[actualId].ngay_an.push(pc.ngay);
            gvMap[actualId].so_ca++;
        });

        // Sắp xếp giáo viên theo tên tiếng Việt
        const gvList = Object.values(gvMap)
            .filter(g => g.so_ca > 0)
            .map(g => {
                let displayName = g.ho_ten;
                if (displayName.toLowerCase().includes('mai quỳnh châu') && !displayName.includes('KT')) {
                    displayName += ' (KT ATVSTP)';
                }
                return {
                    ...g,
                    nhiem_vu: g.nhiem_vu ?? 0,
                    ho_ten_hien_thi: displayName,
                    thanh_tien: g.so_ca * donGiaAn
                };
            })
            .sort((a, b) => {
                const getSortNames = (fullName) => {
                    const parts = (fullName || '').trim().split(/\s+/);
                    return {
                        first: parts[parts.length - 1] || '',
                        middle: parts.slice(1, -1).join(' '),
                        last: parts[0] || ''
                    };
                };
                const nameA = getSortNames(a.ho_ten);
                const nameB = getSortNames(b.ho_ten);
                let cmp = nameA.first.localeCompare(nameB.first, 'vi');
                if (cmp !== 0) return cmp;
                cmp = nameA.last.localeCompare(nameB.last, 'vi');
                if (cmp !== 0) return cmp;
                return nameA.middle.localeCompare(nameB.middle, 'vi');
            });

        // Lấy đơn giá ngủ từ CauHinhGia
        let donGiaNgu = 180000;
        const chgNgu = await CauHinhGia.findOne({
            where: {
                loai_truc: 1,
                ngay_ap_dung: { [Op.lte]: end }
            },
            order: [['ngay_ap_dung', 'DESC']],
            raw: true
        });
        if (chgNgu && chgNgu.don_gia) donGiaNgu = parseFloat(chgNgu.don_gia);

        // Lấy toàn bộ phân công trực ngủ (loai_truc = 1, tức trực phòng) trong khoảng [start, end]
        const phanCongNgu = await PhanCongTrucGV.findAll({
            where: {
                ngay: { [Op.between]: [start, end] },
                loai_truc: 1,
                xac_nhan_truc: { [Op.ne]: false }
            },
            include: [
                { association: 'giao_vien', attributes: ['id', 'ho_ten', 'so_tai_khoan'] },
                { association: 'giao_vien_truc_thay', attributes: ['id', 'ho_ten', 'so_tai_khoan'] }
            ],
            order: [['ngay', 'ASC']]
        });

        const gvMapNgu = {};
        const seenShiftNgu = new Set();
        phanCongNgu.forEach(pc => {
            let actualId, actualName, isNgoai = false, gvDbId = null, gvStk = '';
            if (pc.ten_gv_truc_thay && pc.ten_gv_truc_thay.trim()) {
                actualName = pc.ten_gv_truc_thay.trim();
                actualId = `ngoai_${actualName}`;
                isNgoai = true;
            } else if (pc.ma_gv_truc_thay_id) {
                actualId = pc.ma_gv_truc_thay_id;
                actualName = pc.giao_vien_truc_thay?.ho_ten || `GV #${pc.ma_gv_truc_thay_id}`;
                gvDbId = pc.ma_gv_truc_thay_id;
                gvStk = pc.giao_vien_truc_thay?.so_tai_khoan || '';
            } else {
                actualId = pc.ma_gv_id;
                actualName = pc.giao_vien?.ho_ten || `GV #${pc.ma_gv_id}`;
                gvDbId = pc.ma_gv_id;
                gvStk = pc.giao_vien?.so_tai_khoan || '';
            }

            const shiftKey = `${actualId}_${pc.ngay}`;
            if (seenShiftNgu.has(shiftKey)) return;
            seenShiftNgu.add(shiftKey);

            if (!gvMapNgu[actualId]) {
                gvMapNgu[actualId] = {
                    id: actualId,
                    ma_gv_id: gvDbId,
                    ho_ten: actualName,
                    so_tai_khoan: gvStk,
                    is_ngoai: isNgoai,
                    ngay_ngu: [],
                    so_ca: 0
                };
            }
            if (!gvMapNgu[actualId].so_tai_khoan && gvStk) {
                gvMapNgu[actualId].so_tai_khoan = gvStk;
            }
            gvMapNgu[actualId].ngay_ngu.push(pc.ngay);
            gvMapNgu[actualId].so_ca++;
        });

        const gvNguList = Object.values(gvMapNgu)
            .filter(g => g.so_ca > 0)
            .map(g => ({
                ...g,
                ho_ten_hien_thi: g.ho_ten,
                thanh_tien: g.so_ca * donGiaNgu
            }))
            .sort((a, b) => {
                const getSortNames = (fullName) => {
                    const parts = (fullName || '').trim().split(/\s+/);
                    return {
                        first: parts[parts.length - 1] || '',
                        middle: parts.slice(1, -1).join(' '),
                        last: parts[0] || ''
                    };
                };
                const nameA = getSortNames(a.ho_ten);
                const nameB = getSortNames(b.ho_ten);
                let cmp = nameA.first.localeCompare(nameB.first, 'vi');
                if (cmp !== 0) return cmp;
                cmp = nameA.last.localeCompare(nameB.last, 'vi');
                if (cmp !== 0) return cmp;
                return nameA.middle.localeCompare(nameB.middle, 'vi');
            });

        const nguMap = {};
        gvNguList.forEach(g => {
            const key = g.ho_ten.trim().toLowerCase();
            nguMap[key] = {
                id: g.id,
                ma_gv_id: g.ma_gv_id,
                ho_ten: g.ho_ten,
                so_tai_khoan: g.so_tai_khoan,
                so_ca_ngu: g.so_ca,
                thanh_tien_ngu: g.thanh_tien
            };
        });

        // Tính tổng từng ngày trực ăn & trực ngủ
        const dailyTotals = workDays.map(wd => {
            return gvList.filter(g => g.ngay_an.includes(wd.dateStr)).length;
        });
        const dailyTotalsNgu = workDays.map(wd => {
            return gvNguList.filter(g => g.ngay_ngu.includes(wd.dateStr)).length;
        });

        const totalDays = gvList.reduce((s, g) => s + g.so_ca, 0);
        const totalMoney = totalDays * donGiaAn;

        const totalDaysNgu = gvNguList.reduce((s, g) => s + g.so_ca, 0);
        const totalMoneyNgu = totalDaysNgu * donGiaNgu;

        const quanLy = await StaffUser.findOne({ where: { role: 'quan_ly', is_active: true } });
        const keToan = await StaffUser.findOne({ where: { role: 'ke_toan', is_active: true } });

        return res.json({
            ok: true,
            tu_ngay: start,
            den_ngay: end,
            don_gia_an: donGiaAn,
            don_gia_ngu: donGiaNgu,
            don_gia_y_te: donGiaYTe,
            don_gia_gs_ban_tru: donGiaGsBanTru,
            workDays,
            gvList,
            gvNguList,
            nguMap,
            dailyTotals,
            dailyTotalsNgu,
            totalDays,
            totalMoney,
            totalDaysNgu,
            totalMoneyNgu,
            quan_ly_name: quanLy ? (quanLy.fullname || quanLy.username) : '',
            ke_toan_name: keToan ? (keToan.fullname || keToan.username) : ''
        });
    } catch (err) {
        console.error('Error cong-an-chi-tiet:', err);
        return res.status(500).json({ ok: false, error: err.message });
    }
});

/** GET /api/baocao/ky-truc/ - Danh sách các kỳ trực giáo viên kèm trạng thái thanh toán */
router.get('/api/baocao/ky-truc/', loginRequired, roleRequired('admin', 'quan_ly', 'ke_toan', 'hieu_truong'), async (req, res) => {
    try {
        let list = await KyTrucGV.findAll({ order: [['tu_ngay', 'ASC']] });
        if (list.length === 0) {
            const firstKy = await KyTrucGV.create({
                ten_ky: 'Kỳ 1',
                tu_ngay: '2026-09-07',
                den_ngay: null,
                trang_thai: 'dang_dien_ra',
                nam_hoc: '2026-2027',
            });
            list = [firstKy];
        }

        const todayVN = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());

        const result = [];
        for (const item of list) {
            const k = item.toJSON();
            const payments = await ThanhToanLuongGV.findAll({
                where: { ky_truc_id: k.id, trang_thai: 'thanh_cong' },
                attributes: ['so_tien']
            });
            const da_thanh_toan = payments.reduce((sum, p) => sum + parseFloat(p.so_tien || 0), 0);

            let tien_phat_sinh = 0;
            if (k.trang_thai === 'dang_dien_ra') {
                const calc = await calculateTeacherDutySalary(k.tu_ngay, todayVN);
                tien_phat_sinh = calc.totTien;
                k.tong_ca_an = calc.totCaAn;
                k.tong_ca_ngu = calc.totCaNgu;
                k.tong_so_gv = calc.gvList.length;
            } else {
                tien_phat_sinh = parseFloat(k.tong_tien || 0);
            }

            k.tien_phat_sinh = tien_phat_sinh;
            k.da_thanh_toan = da_thanh_toan;
            k.con_lai = Math.max(0, tien_phat_sinh - da_thanh_toan);
            if (k.con_lai === 0 && da_thanh_toan > 0) {
                k.trang_thai_thanh_toan = 'da_thanh_toan';
            } else if (da_thanh_toan > 0) {
                k.trang_thai_thanh_toan = 'thanh_toan_mot_phan';
            } else {
                k.trang_thai_thanh_toan = 'chua_thanh_toan';
            }
            result.push(k);
        }

        return res.json({ ok: true, data: result });
    } catch (err) {
        return res.status(500).json({ ok: false, error: err.message });
    }
});

/** GET /api/baocao/ky-truc/:id/preview-chot - Xem trước số liệu trước khi chốt kỳ */
router.get('/api/baocao/ky-truc/:id/preview-chot', loginRequired, roleRequired('admin', 'quan_ly', 'ke_toan', 'hieu_truong'), async (req, res) => {
    try {
        const ky = await KyTrucGV.findByPk(req.params.id);
        if (!ky) return res.status(404).json({ ok: false, error: 'Không tìm thấy kỳ trực' });
        if (ky.trang_thai !== 'dang_dien_ra') {
            return res.status(400).json({ ok: false, error: 'Kỳ trực này đã được chốt trước đó' });
        }

        const todayVN = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());
        const tu_ngay = req.query.tu_ngay || ky.tu_ngay;
        const den_ngay = req.query.den_ngay || todayVN;

        if (tu_ngay > den_ngay) {
            return res.status(400).json({ ok: false, error: `Từ ngày (${tu_ngay}) không được lớn hơn Đến ngày (${den_ngay})` });
        }

        const calc = await calculateTeacherDutySalary(tu_ngay, den_ngay);

        return res.json({
            ok: true,
            preview: {
                ten_ky: ky.ten_ky,
                tu_ngay,
                den_ngay,
                tong_so_gv: calc.gvList.length,
                tong_ca_an: calc.totCaAn,
                tong_ca_ngu: calc.totCaNgu,
                tong_tien: calc.totTien
            }
        });
    } catch (err) {
        return res.status(500).json({ ok: false, error: err.message });
    }
});

/** POST /api/baocao/ky-truc/:id/chot - Chốt kỳ hiện tại và mở kỳ mới bắt đầu từ ngày kế tiếp */
router.post('/api/baocao/ky-truc/:id/chot', loginRequired, roleRequired('admin', 'quan_ly', 'ke_toan', 'hieu_truong'), async (req, res) => {
    try {
        const ky = await KyTrucGV.findByPk(req.params.id);
        if (!ky) return res.status(404).json({ ok: false, error: 'Không tìm thấy kỳ trực' });
        if (ky.trang_thai !== 'dang_dien_ra') {
            return res.status(400).json({ ok: false, error: 'Kỳ trực này đã được chốt trước đó' });
        }

        const todayVN = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());
        const { tu_ngay, den_ngay, ghi_chu } = req.body;
        const tuNgayChot = tu_ngay || ky.tu_ngay;
        if (!den_ngay) {
            return res.status(400).json({ ok: false, error: 'Vui lòng chọn ngày kết thúc để chốt kỳ' });
        }
        if (den_ngay < tuNgayChot) {
            return res.status(400).json({ ok: false, error: `Ngày kết thúc (${den_ngay}) không được trước ngày bắt đầu (${tuNgayChot})` });
        }

        // Chặn chồng lấn với các kỳ khác đã chốt
        const overlap = await KyTrucGV.findOne({
            where: {
                id: { [Op.ne]: ky.id },
                trang_thai: 'da_chot',
                [Op.and]: [
                    { tu_ngay: { [Op.lte]: den_ngay } },
                    sequelize.where(
                        sequelize.fn('COALESCE', sequelize.col('den_ngay'), '9999-12-31'),
                        { [Op.gte]: tuNgayChot }
                    )
                ]
            }
        });
        if (overlap) {
            return res.status(400).json({ ok: false, error: `Khoảng ngày (${tuNgayChot} đến ${den_ngay}) bị chồng lấn với ${overlap.ten_ky} (${overlap.tu_ngay} đến ${overlap.den_ngay || 'nay'})! Kỳ sau phải bắt đầu từ ngày mới.` });
        }

        const calc = await calculateTeacherDutySalary(tuNgayChot, den_ngay);

        await ky.update({
            tu_ngay: tuNgayChot,
            den_ngay,
            trang_thai: 'da_chot',
            ngay_chot: new Date(),
            nguoi_chot_id: req.user.id,
            nguoi_chot_ten: req.user.fullname || req.user.username,
            tong_so_gv: calc.gvList.length,
            tong_ca_an: calc.totCaAn,
            tong_ca_ngu: calc.totCaNgu,
            tong_tien: calc.totTien,
            ghi_chu: ghi_chu || null,
        });

        // Đồng bộ chốt kỳ tương ứng bên Kế toán
        try {
            const ktKy = await KeToanKyTongHop.findOne({
                where: {
                    [Op.or]: [
                        { tu_ngay: tuNgayChot },
                        { id: ky.id },
                        { trang_thai: 'dang_dien_ra' },
                    ],
                },
                order: [['id', 'DESC']],
            });
            if (ktKy && ktKy.trang_thai !== 'da_chot') {
                await ktKy.update({
                    tu_ngay: tuNgayChot,
                    den_ngay,
                    trang_thai: 'da_chot',
                    ngay_chot: new Date(),
                    nguoi_chot_id: req.user.id,
                    nguoi_chot_ten: req.user.fullname || req.user.username,
                    tong_tien: calc.totTien,
                    ghi_chu: ghi_chu || ktKy.ghi_chu,
                });
            }
        } catch (syncKtErr) {
            console.warn('Lỗi đồng bộ KeToanKyTongHop khi chốt kỳ trực:', syncKtErr.message);
        }

        // Tạo kỳ mới bắt đầu từ ngày kế tiếp
        const nextStart = addDays(den_ngay, 1);
        const count = await KyTrucGV.count();
        const nextKy = await KyTrucGV.create({
            ten_ky: `Kỳ ${count + 1}`,
            tu_ngay: nextStart,
            den_ngay: null,
            trang_thai: 'dang_dien_ra',
            nam_hoc: ky.nam_hoc,
        });

        // Đồng bộ tạo kỳ mới bên Kế toán KeToanKyTongHop
        try {
            const existingNextKt = await KeToanKyTongHop.findOne({ where: { tu_ngay: nextStart } });
            if (!existingNextKt) {
                const ktCount = await KeToanKyTongHop.count();
                await KeToanKyTongHop.create({
                    ten_ky: `TH Kỳ ${ktCount + 1}`,
                    tu_ngay: nextStart,
                    den_ngay: todayVN > nextStart ? todayVN : nextStart,
                    ngay_lap: todayVN,
                    trang_thai: 'dang_dien_ra',
                    ghi_chu: `Kỳ mới kế tiếp sau khi chốt ${ky.ten_ky} (từ ${nextStart})`,
                    created_by_id: req.user.id,
                    created_by_name: req.user.fullname || req.user.username,
                });
            }
        } catch (syncNextKtErr) {
            console.warn('Lỗi đồng bộ tạo KeToanKyTongHop kế tiếp:', syncNextKtErr.message);
        }

        if (LichSuThaoTac) {
            await LichSuThaoTac.create({
                loai: 'CHOT_KY_TRUC',
                noidung: `Chốt ${ky.ten_ky} (${ky.tu_ngay} đến ${den_ngay}) - Số tiền: ${calc.totTien.toLocaleString('vi-VN')} đ. Đã mở ${nextKy.ten_ky} từ ngày ${nextStart}`,
                nguoi_thao_tac_id: req.user.id,
                nguoi_thao_tac_ten: req.user.fullname || req.user.username,
                chuc_vu: req.user.role,
                created_at: new Date()
            }).catch(() => {});
        }

        return res.json({
            ok: true,
            message: `Đã chốt ${ky.ten_ky} thành công và tự động tạo ${nextKy.ten_ky} bắt đầu từ ${nextStart}`,
            closed_ky: ky,
            new_ky: nextKy
        });
    } catch (err) {
        return res.status(500).json({ ok: false, error: err.message });
    }
});

/** POST /api/baocao/ky-truc/:id/mo-lai - Mở lại kỳ trực đã chốt (đồng bộ với Kế toán) */
router.post('/api/baocao/ky-truc/:id/mo-lai', loginRequired, roleRequired('admin', 'quan_ly', 'ke_toan', 'hieu_truong'), async (req, res) => {
    try {
        const ky = await KyTrucGV.findByPk(req.params.id);
        if (!ky) return res.status(404).json({ ok: false, error: 'Không tìm thấy kỳ trực' });
        if (ky.trang_thai !== 'da_chot') {
            return res.status(400).json({ ok: false, error: 'Kỳ này chưa bị khóa chốt' });
        }

        await ky.update({
            trang_thai: 'dang_dien_ra',
            ngay_chot: null,
            nguoi_chot_id: null,
            nguoi_chot_ten: null,
        });

        // Đồng bộ mở lại bên Kế toán
        try {
            const ktKy = await KeToanKyTongHop.findOne({
                where: {
                    [Op.or]: [
                        { tu_ngay: ky.tu_ngay },
                        { id: ky.id },
                    ],
                },
                order: [['id', 'DESC']],
            });
            if (ktKy) {
                await ktKy.update({
                    trang_thai: 'dang_dien_ra',
                    ngay_chot: null,
                    nguoi_chot_id: null,
                    nguoi_chot_ten: null,
                });
            }
        } catch (syncKtErr) {
            console.warn('Lỗi đồng bộ mở lại KeToanKyTongHop:', syncKtErr.message);
        }

        if (LichSuThaoTac) {
            await LichSuThaoTac.create({
                loai: 'MO_LAI_KY_TRUC',
                noidung: `Mở lại ${ky.ten_ky} (${ky.tu_ngay} đến ${ky.den_ngay || 'nay'}) - Đồng bộ với Kế toán`,
                nguoi_thao_tac_id: req.user.id,
                nguoi_thao_tac_ten: req.user.fullname || req.user.username,
                chuc_vu: req.user.role,
                created_at: new Date(),
            }).catch(() => {});
        }

        return res.json({
            ok: true,
            message: `Đã mở lại ${ky.ten_ky} thành công và đồng bộ với phần Kế toán`,
            ky,
        });
    } catch (err) {
        return res.status(500).json({ ok: false, error: err.message });
    }
});

/** GET /api/baocao/ky-truc/:id/chi-tiet - Chi tiết bảng lương, công trực và các phiếu thanh toán của kỳ */
router.get('/api/baocao/ky-truc/:id/chi-tiet', loginRequired, roleRequired('admin', 'quan_ly', 'ke_toan', 'hieu_truong'), async (req, res) => {
    try {
        const ky = await KyTrucGV.findByPk(req.params.id);
        if (!ky) return res.status(404).json({ ok: false, error: 'Không tìm thấy kỳ trực' });

        const todayVN = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());
        const endDate = ky.trang_thai === 'da_chot' ? ky.den_ngay : (ky.den_ngay || todayVN);

        const calc = await calculateTeacherDutySalary(ky.tu_ngay, endDate);

        // Lấy tất cả lịch sử thanh toán của kỳ này
        const allPayments = await ThanhToanLuongGV.findAll({
            where: { ky_truc_id: ky.id },
            order: [['created_at', 'DESC']]
        });

        // Gắn thông tin thanh toán cho từng giáo viên
        const activePayments = allPayments.filter(p => p.trang_thai === 'thanh_cong');

        const gvListWithPayment = calc.gvList.map(g => {
            const gvPayments = activePayments.filter(p => {
                if (g.ma_gv_id && p.ma_gv_id) return p.ma_gv_id === g.ma_gv_id;
                return p.ten_gv?.trim().toLowerCase() === g.ho_ten?.trim().toLowerCase();
            });
            const da_thanh_toan = gvPayments.reduce((s, p) => s + parseFloat(p.so_tien || 0), 0);
            const con_lai = Math.max(0, g.tong_tien - da_thanh_toan);
            let trang_thai_thanh_toan = 'chua_thanh_toan';
            if (con_lai === 0 && da_thanh_toan > 0) {
                trang_thai_thanh_toan = 'da_thanh_toan';
            } else if (da_thanh_toan > 0) {
                trang_thai_thanh_toan = 'thanh_toan_mot_phan';
            }
            return {
                ...g,
                da_thanh_toan,
                con_lai,
                trang_thai_thanh_toan,
                lich_su_thanh_toan: allPayments.filter(p => {
                    if (g.ma_gv_id && p.ma_gv_id) return p.ma_gv_id === g.ma_gv_id;
                    return p.ten_gv?.trim().toLowerCase() === g.ho_ten?.trim().toLowerCase();
                })
            };
        });

        const totDaThanhToan = activePayments.reduce((s, p) => s + parseFloat(p.so_tien || 0), 0);
        const totConLai = Math.max(0, calc.totTien - totDaThanhToan);
        let trang_thai_thanh_toan = 'chua_thanh_toan';
        if (totConLai === 0 && totDaThanhToan > 0) {
            trang_thai_thanh_toan = 'da_thanh_toan';
        } else if (totDaThanhToan > 0) {
            trang_thai_thanh_toan = 'thanh_toan_mot_phan';
        }

        const quanLy = await StaffUser.findOne({ where: { role: 'quan_ly', is_active: true } });
        const keToan = await StaffUser.findOne({ where: { role: 'ke_toan', is_active: true } });

        return res.json({
            ok: true,
            ky: ky.toJSON(),
            data: gvListWithPayment,
            gv_list: gvListWithPayment,
            summary: {
                tong_so_gv: gvListWithPayment.length,
                totCaAn: calc.totCaAn,
                totCaNgu: calc.totCaNgu,
                totTien: calc.totTien,
                totDaThanhToan,
                totConLai,
                trang_thai_thanh_toan,
                today: todayVN,
                effectiveEnd: calc.effectiveEnd
            },
            lich_su_thanh_toan: allPayments,
            don_gia_an: calc.don_gia_an,
            don_gia_ngu: calc.don_gia_ngu,
            quan_ly_name: quanLy ? (quanLy.fullname || quanLy.username) : '',
            ke_toan_name: keToan ? (keToan.fullname || keToan.username) : ''
        });
    } catch (err) {
        return res.status(500).json({ ok: false, error: err.message });
    }
});

/** POST /api/baocao/ky-truc/:id/thanh-toan - Thực hiện thanh toán tiền trực (từng giáo viên hoặc tất cả) */
router.post('/api/baocao/ky-truc/:id/thanh-toan', loginRequired, roleRequired('admin', 'quan_ly', 'ke_toan', 'hieu_truong'), async (req, res) => {
    try {
        const ky = await KyTrucGV.findByPk(req.params.id);
        if (!ky) return res.status(404).json({ ok: false, error: 'Không tìm thấy kỳ trực' });

        const todayVN = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());
        const { loai, ma_gv_id, ten_gv, so_tien, hinh_thuc = 'chuyen_khoan', ghi_chu, ngay_thanh_toan = todayVN } = req.body;

        const endDate = ky.trang_thai === 'da_chot' ? ky.den_ngay : (ky.den_ngay || todayVN);
        const calc = await calculateTeacherDutySalary(ky.tu_ngay, endDate);

        const activePayments = await ThanhToanLuongGV.findAll({
            where: { ky_truc_id: ky.id, trang_thai: 'thanh_cong' }
        });

        if (loai === 'tung_gv') {
            if (!ten_gv || !ten_gv.trim()) {
                return res.status(400).json({ ok: false, error: 'Thiếu tên giáo viên được thanh toán' });
            }
            const amount = parseFloat(so_tien);
            if (isNaN(amount) || amount <= 0) {
                return res.status(400).json({ ok: false, error: 'Số tiền thanh toán phải lớn hơn 0' });
            }

            // Tìm giáo viên trong danh sách trực của kỳ
            const matchedGv = calc.gvList.find(g => {
                if (ma_gv_id && g.ma_gv_id) return g.ma_gv_id === parseInt(ma_gv_id, 10);
                return g.ho_ten?.trim().toLowerCase() === ten_gv.trim().toLowerCase();
            });

            const tongTienGV = matchedGv ? matchedGv.tong_tien : 0;
            const daTraGV = activePayments
                .filter(p => {
                    if (ma_gv_id && p.ma_gv_id) return p.ma_gv_id === parseInt(ma_gv_id, 10);
                    return p.ten_gv?.trim().toLowerCase() === ten_gv.trim().toLowerCase();
                })
                .reduce((s, p) => s + parseFloat(p.so_tien || 0), 0);

            const conLaiGV = Math.max(0, tongTienGV - daTraGV);
            if (amount > conLaiGV) {
                return res.status(400).json({
                    ok: false,
                    error: `Số tiền thanh toán (${amount.toLocaleString('vi-VN')} đ) vượt quá số tiền còn lại phải trả (${conLaiGV.toLocaleString('vi-VN')} đ)`
                });
            }

            const payment = await ThanhToanLuongGV.create({
                ky_truc_id: ky.id,
                ma_gv_id: matchedGv?.ma_gv_id || null,
                ten_gv: matchedGv?.ho_ten || ten_gv.trim(),
                so_tien: amount,
                ngay_thanh_toan,
                hinh_thuc,
                nguoi_thao_tac_id: req.user.id,
                nguoi_thao_tac_ten: req.user.fullname || req.user.username,
                ghi_chu: ghi_chu || null,
                trang_thai: 'thanh_cong'
            });

            if (LichSuThaoTac) {
                await LichSuThaoTac.create({
                    loai: 'THANH_TOAN_LUONG_GV',
                    noidung: `Thanh toán tiền trực cho ${payment.ten_gv}: ${amount.toLocaleString('vi-VN')} đ (${ky.ten_ky})`,
                    nguoi_thao_tac_id: req.user.id,
                    nguoi_thao_tac_ten: req.user.fullname || req.user.username,
                    chuc_vu: req.user.role,
                    created_at: new Date()
                }).catch(() => {});
            }

            return res.json({ ok: true, message: 'Thanh toán thành công', payment });
        } else if (loai === 'tat_ca') {
            // Thanh toán toàn bộ số tiền còn lại cho tất cả giáo viên chưa nhận đủ
            const created = [];
            for (const g of calc.gvList) {
                const daTra = activePayments
                    .filter(p => {
                        if (g.ma_gv_id && p.ma_gv_id) return p.ma_gv_id === g.ma_gv_id;
                        return p.ten_gv?.trim().toLowerCase() === g.ho_ten?.trim().toLowerCase();
                    })
                    .reduce((s, p) => s + parseFloat(p.so_tien || 0), 0);

                const conLai = Math.max(0, g.tong_tien - daTra);
                if (conLai > 0) {
                    const pRecord = await ThanhToanLuongGV.create({
                        ky_truc_id: ky.id,
                        ma_gv_id: g.ma_gv_id || null,
                        ten_gv: g.ho_ten,
                        so_tien: conLai,
                        ngay_thanh_toan,
                        hinh_thuc,
                        nguoi_thao_tac_id: req.user.id,
                        nguoi_thao_tac_ten: req.user.fullname || req.user.username,
                        ghi_chu: ghi_chu || 'Thanh toán toàn bộ kỳ',
                        trang_thai: 'thanh_cong'
                    });
                    created.push(pRecord);
                }
            }

            if (created.length === 0) {
                return res.status(400).json({ ok: false, error: 'Kỳ này đã được thanh toán đầy đủ, không còn dư nợ' });
            }

            const totalBatch = created.reduce((s, p) => s + parseFloat(p.so_tien), 0);

            if (LichSuThaoTac) {
                await LichSuThaoTac.create({
                    loai: 'THANH_TOAN_LUONG_GV',
                    noidung: `Thanh toán toàn bộ ${ky.ten_ky} cho ${created.length} giáo viên - Tổng chi: ${totalBatch.toLocaleString('vi-VN')} đ`,
                    nguoi_thao_tac_id: req.user.id,
                    nguoi_thao_tac_ten: req.user.fullname || req.user.username,
                    chuc_vu: req.user.role,
                    created_at: new Date()
                }).catch(() => {});
            }

            return res.json({ ok: true, message: `Đã thanh toán cho ${created.length} giáo viên với tổng số tiền ${totalBatch.toLocaleString('vi-VN')} đ`, count: created.length });
        } else {
            return res.status(400).json({ ok: false, error: 'Loại thanh toán không hợp lệ' });
        }
    } catch (err) {
        return res.status(500).json({ ok: false, error: err.message });
    }
});

/** POST /api/baocao/thanh-toan/:id/huy - Hủy phiếu thanh toán với lý do bắt buộc */
router.post('/api/baocao/thanh-toan/:id/huy', loginRequired, roleRequired('admin', 'quan_ly', 'ke_toan', 'hieu_truong'), async (req, res) => {
    try {
        const payment = await ThanhToanLuongGV.findByPk(req.params.id);
        if (!payment) return res.status(404).json({ ok: false, error: 'Không tìm thấy phiếu thanh toán' });
        if (payment.trang_thai === 'da_huy') {
            return res.status(400).json({ ok: false, error: 'Phiếu thanh toán này đã được hủy trước đó' });
        }

        const reason = req.body.ly_do_huy || req.body.ly_do;
        if (!reason || !reason.trim()) {
            return res.status(400).json({ ok: false, error: 'Vui lòng nhập lý do hủy phiếu thanh toán' });
        }

        await payment.update({
            trang_thai: 'da_huy',
            ly_do_huy: reason.trim(),
            ngay_huy: new Date(),
            nguoi_huy_ten: req.user.fullname || req.user.username
        });

        if (LichSuThaoTac) {
            await LichSuThaoTac.create({
                loai: 'HUY_THANH_TOAN_LUONG_GV',
                noidung: `Hủy phiếu thanh toán #${payment.id} của ${payment.ten_gv} (${parseFloat(payment.so_tien).toLocaleString('vi-VN')} đ). Lý do: ${reason.trim()}`,
                nguoi_thao_tac_id: req.user.id,
                nguoi_thao_tac_ten: req.user.fullname || req.user.username,
                chuc_vu: req.user.role,
                created_at: new Date()
            }).catch(() => {});
        }

        return res.json({ ok: true, message: 'Đã hủy phiếu thanh toán thành công' });
    } catch (err) {
        return res.status(500).json({ ok: false, error: err.message });
    }
});

/** GET /api/baocao/thong-ke-luong-gv/ - Thống kê tiền trực linh hoạt theo khoảng ngày tùy chọn */
router.get('/api/baocao/thong-ke-luong-gv/', loginRequired, roleRequired('admin', 'quan_ly', 'ke_toan', 'hieu_truong'), async (req, res) => {
    try {
        const { tu_ngay, den_ngay } = req.query;
        if (!tu_ngay || !den_ngay) {
            return res.status(400).json({ ok: false, error: 'Vui lòng chọn Từ ngày và Đến ngày' });
        }
        if (tu_ngay > den_ngay) {
            return res.status(400).json({ ok: false, error: 'Từ ngày không được lớn hơn Đến ngày' });
        }

        const todayVN = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());
        const effectiveEnd = den_ngay > todayVN ? todayVN : den_ngay;

        // 1. Tính toán ca trực và tiền trực phát sinh chính xác cho các ca trong khoảng [tu_ngay, effectiveEnd]
        const calc = await calculateTeacherDutySalary(tu_ngay, effectiveEnd);

        // 2. Tìm tất cả các kỳ trực có ca thuộc khoảng này
        const allKy = await KyTrucGV.findAll({
            where: {
                tu_ngay: { [Op.lte]: effectiveEnd },
                [Op.and]: [
                    sequelize.where(
                        sequelize.fn('COALESCE', sequelize.col('den_ngay'), '9999-12-31'),
                        { [Op.gte]: tu_ngay }
                    )
                ]
            },
            order: [['tu_ngay', 'ASC']]
        });

        // 3. Tính tỷ lệ thanh toán của từng kỳ
        const kyPaymentRatios = {};
        const kyInfoList = [];

        for (const ky of allKy) {
            const kyEndDate = ky.trang_thai === 'da_chot' ? ky.den_ngay : (ky.den_ngay || todayVN);
            const kyCalc = await calculateTeacherDutySalary(ky.tu_ngay, kyEndDate);

            const kyPayments = await ThanhToanLuongGV.findAll({
                where: { ky_truc_id: ky.id, trang_thai: 'thanh_cong' },
                attributes: ['so_tien']
            });
            const kyTotalPaid = kyPayments.reduce((s, p) => s + parseFloat(p.so_tien || 0), 0);
            const kyTotalEarned = kyCalc.totTien;

            const ratio = kyTotalEarned > 0 ? Math.min(1, kyTotalPaid / kyTotalEarned) : 0;
            kyPaymentRatios[ky.id] = {
                ky,
                ratio,
                kyTotalEarned,
                kyTotalPaid,
            };

            kyInfoList.push({
                id: ky.id,
                ten_ky: ky.ten_ky,
                tu_ngay: ky.tu_ngay,
                den_ngay: ky.den_ngay,
                trang_thai: ky.trang_thai,
                tong_tien: kyTotalEarned,
                da_thanh_toan: kyTotalPaid,
                ty_le: Math.round(ratio * 100)
            });
        }

        // 4. Phân bổ "Đã thanh toán" cho từng giáo viên dựa trên các ca trực của họ trong khoảng ngày
        const gvListWithRatio = calc.gvList.map(g => {
            let gvPaidInRange = 0;
            (g.ca_chi_tiet || []).forEach(ca => {
                const matchedKy = allKy.find(k => {
                    const kEnd = k.den_ngay || '9999-12-31';
                    return ca.ngay >= k.tu_ngay && ca.ngay <= kEnd;
                });
                if (matchedKy && kyPaymentRatios[matchedKy.id]) {
                    const r = kyPaymentRatios[matchedKy.id].ratio;
                    gvPaidInRange += ca.don_gia * r;
                }
            });

            gvPaidInRange = Math.round(gvPaidInRange);
            const conLai = Math.max(0, g.tong_tien - gvPaidInRange);
            let trang_thai_thanh_toan = 'chua_thanh_toan';
            if (conLai === 0 && gvPaidInRange > 0) {
                trang_thai_thanh_toan = 'da_thanh_toan';
            } else if (gvPaidInRange > 0) {
                trang_thai_thanh_toan = 'thanh_toan_mot_phan';
            }

            return {
                ...g,
                da_thanh_toan: gvPaidInRange,
                con_lai: conLai,
                trang_thai_thanh_toan
            };
        });

        const totTienPhatSinh = calc.totTien;
        const totDaThanhToan = gvListWithRatio.reduce((s, g) => s + g.da_thanh_toan, 0);
        const totConLai = Math.max(0, totTienPhatSinh - totDaThanhToan);

        const quanLy = await StaffUser.findOne({ where: { role: 'quan_ly', is_active: true } });
        const keToan = await StaffUser.findOne({ where: { role: 'ke_toan', is_active: true } });

        return res.json({
            ok: true,
            tu_ngay,
            den_ngay: effectiveEnd,
            data: gvListWithRatio,
            summary: {
                tu_ngay,
                den_ngay: effectiveEnd,
                tong_so_gv: gvListWithRatio.length,
                totCaAn: calc.totCaAn,
                totCaNgu: calc.totCaNgu,
                totTienPhatSinh,
                totDaThanhToan,
                totConLai,
                effectiveEnd,
                today: todayVN
            },
            kyList: kyInfoList,
            ghi_chu_cach_tinh: 'Tiền trực phát sinh tính theo từng ca trực diễn ra trong khoảng ngày được chọn. "Đã thanh toán" là số tiền đã chi trả phân bổ theo tỷ lệ thanh toán của kỳ chứa các ca trực đó.',
            don_gia_an: calc.don_gia_an,
            don_gia_ngu: calc.don_gia_ngu,
            quan_ly_name: quanLy ? (quanLy.fullname || quanLy.username) : '',
            ke_toan_name: keToan ? (keToan.fullname || keToan.username) : ''
        });
    } catch (err) {
        return res.status(500).json({ ok: false, error: err.message });
    }
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
            const end = getLastDayYMD(year, month);
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
            include: [
                { association: 'giao_vien', attributes: ['ho_ten'] },
                { association: 'giao_vien_truc_thay', attributes: ['ho_ten'] },
                { association: 'phong', attributes: ['ma_phong', 'loai_phong'] }
            ],
            order: [['ngay', 'ASC']],
        });

        const wb = new ExcelJS.Workbook();
        const ws = wb.addWorksheet('Lịch trực');

        ws.getRow(1).values = ['Ngày', 'Phòng', 'Loại', 'Giáo viên phân công', 'Người trực thực tế'];
        ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
        ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1e3a5f' } };
        ws.columns = [{ width: 14 }, { width: 10 }, { width: 10 }, { width: 26 }, { width: 28 }];

        let rowIdx = 2;
        for (const r of records) {
            const row = ws.getRow(rowIdx++);
            let nguoiThucTe = r.giao_vien?.ho_ten || '';
            if (r.ten_gv_truc_thay && r.ten_gv_truc_thay.trim()) {
                nguoiThucTe = `${r.ten_gv_truc_thay.trim()} (Ngoài DS trực thay)`;
            } else if (r.giao_vien_truc_thay) {
                nguoiThucTe = `${r.giao_vien_truc_thay.ho_ten} (Trực thay)`;
            }
            row.values = [r.ngay, r.phong?.ma_phong, r.loai_truc === 0 ? 'Ăn' : 'Ngủ', r.giao_vien?.ho_ten, nguoiThucTe];
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
function isCalendarValid(y, m, d) {
    const year = parseInt(y, 10);
    const month = parseInt(m, 10);
    const day = parseInt(d, 10);
    if (isNaN(year) || isNaN(month) || isNaN(day)) return false;
    if (month < 1 || month > 12 || day < 1 || day > 31) return false;
    const test = new Date(Date.UTC(year, month - 1, day));
    return test.getUTCFullYear() === year && (test.getUTCMonth() + 1) === month && test.getUTCDate() === day;
}

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
        if (!isCalendarValid(y, m, d)) return null;
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
        if (!isCalendarValid(y, m, d)) return null;
        const ngay = `${y}-${pad(m)}-${pad(d)}`;
        if (tz) {
            const parsed = new Date(str);
            if (!isNaN(parsed.getTime())) {
                const vnNgay = parsed.toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });
                return { ngay: vnNgay, submittedAt: parsed };
            }
        }
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
    return null;
}

function normalizeDateStr(input) {
    const res = parseVNSubmissionDate(input);
    return res ? res.ngay : getVietnamTodayYMD();
}

/** Helper parse ca trực (0=Ăn trưa, 1=Nghỉ trưa, 2=Giám sát) */
function normalizeCaTruc(input) {
    if (input === 0 || input === '0') return 0;
    if (input === 1 || input === '1') return 1;
    if (input === 2 || input === '2') return 2;
    const str = String(input || '').toLowerCase();
    if (str.includes('giám sát') || str.includes('gám sát') || str.includes('giamsat')) return 2;
    if (str.includes('ngủ') || str.includes('nghi') || str.includes('nghỉ')) return 1;
    return 0; // Mặc định là Ăn
}

/**
 * Chuẩn hóa Sĩ số: loại bỏ tiền tố tên phòng (ví dụ "D31 35/35" -> "35/35", "D.33 28/35" -> "28/35")
 */
function cleanSiSoHelper(raw, maPhong) {
    if (!raw) return '';
    let str = String(raw).trim();
    const fractionMatch = str.match(/\b\d+\s*\/\s*\d+\b/);
    if (fractionMatch) {
        return fractionMatch[0].replace(/\s+/g, '');
    }
    str = str.replace(/^(phòng|phong|p\.?)\s*[a-z0-9\.]+\s*[:\-\s]*/i, '');
    str = str.replace(/^[a-z]+[\.\-_]?[0-9]+\s*[:\-\s]*/i, '');
    if (maPhong) {
        const rooms = String(maPhong).split(/[,;\-\/]+/).map(r => r.trim()).filter(Boolean);
        for (const r of rooms) {
            if (/[a-zA-Z]/.test(r)) {
                const escaped = r.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const reg = new RegExp('(^|\\s)' + escaped + '[:\\s\\-]*', 'gi');
                str = str.replace(reg, '$1').trim();
            }
        }
    }
    return str.trim();
}

/**
 * POST /api/webhook/google-form-baocao
 * Nhận báo cáo tình hình trực của GV qua Google Apps Script Webhook
 * Hỗ trợ cả 3 nhánh Trực ăn, Trực ngủ và Giám sát (16 cột chuẩn) từ Google Form / Google Sheets
 */
router.post('/api/webhook/google-form-baocao', async (req, res) => {
    try {
        const authHeader = req.headers['authorization'];
        const bearerToken = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
        const token = req.headers['x-webhook-secret'] || bearerToken || req.body?.token;
        const validSecrets = [
            process.env.WEBHOOK_SECRET,
            'bantru-lthg-secret-key-2025',
            'ee55a8d713550ccb0a3afef9bd45da466dbb9a9b14b90bdc2120ff27d5157a53'
        ].filter(Boolean);

        if (!token || !validSecrets.includes(token)) {
            return res.status(403).json({ ok: false, error: 'Mã xác thực Webhook không hợp lệ hoặc thiếu header xác thực (X-Webhook-Secret hoặc Authorization Bearer)' });
        }

        // 1. Kiểm tra nếu payload được gửi dưới dạng mảng (Array / Row từ Google Sheets)
        let bodyObj = req.body || {};
        const rawArray = Array.isArray(req.body)
            ? req.body
            : (Array.isArray(req.body?.values)
                ? req.body.values
                : (Array.isArray(req.body?.row) ? req.body.row : null));

        if (rawArray && rawArray.length >= 3) {
            // Thứ tự 18 cột chuẩn (Form mới nhất có Danh sách HS vắng):
            // 0: Dấu thời gian | 1: Ca trực
            // Phần 3. Giám sát: 2: Họ tên | 3: Vị trí/Phòng | 4: Tình hình nề nếp | 5: Vệ sinh an toàn thực phẩm
            // Phần 1. Ca ăn:    6: Họ tên GV | 7: Phòng ăn | 8: Tình hình | 9: Sĩ số | 10: Danh sách HS vắng | 11: Ghi chú
            // Phần 2. Ca ngủ:   12: Họ tên GV | 13: Phòng ngủ | 14: Tình hình | 15: Sĩ số | 16: Danh sách HS vắng | 17: HS vi phạm | 18: Ghi chú
            const rawCa = String(rawArray[1] || '').toLowerCase().trim();
            const isGiamSat = rawCa.includes('giám sát') || rawCa.includes('gám sát') || rawCa.includes('giamsat') || (Boolean(rawArray[2]) && !rawArray[6] && !rawArray[11] && !rawArray[12] && !rawArray[7]);
            const is18Col = rawArray.length >= 18 || Boolean(rawArray[13]) || (Boolean(rawArray[6]) && Boolean(rawArray[10]) && Boolean(rawArray[11]));
            const is17Col = !is18Col && (rawArray.length >= 17 || Boolean(rawArray[12]) || Boolean(rawArray[11]) || (Boolean(rawArray[6]) && Boolean(rawArray[7])) || (Boolean(rawArray[2]) && Boolean(rawArray[3]) && Boolean(rawArray[5])));
            const is16Col = !is18Col && !is17Col && (rawArray.length >= 14 || Boolean(rawArray[11]) || Boolean(rawArray[10]) || (Boolean(rawArray[2]) && Boolean(rawArray[4])));

            if (isGiamSat) {
                bodyObj = {
                    timestamp: rawArray[0],
                    ca_truc: 'Giám sát',
                    ho_ten_gv: rawArray[2] || '',
                    ma_phong: rawArray[3] || 'GIÁM SÁT',
                    tinh_hinh: rawArray[4] || 'Tốt',
                    vsat_thuc_pham: rawArray[5] || '',
                    ghi_chu: rawArray[5] ? ('VSATTP: ' + rawArray[5]) : '',
                    nguon: 'google_sheet_row'
                };
            } else if (is18Col) {
                const isCaNgu = rawCa.includes('ngủ') || rawCa.includes('nghi') || rawCa.includes('nghỉ') || Boolean(rawArray[12]);
                if (isCaNgu) {
                    const valA = String(rawArray[14] || '').trim();
                    const valB = String(rawArray[15] || '').trim();
                    const isNumA = /^(\d+[\s\/\-]*\d*|\d+)$/.test(valA);
                    const isNumB = /^(\d+[\s\/\-]*\d*|\d+)$/.test(valB);
                    const si_so = isNumB ? valB : (isNumA ? valA : valB);
                    const tinh_hinh = isNumB ? (valA || 'Tốt') : (isNumA ? (valB || 'Tốt') : (valA || 'Tốt'));

                    bodyObj = {
                        timestamp: rawArray[0],
                        ca_truc: 'Trực ngủ',
                        ho_ten_gv: rawArray[12] || '',
                        ma_phong: rawArray[13] || '',
                        si_so: si_so,
                        tinh_hinh: tinh_hinh,
                        danh_sach_vang: rawArray[16] || '',
                        hs_vi_pham: rawArray[17] || '',
                        ghi_chu: rawArray[18] || '',
                        nguon: 'google_sheet_row'
                    };
                } else {
                    const valA = String(rawArray[8] || '').trim();
                    const valB = String(rawArray[9] || '').trim();
                    const isNumA = /^(\d+[\s\/\-]*\d*|\d+)$/.test(valA);
                    const isNumB = /^(\d+[\s\/\-]*\d*|\d+)$/.test(valB);
                    const si_so = isNumB ? valB : (isNumA ? valA : valB);
                    const tinh_hinh = isNumB ? (valA || 'Tốt') : (isNumA ? (valB || 'Tốt') : (valA || 'Tốt'));

                    bodyObj = {
                        timestamp: rawArray[0],
                        ca_truc: 'Trực ăn',
                        ho_ten_gv: rawArray[6] || '',
                        ma_phong: rawArray[7] || '',
                        si_so: si_so,
                        tinh_hinh: tinh_hinh,
                        danh_sach_vang: rawArray[10] || '',
                        ghi_chu: rawArray[11] || '',
                        nguon: 'google_sheet_row'
                    };
                }
                if (bodyObj.danh_sach_vang) {
                    const lines = String(bodyObj.danh_sach_vang).split(/\r?\n|;/).map(s => s.trim()).filter(s => s.length > 0 && !s.toLowerCase().startsWith('không') && !s.toLowerCase().startsWith('ko') && !s.toLowerCase().startsWith('đủ') && s !== '0');
                    bodyObj.so_hs_vang = lines.length;
                }
            } else if (is17Col) {
                const isCaNgu = rawCa.includes('ngủ') || rawCa.includes('nghi') || rawCa.includes('nghỉ') || Boolean(rawArray[12]) || Boolean(rawArray[11]);
                if (isCaNgu) {
                    bodyObj = {
                        timestamp: rawArray[0],
                        ca_truc: 'Trực ngủ',
                        ho_ten_gv: rawArray[11] || '',
                        ma_phong: rawArray[12] || '',
                        si_so: rawArray[13] || '',
                        tinh_hinh: rawArray[14] || 'Tốt',
                        hs_vi_pham: rawArray[15] || '',
                        ghi_chu: rawArray[16] || '',
                        nguon: 'google_sheet_row'
                    };
                } else {
                    bodyObj = {
                        timestamp: rawArray[0],
                        ca_truc: 'Trực ăn',
                        ho_ten_gv: rawArray[6] || '',
                        ma_phong: rawArray[7] || '',
                        tinh_hinh: rawArray[8] || 'Tốt',
                        si_so: rawArray[9] || '',
                        ghi_chu: rawArray[10] || '',
                        nguon: 'google_sheet_row'
                    };
                }
            } else if (is16Col) {
                const isCaNgu = rawCa.includes('ngủ') || rawCa.includes('nghi') || rawCa.includes('nghỉ') || Boolean(rawArray[11]);
                if (isCaNgu) {
                    bodyObj = {
                        timestamp: rawArray[0],
                        ca_truc: 'Trực ngủ',
                        ho_ten_gv: rawArray[10] || '',
                        ma_phong: rawArray[11] || '',
                        si_so: rawArray[12] || '',
                        tinh_hinh: rawArray[13] || 'Tốt',
                        hs_vi_pham: rawArray[14] || '',
                        ghi_chu: rawArray[15] || '',
                        nguon: 'google_sheet_row'
                    };
                } else {
                    bodyObj = {
                        timestamp: rawArray[0],
                        ca_truc: 'Trực ăn',
                        ho_ten_gv: rawArray[5] || '',
                        ma_phong: rawArray[6] || '',
                        tinh_hinh: rawArray[7] || 'Tốt',
                        si_so: rawArray[8] || '',
                        ghi_chu: rawArray[9] || '',
                        nguon: 'google_sheet_row'
                    };
                }
            } else {
                // Tương thích ngược với Sheet 13 cột cũ
                const isCaNgu = rawCa.includes('ngủ') || rawCa.includes('nghi') || (Boolean(rawArray[8]) && !rawArray[3]);
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
            }
        }

        // 2. Trích xuất Ca trực
        let ca_truc_raw = pickFirstNonEmpty(
            bodyObj.ca_truc,
            bodyObj['Ca trực'],
            bodyObj['ca'],
            bodyObj['1. Ca trực']
        );

        // Kiểm tra xem có dấu hiệu rõ ràng của Ca Giám sát không:
        // (Có trường vsat_thuc_pham, hoặc ghi chú có VSATTP, hoặc tên ca chứa giám sát)
        const hasVsatSignal = Boolean(pickFirstNonEmpty(
            bodyObj.vsat_thuc_pham,
            bodyObj['Vệ sinh an toàn thực phẩm'],
            bodyObj['An toàn thực phẩm'],
            bodyObj['vệ sinh']
        )) || (bodyObj.ghi_chu && String(bodyObj.ghi_chu).includes('VSATTP:'));

        if (hasVsatSignal || String(ca_truc_raw).toLowerCase().includes('giám sát') || String(ca_truc_raw).toLowerCase().includes('gám sát') || String(ca_truc_raw).toLowerCase().includes('giamsat')) {
            ca_truc_raw = 'Giám sát';
        } else if (!ca_truc_raw) {
            if (pickFirstNonEmpty(bodyObj['Phòng ngủ'], bodyObj.phong_ngu)) {
                ca_truc_raw = 'Trực ngủ';
            } else if (pickFirstNonEmpty(bodyObj['Phòng ăn'], bodyObj.phong_an)) {
                ca_truc_raw = 'Trực ăn';
            }
        }
        const caChuan = normalizeCaTruc(ca_truc_raw);

        // 3. Trích xuất Mã phòng (Phòng ăn, Phòng ngủ hoặc Giám sát)
        let ma_phong_raw = '';
        if (caChuan === 2) {
            ma_phong_raw = pickFirstNonEmpty(
                bodyObj.ma_phong,
                bodyObj.phong,
                'GIÁM SÁT'
            );
        } else if (caChuan === 1) {
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
        let ho_ten_gv_raw = '';
        if (caChuan === 2) {
            ho_ten_gv_raw = pickFirstNonEmpty(
                bodyObj['Họ tên'],
                bodyObj['Họ và tên'],
                bodyObj.ho_ten_gv,
                bodyObj.ho_ten,
                bodyObj.ten_gv,
                bodyObj['3. Họ và tên Giáo viên trực'],
                bodyObj['Giáo viên trực']
            );
        } else if (caChuan === 1) {
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

        // Chuẩn hóa tên giáo viên nếu sai chính tả trên form (Quan -> Quang: Hồ Quang Thịnh)
        if (typeof ho_ten_gv_raw === 'string') {
            if (/hồ\s*quan\s*thịnh/i.test(ho_ten_gv_raw) || /^quan\s*thịnh$/i.test(ho_ten_gv_raw.trim())) {
                ho_ten_gv_raw = 'Hồ Quang Thịnh';
            }
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

        if (si_so_raw) {
            si_so_raw = cleanSiSoHelper(si_so_raw, ma_phong_raw);
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

        // 8.1 Trích xuất Vệ sinh an toàn thực phẩm (Ca giám sát)
        let vsatThucPham = pickFirstNonEmpty(
            bodyObj.vsat_thuc_pham,
            bodyObj['Vệ sinh an toàn thực phẩm'],
            bodyObj['An toàn thực phẩm'],
            bodyObj['vệ sinh']
        );
        if (!vsatThucPham && ghiChuContent && ghiChuContent.includes('VSATTP:')) {
            const m = ghiChuContent.match(/VSATTP:\s*([^|]+)/i);
            if (m) vsatThucPham = m[1].trim();
        }

        // 9. Trích xuất Ngày & Giờ nộp (Dấu thời gian)
        const timeInput = pickFirstNonEmpty(
            bodyObj.thoi_gian_nop,
            bodyObj.timestamp,
            bodyObj.ngay,
            bodyObj['Dấu thời gian'],
            bodyObj['Timestamp'],
            bodyObj['Thời gian']
        );
        const parsedDate = parseVNSubmissionDate(timeInput);
        if (timeInput && !parsedDate) {
            return res.status(400).json({
                ok: false,
                error: 'Ngày/giờ nộp không hợp lệ hoặc không tồn tại (ví dụ: ngày 31/02).'
            });
        }
        const { ngay: ngayChuan, submittedAt } = parsedDate || { ngay: getVietnamTodayYMD(), submittedAt: new Date() };

        const vangNum = parseInt(bodyObj.so_hs_vang, 10) || 0;
        const maNhap = String(bodyObj.ma_xac_thuc || bodyObj.sdt_xac_nhan || '').trim().toUpperCase();

        let matchedTeacher = null;
        let hoTenChuan = String(ho_ten_gv_raw || '').trim();

        if (maNhap) {
            matchedTeacher = await GiaoVien.findOne({
                where: { ma_bao_mat: maNhap }
            });
            if (matchedTeacher) {
                hoTenChuan = matchedTeacher.ho_ten;
            }
        }

        // Đảm bảo họ tên chuẩn xác khi lưu vào CSDL (Quan -> Quang: Hồ Quang Thịnh)
        if (/hồ\s*quan\s*thịnh/i.test(hoTenChuan) || /^quan\s*thịnh$/i.test(hoTenChuan)) {
            hoTenChuan = 'Hồ Quang Thịnh';
        }

        // Báo cáo chỉ hợp lệ khi:
        // 1. Có mã xác thực được nhập
        // 2. Mã xác thực khớp với một giáo viên trong CSDL
        // 3. Nếu form có gửi tên GV, tên GV đó phải tương đồng với GV sở hữu mã bảo mật
        let isHopLe = false;
        if (maNhap && matchedTeacher) {
            if (ho_ten_gv_raw && String(ho_ten_gv_raw).trim()) {
                const inputNameLower = String(ho_ten_gv_raw).trim().toLowerCase();
                const matchedNameLower = matchedTeacher.ho_ten.trim().toLowerCase();
                if (inputNameLower === matchedNameLower || matchedNameLower.includes(inputNameLower) || inputNameLower.includes(matchedNameLower)) {
                    isHopLe = true;
                } else {
                    isHopLe = false;
                }
            } else {
                isHopLe = true;
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
            so_hs_phep: Math.max(0, parseInt(bodyObj.so_hs_phep, 10) || 0),
            so_hs_vang: Math.max(0, vangNum),
            danh_sach_vang: String(bodyObj.danh_sach_vang || '').trim(),
            hs_vi_pham: viPhamContent,
            tinh_hinh: tinh_hinh_raw,
            ghi_chu: ghiChuContent,
            vsat_thuc_pham: vsatThucPham || null,
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
                ca_truc: record.ca_truc === 0 ? 'Ăn trưa' : (record.ca_truc === 1 ? 'Nghỉ trưa' : 'Giám sát'),
                ma_phong: record.ma_phong,
                ho_ten_gv: record.ho_ten_gv,
                si_so: record.si_so,
                tinh_hinh: record.tinh_hinh,
                hs_vi_pham: record.hs_vi_pham,
                ghi_chu: record.ghi_chu,
                vsat_thuc_pham: record.vsat_thuc_pham,
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

        // Hàm kiểm tra một phòng có được báo cáo bao phủ (kể cả trường hợp gộp cụm như D21, D22, D23 hay P6, P7, P8)
        const isRoomCovered = (roomCode, reportedRoomStrings) => {
            const cleanCode = String(roomCode || '').trim().toUpperCase().replace(/\./g, '');
            for (const rep of reportedRoomStrings) {
                if (!rep) continue;
                const cleanRep = String(rep).trim().toUpperCase().replace(/\./g, '');
                if (cleanCode === cleanRep) return true;
                const parts = cleanRep.split(/[,;\-\/]+/).map(s => s.trim()).filter(Boolean);
                if (parts.includes(cleanCode)) return true;
                const matchLetter = cleanCode.match(/^([A-Z]+)(\d+)$/);
                if (matchLetter) {
                    const prefix = matchLetter[1];
                    const num = matchLetter[2];
                    if (parts.some(p => p === cleanCode || (p === num && parts.some(sub => sub.startsWith(prefix))))) {
                        return true;
                    }
                }
            }
            return false;
        };

        // Chỉ tính phòng chưa nộp nếu start === end (xem theo ngày cụ thể)
        let phongChuaBaoCaoAn = [];
        let phongChuaBaoCaoNgu = [];
        let giamSatChuaBaoCao = [];
        let tongGiamSatPhanCong = 0;

        if (start === end) {
            const reportedRoomsAn = records.filter(r => r.ca_truc === 0).map(r => r.ma_phong);
            const reportedRoomsNgu = records.filter(r => r.ca_truc === 1).map(r => r.ma_phong);

            phongChuaBaoCaoAn = allPhong
                .filter(p => p.loai_phong === 0 && !isRoomCovered(p.ma_phong, reportedRoomsAn))
                .map(p => p.ma_phong);

            phongChuaBaoCaoNgu = allPhong
                .filter(p => p.loai_phong === 1 && !isRoomCovered(p.ma_phong, reportedRoomsNgu))
                .map(p => p.ma_phong);

            // Kiểm tra tiến độ báo cáo của các GV được phân công Giám sát (nhiem_vu = 1)
            try {
                const pcGiamSat = await PhanCongTrucGV.findAll({
                    where: { ngay: start, nhiem_vu: 1 },
                    include: [{ model: GiaoVien, as: 'giao_vien', attributes: ['id', 'ho_ten'] }]
                });
                const gvGSMap = new Map();
                pcGiamSat.forEach(pc => {
                    if (pc.giao_vien?.ho_ten) {
                        gvGSMap.set(pc.giao_vien.ho_ten.trim().toLowerCase(), pc.giao_vien.ho_ten.trim());
                    }
                });
                tongGiamSatPhanCong = gvGSMap.size;
                const reportedGSGV = new Set(
                    records
                        .filter(r => r.ca_truc === 2 || (r.vsat_thuc_pham && r.vsat_thuc_pham.trim()))
                        .map(r => (r.ho_ten_gv || '').trim().toLowerCase())
                );
                for (const [lowerName, originalName] of gvGSMap.entries()) {
                    if (!reportedGSGV.has(lowerName)) {
                        giamSatChuaBaoCao.push(originalName);
                    }
                }
            } catch (pcErr) {
                console.error('Lỗi kiểm tra phân công giám sát:', pcErr.message);
            }
        }

        const coViPhamRecords = records.filter(r => r.hs_vi_pham && r.hs_vi_pham.trim());
        const coVangRecords = records.filter(r => (r.danh_sach_vang && r.danh_sach_vang.trim()) || (r.so_hs_vang && r.so_hs_vang > 0));

        // Thống kê theo GV (tổng ca ăn, ca ngủ, giám sát của từng GV trong tuần/tháng)
        // Deduplicate theo (ho_ten_gv, ngay, ca_truc) để GV trực/báo cáo nhiều phòng trong 1 ca chỉ tính 1 công
        const gvSummaryMap = {};
        const seenGVShift = new Set();
        records.forEach(r => {
            const gvName = (r.ho_ten_gv || 'Khác').trim();
            const shiftKey = `${gvName.toLowerCase()}_${r.ngay}_${r.ca_truc}`;
            if (seenGVShift.has(shiftKey)) return;
            seenGVShift.add(shiftKey);

            if (!gvSummaryMap[gvName]) {
                gvSummaryMap[gvName] = { ho_ten: gvName, so_ca_an: 0, so_ca_ngu: 0, so_ca_giam_sat: 0, tong_ca: 0 };
            }
            if (r.ca_truc === 0) gvSummaryMap[gvName].so_ca_an++;
            else if (r.ca_truc === 1) gvSummaryMap[gvName].so_ca_ngu++;
            else if (r.ca_truc === 2) gvSummaryMap[gvName].so_ca_giam_sat++;
            gvSummaryMap[gvName].tong_ca++;
        });

        const stats = {
            total: records.length,
            caAnCount: records.filter(r => r.ca_truc === 0).length,
            caNguCount: records.filter(r => r.ca_truc === 1).length,
            giamSatCount: records.filter(r => r.ca_truc === 2).length,
            coViPhamCount: coViPhamRecords.length,
            coVangCount: coVangRecords.length,
            totalVang: records.reduce((sum, r) => sum + (r.so_hs_vang || 0), 0),
            totalPhongAn: allPhong.filter(p => p.loai_phong === 0).length,
            totalPhongNgu: allPhong.filter(p => p.loai_phong === 1).length,
            tongGiamSatPhanCong,
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
            nguoi_phu_trach: heThong?.nguoi_phu_trach || 'Vũ Quốc Phong',
            phongChuaBaoCaoAn,
            phongChuaBaoCaoNgu,
            giamSatChuaBaoCao,
            tongGiamSatPhanCong,
        });
    } catch (err) {
        return res.status(500).json({ ok: false, error: err.message });
    }
});

/**
 * POST /api/baocaotruc/delete/
 * Xóa 1 bản ghi báo cáo trực (CHỈ SUPER ADMIN mới có quyền để đảm bảo công bằng)
 */
router.post('/api/baocaotruc/delete/', loginRequired, async (req, res) => {
    try {
        const user = req.user || req.session?.user;
        const isSuper = Boolean(user && (user.is_superuser === true || user.role === 'super_admin'));
        if (!isSuper) {
            return res.status(403).json({ ok: false, error: 'Chỉ Super Admin mới có quyền xóa báo cáo trực để đảm bảo tính công bằng.' });
        }

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
 * Xóa toàn bộ báo cáo trực theo Ngày / Tuần / Tháng sau khi đã xuất báo cáo (CHỈ SUPER ADMIN)
 */
router.post('/api/baocaotruc/delete-range/', loginRequired, async (req, res) => {
    try {
        const user = req.user || req.session?.user;
        const isSuper = Boolean(user && (user.is_superuser === true || user.role === 'super_admin'));
        if (!isSuper) {
            return res.status(403).json({ ok: false, error: 'Chỉ Super Admin mới có quyền xóa báo cáo trực để đảm bảo tính công bằng.' });
        }

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

/**
 * POST /api/baocaotruc/update/
 * Chỉnh sửa 1 bản ghi báo cáo trực (CHỈ SUPER ADMIN)
 */
router.post('/api/baocaotruc/update/', loginRequired, async (req, res) => {
    try {
        const user = req.user || req.session?.user;
        const isSuper = Boolean(user && (user.is_superuser === true || user.role === 'super_admin'));
        if (!isSuper) {
            return res.status(403).json({ ok: false, error: 'Chỉ Super Admin mới có quyền chỉnh sửa báo cáo trực để đảm bảo tính công bằng và minh bạch.' });
        }

        const {
            id, ngay, ca_truc, ma_phong, ho_ten_gv,
            si_so, so_hs_vang, so_hs_phep, danh_sach_vang,
            hs_vi_pham, tinh_hinh, ghi_chu, vsat_thuc_pham
        } = req.body;

        if (!id) return res.status(400).json({ ok: false, error: 'Thiếu ID bản ghi báo cáo' });

        const vnToday = getVietnamTime().todayStr;
        if (ngay !== undefined && ngay > vnToday) {
            return res.status(400).json({ ok: false, error: `Không thể chuyển ngày báo cáo sang ngày chưa đến trong tương lai (${ngay}).` });
        }

        const record = await BaoCaoTruc.findByPk(id);
        if (!record) return res.status(404).json({ ok: false, error: 'Không tìm thấy bản ghi báo cáo' });

        if (ngay !== undefined) record.ngay = ngay;
        if (ca_truc !== undefined) record.ca_truc = parseInt(ca_truc, 10);
        if (ma_phong !== undefined) record.ma_phong = String(ma_phong).trim();
        if (ho_ten_gv !== undefined) record.ho_ten_gv = String(ho_ten_gv).trim();
        if (si_so !== undefined) record.si_so = si_so !== null ? String(si_so).trim() : null;
        if (so_hs_phep !== undefined) record.so_hs_phep = Math.max(0, parseInt(so_hs_phep, 10) || 0);
        if (so_hs_vang !== undefined) record.so_hs_vang = parseInt(so_hs_vang, 10) || 0;
        if (danh_sach_vang !== undefined) record.danh_sach_vang = danh_sach_vang !== null ? String(danh_sach_vang).trim() : null;
        if (hs_vi_pham !== undefined) record.hs_vi_pham = hs_vi_pham !== null ? String(hs_vi_pham).trim() : null;
        if (tinh_hinh !== undefined) record.tinh_hinh = tinh_hinh !== null ? String(tinh_hinh).trim() : null;
        if (ghi_chu !== undefined) record.ghi_chu = ghi_chu !== null ? String(ghi_chu).trim() : null;
        if (vsat_thuc_pham !== undefined) record.vsat_thuc_pham = vsat_thuc_pham !== null ? String(vsat_thuc_pham).trim() : null;

        await record.save();

        return res.json({ ok: true, message: 'Đã cập nhật bản ghi báo cáo thành công', record });
    } catch (err) {
        return res.status(500).json({ ok: false, error: err.message });
    }
});

/**
 * GET /api/baocaotruc/lay-thong-tin-tu-dong
 * Tự động tính toán Sĩ số, Số HS vắng, Danh sách HS vắng và dữ liệu báo cáo cũ (nếu có)
 * phục vụ Giáo viên gửi Báo cáo Ca trực trực tiếp qua ứng dụng.
 */
router.get('/api/baocaotruc/lay-thong-tin-tu-dong', loginRequired, async (req, res) => {
    try {
        const getVnToday = () => new Date(Date.now() + 7 * 3600 * 1000).toISOString().split('T')[0];
        const { ngay, ca_truc, ma_phong } = req.query;
        const targetNgay = ngay || getVnToday();
        const loaiTruc = parseInt(ca_truc, 10);
        const hoTenGV = req.user.fullname || req.user.username || 'Giáo viên trực';

        if (isNaN(loaiTruc)) {
            return res.status(400).json({ ok: false, error: 'Thiếu hoặc sai định dạng ca_truc' });
        }

        const rawPhong = String(ma_phong || '').trim();
        const roomCodes = rawPhong
            ? rawPhong.split(',').map(s => s.trim().toUpperCase()).filter(Boolean)
            : [];

        // 1. Kiểm tra xem giáo viên này (hoặc phòng này) đã có báo cáo trong ngày chưa
        let existingReport = null;
        if (rawPhong) {
            if (roomCodes.length <= 1) {
                const targetCode = (roomCodes[0] || rawPhong).toUpperCase();
                existingReport = await BaoCaoTruc.findOne({
                    where: {
                        ngay: targetNgay,
                        ca_truc: loaiTruc,
                        [Op.or]: [
                            { ma_phong: rawPhong.toUpperCase() },
                            { ma_phong: { [Op.like]: `%${targetCode}%` } }
                        ]
                    },
                    order: [['id', 'DESC']]
                });
            } else {
                // Với chế độ gộp nhiều phòng (ví dụ P6, P7, P8):
                // 1. Tìm báo cáo gộp chung chứa tất cả các phòng
                existingReport = await BaoCaoTruc.findOne({
                    where: {
                        ngay: targetNgay,
                        ca_truc: loaiTruc,
                        [Op.or]: [
                            { ma_phong: rawPhong.toUpperCase() },
                            { [Op.and]: roomCodes.map(rc => ({ ma_phong: { [Op.like]: `%${rc}%` } })) }
                        ]
                    },
                    order: [['id', 'DESC']]
                });

                // 2. Nếu chưa có 1 báo cáo chung, kiểm tra xem tất cả các phòng phụ trách này đều đã có báo cáo riêng lẻ chưa
                if (!existingReport && roomCodes.length > 1) {
                    const reportsForRooms = await BaoCaoTruc.findAll({
                        where: {
                            ngay: targetNgay,
                            ca_truc: loaiTruc,
                            [Op.or]: roomCodes.map(rc => ({
                                [Op.or]: [
                                    { ma_phong: rc },
                                    { ma_phong: { [Op.like]: `%${rc}%` } }
                                ]
                            }))
                        },
                        order: [['id', 'DESC']]
                    });
                    const reportedRooms = new Set();
                    reportsForRooms.forEach(r => {
                        const parts = String(r.ma_phong || '').split(',').map(s => s.trim().toUpperCase());
                        roomCodes.forEach(rc => {
                            if (parts.includes(rc) || String(r.ma_phong || '').toUpperCase().includes(rc)) {
                                reportedRooms.add(rc);
                            }
                        });
                    });
                    const allReported = roomCodes.length > 0 && roomCodes.every(rc => reportedRooms.has(rc));
                    if (allReported && reportsForRooms.length > 0) {
                        existingReport = reportsForRooms[0];
                    }
                }
            }
        }

        // 2. Tự động tính toán sĩ số và danh sách HS vắng từ CSDL
        let siSoCalculated = '';
        let soVangCalculated = 0;
        let dsVangCalculated = '';
        let countPhep = 0;
        let totalStudents = 0;
        let countChecked = 0;
        let ddMap = {};

        if (roomCodes.length > 0 && (loaiTruc === 0 || loaiTruc === 1)) {
            const fieldPhong = loaiTruc === 0 ? 'ma_phong_an_id' : 'ma_phong_ngu_id';

            const allStudents = await HocSinh.findAll({
                where: {
                    [fieldPhong]: { [Op.in]: roomCodes },
                    [Op.or]: [
                        { dang_hoc: true },
                        { ngay_rut: { [Op.gt]: targetNgay } }
                    ]
                },
                attributes: ['id', 'ho_ten', 'lop', 'gioi_tinh', 'dang_hoc', 'ngay_vao', 'ngay_rut', fieldPhong],
                order: [['lop', 'ASC'], ['ho_ten', 'ASC']]
            });

            // Lọc chính xác học sinh tham gia tại ngày targetNgay
            const students = allStudents.filter(s => {
                if (s.ngay_vao && s.ngay_vao > targetNgay) return false;
                if (s.ngay_rut && s.ngay_rut <= targetNgay) return false;
                if (!s.dang_hoc && (!s.ngay_rut || s.ngay_rut <= targetNgay)) return false;
                return true;
            });

            totalStudents = students.length;
            const hsIds = students.map(s => s.id);

            const ddRecords = hsIds.length > 0 ? await DiemDanhHS.findAll({
                where: {
                    ngay: targetNgay,
                    ma_hs_id: { [Op.in]: hsIds }
                }
            }) : [];

            ddMap = {};
            ddRecords.forEach(r => {
                const status = loaiTruc === 0 ? r.diem_danh_an : r.diem_danh_ngu;
                if (status !== null && status !== undefined) {
                    ddMap[r.ma_hs_id] = { status, ghi_chu: r.ghi_chu };
                }
            });

            // Lấy toàn bộ draft của các phòng trong 1 query duy nhất
            const drafts = await DiemDanhDraft.findAll({
                where: { ngay: targetNgay, loai_truc: loaiTruc, ma_phong_id: { [Op.in]: roomCodes } }
            });
            drafts.forEach(draft => {
                if (draft && Array.isArray(draft.danh_sach_hs)) {
                    draft.danh_sach_hs.forEach(item => {
                        if (!ddMap[item.id] || ddMap[item.id].status === null) {
                            ddMap[item.id] = { status: item.status, ghi_chu: item.ghi_chu };
                        }
                    });
                }
            });

            const vangList = [];
            let countCoMat = 0;
            countPhep = 0;

            students.forEach(s => {
                const info = ddMap[s.id];
                const status = info ? info.status : null;
                // Yêu cầu: "HS phép không báo cáo" -> Chỉ báo cáo học sinh Vắng không phép (status === 1)
                if (status === 1) {
                    vangList.push({
                        ...s.toJSON(),
                        status: 1,
                        statusText: 'Vắng không phép',
                        ghi_chu: info.ghi_chu || ''
                    });
                } else if (status === 2) {
                    countPhep++;
                } else if (status === 0) {
                    countCoMat++;
                }
            });

            // Kiểm tra trạng thái chốt của các phòng
            const pStatuses = await DiemDanhPhong.findAll({
                where: { ngay: targetNgay, loai_truc: loaiTruc, ma_phong_id: { [Op.in]: roomCodes } }
            });
            const isAllChot = pStatuses.length > 0 && pStatuses.every(ps => ps.trang_thai_chot === 'da_chot' || Boolean(ps.da_diem_danh));

            soVangCalculated = vangList.length; // Chỉ tính số lượng HS vắng không phép
            countChecked = countCoMat + countPhep + soVangCalculated;
            const soCoMatThucTe = isAllChot
                ? Math.max(0, totalStudents - vangList.length - countPhep)
                : countCoMat;
            siSoCalculated = totalStudents > 0 ? `${soCoMatThucTe}/${totalStudents}` : '0/0';

            if (vangList.length > 0) {
                // Map chuẩn Google Form hiện tại: Mỗi bạn 1 dòng dạng "Họ tên Lớp"
                dsVangCalculated = vangList.map(s => `${s.ho_ten} ${s.lop}`.trim()).join('\n');
            } else {
                dsVangCalculated = '';
            }
        }

        // 3. Kiểm tra xem giáo viên có nhiệm vụ Giám Sát (nhiem_vu = 1) hay không
        let isGiamSat = false;
        let gvId = req.user.giao_vien_id;
        if (!gvId) {
            const gvObj = await GiaoVien.findOne({ where: { ho_ten: req.user.username } });
            if (gvObj) gvId = gvObj.id;
        }
        if (gvId) {
            const pcGiamSat = await PhanCongTrucGV.findOne({
                where: {
                    ngay: targetNgay,
                    [Op.or]: [
                        { ma_gv_id: gvId },
                        { ma_gv_truc_thay_id: gvId }
                    ],
                    nhiem_vu: 1
                }
            });
            if (pcGiamSat) isGiamSat = true;
        }
        if (req.user.role === 'admin' || req.user.role === 'quan_ly') {
            isGiamSat = true;
        }

        // 4. Lấy cấu hình link Google Form
        const heThong = await CauHinhHeThong.findByPk(1);
        const linkGoogleForm = heThong?.link_google_form || 'https://forms.gle/6B4GC5aG1KyEuQTaA';

        const finalPhep = existingReport?.so_hs_phep !== undefined ? existingReport.so_hs_phep : countPhep;

        // 5. Kiểm tra điều kiện điểm danh xong & Khung giờ quy định
        // Báo cáo Ăn: 11h15 (675) đến 11h45 (705)
        // Báo cáo Ngủ: 11h40 (700) đến 12h45 (765)
        const vnNow = new Date(Date.now() + 7 * 3600 * 1000);
        const curMinutes = vnNow.getUTCHours() * 60 + vnNow.getUTCMinutes();
        const curHourStr = String(vnNow.getUTCHours()).padStart(2, '0') + ':' + String(vnNow.getUTCMinutes()).padStart(2, '0');
        const todayVn = vnNow.toISOString().split('T')[0];
        const isToday = targetNgay === todayVn;

        const isCaAn = loaiTruc === 0 || loaiTruc === 2;
        const minMinutes = isCaAn ? 675 : 700; // 11:15 hoặc 11:40
        const maxMinutes = isCaAn ? 705 : 765; // 11:45 hoặc 12:45
        const gioMoCua = isCaAn ? '11:15' : '11:40';
        const gioDongCua = isCaAn ? '11:45' : '12:45';

        let timeState = 'trong_gio'; // 'chua_den' | 'trong_gio' | 'qua_gio'
        let timeMessage = '';
        let minsRemaining = 0;

        if (isToday) {
            if (curMinutes < minMinutes) {
                timeState = 'chua_den';
                const waitMins = minMinutes - curMinutes;
                timeMessage = `Chưa tới thời gian báo cáo quy định (${gioMoCua} – ${gioDongCua}, còn ${waitMins} phút).`;
            } else if (curMinutes >= maxMinutes) {
                timeState = 'qua_gio';
                timeMessage = `Đã quá thời gian báo cáo quy định (đã đóng lúc ${gioDongCua}).`;
            } else {
                timeState = 'trong_gio';
                minsRemaining = maxMinutes - curMinutes;
                timeMessage = `Đang trong khung giờ báo cáo (đóng lúc ${gioDongCua}, còn ${minsRemaining} phút).`;
            }
        } else if (targetNgay < todayVn) {
            timeState = 'qua_gio';
            timeMessage = 'Ngày báo cáo đã qua. Hệ thống đã khóa tiếp nhận hoặc cập nhật báo cáo.';
        } else {
            timeState = 'chua_den';
            timeMessage = 'Chưa tới ngày báo cáo.';
        }

        // Kiểm tra xem phòng này đã chốt điểm danh chưa (Chỉ khi GV chốt điểm danh mới được báo cáo)
        let daChotDiemDanh = true;
        const chuaChotRooms = [];
        if (loaiTruc !== 2) {
            for (const rCode of roomCodes) {
                const ddp = await DiemDanhPhong.findOne({
                    where: { ngay: targetNgay, loai_truc: loaiTruc, ma_phong_id: rCode }
                });
                if (!ddp || (ddp.trang_thai_chot !== 'da_chot' && !ddp.da_diem_danh)) {
                    daChotDiemDanh = false;
                    chuaChotRooms.push(rCode);
                }
            }
        }
        const daDiemDanh = daChotDiemDanh;

        const isAdmin = req.user.role === 'admin' || req.user.role === 'quan_ly' || req.user.role === 'hoc_vu' || req.user.is_superuser;
        let choPhepBaoCao = true;
        let lyDoKhoa = null;

        const isFuture = targetNgay > todayVn;
        if (isFuture) {
            choPhepBaoCao = false;
            lyDoKhoa = `Không thể báo cáo cho ngày chưa đến (${targetNgay}). Hệ thống chỉ cho phép thao tác với ngày hiện tại và ngày quá khứ.`;
        } else if (!isAdmin) {
            if (!daChotDiemDanh) {
                choPhepBaoCao = false;
                lyDoKhoa = chuaChotRooms.length > 0
                    ? `Thầy/Cô phải hoàn thành chốt sổ điểm danh phòng ${chuaChotRooms.join(', ')} xong mới được gửi báo cáo ca trực!`
                    : 'Thầy/Cô phải hoàn thành chốt sổ điểm danh xong mới được gửi báo cáo ca trực!';
            } else if (timeState === 'chua_den') {
                choPhepBaoCao = false;
                lyDoKhoa = timeMessage;
            } else if (timeState === 'qua_gio') {
                choPhepBaoCao = false;
                lyDoKhoa = timeMessage;
            }
        }

        return res.json({
            ok: true,
            ho_ten_gv: hoTenGV,
            ngay: targetNgay,
            ca_truc: loaiTruc,
            ma_phong: rawPhong,
            is_giam_sat: isGiamSat,
            si_so: cleanSiSoHelper(existingReport?.si_so || siSoCalculated, rawPhong),
            so_hs_phep: finalPhep,
            so_hs_vang: existingReport?.so_hs_vang !== undefined ? existingReport.so_hs_vang : soVangCalculated,
            danh_sach_vang: existingReport?.danh_sach_vang || dsVangCalculated,
            link_google_form: linkGoogleForm,
            da_bao_cao: Boolean(existingReport),
            da_bao_cao_boi_ai: existingReport ? existingReport.ho_ten_gv : null,
            da_diem_danh: daDiemDanh,
            so_hs_da_diem_danh: countChecked,
            tong_hs: typeof totalStudents !== 'undefined' ? totalStudents : 0,
            live_diem_danh: {
                si_so: siSoCalculated,
                so_hs_vang: soVangCalculated,
                so_hs_phep: countPhep,
                danh_sach_vang: dsVangCalculated
            },
            khung_gio_quy_dinh: {
                gio_mo: gioMoCua,
                gio_dong: gioDongCua,
                state: timeState,
                message: timeMessage,
                mins_remaining: minsRemaining,
                gio_hien_tai: curHourStr,
            },
            cho_phep_bao_cao: choPhepBaoCao,
            ly_do_khoa: lyDoKhoa,
            is_admin_override: Boolean(isAdmin && !isFuture),
            bao_cao_cu: existingReport ? {
                id: existingReport.id,
                tinh_hinh: existingReport.tinh_hinh,
                hs_vi_pham: existingReport.hs_vi_pham,
                ghi_chu: existingReport.ghi_chu,
                vsat_thuc_pham: existingReport.vsat_thuc_pham,
                si_so: cleanSiSoHelper(existingReport.si_so, rawPhong),
                so_hs_phep: existingReport.so_hs_phep || 0,
                so_hs_vang: existingReport.so_hs_vang,
                danh_sach_vang: existingReport.danh_sach_vang,
                created_at: existingReport.created_at,
                nguon: existingReport.nguon
            } : null
        });
    } catch (err) {
        console.error('Lỗi lấy thông tin tự động cho báo cáo trực:', err);
        return res.status(500).json({ ok: false, error: err.message });
    }
});

/**
 * POST /api/baocaotruc/gui-bao-cao
 * Nhận báo cáo ca trực gửi từ Phần mềm/App của Giáo viên trực.
 * Lưu trực tiếp vào bảng nghiepvu_baocaotruc với nguon='phan_mem', is_hop_le=true.
 */
router.post('/api/baocaotruc/gui-bao-cao', loginRequired, async (req, res) => {
    try {
        const getVnToday = () => new Date(Date.now() + 7 * 3600 * 1000).toISOString().split('T')[0];
        const {
            ngay, ca_truc, ma_phong,
            si_so, so_hs_vang, so_hs_phep, danh_sach_vang,
            tinh_hinh, hs_vi_pham, ghi_chu, vsat_thuc_pham
        } = req.body;

        const targetNgay = ngay || getVnToday();
        const loaiTruc = parseInt(ca_truc, 10);
        if (isNaN(loaiTruc)) {
            return res.status(400).json({ ok: false, error: 'Vui lòng chọn ca trực hợp lệ (Ăn trưa, Nghỉ trưa hoặc Giám sát).' });
        }
        if (!ma_phong || !String(ma_phong).trim()) {
            return res.status(400).json({ ok: false, error: 'Vui lòng cung cấp mã phòng trực.' });
        }

        const hoTenGV = req.user.fullname || req.user.username || 'Giáo viên trực';
        const maPhongChuan = String(ma_phong).trim().toUpperCase();
        const vangNum = parseInt(so_hs_vang, 10) || 0;
        const phepNum = parseInt(so_hs_phep, 10) || 0;

        const isAdmin = req.user.role === 'admin' || req.user.role === 'quan_ly' || req.user.role === 'hoc_vu' || req.user.is_superuser;
        const vnNow = new Date(Date.now() + 7 * 3600 * 1000);
        const todayVn = vnNow.toISOString().split('T')[0];

        // Quy định: Toàn bộ người dùng (kể cả Admin) không được thao tác với những ngày chưa đến
        if (targetNgay > todayVn) {
            return res.status(400).json({
                ok: false,
                error: `Không thể gửi báo cáo ca trực cho ngày chưa đến (${targetNgay}). Hệ thống chỉ cho phép thao tác với ngày hiện tại và ngày quá khứ.`
            });
        }

        // KIỂM TRA QUY ĐỊNH THỜI GIAN & ĐIỀU KIỆN ĐIỂM DANH:
        // 1. Báo cáo ăn: từ 11h15 đến 12h00; Báo cáo ngủ: từ 11h45 đến 13h00.
        // 2. GV phải điểm danh xong mới được báo cáo. Sau mốc thời gian này không được báo cáo.
        // 3. Nếu đã báo cáo rồi thì cho phép cập nhật lại nếu trong thời gian quy định.
        if (!isAdmin) {
            const curMinutes = vnNow.getUTCHours() * 60 + vnNow.getUTCMinutes();

            if (targetNgay !== todayVn) {
                return res.status(400).json({
                    ok: false,
                    error: 'Chỉ được gửi hoặc cập nhật báo cáo ca trực trong ngày hiện tại.'
                });
            }

            const isCaAn = loaiTruc === 0 || loaiTruc === 2;
            const minMinutes = isCaAn ? 675 : 700; // 11h15 hoặc 11h40
            const maxMinutes = isCaAn ? 705 : 765; // 11h45 hoặc 12h45
            const timeRangeText = isCaAn ? '11h15 đến 11h45' : '11h40 đến 12h45';
            const timeEndText = isCaAn ? '11h45' : '12h45';

            if (curMinutes < minMinutes) {
                return res.status(400).json({
                    ok: false,
                    error: `Chưa tới thời gian báo cáo quy định (${timeRangeText}). Vui lòng quay lại sau!`
                });
            }

            if (curMinutes >= maxMinutes) {
                return res.status(400).json({
                    ok: false,
                    error: `Đã quá thời gian báo cáo quy định (đã đóng lúc ${timeEndText}). Sau khoảng mốc thời gian này hệ thống không tiếp nhận hoặc cập nhật báo cáo!`
                });
            }

            // Kiểm tra điều kiện: CHỈ KHI GV CHỐT ĐIỂM DANH MỚI ĐƯỢC BÁO CÁO (đối với Ca Ăn và Ca Ngủ)
            if (loaiTruc !== 2) {
                const roomCodes = String(maPhongChuan).split(/[,;\-\/]+/).map(s => s.trim().toUpperCase()).filter(Boolean);
                const chuaChotRooms = [];

                for (const rCode of roomCodes) {
                    const ddp = await DiemDanhPhong.findOne({
                        where: { ngay: targetNgay, loai_truc: loaiTruc, ma_phong_id: rCode }
                    });
                    if (!ddp || (ddp.trang_thai_chot !== 'da_chot' && !ddp.da_diem_danh)) {
                        chuaChotRooms.push(rCode);
                    }
                }

                if (chuaChotRooms.length > 0) {
                    return res.status(400).json({
                        ok: false,
                        error: `Thầy/Cô phải hoàn thành chốt điểm danh phòng ${chuaChotRooms.join(', ')} xong mới được gửi báo cáo ca trực!`
                    });
                }
            }
        }

        let record = await BaoCaoTruc.findOne({
            where: {
                ngay: targetNgay,
                ca_truc: loaiTruc,
                ma_phong: maPhongChuan,
                ho_ten_gv: hoTenGV,
            }
        });

        if (!record) {
            record = await BaoCaoTruc.findOne({
                where: {
                    ngay: targetNgay,
                    ca_truc: loaiTruc,
                    ma_phong: maPhongChuan,
                }
            });
        }

        const now = new Date();

        if (record) {
            record.ho_ten_gv = hoTenGV;
            if (si_so !== undefined) record.si_so = si_so !== null ? cleanSiSoHelper(si_so, maPhongChuan) : null;
            if (so_hs_phep !== undefined) record.so_hs_phep = Math.max(0, phepNum);
            if (so_hs_vang !== undefined) record.so_hs_vang = Math.max(0, vangNum);
            if (danh_sach_vang !== undefined) record.danh_sach_vang = danh_sach_vang !== null ? String(danh_sach_vang).trim() : null;
            if (tinh_hinh !== undefined) record.tinh_hinh = tinh_hinh !== null ? String(tinh_hinh).trim() : 'Tốt, ổn định';
            if (hs_vi_pham !== undefined) record.hs_vi_pham = hs_vi_pham !== null ? String(hs_vi_pham).trim() : null;
            if (ghi_chu !== undefined) record.ghi_chu = ghi_chu !== null ? String(ghi_chu).trim() : null;
            if (vsat_thuc_pham !== undefined) record.vsat_thuc_pham = vsat_thuc_pham !== null ? String(vsat_thuc_pham).trim() : null;
            record.is_hop_le = true;
            record.nguon = 'phan_mem';
            record.created_at = now;
            await record.save();
        } else {
            record = await BaoCaoTruc.create({
                ngay: targetNgay,
                ca_truc: loaiTruc,
                ma_phong: maPhongChuan,
                ho_ten_gv: hoTenGV,
                si_so: si_so ? cleanSiSoHelper(si_so, maPhongChuan) : null,
                so_hs_phep: Math.max(0, phepNum),
                so_hs_vang: Math.max(0, vangNum),
                danh_sach_vang: danh_sach_vang ? String(danh_sach_vang).trim() : null,
                tinh_hinh: tinh_hinh ? String(tinh_hinh).trim() : 'Tốt, ổn định',
                hs_vi_pham: hs_vi_pham ? String(hs_vi_pham).trim() : null,
                ghi_chu: ghi_chu ? String(ghi_chu).trim() : null,
                vsat_thuc_pham: vsat_thuc_pham ? String(vsat_thuc_pham).trim() : null,
                is_hop_le: true,
                nguon: 'phan_mem',
                created_at: now,
            });
        }

        return res.json({
            ok: true,
            message: 'Đã gửi báo cáo ca trực lên Ban Quản Lý thành công!',
            record: {
                id: record.id,
                ngay: record.ngay,
                ca_truc: record.ca_truc,
                ma_phong: record.ma_phong,
                ho_ten_gv: record.ho_ten_gv,
                si_so: record.si_so,
                so_hs_phep: record.so_hs_phep,
                so_hs_vang: record.so_hs_vang,
                danh_sach_vang: record.danh_sach_vang,
                tinh_hinh: record.tinh_hinh,
                hs_vi_pham: record.hs_vi_pham,
                ghi_chu: record.ghi_chu,
                vsat_thuc_pham: record.vsat_thuc_pham,
                nguon: record.nguon,
                created_at: record.created_at,
            }
        });
    } catch (err) {
        console.error('Lỗi gửi báo cáo trực từ phần mềm:', err);
        return res.status(500).json({ ok: false, error: err.message });
    }
});

// ═══════════════════════════════════════════════════════════════════
// TÀI CHÍNH & SỔ THU TIỀN BÁN TRÚ (ThuTienBanTru)
// ═══════════════════════════════════════════════════════════════════

/**
 * GET /api/taichinh/so-thu-tien/
 * Lấy danh sách thu tiền bán trú theo Đợt hoặc Tháng
 */
router.get('/api/taichinh/so-thu-tien/', loginRequired, roleRequired('admin', 'quan_ly', 'ke_toan', 'hieu_truong'), async (req, res) => {
    try {
        const { dot, thang, nam, lop, nam_hoc } = req.query;
        let start, end, dotObj = null, isKhoa = false;

        const currentYear = parseInt(nam, 10) || new Date().getFullYear();

        if (dot) {
            dotObj = await CauHinhDotThanhToan.findOne({
                where: { dot: parseInt(dot, 10), ...(nam_hoc ? { nam_hoc } : {}) }
            });
            if (dotObj) {
                start = dotObj.tu_ngay;
                end = dotObj.den_ngay;
                isKhoa = Boolean(dotObj.is_khoa);
            }
        }

        if (!start || !end) {
            const m = parseInt(thang, 10) || (new Date().getMonth() + 1);
            start = `${currentYear}-${String(m).padStart(2, '0')}-01`;
            end = getLastDayYMD(currentYear, m);
            // Kiểm tra xem khoảng ngày này có bị khóa bởi đợt nào không
            const lockedDot = await CauHinhDotThanhToan.findOne({
                where: {
                    is_khoa: true,
                    tu_ngay: { [Op.lte]: end },
                    den_ngay: { [Op.gte]: start }
                }
            });
            if (lockedDot) isKhoa = true;
        }

        // Lấy danh sách ngày có ca ăn bán trú
        const pcAn = await PhanCongTrucGV.findAll({
            where: { ngay: { [Op.between]: [start, end] }, loai_truc: 0 },
            attributes: [[sequelize.fn('DISTINCT', sequelize.col('ngay')), 'ngay']],
            raw: true
        });
        const ngayAn = pcAn.map(r => r.ngay).sort();

        // Lấy cấu hình giá ăn HS
        const [cauhinh] = await CauHinhHeThong.findOrCreate({
            where: { id: 1 },
            defaults: { nam_hoc: '2026-2027', tien_an: 38000 }
        });
        const defaultTienAn = cauhinh?.tien_an || 38000;
        const allGiaTienAnHS = await CauHinhGia.findAll({
            where: { loai_truc: 2, ngay_ap_dung: { [Op.lte]: end } },
            order: [['ngay_ap_dung', 'ASC']],
            raw: true
        });
        const getDonGiaHS = (ngay) => {
            const matched = allGiaTienAnHS.filter(g => g.ngay_ap_dung <= ngay).pop();
            return matched ? parseFloat(matched.don_gia) : defaultTienAn;
        };

        // Lấy danh sách HS hợp lệ trong kỳ
        const hsWhere = {
            [Op.and]: [
                {
                    [Op.or]: [
                        { dang_hoc: true },
                        { ngay_rut: { [Op.gte]: start } }
                    ]
                },
                {
                    [Op.or]: [
                        { ngay_vao: null },
                        { ngay_vao: { [Op.lte]: end } }
                    ]
                }
            ]
        };
        if (lop) hsWhere.lop = lop;

        const hsList = await HocSinh.findAll({
            where: hsWhere,
            attributes: ['id', 'ho_ten', 'lop', 'gioi_tinh', 'dang_hoc', 'ngay_vao', 'ngay_rut'],
            order: [['lop', 'ASC'], ['ho_ten', 'ASC']]
        });
        const hsIds = hsList.map(h => h.id);

        // Lấy cấu hình ngày đặc biệt
        const cauhinhNgayList = await CauHinhNgay.findAll({ where: { ngay: { [Op.between]: [start, end] } } });
        const cauhinhNgayMap = {};
        cauhinhNgayList.forEach(c => { cauhinhNgayMap[c.ngay] = c; });

        // Lấy điểm danh ăn của HS
        const ddRecords = await DiemDanhHS.findAll({
            where: { ma_hs_id: { [Op.in]: hsIds }, ngay: { [Op.between]: [start, end] } },
            attributes: ['ma_hs_id', 'ngay', 'diem_danh_an']
        });
        const ddMap = {};
        ddRecords.forEach(r => {
            if (!ddMap[r.ma_hs_id]) ddMap[r.ma_hs_id] = {};
            ddMap[r.ma_hs_id][r.ngay] = r.diem_danh_an;
        });

        // Lấy các bản ghi ThuTienBanTru đã có trong CSDL
        const ttWhere = {
            ma_hs_id: { [Op.in]: hsIds },
            nam: currentYear
        };
        if (dot) ttWhere.dot = parseInt(dot, 10);
        else if (thang) ttWhere.thang = parseInt(thang, 10);

        const thuTienRecords = await ThuTienBanTru.findAll({
            where: ttWhere,
            include: [{ model: StaffUser, as: 'nguoi_thu', attributes: ['id', 'username', 'fullname'] }]
        });
        const ttMap = {};
        thuTienRecords.forEach(r => { ttMap[r.ma_hs_id] = r; });

        let tongPhaiThu = 0;
        let tongDaThu = 0;
        let tongMienGiam = 0;
        let tongConLai = 0;
        let countDaThu = 0;
        let countChuaThu = 0;

        const data = hsList.map(hs => {
            const recs = ddMap[hs.id] || {};
            const existingTT = ttMap[hs.id];

            // Tính số ngày phải ăn theo lịch
            const phaiAn = ngayAn.filter(ngay => {
                if (hs.ngay_vao && ngay < hs.ngay_vao) return false;
                if (hs.ngay_rut && ngay >= hs.ngay_rut) return false;
                if (hs.dang_hoc === false && (!hs.ngay_rut || ngay >= hs.ngay_rut)) return false;
                return isHsAllowed(hs, cauhinhNgayMap[ngay] || null);
            });

            // Tiền ăn thực tế phải nộp (ngày nghỉ có phép trừ tiền)
            let calculatedPhaiThu = 0;
            let soBuoiAn = 0;
            let soBuoiPhep = 0;
            phaiAn.forEach(ng => {
                if (recs[ng] === 2) {
                    soBuoiPhep++;
                } else {
                    soBuoiAn++;
                    calculatedPhaiThu += getDonGiaHS(ng);
                }
            });

            const soTienPhaiThu = existingTT ? parseFloat(existingTT.so_tien_phai_thu) : calculatedPhaiThu;
            const soTienDaThu = existingTT ? parseFloat(existingTT.so_tien_da_thu) : 0;
            const soTienMienGiam = existingTT ? parseFloat(existingTT.so_tien_mien_giam) : 0;
            const conLai = Math.max(0, soTienPhaiThu - soTienDaThu - soTienMienGiam);

            let trangThai = 0;
            if (existingTT) {
                trangThai = existingTT.trang_thai;
            } else {
                if (soTienMienGiam >= soTienPhaiThu && soTienPhaiThu > 0) trangThai = 3;
                else if (soTienDaThu >= soTienPhaiThu && soTienPhaiThu > 0) trangThai = 1;
                else if (soTienDaThu > 0) trangThai = 2;
                else trangThai = 0;
            }

            if (trangThai === 1 || trangThai === 3) countDaThu++;
            else countChuaThu++;

            tongPhaiThu += soTienPhaiThu;
            tongDaThu += soTienDaThu;
            tongMienGiam += soTienMienGiam;
            tongConLai += conLai;

            return {
                id: existingTT ? existingTT.id : null,
                ma_hs_id: hs.id,
                ho_ten: hs.ho_ten,
                lop: hs.lop,
                gioi_tinh: hs.gioi_tinh,
                dang_hoc: hs.dang_hoc,
                ngay_vao: hs.ngay_vao,
                ngay_rut: hs.ngay_rut,
                tong_buoi_an: phaiAn.length,
                so_buoi_an: soBuoiAn,
                so_buoi_phep: soBuoiPhep,
                so_phieu: existingTT?.so_phieu || '',
                so_tien_phai_thu: soTienPhaiThu,
                so_tien_da_thu: soTienDaThu,
                so_tien_mien_giam: soTienMienGiam,
                ly_do_mien_giam: existingTT?.ly_do_mien_giam || '',
                con_lai: conLai,
                trang_thai: trangThai,
                hinh_thuc_thu: existingTT?.hinh_thuc_thu || '',
                ngay_thu: existingTT?.ngay_thu || null,
                nguoi_thu: existingTT?.nguoi_thu?.fullname || existingTT?.nguoi_thu?.username || '',
                ghi_chu: existingTT?.ghi_chu || '',
                is_khoa: Boolean(isKhoa || existingTT?.is_khoa)
            };
        });

        return res.json({
            ok: true,
            dot: dot ? parseInt(dot, 10) : null,
            thang: thang ? parseInt(thang, 10) : null,
            nam: currentYear,
            tu_ngay: start,
            den_ngay: end,
            is_khoa: isKhoa,
            dot_label: dotObj?.label || `Tháng ${thang}/${currentYear}`,
            summary: {
                tong_hs: data.length,
                tong_phai_thu: tongPhaiThu,
                tong_da_thu: tongDaThu,
                tong_mien_giam: tongMienGiam,
                tong_con_lai: tongConLai,
                so_hs_da_thu: countDaThu,
                so_hs_chua_thu: countChuaThu
            },
            data
        });
    } catch (err) {
        return res.status(500).json({ ok: false, error: err.message });
    }
});

/**
 * POST /api/taichinh/thu-tien/
 * Thu tiền bán trú cho học sinh (hoặc cập nhật phiếu thu)
 */
router.post('/api/taichinh/thu-tien/', loginRequired, roleRequired('admin', 'quan_ly', 'ke_toan'), async (req, res) => {
    try {
        const { ma_hs_id, dot, thang, nam, so_tien_da_thu, hinh_thuc_thu, so_phieu, ghi_chu, ngay_thu, so_tien_phai_thu } = req.body;
        if (!ma_hs_id) {
            return res.status(400).json({ ok: false, error: 'Thiếu mã học sinh' });
        }

        const currentYear = parseInt(nam, 10) || new Date().getFullYear();
        const dotNum = dot ? parseInt(dot, 10) : null;
        const thangNum = thang ? parseInt(thang, 10) : null;

        // Kiểm tra khóa sổ đợt
        if (dotNum) {
            const dotObj = await CauHinhDotThanhToan.findOne({ where: { dot: dotNum } });
            if (dotObj && dotObj.is_khoa) {
                return res.status(403).json({ ok: false, error: `Đợt thanh toán "${dotObj.label}" đã bị khóa sổ. Không thể thu tiền hoặc cập nhật.` });
            }
        }

        let record = await ThuTienBanTru.findOne({
            where: {
                ma_hs_id,
                dot: dotNum,
                thang: thangNum,
                nam: currentYear
            }
        });

        if (record && record.is_khoa) {
            return res.status(403).json({ ok: false, error: 'Bản ghi thu tiền này đã bị khóa sổ kế toán.' });
        }

        const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());
        const defaultSoPhieu = `PT-${dotNum ? `D${dotNum}` : `T${thangNum}`}-${currentYear}-${ma_hs_id}`;

        const phaiThu = (so_tien_phai_thu !== undefined) ? parseFloat(so_tien_phai_thu) : (record ? parseFloat(record.so_tien_phai_thu) : 0);
        const daThu = parseFloat(so_tien_da_thu) || 0;
        const mienGiam = record ? parseFloat(record.so_tien_mien_giam) : 0;

        let trangThai = 0;
        if (mienGiam >= phaiThu && phaiThu > 0) trangThai = 3;
        else if (daThu + mienGiam >= phaiThu && phaiThu > 0) trangThai = 1;
        else if (daThu > 0) trangThai = 2;
        else trangThai = 0;

        if (!record) {
            record = await ThuTienBanTru.create({
                ma_hs_id,
                dot: dotNum,
                thang: thangNum,
                nam: currentYear,
                so_phieu: so_phieu || defaultSoPhieu,
                so_tien_phai_thu: phaiThu,
                so_tien_da_thu: daThu,
                so_tien_mien_giam: mienGiam,
                trang_thai: trangThai,
                hinh_thuc_thu: hinh_thuc_thu || 'tien_mat',
                ngay_thu: ngay_thu || today,
                nguoi_thu_id: req.user.id,
                ghi_chu: ghi_chu || null
            });
        } else {
            record.so_tien_da_thu = daThu;
            if (so_tien_phai_thu !== undefined) record.so_tien_phai_thu = phaiThu;
            record.trang_thai = trangThai;
            if (hinh_thuc_thu) record.hinh_thuc_thu = hinh_thuc_thu;
            if (so_phieu) record.so_phieu = so_phieu;
            record.ngay_thu = ngay_thu || record.ngay_thu || today;
            record.nguoi_thu_id = req.user.id;
            if (ghi_chu !== undefined) record.ghi_chu = ghi_chu;
            await record.save();
        }

        return res.json({ ok: true, message: 'Lưu thông tin thu tiền thành công', record });
    } catch (err) {
        return res.status(500).json({ ok: false, error: err.message });
    }
});

/**
 * POST /api/taichinh/mien-giam/
 * Cập nhật số tiền miễn giảm & lý do cho học sinh
 */
router.post('/api/taichinh/mien-giam/', loginRequired, roleRequired('admin', 'quan_ly', 'ke_toan'), async (req, res) => {
    try {
        const { ma_hs_id, dot, thang, nam, so_tien_mien_giam, ly_do_mien_giam, so_tien_phai_thu } = req.body;
        if (!ma_hs_id) {
            return res.status(400).json({ ok: false, error: 'Thiếu mã học sinh' });
        }

        const currentYear = parseInt(nam, 10) || new Date().getFullYear();
        const dotNum = dot ? parseInt(dot, 10) : null;
        const thangNum = thang ? parseInt(thang, 10) : null;

        if (dotNum) {
            const dotObj = await CauHinhDotThanhToan.findOne({ where: { dot: dotNum } });
            if (dotObj && dotObj.is_khoa) {
                return res.status(403).json({ ok: false, error: `Đợt thanh toán "${dotObj.label}" đã bị khóa sổ.` });
            }
        }

        let record = await ThuTienBanTru.findOne({
            where: { ma_hs_id, dot: dotNum, thang: thangNum, nam: currentYear }
        });

        if (record && record.is_khoa) {
            return res.status(403).json({ ok: false, error: 'Bản ghi này đã bị khóa sổ kế toán.' });
        }

        const phaiThu = (so_tien_phai_thu !== undefined) ? parseFloat(so_tien_phai_thu) : (record ? parseFloat(record.so_tien_phai_thu) : 0);
        const daThu = record ? parseFloat(record.so_tien_da_thu) : 0;
        const mienGiam = parseFloat(so_tien_mien_giam) || 0;

        let trangThai = 0;
        if (mienGiam >= phaiThu && phaiThu > 0) trangThai = 3;
        else if (daThu + mienGiam >= phaiThu && phaiThu > 0) trangThai = 1;
        else if (daThu > 0) trangThai = 2;
        else trangThai = 0;

        if (!record) {
            record = await ThuTienBanTru.create({
                ma_hs_id,
                dot: dotNum,
                thang: thangNum,
                nam: currentYear,
                so_tien_phai_thu: phaiThu,
                so_tien_da_thu: daThu,
                so_tien_mien_giam: mienGiam,
                ly_do_mien_giam: ly_do_mien_giam || null,
                trang_thai: trangThai,
                nguoi_thu_id: req.user.id
            });
        } else {
            record.so_tien_mien_giam = mienGiam;
            if (ly_do_mien_giam !== undefined) record.ly_do_mien_giam = ly_do_mien_giam;
            if (so_tien_phai_thu !== undefined) record.so_tien_phai_thu = phaiThu;
            record.trang_thai = trangThai;
            await record.save();
        }

        return res.json({ ok: true, message: 'Cập nhật miễn giảm thành công', record });
    } catch (err) {
        return res.status(500).json({ ok: false, error: err.message });
    }
});

/**
 * POST /api/taichinh/dong-bo-phai-thu/
 * Đồng bộ toàn bộ số tiền phải thu từ dữ liệu điểm danh sang bảng ThuTienBanTru
 */
router.post('/api/taichinh/dong-bo-phai-thu/', loginRequired, roleRequired('admin', 'quan_ly', 'ke_toan'), async (req, res) => {
    try {
        const { dot, thang, nam, nam_hoc } = req.body;
        const currentYear = parseInt(nam, 10) || new Date().getFullYear();
        const dotNum = dot ? parseInt(dot, 10) : null;
        const thangNum = thang ? parseInt(thang, 10) : null;

        let start, end;
        if (dotNum) {
            const dotObj = await CauHinhDotThanhToan.findOne({
                where: { dot: dotNum, ...(nam_hoc ? { nam_hoc } : {}) }
            });
            if (!dotObj) return res.status(404).json({ ok: false, error: 'Không tìm thấy cấu hình đợt thanh toán' });
            if (dotObj.is_khoa) return res.status(403).json({ ok: false, error: `Đợt thanh toán "${dotObj.label}" đã bị khóa sổ.` });
            start = dotObj.tu_ngay;
            end = dotObj.den_ngay;
        } else {
            const m = thangNum || (new Date().getMonth() + 1);
            start = `${currentYear}-${String(m).padStart(2, '0')}-01`;
            end = getLastDayYMD(currentYear, m);
        }

        // Lấy ngày bán trú ăn
        const pcAn = await PhanCongTrucGV.findAll({
            where: { ngay: { [Op.between]: [start, end] }, loai_truc: 0 },
            attributes: [[sequelize.fn('DISTINCT', sequelize.col('ngay')), 'ngay']],
            raw: true
        });
        const ngayAn = pcAn.map(r => r.ngay).sort();

        // Lấy giá ăn HS
        const [cauhinh] = await CauHinhHeThong.findOrCreate({ where: { id: 1 }, defaults: { tien_an: 38000 } });
        const defaultTienAn = cauhinh?.tien_an || 38000;
        const allGiaTienAnHS = await CauHinhGia.findAll({
            where: { loai_truc: 2, ngay_ap_dung: { [Op.lte]: end } },
            order: [['ngay_ap_dung', 'ASC']],
            raw: true
        });
        const getDonGiaHS = (ngay) => {
            const matched = allGiaTienAnHS.filter(g => g.ngay_ap_dung <= ngay).pop();
            return matched ? parseFloat(matched.don_gia) : defaultTienAn;
        };

        const hsList = await HocSinh.findAll({
            where: {
                [Op.and]: [
                    { [Op.or]: [{ dang_hoc: true }, { ngay_rut: { [Op.gte]: start } }] },
                    { [Op.or]: [{ ngay_vao: null }, { ngay_vao: { [Op.lte]: end } }] }
                ]
            },
            attributes: ['id', 'ngay_vao', 'ngay_rut', 'lop']
        });
        const hsIds = hsList.map(h => h.id);

        const cauhinhNgayList = await CauHinhNgay.findAll({ where: { ngay: { [Op.between]: [start, end] } } });
        const cauhinhNgayMap = {};
        cauhinhNgayList.forEach(c => { cauhinhNgayMap[c.ngay] = c; });

        const ddRecords = await DiemDanhHS.findAll({
            where: { ma_hs_id: { [Op.in]: hsIds }, ngay: { [Op.between]: [start, end] } },
            attributes: ['ma_hs_id', 'ngay', 'diem_danh_an']
        });
        const ddMap = {};
        ddRecords.forEach(r => {
            if (!ddMap[r.ma_hs_id]) ddMap[r.ma_hs_id] = {};
            ddMap[r.ma_hs_id][r.ngay] = r.diem_danh_an;
        });

        let updatedCount = 0;
        for (const hs of hsList) {
            const recs = ddMap[hs.id] || {};
            const phaiAn = ngayAn.filter(ngay => {
                if (hs.ngay_vao && ngay < hs.ngay_vao) return false;
                if (hs.ngay_rut && ngay >= hs.ngay_rut) return false;
                if (hs.dang_hoc === false && (!hs.ngay_rut || ngay >= hs.ngay_rut)) return false;
                return isHsAllowed(hs, cauhinhNgayMap[ngay] || null);
            });

            let phaiThu = 0;
            phaiAn.forEach(ng => {
                if (recs[ng] !== 2) {
                    phaiThu += getDonGiaHS(ng);
                }
            });

            const existing = await ThuTienBanTru.findOne({
                where: { ma_hs_id: hs.id, dot: dotNum, thang: thangNum, nam: currentYear }
            });

            if (existing) {
                if (!existing.is_khoa) {
                    existing.so_tien_phai_thu = phaiThu;
                    const daThu = parseFloat(existing.so_tien_da_thu) || 0;
                    const mienGiam = parseFloat(existing.so_tien_mien_giam) || 0;
                    if (mienGiam >= phaiThu && phaiThu > 0) existing.trang_thai = 3;
                    else if (daThu + mienGiam >= phaiThu && phaiThu > 0) existing.trang_thai = 1;
                    else if (daThu > 0) existing.trang_thai = 2;
                    else existing.trang_thai = 0;
                    await existing.save();
                    updatedCount++;
                }
            } else {
                await ThuTienBanTru.create({
                    ma_hs_id: hs.id,
                    dot: dotNum,
                    thang: thangNum,
                    nam: currentYear,
                    so_tien_phai_thu: phaiThu,
                    so_tien_da_thu: 0,
                    so_tien_mien_giam: 0,
                    trang_thai: 0
                });
                updatedCount++;
            }
        }

        return res.json({ ok: true, message: `Đồng bộ thành công ${updatedCount} học sinh`, updatedCount });
    } catch (err) {
        return res.status(500).json({ ok: false, error: err.message });
    }
});

module.exports = router;
