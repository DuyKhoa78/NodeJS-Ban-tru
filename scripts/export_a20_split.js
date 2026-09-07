const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const fs = require('fs');
const { execSync } = require('child_process');
const ExcelJS = require('exceljs');
const { sequelize, HocSinh, CauHinhHeThong } = require('../src/models');

function getBrowserPath() {
  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
  if (fs.existsSync(chromePath)) return chromePath;
  if (fs.existsSync(edgePath)) return edgePath;
  throw new Error('Không tìm thấy trình duyệt Chrome hoặc Edge trên máy tính');
}

// ── 1. HÀM TẠO FILE EXCEL VỚI EXCELJS ──
async function exportExcelPart(filePath, title, partName, rangeDesc, students, namHoc, offset = 0) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Bộ phận Quản lý Bán trú';
  workbook.created = new Date();

  const worksheet = workbook.addWorksheet('Danh_Sach_A20', {
    pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1 }
  });

  // Tiêu đề trường & Quốc hiệu
  worksheet.mergeCells('A1:C1');
  worksheet.getCell('A1').value = 'SỞ GIÁO DỤC VÀ ĐÀO TẠO TP.HCM';
  worksheet.getCell('A1').font = { name: 'Times New Roman', size: 10, bold: false };
  worksheet.getCell('A1').alignment = { horizontal: 'center' };

  worksheet.mergeCells('E1:H1');
  worksheet.getCell('E1').value = 'CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM';
  worksheet.getCell('E1').font = { name: 'Times New Roman', size: 10, bold: true };
  worksheet.getCell('E1').alignment = { horizontal: 'center' };

  worksheet.mergeCells('A2:C2');
  worksheet.getCell('A2').value = 'TRƯỜNG THPT LÊ THỊ HỒNG GẤM';
  worksheet.getCell('A2').font = { name: 'Times New Roman', size: 11, bold: true };
  worksheet.getCell('A2').alignment = { horizontal: 'center' };

  worksheet.mergeCells('E2:H2');
  worksheet.getCell('E2').value = 'Độc lập – Tự do – Hạnh phúc';
  worksheet.getCell('E2').font = { name: 'Times New Roman', size: 10, bold: true };
  worksheet.getCell('E2').alignment = { horizontal: 'center' };

  worksheet.mergeCells('A3:C3');
  worksheet.getCell('A3').value = 'Bộ phận Quản lý Bán trú';
  worksheet.getCell('A3').font = { name: 'Times New Roman', size: 10, italic: true, underline: true };
  worksheet.getCell('A3').alignment = { horizontal: 'center' };

  // Dòng tiêu đề chính
  worksheet.mergeCells('A5:H5');
  worksheet.getCell('A5').value = `DANH SÁCH HỌC SINH PHÒNG NGỦ A20 - ${partName.toUpperCase()}`;
  worksheet.getCell('A5').font = { name: 'Times New Roman', size: 14, bold: true, color: { argb: 'FF1E3A8A' } };
  worksheet.getCell('A5').alignment = { horizontal: 'center', vertical: 'middle' };

  worksheet.mergeCells('A6:H6');
  worksheet.getCell('A6').value = `Phạm vi: ${rangeDesc} | Năm học: ${namHoc} | Sĩ số tờ này: ${students.length} HS (Nam)`;
  worksheet.getCell('A6').font = { name: 'Times New Roman', size: 10.5, italic: true };
  worksheet.getCell('A6').alignment = { horizontal: 'center', vertical: 'middle' };

  // Bảng Header
  const headers = ['STT', 'Mã BT', 'Họ và tên học sinh', 'Lớp', 'Phòng ăn', 'Phòng ngủ', 'Điểm danh', 'Ghi chú'];
  const headerRow = worksheet.getRow(8);
  headerRow.values = headers;
  headerRow.height = 26;

  headerRow.eachCell((cell) => {
    cell.font = { name: 'Times New Roman', size: 10.5, bold: true, color: { argb: 'FF0F172A' } };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE2E8F0' }
    };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = {
      top: { style: 'thin' },
      left: { style: 'thin' },
      bottom: { style: 'thin' },
      right: { style: 'thin' }
    };
  });

  // Dữ liệu học sinh
  students.forEach((s, idx) => {
    const row = worksheet.addRow([
      offset + idx + 1,
      s.id,
      s.ho_ten,
      s.lop || '',
      s.ma_phong_an_id || '-',
      s.ma_phong_ngu_id || 'A20',
      '',
      s.ghi_chu || ''
    ]);

    row.height = 20;

    row.eachCell((cell, colNumber) => {
      cell.font = { name: 'Times New Roman', size: 10 };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        right: { style: 'thin', color: { argb: 'FFCBD5E1' } }
      };

      // Căn lề
      if (colNumber === 1 || colNumber === 2 || colNumber === 4 || colNumber === 5 || colNumber === 6) {
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
      } else if (colNumber === 3) {
        cell.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
        cell.font = { name: 'Times New Roman', size: 10, bold: true };
      } else {
        cell.alignment = { horizontal: 'left', vertical: 'middle' };
      }

      if (colNumber === 2) {
        cell.font = { name: 'Times New Roman', size: 10, bold: true, color: { argb: 'FF2563EB' } };
      }
    });

    if (idx % 2 === 1) {
      row.eachCell((cell) => {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFF8FAFC' }
        };
      });
    }
  });

  // Độ rộng các cột
  worksheet.columns = [
    { key: 'stt', width: 8 },
    { key: 'id', width: 12 },
    { key: 'name', width: 30 },
    { key: 'lop', width: 10 },
    { key: 'phong_an', width: 13 },
    { key: 'phong_ngu', width: 13 },
    { key: 'diem_danh', width: 14 },
    { key: 'ghi_chu', width: 18 }
  ];

  // Phần ký tên cuối trang
  const curRow = worksheet.lastRow.number + 2;
  const today = new Date();
  const dateStr = `TP. Hồ Chí Minh, ngày ${today.getDate()} tháng ${today.getMonth() + 1} năm ${today.getFullYear()}`;

  worksheet.mergeCells(`F${curRow}:H${curRow}`);
  worksheet.getCell(`F${curRow}`).value = dateStr;
  worksheet.getCell(`F${curRow}`).font = { name: 'Times New Roman', size: 10.5, italic: true };
  worksheet.getCell(`F${curRow}`).alignment = { horizontal: 'center' };

  worksheet.mergeCells(`F${curRow + 1}:H${curRow + 1}`);
  worksheet.getCell(`F${curRow + 1}`).value = 'NGƯỜI LẬP DANH SÁCH';
  worksheet.getCell(`F${curRow + 1}`).font = { name: 'Times New Roman', size: 11, bold: true };
  worksheet.getCell(`F${curRow + 1}`).alignment = { horizontal: 'center' };

  worksheet.mergeCells(`A${curRow + 1}:C${curRow + 1}`);
  worksheet.getCell(`A${curRow + 1}`).value = 'GIÁM ĐỐC / PHỤ TRÁCH BÁN TRÚ';
  worksheet.getCell(`A${curRow + 1}`).font = { name: 'Times New Roman', size: 11, bold: true };
  worksheet.getCell(`A${curRow + 1}`).alignment = { horizontal: 'center' };

  await workbook.xlsx.writeFile(filePath);
}

