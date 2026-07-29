require('dotenv').config();
const express = require('express');
const cors = require('cors');
const session = require('express-session');
const morgan = require('morgan');
const path = require('path');

const { sequelize, CauHinhNgay, LichSuThaoTac } = require('./src/models');
const sessionConfig = require('./src/config/session');
const errorHandler = require('./src/middleware/errorHandler');

// Routes
const authRoutes = require('./src/routes/auth');
const coreRoutes = require('./src/routes/core');
const accountsRoutes = require('./src/routes/accounts');
const quanliRoutes = require('./src/routes/quanli');
const nghiepvuRoutes = require('./src/routes/nghiepvu');

const app = express();
const PORT = process.env.PORT || 4000;

// Trust proxy để cho phép set secure cookie khi chạy sau Load Balancer của Azure
app.set('trust proxy', 1);

// ─── Middleware ───────────────────────────────────────────────────────────────
// ─── Allowed Origins ─────────────────────────────────────────────────────────
const ALLOWED_ORIGINS = [
  // Vercel production
  'https://lthg-bantru.vercel.app',
  // Vercel preview (mọi branch/pr deploy)
  /\.vercel\.app$/,
  // Domain tuùy chỉnh (nếu có)
  process.env.FRONTEND_URL,
  // Local dev
  'http://localhost:5173',
  'http://localhost:3000',
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    // cho phép các request không có origin (Postman, health check)
    if (!origin) return callback(null, true);
    const allowed = ALLOWED_ORIGINS.some((o) =>
      o instanceof RegExp ? o.test(origin) : o === origin
    );
    if (allowed) return callback(null, true);
    callback(new Error(`CORS: Origin ${origin} không được phép`));
  },
  credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('dev'));
}

// ─── Session ──────────────────────────────────────────────────────────────────
app.use(session(sessionConfig));

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use('/', authRoutes);
app.use('/', coreRoutes);
app.use('/', accountsRoutes);
app.use('/', quanliRoutes);
app.use('/', nghiepvuRoutes);

// ─── Health check / Root ──────────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.json({
    ok: true,
    message: '🏫 API Quản lý Bán trú - THPT Lê Thị Hồng Gấm',
    version: '1.0.0',
    endpoints: {
      auth:     'POST /login/ | POST /logout/ | GET /api/auth/me',
      dashboard:'GET  /api/dashboard/',
      taikhoan: 'GET  /api/taikhoan/ | POST /api/taikhoan/save|delete|reset-pw',
      profile:  'GET  /api/profile/ | POST /api/profile/save|send-otp|verify-otp',
      hocsinh:  'GET  /api/hocsinh/ | POST /api/hocsinh/save|import|:pk/delete',
      giaovien: 'GET  /api/giaovien/ | POST /api/giaovien/save|:pk/delete|:pk/ranh',
      phong:    'GET  /api/phong/ | POST /api/phong/save|delete',
      cauhinh:  'GET  /api/cauhinh/ | POST /api/cauhinh/save | POST /api/hethong/save',
      vatdung:  'GET  /api/vatdung/ | POST /api/vatdung/mua/save|delete | /phanbo/save|delete',
      diemdanh: 'GET  /api/diemdanh/ | POST /api/diemdanh/save',
      lichtruc: 'GET  /api/lichtruc/week|month|export | POST /api/lichtruc/save|delete',
      lichkhung:'GET  /api/lichtruc_khung/ | POST /api/lichtruc_khung/save|auto | /apply-khung',
      baocao:   'GET  /api/baocao/diemdanh|luong-gv|full',
    },
  });
});

app.get('/health', async (req, res) => {
  try {
    await sequelize.authenticate();
    res.json({ ok: true, db: 'connected', time: new Date().toISOString() });
  } catch (e) {
    res.status(503).json({ ok: false, db: 'disconnected', error: e.message });
  }
});

// ─── Error Handler ────────────────────────────────────────────────────────────
app.use(errorHandler);

// ─── Start Server ─────────────────────────────────────────────────────────────
async function startServer() {
  // Luôn khởi động server trước
  app.listen(PORT, () => {
    console.log(`🚀 Server đang chạy tại http://localhost:${PORT}`);
  });

  // Kết nối DB sau (không crash server nếu lỗi DB)
  try {
    await sequelize.authenticate();
    console.log('✅ Kết nối database thành công!');
    // Tự động thêm cột mới nếu thiếu (không xóa dữ liệu)
    await CauHinhNgay.sync({ alter: true });
    await LichSuThaoTac.sync({ alter: true });
    console.log('✅ Bảng core_cauhinh_ngay & core_lichsuthaotac sẵn sàng!');
  } catch (err) {
    console.error('⚠️  Lỗi kết nối database:', err.message);
    console.error('   Kiểm tra lại DATABASE_URL trong file .env');
  }
}

startServer();

module.exports = app;

// touch