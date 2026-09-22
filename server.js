require('dotenv').config();
const express = require('express');
const cors = require('cors');
const session = require('express-session');
const morgan = require('morgan');
const path = require('path');

const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const { sequelize, CauHinhNgay, LichSuThaoTac, BaoCaoTruc, DiemDanhDraft } = require('./src/models');
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

// Trust proxy để cho phép set secure cookie khi chạy sau Load Balancer của Azure / Vercel
app.set('trust proxy', 1);

// ─── 1. Security Headers (Helmet) ─────────────────────────────────────────────
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: false, // Để Vite và CDN script hoạt động bình thường
}));

// ─── 2. Allowed Origins & CORS ────────────────────────────────────────────────
const ALLOWED_ORIGINS = [
  // Vercel production
  'https://lthg-bantru.vercel.app',
  // Vercel preview (chỉ cho riêng dự án lthg-bantru, không cho toàn bộ *.vercel.app)
  /^https:\/\/lthg-bantru(-[a-z0-9-]+)?\.vercel\.app$/,
  // Domain tùy chỉnh (nếu có cấu hình trong env)
  process.env.FRONTEND_URL,
  // Local dev & LAN mobile access
  'http://localhost:5173',
  'http://localhost:3000',
  /^http:\/\/(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)(:\d+)?$/,
].filter(Boolean);

function isOriginAllowed(origin) {
  if (!origin) return true;
  return ALLOWED_ORIGINS.some((o) => (o instanceof RegExp ? o.test(origin) : o === origin));
}

app.use(cors({
  origin: (origin, callback) => {
    // Cho phép các request không có origin (Server-to-server, health check, webhook)
    if (!origin) return callback(null, true);
    if (isOriginAllowed(origin)) return callback(null, true);
    callback(null, false);
  },
  credentials: true,
}));

// ─── 3. CSRF Protection cho các thao tác ghi (POST/PUT/DELETE/PATCH) ─────────
app.use((req, res, next) => {
  if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) {
    // Webhook bên ngoài (Google Form/Apps Script) dùng Secret Header riêng, bỏ qua kiểm tra origin
    if (req.path.startsWith('/api/webhook/')) return next();

    const origin = req.headers.origin || req.headers.referer;
    if (origin) {
      try {
        const originUrl = new URL(origin).origin;
        if (!isOriginAllowed(originUrl)) {
          return res.status(403).json({ ok: false, error: 'Forbidden: Request origin không hợp lệ' });
        }
      } catch {
        return res.status(403).json({ ok: false, error: 'Forbidden: URL Origin bị sai định dạng' });
      }
    }
  }
  next();
});

// ─── 4. Rate Limiting ─────────────────────────────────────────────────────────
const generalApiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 phút
  max: 300, // Tối đa 300 requests/phút mỗi IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: 'Quá nhiều yêu cầu từ IP của bạn, vui lòng thử lại sau ít phút.' },
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 phút
  max: 50, // Tối đa 50 lần thử auth/login mỗi 15 phút
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: 'Quá nhiều yêu cầu đăng nhập/xác thực, vui lòng thử lại sau 15 phút.' },
});

app.use('/api/', generalApiLimiter);
app.use(['/login', '/login/', '/api/login', '/api/auth/login', '/api/profile/send-otp/'], authLimiter);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ─── Phục vụ file tĩnh (Ảnh thẻ học sinh, uploads) ──────────────────────────────
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('dev'));
}

const { attachUser, maintenanceCheck } = require('./src/middleware/auth');

// ─── Session & Auth & Maintenance ──────────────────────────────────────────────
app.use(session(sessionConfig));
app.use(attachUser);
app.use(maintenanceCheck);

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

let isDbReady = false;

const { runMigrations } = require('./src/migrations');

app.get('/health', async (req, res) => {
  try {
    await sequelize.authenticate();
    res.json({ ok: true, ready: isDbReady, db: 'connected', time: new Date().toISOString() });
  } catch {
    res.status(503).json({ ok: false, ready: false, db: 'disconnected', error: 'Không thể kết nối cơ sở dữ liệu' });
  }
});

// ─── Error Handler ────────────────────────────────────────────────────────────
app.use(errorHandler);

// ─── Start Server ─────────────────────────────────────────────────────────────
async function startServer() {
  // 1. Khởi động lắng nghe HTTP ngay lập tức để iisnode / Azure App Service không bị timeout 500
  const isNamedPipe = typeof PORT === 'string' && PORT.startsWith('\\\\.\\pipe\\');
  if (isNamedPipe) {
    app.listen(PORT, () => {
      console.log(`🚀 Server đang chạy trên Azure named pipe: ${PORT}`);
    });
  } else {
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`🚀 Server đang chạy tại http://0.0.0.0:${PORT} (Local: http://localhost:${PORT})`);
    });
  }

  // 2. Kết nối DB và chạy migration bất đồng bộ phía sau
  try {
    console.log('🔄 Đang kết nối cơ sở dữ liệu...');
    await sequelize.authenticate();
    console.log('✅ Kết nối database thành công!');

    // Chạy bộ migration có phiên bản _schema_migrations
    await runMigrations(sequelize, {
      CauHinhNgay,
      LichSuThaoTac,
      BaoCaoTruc,
      DiemDanhDraft
    });

    isDbReady = true;
    console.log('✅ Hệ thống DB và các trường sẵn sàng!');

    // 3. Đồng bộ ảnh đại diện ngẫu nhiên hàng ngày cho tài khoản giáo viên (GV0 đến GV15)
    const { syncDailyTeacherAvatars } = require('./src/utils/teacherAvatar');
    const { StaffUser } = require('./src/models');
    await syncDailyTeacherAvatars(StaffUser);

    // Chu kỳ kiểm tra mỗi 1 giờ để tự động đổi ngẫu nhiên sang ảnh mới khi bước sang ngày tiếp theo
    setInterval(() => {
      syncDailyTeacherAvatars(StaffUser);
    }, 60 * 60 * 1000);
  } catch (err) {
    console.error('⚠️  Lỗi kết nối database:', err.message);
    console.error('   Kiểm tra lại DATABASE_URL trong file .env');
  }
}

startServer();

module.exports = app;

// touch
// refreshed   