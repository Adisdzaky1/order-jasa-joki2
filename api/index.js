// api/index.js

const express      = require('express');
const path         = require('path');
const cookieParser = require('cookie-parser');
const ejsLayouts   = require('express-ejs-layouts');
require('dotenv').config();

const app = express();

// ─── EJS Setup ────────────────────────────────────────────────────────────────
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '../views'));
app.use(ejsLayouts);
app.set('layout', 'layouts/main'); // default layout (user pages)

// ─── Core Middleware ──────────────────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Cookie-parser dengan secret → mengaktifkan signed cookies untuk SEMUA cookies
// req.signedCookies.admin_token  ← admin auth
// req.cookies.fb_token           ← user auth (tidak perlu signed, diverifikasi Firebase)
app.use(cookieParser(process.env.SESSION_SECRET || 'fallback-secret-min-32-chars!!'));

app.use(express.static(path.join(__dirname, '../public')));

// ─── Flash locals (dari cookie flash admin, dibaca di middleware sebelum route) ─
// Catatan: admin flash di-handle langsung di masing-masing route admin
// User flash tidak dipakai (Firebase client-side handle error)
app.use((req, res, next) => {
  // Inject flash untuk layout user (jika ada)
  res.locals.flash = null;
  next();
});

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use('/',           require('../src/routes/pages'));
app.use('/api/auth',   require('../src/routes/auth'));
app.use('/api/orders', require('../src/routes/orders'));
app.use('/api/payment',require('../src/routes/payment'));
app.use('/admin',      require('../src/routes/admin'));

// ─── 404 ──────────────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).render('404', { title: 'Halaman Tidak Ditemukan' });
});

// ─── Error Handler ────────────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal Server Error', message: err.message });
});

// ─── Export untuk Vercel Serverless ──────────────────────────────────────────
module.exports = app;

// ─── Local dev only ───────────────────────────────────────────────────────────
if (process.env.NODE_ENV !== 'production') {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => console.log(`Server: http://localhost:${PORT}`));
}