// ── 2. HÀM TẠO FILE PDF CHUẨN IN A4 QUA CHROME HEADLESS ──
function generatePdfHtml(partName, rangeDesc, students, namHoc, nguoiPhuTrach, offset = 0) {
  const today = new Date();
  const todayStr = `TP. Hồ Chí Minh, ngày ${today.getDate()} tháng ${today.getMonth() + 1} năm ${today.getFullYear()}`;

  const rowsHtml = students.map((s, idx) => `
    <tr>
      <td class="tc">${offset + idx + 1}</td>
      <td class="tc font-bold">${s.id}</td>
      <td class="tl name-col">${s.ho_ten}</td>
      <td class="tc font-bold">${s.lop || ''}</td>
      <td class="tc font-bold room-col">${s.ma_phong_an_id || '-'}</td>
      <td class="tc font-bold room-col">${s.ma_phong_ngu_id || 'A20'}</td>
      <td class="tc check-col"></td>
      <td class="tl note-col">${s.ghi_chu || ''}</td>
    </tr>
  `).join('');

  return `<!DOCTYPE html>
  <html lang="vi">
  <head>
    <meta charset="UTF-8">
    <title>Danh sách học sinh Phòng A20 - ${partName}</title>
    <style>
      @page {
        size: A4 portrait;
        margin: 8mm 10mm 8mm 12mm;
      }
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body {
        font-family: "Times New Roman", Times, serif;
        font-size: 9.8pt;
        color: #000;
        background: #fff;
        line-height: 1.15;
      }
      .hdr {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        margin-bottom: 6px;
      }
      .hdr-left { text-align: center; width: 48%; }
      .hdr-left .l1 { font-size: 8.5pt; }
      .hdr-left .l2 { font-size: 9.5pt; font-weight: bold; }
      .hdr-left .l3 { font-size: 8.5pt; font-style: italic; text-decoration: underline; }
      .hdr-right { text-align: center; width: 50%; }
      .hdr-right .l1 { font-size: 9pt; font-weight: bold; }
      .hdr-right .l2 { font-size: 9pt; font-weight: bold; }
      .hdr-divider { width: 130px; height: 1px; background: #000; margin: 2px auto 0; }
      .title-wrap { text-align: center; margin: 6px 0 8px; }
      .main-title { font-size: 13.5pt; font-weight: bold; letter-spacing: 0.5px; }
      .sub-title { font-size: 11pt; font-weight: bold; color: #1e3a8a; margin-top: 1px; }
      .sub-meta { font-size: 9pt; font-style: italic; color: #333; }
      .data-table {
        width: 100%;
        border-collapse: collapse;
        border: 1.5px solid #000;
        margin-bottom: 5px;
      }
      .data-table th, .data-table td {
        border: 1px solid #000;
        padding: 3px 4px;
        vertical-align: middle;
      }
      .data-table th {
        background-color: #f1f5f9;
        font-weight: bold;
        text-align: center;
        font-size: 9.2pt;
      }
      .tc { text-align: center; }
      .tl { text-align: left; }
      .font-bold { font-weight: bold; }
      .name-col { padding-left: 6px; font-weight: 600; }
      .room-col { font-size: 9pt; }
      .note-col { font-size: 8.5pt; }
      .check-col { width: 65px; }
      .summary-line { font-size: 9.2pt; margin-bottom: 6px; }
      .sig-wrap {
        display: flex;
        justify-content: flex-end;
        margin-top: 8px;
        page-break-inside: avoid;
      }
      .sig-col { min-width: 220px; text-align: center; }
      .sig-date { font-style: italic; font-size: 9.2pt; margin-bottom: 2px; }
      .sig-role { font-weight: bold; font-size: 10pt; }
      .sig-hint { font-style: italic; font-size: 8.5pt; }
      .sig-space { height: 45px; }
    </style>
  </head>
  <body>
    <div class="hdr">
      <div class="hdr-left">
        <div class="l1">SỞ GIÁO DỤC VÀ ĐÀO TẠO TP. HỒ CHÍ MINH</div>
        <div class="l2">TRƯỜNG THPT LÊ THI HỒNG GẤM</div>
        <div class="l3">Bộ phận Quản lý Bán trú</div>
      </div>
      <div class="hdr-right">
        <div class="l1">CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</div>
        <div class="l2">Độc lập – Tự do – Hạnh phúc</div>
        <div class="hdr-divider"></div>
      </div>
    </div>

    <div class="title-wrap">
      <h1 class="main-title">DANH SÁCH HỌC SINH PHÒNG NGỦ A20</h1>
      <div class="sub-title">${partName.toUpperCase()}</div>
      <div class="sub-meta">Phạm vi: ${rangeDesc} &nbsp;|&nbsp; Năm học: ${namHoc} &nbsp;|&nbsp; Sĩ số tờ này: ${students.length} học sinh</div>
    </div>

    <table class="data-table">
      <thead>
        <tr>
          <th style="width: 32px;">STT</th>
          <th style="width: 55px;">Mã BT</th>
          <th style="width: 220px;">Họ và tên học sinh</th>
          <th style="width: 50px;">Lớp</th>
          <th style="width: 65px;">Phòng ăn</th>
          <th style="width: 65px;">Phòng ngủ</th>
          <th class="check-col">Điểm danh</th>
          <th>Ghi chú</th>
        </tr>
      </thead>
      <tbody>
        ${rowsHtml}
      </tbody>
    </table>

    <div class="summary-line">
      Tổng cộng: <strong>${students.length} học sinh</strong> (Nam).
    </div>

    <div class="sig-wrap">
      <div class="sig-col">
        <div class="sig-date">${todayStr}</div>
        <div class="sig-role">PHỤ TRÁCH BÁN TRÚ</div>
        <div class="sig-hint">(Ký và ghi rõ họ tên)</div>
        <div class="sig-space"></div>
        <div class="sig-role">${nguoiPhuTrach}</div>
      </div>
    </div>
  </body>
  </html>`;
}

