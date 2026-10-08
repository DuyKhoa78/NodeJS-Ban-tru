require('dotenv').config();
const {
  sequelize,
  GiaoVien,
  PhanCongTrucGV,
  KeToanDanhMucKhoanChi,
  KeToanKyTongHop,
  KeToanNguoiNhan,
  KeToanChiTietKhoanChi,
  KeToanThanhToanChiTiet,
  KeToanLichSuThietLap,
} = require('../src/models');
const { Op } = require('sequelize');

// Dữ liệu 28 nhân sự bán trú thực tế theo sheet TH T012026
const REAL_STAFF = [
  { ho_ten: 'Trần Bá Lâm', truc_phong: 0, vs_bv: 0, tiep_nhan_vd: 0, y_te: 0, bt_an: 0, cap_nhat_tt: 700000, thiet_bi: 0, gs_an: 0, gs_ban_tru: 0, so_tk: '0397854806', ngan_hang: 'Sacombank', ghi_chu: '' },
  { ho_ten: 'Trần Nhật Tân', truc_phong: 0, vs_bv: 0, tiep_nhan_vd: 0, y_te: 0, bt_an: 0, cap_nhat_tt: 0, thiet_bi: 1600000, gs_an: 0, gs_ban_tru: 0, so_tk: '060146415418', ngan_hang: 'Sacombank', ghi_chu: '16 ngày × 100.000' },
  { ho_ten: 'Phan Thanh Nhật', truc_phong: 0, vs_bv: 0, tiep_nhan_vd: 0, y_te: 0, bt_an: 0, cap_nhat_tt: 0, thiet_bi: 0, gs_an: 0, gs_ban_tru: 0, so_tk: '0931158262', ngan_hang: 'Sacombank', ghi_chu: '' },
  { ho_ten: 'Bùi Thanh Toàn', truc_phong: 0, vs_bv: 0, tiep_nhan_vd: 0, y_te: 0, bt_an: 0, cap_nhat_tt: 0, thiet_bi: 0, gs_an: 1600000, gs_ban_tru: 0, so_tk: '050128831239', ngan_hang: 'Sacombank', ghi_chu: '16 ngày × 100.000' },
  { ho_ten: 'Lê Hoàng Hà', truc_phong: 0, vs_bv: 0, tiep_nhan_vd: 0, y_te: 0, bt_an: 0, cap_nhat_tt: 0, thiet_bi: 0, gs_an: 0, gs_ban_tru: 0, so_tk: '0908345603', ngan_hang: 'Sacombank', ghi_chu: '' },
  { ho_ten: 'Đỗ Văn Thương', truc_phong: 0, vs_bv: 0, tiep_nhan_vd: 0, y_te: 0, bt_an: 0, cap_nhat_tt: 0, thiet_bi: 0, gs_an: 1600000, gs_ban_tru: 0, so_tk: '0342184452', ngan_hang: 'Sacombank', ghi_chu: '16 ngày × 100.000' },
  { ho_ten: 'Đỗ Ngọc Bích Vân', truc_phong: 0, vs_bv: 0, tiep_nhan_vd: 0, y_te: 0, bt_an: 0, cap_nhat_tt: 0, thiet_bi: 0, gs_an: 1600000, gs_ban_tru: 0, so_tk: '060297153784', ngan_hang: 'Sacombank', ghi_chu: '16 ngày × 100.000' },
  { ho_ten: 'Đặng Thị Yến', truc_phong: 0, vs_bv: 0, tiep_nhan_vd: 0, y_te: 0, bt_an: 0, cap_nhat_tt: 0, thiet_bi: 0, gs_an: 0, gs_ban_tru: 0, so_tk: '060146446712', ngan_hang: 'Sacombank', ghi_chu: '' },
  { ho_ten: 'Phạm Thị Thanh Hà', truc_phong: 0, vs_bv: 0, tiep_nhan_vd: 800000, y_te: 0, bt_an: 0, cap_nhat_tt: 0, thiet_bi: 0, gs_an: 0, gs_ban_tru: 0, so_tk: '0903832423', ngan_hang: 'Sacombank', ghi_chu: '' },
  { ho_ten: 'Đào Thị Cẩm Hạnh', truc_phong: 0, vs_bv: 0, tiep_nhan_vd: 0, y_te: 0, bt_an: 0, cap_nhat_tt: 0, thiet_bi: 0, gs_an: 0, gs_ban_tru: 0, so_tk: '060146399773', ngan_hang: 'Sacombank', ghi_chu: '' },
  { ho_ten: 'Trần Nhật Thiên Thanh', truc_phong: 0, vs_bv: 2000000, tiep_nhan_vd: 0, y_te: 0, bt_an: 0, cap_nhat_tt: 1000000, thiet_bi: 0, gs_an: 0, gs_ban_tru: 0, so_tk: '060310096671', ngan_hang: 'Sacombank', ghi_chu: '' },
  { ho_ten: 'Trần Thị Kim Thoại', truc_phong: 0, vs_bv: 0, tiep_nhan_vd: 0, y_te: 0, bt_an: 0, cap_nhat_tt: 0, thiet_bi: 0, gs_an: 0, gs_ban_tru: 0, so_tk: '0388706578', ngan_hang: 'Sacombank', ghi_chu: '' },
  { ho_ten: 'Đinh Thị Tuyết Lan', truc_phong: 0, vs_bv: 2000000, tiep_nhan_vd: 0, y_te: 0, bt_an: 0, cap_nhat_tt: 0, thiet_bi: 0, gs_an: 0, gs_ban_tru: 0, so_tk: '060253956685', ngan_hang: 'Sacombank', ghi_chu: '' },
  { ho_ten: 'Mai Thị Tường Vi', truc_phong: 0, vs_bv: 0, tiep_nhan_vd: 0, y_te: 0, bt_an: 0, cap_nhat_tt: 0, thiet_bi: 0, gs_an: 0, gs_ban_tru: 0, so_tk: '0935595079', ngan_hang: 'Sacombank', ghi_chu: '' },
  { ho_ten: 'Lê Thị Huyền Nhung', truc_phong: 0, vs_bv: 0, tiep_nhan_vd: 0, y_te: 0, bt_an: 0, cap_nhat_tt: 0, thiet_bi: 0, gs_an: 1400000, gs_ban_tru: 0, so_tk: '0586613647', ngan_hang: 'Sacombank', ghi_chu: '14 ngày × 100.000' },
  { ho_ten: 'Cao Thị Mai Huệ', truc_phong: 0, vs_bv: 0, tiep_nhan_vd: 0, y_te: 0, bt_an: 0, cap_nhat_tt: 0, thiet_bi: 0, gs_an: 0, gs_ban_tru: 0, so_tk: '060275595589', ngan_hang: 'Sacombank', ghi_chu: '' },
  { ho_ten: 'Bùi Phùng Đức Anh', truc_phong: 0, vs_bv: 0, tiep_nhan_vd: 0, y_te: 0, bt_an: 0, cap_nhat_tt: 0, thiet_bi: 0, gs_an: 0, gs_ban_tru: 0, so_tk: '060183474475', ngan_hang: 'Sacombank', ghi_chu: '' },
  { ho_ten: 'Hoàng Thanh Thủy', truc_phong: 0, vs_bv: 0, tiep_nhan_vd: 0, y_te: 0, bt_an: 0, cap_nhat_tt: 0, thiet_bi: 0, gs_an: 0, gs_ban_tru: 0, so_tk: '0387574502', ngan_hang: 'Sacombank', ghi_chu: '' },
  { ho_ten: 'Trần Thị Hồng Cẩm', truc_phong: 0, vs_bv: 0, tiep_nhan_vd: 0, y_te: 0, bt_an: 0, cap_nhat_tt: 500000, thiet_bi: 0, gs_an: 0, gs_ban_tru: 0, so_tk: '060325382506', ngan_hang: 'Sacombank', ghi_chu: '' },
  { ho_ten: 'Vũ Quốc Phong', truc_phong: 0, vs_bv: 0, tiep_nhan_vd: 0, y_te: 0, bt_an: 0, cap_nhat_tt: 0, thiet_bi: 0, gs_an: 0, gs_ban_tru: 4500000, so_tk: '123698898888', ngan_hang: 'Vietcombank', ghi_chu: '18 ngày × 250.000' },
  { ho_ten: 'Huỳnh Đức Vịnh', truc_phong: 0, vs_bv: 0, tiep_nhan_vd: 0, y_te: 0, bt_an: 0, cap_nhat_tt: 0, thiet_bi: 0, gs_an: 0, gs_ban_tru: 2250000, so_tk: '0909930164', ngan_hang: 'Sacombank', ghi_chu: '9 ngày × 250.000' },
  { ho_ten: 'Lý Công Thành', truc_phong: 0, vs_bv: 0, tiep_nhan_vd: 0, y_te: 0, bt_an: 0, cap_nhat_tt: 0, thiet_bi: 0, gs_an: 1300000, gs_ban_tru: 0, so_tk: '060326149384', ngan_hang: 'Sacombank', ghi_chu: '13 ngày × 100.000' },
  { ho_ten: 'Nguyễn Thị Nhung', truc_phong: 0, vs_bv: 2000000, tiep_nhan_vd: 0, y_te: 0, bt_an: 0, cap_nhat_tt: 0, thiet_bi: 0, gs_an: 0, gs_ban_tru: 0, so_tk: '060962014341', ngan_hang: 'Sacombank', ghi_chu: '' },
  { ho_ten: 'Nguyễn Ngọc Cẩm', truc_phong: 0, vs_bv: 800000, tiep_nhan_vd: 0, y_te: 0, bt_an: 0, cap_nhat_tt: 0, thiet_bi: 0, gs_an: 0, gs_ban_tru: 0, so_tk: '06014646453', ngan_hang: 'Sacombank', ghi_chu: '' },
  { ho_ten: 'Mai Quỳnh Châu', truc_phong: 0, vs_bv: 0, tiep_nhan_vd: 0, y_te: 1120000, bt_an: 1600000, cap_nhat_tt: 0, thiet_bi: 0, gs_an: 1600000, gs_ban_tru: 0, so_tk: '060326378898', ngan_hang: 'Sacombank', ghi_chu: '' },
  { ho_ten: 'Huỳnh Duy Khoa', truc_phong: 0, vs_bv: 0, tiep_nhan_vd: 0, y_te: 0, bt_an: 0, cap_nhat_tt: 0, thiet_bi: 0, gs_an: 0, gs_ban_tru: 0, so_tk: '060818237416', ngan_hang: 'Sacombank', ghi_chu: '' },
  { ho_ten: 'Bùi Xuân Kim Sa', truc_phong: 0, vs_bv: 0, tiep_nhan_vd: 0, y_te: 0, bt_an: 0, cap_nhat_tt: 0, thiet_bi: 0, gs_an: 0, gs_ban_tru: 0, so_tk: '060212345678', ngan_hang: 'Sacombank', ghi_chu: '' },
  { ho_ten: 'Hồ Quang Thịnh', truc_phong: 0, vs_bv: 0, tiep_nhan_vd: 0, y_te: 0, bt_an: 0, cap_nhat_tt: 0, thiet_bi: 0, gs_an: 0, gs_ban_tru: 0, so_tk: '060298765432', ngan_hang: 'Sacombank', ghi_chu: '' },
];

