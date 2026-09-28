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
    max: 20,       // Đủ phục vụ cùng lúc toàn bộ giáo viên thao tác mà không bị nghẽn kết nối
    min: 4,        // Giữ sẵn 4 kết nối warm
    acquire: 20000,
    idle: 30000,   // Giữ kết nối 30s
    evict: 10000,
  },
  timezone: 'Asia/Ho_Chi_Minh',
});

module.exports = sequelize;
