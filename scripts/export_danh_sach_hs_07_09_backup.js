const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');

function compareClasses(lopA, lopB) {
  const matchA = (lopA || '').trim().match(/^(\d+)(.*)$/);
  const matchB = (lopB || '').trim().match(/^(\d+)(.*)$/);
  if (matchA && matchB) {
    const numA = parseInt(matchA[1], 10);
    const numB = parseInt(matchB[1], 10);
    if (numA !== numB) return numA - numB;
    return matchA[2].localeCompare(matchB[2], 'vi', { numeric: true, sensitivity: 'base' });
  }
  return (lopA || '').localeCompare(lopB || '', 'vi', { numeric: true });
}

function getSortNames(fullName) {
  if (!fullName) return { first: '', middle: '', last: '' };
  const cleanName = fullName.replace(/\s*\(.*?\)\s*/g, '').trim();
  const parts = cleanName.split(/\s+/);
  const first = parts.pop() || '';
  const last = parts.length > 0 ? parts[0] : '';
  const middle = parts.slice(1).join(' ');
  return { first, middle, last };
}

function compareVietnameseNames(nameA, nameB) {
  const a = getSortNames(nameA);
  const b = getSortNames(nameB);
  let cmp = a.first.localeCompare(b.first, 'vi');
  if (cmp !== 0) return cmp;
  cmp = a.last.localeCompare(b.last, 'vi');
  if (cmp !== 0) return cmp;
  return a.middle.localeCompare(b.middle, 'vi');
}