async function seedRealData() {
  console.log('--- KHỞI TẠO DỮ LIỆU THỰC TẾ CHO KỲ TỔNG HỢP ---');
  const t = await sequelize.transaction();

  try {
    const tuNgay = '2026-09-07';
    const denNgay = '2026-10-06';

    // 1. Tìm hoặc tạo kỳ TH T012026
    let ky = await KeToanKyTongHop.findOne({ where: { ten_ky: 'TH T012026' }, transaction: t });
    if (ky) {
      await KeToanThanhToanChiTiet.destroy({ where: { ky_id: ky.id }, transaction: t });
      await KeToanChiTietKhoanChi.destroy({ where: { ky_id: ky.id }, transaction: t });
      await KeToanNguoiNhan.destroy({ where: { ky_id: ky.id }, transaction: t });
      await ky.update({
        tu_ngay: tuNgay,
        den_ngay: denNgay,
        ngay_lap: '2026-10-06',
        trang_thai: 'nhap',
        ghi_chu: 'Tổng hợp chi trả công tác bán trú theo sheet TH T012026',
        created_by_name: 'Trần Thị Hồng Cẩm',
      }, { transaction: t });
    } else {
      ky = await KeToanKyTongHop.create({
        ten_ky: 'TH T012026',
        tu_ngay: tuNgay,
        den_ngay: denNgay,
        ngay_lap: '2026-10-06',
        trang_thai: 'nhap',
        ghi_chu: 'Tổng hợp chi trả công tác bán trú theo sheet TH T012026',
        created_by_name: 'Trần Thị Hồng Cẩm',
      }, { transaction: t });
    }

    // 2. Lấy dữ liệu trực ăn và trực ngủ thực tế từ CSDL
    const phanCongAn = await PhanCongTrucGV.findAll({
      where: { ngay: { [Op.between]: [tuNgay, denNgay] }, loai_truc: 0, xac_nhan_truc: true },
      include: [
        { association: 'giao_vien', attributes: ['id', 'ho_ten', 'so_tai_khoan', 'nhiem_vu'] },
        { association: 'giao_vien_truc_thay', attributes: ['id', 'ho_ten', 'so_tai_khoan', 'nhiem_vu'] },
      ],
      transaction: t,
    });

    const phanCongNgu = await PhanCongTrucGV.findAll({
      where: { ngay: { [Op.between]: [tuNgay, denNgay] }, loai_truc: 1, xac_nhan_truc: true },
      include: [
        { association: 'giao_vien', attributes: ['id', 'ho_ten', 'so_tai_khoan'] },
        { association: 'giao_vien_truc_thay', attributes: ['id', 'ho_ten', 'so_tai_khoan'] },
      ],
      transaction: t,
    });

    const anMap = {};
    const seenAn = new Set();
    phanCongAn.forEach((pc) => {
      let name = pc.giao_vien?.ho_ten;
      let gvId = pc.giao_vien?.id;
      let stk = pc.giao_vien?.so_tai_khoan;
      let nv = pc.giao_vien?.nhiem_vu || 0;
      if (pc.ten_gv_truc_thay && pc.ten_gv_truc_thay.trim()) {
        name = pc.ten_gv_truc_thay.trim();
        gvId = null;
        stk = '';
      } else if (pc.giao_vien_truc_thay) {
        name = pc.giao_vien_truc_thay.ho_ten;
        gvId = pc.giao_vien_truc_thay.id;
        stk = pc.giao_vien_truc_thay.so_tai_khoan;
        nv = pc.giao_vien_truc_thay.nhiem_vu || 0;
      }
      if (!name) return;
      const key = name.trim().toLowerCase();
      const shiftKey = key + '_' + pc.ngay;
      if (seenAn.has(shiftKey)) return;
      seenAn.add(shiftKey);
      if (!anMap[key]) anMap[key] = { so_ca: 0, gvId, stk, ho_ten: name, nhiem_vu: nv };
      anMap[key].so_ca += 1;
    });

    const nguMap = {};
    const seenNgu = new Set();
    phanCongNgu.forEach((pc) => {
      let name = pc.giao_vien?.ho_ten;
      let gvId = pc.giao_vien?.id;
      let stk = pc.giao_vien?.so_tai_khoan;
      if (pc.ten_gv_truc_thay && pc.ten_gv_truc_thay.trim()) {
        name = pc.ten_gv_truc_thay.trim();
        gvId = null;
        stk = '';
      } else if (pc.giao_vien_truc_thay) {
        name = pc.giao_vien_truc_thay.ho_ten;
        gvId = pc.giao_vien_truc_thay.id;
        stk = pc.giao_vien_truc_thay.so_tai_khoan;
      }
      if (!name) return;
      const key = name.trim().toLowerCase();
      const shiftKey = key + '_' + pc.ngay;
      if (seenNgu.has(shiftKey)) return;
      seenNgu.add(shiftKey);
      if (!nguMap[key]) nguMap[key] = { so_ca: 0, gvId, stk, ho_ten: name };
      nguMap[key].so_ca += 1;
    });

    // 3. Khởi tạo danh sách người nhận thực tế
    let grandTotal = 0;
    const allDbTeachers = await GiaoVien.findAll({ transaction: t });
    const teacherMapByName = {};
    allDbTeachers.forEach(g => {
      teacherMapByName[g.ho_ten.trim().toLowerCase()] = g;
    });

    for (let i = 0; i < REAL_STAFF.length; i++) {
      const s = REAL_STAFF[i];
      const key = s.ho_ten.trim().toLowerCase();
      const gv = teacherMapByName[key];
      const caAn = anMap[key] ? anMap[key].so_ca : 0;
      const caNgu = nguMap[key] ? nguMap[key].so_ca : 0;

      const isMaiQuynhChau = key.includes('mai quỳnh châu');
      const isVuQuocPhong = key.includes('vũ quốc phong');

      // Tiền trực phòng (ngủ): ca * 180.000đ
      const tienTrucPhong = caNgu * 180000;

      // Tiền bán trú ăn:
      // Nếu là Mai Quỳnh Châu thì bt_an = 16 * 100k = 1.600.000đ
      let tienBtAn = s.bt_an || (caAn * 100000);
      if (isMaiQuynhChau) tienBtAn = 1600000;

      // Tiền GS bán trú:
      const tienGsBanTru = s.gs_ban_tru || 0;

      const rowTotal =
        tienTrucPhong +
        s.vs_bv +
        s.tiep_nhan_vd +
        s.y_te +
        tienBtAn +
        s.cap_nhat_tt +
        s.thiet_bi +
        s.gs_an +
        tienGsBanTru;

      grandTotal += rowTotal;

      const nn = await KeToanNguoiNhan.create({
        ky_id: ky.id,
        nhan_su_id: gv ? gv.id : null,
        ma_dinh_danh: gv ? `GV_${gv.id}` : `NV_${i + 1}`,
        ho_ten: s.ho_ten,
        so_tai_khoan: s.so_tk || (gv ? gv.so_tai_khoan : ''),
        ngan_hang: s.ngan_hang || (gv ? gv.ngan_hang : 'Sacombank'),
        tong_tien: rowTotal,
        da_thanh_toan: 0,
        trang_thai_tt: 'chua_chi',
        ghi_chu: s.ghi_chu || '',
        stt: i + 1,
      }, { transaction: t });

      // Tạo các chi tiết khoản chi
      const details = [
        { ma: 'truc_phong', ten: 'Trực phòng', loai: 'nguon_truc_ngu', so_ngay: caNgu, don_gia: 180000, tien_nguon: tienTrucPhong, tien_nhap: 0, tien_adj: 0, thanh_tien: tienTrucPhong },
        { ma: 'vs_bv', ten: 'Trực vệ sinh và bảo vệ', loai: 'nhap_truc_tiep', so_ngay: 0, don_gia: 0, tien_nguon: 0, tien_nhap: s.vs_bv, tien_adj: 0, thanh_tien: s.vs_bv },
        { ma: 'tiep_nhan_vd', ten: 'Nhắn tin, tiếp nhận vật dụng, vệ sinh vật dụng', loai: 'nhap_truc_tiep', so_ngay: 0, don_gia: 0, tien_nguon: 0, tien_nhap: s.tiep_nhan_vd, tien_adj: 0, thanh_tien: s.tiep_nhan_vd },
        { ma: 'y_te', ten: 'Y tế', loai: 'ngay_don_gia', so_ngay: s.y_te ? (s.y_te / 70000) : 0, don_gia: 70000, tien_nguon: 0, tien_nhap: 0, tien_adj: 0, thanh_tien: s.y_te },
        { ma: 'bt_an', ten: 'Bán trú ăn / kiểm tra ATVSTP', loai: 'nguon_truc_an', so_ngay: caAn, don_gia: 100000, tien_nguon: tienBtAn, tien_nhap: 0, tien_adj: 0, thanh_tien: tienBtAn },
        { ma: 'cap_nhat_tt', ten: 'Cập nhật thông tin bán trú ăn, ngủ và kiểm tra vệ sinh cuối buổi', loai: 'nhap_truc_tiep', so_ngay: 0, don_gia: 0, tien_nguon: 0, tien_nhap: s.cap_nhat_tt, tien_adj: 0, thanh_tien: s.cap_nhat_tt },
        { ma: 'thiet_bi', ten: 'Trực thiết bị', loai: 'ngay_don_gia', so_ngay: s.thiet_bi ? (s.thiet_bi / 100000) : 0, don_gia: 100000, tien_nguon: 0, tien_nhap: 0, tien_adj: 0, thanh_tien: s.thiet_bi },
        { ma: 'gs_an', ten: 'Trực kiểm tra, giám sát ăn bán trú', loai: 'ngay_don_gia', so_ngay: s.gs_an ? (s.gs_an / 100000) : 0, don_gia: 100000, tien_nguon: 0, tien_nhap: 0, tien_adj: 0, thanh_tien: s.gs_an },
        { ma: 'gs_ban_tru', ten: 'Trực giám sát bán trú', loai: 'ngay_don_gia', so_ngay: s.gs_ban_tru ? (s.gs_ban_tru / 250000) : 0, don_gia: 250000, tien_nguon: 0, tien_nhap: 0, tien_adj: 0, thanh_tien: tienGsBanTru },
      ];

      for (const d of details) {
        await KeToanChiTietKhoanChi.create({
          ky_id: ky.id,
          nguoi_nhan_id: nn.id,
          ma_khoan_chi: d.ma,
          loai_tinh: d.loai,
          so_ngay: d.so_ngay,
          don_gia: d.don_gia,
          tien_nguon: d.tien_nguon,
          tien_nhap: d.tien_nhap,
          tien_dieu_chinh: 0,
          thanh_tien: d.thanh_tien,
        }, { transaction: t });
      }
    }

    await ky.update({
      tong_so_nguoi: REAL_STAFF.length,
      tong_tien: grandTotal,
      tong_da_thanh_toan: 0,
    }, { transaction: t });

    await t.commit();
    console.log(`Đã nạp thành công 28 nhân sự thực tế vào kỳ [ID: ${ky.id}]`);
    console.log(`Tổng cộng kỳ TH T012026: ${grandTotal.toLocaleString('vi-VN')} đ`);
  } catch (err) {
    await t.rollback();
    console.error('Lỗi nạp dữ liệu:', err);
    process.exit(1);
  }
}

seedRealData().then(() => process.exit(0));
