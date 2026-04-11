// api/index.js

const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const session = require('express-session');
const ejsLayouts = require('express-ejs-layouts');
require('dotenv').config();

const app = express();

// ─── EJS Setup ────────────────────────────────────────────────────────────────
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '../views'));
app.use(ejsLayouts);
app.set('layout', 'layouts/main'); // default layout

// ─── Middleware ────────────────────────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, '../public')));
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'fallback-secret-dev-only',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 30 * 24 * 60 * 60 * 1000 }, // 30 hari
  })
);

// ─── Flash message helper ──────────────────────────────────────────────────────
// Simpan flash ke session, ambil & hapus saat render
app.use((req, res, next) => {
  res.locals.flash = req.session.flash || null;
  delete req.session.flash;
  next();
});

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use('/', require('../src/routes/pages'));
app.use('/api/auth', require('../src/routes/auth'));
app.use('/api/orders', require('../src/routes/orders'));
app.use('/api/payment', require('../src/routes/payment'));
app.use('/admin', require('../src/routes/admin'));

// ─── 404 Handler ──────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).render('404', { title: 'Halaman Tidak Ditemukan' });
});

// ─── Error Handler ────────────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal Server Error', message: err.message });
});

// ─── WAJIB: export untuk Vercel Serverless ────────────────────────────────────
module.exports = app;

// ─── Local dev only ───────────────────────────────────────────────────────────
if (process.env.NODE_ENV !== 'production') {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => console.log(`Server: http://localhost:${PORT}`));
}
