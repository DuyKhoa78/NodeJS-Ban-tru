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
    max: 10,       // Tăng từ 3 lên 10 để xử lý concurrent requests nhanh chóng
    min: 2,        // Giữ sẵn 2 kết nối warm để không phải chờ TLS handshake
    acquire: 10000,
    idle: 30000,   // Giữ kết nối 30s
    evict: 10000,
  },
  timezone: '+07:00',
});

module.exports = sequelize;
