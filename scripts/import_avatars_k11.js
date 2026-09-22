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
      lop: { [Op.like]: '11%' },
      dang_hoc: true,
    },
    order: [['lop', 'ASC'], ['ho_ten', 'ASC']],
  });

  console.log(`📋 Tổng số học sinh khối 11 đang học bán trú: ${students.length}`);

  const imgBaseDir = path.resolve(__dirname, '../../IMG');
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
      // Bỏ số thứ tự đầu tên: "01. ", "16, ", "1 - " (hyphen ở cuối regex để tránh dải ký tự)
      const nameWithoutNum = file.replace(/^\d+[\s.,_-]+/, '').replace(/\.[^.]+$/, '').trim();
      return {
        file,
        fullPath: path.join(p, file),
        cleanName: normalizeName(nameWithoutNum),
        originalName: nameWithoutNum,
      };
    });
  }

  // Bảng ánh xạ các trường hợp tên bị lỗi chính tả từ studio chụp ảnh
  const aliases = {
    '11A1': {
      'nguyen truong khoa': 'nguyen truong kha', // Kha vs Khoa
    },
    '11A3': {
      'pham anh duong': 'phan anh duong', // Phan vs Phạm
    },
    '11A5': {
      'bui gia khai': 'bui gia khai', // File: 16, Bùi Gia Khải.jpg
      'tran ngoc duyen': 'tran ngoc quyen', // Quyên vs Duyên
    },
    '11A7': {
      'nguyen thanh nhan': 'nguyenx thanh nhan', // Studio gõ nhầm telex 'x'
      'dinh trong trung': 'dinh ngoc trung', // Ngọc vs Trọng
    },
    '11A8': {
      'trinh huynh minh nhu': 'trinh huynh minh thu', // Thư vs Như
      'le phuoc phat': 'le phuong phat', // Phương vs Phước
      'nguyen le khanh hung': 'nguyen gia hung', // Gia Hưng vs Khánh Hưng
    },
  };

  let processedCount = 0;
  let totalBytes = 0;
  const unmatched = [];
  const matched = [];

  for (const hs of students) {
    const lop = hs.lop.toUpperCase().trim();
    const hsNorm = normalizeName(hs.ho_ten);
    const classPhotos = photoMapByClass[lop] || [];

    // 1. Khớp chính xác
    let found = classPhotos.find((p) => p.cleanName === hsNorm);

    // 2. Khớp qua bảng ánh xạ studio
    if (!found && aliases[lop] && aliases[lop][hsNorm]) {
      const aliasTarget = aliases[lop][hsNorm];
      found = classPhotos.find((p) => p.cleanName === aliasTarget);
    }

    // 3. Khớp mờ phụ (chứa chuỗi)
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

      // Nén ảnh 300x400 px, 80% JPEG
      const buffer = await sharp(found.fullPath)
        .resize(300, 400, { fit: 'cover', position: 'top' })
        .jpeg({ quality: 80, progressive: true })
        .toBuffer();

      fs.writeFileSync(destFileRaw, buffer);
      // Ghi thêm bản cardId để hỗ trợ cả 2 dạng id
      fs.writeFileSync(destFileCard, buffer);

      totalBytes += buffer.length;
      processedCount++;
      matched.push({ id: hs.id, cardId, ho_ten: hs.ho_ten, lop: hs.lop, size: buffer.length });
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
    console.log(`\n⚠️ ${unmatched.length} học sinh chưa có ảnh thẻ từ studio (sẽ dùng khung dán 3x4 tiêu chuẩn):`);
    unmatched.forEach((u) => console.log(`   - [${u.lop}] #${u.id} ${u.ho_ten}`));
  }

  await sequelize.close();
}

runImport().catch((err) => {
  console.error('Lỗi khi xử lý ảnh:', err);
  process.exit(1);
});
