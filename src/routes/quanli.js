const express = require('express');
const router = express.Router();
const multer = require('multer');
const { parse } = require('csv-parse/sync');
const { Op } = require('sequelize');
const {
  HocSinh, GiaoVien, Phong, MuaVatDung, PhanBoVatDung,
  CauHinhGia, CauHinhHeThong, PhanCongTrucGV, StaffUser, sequelize
} = require('../models');
const { loginRequired, attachUser, roleRequired } = require('../middleware/auth');

router.use(attachUser);
const upload = multer({ storage: multer.memoryStorage() });

/** GET /api/nguoidung/quanly/ - List users with manager role */
router.get('/api/nguoidung/quanly/', loginRequired, roleRequired('admin', 'quan_ly'), async (req, res) => {
  try {
    const users = await StaffUser.findAll({
      where: { role: 'quan_ly', is_active: true },
      attributes: ['id', 'username', 'fullname', 'role'],
      order: [['fullname', 'ASC']]
    });
    return res.json({ ok: true, users });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════
// HỌC SINH
// ═══════════════════════════════════════════════════════════════════

/** GET /api/hocsinh/ - Danh sách toàn bộ học sinh */
router.get('/api/hocsinh/', loginRequired, roleRequired('admin', 'quan_ly'), async (req, res) => {
  try {
    const list = await HocSinh.findAll({
      include: [
        { association: 'phong_an', attributes: ['ma_phong', 'loai_phong'] },
        { association: 'phong_ngu', attributes: ['ma_phong', 'loai_phong', 'gioi_tinh'] },
      ],
      order: [['lop', 'ASC'], ['ho_ten', 'ASC']],
    });
    return res.json({ ok: true, hocsinh: list });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

/** POST /api/hocsinh/save/ - Tạo / cập nhật học sinh */
router.post('/api/hocsinh/save/', loginRequired, roleRequired('admin'), async (req, res) => {
  try {
    const { id, ho_ten, lop, gioi_tinh, ma_phong_an, ma_phong_ngu, dang_hoc, ghi_chu } = req.body;

    // Validate phòng
    if (ma_phong_an) {
      const pan = await Phong.findByPk(ma_phong_an);
      if (!pan || pan.loai_phong !== 0) return res.status(400).json({ ok: false, error: 'Phòng ăn không hợp lệ' });
    }
    if (ma_phong_ngu) {
      const pngu = await Phong.findByPk(ma_phong_ngu);
      if (!pngu || pngu.loai_phong !== 1) return res.status(400).json({ ok: false, error: 'Phòng ngủ không hợp lệ' });
      if (pngu.gioi_tinh !== parseInt(gioi_tinh)) return res.status(400).json({ ok: false, error: 'Giới tính không khớp phòng ngủ' });
      // Kiểm tra sức chứa
      const count = await HocSinh.count({ where: { ma_phong_ngu_id: ma_phong_ngu, ...(id ? { id: { [Op.ne]: id } } : {}) } });
      if (count >= pngu.suc_chua) return res.status(400).json({ ok: false, error: `Phòng ngủ đã đủ ${pngu.suc_chua} học sinh` });
    }

    const data = {
      ho_ten, lop, gioi_tinh: parseInt(gioi_tinh),
      ma_phong_an_id: ma_phong_an || null,
      ma_phong_ngu_id: ma_phong_ngu || null,
      dang_hoc: dang_hoc !== undefined ? dang_hoc : true,
      ghi_chu: ghi_chu || null,
    };

    if (id) {
      await HocSinh.update(data, { where: { id } });
      return res.json({ ok: true, message: 'Cập nhật học sinh thành công' });
    } else {
      const hs = await HocSinh.create(data);
      return res.json({ ok: true, message: 'Thêm học sinh thành công', id: hs.id });
    }
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

/** POST /api/hocsinh/:pk/delete/ */
router.post('/api/hocsinh/:pk/delete/', loginRequired, roleRequired('admin'), async (req, res) => {
  try {
    const hs = await HocSinh.findByPk(req.params.pk);
    if (!hs) return res.status(404).json({ ok: false, error: 'Không tìm thấy học sinh' });
    await hs.destroy();
    return res.json({ ok: true, message: 'Đã xóa học sinh' });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

/** POST /api/hocsinh/import/ - Import CSV */
router.post('/api/hocsinh/import/', loginRequired, roleRequired('admin'), upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ ok: false, error: 'Chưa có file CSV. Vui lòng chọn file trước khi import.' });

    const content = req.file.buffer.toString('utf8');
    const rows = parse(content, { columns: false, skip_empty_lines: true, trim: true });

    // Tải trước danh sách phòng hợp lệ để kiểm tra mà không cần query mỗi dòng
    const allPhong = await Phong.findAll({ attributes: ['ma_phong', 'loai_phong'] });
    const phongAnSet  = new Set(allPhong.filter(p => p.loai_phong === 0).map(p => p.ma_phong));
    const phongNguSet = new Set(allPhong.filter(p => p.loai_phong === 1).map(p => p.ma_phong));

    let success = 0;
    const errors = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 1;

      // Bỏ qua dòng header
      if (i === 0 && (String(row[0]).toLowerCase() === 'stt' || isNaN(Number(row[0])))) continue;

      const [, ma_so_bt, ho_ten, gt_raw, lop, phong_ngu_raw, phong_an_raw, ghi_chu] = row;

      // Validate bắt buộc
      if (!ma_so_bt || !String(ma_so_bt).trim()) {
        errors.push({ row: rowNum, msg: 'Thiếu mã bán trú — bỏ qua dòng này' });
        continue;
      }
      if (!ho_ten || !String(ho_ten).trim()) {
        errors.push({ row: rowNum, msg: `Mã BT ${ma_so_bt}: Thiếu họ tên học sinh — bỏ qua` });
        continue;
      }
      if (!lop || !String(lop).trim()) {
        errors.push({ row: rowNum, msg: `Mã BT ${ma_so_bt}: Thiếu lớp — bỏ qua` });
        continue;
      }

      // Validate mã BT phải là số nguyên dương
      const idHS = parseInt(ma_so_bt);
      if (!idHS || idHS <= 0) {
        errors.push({ row: rowNum, msg: `Mã BT "${ma_so_bt}" không hợp lệ (phải là số nguyên dương) — bỏ qua` });
        continue;
      }

      // Kiểm tra trùng mã BT
      const existing = await HocSinh.findOne({ where: { id: idHS } });
      if (existing) {
        errors.push({ row: rowNum, msg: `Mã BT ${idHS} (${existing.ho_ten}) đã tồn tại trong hệ thống` });
        continue;
      }

      // Giới tính
      let gioi_tinh = 0;
      const gt = String(gt_raw || '').trim().toLowerCase();
      if (['nữ', 'nu', '1', 'f', 'female'].includes(gt)) gioi_tinh = 1;

      // Validate phòng — nếu không tồn tại thì null, ghi chú cảnh báo
      const pAnRaw  = String(phong_an_raw  || '').trim();
      const pNguRaw = String(phong_ngu_raw || '').trim();

      let ma_phong_an_id  = null;
      let ma_phong_ngu_id = null;
      const warns = [];

      if (pAnRaw) {
        if (phongAnSet.has(pAnRaw)) {
          ma_phong_an_id = pAnRaw;
        } else {
          warns.push(`Phòng ăn "${pAnRaw}" không tồn tại trong hệ thống — để trống`);
        }
      }
      if (pNguRaw) {
        if (phongNguSet.has(pNguRaw)) {
          ma_phong_ngu_id = pNguRaw;
        } else {
          warns.push(`Phòng ngủ "${pNguRaw}" không tồn tại trong hệ thống — để trống`);
        }
      }

      // Thêm vào DB — dùng ID từ CSV làm primary key
      try {
        await HocSinh.create({
          id:              idHS,
          ho_ten:          String(ho_ten).trim(),
          gioi_tinh,
          lop:             String(lop).trim().toUpperCase(),
          ma_phong_an_id,
          ma_phong_ngu_id,
          ghi_chu:         ghi_chu ? String(ghi_chu).trim() : null,
          dang_hoc:        true,
        });

        success++;
        // Ghi cảnh báo phòng (không phải lỗi, chỉ thông báo)
        if (warns.length > 0) {
          errors.push({ row: rowNum, msg: `Mã BT ${ma_so_bt} (${String(ho_ten).trim()}): đã thêm thành công nhưng lưu ý — ${warns.join('; ')}` });
        }
      } catch (createErr) {
        // Dịch lỗi FK sang tiếng Việt
        let errMsg = createErr.message;
        if (errMsg.includes('foreign key') || errMsg.includes('violates')) {
          errMsg = 'Dữ liệu phòng hoặc khóa ngoại không hợp lệ';
        }
        errors.push({ row: rowNum, msg: `Mã BT ${ma_so_bt}: Lỗi khi thêm — ${errMsg}` });
      }
    }

    return res.json({ ok: true, total: rows.length, success, errors });
  } catch (err) {
    return res.status(500).json({ ok: false, error: `Lỗi xử lý file CSV: ${err.message}` });
  }
});

// ═══════════════════════════════════════════════════════════════════
// GIÁO VIÊN
// ═══════════════════════════════════════════════════════════════════

/** GET /api/giaovien/ */
router.get('/api/giaovien/', loginRequired, roleRequired('admin', 'quan_ly'), async (req, res) => {
  try {
    const { q, page = 1, limit: limitParam } = req.query;
    const limit = Math.min(parseInt(limitParam) || 30, 500);
    const offset = (parseInt(page) - 1) * limit;
    const where = { dang_lam: true }; // Chỉ lấy GV đang làm
    if (q) where.ho_ten = { [Op.iLike]: `%${q}%` };

    const { count, rows } = await GiaoVien.findAndCountAll({ where, limit, offset, order: [['ho_ten', 'ASC']] });

    // Đếm ca trực tháng hiện tại
    const now = new Date();
    const startMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    const endMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];

    const caThang = await PhanCongTrucGV.findAll({
      where: { ngay: { [Op.between]: [startMonth, endMonth] }, xac_nhan_truc: true },
      attributes: ['ma_gv_id'],
    });
    const caMap = {};
    caThang.forEach(c => { caMap[c.ma_gv_id] = (caMap[c.ma_gv_id] || 0) + 1; });

    const data = rows.map(gv => ({ ...gv.toJSON(), ca_thang: caMap[gv.id] || 0 }));
    return res.json({ ok: true, giaovien: data, total: count, page: parseInt(page), pages: Math.ceil(count / limit) });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

/** POST /api/giaovien/save/ */
router.post('/api/giaovien/save/', loginRequired, roleRequired('admin'), async (req, res) => {
  try {
    const { id, ho_ten, gioi_tinh, so_dien_thoai, nhiem_vu, dang_lam, lich_ranh } = req.body;
    const data = {
      ho_ten, gioi_tinh: parseInt(gioi_tinh),
      so_dien_thoai: so_dien_thoai || null,
      nhiem_vu: parseInt(nhiem_vu),
      dang_lam: dang_lam !== undefined ? dang_lam : true,
      lich_ranh: lich_ranh || [false, false, false, false, false],
    };
    if (id) {
      await GiaoVien.update(data, { where: { id } });
      return res.json({ ok: true, message: 'Cập nhật giáo viên thành công' });
    } else {
      const gv = await GiaoVien.create(data);
      return res.json({ ok: true, message: 'Thêm giáo viên thành công', id: gv.id });
    }
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

/** POST /api/giaovien/:pk/delete/ */
router.post('/api/giaovien/:pk/delete/', loginRequired, roleRequired('admin'), async (req, res) => {
  try {
    const gv = await GiaoVien.findByPk(req.params.pk);
    if (!gv) return res.status(404).json({ ok: false, error: 'Không tìm thấy giáo viên' });
    await gv.destroy();
    return res.json({ ok: true, message: 'Đã xóa giáo viên' });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

/** POST /api/giaovien/:pk/ranh/ - Cập nhật lịch rảnh */
router.post('/api/giaovien/:pk/ranh/', loginRequired, roleRequired('admin'), async (req, res) => {
  try {
    const { lich_ranh } = req.body;
    if (!Array.isArray(lich_ranh) || lich_ranh.length !== 5) {
      return res.status(400).json({ ok: false, error: 'lich_ranh phải là mảng 5 phần tử [T2..T6]' });
    }
    await GiaoVien.update({ lich_ranh }, { where: { id: req.params.pk } });
    return res.json({ ok: true, message: 'Cập nhật lịch rảnh thành công' });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════
// PHÒNG
// ═══════════════════════════════════════════════════════════════════

/** GET /api/phong/ */
router.get('/api/phong/', loginRequired, roleRequired('admin', 'quan_ly'), async (req, res) => {
  try {
    const list = await Phong.findAll({
      include: [
        {
          model: HocSinh,
          as: 'hocsinh_an',
          attributes: ['id'],
          where: { dang_hoc: true },
          required: false,
        },
        {
          model: HocSinh,
          as: 'hocsinh_ngu',
          attributes: ['id'],
          where: { dang_hoc: true },
          required: false,
        },
      ],
      order: [['ma_phong', 'ASC']],
    });

    // Tính so_hs_hien_tai theo loại phòng:
    // - Phòng ăn (loai_phong=0): đếm hocsinh_an
    // - Phòng ngủ (loai_phong=1): đếm hocsinh_ngu
    const phong = list.map(p => {
      const plain = p.toJSON();
      const count = p.loai_phong === 0
        ? (p.hocsinh_an?.length ?? 0)
        : (p.hocsinh_ngu?.length ?? 0);
      return {
        ...plain,
        so_hs_hien_tai: count,
        hocsinh_an:  undefined,
        hocsinh_ngu: undefined,
      };
    });

    return res.json({ ok: true, phong });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

/** POST /api/phong/save/ */
router.post('/api/phong/save/', loginRequired, roleRequired('admin'), async (req, res) => {
  try {
    const { is_edit, ma_phong, loai_phong, suc_chua, gioi_tinh, sl_diem_danh, sl_ho_tro } = req.body;
    if (!ma_phong) return res.status(400).json({ ok: false, error: 'Mã phòng không được để trống' });
    const maPhong = String(ma_phong).trim().toUpperCase();
    if (maPhong.length === 0) return res.status(400).json({ ok: false, error: 'Mã phòng không được để trống' });
    if (maPhong.length > 4) return res.status(400).json({ ok: false, error: 'Mã phòng tối đa 4 ký tự' });

    const loai = parseInt(loai_phong);
    const gt = loai === 1 ? parseInt(gioi_tinh) : null;

    const phong = await Phong.findOne({ where: { ma_phong: maPhong } });

    if (is_edit) {
      if (!phong) return res.status(404).json({ ok: false, error: 'Không tìm thấy phòng để cập nhật' });
      await phong.update({ loai_phong: loai, suc_chua: parseInt(suc_chua), gioi_tinh: gt, sl_diem_danh: sl_diem_danh || 1, sl_ho_tro: sl_ho_tro || 1 });
      return res.json({ ok: true, message: 'Cập nhật phòng thành công' });
    } else {
      if (phong) return res.status(400).json({ ok: false, error: 'Mã phòng này đã tồn tại trong hệ thống!' });
      await Phong.create({ ma_phong: maPhong, loai_phong: loai, suc_chua: parseInt(suc_chua), gioi_tinh: gt, sl_diem_danh: sl_diem_danh || 1, sl_ho_tro: sl_ho_tro || 1 });
      return res.json({ ok: true, message: 'Thêm phòng thành công' });
    }
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

/** POST /api/phong/delete/ */
router.post('/api/phong/delete/', loginRequired, roleRequired('admin'), async (req, res) => {
  try {
    const { ma_phong } = req.body;
    const phong = await Phong.findByPk(ma_phong);
    if (!phong) return res.status(404).json({ ok: false, error: 'Không tìm thấy phòng' });
    await phong.destroy();
    return res.json({ ok: true, message: 'Đã xóa phòng' });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════
// CẤU HÌNH GIÁ & HỆ THỐNG
// ═══════════════════════════════════════════════════════════════════

/** GET /api/cauhinh/ */
router.get('/api/cauhinh/', loginRequired, roleRequired('admin', 'quan_ly', 'ke_toan'), async (req, res) => {
  try {
    const giaAn = await CauHinhGia.findOne({ where: { loai_truc: 0 }, order: [['ngay_ap_dung', 'DESC']] });
    const giaNgu = await CauHinhGia.findOne({ where: { loai_truc: 1 }, order: [['ngay_ap_dung', 'DESC']] });
    const [hethong] = await CauHinhHeThong.findOrCreate({ where: { id: 1 }, defaults: { nam_hoc: '2025-2026', nguoi_phu_trach: 'Tạ Thị Diệu Lê', ten_truong: 'LÊ THỊ HỒNG GẤM' } });
    return res.json({ ok: true, gia_an: giaAn, gia_ngu: giaNgu, he_thong: hethong });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

/** POST /api/cauhinh/save/ - Body: { an, ngu } */
router.post('/api/cauhinh/save/', loginRequired, roleRequired('admin', 'quan_ly'), async (req, res) => {
  try {
    const { an, ngu } = req.body;
    const today = new Date().toISOString().split('T')[0];
    const userId = req.session.userId;

    if (an !== undefined) {
      await CauHinhGia.upsert({ loai_truc: 0, don_gia: parseFloat(an), ngay_ap_dung: today, nguoi_cap_nhat_id: userId });
    }
    if (ngu !== undefined) {
      await CauHinhGia.upsert({ loai_truc: 1, don_gia: parseFloat(ngu), ngay_ap_dung: today, nguoi_cap_nhat_id: userId });
    }
    return res.json({ ok: true, message: 'Lưu cấu hình giá thành công' });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

/** POST /api/hethong/save/ - Body: { nam_hoc, nguoi_phu_trach, ten_truong } */
router.post('/api/hethong/save/', loginRequired, roleRequired('admin', 'quan_ly'), async (req, res) => {
  try {
    const { nam_hoc, nguoi_phu_trach, ten_truong } = req.body;
    const updateData = { id: 1, nam_hoc, nguoi_phu_trach, ten_truong, ngay_cap_nhat: new Date().toISOString().split('T')[0] };
    await CauHinhHeThong.upsert(updateData);
    return res.json({ ok: true, message: 'Lưu cấu hình hệ thống thành công' });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════
// VẬT DỤNG
// ═══════════════════════════════════════════════════════════════════

/** GET /api/vatdung/ */
router.get('/api/vatdung/', loginRequired, roleRequired('admin', 'quan_ly', 'ke_toan'), async (req, res) => {
  try {
    const list = await MuaVatDung.findAll({
      include: [{ association: 'phan_bo', include: [{ association: 'phong', attributes: ['ma_phong'] }] }],
      order: [['nam_hoc', 'DESC'], ['lan_mua', 'DESC']],
    });
    const data = list.map(m => {
      const da_phan = m.phan_bo.reduce((s, p) => s + p.so_luong, 0);
      return { ...m.toJSON(), da_phan, con_lai: m.so_luong - da_phan };
    });
    return res.json({ ok: true, vatdung: data });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

/** POST /api/vatdung/mua/save/ */
router.post('/api/vatdung/mua/save/', loginRequired, roleRequired('admin', 'quan_ly'), async (req, res) => {
  try {
    const { nam_hoc, lan_mua, loai_vat_dung, so_luong, ngay_mua } = req.body;
    const item = await MuaVatDung.create({ nam_hoc, lan_mua: parseInt(lan_mua), loai_vat_dung, so_luong: parseInt(so_luong), ngay_mua: ngay_mua || new Date().toISOString().split('T')[0] });
    return res.json({ ok: true, message: 'Thêm lần mua thành công', id: item.id });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

/** POST /api/vatdung/mua/delete/ */
router.post('/api/vatdung/mua/delete/', loginRequired, roleRequired('admin', 'quan_ly'), async (req, res) => {
  try {
    const { id } = req.body;
    await MuaVatDung.destroy({ where: { id } });
    return res.json({ ok: true, message: 'Đã xóa' });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

/** POST /api/vatdung/phanbo/save/ */
router.post('/api/vatdung/phanbo/save/', loginRequired, roleRequired('admin', 'quan_ly'), async (req, res) => {
  try {
    const { mua_id, phong_id, so_luong } = req.body;
    const mua = await MuaVatDung.findByPk(mua_id, { include: ['phan_bo'] });
    if (!mua) return res.status(404).json({ ok: false, error: 'Không tìm thấy lần mua' });

    const da_phan = mua.phan_bo.reduce((s, p) => s + p.so_luong, 0);
    if (da_phan + parseInt(so_luong) > mua.so_luong) {
      return res.status(400).json({ ok: false, error: `Không đủ số lượng. Còn lại: ${mua.so_luong - da_phan}` });
    }

    await PhanBoVatDung.upsert({ mua_id: parseInt(mua_id), phong_id, so_luong: parseInt(so_luong) });
    return res.json({ ok: true, message: 'Phân bổ thành công' });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

/** POST /api/vatdung/phanbo/delete/ */
router.post('/api/vatdung/phanbo/delete/', loginRequired, roleRequired('admin', 'quan_ly'), async (req, res) => {
  try {
    const { id } = req.body;
    await PhanBoVatDung.destroy({ where: { id } });
    return res.json({ ok: true, message: 'Đã xóa phân bổ' });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
