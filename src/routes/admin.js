// src/routes/admin.js

const express = require('express');
const router  = express.Router();
const multer  = require('multer');
const adminAuth = require('../middleware/adminAuth');
const { readFile, writeFile, uploadResultFile, getResultFile, deleteResultFile } = require('../services/github');

const ADMIN_USER     = 'adm';
const ADMIN_PASS     = 'adm@123';
const MAX_AGE_30DAYS = 30 * 24 * 60 * 60 * 1000; // ms

// ── Cookie options (sama polanya dengan fb_token milik user) ─────────────────
function adminCookieOpts() {
  return {
    signed:   true,                                // pakai cookie-parser signed
    httpOnly: true,                                // tidak bisa diakses JS browser
    secure:   process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge:   MAX_AGE_30DAYS,
  };
}

// ── Multer: memory storage, semua format, 100MB/file ─────────────────────────
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024, files: 20 },
});

// ─── POST /admin/auth/login ───────────────────────────────────────────────────
router.post('/auth/login', (req, res) => {
  const { username, password } = req.body;

  if (username === ADMIN_USER && password === ADMIN_PASS) {
    // Set signed cookie — bertahan 30 hari, tidak bergantung server memory
    res.cookie('admin_token', 'authenticated', adminCookieOpts());
    return res.redirect('/admin/dashboard');
  }

  // Pakai flash melalui cookie sementara (1 request)
  res.cookie('admin_flash', JSON.stringify({ type: 'error', message: 'Username atau password salah' }), {
    httpOnly: true,
    maxAge: 5000,
    sameSite: 'lax',
  });
  res.redirect('/admin/login');
});

// ─── POST /admin/auth/logout ──────────────────────────────────────────────────
router.post('/auth/logout', (req, res) => {
  res.clearCookie('admin_token');
  res.redirect('/admin/login');
});

// ─── GET /admin (root) ────────────────────────────────────────────────────────
router.get('/', (req, res) => {
  const isAdmin = req.signedCookies?.admin_token === 'authenticated';
  if (isAdmin) return res.redirect('/admin/dashboard');
  res.redirect('/admin/login');
});

// ─── GET /admin/login ─────────────────────────────────────────────────────────
router.get('/login', (req, res) => {
  const isAdmin = req.signedCookies?.admin_token === 'authenticated';
  if (isAdmin) return res.redirect('/admin/dashboard');

  // Ambil flash dari cookie sementara
  let flash = null;
  if (req.cookies?.admin_flash) {
    try { flash = JSON.parse(req.cookies.admin_flash); } catch { /* ignore */ }
    res.clearCookie('admin_flash');
  }

  res.render('admin/login', { layout: 'layouts/admin', title: 'Admin Login', flash });
});

// ─── GET /admin/dashboard ─────────────────────────────────────────────────────
router.get('/dashboard', adminAuth, async (req, res) => {
  try {
    const { json: orders } = await readFile('data/orders.json');
    const stats = {
      total:      orders.length,
      menunggu:   orders.filter((o) => o.status === 'menunggu_pembayaran').length,
      antrian:    orders.filter((o) => o.status === 'antrian').length,
      dikerjakan: orders.filter((o) => o.status === 'dikerjakan').length,
      selesai:    orders.filter((o) => o.status === 'selesai').length,
    };
    const recentOrders = [...orders]
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .slice(0, 5);

    res.render('admin/dashboard', {
      layout: 'layouts/admin',
      title: 'Admin Dashboard',
      stats,
      recentOrders,
      flash: _popFlash(req, res),
    });
  } catch (err) {
    console.error('Admin dashboard error:', err.message);
    res.status(500).send('Gagal memuat dashboard: ' + err.message);
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
      flash: _popFlash(req, res),
    });
  } catch (err) {
    res.status(500).send('Gagal memuat pesanan: ' + err.message);
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
      flash: _popFlash(req, res),
    });
  } catch (err) {
    res.status(500).send('Gagal memuat detail pesanan: ' + err.message);
  }
});

