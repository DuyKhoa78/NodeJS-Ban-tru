require('dotenv').config();
const { Sequelize } = require('sequelize');
const sequelize = new Sequelize(process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/bantru', { dialect: 'postgres', logging: false });
async function run() {
  await sequelize.query("UPDATE core_cauhinhhethong SET nam_hoc = '2025-2026' WHERE nam_hoc = '2026-2027'");
  console.log('Database reverted');
}
run();
