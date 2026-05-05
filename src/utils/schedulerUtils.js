/**
 * schedulerUtils.js
 * ──────────────────────────────────────────────────────────────────────────
 * Thuật toán tự động phân công lịch trực GV bán trú.
 *
 * Ràng buộc nghiệp vụ:
 *  1. GV chỉ được xếp ngày có lich_ranh[thu] === true
 *  2. Khi auto-xếp: GV được chọn → nhận CẢ ca Ăn lẫn ca Ngủ cùng ngày
 *  3. Mỗi GV chỉ trực 1 phòng Ăn + 1 phòng Ngủ trong cùng ngày
 *  4. Số buổi trực cân bằng đều giữa các GV (Weighted Round-Robin)
 *  5. Phân GV vào phòng theo nhiem_vu (0=DiemDanh, 1=HoTro)
 *  6. ★ Phòng Ăn: không phân biệt giới tính GV
 *     ★ Phòng Ngủ: giới tính GV PHẢI khớp giới_tính phòng (0=Nam, 1=Nữ)
 * ──────────────────────────────────────────────────────────────────────────
 */

/**
 * Tính tổng số GV slot cần thiết cho một tập phòng.
 */
function tinhSoGVCanThiet(phongs) {
  return phongs.reduce((sum, p) => sum + (p.sl_diem_danh || 1) + (p.sl_ho_tro || 1), 0);
}

/**
 * Sort GV theo load tăng dần (ít buổi trực nhất → ưu tiên hơn).
 */
function sortByLoad(gvList, loadMap) {
  return [...gvList].sort((a, b) => (loadMap[a.id] || 0) - (loadMap[b.id] || 0));
}

/**
 * Phân GV vào danh sách phòng theo nhiem_vu (không lọc giới tính — dùng cho phòng Ăn).
 *
 * @param {Array}  phongs     - Danh sách phòng
 * @param {Array}  gvPool     - GV đã được chọn (hỗn hợp nam/nữ OK)
 * @param {number} loai_truc  - 0=Ăn, 1=Ngủ
 * @returns {Array} [{ma_gv_id, ma_phong_id, loai_truc}]
 */
function phanGVVaoPhong(phongs, gvPool, loai_truc) {
  const assignments = [];
  const ddPool = gvPool.filter(gv => gv.nhiem_vu === 0);
  const htPool = gvPool.filter(gv => gv.nhiem_vu === 1);
  let ddIdx = 0, htIdx = 0;

  for (const phong of phongs) {
    const slDD = phong.sl_diem_danh || 1;
    const slHT = phong.sl_ho_tro || 1;

    for (let i = 0; i < slDD; i++) {
      if (ddIdx < ddPool.length) {
        assignments.push({ ma_gv_id: ddPool[ddIdx++].id, ma_phong_id: phong.ma_phong, loai_truc });
      }
    }
    for (let i = 0; i < slHT; i++) {
      if (htIdx < htPool.length) {
        assignments.push({ ma_gv_id: htPool[htIdx++].id, ma_phong_id: phong.ma_phong, loai_truc });
      }
    }
  }

  return assignments;
}

/**
 * Phân GV vào phòng Ngủ theo đúng giới tính phòng.
 * Mỗi phòng Ngủ có gioi_tinh: 0=Nam, 1=Nữ.
 * GV chỉ được vào phòng khớp gioi_tinh của họ.
 *
 * @param {Array}  phongNgu   - Danh sách phòng Ngủ [{ma_phong, gioi_tinh, sl_diem_danh, sl_ho_tro}]
 * @param {Array}  gvNam      - GV Nam đã được chọn (gioi_tinh=0)
 * @param {Array}  gvNu       - GV Nữ đã được chọn (gioi_tinh=1)
 * @returns {Array} [{ma_gv_id, ma_phong_id, loai_truc: 1}]
 */
function phanGVVaoPhongNgu(phongNgu, gvNam, gvNu) {
  const phongNam = phongNgu.filter(p => p.gioi_tinh === 0);
  const phongNuRoom = phongNgu.filter(p => p.gioi_tinh === 1);

  const assignNam = phanGVVaoPhong(phongNam, gvNam, 1);
  const assignNu  = phanGVVaoPhong(phongNuRoom, gvNu, 1);

  return [...assignNam, ...assignNu];
}