// ─── POST /admin/orders/:id/update ───────────────────────────────────────────
router.post(
  '/orders/:id/update',
  adminAuth,
  upload.array('result_files', 20),
  async (req, res) => {
    const orderId = req.params.id;
    try {
      const { status } = req.body;
      const { json: orders, sha } = await readFile('data/orders.json');
      const idx = orders.findIndex((o) => o.id === orderId);

      if (idx === -1) {
        _setFlash(res, 'error', 'Pesanan tidak ditemukan');
        return res.redirect(`/admin/pesanan/${orderId}`);
      }

      // Nomor antrian otomatis
      if (status === 'antrian' && orders[idx].status !== 'antrian') {
        const total = orders.filter((o) => o.status === 'antrian').length;
        orders[idx].queue_number = total + 1;
      }

      orders[idx].status     = status;
      orders[idx].updated_at = new Date().toISOString();

      // Upload file baru ke GitHub
      if (req.files && req.files.length > 0) {
        const existing = orders[idx].result_files || [];
        const uploaded = [];
        for (const file of req.files) {
          const meta = await uploadResultFile(orderId, file.buffer, file.originalname);
          uploaded.push(meta);
        }
        orders[idx].result_files = [...existing, ...uploaded];
        if (status === 'selesai') orders[idx].has_result = true;
      }

      await writeFile('data/orders.json', orders, sha);
      _setFlash(res, 'success', 'Pesanan berhasil diperbarui');
      res.redirect(`/admin/pesanan/${orderId}`);
    } catch (err) {
      console.error('Update order error:', err.message);
      _setFlash(res, 'error', 'Gagal memperbarui: ' + err.message);
      res.redirect(`/admin/pesanan/${orderId}`);
    }
  }
);

// ─── POST /admin/orders/:id/delete-file ──────────────────────────────────────
router.post('/orders/:id/delete-file', adminAuth, async (req, res) => {
  const { fileIdx } = req.body;
  try {
    const { json: orders, sha } = await readFile('data/orders.json');
    const idx = orders.findIndex((o) => o.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Pesanan tidak ditemukan' });

    const files = orders[idx].result_files || [];
    const fi    = parseInt(fileIdx);
    if (isNaN(fi) || fi < 0 || fi >= files.length) {
      _setFlash(res, 'error', 'File index tidak valid');
      return res.redirect(`/admin/pesanan/${req.params.id}`);
    }

    const [removed] = files.splice(fi, 1);
    orders[idx].result_files = files;
    if (files.length === 0) orders[idx].has_result = false;
    orders[idx].updated_at = new Date().toISOString();

    await writeFile('data/orders.json', orders, sha);
    await deleteResultFile(removed.github_path);

    _setFlash(res, 'success', `File "${removed.name}" berhasil dihapus`);
    res.redirect(`/admin/pesanan/${req.params.id}`);
  } catch (err) {
    _setFlash(res, 'error', 'Gagal menghapus file: ' + err.message);
    res.redirect(`/admin/pesanan/${req.params.id}`);
  }
});

// ─── GET /admin/orders/:id/download/:fileIdx ──────────────────────────────────
router.get('/orders/:id/download/:fileIdx', adminAuth, async (req, res) => {
  try {
    const { json: orders } = await readFile('data/orders.json');
    const order = orders.find((o) => o.id === req.params.id);
    if (!order) return res.status(404).send('Pesanan tidak ditemukan');

    const fi   = parseInt(req.params.fileIdx);
    const file = (order.result_files || [])[fi];
    if (!file) return res.status(404).send('File tidak ditemukan');

    const { buffer } = await getResultFile(file.github_path);
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(file.name)}"`);
    res.setHeader('Content-Type', 'application/octet-stream');
    res.send(buffer);
  } catch (err) {
    console.error('Download error:', err.message);
    res.status(500).send('Gagal mengunduh file: ' + err.message);
  }
});

// ── Helpers flash via signed cookie ──────────────────────────────────────────
function _setFlash(res, type, message) {
  res.cookie('admin_flash', JSON.stringify({ type, message }), {
    httpOnly: true,
    maxAge: 8000,   // 8 detik — cukup untuk redirect + render
    sameSite: 'lax',
  });
}

function _popFlash(req, res) {
  if (!req.cookies?.admin_flash) return null;
  let flash = null;
  try { flash = JSON.parse(req.cookies.admin_flash); } catch { /* ignore */ }
  res.clearCookie('admin_flash');
  return flash;
}

module.exports = router;
