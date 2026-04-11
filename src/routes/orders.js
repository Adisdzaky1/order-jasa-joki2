// src/routes/orders.js

const express = require('express');
const router = express.Router();
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const firebaseAuth = require('../middleware/firebaseAuth');
const { readFile, writeFile } = require('../services/github');

// Multer: simpan di memory (tidak boleh ke disk di Vercel)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 }, // max 2MB (Vercel 4.5MB limit)
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Tipe file tidak diizinkan'));
  },
});

// ─── POST /api/orders ─────────────────────────────────────────────────────────
// Buat order baru, upload file lampiran, simpan ke orders.json di GitHub
router.post('/', firebaseAuth, upload.single('attachment'), async (req, res) => {
  try {
    const { service_id, service_name, price, title, description } = req.body;

    if (!service_id || !title || !description) {
      return res.status(400).json({ error: 'Field wajib tidak lengkap' });
    }

    // Encode file lampiran ke base64 jika ada
    let attachment_file = null;
    let attachment_name = null;
    let attachment_type = null;

    if (req.file) {
      attachment_file = req.file.buffer.toString('base64');
      attachment_name = req.file.originalname;
      attachment_type = req.file.mimetype;
    }

    const orderId = uuidv4();
    const now = new Date().toISOString();

    const newOrder = {
      id: orderId,
      user_id: req.user.uid,
      user_email: req.user.email,
      user_name: req.body.user_name || req.user.name || '',
      service_id,
      service_name,
      price: Number(price),
      title,
      description,
      attachment_file,
      attachment_name,
      attachment_type,
      payment_method: null,
      atlantic_reff_id: null,
      atlantic_tx_id: null,
      payment_status: 'pending',
      status: 'menunggu_pembayaran',
      queue_number: null,
      result_file: null,
      result_filename: null,
      result_filetype: null,
      created_at: now,
      updated_at: now,
    };

    const { json: orders, sha } = await readFile('data/orders.json');
    orders.push(newOrder);
    await writeFile('data/orders.json', orders, sha);

    res.json({ success: true, orderId });
  } catch (err) {
    console.error('Create order error:', err.message);
    res.status(500).json({ error: err.message || 'Gagal membuat pesanan' });
  }
});

// ─── GET /api/orders/my ───────────────────────────────────────────────────────
// Ambil semua order milik user yang sedang login
router.get('/my', firebaseAuth, async (req, res) => {
  try {
    const { json: orders } = await readFile('data/orders.json');
    const myOrders = orders
      .filter((o) => o.user_id === req.user.uid)
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    res.json({ success: true, orders: myOrders });
  } catch (err) {
    res.status(500).json({ error: 'Gagal mengambil pesanan' });
  }
});

// ─── GET /api/orders/:id ──────────────────────────────────────────────────────
// Detail 1 order (hanya milik user sendiri, kecuali admin)
router.get('/:id', firebaseAuth, async (req, res) => {
  try {
    const { json: orders } = await readFile('data/orders.json');
    const order = orders.find((o) => o.id === req.params.id);

    if (!order) return res.status(404).json({ error: 'Pesanan tidak ditemukan' });
    if (order.user_id !== req.user.uid)
      return res.status(403).json({ error: 'Akses ditolak' });

    res.json({ success: true, order });
  } catch (err) {
    res.status(500).json({ error: 'Gagal mengambil pesanan' });
  }
});

module.exports = router;
