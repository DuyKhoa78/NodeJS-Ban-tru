const { Sequelize } = require('sequelize');

const databaseUrl = process.env.DATABASE_URL;

const sequelize = new Sequelize(databaseUrl, {
  dialect: 'postgres',
  dialectOptions: {
    ssl: {
      require: true,
      rejectUnauthorized: false,
    },
    // Tắt prepared statements để tương thích với Supabase pgBouncer transaction mode (port 6543)
    prepareThreshold: 0,
  },
  logging: process.env.NODE_ENV === 'development' ? console.log : false,
  pool: {
    max: 3,      // Giới hạn thấp để tránh quá tải
    min: 0,
    acquire: 5000, // Hết hạn chờ 5s để báo lỗi ngay, không treo app 30s
    idle: 5000,  // Đóng connection nhanh hơn khi không dùng
    evict: 5000,
  },
  timezone: '+07:00',
});

module.exports = sequelize;