async function main() {
  console.log('🔄 Đang kết nối CSDL và nạp dữ liệu học sinh phòng A20...');
  await sequelize.authenticate();

  const heThong = await CauHinhHeThong.findByPk(1);
  const namHoc = heThong?.nam_hoc || '2026-2027';
  const nguoiPhuTrach = heThong?.nguoi_phu_trach || 'Vũ Quốc Phong';

  const students = await HocSinh.findAll({
    where: { ma_phong_ngu_id: 'A20', dang_hoc: true },
    raw: true
  });

  console.log(`✅ Tìm thấy ${students.length} học sinh đang học tại phòng A20.`);

  // 1. Sắp xếp theo thứ tự Mã Bán Trú từ nhỏ đến lớn (từ trên xuống)
  students.sort((a, b) => Number(a.id) - Number(b.id));

  // 2. Chia đều ra: Khi đủ số lượng thì tách sang tờ tiếp theo
  const half = Math.ceil(students.length / 2); // 58 HS
  const part1 = students.slice(0, half);       // 58 HS (Mã BT từ nhỏ nhất đến thứ 58)
  const part2 = students.slice(half);          // 57 HS (Mã BT từ thứ 59 đến 115)

  const rangeDesc1 = `Mã BT từ ${part1[0].id} đến ${part1[part1.length - 1].id} (58 HS)`;
  const rangeDesc2 = `Mã BT từ ${part2[0].id} đến ${part2[part2.length - 1].id} (57 HS)`;

  console.log(`\n📋 Phân chia danh sách theo Mã Bán Trú:`);
  console.log(`   - Tờ 1: ${part1.length} học sinh (${rangeDesc1})`);
  console.log(`   - Tờ 2: ${part2.length} học sinh (${rangeDesc2})`);

  // Thư mục lưu file
  const outDir = path.resolve(__dirname, '../../Danh_Sach_HS_Phong_A20');
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  // Xóa bỏ file "Toàn bộ 115 HS" nếu có, chỉ giữ lại đúng 2 tờ (2 file)
  const oldFullXlsx = path.join(outDir, 'Danh_Sach_HS_Phong_A20_Toan_Bo_115_HS.xlsx');
  const oldFullPdf  = path.join(outDir, 'Danh_Sach_HS_Phong_A20_Toan_Bo_115_HS.pdf');
  if (fs.existsSync(oldFullXlsx)) { fs.unlinkSync(oldFullXlsx); console.log('🗑️ Đã xóa file thừa: Toan_Bo_115_HS.xlsx'); }
  if (fs.existsSync(oldFullPdf))  { fs.unlinkSync(oldFullPdf);  console.log('🗑️ Đã xóa file thừa: Toan_Bo_115_HS.pdf'); }

  // 1. Xuất file Excel (.xlsx) cho đúng 2 tờ
  console.log('\n📊 Đang tạo 2 file Excel (.xlsx)...');
  const xlsxPart1 = path.join(outDir, 'Danh_Sach_HS_Phong_A20_Phan_1.xlsx');
  const xlsxPart2 = path.join(outDir, 'Danh_Sach_HS_Phong_A20_Phan_2.xlsx');
  const xlsxTo1   = path.join(outDir, 'Danh_Sach_HS_Phong_A20_To_1.xlsx');
  const xlsxTo2   = path.join(outDir, 'Danh_Sach_HS_Phong_A20_To_2.xlsx');

  await exportExcelPart(xlsxPart1, 'DANH SÁCH HỌC SINH PHÒNG NGỦ A20', 'Tờ 1 (Phần 1)', rangeDesc1, part1, namHoc, 0);
  await exportExcelPart(xlsxPart2, 'DANH SÁCH HỌC SINH PHÒNG NGỦ A20', 'Tờ 2 (Phần 2)', rangeDesc2, part2, namHoc, 58);
  fs.copyFileSync(xlsxPart1, xlsxTo1);
  fs.copyFileSync(xlsxPart2, xlsxTo2);
  console.log(`   ✅ Đã tạo Tờ 1: ${xlsxTo1} (${part1.length} HS, Mã BT: ${part1[0].id} -> ${part1[part1.length-1].id})`);
  console.log(`   ✅ Đã tạo Tờ 2: ${xlsxTo2} (${part2.length} HS, Mã BT: ${part2[0].id} -> ${part2[part2.length-1].id})`);

  // 2. Xuất file PDF bằng Chrome Headless cho đúng 2 tờ
  console.log('\n📄 Đang tạo 2 file PDF chuẩn in A4...');
  const browser = getBrowserPath();

  // PDF Tờ 1
  const html1 = generatePdfHtml('Tờ 1 (Phần 1)', rangeDesc1, part1, namHoc, nguoiPhuTrach, 0);
  const tempHtml1 = path.join(outDir, 'temp_p1.html');
  const pdfPart1 = path.join(outDir, 'Danh_Sach_HS_Phong_A20_Phan_1.pdf');
  const pdfTo1   = path.join(outDir, 'Danh_Sach_HS_Phong_A20_To_1.pdf');
  fs.writeFileSync(tempHtml1, html1, 'utf8');
  execSync(`"${browser}" --headless=new --disable-gpu --no-pdf-header-footer --print-to-pdf="${pdfPart1}" "${tempHtml1}"`);
  if (fs.existsSync(tempHtml1)) fs.unlinkSync(tempHtml1);
  fs.copyFileSync(pdfPart1, pdfTo1);
  console.log(`   ✅ Đã tạo Tờ 1: ${pdfTo1} (${part1.length} HS)`);

  // PDF Tờ 2
  const html2 = generatePdfHtml('Tờ 2 (Phần 2)', rangeDesc2, part2, namHoc, nguoiPhuTrach, 58);
  const tempHtml2 = path.join(outDir, 'temp_p2.html');
  const pdfPart2 = path.join(outDir, 'Danh_Sach_HS_Phong_A20_Phan_2.pdf');
  const pdfTo2   = path.join(outDir, 'Danh_Sach_HS_Phong_A20_To_2.pdf');
  fs.writeFileSync(tempHtml2, html2, 'utf8');
  execSync(`"${browser}" --headless=new --disable-gpu --no-pdf-header-footer --print-to-pdf="${pdfPart2}" "${tempHtml2}"`);
  if (fs.existsSync(tempHtml2)) fs.unlinkSync(tempHtml2);
  fs.copyFileSync(pdfPart2, pdfTo2);
  console.log(`   ✅ Đã tạo Tờ 2: ${pdfTo2} (${part2.length} HS)`);

  console.log(`\n🎉 HOÀN TẤT: ĐÃ XUẤT ĐÚNG 2 TỜ CHO PHÒNG A20 (SORT THEO MÃ BÁN TRÚ TỪ TRÊN XUỐNG)!`);
  console.log(`📂 Thư mục: ${outDir}`);

  process.exit(0);
}

main().catch(err => {
  console.error('❌ Lỗi:', err);
  process.exit(1);
});
