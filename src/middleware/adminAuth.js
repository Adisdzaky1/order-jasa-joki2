// src/middleware/adminAuth.js

/**
 * Middleware: verifikasi signed cookie admin_token.
 * Cookie diset saat login admin, berlaku 30 hari.
 * Menggunakan cookie-parser signed cookies (bukan session).
 */
module.exports = (req, res, next) => {
  const token = req.signedCookies?.admin_token;
  if (token === 'authenticated') return next();
  res.redirect('/admin/login');
};
