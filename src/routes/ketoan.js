const express = require('express');
const { Op } = require('sequelize');
const ExcelJS = require('exceljs');
const {
  sequelize,
  StaffUser,
  GiaoVien,
  PhanCongTrucGV,
  CauHinhGia,
  CauHinhHeThong,
  KeToanDanhMucKhoanChi,
  KeToanKyTongHop,
  KeToanNguoiNhan,
  KeToanChiTietKhoanChi,
  KeToanThanhToanChiTiet,
  KeToanLichSuThietLap,
  KyTrucGV,
} = require('../models');
const { loginRequired, roleRequired } = require('../middleware/auth');

const router = express.Router();

// Middleware: Kế toán, admin, quản lý, hiệu trưởng được xem số liệu
const ketoanViewOrAdmin = [loginRequired, roleRequired('admin', 'ke_toan', 'quan_ly', 'hieu_truong')];
// Middleware: Chỉ kế toán và admin/superuser mới được chỉnh sửa / chốt kỳ / xóa
const ketoanOrAdmin = [loginRequired, roleRequired('admin', 'ke_toan')];

// Helper log thao tác thiết lập
async function logThietLap(hanhDong, noiDung, req) {
  try {
    const user = req.user || {};
    await KeToanLichSuThietLap.create({
      hanh_dong: hanhDong,
      noi_dung: noiDung,
      nguoi_thao_tac_id: user.id || null,
      nguoi_thao_tac_ten: user.fullname || user.username || 'Kế toán',
      chuc_vu: user.role === 'admin' ? 'Quản trị viên' : 'Kế toán',
      created_at: new Date(),
    });
  } catch (err) {
    console.warn('Lỗi ghi log KeToanLichSuThietLap:', err.message);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. DANH MỤC KHOẢN CHI & THIẾT LẬP KẾ TOÁN
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/ketoan/danh-muc-khoan-chi
router.get('/danh-muc-khoan-chi', ketoanOrAdmin, async (req, res) => {
  try {
    const list = await KeToanDanhMucKhoanChi.findAll({
      order: [['thu_tu_hien_thi', 'ASC'], ['id', 'ASC']],
    });
    const mapped = list.map((c) => ({
      ...c.toJSON(),
      don_gia_mac_dinh: parseFloat(c.don_gia_mac_dinh) || 0,
    }));
    return res.json({ ok: true, data: mapped });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /api/ketoan/danh-muc-khoan-chi
router.post('/danh-muc-khoan-chi', ketoanOrAdmin, async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const {
      id,
      ma_khoan_chi,
      ten_khoan_chi,
      loai_tinh,
      don_gia_mac_dinh,
      tan_suat,
      thu_tu_hien_thi,
      kich_hoat,
      ghi_chu,
    } = req.body;

    if (!ten_khoan_chi || !ten_khoan_chi.trim()) {
      await t.rollback();
      return res.status(400).json({ ok: false, error: 'Tên khoản chi không được để trống' });
    }

    let record;
    if (id) {
      record = await KeToanDanhMucKhoanChi.findByPk(id, { transaction: t });
      if (!record) {
        await t.rollback();
        return res.status(404).json({ ok: false, error: 'Không tìm thấy khoản chi' });
      }

      const oldTen = record.ten_khoan_chi;
      const oldDonGia = record.don_gia_mac_dinh;

      await record.update(
        {
          ten_khoan_chi: ten_khoan_chi.trim(),
          loai_tinh: loai_tinh || record.loai_tinh,
          don_gia_mac_dinh: don_gia_mac_dinh !== undefined ? parseFloat(don_gia_mac_dinh) || 0 : record.don_gia_mac_dinh,
          tan_suat: tan_suat || record.tan_suat,
          thu_tu_hien_thi: thu_tu_hien_thi !== undefined ? parseInt(thu_tu_hien_thi, 10) : record.thu_tu_hien_thi,
          kich_hoat: kich_hoat !== undefined ? Boolean(kich_hoat) : record.kich_hoat,
          ghi_chu: ghi_chu !== undefined ? ghi_chu : record.ghi_chu,
        },
        { transaction: t }
      );

      await t.commit();
      await logThietLap(
        'CAP_NHAT_KHOAN_CHI',
        `Cập nhật khoản chi "${record.ten_khoan_chi}" (Đơn giá cũ: ${parseFloat(oldDonGia).toLocaleString('vi-VN')}đ → mới: ${parseFloat(record.don_gia_mac_dinh).toLocaleString('vi-VN')}đ, Kích hoạt: ${record.kich_hoat})`,
        req
      );
      return res.json({
        ok: true,
        data: {
          ...record.toJSON(),
          don_gia_mac_dinh: parseFloat(record.don_gia_mac_dinh) || 0,
        },
      });
    } else {
      const maKey = ma_khoan_chi && ma_khoan_chi.trim()
        ? ma_khoan_chi.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_')
        : `kc_${Date.now()}`;

      const existing = await KeToanDanhMucKhoanChi.findOne({ where: { ma_khoan_chi: maKey }, transaction: t });
      if (existing) {
        await t.rollback();
        return res.status(400).json({ ok: false, error: `Mã khoản chi "${maKey}" đã tồn tại` });
      }

      record = await KeToanDanhMucKhoanChi.create(
        {
          ma_khoan_chi: maKey,
          ten_khoan_chi: ten_khoan_chi.trim(),
          loai_tinh: loai_tinh || 'truc_tiep',
          don_gia_mac_dinh: parseFloat(don_gia_mac_dinh) || 0,
          tan_suat: tan_suat || 'dinh_ky',
          thu_tu_hien_thi: parseInt(thu_tu_hien_thi, 10) || 0,
          kich_hoat: kich_hoat !== undefined ? Boolean(kich_hoat) : true,
          ghi_chu: ghi_chu || '',
        },
        { transaction: t }
      );

      await t.commit();
      await logThietLap(
        'THEM_KHOAN_CHI',
        `Thêm khoản chi mới "${record.ten_khoan_chi}" (Mã: ${record.ma_khoan_chi}, Cách tính: ${record.loai_tinh}, Đơn giá: ${parseFloat(record.don_gia_mac_dinh).toLocaleString('vi-VN')}đ)`,
        req
      );
      return res.json({
        ok: true,
        data: {
          ...record.toJSON(),
          don_gia_mac_dinh: parseFloat(record.don_gia_mac_dinh) || 0,
        },
      });
    }
  } catch (err) {
    await t.rollback();
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// DELETE /api/ketoan/danh-muc-khoan-chi/:id (Soft deactivation only to preserve audit history)
router.delete('/danh-muc-khoan-chi/:id', ketoanOrAdmin, async (req, res) => {
  try {
    const record = await KeToanDanhMucKhoanChi.findByPk(req.params.id);
    if (!record) return res.status(404).json({ ok: false, error: 'Không tìm thấy khoản chi' });

    // Kiểm tra xem khoản chi đã được dùng trong chi tiết kỳ nào chưa
    const usedCount = await KeToanChiTietKhoanChi.count({ where: { khoan_chi_id: record.id } });
    if (usedCount > 0) {
      // Khoản đã được sử dụng trong lịch sử chỉ được ngừng sử dụng, không xóa
      await record.update({ kich_hoat: false });
      await logThietLap('NGUNG_KICH_HOAT_KHOAN_CHI', `Ngừng kích hoạt khoản chi "${record.ten_khoan_chi}" (đã sử dụng trong ${usedCount} bản ghi chi tiết)`, req);
      return res.json({ ok: true, message: 'Khoản chi đã được dùng trong lịch sử nên đã chuyển sang trạng thái Ngừng sử dụng để bảo toàn dữ liệu.' });
    } else {
      await record.destroy();
      await logThietLap('XOA_KHOAN_CHI', `Xóa vĩnh viễn khoản chi chưa sử dụng "${record.ten_khoan_chi}"`, req);
      return res.json({ ok: true, message: 'Đã xóa khoản chi thành công.' });
    }
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /api/ketoan/lich-su-thiet-lap
router.get('/lich-su-thiet-lap', ketoanOrAdmin, async (req, res) => {
  try {
    const history = await KeToanLichSuThietLap.findAll({
      order: [['created_at', 'DESC']],
      limit: 100,
    });
    return res.json({ ok: true, data: history });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. QUẢN LÝ KỲ TỔNG HỢP CHI TRẢ
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/ketoan/ky-tong-hop
router.get('/ky-tong-hop', ketoanViewOrAdmin, async (req, res) => {
  try {
    const todayVN = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());

    // Tự động đồng bộ ngày kết thúc cho các kỳ đang diễn ra lên đến ngày hôm nay (07/10/2026)
    try {
      await KeToanKyTongHop.update(
        { den_ngay: todayVN },
        {
          where: {
            trang_thai: 'dang_dien_ra',
            den_ngay: { [Op.lt]: todayVN },
          },
        }
      );
      await KyTrucGV.update(
        { den_ngay: todayVN },
        {
          where: {
            trang_thai: 'dang_dien_ra',
            [Op.or]: [{ den_ngay: null }, { den_ngay: { [Op.lt]: todayVN } }],
          },
        }
      );
    } catch (dateErr) {
      console.warn('Lỗi auto-sync den_ngay:', dateErr.message);
    }

    const list = await KeToanKyTongHop.findAll({
      order: [['tu_ngay', 'DESC'], ['id', 'DESC']],
    });
    return res.json({ ok: true, data: list });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /api/ketoan/ky-tong-hop
router.post('/ky-tong-hop', ketoanOrAdmin, async (req, res) => {
  try {
    const { ten_ky, tu_ngay, den_ngay, ngay_lap, ghi_chu } = req.body;

    if (!ten_ky || !ten_ky.trim()) {
      return res.status(400).json({ ok: false, error: 'Vui lòng nhập tên kỳ tổng hợp' });
    }
    if (!tu_ngay || !den_ngay) {
      return res.status(400).json({ ok: false, error: 'Vui lòng chọn từ ngày và đến ngày' });
    }
    if (tu_ngay > den_ngay) {
      return res.status(400).json({ ok: false, error: 'Từ ngày không được lớn hơn Đến ngày' });
    }

    const user = req.user || {};
    const ky = await KeToanKyTongHop.create({
      ten_ky: ten_ky.trim(),
      tu_ngay,
      den_ngay,
      ngay_lap: ngay_lap || new Date().toISOString().split('T')[0],
      trang_thai: 'dang_dien_ra',
      ghi_chu: ghi_chu || '',
      created_by_id: user.id || null,
      created_by_name: user.fullname || user.username || 'Kế toán',
    });

    await logThietLap(
      'TAO_KY_TONG_HOP',
      `Tạo kỳ tổng hợp mới "${ky.ten_ky}" (Phạm vi: ${ky.tu_ngay} → ${ky.den_ngay})`,
      req
    );

    // Không ghi hàng trăm dòng chi tiết vào CSDL làm tốn dung lượng
    // Tiền và công trực được tính trực tiếp on-the-fly theo yêu cầu
    return res.json({ ok: true, data: ky });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// Helper: tính lại tổng tiền của 1 người nhận & cả kỳ
async function recalculateKyTotals(kyId, transaction = null, singleNnId = null) {
  const t = transaction;

  if (singleNnId) {
    const nn = await KeToanNguoiNhan.findByPk(singleNnId, { transaction: t });
    if (nn) {
      const chiTiets = await KeToanChiTietKhoanChi.findAll({ where: { nguoi_nhan_id: nn.id }, transaction: t });
      const nnTongTien = chiTiets.reduce((sum, ct) => sum + parseFloat(ct.thanh_tien || 0), 0);

      const thanhToans = await KeToanThanhToanChiTiet.findAll({ where: { nguoi_nhan_id: nn.id }, transaction: t });
      const nnDaChi = thanhToans.reduce((sum, tt) => sum + parseFloat(tt.so_tien || 0), 0);

      let trangThaiTt = 'chua_chi';
      if (nnDaChi >= nnTongTien && nnTongTien > 0) {
        trangThaiTt = 'da_chi_du';
      } else if (nnDaChi > 0) {
        trangThaiTt = 'chi_mot_phan';
      }

      await nn.update(
        {
          tong_tien: nnTongTien,
          da_thanh_toan: nnDaChi,
          trang_thai_tt: trangThaiTt,
        },
        { transaction: t }
      );
    }
  } else {
    const nguoiNhans = await KeToanNguoiNhan.findAll({ where: { ky_id: kyId }, transaction: t });
    for (const nn of nguoiNhans) {
      const chiTiets = await KeToanChiTietKhoanChi.findAll({ where: { nguoi_nhan_id: nn.id }, transaction: t });
      const nnTongTien = chiTiets.reduce((sum, ct) => sum + parseFloat(ct.thanh_tien || 0), 0);

      const thanhToans = await KeToanThanhToanChiTiet.findAll({ where: { nguoi_nhan_id: nn.id }, transaction: t });
      const nnDaChi = thanhToans.reduce((sum, tt) => sum + parseFloat(tt.so_tien || 0), 0);

      let trangThaiTt = 'chua_chi';
      if (nnDaChi >= nnTongTien && nnTongTien > 0) {
        trangThaiTt = 'da_chi_du';
      } else if (nnDaChi > 0) {
        trangThaiTt = 'chi_mot_phan';
      }

      await nn.update(
        {
          tong_tien: nnTongTien,
          da_thanh_toan: nnDaChi,
          trang_thai_tt: trangThaiTt,
        },
        { transaction: t }
      );
    }
  }

  // Cập nhật tổng kỳ trong 1 câu SQL SUM nhanh
  const [totals] = await sequelize.query(
    `SELECT COUNT(id) as total_count, COALESCE(SUM(tong_tien), 0) as total_amount, COALESCE(SUM(da_thanh_toan), 0) as total_paid FROM core_ke_toan_nguoi_nhan WHERE ky_id = :kyId`,
    { replacements: { kyId }, transaction: t, type: sequelize.QueryTypes.SELECT }
  );

  await KeToanKyTongHop.update(
    {
      tong_so_nguoi: parseInt(totals?.total_count) || 0,
      tong_tien: parseFloat(totals?.total_amount) || 0,
      tong_da_thanh_toan: parseFloat(totals?.total_paid) || 0,
    },
    { where: { id: kyId }, transaction: t }
  );
}

// GET /api/ketoan/ky-tong-hop/:id
router.get('/ky-tong-hop/:id', ketoanViewOrAdmin, async (req, res) => {
  try {
    const ky = await KeToanKyTongHop.findByPk(req.params.id);
    if (!ky) return res.status(404).json({ ok: false, error: 'Không tìm thấy kỳ tổng hợp' });

    // Xác định cấu hình danh mục cột khoản chi
    const dm = await KeToanDanhMucKhoanChi.findAll({
      where: { kich_hoat: true },
      order: [['thu_tu_hien_thi', 'ASC'], ['id', 'ASC']],
    });
    const danhMucColumns = dm.map((c) => ({
      id: c.id,
      ma_khoan_chi: c.ma_khoan_chi,
      ten_khoan_chi: c.ten_khoan_chi,
      loai_tinh: c.loai_tinh,
      don_gia_mac_dinh: parseFloat(c.don_gia_mac_dinh) || 0,
      tan_suat: c.tan_suat,
      thu_tu_hien_thi: c.thu_tu_hien_thi,
    }));

    const columnTotals = {};
    danhMucColumns.forEach((col) => {
      columnTotals[col.ma_khoan_chi] = 0;
    });

    let rows = [];

    // Khi kỳ đang diễn ra (hoặc chưa chốt): Tính toán trực tiếp số tiền từ công trực CSDL và cấu hình đơn giá
    // Tính toán tức thì trong RAM (chỉ 2 câu SELECT thay vì 270 câu UPDATE qua mạng)
    if (ky.trang_thai !== 'da_chot') {
      const todayVN = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());
      if (ky.den_ngay < todayVN) {
        await ky.update({ den_ngay: todayVN });
      }

      const { sortedStaff } = await fetchAttendanceSourceData(ky.tu_ngay, ky.den_ngay);

      const existingNguoiNhans = await KeToanNguoiNhan.findAll({
        where: { ky_id: ky.id },
        include: [
          { model: KeToanChiTietKhoanChi, as: 'chi_tiet_khoan_chi' },
          { model: KeToanThanhToanChiTiet, as: 'lich_su_thanh_toan' },
        ],
      });
      const nnByName = {};
      existingNguoiNhans.forEach((nn) => {
        nnByName[nn.ho_ten.trim().toLowerCase()] = nn;
      });

      // Tìm các kỳ trước (có dữ liệu) để kế thừa khoản Định kỳ và triệt tiêu khoản 1 lần
      const allPriorKys = await KeToanKyTongHop.findAll({
        where: {
          id: { [Op.ne]: ky.id },
          [Op.or]: [
            { den_ngay: { [Op.lte]: ky.tu_ngay } },
            { id: { [Op.lt]: ky.id } },
          ],
        },
        order: [['den_ngay', 'DESC'], ['id', 'DESC']],
        include: [
          {
            model: KeToanNguoiNhan,
            as: 'danh_sach_nguoi_nhan',
            include: [{ model: KeToanChiTietKhoanChi, as: 'chi_tiet_khoan_chi' }],
          },
        ],
      });

      const prevKyDetailsByPerson = {};
      // Quét từ các kỳ trước (ưu tiên kỳ gần nhất có dữ liệu)
      allPriorKys.forEach((priorKy) => {
        (priorKy.danh_sach_nguoi_nhan || []).forEach((pnn) => {
          const cName = pnn.ho_ten.trim().toLowerCase();
          if (!prevKyDetailsByPerson[cName]) {
            prevKyDetailsByPerson[cName] = {};
          }
          (pnn.chi_tiet_khoan_chi || []).forEach((pct) => {
            if (!prevKyDetailsByPerson[cName][pct.ma_khoan_chi]) {
              prevKyDetailsByPerson[cName][pct.ma_khoan_chi] = pct;
            }
          });
        });
      });

      const STRICT_LOCKED_COLS = ['truc_phong', 'y_te', 'bt_an', 'thiet_bi', 'gs_an'];

      rows = sortedStaff.map((p, idx) => {
        const clean = p.ho_ten.trim().toLowerCase();
        const existingNn = nnByName[clean];
        const isHuynhDucVinh = clean.includes('huỳnh đức vịnh') || clean.includes('đức vịnh');
        const isNhatTan = clean.includes('nhật tân');
        const isMaiQuynhChau = clean.includes('mai quỳnh châu') || clean.includes('quỳnh châu') || clean === 'châu' || clean.endsWith(' châu');

        const chiTietMap = {};
        let rowTotal = 0;

        danhMucColumns.forEach((col) => {
          const existingCt = existingNn?.chi_tiet_khoan_chi?.find((c) => c.ma_khoan_chi === col.ma_khoan_chi);
          let amt = p.amounts[col.ma_khoan_chi] || 0;
          let soNgay = 0;
          let donGia = col.don_gia_mac_dinh;
          let tienNhap = 0;
          let tienDieuChinh = 0;
          let lyDoDieuChinh = '';

          const isStrictLocked = STRICT_LOCKED_COLS.includes(col.ma_khoan_chi);
          const isHuynhDucVinhGs = isHuynhDucVinh && col.ma_khoan_chi === 'gs_ban_tru';

          if (col.ma_khoan_chi === 'truc_phong') {
            soNgay = p.counts.so_ca_ngu;
            donGia = 180000;
          } else if (col.ma_khoan_chi === 'bt_an') {
            soNgay = p.counts.so_ca_an;
            donGia = 100000;
          } else if (col.ma_khoan_chi === 'thiet_bi') {
            soNgay = isNhatTan ? 16 : 0;
            donGia = 100000;
          } else if (col.ma_khoan_chi === 'y_te') {
            soNgay = isMaiQuynhChau ? p.counts.so_ngay_ban_tru : 0;
            donGia = 70000;
          } else if (col.ma_khoan_chi === 'gs_an') {
            soNgay = isMaiQuynhChau ? 16 : (p.amounts.gs_an ? Math.round(p.amounts.gs_an / 100000) : 0);
            donGia = 100000;
          } else if (col.ma_khoan_chi === 'gs_ban_tru') {
            soNgay = isHuynhDucVinh ? 9 : (clean.includes('quốc phong') ? p.counts.so_ngay_ban_tru : 0);
            donGia = 250000;
          } else {
            soNgay = p.counts.so_ngay_ban_tru;
          }

          const is3GreenCols = ['vs_bv', 'tiep_nhan_vd', 'cap_nhat_tt'].includes(col.ma_khoan_chi);
          const prevCt = prevKyDetailsByPerson[clean]?.[col.ma_khoan_chi];

          // 5 cột khóa tuyệt đối KHÔNG cho phép chỉnh sửa đè; chỉ các cột khác hoặc Huỳnh Đức Vịnh trên gs_ban_tru mới lấy manual
          if (!isStrictLocked && existingCt) {
            tienNhap = parseFloat(existingCt.tien_nhap) || ((col.loai_tinh === 'truc_tiep' || col.loai_tinh === 'nhap_truc_tiep') ? (parseFloat(existingCt.thanh_tien) || amt) : 0);
            tienDieuChinh = parseFloat(existingCt.tien_dieu_chinh) || 0;
            lyDoDieuChinh = existingCt.ly_do_dieu_chinh || '';

            if (isHuynhDucVinhGs || existingCt.nguon_cap_nhat === 'manual' || tienDieuChinh !== 0) {
              amt = parseFloat(existingCt.thanh_tien) !== undefined && existingCt.thanh_tien !== null ? parseFloat(existingCt.thanh_tien) : amt;
              soNgay = parseFloat(existingCt.so_ngay) !== undefined && existingCt.so_ngay !== null ? parseFloat(existingCt.so_ngay) : soNgay;
              donGia = parseFloat(existingCt.don_gia) !== undefined && existingCt.don_gia !== null ? parseFloat(existingCt.don_gia) : donGia;
            }
          } else if (!isStrictLocked) {
            // Khi ô chưa lưu trong kỳ hiện tại:
            if (is3GreenCols && prevCt) {
              // Quy tắc: Khoản chi 1 lần ở kỳ trước qua kỳ khác TUYỆT ĐỐI KHÔNG XUẤT HIỆN (tiền = 0)!
              if (prevCt.tan_suat === 'mot_lan' || prevCt.tan_suat === '1_lan') {
                amt = 0;
                tienNhap = 0;
              } else if (prevCt.tan_suat === 'dinh_ky') {
                // Khoản định kỳ: tự động kế thừa sang kỳ mới
                amt = parseFloat(prevCt.thanh_tien) || 0;
                tienNhap = parseFloat(prevCt.tien_nhap) || amt;
              }
            } else {
              tienNhap = (col.loai_tinh === 'truc_tiep' || col.loai_tinh === 'nhap_truc_tiep') ? amt : 0;
            }
          }

          let tanSuatCell = existingCt?.tan_suat;
          if (!tanSuatCell) {
            if (is3GreenCols) {
              if (amt > 0) {
                tanSuatCell = prevCt?.tan_suat || col.tan_suat || 'dinh_ky';
              } else {
                tanSuatCell = 'dinh_ky';
              }
            } else {
              tanSuatCell = col.tan_suat || 'dinh_ky';
            }
          }

          chiTietMap[col.ma_khoan_chi] = {
            id: existingCt?.id,
            ma_khoan_chi: col.ma_khoan_chi,
            loai_tinh: existingCt?.loai_tinh || col.loai_tinh,
            tan_suat: tanSuatCell,
            so_ngay: soNgay,
            don_gia: donGia,
            tien_nguon: p.amounts[col.ma_khoan_chi] || 0,
            tien_nhap: tienNhap,
            tien_dieu_chinh: tienDieuChinh,
            ly_do_dieu_chinh: lyDoDieuChinh,
            thanh_tien: amt,
            ghi_chu: existingCt?.ghi_chu || '',
          };
          columnTotals[col.ma_khoan_chi] += amt;
          rowTotal += amt;
        });

        const daThanhToan = parseFloat(existingNn?.da_thanh_toan) || 0;
        return {
          id: existingNn?.id || p.nhan_su_id || idx + 1,
          stt: idx + 1,
          nhan_su_id: p.nhan_su_id,
          ma_dinh_danh: existingNn?.ma_dinh_danh || (p.nhan_su_id ? `GV${p.nhan_su_id}` : `EXT_${idx}`),
          ho_ten: p.ho_ten,
          so_tai_khoan: existingNn?.so_tai_khoan || p.so_tai_khoan || '',
          tong_tien: rowTotal,
          da_thanh_toan: daThanhToan,
          con_lai: Math.max(0, rowTotal - daThanhToan),
          trang_thai_tt: existingNn?.trang_thai_tt || 'chua_chi',
          ghi_chu: existingNn?.ghi_chu || '',
          chi_tiet: chiTietMap,
          lich_su_thanh_toan: existingNn?.lich_su_thanh_toan || [],
        };
      });
    } else {
      // Khi đã chốt kỳ: lấy dữ liệu từ snapshot hoặc bảng lưu trữ
      const nguoiNhans = await KeToanNguoiNhan.findAll({
        where: { ky_id: ky.id },
        order: [['stt', 'ASC'], ['ho_ten', 'ASC']],
        include: [
          { model: KeToanChiTietKhoanChi, as: 'chi_tiet_khoan_chi' },
          { model: KeToanThanhToanChiTiet, as: 'lich_su_thanh_toan' },
        ],
      });
      if (nguoiNhans.length > 0) {
        rows = nguoiNhans.map((nn, idx) => {
          const chiTietMap = {};
          (nn.chi_tiet_khoan_chi || []).forEach((ct) => {
            chiTietMap[ct.ma_khoan_chi] = {
              id: ct.id,
              ma_khoan_chi: ct.ma_khoan_chi,
              loai_tinh: ct.loai_tinh,
              tan_suat: ct.tan_suat || 'dinh_ky',
              thanh_tien: parseFloat(ct.thanh_tien) || 0,
              ghi_chu: ct.ghi_chu || '',
            };
            if (columnTotals[ct.ma_khoan_chi] !== undefined) {
              columnTotals[ct.ma_khoan_chi] += parseFloat(ct.thanh_tien) || 0;
            }
          });
          const tongTien = parseFloat(nn.tong_tien) || 0;
          const daThanhToan = parseFloat(nn.da_thanh_toan) || 0;
          return {
            id: nn.id,
            stt: idx + 1,
            nhan_su_id: nn.nhan_su_id,
            ho_ten: nn.ho_ten,
            so_tai_khoan: nn.so_tai_khoan || '',
            tong_tien: tongTien,
            da_thanh_toan: daThanhToan,
            con_lai: Math.max(0, tongTien - daThanhToan),
            trang_thai_tt: nn.trang_thai_tt,
            ghi_chu: nn.ghi_chu || '',
            chi_tiet: chiTietMap,
            lich_su_thanh_toan: nn.lich_su_thanh_toan || [],
          };
        });
      } else {
        // Fallback nếu chưa có snapshot
        const { sortedStaff } = await fetchAttendanceSourceData(ky.tu_ngay, ky.den_ngay);
        rows = sortedStaff.map((p, idx) => {
          const chiTietMap = {};
          let rowTotal = 0;
          danhMucColumns.forEach((col) => {
            const amt = p.amounts[col.ma_khoan_chi] || 0;
            chiTietMap[col.ma_khoan_chi] = {
              ma_khoan_chi: col.ma_khoan_chi,
              loai_tinh: col.loai_tinh,
              thanh_tien: amt,
            };
            columnTotals[col.ma_khoan_chi] += amt;
            rowTotal += amt;
          });
          return {
            id: p.nhan_su_id || idx + 1,
            stt: idx + 1,
            nhan_su_id: p.nhan_su_id,
            ho_ten: p.ho_ten,
            so_tai_khoan: p.so_tai_khoan || '',
            tong_tien: rowTotal,
            da_thanh_toan: 0,
            con_lai: rowTotal,
            trang_thai_tt: 'chua_chi',
            ghi_chu: '',
            chi_tiet: chiTietMap,
            lich_su_thanh_toan: [],
          };
        });
      }
    }

    const grandTotal = rows.reduce((s, r) => s + r.tong_tien, 0);
    const grandPaid = rows.reduce((s, r) => s + r.da_thanh_toan, 0);

    return res.json({
      ok: true,
      data: {
        ky,
        columns: danhMucColumns,
        rows,
        columnTotals,
        grandTotal,
        grandPaid,
        grandRemaining: Math.max(0, grandTotal - grandPaid),
      },
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// PUT /api/ketoan/ky-tong-hop/:id (Cập nhật thông tin kỳ nháp)
router.put('/ky-tong-hop/:id', ketoanOrAdmin, async (req, res) => {
  try {
    const ky = await KeToanKyTongHop.findByPk(req.params.id);
    if (!ky) return res.status(404).json({ ok: false, error: 'Không tìm thấy kỳ tổng hợp' });
    if (ky.trang_thai === 'da_chot') {
      return res.status(400).json({ ok: false, error: 'Kỳ đã chốt, không thể chỉnh sửa thông tin chung' });
    }

    const { ten_ky, tu_ngay, den_ngay, ngay_lap, ghi_chu } = req.body;
    if (tu_ngay && den_ngay && tu_ngay > den_ngay) {
      return res.status(400).json({ ok: false, error: 'Từ ngày không được lớn hơn Đến ngày' });
    }

    await ky.update({
      ten_ky: ten_ky ? ten_ky.trim() : ky.ten_ky,
      tu_ngay: tu_ngay || ky.tu_ngay,
      den_ngay: den_ngay || ky.den_ngay,
      ngay_lap: ngay_lap || ky.ngay_lap,
      ghi_chu: ghi_chu !== undefined ? ghi_chu : ky.ghi_chu,
    });

    return res.json({ ok: true, data: ky });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// DELETE /api/ketoan/ky-tong-hop/:id (Xóa kỳ nháp)
router.delete('/ky-tong-hop/:id', ketoanOrAdmin, async (req, res) => {
  try {
    const ky = await KeToanKyTongHop.findByPk(req.params.id);
    if (!ky) return res.status(404).json({ ok: false, error: 'Không tìm thấy kỳ tổng hợp' });
    if (ky.trang_thai === 'da_chot') {
      return res.status(400).json({ ok: false, error: 'Không thể xóa kỳ đã chốt số liệu' });
    }

    await ky.destroy();
    await logThietLap('XOA_KY_TONG_HOP', `Xóa kỳ tổng hợp "${ky.ten_ky}" (ID: ${ky.id})`, req);
    return res.json({ ok: true, message: 'Đã xóa kỳ tổng hợp thành công' });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// ── Helper cộng ngày ─────────────────────────────────────────────────────────────
function addDays(dateStr, n) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + n);
  return d.toISOString().split('T')[0];
}

// ── Helper sắp xếp tiếng Việt theo Họ Tên ──────────────────────────────────────────
const getSortNames = (fullName) => {
  if (!fullName) return { first: '', middle: '', last: '' };
  const cleanName = fullName.replace(/\s*\(.*?\)\s*/g, '').trim();
  const parts = cleanName.split(/\s+/);
  const first = parts.pop() || '';
  const last = parts.length > 0 ? parts[0] : '';
  const middle = parts.slice(1).join(' ');
  return { first, middle, last };
};

const sortGvByName = (list) => {
  if (!Array.isArray(list)) return [];
  return [...list].sort((a, b) => {
    const nameA = getSortNames(a.ho_ten || a.name || '');
    const nameB = getSortNames(b.ho_ten || b.name || '');
    let cmp = nameA.first.localeCompare(nameB.first, 'vi');
    if (cmp !== 0) return cmp;
    cmp = nameA.last.localeCompare(nameB.last, 'vi');
    if (cmp !== 0) return cmp;
    return nameA.middle.localeCompare(nameB.middle, 'vi');
  });
};

// ── Danh sách nhân sự & mức phụ cấp cơ sở khớp Báo cáo Thống kê ───────────────
const BASELINE_STAFF_ALLOWANCES = [
  { ho_ten: 'Trần Bá Lâm', cap_nhat_tt: 700000, so_tk: '0397854806' },
  { ho_ten: 'Trần Nhật Tân', thiet_bi: 1600000, so_tk: '060146415418' },
  { ho_ten: 'Phan Thanh Nhật', so_tk: '0931158262' },
  { ho_ten: 'Bùi Thanh Toàn', gs_an: 1600000, so_tk: '050128831239' },
  { ho_ten: 'Lê Hoàng Hà', so_tk: '0908345603' },
  { ho_ten: 'Đỗ Văn Thương', gs_an: 1600000, so_tk: '0342184452' },
  { ho_ten: 'Đỗ Ngọc Bích Vân', gs_an: 1600000, so_tk: '060297153784' },
  { ho_ten: 'Đặng Thị Yến', so_tk: '060146446712' },
  { ho_ten: 'Phạm Thị Thanh Hà', tiep_nhan_vd: 800000, so_tk: '0903832423' },
  { ho_ten: 'Đào Thị Cẩm Hạnh', so_tk: '060146399773' },
  { ho_ten: 'Trần Nhật Thiên Thanh', vs_bv: 2000000, so_tk: '060310096671' },
  { ho_ten: 'Trần Thị Kim Thoại', so_tk: '0388706578' },
  { ho_ten: 'Đinh Thị Tuyết Lan', vs_bv: 2000000, so_tk: '060253956685' },
  { ho_ten: 'Mai Thị Tường Vi', so_tk: '0935595079' },
  { ho_ten: 'Lê Thị Huyền Nhung', gs_an: 1400000, so_tk: '0586613647' },
  { ho_ten: 'Cao Thị Mai Huệ', so_tk: '060275595589' },
  { ho_ten: 'Bùi Phùng Đức Anh', so_tk: '060183474475' },
  { ho_ten: 'Hoàng Thanh Thủy', so_tk: '0387574502' },
  { ho_ten: 'Trần Thị Hồng Cẩm', cap_nhat_tt: 500000, so_tk: '060325382506' },
  { ho_ten: 'Vũ Quốc Phong', gs_ban_tru: 2750000, so_tk: '123698898888' },
  { ho_ten: 'Huỳnh Đức Vịnh', gs_ban_tru: 2250000, so_tk: '0909930164' },
  { ho_ten: 'Lý Công Thành', gs_an: 1300000, so_tk: '060326149384' },
  { ho_ten: 'Nguyễn Thị Nhung', vs_bv: 2000000, so_tk: '060962014341' },
  { ho_ten: 'Nguyễn Ngọc Cầm', vs_bv: 800000, so_tk: '06014646453' },
  { ho_ten: 'Mai Quỳnh Châu', bt_an: 300000, gs_an: 1600000, y_te: 770000, so_tk: '060326378898' },
  { ho_ten: 'Huỳnh Duy Khoa', so_tk: '060818237416' },
  { ho_ten: 'Bùi Xuân Kim Sa', so_tk: '' },
  { ho_ten: 'Hồ Quang Thịnh', so_tk: '' },
];

// Helper query lấy công ăn & công ngủ thực tế và phụ cấp trong khoảng ngày
async function fetchAttendanceSourceData(startDate, endDate) {
  let donGiaAn = 100000;
  let donGiaNgu = 180000;
  let donGiaYTe = 70000;
  let donGiaGsBanTru = 250000;

  const cauHinh = await CauHinhHeThong.findOne();
  if (cauHinh) {
    if (cauHinh.phu_cap_gs_an) donGiaAn = parseInt(cauHinh.phu_cap_gs_an, 10) || 100000;
    if (cauHinh.phu_cap_y_te) donGiaYTe = parseInt(cauHinh.phu_cap_y_te, 10) || 70000;
    if (cauHinh.phu_cap_gs_ban_tru) donGiaGsBanTru = parseInt(cauHinh.phu_cap_gs_ban_tru, 10) || 250000;
  }
  const chgNgu = await CauHinhGia.findOne({
    where: { loai_truc: 1, ngay_ap_dung: { [Op.lte]: endDate } },
    order: [['ngay_ap_dung', 'DESC']],
    raw: true,
  });
  if (chgNgu && chgNgu.don_gia) donGiaNgu = parseFloat(chgNgu.don_gia);

  // Đọc đơn giá chuẩn từ Danh mục khoản chi (Kế toán quản lý trực tiếp)
  const dmList = await KeToanDanhMucKhoanChi.findAll().catch(() => []);
  const dmMap = {};
  dmList.forEach((d) => (dmMap[d.ma_khoan_chi] = d));

  if (dmMap['truc_phong']?.don_gia_mac_dinh && parseFloat(dmMap['truc_phong'].don_gia_mac_dinh) > 0) {
    donGiaNgu = parseFloat(dmMap['truc_phong'].don_gia_mac_dinh);
  }
  if (dmMap['bt_an']?.don_gia_mac_dinh && parseFloat(dmMap['bt_an'].don_gia_mac_dinh) > 0) {
    donGiaAn = parseFloat(dmMap['bt_an'].don_gia_mac_dinh);
  }
  if (dmMap['y_te']?.don_gia_mac_dinh && parseFloat(dmMap['y_te'].don_gia_mac_dinh) > 0) {
    donGiaYTe = parseFloat(dmMap['y_te'].don_gia_mac_dinh);
  }
  if (dmMap['gs_ban_tru']?.don_gia_mac_dinh && parseFloat(dmMap['gs_ban_tru'].don_gia_mac_dinh) > 0) {
    donGiaGsBanTru = parseFloat(dmMap['gs_ban_tru'].don_gia_mac_dinh);
  }

  // 1. Phân công trực ăn - Chỉ lấy các cột cần thiết từ CSDL
  const phanCongAn = await PhanCongTrucGV.findAll({
    where: {
      ngay: { [Op.between]: [startDate, endDate] },
      loai_truc: 0,
      xac_nhan_truc: { [Op.ne]: false },
    },
    attributes: ['id', 'ngay', 'loai_truc', 'ma_gv_id', 'ma_gv_truc_thay_id', 'ten_gv_truc_thay'],
    include: [
      { association: 'giao_vien', attributes: ['id', 'ho_ten', 'so_tai_khoan', 'nhiem_vu'] },
      { association: 'giao_vien_truc_thay', attributes: ['id', 'ho_ten', 'so_tai_khoan', 'nhiem_vu'] },
    ],
    order: [['ngay', 'ASC']],
  });

  const activeDatesSet = new Set();
  phanCongAn.forEach((pc) => activeDatesSet.add(pc.ngay));
  const soNgayBanTru = activeDatesSet.size;

  const anByGv = {};
  const seenAn = new Set();
  phanCongAn.forEach((pc) => {
    let gvId, name, stk = '', nhiemVu = 0;
    if (pc.ten_gv_truc_thay && pc.ten_gv_truc_thay.trim()) {
      name = pc.ten_gv_truc_thay.trim();
      gvId = `ext_${name}`;
    } else if (pc.ma_gv_truc_thay_id) {
      gvId = pc.ma_gv_truc_thay_id;
      name = pc.giao_vien_truc_thay?.ho_ten || `GV #${pc.ma_gv_truc_thay_id}`;
      stk = pc.giao_vien_truc_thay?.so_tai_khoan || '';
      nhiemVu = pc.giao_vien_truc_thay?.nhiem_vu ?? 0;
    } else {
      gvId = pc.ma_gv_id;
      name = pc.giao_vien?.ho_ten || `GV #${pc.ma_gv_id}`;
      stk = pc.giao_vien?.so_tai_khoan || '';
      nhiemVu = pc.giao_vien?.nhiem_vu ?? 0;
    }

    const key = `${gvId}_${pc.ngay}`;
    if (seenAn.has(key)) return;
    seenAn.add(key);

    const normKey = name.trim().toLowerCase();
    if (!anByGv[normKey]) {
      anByGv[normKey] = {
        nhan_su_id: typeof gvId === 'number' ? gvId : null,
        ho_ten: name,
        so_tai_khoan: stk,
        nhiem_vu: nhiemVu,
        so_ca_an: 0,
        tien_an: 0,
      };
    }
    anByGv[normKey].so_ca_an += 1;
    anByGv[normKey].tien_an += donGiaAn;
  });

  // 2. Phân công trực ngủ - Chỉ lấy các cột cần thiết từ CSDL
  const phanCongNgu = await PhanCongTrucGV.findAll({
    where: {
      ngay: { [Op.between]: [startDate, endDate] },
      loai_truc: 1,
      xac_nhan_truc: { [Op.ne]: false },
    },
    attributes: ['id', 'ngay', 'loai_truc', 'ma_gv_id', 'ma_gv_truc_thay_id', 'ten_gv_truc_thay'],
    include: [
      { association: 'giao_vien', attributes: ['id', 'ho_ten', 'so_tai_khoan'] },
      { association: 'giao_vien_truc_thay', attributes: ['id', 'ho_ten', 'so_tai_khoan'] },
    ],
    order: [['ngay', 'ASC']],
  });

  const nguByGv = {};
  const seenNgu = new Set();
  phanCongNgu.forEach((pc) => {
    let gvId, name, stk = '';
    if (pc.ten_gv_truc_thay && pc.ten_gv_truc_thay.trim()) {
      name = pc.ten_gv_truc_thay.trim();
      gvId = `ext_${name}`;
    } else if (pc.ma_gv_truc_thay_id) {
      gvId = pc.ma_gv_truc_thay_id;
      name = pc.giao_vien_truc_thay?.ho_ten || `GV #${pc.ma_gv_truc_thay_id}`;
      stk = pc.giao_vien_truc_thay?.so_tai_khoan || '';
    } else {
      gvId = pc.ma_gv_id;
      name = pc.giao_vien?.ho_ten || `GV #${pc.ma_gv_id}`;
      stk = pc.giao_vien?.so_tai_khoan || '';
    }

    const key = `${gvId}_${pc.ngay}`;
    if (seenNgu.has(key)) return;
    seenNgu.add(key);

    const normKey = name.trim().toLowerCase();
    if (!nguByGv[normKey]) {
      nguByGv[normKey] = {
        nhan_su_id: typeof gvId === 'number' ? gvId : null,
        ho_ten: name,
        so_tai_khoan: stk,
        so_ca_ngu: 0,
        tien_ngu: 0,
      };
    }
    nguByGv[normKey].so_ca_ngu += 1;
    nguByGv[normKey].tien_ngu += donGiaNgu;
  });

  // 3. Lấy danh sách giáo viên từ CSDL để bổ sung STK & ID
  const allDbTeachers = await GiaoVien.findAll({ attributes: ['id', 'ho_ten', 'so_tai_khoan', 'nhiem_vu'] });
  const dbTeacherMap = {};
  allDbTeachers.forEach((t) => {
    dbTeacherMap[t.ho_ten.trim().toLowerCase()] = t;
  });

  // 4. Hợp nhất danh sách nhân sự từ BASELINE_STAFF_ALLOWANCES + Chấm công + Giáo viên
  const personMap = {};

  // Thêm nhân sự gốc
  BASELINE_STAFF_ALLOWANCES.forEach((base) => {
    const clean = base.ho_ten.trim().toLowerCase();
    const dbT = dbTeacherMap[clean];
    personMap[clean] = {
      ho_ten: base.ho_ten,
      so_tai_khoan: base.so_tk || dbT?.so_tai_khoan || '',
      nhan_su_id: dbT?.id || null,
      baseAllowances: base,
    };
  });

  // Bổ sung người có trực ăn hoặc ngủ
  [...Object.keys(anByGv), ...Object.keys(nguByGv)].forEach((clean) => {
    if (!personMap[clean]) {
      const an = anByGv[clean];
      const ngu = nguByGv[clean];
      const dbT = dbTeacherMap[clean];
      const hoTen = an?.ho_ten || ngu?.ho_ten || dbT?.ho_ten || clean;
      personMap[clean] = {
        ho_ten: hoTen,
        so_tai_khoan: an?.so_tai_khoan || ngu?.so_tai_khoan || dbT?.so_tai_khoan || '',
        nhan_su_id: an?.nhan_su_id || ngu?.nhan_su_id || dbT?.id || null,
        baseAllowances: {},
      };
    }
  });

  // 5. Tính toán chi tiết 9 khoản chi cho từng người
  const calculatedStaff = Object.values(personMap).map((p) => {
    const clean = p.ho_ten.trim().toLowerCase();
    const anInfo = anByGv[clean];
    const nguInfo = nguByGv[clean];
    const base = p.baseAllowances || {};

    const isMaiQuynhChau = clean.includes('mai quỳnh châu') || clean.includes('quỳnh châu') || clean === 'châu' || clean.endsWith(' châu');
    const isPhamThiThanhHa = clean.includes('thanh hà');
    const isHongCam = clean.includes('hồng cẩm') || clean.includes('trần thị hồng cẩm');
    const isVuQuocPhong = clean.includes('vũ quốc phong') || clean.includes('quốc phong');
    const isHuynhDucVinh = clean.includes('huỳnh đức vịnh') || clean.includes('đức vịnh');
    const isBaLam = clean.includes('bá lâm');
    const isNhatTan = clean.includes('nhật tân') || clean.includes('trần nhật tân');
    const isThienThanh = clean.includes('thiên thanh');

    // 1. Trực phòng (nguon_truc_ngu)
    const truc_phong = (nguInfo?.so_ca_ngu || 0) * donGiaNgu;

    // 2. Trực vệ sinh và bảo vệ (vs_bv)
    const vs_bv = base.vs_bv || 0;

    // 3. Nhắn tin, tiếp nhận và vệ sinh vật dụng (tiep_nhan_vd)
    const tiep_nhan_vd = base.tiep_nhan_vd || (isPhamThiThanhHa ? 800000 : 0);

    // 4. Chăm sóc Y tế (y_te): Châu là Y tế (Số ngày bán trú x 70.000đ)
    let y_te = 0;
    if (isMaiQuynhChau) {
      y_te = soNgayBanTru > 0 ? soNgayBanTru * donGiaYTe : (base.y_te || 770000);
    }

    // 5. Bán trú ăn (bt_an)
    let bt_an = 0;
    if (isMaiQuynhChau) {
      bt_an = 300000;
    } else if (anInfo) {
      bt_an = anInfo.nhiem_vu === 1 ? 0 : anInfo.tien_an;
    } else {
      bt_an = base.bt_an || 0;
    }

    // 6. Cập nhật thông tin (cap_nhat_tt): chỉ Hồng Cẩm (500k) và Bá Lâm (700k) là định kỳ
    let cap_nhat_tt = base.cap_nhat_tt || 0;
    if (!cap_nhat_tt) {
      if (isHongCam) cap_nhat_tt = 500000;
      else if (isBaLam) cap_nhat_tt = 700000;
    }

    // 7. Thiết bị (thiet_bi): Trần Nhật Tân là thiết bị (16 ca x 100k = 1.600.000đ)
    const thiet_bi = isNhatTan ? 1600000 : 0;

    // 8. Giám sát ăn (gs_an)
    let gs_an = 0;
    if (isMaiQuynhChau) {
      gs_an = (anInfo && anInfo.tien_an) ? anInfo.tien_an : (base.gs_an || 1600000);
    } else if (anInfo && anInfo.nhiem_vu === 1) {
      gs_an = anInfo.tien_an;
    } else {
      gs_an = base.gs_an || 0;
    }

    // 9. Giám sát bán trú (gs_ban_tru)
    let gs_ban_tru = 0;
    if (isVuQuocPhong) {
      gs_ban_tru = soNgayBanTru > 0 ? soNgayBanTru * donGiaGsBanTru : 2750000;
    } else if (isHuynhDucVinh) {
      gs_ban_tru = 2250000;
    } else {
      gs_ban_tru = base.gs_ban_tru || 0;
    }

    return {
      ho_ten: p.ho_ten,
      so_tai_khoan: p.so_tai_khoan,
      nhan_su_id: p.nhan_su_id,
      amounts: {
        truc_phong,
        vs_bv,
        tiep_nhan_vd,
        y_te,
        bt_an,
        cap_nhat_tt,
        thiet_bi,
        gs_an,
        gs_ban_tru,
      },
      counts: {
        so_ca_ngu: nguInfo?.so_ca_ngu || 0,
        so_ca_an: anInfo?.so_ca_an || 0,
        so_ngay_ban_tru: soNgayBanTru,
      },
    };
  });

  // Sắp xếp tiếng Việt chuẩn
  const sortedStaff = sortGvByName(calculatedStaff);

  return {
    sortedStaff,
    donGiaAn,
    donGiaNgu,
    donGiaYTe,
    donGiaGsBanTru,
    soNgayBanTru,
  };
}

// Tự động căn cứ vào CSDL và cập nhật toàn bộ công trực, phụ cấp cho kỳ nháp
async function ensureKyDataFromDb(ky) {
  if (!ky || ky.trang_thai === 'da_chot') return;

  const { sortedStaff } = await fetchAttendanceSourceData(ky.tu_ngay, ky.den_ngay);
  const allCategories = await KeToanDanhMucKhoanChi.findAll({ where: { kich_hoat: true } });
  const catMap = {};
  allCategories.forEach((c) => {
    catMap[c.ma_khoan_chi] = c;
  });

  const existingNguoiNhans = await KeToanNguoiNhan.findAll({
    where: { ky_id: ky.id },
    include: [{ model: KeToanChiTietKhoanChi, as: 'chi_tiet_khoan_chi' }],
  });

  const nnByName = {};
  existingNguoiNhans.forEach((nn) => {
    nnByName[nn.ho_ten.trim().toLowerCase()] = nn;
  });

  for (let idx = 0; idx < sortedStaff.length; idx++) {
    const person = sortedStaff[idx];
    const clean = person.ho_ten.trim().toLowerCase();
    let nn = nnByName[clean];

    if (!nn) {
      nn = await KeToanNguoiNhan.create({
        ky_id: ky.id,
        stt: idx + 1,
        nhan_su_id: person.nhan_su_id,
        ma_dinh_danh: person.nhan_su_id ? `GV${person.nhan_su_id}` : `EXT_${Date.now()}_${idx}`,
        ho_ten: person.ho_ten.trim(),
        so_tai_khoan: person.so_tai_khoan ? String(person.so_tai_khoan).trim() : '',
        tong_tien: 0,
        da_thanh_toan: 0,
        trang_thai_tt: 'chua_chi',
      });
      nnByName[clean] = nn;
    } else {
      const updateFields = { stt: idx + 1 };
      if (person.so_tai_khoan && !nn.so_tai_khoan) {
        updateFields.so_tai_khoan = String(person.so_tai_khoan).trim();
      }
      if (person.nhan_su_id && !nn.nhan_su_id) {
        updateFields.nhan_su_id = person.nhan_su_id;
      }
      await nn.update(updateFields);
    }

    for (const maKhoanChi of Object.keys(person.amounts)) {
      const cat = catMap[maKhoanChi];
      if (!cat) continue;

      const newTienNguon = person.amounts[maKhoanChi] || 0;
      let ct = await KeToanChiTietKhoanChi.findOne({
        where: { nguoi_nhan_id: nn.id, ma_khoan_chi: maKhoanChi },
      });

      if (ct) {
        const tienDieuChinh = parseFloat(ct.tien_dieu_chinh) || 0;
        await ct.update({
          tien_nguon: newTienNguon,
          thanh_tien: newTienNguon + tienDieuChinh,
          so_ngay:
            maKhoanChi === 'truc_phong'
              ? person.counts.so_ca_ngu
              : maKhoanChi === 'y_te' || maKhoanChi === 'gs_ban_tru'
              ? person.counts.so_ngay_ban_tru
              : ct.so_ngay,
          nguon_cap_nhat: 'csdl_tu_dong',
        });
      } else if (newTienNguon > 0) {
        await KeToanChiTietKhoanChi.create({
          nguoi_nhan_id: nn.id,
          ky_id: ky.id,
          khoan_chi_id: cat.id,
          ma_khoan_chi: maKhoanChi,
          loai_tinh: cat.loai_tinh,
          so_ngay:
            maKhoanChi === 'truc_phong'
              ? person.counts.so_ca_ngu
              : maKhoanChi === 'y_te' || maKhoanChi === 'gs_ban_tru'
              ? person.counts.so_ngay_ban_tru
              : 0,
          don_gia: parseFloat(cat.don_gia_mac_dinh) || 0,
          tien_nguon: newTienNguon,
          tien_nhap: 0,
          tien_dieu_chinh: 0,
          thanh_tien: newTienNguon,
          nguon_cap_nhat: 'csdl_tu_dong',
        });
      }
    }
  }

  await recalculateKyTotals(ky.id);
}

// POST /api/ketoan/ky-tong-hop/:id/dong-bo-nguon
// Body: { preview: boolean, tu_ngay_override?: string, den_ngay_override?: string }
router.post('/ky-tong-hop/:id/dong-bo-nguon', ketoanOrAdmin, async (req, res) => {
  const { preview = false, tu_ngay_override, den_ngay_override } = req.body;
  try {
    const ky = await KeToanKyTongHop.findByPk(req.params.id);
    if (!ky) return res.status(404).json({ ok: false, error: 'Không tìm thấy kỳ tổng hợp' });
    if (ky.trang_thai === 'da_chot') {
      return res.status(400).json({ ok: false, error: 'Kỳ đã chốt, không được đồng bộ đè dữ liệu' });
    }

    const startDate = tu_ngay_override || ky.tu_ngay;
    const endDate = den_ngay_override || ky.den_ngay;

    const {
      sortedStaff,
      donGiaAn,
      donGiaNgu,
      donGiaYTe,
      donGiaGsBanTru,
      soNgayBanTru,
    } = await fetchAttendanceSourceData(startDate, endDate);

    // Lấy danh mục khoản chi
    const allCategories = await KeToanDanhMucKhoanChi.findAll({ order: [['thu_tu_hien_thi', 'ASC']] });
    const catMap = {};
    allCategories.forEach((c) => {
      catMap[c.ma_khoan_chi] = c;
    });

    // Lấy danh sách người nhận hiện có trong kỳ
    const existingNguoiNhans = await KeToanNguoiNhan.findAll({
      where: { ky_id: ky.id },
      include: [{ model: KeToanChiTietKhoanChi, as: 'chi_tiet_khoan_chi' }],
    });

    const nnByName = {};
    existingNguoiNhans.forEach((nn) => {
      nnByName[nn.ho_ten.trim().toLowerCase()] = nn;
    });

    // So sánh biến động (Diff)
    const previewDiffs = [];
    sortedStaff.forEach((person) => {
      const clean = person.ho_ten.trim().toLowerCase();
      const existingNn = nnByName[clean];

      Object.keys(person.amounts).forEach((maKhoanChi) => {
        const cat = catMap[maKhoanChi];
        if (!cat) return;

        const newAmount = person.amounts[maKhoanChi] || 0;
        const existingCt = existingNn?.chi_tiet_khoan_chi?.find((c) => c.ma_khoan_chi === maKhoanChi);
        const currentAmount = parseFloat(existingCt?.tien_nguon || 0);

        if (newAmount !== currentAmount) {
          previewDiffs.push({
            ho_ten: person.ho_ten,
            ten_khoan_chi: cat.ten_khoan_chi,
            ma_khoan_chi: maKhoanChi,
            so_tien_hien_tai: currentAmount,
            so_tien_moi: newAmount,
          });
        }
      });
    });

    // Nếu chỉ là preview thì trả về diff
    if (preview) {
      return res.json({
        ok: true,
        preview: true,
        data: {
          tu_ngay: startDate,
          den_ngay: endDate,
          donGiaAn,
          donGiaNgu,
          donGiaYTe,
          donGiaGsBanTru,
          soNgayBanTru,
          diffCount: previewDiffs.length,
          diffs: previewDiffs,
        },
      });
    }

    // Thực hiện commit đồng bộ vào CSDL (bảo toàn các khoản điều chỉnh và giữ nguyên vẹn)
    const t = await sequelize.transaction();
    try {
      for (let idx = 0; idx < sortedStaff.length; idx++) {
        const person = sortedStaff[idx];
        const clean = person.ho_ten.trim().toLowerCase();
        let nn = nnByName[clean];

        if (!nn) {
          nn = await KeToanNguoiNhan.create(
            {
              ky_id: ky.id,
              stt: idx + 1,
              nhan_su_id: person.nhan_su_id,
              ma_dinh_danh: person.nhan_su_id ? `GV${person.nhan_su_id}` : `EXT_${Date.now()}_${idx}`,
              ho_ten: person.ho_ten.trim(),
              so_tai_khoan: person.so_tai_khoan ? String(person.so_tai_khoan).trim() : '',
              tong_tien: 0,
              da_thanh_toan: 0,
              trang_thai_tt: 'chua_chi',
            },
            { transaction: t }
          );
          nnByName[clean] = nn;
        } else {
          const updateFields = { stt: idx + 1 };
          if (person.so_tai_khoan && !nn.so_tai_khoan) {
            updateFields.so_tai_khoan = String(person.so_tai_khoan).trim();
          }
          if (person.nhan_su_id && !nn.nhan_su_id) {
            updateFields.nhan_su_id = person.nhan_su_id;
          }
          await nn.update(updateFields, { transaction: t });
        }

        // Cập nhật từng khoản chi cho người nhận
        for (const maKhoanChi of Object.keys(person.amounts)) {
          const cat = catMap[maKhoanChi];
          if (!cat) continue;

          const newTienNguon = person.amounts[maKhoanChi] || 0;
          let ct = await KeToanChiTietKhoanChi.findOne({
            where: { nguoi_nhan_id: nn.id, ma_khoan_chi: maKhoanChi },
            transaction: t,
          });

          if (ct) {
            const tienDieuChinh = parseFloat(ct.tien_dieu_chinh) || 0;
            await ct.update(
              {
                tien_nguon: newTienNguon,
                thanh_tien: newTienNguon + tienDieuChinh,
                so_ngay:
                  maKhoanChi === 'truc_phong'
                    ? person.counts.so_ca_ngu
                    : maKhoanChi === 'y_te' || maKhoanChi === 'gs_ban_tru'
                    ? person.counts.so_ngay_ban_tru
                    : ct.so_ngay,
                nguon_cap_nhat: 'dong_bo_bao_cao',
              },
              { transaction: t }
            );
          } else if (newTienNguon > 0) {
            await KeToanChiTietKhoanChi.create(
              {
                nguoi_nhan_id: nn.id,
                ky_id: ky.id,
                khoan_chi_id: cat.id,
                ma_khoan_chi: maKhoanChi,
                loai_tinh: cat.loai_tinh,
                so_ngay:
                  maKhoanChi === 'truc_phong'
                    ? person.counts.so_ca_ngu
                    : maKhoanChi === 'y_te' || maKhoanChi === 'gs_ban_tru'
                    ? person.counts.so_ngay_ban_tru
                    : 0,
                don_gia: parseFloat(cat.don_gia_mac_dinh) || 0,
                tien_nguon: newTienNguon,
                tien_nhap: 0,
                tien_dieu_chinh: 0,
                thanh_tien: newTienNguon,
                nguon_cap_nhat: 'dong_bo_bao_cao',
              },
              { transaction: t }
            );
          }
        }
      }

      await recalculateKyTotals(ky.id, t);
      await t.commit();

      await logThietLap(
        'DONG_BO_BAO_CAO',
        `Đồng bộ toàn bộ công trực và phụ cấp từ Báo cáo thống kê cho kỳ "${ky.ten_ky}" (${sortedStaff.length} người nhận)`,
        req
      );

      return res.json({
        ok: true,
        message: `Đồng bộ thành công dữ liệu từ Báo cáo thống kê cho ${sortedStaff.length} cán bộ, giáo viên.`,
      });
    } catch (err) {
      await t.rollback();
      throw err;
    }
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. QUẢN LÝ NGƯỜI NHẬN & CẬP NHẬT KHOẢN CHI CHI TIẾT
// ─────────────────────────────────────────────────────────────────────────────

// POST /api/ketoan/ky-tong-hop/:id/nguoi-nhan
router.post('/ky-tong-hop/:id/nguoi-nhan', ketoanOrAdmin, async (req, res) => {
  try {
    const ky = await KeToanKyTongHop.findByPk(req.params.id);
    if (!ky) return res.status(404).json({ ok: false, error: 'Không tìm thấy kỳ tổng hợp' });
    if (ky.trang_thai === 'da_chot') {
      return res.status(400).json({ ok: false, error: 'Kỳ đã chốt, không thể thêm người nhận' });
    }

    const { nhan_su_id, ho_ten, so_tai_khoan, ma_dinh_danh, ghi_chu } = req.body;

    let finalName = ho_ten ? ho_ten.trim() : '';
    let finalStk = so_tai_khoan ? String(so_tai_khoan).trim() : '';
    let finalNhanSuId = nhan_su_id ? parseInt(nhan_su_id, 10) : null;

    if (finalNhanSuId) {
      const gv = await GiaoVien.findByPk(finalNhanSuId);
      if (gv) {
        if (!finalName) finalName = gv.ho_ten;
        if (!finalStk && gv.so_tai_khoan) finalStk = gv.so_tai_khoan;
      }
    }

    if (!finalName) {
      return res.status(400).json({ ok: false, error: 'Vui lòng cung cấp họ và tên người nhận' });
    }

    // Kiểm tra xem đã có trong kỳ chưa
    let existing;
    if (finalNhanSuId) {
      existing = await KeToanNguoiNhan.findOne({ where: { ky_id: ky.id, nhan_su_id: finalNhanSuId } });
    }
    if (!existing) {
      existing = await KeToanNguoiNhan.findOne({ where: { ky_id: ky.id, ho_ten: finalName } });
    }

    if (existing) {
      return res.json({ ok: true, message: 'Người nhận đã tồn tại trong kỳ này', data: existing });
    }

    const currentMaxStt = await KeToanNguoiNhan.max('stt', { where: { ky_id: ky.id } }) || 0;

    const newNn = await KeToanNguoiNhan.create({
      ky_id: ky.id,
      nhan_su_id: finalNhanSuId,
      ma_dinh_danh: ma_dinh_danh ? ma_dinh_danh.trim() : (finalNhanSuId ? `GV${finalNhanSuId}` : `EXT_${Date.now()}`),
      ho_ten: finalName,
      so_tai_khoan: finalStk,
      tong_tien: 0,
      da_thanh_toan: 0,
      trang_thai_tt: 'chua_chi',
      ghi_chu: ghi_chu || '',
      stt: currentMaxStt + 1,
    });

    await recalculateKyTotals(ky.id);
    return res.json({ ok: true, data: newNn });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// DELETE /api/ketoan/ky-tong-hop/:id/nguoi-nhan/:nguoiNhanId
router.delete('/ky-tong-hop/:id/nguoi-nhan/:nguoiNhanId', ketoanOrAdmin, async (req, res) => {
  try {
    const ky = await KeToanKyTongHop.findByPk(req.params.id);
    if (!ky) return res.status(404).json({ ok: false, error: 'Không tìm thấy kỳ tổng hợp' });
    if (ky.trang_thai === 'da_chot') {
      return res.status(400).json({ ok: false, error: 'Kỳ đã chốt, không thể xóa người nhận' });
    }

    const nn = await KeToanNguoiNhan.findOne({ where: { id: req.params.nguoiNhanId, ky_id: ky.id } });
    if (!nn) return res.status(404).json({ ok: false, error: 'Không tìm thấy người nhận trong kỳ này' });

    await nn.destroy();
    await recalculateKyTotals(ky.id);

    return res.json({ ok: true, message: 'Đã xóa người nhận khỏi kỳ' });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// PUT /api/ketoan/ky-tong-hop/:id/nguoi-nhan/:nguoiNhanId
// Cho phép chỉnh sửa số tài khoản ngân hàng và ghi chú của người nhận trực tiếp tại bảng
router.put('/ky-tong-hop/:id/nguoi-nhan/:nguoiNhanId', ketoanOrAdmin, async (req, res) => {
  try {
    const ky = await KeToanKyTongHop.findByPk(req.params.id);
    if (!ky) return res.status(404).json({ ok: false, error: 'Không tìm thấy kỳ tổng hợp' });

    let nn = null;
    const reqNnId = parseInt(req.params.nguoiNhanId, 10);
    if (!isNaN(reqNnId)) {
      nn = await KeToanNguoiNhan.findOne({ where: { id: reqNnId, ky_id: ky.id } });
    }
    if (!nn && req.body.ho_ten) {
      nn = await KeToanNguoiNhan.findOne({ where: { ho_ten: req.body.ho_ten.trim(), ky_id: ky.id } });
    }
    if (!nn && req.body.nhan_su_id) {
      nn = await KeToanNguoiNhan.findOne({ where: { nhan_su_id: req.body.nhan_su_id, ky_id: ky.id } });
    }

    const { so_tai_khoan, ghi_chu, ho_ten } = req.body;

    if (!nn) {
      if (!ho_ten || !ho_ten.trim()) {
        return res.status(404).json({ ok: false, error: 'Không tìm thấy người nhận trong kỳ này' });
      }
      const currentMaxStt = (await KeToanNguoiNhan.max('stt', { where: { ky_id: ky.id } })) || 0;
      nn = await KeToanNguoiNhan.create({
        ky_id: ky.id,
        nhan_su_id: req.body.nhan_su_id || null,
        ho_ten: ho_ten.trim(),
        so_tai_khoan: so_tai_khoan !== undefined ? String(so_tai_khoan).trim() : '',
        ghi_chu: ghi_chu !== undefined ? String(ghi_chu).trim() : '',
        tong_tien: 0,
        da_thanh_toan: 0,
        trang_thai_tt: 'chua_chi',
        stt: currentMaxStt + 1,
      });
    } else {
      const updates = {};
      if (so_tai_khoan !== undefined) {
        updates.so_tai_khoan = String(so_tai_khoan).trim();
        // Cập nhật đồng bộ vào bảng GiaoVien nếu có liên kết nhân sự
        if (nn.nhan_su_id) {
          try {
            const gv = await GiaoVien.findByPk(nn.nhan_su_id);
            if (gv) {
              await gv.update({ so_tai_khoan: updates.so_tai_khoan });
            }
          } catch (e) {
            console.warn('Không thể đồng bộ số tài khoản sang GiaoVien:', e.message);
          }
        }
      }
      if (ghi_chu !== undefined) {
        updates.ghi_chu = String(ghi_chu).trim();
      }
      if (ho_ten !== undefined && ho_ten.trim()) {
        updates.ho_ten = ho_ten.trim();
      }
      await nn.update(updates);
    }

    return res.json({ ok: true, data: nn, message: 'Đã cập nhật thông tin thành công' });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// Handler chung cập nhật giá trị ô của 1 người nhận (trực tiếp, ngày x đơn giá, hoặc điều chỉnh)
const handleUpdateChiTietKhoan = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const ky = await KeToanKyTongHop.findByPk(req.params.id, { transaction: t });
    if (!ky) {
      await t.rollback();
      return res.status(404).json({ ok: false, error: 'Không tìm thấy kỳ tổng hợp' });
    }
    if (ky.trang_thai === 'da_chot') {
      await t.rollback();
      return res.status(400).json({ ok: false, error: 'Kỳ đã chốt, không thể chỉnh sửa số tiền' });
    }

    const targetNnId = req.body.nguoi_nhan_id || req.params.nguoiNhanId;
    const targetMaKhoanChi = req.body.ma_khoan_chi || req.params.maKhoanChi;
    const so_ngay = req.body.so_ngay;
    const don_gia = req.body.don_gia;
    const tien_nhap = req.body.tien_nhap !== undefined ? req.body.tien_nhap : req.body.so_tien_nhap;
    const tien_dieu_chinh = req.body.tien_dieu_chinh !== undefined ? req.body.tien_dieu_chinh : req.body.so_tien_dieu_chinh;
    const ly_do_dieu_chinh = req.body.ly_do_dieu_chinh;
    const ghi_chu = req.body.ghi_chu;

    if (!targetNnId || !targetMaKhoanChi) {
      await t.rollback();
      return res.status(400).json({ ok: false, error: 'Thiếu thông tin người nhận hoặc khoản chi' });
    }

    let nn = await KeToanNguoiNhan.findOne({ where: { id: targetNnId, ky_id: ky.id }, transaction: t });
    if (!nn && req.body.ho_ten) {
      nn = await KeToanNguoiNhan.findOne({ where: { ho_ten: req.body.ho_ten.trim(), ky_id: ky.id }, transaction: t });
    }
    if (!nn) {
      await t.rollback();
      return res.status(404).json({ ok: false, error: 'Không tìm thấy người nhận' });
    }

    // Tìm cấu hình khoản chi
    const dm = await KeToanDanhMucKhoanChi.findOne({ where: { ma_khoan_chi: targetMaKhoanChi }, transaction: t });

    let ct = await KeToanChiTietKhoanChi.findOne({
      where: { nguoi_nhan_id: nn.id, ma_khoan_chi: targetMaKhoanChi },
      transaction: t,
    });

    const loaiTinh = dm?.loai_tinh || ct?.loai_tinh || 'truc_tiep';

    const cleanName = (nn.ho_ten || '').trim().toLowerCase();
    const isHuynhDucVinh = cleanName.includes('huỳnh đức vịnh') || cleanName.includes('đức vịnh');

    // 5 cột khóa tuyệt đối với mọi nhân sự (kể cả Huỳnh Đức Vịnh)
    const STRICT_LOCKED_CATEGORIES = ['truc_phong', 'y_te', 'bt_an', 'thiet_bi', 'gs_an'];
    if (STRICT_LOCKED_CATEGORIES.includes(targetMaKhoanChi)) {
      await t.rollback();
      let errorMsg = `Khoản chi "${dm?.ten_khoan_chi || targetMaKhoanChi}" được bảo vệ cố định từ CSDL nghiệp vụ, tuyệt đối không được chỉnh sửa.`;
      if (targetMaKhoanChi === 'thiet_bi') {
        errorMsg = 'Khoản "Trực thiết bị" là nhiệm vụ phân công cố định cho Trần Nhật Tân (16 ca × 100.000đ = 1.600.000đ), không thể chỉnh sửa.';
      } else if (targetMaKhoanChi === 'y_te') {
        errorMsg = 'Khoản "Y tế" là nhiệm vụ phân công cố định cho nhân viên Y tế Mai Quỳnh Châu (Số ngày bán trú × 70.000đ), không thể chỉnh sửa.';
      } else if (targetMaKhoanChi === 'truc_phong') {
        errorMsg = 'Khoản "Trực phòng (Ngủ 180k)" được tự động đồng bộ từ CSDL chấm công ngủ thực tế, không thể chỉnh sửa.';
      } else if (targetMaKhoanChi === 'bt_an') {
        errorMsg = 'Khoản "Bán trú ăn (KT 100k)" được tự động đồng bộ từ CSDL chấm công ăn thực tế, không thể chỉnh sửa.';
      } else if (targetMaKhoanChi === 'gs_an') {
        errorMsg = 'Khoản "Giám sát ăn (ĐG 100k)" được tự động đồng bộ từ CSDL chấm công giám sát thực tế, không thể chỉnh sửa.';
      }
      return res.status(400).json({ ok: false, error: errorMsg });
    }

    // Riêng khoản gs_ban_tru: chỉ cho phép Huỳnh Đức Vịnh chỉnh sửa theo phân công
    if (targetMaKhoanChi === 'gs_ban_tru' && !isHuynhDucVinh) {
      await t.rollback();
      return res.status(400).json({
        ok: false,
        error: 'Khoản "Giám sát bán trú" được tính tự động từ CSDL nghiệp vụ, chỉ cho phép chỉnh sửa với nhân sự được phân công đặc biệt (Huỳnh Đức Vịnh).',
      });
    }

    if (!isHuynhDucVinh && loaiTinh.startsWith('nguon_')) {
      await t.rollback();
      return res.status(400).json({
        ok: false,
        error: `Khoản chi "${dm?.ten_khoan_chi || targetMaKhoanChi}" được tự động đồng bộ từ CSDL nghiệp vụ (Chấm công / Phân công trực), cố định không được chỉnh sửa.`,
      });
    }

    const effectiveDonGia = don_gia !== undefined ? parseFloat(don_gia) || 0 : (ct?.don_gia || parseFloat(dm?.don_gia_mac_dinh) || 0);
    const effectiveSoNgay = so_ngay !== undefined ? parseFloat(so_ngay) || 0 : (ct?.so_ngay || 0);
    const effectiveTienNhap = tien_nhap !== undefined ? parseFloat(tien_nhap) || 0 : (ct?.tien_nhap || 0);
    const effectiveDieuChinh = tien_dieu_chinh !== undefined ? parseFloat(tien_dieu_chinh) || 0 : (ct?.tien_dieu_chinh || 0);
    const effectiveTienNguon = ct ? parseFloat(ct.tien_nguon) || 0 : 0;

    // Tính thành tiền theo loại
    let thanhTien = 0;
    if (loaiTinh === 'so_ngay_don_gia' || loaiTinh === 'ngay_don_gia') {
      thanhTien = (effectiveSoNgay * effectiveDonGia) + effectiveDieuChinh;
    } else if (loaiTinh === 'nguon_truc_an' || loaiTinh === 'nguon_truc_ngu') {
      thanhTien = effectiveTienNguon + effectiveDieuChinh;
    } else {
      // truc_tiep
      thanhTien = effectiveTienNhap + effectiveDieuChinh;
    }

    const tan_suat = req.body.tan_suat;

    if (ct) {
      await ct.update(
        {
          loai_tinh: loaiTinh,
          tan_suat: tan_suat !== undefined ? tan_suat : (ct.tan_suat || dm?.tan_suat || 'dinh_ky'),
          so_ngay: effectiveSoNgay,
          don_gia: effectiveDonGia,
          tien_nhap: effectiveTienNhap,
          tien_dieu_chinh: effectiveDieuChinh,
          ly_do_dieu_chinh: ly_do_dieu_chinh !== undefined ? ly_do_dieu_chinh : ct.ly_do_dieu_chinh,
          thanh_tien: Math.max(0, thanhTien),
          nguon_cap_nhat: 'manual',
          ghi_chu: ghi_chu !== undefined ? ghi_chu : ct.ghi_chu,
        },
        { transaction: t }
      );
    } else {
      ct = await KeToanChiTietKhoanChi.create(
        {
          nguoi_nhan_id: nn.id,
          ky_id: ky.id,
          khoan_chi_id: dm?.id || null,
          ma_khoan_chi: targetMaKhoanChi,
          loai_tinh: loaiTinh,
          tan_suat: tan_suat || dm?.tan_suat || 'dinh_ky',
          so_ngay: effectiveSoNgay,
          don_gia: effectiveDonGia,
          tien_nguon: 0,
          tien_nhap: effectiveTienNhap,
          tien_dieu_chinh: effectiveDieuChinh,
          ly_do_dieu_chinh: ly_do_dieu_chinh || '',
          thanh_tien: Math.max(0, thanhTien),
          nguon_cap_nhat: 'manual',
          ghi_chu: ghi_chu || '',
        },
        { transaction: t }
      );
    }

    await recalculateKyTotals(ky.id, t, nn.id);
    await t.commit();

    return res.json({ ok: true, data: ct });
  } catch (err) {
    await t.rollback();
    return res.status(500).json({ ok: false, error: err.message });
  }
};

// PUT /api/ketoan/ky-tong-hop/:id/chi-tiet-khoan
router.put('/ky-tong-hop/:id/chi-tiet-khoan', ketoanOrAdmin, handleUpdateChiTietKhoan);

// POST /api/ketoan/ky-tong-hop/:id/nguoi-nhan/:nguoiNhanId/khoan-chi/:maKhoanChi/update
router.post(
  '/ky-tong-hop/:id/nguoi-nhan/:nguoiNhanId/khoan-chi/:maKhoanChi/update',
  ketoanOrAdmin,
  handleUpdateChiTietKhoan
);

// POST /api/ketoan/ky-tong-hop/:id/sao-chep
// Sao chép từ kỳ trước: chọn kỳ nguồn, chọn người nhận, chọn khoản chi (bỏ qua khoản chi 1 lần đã chi)
router.post('/ky-tong-hop/:id/sao-chep', ketoanOrAdmin, async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const ky = await KeToanKyTongHop.findByPk(req.params.id, { transaction: t });
    if (!ky) {
      await t.rollback();
      return res.status(404).json({ ok: false, error: 'Không tìm thấy kỳ hiện tại' });
    }
    if (ky.trang_thai === 'da_chot') {
      await t.rollback();
      return res.status(400).json({ ok: false, error: 'Kỳ đã chốt, không thể sao chép đè' });
    }

    const { ky_nguon_id, danh_sach_nhan_su_ids, danh_sach_ma_khoan_chi } = req.body;
    if (!ky_nguon_id) {
      await t.rollback();
      return res.status(400).json({ ok: false, error: 'Vui lòng chọn kỳ nguồn để sao chép' });
    }

    const kyNguon = await KeToanKyTongHop.findByPk(ky_nguon_id, {
      include: [
        {
          model: KeToanNguoiNhan,
          as: 'danh_sach_nguoi_nhan',
          include: [{ model: KeToanChiTietKhoanChi, as: 'chi_tiet_khoan_chi' }],
        },
      ],
      transaction: t,
    });
    if (!kyNguon) {
      await t.rollback();
      return res.status(404).json({ ok: false, error: 'Không tìm thấy kỳ nguồn' });
    }

    // Danh mục khoản chi hiện tại để kiểm tra tần suất
    const dmList = await KeToanDanhMucKhoanChi.findAll({ transaction: t });
    const dmMap = {};
    dmList.forEach((d) => (dmMap[d.ma_khoan_chi] = d));

    let copyCount = 0;
    const selectedNhanSuSet = Array.isArray(danh_sach_nhan_su_ids) && danh_sach_nhan_su_ids.length > 0
      ? new Set(danh_sach_nhan_su_ids.map(String))
      : null;
    const selectedKhoanChiSet = Array.isArray(danh_sach_ma_khoan_chi) && danh_sach_ma_khoan_chi.length > 0
      ? new Set(danh_sach_ma_khoan_chi)
      : null;

    for (const srcNn of kyNguon.danh_sach_nguoi_nhan || []) {
      const matchId = srcNn.nhan_su_id ? String(srcNn.nhan_su_id) : srcNn.ho_ten;
      if (selectedNhanSuSet && !selectedNhanSuSet.has(matchId)) continue;

      // Tìm hoặc tạo người nhận trong kỳ đích
      let destNn = await KeToanNguoiNhan.findOne({
        where: {
          ky_id: ky.id,
          [Op.or]: [
            ...(srcNn.nhan_su_id ? [{ nhan_su_id: srcNn.nhan_su_id }] : []),
            { ho_ten: srcNn.ho_ten },
          ],
        },
        transaction: t,
      });

      if (!destNn) {
        destNn = await KeToanNguoiNhan.create(
          {
            ky_id: ky.id,
            nhan_su_id: srcNn.nhan_su_id,
            ma_dinh_danh: srcNn.ma_dinh_danh,
            ho_ten: srcNn.ho_ten,
            so_tai_khoan: srcNn.so_tai_khoan,
            tong_tien: 0,
            da_thanh_toan: 0,
            trang_thai_tt: 'chua_chi',
            ghi_chu: srcNn.ghi_chu,
          },
          { transaction: t }
        );
      }

      // Sao chép các khoản chi
      for (const srcCt of srcNn.chi_tiet_khoan_chi || []) {
        if (selectedKhoanChiSet && !selectedKhoanChiSet.has(srcCt.ma_khoan_chi)) continue;

        const dm = dmMap[srcCt.ma_khoan_chi];
        // Bỏ qua khoản chi 1 lần đã chi trong kỳ trước
        if (srcCt.tan_suat === 'mot_lan' || srcCt.tan_suat === '1_lan' || dm?.tan_suat === 'mot_lan') {
          let destCt = await KeToanChiTietKhoanChi.findOne({
            where: { nguoi_nhan_id: destNn.id, ma_khoan_chi: srcCt.ma_khoan_chi },
            transaction: t,
          });
          if (destCt) {
            await destCt.update(
              {
                tien_nhap: 0,
                tien_dieu_chinh: 0,
                thanh_tien: 0,
                tan_suat: 'mot_lan',
              },
              { transaction: t }
            );
          }
          continue;
        }

        // Bỏ qua khoản trực ăn/ngủ nguồn vì sẽ đồng bộ riêng theo kỳ mới
        if (srcCt.loai_tinh === 'nguon_truc_an' || srcCt.loai_tinh === 'nguon_truc_ngu') continue;

        let destCt = await KeToanChiTietKhoanChi.findOne({
          where: { nguoi_nhan_id: destNn.id, ma_khoan_chi: srcCt.ma_khoan_chi },
          transaction: t,
        });

        // Quy tắc: Không tự động lấy số ngày kỳ trước làm số ngày đã xác nhận của kỳ mới
        const copySoNgay = 0; // Đặt về 0 để kế toán xác nhận số ngày kỳ mới
        const copyDonGia = parseFloat(srcCt.don_gia) || parseFloat(dm?.don_gia_mac_dinh) || 0;
        const copyTienNhap = parseFloat(srcCt.tien_nhap) || 0;
        const copyThanhTien = dm?.loai_tinh === 'so_ngay_don_gia' ? (copySoNgay * copyDonGia) : copyTienNhap;

        if (destCt) {
          await destCt.update(
            {
              don_gia: copyDonGia,
              tien_nhap: copyTienNhap,
              thanh_tien: copyThanhTien,
              tan_suat: srcCt.tan_suat || 'dinh_ky',
              nguon_cap_nhat: 'copy_ky_truoc',
            },
            { transaction: t }
          );
        } else {
          await KeToanChiTietKhoanChi.create(
            {
              nguoi_nhan_id: destNn.id,
              ky_id: ky.id,
              khoan_chi_id: dm?.id || null,
              ma_khoan_chi: srcCt.ma_khoan_chi,
              loai_tinh: dm?.loai_tinh || 'truc_tiep',
              tan_suat: srcCt.tan_suat || dm?.tan_suat || 'dinh_ky',
              so_ngay: copySoNgay,
              don_gia: copyDonGia,
              tien_nguon: 0,
              tien_nhap: copyTienNhap,
              tien_dieu_chinh: 0,
              thanh_tien: copyThanhTien,
              nguon_cap_nhat: 'copy_ky_truoc',
            },
            { transaction: t }
          );
        }
      }
      copyCount += 1;
    }

    await recalculateKyTotals(ky.id, t);
    await t.commit();

    await logThietLap('SAO_CHEP_KY', `Sao chép ${copyCount} nhân sự từ kỳ "${kyNguon.ten_ky}" sang kỳ "${ky.ten_ky}"`, req);

    return res.json({ ok: true, message: `Đã sao chép thành công cấu hình của ${copyCount} nhân sự từ kỳ trước.` });
  } catch (err) {
    await t.rollback();
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /api/ketoan/ky-tong-hop/:id/preview-chot - Xem trước số liệu trước khi chốt kỳ
router.get('/ky-tong-hop/:id/preview-chot', ketoanViewOrAdmin, async (req, res) => {
  try {
    const ky = await KeToanKyTongHop.findByPk(req.params.id);
    if (!ky) return res.status(404).json({ ok: false, error: 'Không tìm thấy kỳ tổng hợp' });

    const todayVN = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());
    const tuNgay = req.query.tu_ngay || ky.tu_ngay;
    const denNgay = req.query.den_ngay || ky.den_ngay || todayVN;

    if (tuNgay > denNgay) {
      return res.status(400).json({ ok: false, error: `Từ ngày (${tuNgay}) không được lớn hơn Đến ngày (${denNgay})` });
    }

    const { sortedStaff } = await fetchAttendanceSourceData(tuNgay, denNgay);
    const dmList = await KeToanDanhMucKhoanChi.findAll({ where: { kich_hoat: true } });

    let tongTien = 0;
    sortedStaff.forEach((p) => {
      dmList.forEach((col) => {
        tongTien += (p.amounts[col.ma_khoan_chi] || 0);
      });
    });

    const nextStart = addDays(denNgay, 1);

    return res.json({
      ok: true,
      data: {
        tu_ngay: tuNgay,
        den_ngay: denNgay,
        tong_so_nguoi: sortedStaff.length,
        tong_tien: tongTien,
        ngay_ke_tiep: nextStart,
      },
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /api/ketoan/ky-tong-hop/:id/chot & /chot-ky
const handleChotKy = async (req, res) => {
  try {
    const ky = await KeToanKyTongHop.findByPk(req.params.id);
    if (!ky) return res.status(404).json({ ok: false, error: 'Không tìm thấy kỳ tổng hợp' });
    if (ky.trang_thai === 'da_chot') {
      return res.status(400).json({ ok: false, error: 'Kỳ này đã được chốt trước đó' });
    }

    const todayVN = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());
    const tuNgayChot = req.body?.tu_ngay || ky.tu_ngay;
    const denNgayChot = req.body?.den_ngay || (ky.den_ngay < todayVN ? todayVN : ky.den_ngay);

    if (tuNgayChot > denNgayChot) {
      return res.status(400).json({ ok: false, error: `Từ ngày (${tuNgayChot}) không được lớn hơn Đến ngày (${denNgayChot})` });
    }

    // Kiểm tra không bị chồng lấn với các kỳ khác đã chốt trong quá khứ
    const overlap = await KeToanKyTongHop.findOne({
      where: {
        id: { [Op.ne]: ky.id },
        trang_thai: 'da_chot',
        [Op.and]: [
          { tu_ngay: { [Op.lte]: denNgayChot } },
          sequelize.where(
            sequelize.fn('COALESCE', sequelize.col('den_ngay'), '9999-12-31'),
            { [Op.gte]: tuNgayChot }
          )
        ]
      }
    });
    if (overlap) {
      return res.status(400).json({
        ok: false,
        error: `Khoảng ngày (${tuNgayChot} đến ${denNgayChot}) bị chồng lấn với kỳ đã chốt "${overlap.ten_ky}" (${overlap.tu_ngay} đến ${overlap.den_ngay}). Kỳ sau phải bắt đầu từ ngày mới!`
      });
    }

    // Cập nhật cả tu_ngay và den_ngay nếu người dùng điều chỉnh
    await ky.update({ tu_ngay: tuNgayChot, den_ngay: denNgayChot });

    // 1. Lấy snapshot toàn bộ cấu hình cột và đơn giá tại thời điểm chốt
    const dmList = await KeToanDanhMucKhoanChi.findAll({
      where: { kich_hoat: true },
      order: [['thu_tu_hien_thi', 'ASC']],
    });
    const snapshotCauHinh = dmList.map((d) => ({
      id: d.id,
      ma_khoan_chi: d.ma_khoan_chi,
      ten_khoan_chi: d.ten_khoan_chi,
      loai_tinh: d.loai_tinh,
      don_gia_mac_dinh: parseFloat(d.don_gia_mac_dinh) || 0,
      tan_suat: d.tan_suat,
      thu_tu_hien_thi: d.thu_tu_hien_thi,
    }));

    // 2. Tính toán và lưu snapshot dữ liệu người nhận và chi tiết khoản chi vào CSDL
    const { sortedStaff } = await fetchAttendanceSourceData(tuNgayChot, denNgayChot);
    let totalAll = 0;

    for (let idx = 0; idx < sortedStaff.length; idx++) {
      const p = sortedStaff[idx];
      let [nn] = await KeToanNguoiNhan.findOrCreate({
        where: { ky_id: ky.id, ho_ten: p.ho_ten },
        defaults: {
          ky_id: ky.id,
          stt: idx + 1,
          nhan_su_id: p.nhan_su_id || null,
          ma_dinh_danh: p.nhan_su_id ? `GV${p.nhan_su_id}` : `EXT_${idx + 1}`,
          ho_ten: p.ho_ten,
          so_tai_khoan: p.so_tai_khoan || '',
          tong_tien: 0,
          da_thanh_toan: 0,
          trang_thai_tt: 'chua_chi',
        },
      });

      let rowTotal = 0;
      for (const col of dmList) {
        const isStrictLocked = ['truc_phong', 'y_te', 'bt_an', 'thiet_bi', 'gs_an'].includes(col.ma_khoan_chi);
        const cleanName = p.ho_ten.trim().toLowerCase();
        const isHuynhDucVinhGs = (cleanName.includes('huỳnh đức vịnh') || cleanName.includes('đức vịnh')) && col.ma_khoan_chi === 'gs_ban_tru';

        let amt = p.amounts[col.ma_khoan_chi] || 0;
        let soNgay = col.ma_khoan_chi === 'truc_phong' ? p.counts.so_ca_ngu : (col.ma_khoan_chi === 'bt_an' ? p.counts.so_ca_an : p.counts.so_ngay_ban_tru);
        let donGia = col.don_gia_mac_dinh;
        let tienNhap = 0;
        let tienDieuChinh = 0;
        let lyDoDieuChinh = '';
        let tanSuat = col.tan_suat || 'dinh_ky';

        const existingCt = await KeToanChiTietKhoanChi.findOne({
          where: { nguoi_nhan_id: nn.id, ma_khoan_chi: col.ma_khoan_chi },
        });

        if (!isStrictLocked && existingCt) {
          tienNhap = parseFloat(existingCt.tien_nhap) || 0;
          tienDieuChinh = parseFloat(existingCt.tien_dieu_chinh) || 0;
          lyDoDieuChinh = existingCt.ly_do_dieu_chinh || '';
          tanSuat = existingCt.tan_suat || tanSuat;

          if (isHuynhDucVinhGs || existingCt.nguon_cap_nhat === 'manual' || tienDieuChinh !== 0 || (existingCt.thanh_tien !== null && existingCt.thanh_tien !== undefined)) {
            amt = parseFloat(existingCt.thanh_tien) !== undefined ? parseFloat(existingCt.thanh_tien) : amt;
            soNgay = parseFloat(existingCt.so_ngay) !== undefined && existingCt.so_ngay !== null ? parseFloat(existingCt.so_ngay) : soNgay;
            donGia = parseFloat(existingCt.don_gia) !== undefined && existingCt.don_gia !== null ? parseFloat(existingCt.don_gia) : donGia;
          }
        }

        rowTotal += amt;

        if (existingCt) {
          await existingCt.update({
            so_ngay: soNgay,
            don_gia: donGia,
            tien_nguon: p.amounts[col.ma_khoan_chi] || 0,
            tien_nhap: tienNhap,
            tien_dieu_chinh: tienDieuChinh,
            ly_do_dieu_chinh: lyDoDieuChinh,
            thanh_tien: amt,
            tan_suat: tanSuat,
            ghi_chu: existingCt.ghi_chu || '',
          });
        } else {
          await KeToanChiTietKhoanChi.create({
            nguoi_nhan_id: nn.id,
            ky_id: ky.id,
            khoan_chi_id: col.id || null,
            ma_khoan_chi: col.ma_khoan_chi,
            ten_khoan_chi: col.ten_khoan_chi,
            loai_tinh: col.loai_tinh,
            so_ngay: soNgay,
            don_gia: donGia,
            tien_nguon: p.amounts[col.ma_khoan_chi] || 0,
            tien_nhap: tienNhap,
            tien_dieu_chinh: tienDieuChinh,
            ly_do_dieu_chinh: lyDoDieuChinh,
            thanh_tien: amt,
            tan_suat: tanSuat,
            ghi_chu: existingCt?.ghi_chu || '',
          });
        }
      }

      await nn.update({
        stt: idx + 1,
        tong_tien: rowTotal,
        so_tai_khoan: nn.so_tai_khoan || p.so_tai_khoan || '',
        ghi_chu: nn.ghi_chu || '',
      });
      totalAll += rowTotal;
    }

    const user = req.user || {};
    await ky.update({
      trang_thai: 'da_chot',
      ngay_chot: new Date(),
      nguoi_chot_id: user.id || null,
      nguoi_chot_ten: user.fullname || user.username || 'Kế toán',
      tong_so_nguoi: sortedStaff.length,
      tong_tien: totalAll,
      snapshot_cau_hinh: snapshotCauHinh,
    });

    // 3. ĐỒNG BỘ CHỐT KỲ TRỰC PHẦN BÁO CÁO (KyTrucGV)
    let kyTruc;
    try {
      kyTruc = await KyTrucGV.findOne({
        where: {
          [Op.or]: [
            { tu_ngay: ky.tu_ngay },
            { trang_thai: 'dang_dien_ra' },
          ],
        },
        order: [['id', 'DESC']],
      });
      if (kyTruc && kyTruc.trang_thai === 'dang_dien_ra') {
        await kyTruc.update({
          tu_ngay: tuNgayChot,
          den_ngay: denNgayChot,
          trang_thai: 'da_chot',
          ngay_chot: new Date(),
          nguoi_chot_id: user.id || null,
          nguoi_chot_ten: user.fullname || user.username || 'Kế toán',
          tong_tien: totalAll,
        });
      }
    } catch (syncErr) {
      console.warn('Lỗi đồng bộ KyTrucGV khi chốt kỳ kế toán:', syncErr.message);
    }

    // 4. TỰ ĐỘNG TẠO KỲ MỚI BẮT ĐẦU TỪ NGÀY MỚI (denNgayChot + 1), KHÔNG CHỒNG LÊN KỲ TRƯỚC
    const nextStart = addDays(denNgayChot, 1);
    let nextKy = null;
    try {
      const existingNextKy = await KeToanKyTongHop.findOne({
        where: { tu_ngay: nextStart },
      });
      if (!existingNextKy) {
        const totalCount = await KeToanKyTongHop.count();
        const nextKyName = `TH Kỳ ${totalCount + 1}`;
        nextKy = await KeToanKyTongHop.create({
          ten_ky: nextKyName,
          tu_ngay: nextStart,
          den_ngay: todayVN > nextStart ? todayVN : nextStart,
          ngay_lap: todayVN,
          trang_thai: 'dang_dien_ra',
          ghi_chu: `Kỳ kế tiếp sau khi chốt ${ky.ten_ky} (bắt đầu từ ${nextStart})`,
          created_by_id: user.id || null,
          created_by_name: user.fullname || user.username || 'Kế toán',
        });
      }

      const existingNextKyTruc = await KyTrucGV.findOne({
        where: { tu_ngay: nextStart },
      });
      if (!existingNextKyTruc) {
        const kyTrucCount = await KyTrucGV.count();
        await KyTrucGV.create({
          ten_ky: `Kỳ ${kyTrucCount + 1}`,
          tu_ngay: nextStart,
          den_ngay: todayVN > nextStart ? todayVN : null,
          trang_thai: 'dang_dien_ra',
          nam_hoc: kyTruc?.nam_hoc || '2026-2027',
        });
      }
    } catch (createErr) {
      console.warn('Lỗi tự động tạo kỳ mới sau khi chốt:', createErr.message);
    }

    await logThietLap(
      'CHOT_KY',
      `Chốt kỳ tổng hợp "${ky.ten_ky}" (Khoảng ngày: ${ky.tu_ngay} → ${denNgayChot}, Tổng số người: ${sortedStaff.length}, Tổng tiền: ${totalAll.toLocaleString('vi-VN')}đ) - Đồng bộ phần Báo cáo. Đã tự động tạo kỳ mới bắt đầu từ ${nextStart}.`,
      req
    );

    return res.json({
      ok: true,
      message: `Đã chốt kỳ thành công đến ngày ${denNgayChot}. Kỳ mới đã được tự động tạo bắt đầu từ ngày ${nextStart} và đồng bộ với Báo cáo.`,
      data: ky,
      new_ky: nextKy,
      next_start: nextStart,
    });
  } catch (err) {
    console.error('Lỗi chốt kỳ:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
};

router.post('/ky-tong-hop/:id/chot-ky', ketoanOrAdmin, handleChotKy);
router.post('/ky-tong-hop/:id/chot', ketoanOrAdmin, handleChotKy);

// POST /api/ketoan/ky-tong-hop/:id/mo-lai & /mo-lai-ky
const handleMoLaiKy = async (req, res) => {
  try {
    const ky = await KeToanKyTongHop.findByPk(req.params.id);
    if (!ky) return res.status(404).json({ ok: false, error: 'Không tìm thấy kỳ tổng hợp' });
    if (ky.trang_thai !== 'da_chot') {
      return res.status(400).json({ ok: false, error: 'Kỳ này chưa bị khóa chốt' });
    }

    const { ly_do } = req.body;
    const note = ly_do && ly_do.trim() ? ly_do.trim() : 'Mở lại kỳ để chỉnh sửa số liệu';

    await ky.update({
      trang_thai: 'dang_dien_ra',
      ngay_chot: null,
      nguoi_chot_id: null,
      nguoi_chot_ten: null,
      ghi_chu: ky.ghi_chu ? `${ky.ghi_chu}\n[Mở lại: ${note}]` : `[Mở lại: ${note}]`,
    });

    // ĐỒNG BỘ MỞ LẠI KỲ TRỰC PHẦN BÁO CÁO (KyTrucGV)
    try {
      const kyTruc = await KyTrucGV.findOne({
        where: {
          [Op.or]: [
            { tu_ngay: ky.tu_ngay },
            { id: ky.id },
          ],
        },
        order: [['id', 'DESC']],
      });
      if (kyTruc) {
        await kyTruc.update({
          trang_thai: 'dang_dien_ra',
          ngay_chot: null,
          nguoi_chot_id: null,
          nguoi_chot_ten: null,
        });
      }
    } catch (syncErr) {
      console.warn('Lỗi đồng bộ mở lại KyTrucGV:', syncErr.message);
    }

    await logThietLap('MO_LAI_KY', `Mở lại kỳ tổng hợp "${ky.ten_ky}" sang trạng thái Đang diễn ra. Lý do: ${note}`, req);

    return res.json({
      ok: true,
      message: 'Đã mở lại kỳ tổng hợp thành công và đồng bộ với phần Báo cáo.',
      data: ky,
    });
  } catch (err) {
    console.error('Lỗi mở lại kỳ:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
};

router.post('/ky-tong-hop/:id/mo-lai-ky', ketoanOrAdmin, handleMoLaiKy);
router.post('/ky-tong-hop/:id/mo-lai', ketoanOrAdmin, handleMoLaiKy);

// POST /api/ketoan/ky-tong-hop/:id/thanh-toan
// Ghi nhận thanh toán: thanh toán toàn bộ cho danh sách người nhận hoặc thanh toán một phần
router.post('/ky-tong-hop/:id/thanh-toan', ketoanOrAdmin, async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const ky = await KeToanKyTongHop.findByPk(req.params.id, { transaction: t });
    if (!ky) {
      await t.rollback();
      return res.status(404).json({ ok: false, error: 'Không tìm thấy kỳ tổng hợp' });
    }

    const { payments, ngay_chi, hinh_thuc, so_chung_tu, ghi_chu } = req.body;
    if (!Array.isArray(payments) || payments.length === 0) {
      await t.rollback();
      return res.status(400).json({ ok: false, error: 'Vui lòng chọn ít nhất một người nhận để thanh toán' });
    }

    const user = req.user || {};
    const paymentDate = ngay_chi || new Date().toISOString().split('T')[0];
    let totalPaidThisBatch = 0;

    for (const p of payments) {
      const nn = await KeToanNguoiNhan.findOne({
        where: { id: p.nguoi_nhan_id, ky_id: ky.id },
        transaction: t,
      });
      if (!nn) continue;

      const tongTien = parseFloat(nn.tong_tien) || 0;
      const daChi = parseFloat(nn.da_thanh_toan) || 0;
      const conLai = Math.max(0, tongTien - daChi);

      const amountToPay = p.so_tien !== undefined ? parseFloat(p.so_tien) : conLai;
      if (amountToPay <= 0) continue;

      // Kiểm soát không cho thanh toán vượt số tiền còn lại
      if (amountToPay > conLai + 0.01) {
        await t.rollback();
        return res.status(400).json({
          ok: false,
          error: `Số tiền chi cho ${nn.ho_ten} (${amountToPay.toLocaleString('vi-VN')}đ) vượt quá số tiền còn phải chi (${conLai.toLocaleString('vi-VN')}đ)`,
        });
      }

      await KeToanThanhToanChiTiet.create(
        {
          ky_id: ky.id,
          nguoi_nhan_id: nn.id,
          so_tien: amountToPay,
          ngay_chi: paymentDate,
          hinh_thuc: hinh_thuc || 'chuyen_khoan',
          so_chung_tu: so_chung_tu ? so_chung_tu.trim() : (p.so_chung_tu || ''),
          nguoi_thao_tac_id: user.id || null,
          nguoi_thao_tac_ten: user.fullname || user.username || 'Kế toán',
          ghi_chu: ghi_chu || p.ghi_chu || '',
        },
        { transaction: t }
      );

      const newDaChi = daChi + amountToPay;
      const newTrangThai = newDaChi >= tongTien ? 'da_chi_du' : 'chi_mot_phan';
      await nn.update(
        {
          da_thanh_toan: newDaChi,
          trang_thai_tt: newTrangThai,
        },
        { transaction: t }
      );

      totalPaidThisBatch += amountToPay;
    }

    await recalculateKyTotals(ky.id, t);
    await t.commit();

    await logThietLap(
      'THANH_TOAN',
      `Thanh toán ${totalPaidThisBatch.toLocaleString('vi-VN')}đ cho ${payments.length} người nhận trong kỳ "${ky.ten_ky}" (Số chứng từ: ${so_chung_tu || '—'})`,
      req
    );

    return res.json({
      ok: true,
      message: `Đã ghi nhận thanh toán thành công cho ${payments.length} người nhận với tổng số tiền ${totalPaidThisBatch.toLocaleString('vi-VN')}đ.`,
    });
  } catch (err) {
    await t.rollback();
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. XUẤT BÁO CÁO EXCEL CHUẨN SHEET 1
// ─────────────────────────────────────────────────────────────────────────────

// Helper đọc số thành chữ tiếng Việt
function docSoThanhChu(soTien) {
  if (!soTien || isNaN(soTien)) return 'Không đồng';
  const ChuSo = ['không', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín'];
  const Tien = ['', 'nghìn', 'triệu', 'tỷ', 'nghìn tỷ', 'triệu tỷ'];

  let str = Math.round(Number(soTien)).toString();
  let len = str.length;
  if (len === 0 || str === '0') return 'Không đồng';

  function docSo3ChuSo(baso) {
    let tram = Math.floor(baso / 100);
    let chuc = Math.floor((baso % 100) / 10);
    let donvi = baso % 10;
    let ketqua = '';

    if (tram !== 0) {
      ketqua += ChuSo[tram] + ' trăm ';
      if (chuc === 0 && donvi !== 0) ketqua += 'lẻ ';
    }
    if (chuc !== 0 && chuc !== 1) {
      ketqua += ChuSo[chuc] + ' mươi';
      if (chuc === 0 && donvi !== 0) ketqua += ' linh ';
    }
    if (chuc === 1) ketqua += 'mười';

    switch (donvi) {
      case 1:
        ketqua += chuc > 1 ? ' mốt' : ' một';
        break;
      case 5:
        ketqua += chuc > 0 ? ' lăm' : ' năm';
        break;
      default:
        if (donvi !== 0) ketqua += ' ' + ChuSo[donvi];
        break;
    }
    return ketqua.trim();
  }

  let i = 0;
  let result = '';
  while (len > 0) {
    let n = len > 3 ? 3 : len;
    let baso = parseInt(str.substring(len - n, len), 10);
    len -= n;
    if (baso > 0) {
      let s = docSo3ChuSo(baso);
      result = s + ' ' + Tien[i] + ' ' + result;
    }
    i++;
  }
  result = result.trim();
  return result.charAt(0).toUpperCase() + result.slice(1) + ' đồng.';
}

// GET /api/ketoan/ky-tong-hop/:id/export-excel
router.get('/ky-tong-hop/:id/export-excel', ketoanOrAdmin, async (req, res) => {
  try {
    const ky = await KeToanKyTongHop.findByPk(req.params.id);
    if (!ky) return res.status(404).json({ ok: false, error: 'Không tìm thấy kỳ tổng hợp' });

    // Xác định cấu hình danh mục cột khoản chi
    const dm = await KeToanDanhMucKhoanChi.findAll({
      where: { kich_hoat: true },
      order: [['thu_tu_hien_thi', 'ASC'], ['id', 'ASC']],
    });
    const danhMucColumns = dm.map((c) => ({
      id: c.id,
      ma_khoan_chi: c.ma_khoan_chi,
      ten_khoan_chi: c.ten_khoan_chi,
      loai_tinh: c.loai_tinh,
      don_gia_mac_dinh: parseFloat(c.don_gia_mac_dinh) || 0,
      tan_suat: c.tan_suat,
      thu_tu_hien_thi: c.thu_tu_hien_thi,
    }));

    let exportRows = [];
    if (ky.trang_thai === 'da_chot') {
      const nguoiNhans = await KeToanNguoiNhan.findAll({
        where: { ky_id: ky.id },
        order: [['stt', 'ASC'], ['ho_ten', 'ASC']],
        include: [{ model: KeToanChiTietKhoanChi, as: 'chi_tiet_khoan_chi' }],
      });
      exportRows = nguoiNhans.map((nn, idx) => {
        const ctMap = {};
        (nn.chi_tiet_khoan_chi || []).forEach((c) => {
          ctMap[c.ma_khoan_chi] = parseFloat(c.thanh_tien) || 0;
        });
        const stk = (nn.so_tai_khoan && String(nn.so_tai_khoan).trim() !== '-' && String(nn.so_tai_khoan).trim() !== '—') ? String(nn.so_tai_khoan).trim() : '';
        const gc = (nn.ghi_chu && String(nn.ghi_chu).trim() !== '-' && String(nn.ghi_chu).trim() !== '—') ? String(nn.ghi_chu).trim() : '';
        return {
          stt: idx + 1,
          ho_ten: nn.ho_ten,
          ctMap,
          rowTotal: parseFloat(nn.tong_tien) || 0,
          so_tai_khoan: stk,
          ghi_chu: gc,
        };
      });
    } else {
      // Khi chưa chốt: Xuất dữ liệu đồng bộ tức thì trực tiếp từ CSDL Chấm công (nhanh, chính xác 100%)
      const { sortedStaff } = await fetchAttendanceSourceData(ky.tu_ngay, ky.den_ngay);
      const existingNguoiNhans = await KeToanNguoiNhan.findAll({ where: { ky_id: ky.id } });
      const nnByName = {};
      existingNguoiNhans.forEach((nn) => {
        nnByName[nn.ho_ten.trim().toLowerCase()] = nn;
      });

      exportRows = sortedStaff.map((p, idx) => {
        const clean = p.ho_ten.trim().toLowerCase();
        const existingNn = nnByName[clean];
        const ctMap = {};
        let rowTotal = 0;
        danhMucColumns.forEach((col) => {
          const val = p.amounts[col.ma_khoan_chi] || 0;
          ctMap[col.ma_khoan_chi] = val;
          rowTotal += val;
        });
        const rawStk = existingNn?.so_tai_khoan || p.so_tai_khoan || '';
        const stk = (rawStk && String(rawStk).trim() !== '-' && String(rawStk).trim() !== '—') ? String(rawStk).trim() : '';
        const rawGc = existingNn?.ghi_chu || '';
        const gc = (rawGc && String(rawGc).trim() !== '-' && String(rawGc).trim() !== '—') ? String(rawGc).trim() : '';
        return {
          stt: idx + 1,
          ho_ten: p.ho_ten,
          ctMap,
          rowTotal,
          so_tai_khoan: stk,
          ghi_chu: gc,
        };
      });
    }

    const cauHinh = await CauHinhHeThong.findOne();
    const tenTruong = cauHinh?.ten_truong || 'THPT LÊ THỊ HỒNG GẤM';
    const quanLyUser = await StaffUser.findOne({ where: { role: 'quan_ly', is_active: true } });
    const keToanUser = await StaffUser.findOne({ where: { role: 'ke_toan', is_active: true } });

    const wb = new ExcelJS.Workbook();
    wb.creator = 'QL Bán Trú';
    wb.lastModifiedBy = req.user?.fullname || 'Kế toán';
    wb.created = new Date();
    const cleanSheetName = ky.ten_ky ? ky.ten_ky.substring(0, 30).replace(/[:\\\/\?\*\[\]]/g, '') : 'TH T012026';
    const ws = wb.addWorksheet(cleanSheetName, {
      pageSetup: { orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0, blackAndWhite: true },
    });

    // 1. Tiêu đề đơn vị & Quốc hiệu
    ws.addRow(['SỞ GIÁO DỤC VÀ ĐÀO TẠO TP. HỒ CHÍ MINH', '', '', '', '', '', '', '', '', 'CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM']);
    ws.addRow([`TRƯỜNG ${tenTruong.toUpperCase()}`, '', '', '', '', '', '', '', '', 'Độc lập - Tự do - Hạnh phúc']);
    ws.addRow([]);
    ws.addRow([`DANH SÁCH CHI TRẢ TIỀN CÔNG TÁC BÁN TRÚ - ${ky.ten_ky.toUpperCase()}`]);
    ws.addRow([`(Từ ngày ${ky.tu_ngay} đến ngày ${ky.den_ngay})`]);
    ws.addRow([]);

    const titleRow1 = ws.getRow(1);
    titleRow1.font = { name: 'Times New Roman', size: 11, bold: true };
    const titleRow2 = ws.getRow(2);
    titleRow2.font = { name: 'Times New Roman', size: 11, bold: true };
    const mainTitle = ws.getRow(4);
    mainTitle.font = { name: 'Times New Roman', size: 15, bold: true, color: { argb: 'FF1E3A8A' } };
    const subTitle = ws.getRow(5);
    subTitle.font = { name: 'Times New Roman', size: 11, italic: true };

    const totalColCount = 2 + danhMucColumns.length + 3;

    function getExcelColLetter(colIdx) {
      let letter = '';
      while (colIdx > 0) {
        const rem = (colIdx - 1) % 26;
        letter = String.fromCharCode(65 + rem) + letter;
        colIdx = Math.floor((colIdx - 1) / 26);
      }
      return letter;
    }

    const firstCatColLetter = getExcelColLetter(3);
    const lastCatColLetter = getExcelColLetter(2 + danhMucColumns.length);
    const totalColLetter = getExcelColLetter(2 + danhMucColumns.length + 1);

    // 2. Header bảng
    const headerValues = ['STT', 'HỌ VÀ TÊN'];
    danhMucColumns.forEach((c) => headerValues.push(c.ten_khoan_chi));
    headerValues.push('TỔNG CỘNG', 'TÀI KHOẢN', 'GHI CHÚ');

    const headerRow = ws.addRow(headerValues);
    headerRow.height = 34;
    headerRow.eachCell((cell) => {
      cell.font = { name: 'Times New Roman', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } };
      cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
      cell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' },
      };
    });

    const startDataRowIndex = headerRow.number + 1;
    const endDataRowIndex = startDataRowIndex + exportRows.length - 1;
    const colSums = new Array(danhMucColumns.length).fill(0);
    let grandTotal = 0;

    // 3. Dòng dữ liệu người nhận
    exportRows.forEach((rowItem, rIdx) => {
      const rNum = startDataRowIndex + rIdx;
      const rowValues = [rowItem.stt, rowItem.ho_ten];
      danhMucColumns.forEach((col, cIdx) => {
        const val = rowItem.ctMap[col.ma_khoan_chi] || 0;
        rowValues.push(val > 0 ? val : null);
        colSums[cIdx] += val;
      });

      grandTotal += rowItem.rowTotal;
      rowValues.push({
        formula: `SUM(${firstCatColLetter}${rNum}:${lastCatColLetter}${rNum})`,
        result: rowItem.rowTotal > 0 ? rowItem.rowTotal : null,
      });
      const cleanStk = (rowItem.so_tai_khoan && rowItem.so_tai_khoan !== '-' && rowItem.so_tai_khoan !== '—') ? String(rowItem.so_tai_khoan) : '';
      const cleanGhiChu = (rowItem.ghi_chu && rowItem.ghi_chu !== '-' && rowItem.ghi_chu !== '—') ? String(rowItem.ghi_chu) : '';
      rowValues.push(cleanStk);
      rowValues.push(cleanGhiChu);

      const row = ws.addRow(rowValues);
      row.height = 24;

      row.eachCell((cell, colNum) => {
        cell.font = { name: 'Times New Roman', size: 11 };
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFCCCCCC' } },
          left: { style: 'thin', color: { argb: 'FFCCCCCC' } },
          bottom: { style: 'thin', color: { argb: 'FFCCCCCC' } },
          right: { style: 'thin', color: { argb: 'FFCCCCCC' } },
        };

        if (colNum === 1) {
          cell.alignment = { vertical: 'middle', horizontal: 'center' };
        } else if (colNum === 2) {
          cell.alignment = { vertical: 'middle', horizontal: 'left' };
        } else if (colNum >= 3 && colNum <= 2 + danhMucColumns.length + 1) {
          cell.alignment = { vertical: 'middle', horizontal: 'right' };
          cell.numFmt = '#,##0;-#,##0;""';
        } else {
          cell.alignment = { vertical: 'middle', horizontal: 'left' };
          if (colNum === totalColCount - 1) {
            cell.numFmt = '@';
          }
        }
      });
    });

    // 4. Dòng tổng cộng
    const totalRowValues = ['TỔNG CỘNG', ''];
    danhMucColumns.forEach((_, cIdx) => {
      const cLetter = getExcelColLetter(3 + cIdx);
      totalRowValues.push({
        formula: `SUM(${cLetter}${startDataRowIndex}:${cLetter}${endDataRowIndex})`,
        result: colSums[cIdx] > 0 ? colSums[cIdx] : null,
      });
    });
    totalRowValues.push(
      {
        formula: `SUM(${totalColLetter}${startDataRowIndex}:${totalColLetter}${endDataRowIndex})`,
        result: grandTotal > 0 ? grandTotal : null,
      },
      '',
      ''
    );

    const totalRow = ws.addRow(totalRowValues);
    totalRow.height = 28;
    totalRow.eachCell((cell, colNum) => {
      cell.font = { name: 'Times New Roman', size: 11, bold: true, color: { argb: 'FF000000' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } };
      cell.border = {
        top: { style: 'thin' },
        bottom: { style: 'double' },
        left: { style: 'thin', color: { argb: 'FFCCCCCC' } },
        right: { style: 'thin', color: { argb: 'FFCCCCCC' } },
      };
      if (colNum >= 3 && colNum <= 2 + danhMucColumns.length + 1) {
        cell.alignment = { vertical: 'middle', horizontal: 'right' };
        cell.numFmt = '#,##0;-#,##0;""';
      } else {
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
      }
    });

    // Merge STT và Họ tên cho dòng Tổng cộng
    ws.mergeCells(`A${totalRow.number}:B${totalRow.number}`);

    // 5. Số tiền bằng chữ
    ws.addRow([]);
    const inWordsRow = ws.addRow([`Số tiền bằng chữ: ${docSoThanhChu(grandTotal)}`]);
    inWordsRow.font = { name: 'Times New Roman', size: 11, bold: true, italic: true };

    // 6. Chữ ký chuẩn theo mẫu: Người lập (trái) - GIÁM ĐỐC (phải)
    ws.addRow([]);
    const today = new Date();
    const dayStr = String(today.getDate()).padStart(2, '0');
    const monthStr = String(today.getMonth() + 1).padStart(2, '0');
    const yearStr = today.getFullYear();
    const dateStr = `Thành phố Hồ Chí Minh, Ngày ${dayStr} tháng ${monthStr} năm ${yearStr}`;

    const dateRowValues = new Array(totalColCount).fill('');
    const dateStartCol = Math.max(1, totalColCount - 4);
    dateRowValues[dateStartCol - 1] = dateStr;
    const dateRow = ws.addRow(dateRowValues);
    dateRow.font = { name: 'Times New Roman', size: 11, italic: true };
    ws.mergeCells(dateRow.number, dateStartCol, dateRow.number, totalColCount);
    dateRow.getCell(dateStartCol).alignment = { vertical: 'middle', horizontal: 'center' };

    const signTitleRowValues = new Array(totalColCount).fill('');
    signTitleRowValues[1] = 'Người lập';
    const gDocStartCol = Math.max(1, totalColCount - 1);
    signTitleRowValues[gDocStartCol - 1] = 'GIÁM ĐỐC';
    const signTitleRow = ws.addRow(signTitleRowValues);
    signTitleRow.font = { name: 'Times New Roman', size: 11, bold: true };
    signTitleRow.height = 22;
    signTitleRow.getCell(2).alignment = { vertical: 'middle', horizontal: 'center' };
    ws.mergeCells(signTitleRow.number, gDocStartCol, signTitleRow.number, totalColCount);
    signTitleRow.getCell(gDocStartCol).alignment = { vertical: 'middle', horizontal: 'center' };

    ws.addRow([]);
    ws.addRow([]);
    ws.addRow([]);

    const signNameRowValues = new Array(totalColCount).fill('');
    signNameRowValues[1] = ky.created_by_name || keToanUser?.fullname || 'Trần Thị Hồng Cẩm';
    signNameRowValues[gDocStartCol - 1] = quanLyUser?.fullname || cauHinh?.nguoi_phu_trach || 'Vũ Quốc Phong';
    const signNameRow = ws.addRow(signNameRowValues);
    signNameRow.font = { name: 'Times New Roman', size: 11, bold: true };
    signNameRow.height = 22;
    signNameRow.getCell(2).alignment = { vertical: 'middle', horizontal: 'center' };
    ws.mergeCells(signNameRow.number, gDocStartCol, signNameRow.number, totalColCount);
    signNameRow.getCell(gDocStartCol).alignment = { vertical: 'middle', horizontal: 'center' };

    // Widths
    ws.columns = [
      { width: 6 },
      { width: 26 },
      ...danhMucColumns.map(() => ({ width: 17 })),
      { width: 19 },
      { width: 18 },
      { width: 22 },
    ];

    const filename = `Bang_Tong_Hop_Chi_Tra_Ban_Tru_${ky.id}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    await wb.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error('Lỗi xuất Excel:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
