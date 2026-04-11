// src/routes/admin.js

const express = require('express');
const router  = express.Router();
const multer  = require('multer');
const adminAuth = require('../middleware/adminAuth');
const { readFile, writeFile, uploadResultFile, getResultFile, deleteResultFile } = require('../services/github');

const ADMIN_USER     = 'adm';
const ADMIN_PASS     = 'adm@123';
const SESSION_30DAYS = 30 * 24 * 60 * 60 * 1000;

// ── Multer: disk storage di /tmp (ephemeral Vercel), tanpa filter format ───────
// GitHub Contents API: max ~100MB per file (base64 overhead ~33%)
// Vercel body limit: Hobby 4.5MB | Pro 50MB — upgrade plan untuk file besar
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize:  100 * 1024 * 1024, // 100 MB per file (batas GitHub API)
    files:     20,                 // maks 20 file sekaligus
  },
  // Tidak ada fileFilter → semua format diterima
});

// ─── POST /admin/auth/login ───────────────────────────────────────────────────
router.post('/auth/login', (req, res) => {
  const { username, password } = req.body;
  if (username === ADMIN_USER && password === ADMIN_PASS) {
    req.session.isAdmin = true;
    // Perpanjang session & cookie ke 30 hari
    req.session.cookie.maxAge = SESSION_30DAYS;
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

// ─── GET /admin (root) ────────────────────────────────────────────────────────
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
      total:     orders.length,
      menunggu:  orders.filter((o) => o.status === 'menunggu_pembayaran').length,
      antrian:   orders.filter((o) => o.status === 'antrian').length,
      dikerjakan:orders.filter((o) => o.status === 'dikerjakan').length,
      selesai:   orders.filter((o) => o.status === 'selesai').length,
    };
    const recentOrders = [...orders]
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .slice(0, 5);
    res.render('admin/dashboard', { layout: 'layouts/admin', title: 'Admin Dashboard', stats, recentOrders });
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
    res.render('admin/pesanan', { layout: 'layouts/admin', title: 'Semua Pesanan', orders: sorted });
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
// Multi-file upload → upload tiap file ke GitHub repo → simpan metadata di orders.json
router.post(
  '/orders/:id/update',
  adminAuth,
  upload.array('result_files', 20), // field name: result_files, maks 20 file
  async (req, res) => {
    const orderId = req.params.id;
    try {
      const { status } = req.body;
      const { json: orders, sha } = await readFile('data/orders.json');
      const idx = orders.findIndex((o) => o.id === orderId);

      if (idx === -1) {
        req.session.flash = { type: 'error', message: 'Pesanan tidak ditemukan' };
        return res.redirect(`/admin/pesanan/${orderId}`);
      }

      // Nomor antrian otomatis
      if (status === 'antrian' && orders[idx].status !== 'antrian') {
        const totalAntrian = orders.filter((o) => o.status === 'antrian').length;
        orders[idx].queue_number = totalAntrian + 1;
      }

      orders[idx].status     = status;
      orders[idx].updated_at = new Date().toISOString();

      // Upload semua file baru ke GitHub repo
      if (req.files && req.files.length > 0) {
        const existingFiles = orders[idx].result_files || [];
        const uploadedMeta  = [];

        for (const file of req.files) {
          const meta = await uploadResultFile(orderId, file.buffer, file.originalname);
          uploadedMeta.push(meta);
        }

        orders[idx].result_files = [...existingFiles, ...uploadedMeta];

        // Tandai selesai jika ada file & status selesai
        if (status === 'selesai') {
          orders[idx].has_result = true;
        }
      }

      await writeFile('data/orders.json', orders, sha);

      req.session.flash = { type: 'success', message: 'Pesanan berhasil diperbarui' };
      res.redirect(`/admin/pesanan/${orderId}`);
    } catch (err) {
      console.error('Update order error:', err.message);
      req.session.flash = { type: 'error', message: 'Gagal memperbarui pesanan: ' + err.message };
      res.redirect(`/admin/pesanan/${orderId}`);
    }
  }
);

// ─── DELETE /admin/orders/:id/files/:fileIdx ──────────────────────────────────
// Hapus satu file hasil dari GitHub + metadata
router.post('/orders/:id/delete-file', adminAuth, async (req, res) => {
  const { fileIdx } = req.body;
  try {
    const { json: orders, sha } = await readFile('data/orders.json');
    const idx = orders.findIndex((o) => o.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Pesanan tidak ditemukan' });

    const files = orders[idx].result_files || [];
    const fi    = parseInt(fileIdx);
    if (isNaN(fi) || fi < 0 || fi >= files.length)
      return res.status(400).json({ error: 'File index tidak valid' });

    const [removed] = files.splice(fi, 1);
    orders[idx].result_files = files;
    if (files.length === 0) orders[idx].has_result = false;
    orders[idx].updated_at = new Date().toISOString();

    await writeFile('data/orders.json', orders, sha);
    await deleteResultFile(removed.github_path);

    req.session.flash = { type: 'success', message: `File "${removed.name}" berhasil dihapus` };
    res.redirect(`/admin/pesanan/${req.params.id}`);
  } catch (err) {
    req.session.flash = { type: 'error', message: 'Gagal menghapus file: ' + err.message };
    res.redirect(`/admin/pesanan/${req.params.id}`);
  }
});

// ─── GET /admin/orders/:id/download/:fileIdx ──────────────────────────────────
// Download file dari GitHub repo (stream ke client)
router.get('/orders/:id/download/:fileIdx', adminAuth, async (req, res) => {
  try {
    const { json: orders } = await readFile('data/orders.json');
    const order = orders.find((o) => o.id === req.params.id);
    if (!order) return res.status(404).send('Pesanan tidak ditemukan');

    const fi   = parseInt(req.params.fileIdx);
    const file = (order.result_files || [])[fi];
    if (!file) return res.status(404).send('File tidak ditemukan');

    const { buffer, name } = await getResultFile(file.github_path);

    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(file.name)}"`);
    res.setHeader('Content-Type', 'application/octet-stream');
    res.send(buffer);
  } catch (err) {
    console.error('Download error:', err.message);
    res.status(500).send('Gagal mengunduh file');
  }
});

module.exports = router;
