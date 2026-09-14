require('dotenv').config();
const sequelize = require('../src/config/database');

async function migrate() {
  try {
    console.log('Connecting to database...');
    await sequelize.authenticate();
    console.log('Connected.');

    console.log('Adding column ten_gv_truc_thay if not exists...');
    await sequelize.query(`
      ALTER TABLE nghiepvu_phancongtrucgv 
      ADD COLUMN IF NOT EXISTS ten_gv_truc_thay VARCHAR(255);
    `);
    console.log('Migration completed successfully.');
    process.exit(0);
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  }
}

migrate();
