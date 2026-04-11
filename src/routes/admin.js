// src/routes/admin.js

const express = require('express');
const router = express.Router();
const multer = require('multer');
const adminAuth = require('../middleware/adminAuth');
const { readFile, writeFile } = require('../services/github');

const ADMIN_USER = 'adm';
const ADMIN_PASS = 'adm@123';

// Multer memory storage untuk upload file hasil kerja
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
});

// ─── POST /admin/auth/login ───────────────────────────────────────────────────
router.post('/auth/login', (req, res) => {
  const { username, password } = req.body;
  if (username === ADMIN_USER && password === ADMIN_PASS) {
    req.session.isAdmin = true;
    return res.redirect('/admin/dashboard');
  }
  req.session.flash = { type: 'error', message: 'Username atau password salah' };
  res.redirect('/admin/login');
});

// ─── POST /admin/auth/logout ──────────────────────────────────────────────────
router.post('/auth/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/admin/login');
});

// ─── GET /admin (root) ───────────────────────────────────────────────────────
router.get('/', (req, res) => {
  if (req.session?.isAdmin) return res.redirect('/admin/dashboard');
  res.redirect('/admin/login');
});

// ─── GET /admin/login ─────────────────────────────────────────────────────────
router.get('/login', (req, res) => {
  if (req.session?.isAdmin) return res.redirect('/admin/dashboard');
  res.render('admin/login', { layout: 'layouts/admin', title: 'Admin Login' });
});

// ─── GET /admin/dashboard ─────────────────────────────────────────────────────
router.get('/dashboard', adminAuth, async (req, res) => {
  try {
    const { json: orders } = await readFile('data/orders.json');

    const stats = {
      total: orders.length,
      menunggu: orders.filter((o) => o.status === 'menunggu_pembayaran').length,
      antrian: orders.filter((o) => o.status === 'antrian').length,
      dikerjakan: orders.filter((o) => o.status === 'dikerjakan').length,
      selesai: orders.filter((o) => o.status === 'selesai').length,
    };

    const recentOrders = [...orders]
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .slice(0, 5);

    res.render('admin/dashboard', {
      layout: 'layouts/admin',
      title: 'Admin Dashboard',
      stats,
      recentOrders,
    });
  } catch (err) {
    console.error('Admin dashboard error:', err.message);
    res.status(500).send('Gagal memuat dashboard');
  }
});

// ─── GET /admin/pesanan ───────────────────────────────────────────────────────
router.get('/pesanan', adminAuth, async (req, res) => {
  try {
    const { json: orders } = await readFile('data/orders.json');
    const sorted = [...orders].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    res.render('admin/pesanan', {
      layout: 'layouts/admin',
      title: 'Semua Pesanan',
      orders: sorted,
    });
  } catch (err) {
    res.status(500).send('Gagal memuat pesanan');
  }
});

// ─── GET /admin/pesanan/:id ───────────────────────────────────────────────────
router.get('/pesanan/:id', adminAuth, async (req, res) => {
  try {
    const { json: orders } = await readFile('data/orders.json');
    const order = orders.find((o) => o.id === req.params.id);
    if (!order) return res.status(404).send('Pesanan tidak ditemukan');

    res.render('admin/pesanan-detail', {
      layout: 'layouts/admin',
      title: `Detail Pesanan #${order.id.slice(0, 8)}`,
      order,
    });
  } catch (err) {
    res.status(500).send('Gagal memuat detail pesanan');
  }
});

// ─── POST /admin/orders/:id/update ───────────────────────────────────────────
// Update status pesanan + opsional upload file hasil
router.post('/orders/:id/update', adminAuth, upload.single('result_file'), async (req, res) => {
  try {
    const { status } = req.body;
    const { json: orders, sha } = await readFile('data/orders.json');
    const idx = orders.findIndex((o) => o.id === req.params.id);

    if (idx === -1) {
      req.session.flash = { type: 'error', message: 'Pesanan tidak ditemukan' };
      return res.redirect(`/admin/pesanan/${req.params.id}`);
    }

    // Hitung nomor antrian jika status baru = antrian
    if (status === 'antrian' && orders[idx].status !== 'antrian') {
      const totalAntrian = orders.filter((o) => o.status === 'antrian').length;
      orders[idx].queue_number = totalAntrian + 1;
    }

    orders[idx].status = status;
    orders[idx].updated_at = new Date().toISOString();

    // Jika selesai + ada file upload
    if (status === 'selesai' && req.file) {
      orders[idx].result_file = req.file.buffer.toString('base64');
      orders[idx].result_filename = req.file.originalname;
      orders[idx].result_filetype = req.file.mimetype;
    }

    await writeFile('data/orders.json', orders, sha);

    req.session.flash = { type: 'success', message: 'Pesanan berhasil diperbarui' };
    res.redirect(`/admin/pesanan/${req.params.id}`);
  } catch (err) {
    console.error('Update order error:', err.message);
    req.session.flash = { type: 'error', message: 'Gagal memperbarui pesanan: ' + err.message };
    res.redirect(`/admin/pesanan/${req.params.id}`);
  }
});

module.exports = router;
