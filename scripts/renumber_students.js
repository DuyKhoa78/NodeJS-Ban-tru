require('dotenv').config();
const { sequelize, HocSinh } = require('../src/models');

function getSortNames(fullName) {
  if (!fullName) return { first: '', middle: '', last: '' };
  const cleanName = fullName.replace(/\s*\(.*?\)\s*/g, '').trim();
  const parts = cleanName.split(/\s+/);
  const first = parts.pop() || '';
  const last = parts.length > 0 ? parts[0] : '';
  const middle = parts.slice(1).join(' ');
  return { first, middle, last };
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

function compareStudents(a, b) {
  const cmpLop = compareClasses(a.lop, b.lop);
  if (cmpLop !== 0) return cmpLop;

  const nameA = getSortNames(a.ho_ten);
  const nameB = getSortNames(b.ho_ten);
  let cmp = nameA.first.localeCompare(nameB.first, 'vi');
  if (cmp !== 0) return cmp;
  cmp = nameA.last.localeCompare(nameB.last, 'vi');
  if (cmp !== 0) return cmp;
  return nameA.middle.localeCompare(nameB.middle, 'vi');
}

async function main() {
  await sequelize.authenticate();
  console.log('Connected to DB.');

  const students = await HocSinh.findAll({ raw: true });
  console.log(`Loaded ${students.length} students.`);

  // Sắp xếp học sinh theo Lớp và Tên A-Z
  students.sort(compareStudents);

  console.log('\n--- 10 học sinh đầu tiên sau khi sắp xếp ---');
  for (let i = 0; i < Math.min(10, students.length); i++) {
    const s = students[i];
    console.log(`Mã mới: ${(i + 1).toString().padStart(3)} | Cũ: ${s.id.toString().padStart(3)} | Lớp: ${s.lop.padEnd(6)} | ${s.ho_ten}`);
  }

  console.log('\n--- 10 học sinh cuối cùng sau khi sắp xếp ---');
  for (let i = Math.max(0, students.length - 10); i < students.length; i++) {
    const s = students[i];
    console.log(`Mã mới: ${(i + 1).toString().padStart(3)} | Cũ: ${s.id.toString().padStart(3)} | Lớp: ${s.lop.padEnd(6)} | ${s.ho_ten}`);
  }

  // Thực hiện đổi ID trong Transaction
  const t = await sequelize.transaction();
  try {
    // 1. Chuyển tạm thời ID cũ sang dải số lớn để không bị đụng primary key
    await sequelize.query('UPDATE quanli_hocsinh SET id = id + 1000000', { transaction: t });

    // 2. Cập nhật từng học sinh về ID mới (1, 2, 3, ...)
    for (let i = 0; i < students.length; i++) {
      const oldTempId = students[i].id + 1000000;
      const newId = i + 1;
      await sequelize.query('UPDATE quanli_hocsinh SET id = :newId WHERE id = :oldTempId', {
        replacements: { newId, oldTempId },
        transaction: t
      });
    }

    // 3. Đặt sequence bằng tổng số học sinh (để học sinh tiếp theo được gán 715)
    await sequelize.query(`SELECT setval('quanli_hocsinh_id_seq', ${students.length}, true)`, { transaction: t });

    await t.commit();
    console.log(`\n🎉 Đã đánh số lại thành công toàn bộ ${students.length} học sinh từ 1 đến ${students.length}!`);
    console.log(`✅ Sequence quanli_hocsinh_id_seq đã được set về: ${students.length}`);
  } catch (err) {
    await t.rollback();
    console.error('❌ Lỗi cập nhật:', err);
    process.exit(1);
  }

  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
