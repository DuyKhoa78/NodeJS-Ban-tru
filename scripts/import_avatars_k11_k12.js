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
  '11A1': {
    'nguyen truong khoa': 'nguyen truong kha', // Kha vs Khoa
    'tran vu quynh anh': 'quynh anh',
  },
  '11A2': {
    'phan thanh ha': 'thanh thanh ha', // Phan vs Thanh
  },
  '11A3': {
    'pham anh duong': 'phan anh duong', // Phan vs Phạm
    'nguyen phuc thinh': 'nguyen ohucs thinh', // Studio gõ nhầm telex Ohucs
  },
  '11A5': {
    'huynh gia huy': 'huynhg gia huy', // Studio gõ nhầm telex Huynhg
    'bui gia khai': 'bui gia khai',
    'tran ngoc duyen': 'tran ngoc quyen', // Quyên vs Duyên
  },
  '11A7': {
    'nguyen thanh nhan': 'nguyenx thanh nhan', // Studio gõ nhầm telex 'x'
    'dinh trong trung': 'dinh ngoc trung', // Ngọc vs Trọng
  },
  '11A8': {
    'trinh huynh minh nhu': 'trinhj huynh minh nhu', // Studio gõ nhầm telex 'j'
    'le phuoc phat': 'le phuong phat', // Phương vs Phước
    'nguyen le khanh hung': 'nguyen gia hung', // Gia Hưng vs Khánh Hưng
  },
  '11A9': {
    'phan ngoc khanh an': 'phan ngocjn khanh an', // Studio gõ nhầm telex "Ngocjn"
    'nguyen thien bao': 'nguyen phuong bao', // Phương vs Thiên
    'nguyen hoang gia tue': 'gia tue',
  },
  '12A2': {
    'le nguyen thanh thuy': 'le nguyen hanh thuy', // Studio gõ thiếu chữ T
    'tran cung minh thu': 'tran cung mi nh thu', // Studio gõ cách chữ Mi nh
  },
  '12A4': {
    'ma nhat huy': 'mai nhat huy', // Studio ghi Mai vs Ma
  },
  '12A5': {
    'duong thi anh thy': 'duong thi anh thi', // Thi vs Thy
  },
  '12A7': {
    'than ha khanh linh': 'than hoang khanh linh', // Hoàng vs Hà
  },
  '12A10': {
    'nguyen hoang danh': 'nguyen hoang danh 12a10',
  },
};

async function processGrade(grade, imgRelativeDir, uploadDir) {
  console.log(`\n==================================================`);
  console.log(`🚀 BẮT ĐẦU XỬ LÝ ẢNH THẺ KHỐI ${grade}`);
  console.log(`==================================================`);

  const students = await HocSinh.findAll({
    where: {
      lop: { [Op.like]: `${grade}%` },
      dang_hoc: true,
    },
    order: [['lop', 'ASC'], ['ho_ten', 'ASC']],
  });

  console.log(`📋 Tổng số học sinh khối ${grade} đang học bán trú: ${students.length}`);

  let imgBaseDir = path.resolve(__dirname, imgRelativeDir);
  if (!fs.existsSync(imgBaseDir)) {
    console.error(`❌ Không tìm thấy thư mục ảnh: ${imgBaseDir}`);
    return;
  }

  const classDirs = fs.readdirSync(imgBaseDir).filter((f) => {
    return fs.statSync(path.join(imgBaseDir, f)).isDirectory();
  });

  const photoMapByClass = {};
  for (const cDir of classDirs) {
    const p = path.join(imgBaseDir, cDir);
    const files = fs.readdirSync(p).filter((f) => f.match(/\.(jpe?g|png|webp)$/i));
    photoMapByClass[cDir.toUpperCase()] = files.map((file) => {
      // Bỏ số thứ tự đầu tên: "01. ", "16, ", "1 - "
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

      const feUploadDir = path.resolve(__dirname, '../../Front-end/public/uploads/avatars');
      if (fs.existsSync(feUploadDir)) {
        fs.writeFileSync(path.join(feUploadDir, `${rawId}.jpg`), buffer);
        fs.writeFileSync(path.join(feUploadDir, `${cardId}.jpg`), buffer);
      }

      totalBytes += buffer.length;
      processedCount++;
      matched.push({ id: hs.id, cardId, ho_ten: hs.ho_ten, lop: hs.lop, file: found.file });
    } else {
      unmatched.push({ id: hs.id, ho_ten: hs.ho_ten, lop: hs.lop });
    }
  }

  console.log(`🎉 ĐÃ XỬ LÝ VÀ NHẬP THÀNH CÔNG: ${processedCount} / ${students.length} học sinh Khối ${grade} (${((processedCount / students.length) * 100).toFixed(1)}%)`);
  console.log(`📦 Dung lượng lưu trữ trên đĩa: ${(totalBytes / (1024 * 1024)).toFixed(2)} MB`);
  if (processedCount > 0) {
    console.log(`⚡ Dung lượng trung bình mỗi ảnh thẻ: ${(totalBytes / processedCount / 1024).toFixed(1)} KB`);
  }

  if (unmatched.length > 0) {
    console.log(`\n⚠️ ${unmatched.length} học sinh chưa có ảnh từ studio (sẽ hiển thị khung dán 3x4 tiêu chuẩn):`);
    unmatched.forEach((u) => console.log(`   - [${u.lop}] #${u.id} ${u.ho_ten}`));
  }
}

async function run() {
  await sequelize.authenticate();
  console.log('✅ Đã kết nối cơ sở dữ liệu.');

  const uploadDir = path.resolve(__dirname, '../uploads/avatars');
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
    console.log(`📁 Đã tạo thư mục: ${uploadDir}`);
  }

  // Khối 11
  await processGrade('11', '../../IMG/KHOI 11', uploadDir);

  // Khối 12
  await processGrade('12', '../../IMG/KHOI 12', uploadDir);

  await sequelize.close();
  console.log('\n🏁 HOÀN TẤT NHẬP ẢNH THẺ KHỐI 11 VÀ KHỐI 12!');
}

run().catch((err) => {
  console.error('Lỗi khi xử lý ảnh Khối 11 & 12:', err);
  process.exit(1);
});