/**
 * Phân công lịch trực cho một ngày — tuân thủ giới tính phòng Ngủ.
 *
 * Logic:
 *  a. Lọc GV rảnh ngày `thu`
 *  b. Tính số GV Nam cần cho phòng Ngủ Nam → chọn đủ GV Nam (sort theo load)
 *     Tính số GV Nữ cần cho phòng Ngủ Nữ → chọn đủ GV Nữ (sort theo load)
 *  c. Pool GV được chọn = GV Nam + GV Nữ
 *  d. Phân toàn bộ pool vào phòng Ăn (không phân biệt giới tính)
 *  e. Phân GV Nam → phòng Ngủ Nam; GV Nữ → phòng Ngủ Nữ
 *
 * @param {Object} params
 * @param {number} params.thu       - 0=T2,...,4=T6
 * @param {Array}  params.phongAn   - Phòng Ăn (loai_phong=0)
 * @param {Array}  params.phongNgu  - Phòng Ngủ (loai_phong=1, có gioi_tinh)
 * @param {Array}  params.gvAll     - Tất cả GV đang làm {id, nhiem_vu, gioi_tinh, lich_ranh}
 * @param {Object} params.loadMap   - {gv_id: so_buoi_da_phan}
 *
 * @returns {{ assignments: Array, gvDuocChon: Array }}
 */
function phanCongMotNgay({ thu, phongAn, phongNgu, gvAll, loadMap }) {
  // ── 1. Nhu cầu ─────────────────────────────────────────────────────
  const phongNguNam = phongNgu.filter(p => p.gioi_tinh === 0);
  const phongNguNu  = phongNgu.filter(p => p.gioi_tinh === 1);

  const needNguNam = tinhSoGVCanThiet(phongNguNam);
  const needNguNu  = tinhSoGVCanThiet(phongNguNu);
  const needAn     = tinhSoGVCanThiet(phongAn);

  // ── 2. Lọc GV rảnh ─────────────────────────────────────────────────
  const isRanh = gv => Array.isArray(gv.lich_ranh) && gv.lich_ranh.length >= 5 && gv.lich_ranh[thu] === true;
  const gvRanh = gvAll.filter(isRanh);
  const gvRanhNam = gvRanh.filter(gv => gv.gioi_tinh === 0);
  const gvRanhNu  = gvRanh.filter(gv => gv.gioi_tinh === 1);

  // ── 3. Chọn GV (Tối ưu để đủ cho cả Ăn và Ngủ) ──────────────────────
  // Mỗi GV được chọn sẽ trực cả Ăn + Ngủ. 
  // Cần đủ Nam cho Ngủ Nam, đủ Nữ cho Ngủ Nữ. 
  // Tổng (Nam + Nữ) phải >= nhu cầu phòng Ăn.
  const sortedNam = sortByLoad(gvRanhNam, loadMap);
  const sortedNu  = sortByLoad(gvRanhNu, loadMap);

  // Chọn tối thiểu số lượng cho phòng Ngủ
  let chosenNam = sortedNam.slice(0, needNguNam);
  let chosenNu  = sortedNu.slice(0, needNguNu);

  // Nếu tổng chọn vẫn ít hơn nhu cầu phòng Ăn, lấy thêm GV (không phân biệt giới tính)
  let currentTotal = chosenNam.length + chosenNu.length;
  if (currentTotal < needAn) {
    const remainingNam = sortedNam.slice(needNguNam);
    const remainingNu  = sortedNu.slice(needNguNu);
    const poolConLai = sortByLoad([...remainingNam, ...remainingNu], loadMap);
    const them = poolConLai.slice(0, needAn - currentTotal);
    
    // Tách lại giới tính để đưa vào chosen
    chosenNam = [...chosenNam, ...them.filter(g => g.gioi_tinh === 0)];
    chosenNu  = [...chosenNu, ...them.filter(g => g.gioi_tinh === 1)];
  }

  const gvDuocChon = [...chosenNam, ...chosenNu];
  if (gvDuocChon.length === 0) return { assignments: [], gvDuocChon: [] };

  // ── 4. Phân vào phòng Ăn (ưu tiên người ít load) ───────────────────
  const gvForAn = sortByLoad(gvDuocChon, loadMap);
  const assignAn = phanGVVaoPhong(phongAn, gvForAn, 0);

  // ── 5. Phân vào phòng Ngủ (Khớp giới tính) ─────────────────────────
  const assignNgu = phanGVVaoPhongNgu(phongNgu, chosenNam, chosenNu);

  return {
    assignments: [...assignAn, ...assignNgu],
    gvDuocChon,
  };
}

