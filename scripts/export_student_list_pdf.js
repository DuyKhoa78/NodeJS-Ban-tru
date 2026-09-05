require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { sequelize, HocSinh, CauHinhHeThong } = require('../src/models');

// Định vị trình duyệt Chrome hoặc Edge
function getBrowserPath() {
  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
  if (fs.existsSync(chromePath)) return chromePath;
  if (fs.existsSync(edgePath)) return edgePath;
  throw new Error('Không tìm thấy trình duyệt Chrome hoặc Edge trên máy tính');
}

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

function generateClassHtml(lop, students, namHoc, nguoiPhuTrach, todayStr, isPageBreak = false) {
  const namCount = students.filter(s => s.gioi_tinh === 0).length;
  const nuCount = students.filter(s => s.gioi_tinh === 1).length;

  const rowsHtml = students.map((s, idx) => `
    <tr>
      <td class="tc">${idx + 1}</td>
      <td class="tc font-bold">${s.id}</td>
      <td class="tl name-col">${s.ho_ten}</td>
      <td class="tc font-bold room-col">${s.ma_phong_an_id || '-'}</td>
      <td class="tc font-bold room-col">${s.ma_phong_ngu_id || '-'}</td>
      <td class="tl note-col">${s.ghi_chu || ''}</td>
    </tr>
  `).join('');

  return `
  <div class="page-container ${isPageBreak ? 'page-break' : ''}">
    <div class="hdr">
      <div class="hdr-left">
        <div class="hdr-line1">SỞ GIÁO DỤC VÀ ĐÀO TẠO TP. HỒ CHÍ MINH</div>
        <div class="hdr-line2">TRUNG TÂM GD KT TH VÀ HN LÊ THỊ HỒNG GẤM</div>
        <div class="hdr-line3">Bộ phận Quản lý Bán trú</div>
      </div>
      <div class="hdr-right">
        <div class="hdr-line1">CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</div>
        <div class="hdr-line2">Độc lập – Tự do – Hạnh phúc</div>
        <div class="hdr-divider"></div>
      </div>
    </div>

    <div class="title-wrap">
      <h1 class="main-title">DANH SÁCH HỌC SINH BÁN TRÚ</h1>
      <div class="sub-class">LỚP: ${lop}</div>
      <div class="sub-year">Năm học: ${namHoc}</div>
    </div>

    <table class="data-table">
      <thead>
        <tr>
          <th style="width: 42px;">STT</th>
          <th style="width: 65px;">Mã BT</th>
          <th style="width: 240px;">Họ và tên</th>
          <th style="width: 65px;">PA</th>
          <th style="width: 65px;">PN</th>
          <th>Ghi chú</th>
        </tr>
      </thead>
      <tbody>
        ${rowsHtml}
      </tbody>
    </table>

    <div class="summary-line">
      * Tổng cộng: <strong>${students.length}</strong> học sinh (Nam: <strong>${namCount}</strong>, Nữ: <strong>${nuCount}</strong>).
      <span style="font-style: italic; color: #333; margin-left: 15px;">(PA: Phòng Ăn, PN: Phòng Ngủ)</span>
    </div>

    <div class="sig-wrap">
      <div class="sig-col">
        <div class="sig-date">${todayStr}</div>
        <div class="sig-role">GIÁM ĐỐC</div>
        <div class="sig-hint">(Ký và ghi rõ họ tên)</div>
        <div class="sig-space"></div>
        <div class="sig-name">${nguoiPhuTrach}</div>
      </div>
    </div>
  </div>
  `;
}

