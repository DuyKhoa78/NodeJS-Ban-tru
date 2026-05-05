require('dotenv').config();
const sequelize = require('./src/config/database');

async function run() {
  try {
    await sequelize.authenticate();
    console.log('Connected to DB');
    
    // Alter table
    await sequelize.query('ALTER TABLE quanli_phong ALTER COLUMN ma_phong TYPE VARCHAR(4);');
    console.log('Successfully altered ma_phong to VARCHAR(4)');

    await sequelize.query('ALTER TABLE quanli_hocsinh ALTER COLUMN ma_phong_an_id TYPE VARCHAR(4);');
    console.log('Successfully altered ma_phong_an_id to VARCHAR(4)');

    await sequelize.query('ALTER TABLE quanli_hocsinh ALTER COLUMN ma_phong_ngu_id TYPE VARCHAR(4);');
    console.log('Successfully altered ma_phong_ngu_id to VARCHAR(4)');

    await sequelize.query('ALTER TABLE nghiepvu_phancongtrucgv ALTER COLUMN ma_phong_id TYPE VARCHAR(4);');
    console.log('Successfully altered nghiepvu_phancongtrucgv.ma_phong_id to VARCHAR(4)');

    await sequelize.query('ALTER TABLE quanli_phanbovatdung ALTER COLUMN phong_id TYPE VARCHAR(4);');
    console.log('Successfully altered quanli_phanbovatdung.phong_id to VARCHAR(4)');

    await sequelize.query('ALTER TABLE nghiepvu_lichtruccodinh ALTER COLUMN ma_phong_id TYPE VARCHAR(4);');
    console.log('Successfully altered nghiepvu_lichtruccodinh.ma_phong_id to VARCHAR(4)');

    await sequelize.query('ALTER TABLE nghiepvu_diemdanhphong ALTER COLUMN ma_phong_id TYPE VARCHAR(4);');
    console.log('Successfully altered nghiepvu_diemdanhphong.ma_phong_id to VARCHAR(4)');
    
    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

run();
