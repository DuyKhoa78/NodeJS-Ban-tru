/**
 * scripts/export_room_backup_excel.js
 * Xuất danh sách học sinh theo phòng ra file Excel trước khi đổi phòng
 */
const path = require('path');
const dotenv = require('dotenv');
const ExcelJS = require('exceljs');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const { HocSinh, Phong, sequelize } = require('../src/models');

async function exportExcel() {
  console.log('🔄 Đang tải dữ liệu học sinh và phòng...');
  await sequelize.authenticate();

  const phongList = await Phong.findAll({
    order: [['ma_phong', 'ASC']],
    raw: true,
  });

  const hsList = await HocSinh.findAll({
    order: [
      ['lop', 'ASC'],
      ['ho_ten', 'ASC'],
    ],
    raw: true,
  });

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Hệ thống Quản lý Bán trú THPT Lê Thị Hồng Gấm';
  workbook.created = new Date();

  // 1. Sheet Tổng hợp phòng
  const wsSummary = workbook.addWorksheet('Tổng hợp phòng');
  wsSummary.columns = [
    { header: 'Mã phòng', key: 'ma_phong', width: 16 },
    { header: 'Loại phòng', key: 'loai_phong', width: 16 },
    { header: 'Sức chứa', key: 'suc_chua', width: 14 },
    { header: 'Giới tính', key: 'gioi_tinh', width: 14 },
    { header: 'Số HS đang Ăn', key: 'sl_an', width: 16 },
    { header: 'Số HS đang Ngủ', key: 'sl_ngu', width: 16 },
  ];

  // Header styling
  wsSummary.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  wsSummary.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF1F497D' },
  };

  phongList.forEach((p) => {
    const slAn = hsList.filter((h) => h.dang_hoc && h.ma_phong_an_id === p.ma_phong).length;
    const slNgu = hsList.filter((h) => h.dang_hoc && h.ma_phong_ngu_id === p.ma_phong).length;
    wsSummary.addRow({
      ma_phong: p.ma_phong,
      loai_phong: p.loai_phong === 'an' ? 'Phòng ăn' : (p.loai_phong === 'ngu' ? 'Phòng ngủ' : 'Ăn & Ngủ'),
      suc_chua: p.suc_chua,
      gioi_tinh: p.gioi_tinh === 'nam' ? 'Nam' : (p.gioi_tinh === 'nu' ? 'Nữ' : 'Tất cả'),
      sl_an: slAn,
      sl_ngu: slNgu,
    });
  });

  // 2. Sheet Danh sách theo Phòng Ăn
  const wsAn = workbook.addWorksheet('HS - Phòng Ăn');
  wsAn.columns = [
    { header: 'STT', key: 'stt', width: 8 },
    { header: 'Mã HS', key: 'id', width: 12 },
    { header: 'Họ và tên', key: 'ho_ten', width: 26 },
    { header: 'Giới tính', key: 'gioi_tinh', width: 12 },
    { header: 'Lớp', key: 'lop', width: 12 },
    { header: 'Phòng Ăn Hiện Tại', key: 'phong_an', width: 20 },
    { header: 'Trạng thái', key: 'trang_thai', width: 16 },
    { header: 'Ghi chú', key: 'ghi_chu', width: 30 },
  ];
  wsAn.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  wsAn.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF366092' },
  };

  const sortedByAn = [...hsList].sort((a, b) => {
    if ((a.ma_phong_an_id || '') < (b.ma_phong_an_id || '')) return -1;
    if ((a.ma_phong_an_id || '') > (b.ma_phong_an_id || '')) return 1;
    if ((a.lop || '') < (b.lop || '')) return -1;
    if ((a.lop || '') > (b.lop || '')) return 1;
    return a.ho_ten.localeCompare(b.ho_ten, 'vi');
  });

  sortedByAn.forEach((h, index) => {
    wsAn.addRow({
      stt: index + 1,
      id: h.id,
      ho_ten: h.ho_ten,
      gioi_tinh: h.gioi_tinh === 'nam' ? 'Nam' : 'Nữ',
      lop: h.lop,
      phong_an: h.ma_phong_an_id || 'Chưa xếp phòng',
      trang_thai: h.dang_hoc ? 'Đang học' : 'Đã rút',
      ghi_chu: h.ghi_chu || '',
    });
  });

  // 3. Sheet Danh sách theo Phòng Ngủ
  const wsNgu = workbook.addWorksheet('HS - Phòng Ngủ');
  wsNgu.columns = [
    { header: 'STT', key: 'stt', width: 8 },
    { header: 'Mã HS', key: 'id', width: 12 },
    { header: 'Họ và tên', key: 'ho_ten', width: 26 },
    { header: 'Giới tính', key: 'gioi_tinh', width: 12 },
    { header: 'Lớp', key: 'lop', width: 12 },
    { header: 'Phòng Ngủ Hiện Tại', key: 'phong_ngu', width: 20 },
    { header: 'Trạng thái', key: 'trang_thai', width: 16 },
    { header: 'Ghi chú', key: 'ghi_chu', width: 30 },
  ];
  wsNgu.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  wsNgu.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF4F81BD' },
  };

  const sortedByNgu = [...hsList].sort((a, b) => {
    if ((a.ma_phong_ngu_id || '') < (b.ma_phong_ngu_id || '')) return -1;
    if ((a.ma_phong_ngu_id || '') > (b.ma_phong_ngu_id || '')) return 1;
    if ((a.lop || '') < (b.lop || '')) return -1;
    if ((a.lop || '') > (b.lop || '')) return 1;
    return a.ho_ten.localeCompare(b.ho_ten, 'vi');
  });

  sortedByNgu.forEach((h, index) => {
    wsNgu.addRow({
      stt: index + 1,
      id: h.id,
      ho_ten: h.ho_ten,
      gioi_tinh: h.gioi_tinh === 'nam' ? 'Nam' : 'Nữ',
      lop: h.lop,
      phong_ngu: h.ma_phong_ngu_id || 'Chưa xếp phòng',
      trang_thai: h.dang_hoc ? 'Đang học' : 'Đã rút',
      ghi_chu: h.ghi_chu || '',
    });
  });

  // 4. Sheet Toàn bộ học sinh
  const wsAll = workbook.addWorksheet('Toàn bộ Học Sinh');
  wsAll.columns = [
    { header: 'Mã HS', key: 'id', width: 12 },
    { header: 'Họ và tên', key: 'ho_ten', width: 26 },
    { header: 'Giới tính', key: 'gioi_tinh', width: 12 },
    { header: 'Lớp', key: 'lop', width: 12 },
    { header: 'Phòng Ăn', key: 'ma_phong_an_id', width: 16 },
    { header: 'Phòng Ngủ', key: 'ma_phong_ngu_id', width: 16 },
    { header: 'Đang học', key: 'dang_hoc', width: 12 },
    { header: 'Ngày vào', key: 'ngay_vao', width: 16 },
    { header: 'Ngày rút', key: 'ngay_rut', width: 16 },
    { header: 'Ghi chú', key: 'ghi_chu', width: 30 },
  ];
  wsAll.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  wsAll.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF203764' },
  };

  hsList.forEach((h) => {
    wsAll.addRow({
      id: h.id,
      ho_ten: h.ho_ten,
      gioi_tinh: h.gioi_tinh === 'nam' ? 'Nam' : 'Nữ',
      lop: h.lop,
      ma_phong_an_id: h.ma_phong_an_id || '',
      ma_phong_ngu_id: h.ma_phong_ngu_id || '',
      dang_hoc: h.dang_hoc ? 'Có' : 'Không',
      ngay_vao: h.ngay_vao || '',
      ngay_rut: h.ngay_rut || '',
      ghi_chu: h.ghi_chu || '',
    });
  });

  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10);
  const outPath = path.join(__dirname, '..', 'backup', `backup_hoc_sinh_phong_${dateStr}.xlsx`);
  await workbook.xlsx.writeFile(outPath);

  console.log(`✅ Xuất file Excel thành công: ${outPath}`);
  process.exit(0);
}

exportExcel().catch((err) => {
  console.error('❌ Lỗi xuất file Excel:', err);
  process.exit(1);
});