/**
 * Phân công lịch trực khung cho cả tuần (T2→T6).
 * Dùng cho endpoint POST /api/lichtruc_khung/auto/
 *
 * @param {Object} params
 * @param {Array}  params.phongs - Tất cả phòng
 * @param {Array}  params.gvAll  - Tất cả GV đang làm việc
 * @returns {Array} lichKhung [{ma_phong_id, ma_gv_id, thu}]
 */
function phanCongLichKhung({ phongs, gvAll }) {
  const phongAn  = phongs.filter(p => p.loai_phong === 0);
  const phongNgu = phongs.filter(p => p.loai_phong === 1);

  // loadMap: tổng số buổi đã được xếp (để cân bằng qua các ngày)
  const loadMap = {};
  gvAll.forEach(gv => { loadMap[gv.id] = 0; });

  const result = [];

  for (let thu = 0; thu < 5; thu++) {
    const { assignments, gvDuocChon } = phanCongMotNgay({
      thu, phongAn, phongNgu, gvAll, loadMap,
    });

    for (const a of assignments) {
      result.push({ ma_phong_id: a.ma_phong_id, ma_gv_id: a.ma_gv_id, thu });
    }

    // Cập nhật load: mỗi GV được chọn +2 (1 Ăn + 1 Ngủ)
    for (const gv of gvDuocChon) {
      loadMap[gv.id] += 2;
    }
  }

  return result;
}

/**
 * Helper: Thêm n ngày vào chuỗi YYYY-MM-DD
 */
function addDays(dateStr, n) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + n);
  return d.toISOString().split('T')[0];
}

/**
 * Validate lịch phân công: kiểm tra GV không bị trùng phòng,
 * và phòng Ngủ có đúng giới tính GV.
 *
 * @param {Array} assignments    - [{ma_gv_id, ma_phong_id, loai_truc}]
 * @param {Array} phongs         - Danh sách phòng (để tra gioi_tinh)
 * @param {Array} gvAll          - Danh sách GV (để tra gioi_tinh)
 * @returns {{ valid: boolean, warnings: string[] }}
 */
function validateAssignments(assignments, phongs = [], gvAll = []) {
  const warnings = [];
  const phongMap = {};
  phongs.forEach(p => { phongMap[p.ma_phong] = p; });
  const gvMap = {};
  gvAll.forEach(gv => { gvMap[gv.id] = gv; });

  const gvNgayMap = {}; // gv_id → {an, ngu}
  for (const a of assignments) {
    if (!gvNgayMap[a.ma_gv_id]) gvNgayMap[a.ma_gv_id] = {};
    const entry = gvNgayMap[a.ma_gv_id];
    const key = a.loai_truc === 0 ? 'an' : 'ngu';

    if (entry[key]) {
      warnings.push(`GV #${a.ma_gv_id} bị xếp 2 phòng ${key === 'an' ? 'Ăn' : 'Ngủ'}: ${entry[key]} và ${a.ma_phong_id}`);
    }
    entry[key] = a.ma_phong_id;

    // Kiểm tra giới tính phòng Ngủ
    if (a.loai_truc === 1 && phongs.length > 0 && gvAll.length > 0) {
      const phong = phongMap[a.ma_phong_id];
      const gv    = gvMap[a.ma_gv_id];
      if (phong && gv && phong.gioi_tinh !== null && phong.gioi_tinh !== gv.gioi_tinh) {
        const gtPhong = phong.gioi_tinh === 0 ? 'Nam' : 'Nữ';
        const gtGV    = gv.gioi_tinh    === 0 ? 'Nam' : 'Nữ';
        warnings.push(`GV #${a.ma_gv_id} (${gtGV}) được xếp phòng Ngủ ${a.ma_phong_id} (${gtPhong}) — sai giới tính!`);
      }
    }
  }

  // Kiểm tra GV có cả Ăn lẫn Ngủ
  for (const [gvId, entry] of Object.entries(gvNgayMap)) {
    if (!entry.an)  warnings.push(`GV #${gvId} được xếp Ngủ nhưng thiếu ca Ăn`);
    if (!entry.ngu) warnings.push(`GV #${gvId} được xếp Ăn nhưng thiếu ca Ngủ`);
  }

  return { valid: warnings.length === 0, warnings };
}

module.exports = {
  phanCongLichKhung,
  phanCongMotNgay,
  validateAssignments,
  addDays,
};
