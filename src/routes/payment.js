// src/routes/payment.js

const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const firebaseAuth = require('../middleware/firebaseAuth');
const { readFile, writeFile } = require('../services/github');
const atlantic = require('../services/atlantic');

// ─── GET /api/payment/methods ─────────────────────────────────────────────────
// Proxy ke Atlantic → daftar metode pembayaran aktif
router.get('/methods', async (req, res) => {
  try {
    const result = await atlantic.getMetode();
    if (!result.status) return res.status(502).json({ error: 'Gagal mengambil metode' });
    res.json({ success: true, methods: result.data });
  } catch (err) {
    console.error('Get methods error:', err.message);
    res.status(500).json({ error: 'Gagal mengambil metode pembayaran' });
  }
});

// ─── POST /api/payment/create ─────────────────────────────────────────────────
// Buat tagihan Atlantic → update order dengan tx_id & QR code
router.post('/create', firebaseAuth, async (req, res) => {
  const { orderId, metode } = req.body;
  if (!orderId || !metode)
    return res.status(400).json({ error: 'orderId dan metode diperlukan' });

  try {
    const { json: orders, sha } = await readFile('data/orders.json');
    const idx = orders.findIndex((o) => o.id === orderId);

    if (idx === -1) return res.status(404).json({ error: 'Pesanan tidak ditemukan' });
    if (orders[idx].user_id !== req.user.uid)
      return res.status(403).json({ error: 'Akses ditolak' });

    const reff_id = `order-${uuidv4().split('-')[0]}`;
    const result = await atlantic.createDeposit(reff_id, orders[idx].price, metode);

    if (!result.status) {
      return res.status(502).json({ error: result.message || 'Atlantic error' });
    }

    // Update order
    orders[idx] = {
      ...orders[idx],
      payment_method: metode,
      atlantic_reff_id: reff_id,
      atlantic_tx_id: result.data.id,
      payment_status: 'pending',
      atlantic_qr_string: result.data.qr_string,
      atlantic_qr_image: result.data.qr_image,
      atlantic_expired_at: result.data.expired_at,
      updated_at: new Date().toISOString(),
    };

    await writeFile('data/orders.json', orders, sha);

    res.json({
      success: true,
      qr_image: result.data.qr_image,
      qr_string: result.data.qr_string,
      expired_at: result.data.expired_at,
      tx_id: result.data.id,
    });
  } catch (err) {
    console.error('Create payment error:', err.message);
    res.status(500).json({ error: 'Gagal membuat tagihan' });
  }
});

// ─── GET /api/payment/status/:orderId ────────────────────────────────────────
// Polling status bayar → update order jika sudah success
router.get('/status/:orderId', firebaseAuth, async (req, res) => {
  try {
    const { json: orders, sha } = await readFile('data/orders.json');
    const idx = orders.findIndex((o) => o.id === req.params.orderId);

    if (idx === -1) return res.status(404).json({ error: 'Pesanan tidak ditemukan' });
    if (orders[idx].user_id !== req.user.uid)
      return res.status(403).json({ error: 'Akses ditolak' });

    const order = orders[idx];

    // Jika sudah success, kembalikan langsung tanpa cek ulang ke Atlantic
    if (order.payment_status === 'success') {
      return res.json({ success: true, payment_status: 'success', order_status: order.status });
    }

    // Cek ke Atlantic
    const result = await atlantic.checkDeposit(order.atlantic_tx_id);

    if (result.status && result.data?.status === 'success') {
      orders[idx] = {
        ...orders[idx],
        payment_status: 'success',
        status: 'antrian',
        updated_at: new Date().toISOString(),
      };

      // Hitung nomor antrian
      const antrian = orders.filter((o) => o.status === 'antrian').length;
      orders[idx].queue_number = antrian;

      await writeFile('data/orders.json', orders, sha);
      return res.json({ success: true, payment_status: 'success', order_status: 'antrian' });
    }

    res.json({ success: true, payment_status: order.payment_status });
  } catch (err) {
    console.error('Payment status error:', err.message);
    res.status(500).json({ error: 'Gagal cek status pembayaran' });
  }
});

module.exports = router;
