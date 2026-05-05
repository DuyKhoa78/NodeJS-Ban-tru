require('dotenv').config();
const { GiaoVien, sequelize } = require('./src/models');

async function seedTeachers() {
  try {
    // Check connection
    await sequelize.authenticate();
    console.log('Connection has been established successfully.');

    const teachers = [];
    const ho = ['Nguyễn', 'Trần', 'Lê', 'Phạm', 'Hoàng', 'Phan', 'Vũ', 'Đặng', 'Bùi', 'Đỗ'];
    const tenDem = ['Văn', 'Thị', 'Minh', 'Anh', 'Hoàng', 'Hữu', 'Ngọc', 'Quốc', 'Thanh', 'Đức'];
    const ten = ['Anh', 'Bình', 'Chi', 'Dũng', 'Em', 'Giang', 'Hùng', 'Hoa', 'Khang', 'Linh', 'Mai', 'Nam', 'Oanh', 'Phúc', 'Quân', 'Sơn', 'Tâm', 'Uyên', 'Việt', 'Yến'];

    for (let i = 1; i <= 20; i++) {
      const randomHo = ho[Math.floor(Math.random() * ho.length)];
      const randomTenDem = tenDem[Math.floor(Math.random() * tenDem.length)];
      const randomTen = ten[Math.floor(Math.random() * ten.length)];
      
      teachers.push({
        ho_ten: `${randomHo} ${randomTenDem} ${randomTen} ${i}`,
        gioi_tinh: Math.random() > 0.5 ? 1 : 0,
        so_dien_thoai: `090${Math.floor(1000000 + Math.random() * 9000000)}`,
        nhiem_vu: Math.random() > 0.5 ? 1 : 0,
        dang_lam: true,
        lich_ranh: [true, true, true, true, true],
      });
    }

    await GiaoVien.bulkCreate(teachers);
    console.log('Successfully added 20 teachers.');
  } catch (error) {
    console.error('Error seeding teachers:', error);
  } finally {
    await sequelize.close();
  }
}

seedTeachers();
