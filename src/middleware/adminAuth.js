// src/middleware/adminAuth.js

/**
 * Middleware: cek apakah session admin aktif.
 * Admin login menggunakan username/password hardcode (bukan Firebase).
 */
module.exports = (req, res, next) => {
  if (req.session?.isAdmin) return next();
  res.redirect('/admin/login');
};
