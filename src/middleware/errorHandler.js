/**
 * Global error handler middleware
 */
function errorHandler(err, req, res, next) {
  console.error('❌ [Error]', err.stack || err.message || err);

  const statusCode = err.status || err.statusCode || 500;
  const message = err.message || 'Lỗi máy chủ nội bộ';

  if (req.path.startsWith('/api/')) {
    return res.status(statusCode).json({
      ok: false,
      error: message,
      ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
    });
  }

  res.status(statusCode).json({
    ok: false,
    error: message,
  });
}

module.exports = errorHandler;