async function run() {
  // Lấy dữ liệu chuẩn từ file backup ngày 11/09/2026
  const bPath = path.join(__dirname, '../backup/backup_full_2026-09-11T14-53-17-303Z.json');
  console.log('📦 Đang đọc dữ liệu chuẩn từ file:', bPath);
  const data = JSON.parse(fs.readFileSync(bPath, 'utf8'));
  const hsList = data.HocSinh;

  // Loại trừ HS 866 (Phạm Hoàng Gia Phát có ngay_vao = '2026-09-14') và HS 598 (Châu Hoài Phương rút ngày 07/09)
  // Kết quả: ĐÚNG CHUẨN 802 HỌC SINH CỦA NGÀY 07/09/2026 TRƯỚC GIỜ ĂN
  const hs802 = hsList.filter(h => h.id !== 866 && h.id !== 598);

  // Sắp xếp theo lớp và theo Alphabet tên tiếng Việt
  hs802.sort((a, b) => {
    const cLop = compareClasses(a.lop, b.lop);
    if (cLop !== 0) return cLop;
    return compareVietnameseNames(a.ho_ten, b.ho_ten);
  });

  // Bản 798 HS: Loại 4 bạn vào muộn (861 Đông Di, 862 Minh Khang, 864 Hoàng Huy, 865 Lan Anh)
  const hs4Ids = [861, 862, 864, 865];
  const hs798 = hs802.filter(h => !hs4Ids.includes(h.id));

  const wb = new ExcelJS.Workbook();
  wb.creator = 'THPT Lê Thị Hồng Gấm - Quản lý Bán Trú';
  wb.created = new Date();

  const borderStyle = {
    top: { style: 'thin', color: { argb: 'FFD3D3D3' } },
    left: { style: 'thin', color: { argb: 'FFD3D3D3' } },
    bottom: { style: 'thin', color: { argb: 'FFD3D3D3' } },
    right: { style: 'thin', color: { argb: 'FFD3D3D3' } }
  };

  function addStudentSheet(ws, title, list, is802 = false) {
    ws.views = [{ showGridLines: true }];

    // Header Trường
    ws.mergeCells('A1:G1');
    ws.getCell('A1').value = 'TRƯỜNG THPT LÊ THỊ HỒNG GẤM - BỘ PHẬN QUẢN LÝ BÁN TRÚ';
    ws.getCell('A1').font = { name: 'Times New Roman', size: 10, italic: true, bold: true };
    ws.getCell('A1').alignment = { horizontal: 'center' };

    // Tiêu đề chính
    ws.mergeCells('A2:G2');
    ws.getCell('A2').value = title.toUpperCase();
    ws.getCell('A2').font = { name: 'Times New Roman', size: 13, bold: true, color: { argb: is802 ? 'FF1E3A8A' : 'FF065F46' } };
    ws.getCell('A2').alignment = { horizontal: 'center' };

    // Subtitle
    ws.mergeCells('A3:G3');
    ws.getCell('A3').value = 'Nguồn: Backup chuẩn 11/09/2026 | Ngày báo ăn: 07/09/2026 | Tổng số: ' + list.length + ' học sinh';
    ws.getCell('A3').font = { name: 'Times New Roman', size: 10, italic: true };
    ws.getCell('A3').alignment = { horizontal: 'center' };

    // Header bảng
    const headers = ['STT', 'Mã BT', 'Họ và tên', 'Giới tính', 'Lớp', 'Phòng Ăn (07/09)', 'Phòng Ngủ (07/09)'];
    ws.getRow(5).values = headers;
    ws.getRow(5).font = { name: 'Times New Roman', bold: true, color: { argb: 'FFFFFFFF' } };
    ws.getRow(5).alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getRow(5).height = 24;
    for (let c = 1; c <= 7; c++) {
      ws.getCell(5, c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: is802 ? 'FF1E3A8A' : 'FF065F46' } };
    }

    list.forEach((s, idx) => {
      const rowNum = idx + 6;
      const gt = s.gioi_tinh === 1 ? 'Nữ' : 'Nam';
      const pAn = s.ma_phong_an_id || s.phong_an || '';
      const pNgu = s.ma_phong_ngu_id || s.phong_ngu || '';
      
      const r = ws.getRow(rowNum);
      r.values = [idx + 1, s.id, s.ho_ten, gt, s.lop, pAn, pNgu];
      r.height = 19;
      r.font = { name: 'Times New Roman', size: 10.5 };

      r.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
      r.getCell(2).alignment = { horizontal: 'center', vertical: 'middle' };
      r.getCell(2).font = { name: 'Times New Roman', bold: true, size: 10.5 };
      r.getCell(3).alignment = { horizontal: 'left', vertical: 'middle' };
      r.getCell(4).alignment = { horizontal: 'center', vertical: 'middle' };
      r.getCell(5).alignment = { horizontal: 'center', vertical: 'middle' };
      r.getCell(5).font = { name: 'Times New Roman', bold: true, size: 10.5 };
      r.getCell(6).alignment = { horizontal: 'center', vertical: 'middle' };
      r.getCell(7).alignment = { horizontal: 'center', vertical: 'middle' };

      // Highlight 4 em chênh lệch nếu ở bản 802
      if (is802 && hs4Ids.includes(s.id)) {
        for (let c = 1; c <= 7; c++) {
          r.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF08A' } };
          r.getCell(c).font = { name: 'Times New Roman', bold: true, color: { argb: 'FF991B1B' } };
        }
      }

      for (let c = 1; c <= 7; c++) {
        r.getCell(c).border = borderStyle;
      }
    });

    // Dòng tổng kết
    const lastRowNum = list.length + 6;
    ws.mergeCells(`A${lastRowNum}:D${lastRowNum}`);
    ws.getCell(`A${lastRowNum}`).value = 'TỔNG CỘNG HỌC SINH:';
    ws.getCell(`A${lastRowNum}`).font = { name: 'Times New Roman', bold: true };
    ws.getCell(`A${lastRowNum}`).alignment = { horizontal: 'right', vertical: 'middle' };
    ws.getCell(`E${lastRowNum}`).value = list.length;
    ws.getCell(`E${lastRowNum}`).font = { name: 'Times New Roman', bold: true, size: 11, color: { argb: 'FFB91C1C' } };
    ws.getCell(`E${lastRowNum}`).alignment = { horizontal: 'center', vertical: 'middle' };

    ws.getColumn(1).width = 7;
    ws.getColumn(2).width = 10;
    ws.getColumn(3).width = 28;
    ws.getColumn(4).width = 11;
    ws.getColumn(5).width = 11;
    ws.getColumn(6).width = 16;
    ws.getColumn(7).width = 16;
  }

  // 1. Sheet Bản 802 HS (danh sách chuẩn backup 11/09 gửi GV trước ăn)
  const ws1 = wb.addWorksheet('DS_802_HS_Gui_GV_07-09');
  addStudentSheet(ws1, 'Danh sách học sinh bán trú gửi GV (Bản chuẩn 802 HS từ Backup 11/09)', hs802, true);

  // 2. Sheet Bản 798 HS (thực tế sau khi loại 4 bạn vào muộn)
  const ws2 = wb.addWorksheet('DS_798_HS_Thuc_Te_07-09');
  addStudentSheet(ws2, 'Danh sách học sinh bán trú thực tế ngày 07/09/2026 (798 HS)', hs798, false);

  // 3. Sheet So sánh 4 HS chênh lệch
  const ws3 = wb.addWorksheet('Chi_Tiet_4_HS_Chenh_Lech');
  ws3.views = [{ showGridLines: true }];
  ws3.mergeCells('A1:G1');
  ws3.getCell('A1').value = 'BẢNG ĐỐI SOÁT 4 HỌC SINH GÂY LỆCH 4 SUẤT ĂN NGÀY 07/09/2026';
  ws3.getCell('A1').font = { name: 'Times New Roman', size: 13, bold: true, color: { argb: 'FF991B1B' } };
  ws3.getCell('A1').alignment = { horizontal: 'center' };

  ws3.getRow(3).values = ['STT', 'Mã BT', 'Họ và tên', 'Lớp', 'Phòng Ăn (11/09)', 'Ngày Bắt Đầu Ăn Thực Tế', 'Giải trình'];
  ws3.getRow(3).font = { name: 'Times New Roman', bold: true, color: { argb: 'FFFFFFFF' } };
  ws3.getRow(3).height = 25;
  for (let c = 1; c <= 7; c++) {
    ws3.getCell(3, c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF991B1B' } };
    ws3.getCell(3, c).alignment = { horizontal: 'center', vertical: 'middle' };
  }

  const diffRows = [
    [1, 861, 'Võ Hoàng Đông Di', '11A2', 'P1', '08/09/2026 (Thứ Ba)', 'Có tên trong danh sách ban đầu nhưng ngày 07/09 chưa ăn. Ngày 08/09 mới bắt đầu ăn.'],
    [2, 862, 'Nguyễn Minh Khang', '10A8', 'P8', '08/09/2026 (Thứ Ba)', 'Có tên trong danh sách ban đầu nhưng ngày 07/09 chưa ăn. Ngày 08/09 mới bắt đầu ăn.'],
    [3, 864, 'Nguyễn Hoàng Huy', '12A6', 'HT.A', '10/09/2026 (Thứ Năm)', 'Có tên trong danh sách ban đầu nhưng ngày 07/09 chưa ăn. Ngày 10/09 mới bắt đầu ăn.'],
    [4, 865, 'Trần Hoàng Lan Anh', '10A10', 'HT.A', '10/09/2026 (Thứ Năm)', 'Có tên trong danh sách ban đầu nhưng ngày 07/09 chưa ăn. Ngày 10/09 mới bắt đầu ăn.']
  ];

  diffRows.forEach((r, idx) => {
    const rowNum = idx + 4;
    const row = ws3.getRow(rowNum);
    row.values = r;
    row.height = 22;
    row.font = { name: 'Times New Roman', size: 11 };
    for (let c = 1; c <= 7; c++) {
      row.getCell(c).border = borderStyle;
      if (c === 3 || c === 7) row.getCell(c).alignment = { horizontal: 'left', vertical: 'middle' };
      else row.getCell(c).alignment = { horizontal: 'center', vertical: 'middle' };
    }
  });

  ws3.getColumn(1).width = 7;
  ws3.getColumn(2).width = 10;
  ws3.getColumn(3).width = 26;
  ws3.getColumn(4).width = 10;
  ws3.getColumn(5).width = 16;
  ws3.getColumn(6).width = 24;
  ws3.getColumn(7).width = 55;

  // 4. Thêm từng Sheet riêng cho từng Lớp (dành riêng cho GV chủ nhiệm và GV trực từng lớp)
  const lops = [...new Set(hs802.map(h => h.lop))].filter(Boolean).sort(compareClasses);
  lops.forEach(lop => {
    const lopHs = hs802.filter(h => h.lop === lop);
    const wsLop = wb.addWorksheet(lop.substring(0, 31));
    addStudentSheet(wsLop, `Danh sách học sinh bán trú - Lớp ${lop} (Gửi GV)`, lopHs, true);
  });

  const outPath = path.resolve(__dirname, '../../Danh_Sach_HS_BanTru_Gui_GV_07-09-2026_Backup_11-09.xlsx');
  await wb.xlsx.writeFile(outPath);
  console.log('🎉 ĐÃ XUẤT THÀNH CÔNG FILE CHUẨN THEO BACKUP 11/09:');
  console.log('👉 Đường dẫn:', outPath);
}

run().catch(console.error);
