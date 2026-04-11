// src/middleware/firebaseAuth.js

const admin = require('../services/firebase');

/**
 * Middleware: verifikasi Firebase ID Token dari cookie fb_token.
 * Jika valid, req.user diisi dengan decoded token (uid, email, dll).
 */
module.exports = async (req, res, next) => {
  const token = req.cookies?.fb_token;
  if (!token) return res.redirect('/login');

  try {
    req.user = await admin.auth().verifyIdToken(token);
    next();
  } catch (err) {
    console.error('Firebase token error:', err.message);
    res.clearCookie('fb_token');
    res.redirect('/login');
  }
};
