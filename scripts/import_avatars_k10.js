require('dotenv').config();
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { HocSinh, sequelize } = require('../src/models');
const { Op } = require('sequelize');

function normalizeName(str) {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Bảng ánh xạ các trường hợp tên bị lỗi chính tả / lỗi gõ từ studio ảnh
const aliases = {
  '10A1': {
    'tran ngoc xuan an': 'tran ngoc phuong an', // Studio ghi nhầm Xuân An thành Phương An
  },
  '10A3': {
    'do phuong uyen': 'do ngoc phuong uyen', // Đỗ Ngọc Phương Uyên
    'huynh anh khoa': 'huy hf anh khoa', // Studio gõ nhầm telex Huy hf
    'nguyen bao ha': 'nguyen bao hoa', // Nguyễn Bảo Hòa vs Bảo Hà
    'pham gia hao': 'pham gia hao', // Phạm Gia Hào vs Gia Hảo
  },
  '10A5': {
    'hang dang khuong': 'han dang khuong', // Hàn vs Hàng
    'pham hoang gia phat': 'pham hoang gia phap', // Pháp vs Phát
    'pham nguyen bao quyen': 'pham nguyen baoe quyen', // Studio gõ nhầm telex "baoe"
  },
  '10A6': {
    'ngo vu gia phuc': 'ngo vu gia phuacs', // Studio gõ nhầm telex "phuacs"
    'nguy vinh cuong': 'nguyen vinh cuong', // Studio ghi Nguyễn Vĩnh Cường
  },
  '10A7': {
    'le thi thien kim': 'le thi thi thien kim', // Studio gõ lặp chữ "thị"
    'pham hoang long hai': { class: '10A8', name: 'pham hoang long hai' }, // Ảnh nằm trong thư mục 10A8
  },
};

async function runImport() {
  await sequelize.authenticate();
  console.log('✅ Đã kết nối cơ sở dữ liệu.');

  const uploadDir = path.resolve(__dirname, '../uploads/avatars');
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
    console.log(`📁 Đã tạo thư mục: ${uploadDir}`);
  }

  const students = await HocSinh.findAll({
    where: {
      lop: { [Op.like]: '10%' },
      dang_hoc: true,
    },
    order: [['lop', 'ASC'], ['ho_ten', 'ASC']],
  });

  console.log(`📋 Tổng số học sinh khối 10 đang học bán trú: ${students.length}`);

  let imgBaseDir = path.resolve(__dirname, '../../IMG/KHOI 10');
  if (!fs.existsSync(imgBaseDir)) {
    imgBaseDir = path.resolve(__dirname, '../../IMG');
  }
  if (!fs.existsSync(imgBaseDir)) {
    console.error(`❌ Không tìm thấy thư mục ảnh: ${imgBaseDir}`);
    process.exit(1);
  }

  const classDirs = fs.readdirSync(imgBaseDir).filter((f) => {
    return fs.statSync(path.join(imgBaseDir, f)).isDirectory();
  });

  const photoMapByClass = {};
  for (const cDir of classDirs) {
    const p = path.join(imgBaseDir, cDir);
    const files = fs.readdirSync(p).filter((f) => f.match(/\.(jpe?g|png|webp)$/i));
    photoMapByClass[cDir.toUpperCase()] = files.map((file) => {
      const nameWithoutNum = file.replace(/^\d+[\s.,_-]+/, '').replace(/\.[^.]+$/, '').trim();
      return {
        file,
        fullPath: path.join(p, file),
        cleanName: normalizeName(nameWithoutNum),
        originalName: nameWithoutNum,
      };
    });
  }

  let processedCount = 0;
  let totalBytes = 0;
  const unmatched = [];
  const matched = [];

  for (const hs of students) {
    const lop = hs.lop.toUpperCase().trim();
    const hsNorm = normalizeName(hs.ho_ten);
    const classPhotos = photoMapByClass[lop] || [];

    // 1. Khớp chính xác theo tên đã chuẩn hóa
    let found = classPhotos.find((p) => p.cleanName === hsNorm);

    // 2. Khớp qua bảng ánh xạ studio
    if (!found && aliases[lop] && aliases[lop][hsNorm]) {
      const aliasTarget = aliases[lop][hsNorm];
      if (typeof aliasTarget === 'string') {
        found = classPhotos.find((p) => p.cleanName === aliasTarget || p.cleanName.includes(aliasTarget));
      } else if (aliasTarget && aliasTarget.class) {
        const otherPhotos = photoMapByClass[aliasTarget.class] || [];
        found = otherPhotos.find((p) => p.cleanName === aliasTarget.name || p.cleanName.includes(aliasTarget.name));
      }
    }

    // 3. Khớp mờ (chứa chuỗi họ tên)
    if (!found) {
      found = classPhotos.find((p) => {
        return p.cleanName.includes(hsNorm) || hsNorm.includes(p.cleanName);
      });
    }

    if (found) {
      const rawId = hs.id;
      const cardId = `26${String(rawId).padStart(3, '0')}`;
      const destFileRaw = path.join(uploadDir, `${rawId}.jpg`);
      const destFileCard = path.join(uploadDir, `${cardId}.jpg`);

      // Tự động xoay chuẩn theo EXIF, resize 300x400 px, nén JPEG 80%
      const buffer = await sharp(found.fullPath)
        .rotate()
        .resize(300, 400, { fit: 'cover', position: 'top' })
        .jpeg({ quality: 80, progressive: true })
        .toBuffer();

      fs.writeFileSync(destFileRaw, buffer);
      fs.writeFileSync(destFileCard, buffer);

      totalBytes += buffer.length;
      processedCount++;
      matched.push({ id: hs.id, cardId, ho_ten: hs.ho_ten, lop: hs.lop, file: found.file });
    } else {
      unmatched.push({ id: hs.id, ho_ten: hs.ho_ten, lop: hs.lop });
    }
  }

  console.log('\n========================================');
  console.log(`🎉 ĐÃ XỬ LÝ NÉN VÀ NHẬP THÀNH CÔNG: ${processedCount} / ${students.length} học sinh`);
  console.log(`📦 Tổng dung lượng lưu trữ trên đĩa: ${(totalBytes / (1024 * 1024)).toFixed(2)} MB`);
  console.log(`⚡ Dung lượng trung bình mỗi ảnh thẻ: ${(totalBytes / processedCount / 1024).toFixed(1)} KB`);
  console.log('========================================');

  if (unmatched.length > 0) {
    console.log(`\n⚠️ ${unmatched.length} học sinh chưa có ảnh từ studio (sẽ dùng khung dán 3x4 tiêu chuẩn):`);
    unmatched.forEach((u) => console.log(`   - [${u.lop}] #${u.id} ${u.ho_ten}`));
  }

  await sequelize.close();
}

runImport().catch((err) => {
  console.error('Lỗi khi xử lý ảnh Khối 10:', err);
  process.exit(1);
});
