// src/routes/payment.js

const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const firebaseAuth = require('../middleware/firebaseAuth');
const { readFile, writeFile } = require('../services/github');
const atlantic = require('../services/atlantic');

// ── Konstanta fee QRIS ────────────────────────────────────────────────────────
const QRIS_ADMIN_FEE = 1000;  // Rp 1.000 flat
const QRIS_PERCENT   = 0.007; // 0.7%

function calcQrisFee(price) {
  const feeFlat    = QRIS_ADMIN_FEE;
  const feePercent = Math.ceil(price * QRIS_PERCENT);
  const feeTotal   = feeFlat + feePercent;
  const grandTotal = price + feeTotal;
  return { subtotal: price, feeFlat, feePercent, feeTotal, grandTotal };
}

// ─── GET /api/payment/methods ─────────────────────────────────────────────────
router.get('/methods', async (req, res) => {
  try {
    const samplePrice = Number(req.query.price) || 0;
    const fee = calcQrisFee(samplePrice);
    res.json({
      success: true,
      methods: [{
        metode: 'qris',
        name: 'QRIS',
        type: 'ewallet',
        fee_flat: QRIS_ADMIN_FEE,
        fee_persen: 0.7,
        fee_note: 'Biaya admin Rp 1.000 + 0,7% dari harga',
        img_url: 'https://s3.atlantic-pedia.co.id/1699928452_bf58d7f0dd0491fed9b1.png',
        status: 'aktif',
        ...(samplePrice ? { fee_total: fee.feeTotal, grand_total: fee.grandTotal } : {}),
      }],
    });
  } catch (err) {
    res.status(500).json({ error: 'Gagal mengambil metode pembayaran' });
  }
});

// ─── GET /api/payment/fee ─────────────────────────────────────────────────────
router.get('/fee', (req, res) => {
  const price = Number(req.query.price);
  if (!price || price <= 0) return res.status(400).json({ error: 'price tidak valid' });
  res.json({ success: true, ...calcQrisFee(price) });
});

// ─── POST /api/payment/create ─────────────────────────────────────────────────
router.post('/create', firebaseAuth, async (req, res) => {
  const { orderId } = req.body;
  if (!orderId) return res.status(400).json({ error: 'orderId diperlukan' });

  try {
    const { json: orders, sha } = await readFile('data/orders.json');
    const idx = orders.findIndex((o) => o.id === orderId);
    if (idx === -1) return res.status(404).json({ error: 'Pesanan tidak ditemukan' });
    if (orders[idx].user_id !== req.user.uid) return res.status(403).json({ error: 'Akses ditolak' });

    const { grandTotal, feeFlat, feePercent, feeTotal } = calcQrisFee(orders[idx].price);
    const reff_id = `order-${uuidv4().split('-')[0]}`;
    const result  = await atlantic.createDeposit(reff_id, grandTotal, 'qris');

    if (!result.status) return res.status(502).json({ error: result.message || 'Atlantic error' });

    orders[idx] = {
      ...orders[idx],
      payment_method: 'qris',
      atlantic_reff_id: reff_id,
      atlantic_tx_id: result.data.id,
      payment_status: 'pending',
      fee_flat: feeFlat,
      fee_percent: feePercent,
      fee_total: feeTotal,
      grand_total: grandTotal,
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
      grand_total: grandTotal,
      fee_total: feeTotal,
      fee_flat: feeFlat,
      fee_percent: feePercent,
    });
  } catch (err) {
    console.error('Create payment error:', err.message);
    res.status(500).json({ error: 'Gagal membuat tagihan' });
  }
});

// ─── GET /api/payment/status/:orderId ─────────────────────────────────────────
router.get('/status/:orderId', firebaseAuth, async (req, res) => {
  try {
    const { json: orders, sha } = await readFile('data/orders.json');
    const idx = orders.findIndex((o) => o.id === req.params.orderId);
    if (idx === -1) return res.status(404).json({ error: 'Pesanan tidak ditemukan' });
    if (orders[idx].user_id !== req.user.uid) return res.status(403).json({ error: 'Akses ditolak' });

    const order = orders[idx];
    if (order.payment_status === 'success') {
      return res.json({ success: true, payment_status: 'success', order_status: order.status });
    }

    const result = await atlantic.checkDeposit(order.atlantic_tx_id);
    if (result.status && result.data?.status === 'success') {
      const antrian = orders.filter((o) => o.status === 'antrian').length;
      orders[idx] = {
        ...orders[idx],
        payment_status: 'success',
        status: 'antrian',
        queue_number: antrian + 1,
        updated_at: new Date().toISOString(),
      };
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