function getBaseCss() {
  return `
  @page {
    size: A4 portrait;
    margin: 8mm 12mm 8mm 15mm;
  }
  * {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
  }
  body {
    font-family: "Times New Roman", Times, serif;
    font-size: 10.5pt;
    color: #000;
    background: #fff;
    line-height: 1.2;
  }
  .page-container {
    width: 100%;
    margin: 0 auto;
  }
  .page-break {
    page-break-before: always;
    break-before: page;
  }
  .hdr {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 6px;
  }
  .hdr-left {
    text-align: center;
    width: 48%;
  }
  .hdr-left .hdr-line1 {
    font-size: 8.5pt;
  }
  .hdr-left .hdr-line2 {
    font-size: 9pt;
    font-weight: bold;
  }
  .hdr-left .hdr-line3 {
    font-size: 8.5pt;
    font-style: italic;
    text-decoration: underline;
  }
  .hdr-right {
    text-align: center;
    width: 50%;
  }
  .hdr-right .hdr-line1 {
    font-size: 9pt;
    font-weight: bold;
  }
  .hdr-right .hdr-line2 {
    font-size: 9pt;
    font-weight: bold;
  }
  .hdr-divider {
    width: 130px;
    height: 1px;
    background: #000;
    margin: 2px auto 0;
  }
  .title-wrap {
    text-align: center;
    margin: 6px 0 8px;
  }
  .main-title {
    font-size: 14pt;
    font-weight: bold;
    letter-spacing: 0.5px;
  }
  .sub-class {
    font-size: 12.5pt;
    font-weight: bold;
    color: #1e3a8a;
    margin-top: 1px;
  }
  .sub-year {
    font-size: 9.5pt;
    font-style: italic;
    color: #444;
  }
  .data-table {
    width: 100%;
    border-collapse: collapse;
    border: 1.5px solid #000;
    margin-bottom: 5px;
  }
  .data-table th, .data-table td {
    border: 1px solid #000;
    padding: 3px 5px;
    vertical-align: middle;
  }
  .data-table th {
    background-color: #f2f2f2;
    font-weight: bold;
    text-align: center;
    font-size: 9.5pt;
  }
  .tc { text-align: center; }
  .tl { text-align: left; }
  .tr { text-align: right; }
  .font-bold { font-weight: bold; }
  .name-col { padding-left: 8px; font-weight: 600; }
  .room-col { font-size: 9.5pt; }
  .note-col { font-size: 9pt; }
  .summary-line {
    font-size: 9.5pt;
    margin-bottom: 8px;
  }
  .sig-wrap {
    display: flex;
    justify-content: flex-end;
    align-items: flex-start;
    margin-top: 8px;
    page-break-inside: avoid;
    break-inside: avoid;
  }
  .sig-col {
    min-width: 220px;
    text-align: center;
  }
  .sig-date {
    font-style: italic;
    font-size: 9.5pt;
    margin-bottom: 2px;
  }
  .sig-role {
    font-weight: bold;
    font-size: 10.5pt;
  }
  .sig-hint {
    font-style: italic;
    font-size: 9pt;
  }
  .sig-space {
    height: 55px;
  }
  .sig-name {
    font-weight: bold;
    font-size: 10.5pt;
  }
  `;
}

function syncToLegacyDir(sourcePdf, legacyPdfPath) {
  try {
    fs.copyFileSync(sourcePdf, legacyPdfPath);
    return { path: legacyPdfPath, status: 'ok' };
  } catch (err) {
    if (err.code === 'EBUSY' || err.code === 'EPERM') {
      const fallback = legacyPdfPath.replace(/\.pdf$/, '_moi.pdf');
      try {
        fs.copyFileSync(sourcePdf, fallback);
        return { path: fallback, status: 'fallback_locked' };
      } catch (e2) {
        return { path: fallback, status: 'error' };
      }
    }
    return { path: legacyPdfPath, status: 'error' };
  }
}

