const fs = require('fs');
const path = require('path');
const express = require('express');
const router = express.Router();
const multer = require('multer');
const { parse } = require('csv-parse/sync');
const { Op } = require('sequelize');
const {
  HocSinh, GiaoVien, Phong, MuaVatDung, PhanBoVatDung,
  CauHinhGia, CauHinhHeThong, PhanCongTrucGV, StaffUser, sequelize, LichSuThaoTac
} = require('../models');
const { loginRequired, attachUser, roleRequired } = require('../middleware/auth');
const { invalidateStaticCaches } = require('../utils/appCache');

router.use(attachUser);
const upload = multer({ storage: multer.memoryStorage() });

async function recordAuditLog(req, loai, noidung) {
  try {
    const user = req.user || req.session?.user || {};
    await LichSuThaoTac.create({
      loai,
      noidung,
      nguoi_thao_tac_id: user.id || req.session?.userId || null,
      nguoi_thao_tac_ten: user.fullname || user.username || 'Hệ thống',
      chuc_vu: user.role_display || user.role || 'N/A',
      created_at: new Date(),
    });
  } catch (e) {
    console.error('Audit log error:', e.message);
  }
}

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
      order: [['id', 'ASC']],
    });
    return res.json({ ok: true, hocsinh: list });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

/** GET /api/hocsinh/export-pdf-data/ - Dữ liệu xuất danh sách học sinh theo lớp */
router.get('/api/hocsinh/export-pdf-data/', loginRequired, roleRequired('admin', 'quan_ly'), async (req, res) => {
  try {
    const { lop, dang_hoc } = req.query;
    const where = {};
    if (lop) where.lop = lop;
    if (dang_hoc === 'true' || dang_hoc === '1') where.dang_hoc = true;

    const list = await HocSinh.findAll({
      where,
      include: [
        { association: 'phong_an', attributes: ['ma_phong', 'loai_phong'] },
        { association: 'phong_ngu', attributes: ['ma_phong', 'loai_phong', 'gioi_tinh'] },
      ],
      order: [['lop', 'ASC'], ['ho_ten', 'ASC']],
    });

    const [hethong] = await CauHinhHeThong.findOrCreate({
      where: { id: 1 },
      defaults: { nam_hoc: '2026-2027', nguoi_phu_trach: 'Vũ Quốc Phong', ten_truong: 'LÊ THỊ HỒNG GẤM' }
    });

    return res.json({ ok: true, he_thong: hethong, hocsinh: list });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

/** GET /api/hocsinh/download-pdf/:filename - Tải file PDF lưu trữ trên máy chủ nếu có */
router.get('/api/hocsinh/download-pdf/:filename', loginRequired, (req, res) => {
  const filename = path.basename(req.params.filename);
  const filePath = path.resolve(__dirname, '../../../Danh_Sach_HS_Theo_Lop_PDF', filename);
  if (fs.existsSync(filePath)) {
    return res.download(filePath);
  }
  return res.status(404).json({ ok: false, error: 'Không tìm thấy file PDF trên máy chủ' });
});

/** POST /api/hocsinh/save/ - Tạo / cập nhật học sinh */
router.post('/api/hocsinh/save/', loginRequired, roleRequired('admin'), async (req, res) => {
  try {
    const { id, ho_ten, lop, gioi_tinh, ma_phong_an, ma_phong_ngu, dang_hoc, ngay_vao, ngay_rut, ghi_chu } = req.body;

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

    const isDangHoc = dang_hoc !== undefined ? (dang_hoc === true || dang_hoc === 'true' || dang_hoc === 1) : true;
    const finalNgayRut = !isDangHoc ? (ngay_rut || new Date().toISOString().split('T')[0]) : null;

    const data = {
      ho_ten, lop, gioi_tinh: parseInt(gioi_tinh),
      ma_phong_an_id: ma_phong_an || null,
      ma_phong_ngu_id: ma_phong_ngu || null,
      dang_hoc: isDangHoc,
      ngay_vao: ngay_vao || null,
      ngay_rut: finalNgayRut,
      ghi_chu: ghi_chu || null,
    };

    if (id) {
      await HocSinh.update(data, { where: { id } });
      invalidateStaticCaches();
      return res.json({ ok: true, message: 'Cập nhật học sinh thành công' });
    } else {
      let hs;
      try {
        hs = await HocSinh.create(data);
      } catch (insertErr) {
        if (insertErr.name === 'SequelizeUniqueConstraintError' || insertErr.message?.includes('unique')) {
          await sequelize.query(`
            SELECT setval('quanli_hocsinh_id_seq', COALESCE((SELECT MAX(id) FROM quanli_hocsinh), 1), true);
          `);
          hs = await HocSinh.create(data);
        } else {
          throw insertErr;
        }
      }
      invalidateStaticCaches();
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
    invalidateStaticCaches();
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

    if (!rows || rows.length === 0) {
      return res.status(400).json({ ok: false, error: 'File CSV rỗng hoặc không có dữ liệu.' });
    }

    // Kiểm tra xem người dùng có nộp nhầm file Danh sách Giáo viên không
    const headerStr = rows[0].map(c => String(c).toLowerCase()).join(' ');
    if (headerStr.includes('mã bảo mật') || headerStr.includes('số điện thoại') || headerStr.includes('mã gv')) {
      return res.status(400).json({
        ok: false,
        error: 'File tải lên là "Danh sách Giáo viên" (có cột Mã bảo mật / SĐT), không phải danh sách Học sinh! Vui lòng chọn đúng file Học sinh hoặc tải file mẫu CSV.'
      });
    }

    // Tải trước danh sách phòng hợp lệ để kiểm tra mà không cần query mỗi dòng
    const allPhong = await Phong.findAll({ attributes: ['ma_phong', 'loai_phong', 'gioi_tinh'] });
    const phongAnSet  = new Set(allPhong.filter(p => p.loai_phong === 0).map(p => p.ma_phong));
    const phongNguMap = new Map();
    allPhong.filter(p => p.loai_phong === 1).forEach(p => phongNguMap.set(p.ma_phong, p));

    // Nhận diện cột linh hoạt từ dòng tiêu đề
    let colMap = {
      stt: 0,
      ma_so_bt: 1,
      ho_ten: 2,
      gioi_tinh: 3,
      lop: 4,
      phong_ngu: 5,
      phong_an: 6,
      ghi_chu: 7
    };

    let startIdx = 0;
    const isFirstRowHeader = String(rows[0][0]).toLowerCase().includes('stt') || isNaN(Number(rows[0][0]));
    if (isFirstRowHeader) {
      startIdx = 1;
      const hRow = rows[0].map(c => String(c).trim().toLowerCase());
      hRow.forEach((col, idx) => {
        if (col.includes('mã') || col.includes('mshs') || col === 'id') colMap.ma_so_bt = idx;
        else if (col.includes('họ') || col.includes('tên')) colMap.ho_ten = idx;
        else if (col.includes('giới tính') || col === 'gt') colMap.gioi_tinh = idx;
        else if (col.includes('lớp')) colMap.lop = idx;
        else if (col.includes('ngủ')) colMap.phong_ngu = idx;
        else if (col.includes('ăn')) colMap.phong_an = idx;
        else if (col.includes('ghi chú')) colMap.ghi_chu = idx;
      });
    }

    let success = 0;
    const errors = [];

    for (let i = startIdx; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 1;

      const ma_so_bt = row[colMap.ma_so_bt];
      const ho_ten = row[colMap.ho_ten];
      const gt_raw = row[colMap.gioi_tinh];
      const lop = row[colMap.lop];
      const phong_ngu_raw = row[colMap.phong_ngu];
      const phong_an_raw = row[colMap.phong_an];
      const ghi_chu = row[colMap.ghi_chu];

      // Validate bắt buộc
      if (!ho_ten || !String(ho_ten).trim()) {
        errors.push({ row: rowNum, msg: 'Thiếu họ tên học sinh — bỏ qua dòng này' });
        continue;
      }
      if (!lop || !String(lop).trim()) {
        errors.push({ row: rowNum, msg: `Học sinh "${ho_ten}": Thiếu lớp — bỏ qua` });
        continue;
      }

      // Validate hoặc tự sinh mã BT
      let idHS = parseInt(ma_so_bt);
      if (!idHS || isNaN(idHS) || idHS <= 0) {
        const maxHs = (await HocSinh.max('id')) || 1000;
        idHS = maxHs + 1;
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
        if (phongNguMap.has(pNguRaw)) {
          const room = phongNguMap.get(pNguRaw);
          if (room.gioi_tinh === null || room.gioi_tinh === undefined || room.gioi_tinh === gioi_tinh) {
            ma_phong_ngu_id = pNguRaw;
          } else {
            const hsGtStr = gioi_tinh === 0 ? 'Nam' : 'Nữ';
            const roomGtStr = room.gioi_tinh === 0 ? 'Nam' : 'Nữ';
            warns.push(`Phòng ngủ "${pNguRaw}" không phù hợp giới tính (phòng ${roomGtStr}, HS ${hsGtStr}) — để trống`);
          }
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

    // Luôn đồng bộ sequence quanli_hocsinh_id_seq theo MAX(id) sau khi import
    try {
      await sequelize.query(`
        SELECT setval('quanli_hocsinh_id_seq', COALESCE((SELECT MAX(id) FROM quanli_hocsinh), 1), true);
      `);
    } catch (seqErr) {
      console.error('Lỗi sync sequence sau khi import CSV:', seqErr);
    }

    invalidateStaticCaches();
    return res.json({ ok: true, total: rows.length, success, errors });
  } catch (err) {
    return res.status(500).json({ ok: false, error: `Lỗi xử lý file CSV: ${err.message}` });
  }
});

// ═══════════════════════════════════════════════════════════════════
// GIÁO VIÊN
// ═══════════════════════════════════════════════════════════════════

/** GET /api/giaovien/ - Danh sách toàn bộ giáo viên */
router.get('/api/giaovien/', loginRequired, roleRequired('admin', 'quan_ly'), async (req, res) => {
  try {
    const { page = 1, limit = 1000 } = req.query;
    const offset = (page - 1) * limit;
    const { rows, count } = await GiaoVien.findAndCountAll({
      order: [['ho_ten', 'ASC']],
      limit: parseInt(limit),
      offset: parseInt(offset),
    });

    // Đảm bảo tất cả GV đều có mã bảo mật 5 ký tự duy nhất
    const batchAssignedCodes = new Set();
    for (const gv of rows) {
      if (!gv.ma_bao_mat) {
        gv.ma_bao_mat = await generateUniqueTeacherCode(batchAssignedCodes);
        await gv.save();
      } else {
        batchAssignedCodes.add(gv.ma_bao_mat.toUpperCase());
      }
    }

    // Đếm ca trực tháng hiện tại
    const now = new Date();
    const startMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    const endMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];

    const caThang = await PhanCongTrucGV.findAll({
      where: { ngay: { [Op.between]: [startMonth, endMonth] }, xac_nhan_truc: true },
      attributes: ['ma_gv_id', 'ngay', 'loai_truc'],
    });
    const caMap = {};
    const seenCa = new Set();
    caThang.forEach(c => {
      const key = `${c.ma_gv_id}_${c.ngay}_${c.loai_truc}`;
      if (!seenCa.has(key)) { seenCa.add(key); caMap[c.ma_gv_id] = (caMap[c.ma_gv_id] || 0) + 1; }
    });

    const data = rows.map(gv => ({ ...gv.toJSON(), ca_thang: caMap[gv.id] || 0 }));
    return res.json({ ok: true, giaovien: data, total: count, page: parseInt(page), pages: Math.ceil(count / limit) });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// Sinh mã bảo mật 5 ký tự duy nhất cho GV (Đúng 5 ký tự, ví dụ: GV84B, GV927, ...)
// Kiểm tra chống trùng nhiều tầng: DB hiện có, mã Master trường, và toàn bộ mã trong phiên nạp hiện tại
async function generateUniqueTeacherCode(assignedSet = null) {
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

  // 1. Tập hợp toàn bộ mã đã tồn tại trong CSDL
  const existingRecords = await GiaoVien.findAll({
    attributes: ['ma_bao_mat'],
    where: { ma_bao_mat: { [Op.ne]: null } }
  });
  const existingSet = new Set(
    existingRecords
      .map(r => r.ma_bao_mat ? String(r.ma_bao_mat).trim().toUpperCase() : null)
      .filter(Boolean)
  );

  // 2. Thêm mã bảo mật master của hệ thống (nếu có) để tránh trùng
  try {
    const heThong = await CauHinhHeThong.findByPk(1);
    if (heThong?.ma_bao_mat_gv) {
      existingSet.add(String(heThong.ma_bao_mat_gv).trim().toUpperCase());
    }
  } catch (e) {
    console.error('Lỗi đọc CauHinhHeThong:', e.message);
  }

  // 3. Kết hợp với tập mã đã cấp trong cùng phiên import / batch nếu có
  if (assignedSet instanceof Set) {
    assignedSet.forEach(c => {
      if (c) existingSet.add(String(c).trim().toUpperCase());
    });
  }

  let code = '';
  let attempts = 0;
  const maxPrefixAttempts = 1000;

  // Chiến lược 1: Thử dạng 'GV' + 3 ký tự (VD: GV84B, GV927 - có hơn 32.000 tổ hợp)
  do {
    attempts++;
    let randomPart = '';
    for (let i = 0; i < 3; i++) {
      randomPart += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    code = 'GV' + randomPart;
  } while (existingSet.has(code) && attempts < maxPrefixAttempts);

  // Chiến lược 2: Nếu đã chạm ngưỡng (vô cùng hiếm), chuyển sang 5 ký tự ngẫu nhiên hoàn toàn
  if (existingSet.has(code)) {
    attempts = 0;
    const maxFullAttempts = 2000;
    do {
      attempts++;
      code = '';
      for (let i = 0; i < 5; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
      }
    } while (existingSet.has(code) && attempts < maxFullAttempts);
  }

  // Chiến lược 3: Dự phòng tuyệt đối không bao giờ trùng bằng timestamp
  while (existingSet.has(code)) {
    const rand = Math.floor(Math.random() * chars.length);
    code = ('G' + Date.now().toString(36).toUpperCase() + chars[rand]).slice(-5);
  }

  // 4. Double check với database trực tiếp để bảo vệ trước race-condition
  const dbCheck = await GiaoVien.findOne({
    where: { ma_bao_mat: code },
    attributes: ['id']
  });
  if (dbCheck) {
    existingSet.add(code);
    if (assignedSet instanceof Set) assignedSet.add(code);
    return generateUniqueTeacherCode(assignedSet);
  }

  if (assignedSet instanceof Set) {
    assignedSet.add(code);
  }

  return code;
}

/** POST /api/giaovien/save/ */
router.post('/api/giaovien/save/', loginRequired, roleRequired('admin'), async (req, res) => {
  try {
    const { id, ho_ten, gioi_tinh, so_dien_thoai, nhiem_vu, dang_lam, lich_ranh, ma_bao_mat } = req.body;
    const data = {
      ho_ten: String(ho_ten).trim(),
      gioi_tinh: parseInt(gioi_tinh),
      so_dien_thoai: so_dien_thoai ? String(so_dien_thoai).trim() : null,
      nhiem_vu: parseInt(nhiem_vu) || 0,
      dang_lam: dang_lam !== undefined ? dang_lam : true,
      lich_ranh: lich_ranh || [false, false, false, false, false],
    };

    if (id) {
      const existingGv = await GiaoVien.findByPk(id);
      if (!existingGv) return res.status(404).json({ ok: false, error: 'Không tìm thấy giáo viên' });

      if (ma_bao_mat && String(ma_bao_mat).trim().length > 0) {
        const cleanCode = String(ma_bao_mat).trim().toUpperCase().slice(0, 5);
        if (cleanCode.length !== 5) {
          return res.status(400).json({ ok: false, error: 'Mã bảo mật giáo viên phải có đúng 5 ký tự!' });
        }
        // Kiểm tra xem mã này đã bị GV khác sử dụng chưa
        const duplicate = await GiaoVien.findOne({
          where: { ma_bao_mat: cleanCode, id: { [Op.ne]: id } }
        });
        if (duplicate) {
          return res.status(400).json({ ok: false, error: `Mã bảo mật "${cleanCode}" đã thuộc về giáo viên ${duplicate.ho_ten}. Vui lòng chọn mã khác!` });
        }
        // Kiểm tra xem có trùng với mã Master trường không
        const heThong = await CauHinhHeThong.findByPk(1);
        if (heThong?.ma_bao_mat_gv && cleanCode === String(heThong.ma_bao_mat_gv).trim().toUpperCase()) {
          return res.status(400).json({ ok: false, error: `Mã bảo mật "${cleanCode}" trùng với mã Master của toàn trường. Vui lòng chọn mã khác!` });
        }
        data.ma_bao_mat = cleanCode;
      } else if (!existingGv.ma_bao_mat) {
        data.ma_bao_mat = await generateUniqueTeacherCode();
      }

      await GiaoVien.update(data, { where: { id } });
      await recordAuditLog(req, 'GIAO_VIEN', `Cập nhật thông tin giáo viên "${ho_ten}" (ID: ${id})`);
      return res.json({ ok: true, message: 'Cập nhật giáo viên thành công', ma_bao_mat: data.ma_bao_mat || existingGv.ma_bao_mat });
    } else {
      let gv = null;
      if (ma_bao_mat && String(ma_bao_mat).trim().length > 0) {
        const cleanCode = String(ma_bao_mat).trim().toUpperCase().slice(0, 5);
        if (cleanCode.length !== 5) {
          return res.status(400).json({ ok: false, error: 'Mã bảo mật giáo viên phải có đúng 5 ký tự!' });
        }
        const duplicate = await GiaoVien.findOne({ where: { ma_bao_mat: cleanCode } });
        if (duplicate) {
          return res.status(400).json({ ok: false, error: `Mã bảo mật "${cleanCode}" đã thuộc về giáo viên ${duplicate.ho_ten}. Vui lòng chọn mã khác!` });
        }
        const heThong = await CauHinhHeThong.findByPk(1);
        if (heThong?.ma_bao_mat_gv && cleanCode === String(heThong.ma_bao_mat_gv).trim().toUpperCase()) {
          return res.status(400).json({ ok: false, error: `Mã bảo mật "${cleanCode}" trùng với mã Master của toàn trường. Vui lòng chọn mã khác!` });
        }
        data.ma_bao_mat = cleanCode;
        gv = await GiaoVien.create(data);
      } else {
        // Tự động sinh mã duy nhất có retry nếu có tranh chấp
        for (let attempt = 0; attempt < 5; attempt++) {
          try {
            data.ma_bao_mat = await generateUniqueTeacherCode();
            gv = await GiaoVien.create(data);
            break;
          } catch (createErr) {
            if (createErr.name === 'SequelizeUniqueConstraintError' && attempt < 4) {
              continue;
            }
            throw createErr;
          }
        }
      }
      if (!gv) {
        return res.status(500).json({ ok: false, error: 'Không thể tạo giáo viên với mã bảo mật duy nhất. Vui lòng thử lại!' });
      }
      await recordAuditLog(req, 'GIAO_VIEN', `Thêm giáo viên mới "${ho_ten}" (Mã Form: ${gv.ma_bao_mat})`);
      return res.json({ ok: true, message: 'Thêm giáo viên thành công', id: gv.id, ma_bao_mat: gv.ma_bao_mat });
    }
  } catch (err) {
    if (err.name === 'SequelizeUniqueConstraintError') {
      return res.status(400).json({ ok: false, error: 'Số điện thoại hoặc Mã bảo mật đã tồn tại trên hệ thống.' });
    }
    return res.status(500).json({ ok: false, error: err.message });
  }
});

/** POST /api/giaovien/:pk/reset-code/ - Cấp lại mã 5 ký tự mới */
router.post('/api/giaovien/:pk/reset-code/', loginRequired, roleRequired('admin'), async (req, res) => {
  try {
    const gv = await GiaoVien.findByPk(req.params.pk);
    if (!gv) return res.status(404).json({ ok: false, error: 'Không tìm thấy giáo viên' });

    let newCode;
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        newCode = await generateUniqueTeacherCode();
        gv.ma_bao_mat = newCode;
        await gv.save();
        break;
      } catch (saveErr) {
        if (saveErr.name === 'SequelizeUniqueConstraintError' && attempt < 4) {
          continue;
        }
        throw saveErr;
      }
    }

    await recordAuditLog(req, 'GIAO_VIEN', `Cấp lại mã bảo mật Form mới cho GV "${gv.ho_ten}": ${newCode}`);
    return res.json({ ok: true, message: 'Cấp mã bảo mật mới thành công', ma_bao_mat: newCode });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

/** POST /api/giaovien/import/ - Import GV từ CSV và tự sinh mã 5 ký tự không trùng lặp */
router.post('/api/giaovien/import/', loginRequired, roleRequired('admin'), upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ ok: false, error: 'Chưa có file CSV. Vui lòng chọn file trước khi tải lên.' });

    let rawContent = req.file.buffer.toString('utf8');
    if (rawContent.charCodeAt(0) === 0xFEFF) {
      rawContent = rawContent.slice(1);
    }
    const rows = parse(rawContent, { columns: false, skip_empty_lines: true, trim: true });
    if (!rows || rows.length === 0) {
      return res.status(400).json({ ok: false, error: 'File CSV rỗng hoặc không có dữ liệu hợp lệ.' });
    }

    // Nhận diện cột linh hoạt từ header (nếu có)
    let headerRowIdx = -1;
    let colHoTen = -1;
    let colGioiTinh = -1;
    let colSDT = -1;

    const normalizeHeader = str => String(str || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');

    for (let r = 0; r < Math.min(3, rows.length); r++) {
      const rowNorm = rows[r].map(normalizeHeader);
      const htIdx = rowNorm.findIndex(c => c.includes('hoten') || c.includes('hovaten') || c.includes('giaovien') || c === 'ten');
      if (htIdx !== -1 || rowNorm.some(c => c.includes('stt') || c.includes('dienthoai') || c.includes('gioitinh'))) {
        headerRowIdx = r;
        colHoTen = htIdx !== -1 ? htIdx : 1;
        colGioiTinh = rowNorm.findIndex(c => c.includes('gioitinh') || c === 'gt');
        colSDT = rowNorm.findIndex(c => c.includes('dienthoai') || c.includes('sdt') || c.includes('phone'));
        break;
      }
    }

    // Nếu không tìm thấy header theo từ khóa, suy luận theo vị trí cột mặc định
    if (headerRowIdx === -1) {
      const firstRow = rows[0];
      const isFirstColNumber = !isNaN(Number(firstRow[0])) && Number(firstRow[0]) > 0;
      if (isFirstColNumber) {
        colHoTen = 1;
        colGioiTinh = firstRow.length > 2 ? 2 : -1;
        colSDT = firstRow.length > 3 ? 3 : -1;
        headerRowIdx = -1;
      } else {
        colHoTen = 0;
        colGioiTinh = firstRow.length > 1 ? 1 : -1;
        colSDT = firstRow.length > 2 ? 2 : -1;
        headerRowIdx = -1;
      }
    }

    let createdCount = 0;
    let updatedCount = 0;
    const errors = [];
    const createdTeachers = [];
    const batchAssignedCodes = new Set(); // Cache theo dõi mã trong phiên nạp này

    const startIdx = headerRowIdx >= 0 ? headerRowIdx + 1 : 0;

    for (let i = startIdx; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 1;

      if (!row || row.length === 0 || row.every(c => !String(c || '').trim())) continue;

      const hoTen = String(colHoTen >= 0 ? row[colHoTen] : row[1] || row[0] || '').trim();
      if (!hoTen || isNaN(Number(hoTen)) === false) {
        errors.push({ row: rowNum, msg: 'Thiếu họ tên giáo viên hoặc họ tên không hợp lệ — bỏ qua dòng này' });
        continue;
      }

      let gioi_tinh = 0;
      if (colGioiTinh >= 0 && row[colGioiTinh] !== undefined) {
        const gtStr = String(row[colGioiTinh] || '').trim().toLowerCase();
        if (['nữ', 'nu', '1', 'f', 'female'].includes(gtStr)) {
          gioi_tinh = 1;
        }
      }

      let sdt = null;
      if (colSDT >= 0 && row[colSDT] !== undefined) {
        let cleanDigits = String(row[colSDT] || '').trim().replace(/\D/g, '');
        if (cleanDigits.length === 9 && ['3', '5', '7', '8', '9'].includes(cleanDigits[0])) {
          cleanDigits = '0' + cleanDigits;
        }
        if (cleanDigits.length >= 7) {
          sdt = cleanDigits;
        }
      }

      // Kiểm tra GV theo HỌ TÊN (Không so sánh SĐT bằng OR vì số điện thoại có thể trùng lặp hoặc chưa cập nhật)
      const existing = await GiaoVien.findOne({
        where: sequelize.where(
          sequelize.fn('LOWER', sequelize.fn('TRIM', sequelize.col('ho_ten'))),
          hoTen.toLowerCase()
        )
      });

      if (existing) {
        let changed = false;
        if (!existing.ma_bao_mat) {
          existing.ma_bao_mat = await generateUniqueTeacherCode(batchAssignedCodes);
          changed = true;
        }
        batchAssignedCodes.add(existing.ma_bao_mat.toUpperCase());

        if (sdt && !existing.so_dien_thoai) {
          existing.so_dien_thoai = sdt;
          changed = true;
        }

        if (changed) {
          await existing.save();
        }

        createdTeachers.push({ id: existing.id, ho_ten: existing.ho_ten, ma_bao_mat: existing.ma_bao_mat, status: 'Đã tồn tại' });
        updatedCount++;
        continue;
      }

      // Giáo viên mới hoàn toàn: Cấp mã 5 ký tự duy nhất
      const ma_bao_mat = await generateUniqueTeacherCode(batchAssignedCodes);
      const newGv = await GiaoVien.create({
        ho_ten: hoTen,
        gioi_tinh,
        so_dien_thoai: sdt,
        nhiem_vu: 0,
        dang_lam: true,
        ma_bao_mat,
        lich_ranh: [false, false, false, false, false],
      });

      createdTeachers.push({ id: newGv.id, ho_ten: newGv.ho_ten, ma_bao_mat: newGv.ma_bao_mat, status: 'Thêm mới' });
      createdCount++;
    }

    const totalProcessed = createdCount + updatedCount;
    await recordAuditLog(req, 'GIAO_VIEN', `Nhập file GV: Thêm mới ${createdCount} GV, cập nhật ${updatedCount} GV (Lỗi ${errors.length})`);
    return res.json({
      ok: true,
      total: rows.length - (headerRowIdx >= 0 ? 1 : 0),
      created: createdCount,
      updated: updatedCount,
      success: totalProcessed,
      errors,
      teachers: createdTeachers
    });
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
      invalidateStaticCaches();
      return res.json({ ok: true, message: 'Cập nhật phòng thành công' });
    } else {
      if (phong) return res.status(400).json({ ok: false, error: 'Mã phòng này đã tồn tại trong hệ thống!' });
      await Phong.create({ ma_phong: maPhong, loai_phong: loai, suc_chua: parseInt(suc_chua), gioi_tinh: gt, sl_diem_danh: sl_diem_danh || 1, sl_ho_tro: sl_ho_tro || 1 });
      invalidateStaticCaches();
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
    invalidateStaticCaches();
    return res.json({ ok: true, message: 'Đã xóa phòng' });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════
// CẤU HÌNH GIÁ & HỆ THỐNG
// ═══════════════════════════════════════════════════════════════════

/** GET /api/cauhinh/ */
router.get('/api/cauhinh/', loginRequired, roleRequired('admin', 'quan_ly', 'ke_toan', 'hoc_vu', 'giao_vien'), async (req, res) => {
  try {
    const giaAn = await CauHinhGia.findOne({ where: { loai_truc: 0 }, order: [['ngay_ap_dung', 'DESC']] });
    const giaNgu = await CauHinhGia.findOne({ where: { loai_truc: 1 }, order: [['ngay_ap_dung', 'DESC']] });
    const [hethong] = await CauHinhHeThong.findOrCreate({ where: { id: 1 }, defaults: { nam_hoc: '2026-2027', nguoi_phu_trach: 'Tạ Thị Diệu Lê', ten_truong: 'LÊ THỊ HỒNG GẤM' } });
    if (hethong.nam_hoc === '2025-2026') {
      hethong.nam_hoc = '2026-2027';
      await hethong.save();
    }
    return res.json({ ok: true, gia_an: giaAn, gia_ngu: giaNgu, he_thong: hethong });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

/** GET /api/cauhinh/lichsu/ */
router.get('/api/cauhinh/lichsu/', loginRequired, roleRequired('admin', 'quan_ly', 'ke_toan'), async (req, res) => {
  try {
    const history = await LichSuThaoTac.findAll({
      where: { loai: 'THIET_LAP' },
      order: [['created_at', 'DESC']],
      limit: 50,
    });
    return res.json({ ok: true, history });
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
    const changes = [];

    if (an !== undefined) {
      await CauHinhGia.upsert({ loai_truc: 0, don_gia: parseFloat(an), ngay_ap_dung: today, nguoi_cap_nhat_id: userId });
      changes.push(`Đơn giá ăn: ${parseFloat(an).toLocaleString('vi-VN')} đ/suất`);
    }
    if (ngu !== undefined) {
      await CauHinhGia.upsert({ loai_truc: 1, don_gia: parseFloat(ngu), ngay_ap_dung: today, nguoi_cap_nhat_id: userId });
      changes.push(`Đơn giá ngủ: ${parseFloat(ngu).toLocaleString('vi-VN')} đ/suất`);
    }

    if (changes.length > 0) {
      await recordAuditLog(req, 'THIET_LAP', `Cập nhật cấu hình giá bán trú: ${changes.join(', ')}`);
    }

    return res.json({ ok: true, message: 'Lưu cấu hình giá thành công' });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

/** GET /api/public/system-status/ - Kiểm tra trạng thái hệ thống (Public - Không cần đăng nhập) */
router.get('/api/public/system-status/', async (req, res) => {
  try {
    const heThong = await CauHinhHeThong.findByPk(1);
    return res.json({
      ok: true,
      bao_tri: Boolean(heThong?.bao_tri),
      thong_bao: heThong?.thong_bao_bao_tri || 'Hệ thống Quản lý Bán trú đang được bảo trì và nâng cấp định kỳ.',
      thoi_gian: heThong?.thoi_gian_bao_tri || 'Dự kiến hoàn tất trong 15-30 phút',
      ten_truong: heThong?.ten_truong || 'LÊ THỊ HỒNG GẤM',
      nam_hoc: heThong?.nam_hoc || '2026-2027',
    });
  } catch (err) {
    return res.json({
      ok: true,
      bao_tri: false,
      thong_bao: '',
      thoi_gian: '',
    });
  }
});

/** POST /api/hethong/save/ - Body: { nam_hoc, nguoi_phu_trach, ten_truong, ma_bao_mat_gv, bao_tri, thong_bao_bao_tri, thoi_gian_bao_tri } */
router.post('/api/hethong/save/', loginRequired, roleRequired('admin', 'quan_ly'), async (req, res) => {
  try {
    const { nam_hoc, nguoi_phu_trach, ten_truong, ma_bao_mat_gv, bao_tri, thong_bao_bao_tri, thoi_gian_bao_tri } = req.body;
    const updateData = {
      id: 1,
      nam_hoc,
      nguoi_phu_trach,
      ten_truong,
      ngay_cap_nhat: new Date().toISOString().split('T')[0],
    };
    if (ma_bao_mat_gv !== undefined) updateData.ma_bao_mat_gv = String(ma_bao_mat_gv).trim().toUpperCase();
    if (bao_tri !== undefined) updateData.bao_tri = Boolean(bao_tri);
    if (thong_bao_bao_tri !== undefined) updateData.thong_bao_bao_tri = String(thong_bao_bao_tri).trim();
    if (thoi_gian_bao_tri !== undefined) updateData.thoi_gian_bao_tri = String(thoi_gian_bao_tri).trim();

    await CauHinhHeThong.upsert(updateData);
    await recordAuditLog(req, 'THIET_LAP', `Cập nhật cấu hình hệ thống: Bảo trì=${updateData.bao_tri ? 'BẬT' : 'TẮT'}, Năm học ${nam_hoc}, Người phụ trách "${nguoi_phu_trach}", Trường "${ten_truong}"`);
    return res.json({ ok: true, message: 'Lưu cấu hình hệ thống thành công' });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════
// VẬT DỤNG
// ═══════════════════════════════════════════════════════════════════

/** GET /api/vatdung/lichsu/ */
router.get('/api/vatdung/lichsu/', loginRequired, roleRequired('admin', 'quan_ly', 'ke_toan'), async (req, res) => {
  try {
    const history = await LichSuThaoTac.findAll({
      where: { loai: 'VAT_DUNG' },
      order: [['created_at', 'DESC']],
      limit: 50,
    });
    return res.json({ ok: true, history });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

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
router.post('/api/vatdung/mua/save/', loginRequired, roleRequired('admin'), async (req, res) => {
  try {
    const { nam_hoc, lan_mua, loai_vat_dung, so_luong, ngay_mua } = req.body;
    const loaiUpper = String(loai_vat_dung || '').toUpperCase();
    const validLoai = ['CHIEU', 'GOI', 'VO_GOI'];
    if (!validLoai.includes(loaiUpper)) {
      return res.status(400).json({ ok: false, error: 'Loại vật dụng không hợp lệ (chỉ chấp nhận: Chiếu, Gối, Áo gối)' });
    }

    const loaiMap = { CHIEU: 'Chiếu', GOI: 'Gối', VO_GOI: 'Áo gối' };

    const item = await MuaVatDung.create({
      nam_hoc,
      lan_mua: parseInt(lan_mua),
      loai_vat_dung: loaiUpper,
      so_luong: parseInt(so_luong),
      ngay_mua: ngay_mua || new Date().toISOString().split('T')[0]
    });

    await recordAuditLog(req, 'VAT_DUNG', `Thêm lần mua vật dụng: Lần ${lan_mua} (${nam_hoc}) - ${so_luong} ${loaiMap[loaiUpper] || loaiUpper}`);

    return res.json({ ok: true, message: 'Thêm lần mua thành công', id: item.id });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

/** POST /api/vatdung/mua/delete/ */
router.post('/api/vatdung/mua/delete/', loginRequired, roleRequired('admin'), async (req, res) => {
  try {
    const { id } = req.body;
    const mua = await MuaVatDung.findByPk(id);
    await MuaVatDung.destroy({ where: { id } });
    if (mua) {
      const loaiMap = { CHIEU: 'Chiếu', GOI: 'Gối', VO_GOI: 'Áo gối' };
      await recordAuditLog(req, 'VAT_DUNG', `Xóa lần mua vật dụng Lần ${mua.lan_mua} (${mua.nam_hoc}): ${mua.so_luong} ${loaiMap[mua.loai_vat_dung] || mua.loai_vat_dung}`);
    }
    return res.json({ ok: true, message: 'Đã xóa' });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

/** POST /api/vatdung/phanbo/save/ */
router.post('/api/vatdung/phanbo/save/', loginRequired, roleRequired('admin'), async (req, res) => {
  try {
    const { mua_id, phong_id, so_luong } = req.body;
    const mua = await MuaVatDung.findByPk(mua_id, { include: ['phan_bo'] });
    if (!mua) return res.status(404).json({ ok: false, error: 'Không tìm thấy lần mua' });

    const da_phan = mua.phan_bo.reduce((s, p) => s + p.so_luong, 0);
    if (da_phan + parseInt(so_luong) > mua.so_luong) {
      return res.status(400).json({ ok: false, error: `Không đủ số lượng. Còn lại: ${mua.so_luong - da_phan}` });
    }

    await PhanBoVatDung.upsert({ mua_id: parseInt(mua_id), phong_id, so_luong: parseInt(so_luong) });

    const loaiMap = { CHIEU: 'Chiếu', GOI: 'Gối', VO_GOI: 'Áo gối' };
    const loaiTen = loaiMap[mua.loai_vat_dung] || mua.loai_vat_dung;
    await recordAuditLog(req, 'VAT_DUNG', `Phân bổ ${so_luong} ${loaiTen} (Lần ${mua.lan_mua} - ${mua.nam_hoc}) cho Phòng ${phong_id}`);

    return res.json({ ok: true, message: 'Phân bổ thành công' });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

/** POST /api/vatdung/phanbo/delete/ */
router.post('/api/vatdung/phanbo/delete/', loginRequired, roleRequired('admin'), async (req, res) => {
  try {
    const { id } = req.body;
    const pb = await PhanBoVatDung.findByPk(id);
    await PhanBoVatDung.destroy({ where: { id } });
    if (pb) {
      await recordAuditLog(req, 'VAT_DUNG', `Hủy phân bổ ${pb.so_luong} vật dụng của Phòng ${pb.phong_id}`);
    }
    return res.json({ ok: true, message: 'Đã xóa phân bổ' });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
