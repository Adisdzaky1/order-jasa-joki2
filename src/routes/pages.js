// src/routes/pages.js

const express = require('express');
const router = express.Router();
const firebaseAuth = require('../middleware/firebaseAuth');
const { readFile } = require('../services/github');

// Helper: ambil data user dari users.json berdasarkan uid
async function getUserData(uid) {
  try {
    const { json: users } = await readFile('data/users.json');
    return users.find((u) => u.uid === uid) || null;
  } catch {
    return null;
  }
}

// ─── GET / ────────────────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { json: services } = await readFile('data/services.json');
    res.render('index', { title: 'Beranda', services });
  } catch (err) {
    res.render('index', { title: 'Beranda', services: [] });
  }
});

// ─── GET /login ───────────────────────────────────────────────────────────────
router.get('/login', (req, res) => {
  if (req.cookies?.fb_token) return res.redirect('/dashboard');
  res.render('login', {
    title: 'Login',
    firebaseApiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    firebaseAuthDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  });
});

// ─── GET /register ────────────────────────────────────────────────────────────
router.get('/register', (req, res) => {
  if (req.cookies?.fb_token) return res.redirect('/dashboard');
  res.render('register', {
    title: 'Daftar Akun',
    firebaseApiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    firebaseAuthDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  });
});

// ─── GET /layanan ─────────────────────────────────────────────────────────────
router.get('/layanan', async (req, res) => {
  try {
    const { json: services } = await readFile('data/services.json');
    res.render('layanan', { title: 'Layanan Kami', services });
  } catch {
    res.render('layanan', { title: 'Layanan Kami', services: [] });
  }
});

// ─── GET /pesan/:id ───────────────────────────────────────────────────────────
router.get('/pesan/:id', firebaseAuth, async (req, res) => {
  try {
    const { json: services } = await readFile('data/services.json');
    const service = services.find((s) => s.id === req.params.id);
    if (!service) return res.redirect('/layanan');

    const userData = await getUserData(req.user.uid);
    res.render('pesan', {
      title: `Pesan - ${service.name}`,
      service,
      user: { ...req.user, name: userData?.name || req.user.name || '' },
    });
  } catch (err) {
    console.error('Pesan page error:', err.message);
    res.redirect('/layanan');
  }
});

// ─── GET /pembayaran/:orderId ─────────────────────────────────────────────────
router.get('/pembayaran/:orderId', firebaseAuth, async (req, res) => {
  try {
    const { json: orders } = await readFile('data/orders.json');
    const order = orders.find(
      (o) => o.id === req.params.orderId && o.user_id === req.user.uid
    );

    if (!order) return res.redirect('/dashboard');

    res.render('pembayaran', {
      title: 'Pembayaran',
      order,
      scripts: `<script src="/js/payment-polling.js"></script>`,
    });
  } catch (err) {
    console.error('Pembayaran page error:', err.message);
    res.redirect('/dashboard');
  }
});

// ─── GET /dashboard ───────────────────────────────────────────────────────────
router.get('/dashboard', firebaseAuth, async (req, res) => {
  try {
    const { json: orders } = await readFile('data/orders.json');
    const userData = await getUserData(req.user.uid);

    const myOrders = orders
      .filter((o) => o.user_id === req.user.uid)
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    const stats = {
      total:      myOrders.length,
      // "Menunggu Bayar" = belum bayar (status masih menunggu_pembayaran)
      menunggu:   myOrders.filter((o) => o.status === 'menunggu_pembayaran').length,
      // "Dikerjakan" = status antrian ATAU dikerjakan (sudah bayar, belum selesai)
      dikerjakan: myOrders.filter((o) => o.status === 'antrian' || o.status === 'dikerjakan').length,
      selesai:    myOrders.filter((o) => o.status === 'selesai').length,
    };

    res.render('dashboard', {
      title: 'Dashboard Saya',
      user: { ...req.user, name: userData?.name || req.user.name || 'Pengguna' },
      orders: myOrders,
      stats,
      paid: req.query.paid === '1',
    });
  } catch (err) {
    console.error('Dashboard error:', err.message);
    res.render('dashboard', {
      title: 'Dashboard Saya',
      user: req.user,
      orders: [],
      stats: { total: 0, menunggu: 0, dikerjakan: 0, selesai: 0 },
      paid: false,
    });
  }
});

// ─── GET /orders/:id/download/:fileIdx ───────────────────────────────────────
// User download file hasil (hanya milik sendiri)
router.get('/orders/:id/download/:fileIdx', firebaseAuth, async (req, res) => {
  try {
    const { getResultFile } = require('../services/github');
    const { json: orders } = await readFile('data/orders.json');
    const order = orders.find((o) => o.id === req.params.id && o.user_id === req.user.uid);
    if (!order) return res.status(404).send('Pesanan tidak ditemukan');

    const fi   = parseInt(req.params.fileIdx);
    const file = (order.result_files || [])[fi];
    if (!file) return res.status(404).send('File tidak ditemukan');

    const { buffer } = await getResultFile(file.github_path);
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(file.name)}"`);
    res.setHeader('Content-Type', 'application/octet-stream');
    res.send(buffer);
  } catch (err) {
    console.error('User download error:', err.message);
    res.status(500).send('Gagal mengunduh file');
  }
});

// ─── GET /logout ──────────────────────────────────────────────────────────────
router.get('/logout', (req, res) => {
  res.clearCookie('fb_token');
  res.redirect('/login');
});

module.exports = router;