async function main() {
  console.log('🚀 Đang kết nối cơ sở dữ liệu...');
  await sequelize.authenticate();

  const cauHinh = await CauHinhHeThong.findByPk(1, { raw: true });
  const namHoc = cauHinh?.nam_hoc || '2026-2027';
  const nguoiPhuTrach = cauHinh?.nguoi_phu_trach || 'Vũ Quốc Phong';

  const d = new Date();
  const todayStr = `TP. Hồ Chí Minh, ngày ${d.getDate()} tháng ${d.getMonth() + 1} năm ${d.getFullYear()}`;

  const allStudents = await HocSinh.findAll({
    where: { dang_hoc: true },
    raw: true,
  });
  console.log(`✅ Đã tải ${allStudents.length} học sinh đang học.`);

  // Nhóm học sinh theo lớp
  const classMap = new Map();
  allStudents.forEach(s => {
    const lop = (s.lop || 'Chưa xếp lớp').trim();
    if (!classMap.has(lop)) classMap.set(lop, []);
    classMap.get(lop).push(s);
  });

  // Sắp xếp các lớp theo thứ tự tự nhiên (10A1 -> 10A10 -> 11A1 -> 12A10)
  const sortedClasses = Array.from(classMap.keys()).sort(compareClasses);

  // Sắp xếp học sinh trong từng lớp theo Alphabet tên tiếng Việt
  sortedClasses.forEach(lop => {
    const arr = classMap.get(lop);
    arr.sort((a, b) => compareVietnameseNames(a.ho_ten, b.ho_ten));
  });

  // Thư mục lưu PDF mới và thư mục đồng bộ
  const outputDirPrimary = path.resolve(__dirname, '../../Danh_Sach_HS_Theo_Lop_PDF');
  const outputDirLegacy = path.resolve(__dirname, '../../Danh_Sach_HS_Tung_Lop_PDF');

  if (!fs.existsSync(outputDirPrimary)) fs.mkdirSync(outputDirPrimary, { recursive: true });
  if (!fs.existsSync(outputDirLegacy)) fs.mkdirSync(outputDirLegacy, { recursive: true });

  const browser = getBrowserPath();
  console.log(`🌐 Trình duyệt xuất PDF: ${browser}`);
  console.log(`📁 Thư mục xuất chính: ${outputDirPrimary}`);
  console.log(`📁 Thư mục đồng bộ: ${outputDirLegacy}\n`);

  const baseCss = getBaseCss();
  let masterPagesHtml = [];

  // 1. Xuất file PDF cho từng lớp
  let count = 0;
  for (const lop of sortedClasses) {
    count++;
    const students = classMap.get(lop);
    const classHtmlContent = generateClassHtml(lop, students, namHoc, nguoiPhuTrach, todayStr, false);

    // Lưu vào danh sách master
    masterPagesHtml.push(generateClassHtml(lop, students, namHoc, nguoiPhuTrach, todayStr, count > 1));

    const fullHtml = `<!DOCTYPE html>
    <html lang="vi">
    <head>
      <meta charset="UTF-8">
      <title>Danh sách học sinh bán trú - Lớp ${lop}</title>
      <style>${baseCss}</style>
    </head>
    <body>
      ${classHtmlContent}
    </body>
    </html>`;

    const pdfFileName = `Danh_Sach_HS_${lop.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`;
    const tempHtmlFile = path.join(outputDirPrimary, `temp_${Date.now()}_${lop}.html`);
    const primaryPdfPath = path.join(outputDirPrimary, pdfFileName);
    const legacyPdfPath = path.join(outputDirLegacy, pdfFileName);

    fs.writeFileSync(tempHtmlFile, fullHtml, 'utf8');

    // In PDF trực tiếp bằng Chrome headless vào thư mục chính
    const cmd = `"${browser}" --headless=new --disable-gpu --no-pdf-header-footer --print-to-pdf="${primaryPdfPath}" "${tempHtmlFile}"`;
    execSync(cmd);

    // Dọn dẹp file html tạm
    if (fs.existsSync(tempHtmlFile)) {
      try { fs.unlinkSync(tempHtmlFile); } catch (e) {}
    }

    // Đồng bộ sang thư mục legacy
    const syncRes = syncToLegacyDir(primaryPdfPath, legacyPdfPath);
    const syncNote = syncRes.status === 'fallback_locked' ? ' (Legacy đang mở xem, lưu bản _moi.pdf)' : '';

    console.log(`[${count}/${sortedClasses.length}] ✅ Lớp ${lop} (${students.length} HS) -> ${pdfFileName}${syncNote}`);
  }

  // 2. Xuất file PDF tổng hợp toàn bộ 29 lớp
  console.log('\n📄 Đang tạo file PDF tổng hợp toàn bộ 29 lớp...');
  const masterFullHtml = `<!DOCTYPE html>
  <html lang="vi">
  <head>
    <meta charset="UTF-8">
    <title>Tổng hợp Danh sách học sinh bán trú tất cả các lớp</title>
    <style>${baseCss}</style>
  </head>
  <body>
    ${masterPagesHtml.join('\n')}
  </body>
  </html>`;

  const masterTempHtml = path.join(outputDirPrimary, `temp_${Date.now()}_master.html`);
  const primaryMasterPdf = path.join(outputDirPrimary, '00_Tong_Hop_Tat_Ca_29_Lop.pdf');
  const legacyMasterPdf = path.join(outputDirLegacy, '00_Tong_Hop_Tat_Ca_29_Lop.pdf');

  fs.writeFileSync(masterTempHtml, masterFullHtml, 'utf8');

  const masterCmd = `"${browser}" --headless=new --disable-gpu --no-pdf-header-footer --print-to-pdf="${primaryMasterPdf}" "${masterTempHtml}"`;
  execSync(masterCmd);

  if (fs.existsSync(masterTempHtml)) {
    try { fs.unlinkSync(masterTempHtml); } catch (e) {}
  }

  const masterSyncRes = syncToLegacyDir(primaryMasterPdf, legacyMasterPdf);
  const masterSyncNote = masterSyncRes.status === 'fallback_locked' ? ' (Legacy đang mở xem, lưu bản _moi.pdf)' : '';

  console.log(`🎉 Tạo thành công file PDF tổng hợp: 00_Tong_Hop_Tat_Ca_29_Lop.pdf${masterSyncNote}`);
  console.log(`\n✨ HOÀN TẤT XUẤT ${sortedClasses.length} FILE PDF RIÊNG TỪNG LỚP + 1 FILE TỔNG HỢP!`);
  console.log(`📂 Thư mục chính: ${outputDirPrimary}`);
  console.log(`📂 Thư mục đồng bộ: ${outputDirLegacy}`);

  process.exit(0);
}

main().catch(err => {
  console.error('❌ Lỗi:', err);
  process.exit(1);
});
