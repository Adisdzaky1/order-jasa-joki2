// src/services/atlantic.js

const axios = require('axios');
const qs = require('qs');

const ATLANTIC_KEY = process.env.ATLANTIC_API_KEY;
const BASE_CREATE = 'https://atlantic-api-docs.vercel.app';
const BASE_PROD   = 'https://atlantic-api-docs.vercel.app';

/**
 * Buat transaksi deposit (QRIS / e-wallet).
 * @param {string} reff_id  - ID referensi unik dari sistem kita
 * @param {number} nominal  - jumlah dalam rupiah
 * @param {string} metode   - 'qris' | 'ovo' | 'dana' | 'shopeepay' | 'linkaja'
 */
async function createDeposit(reff_id, nominal, metode) {
  const { data } = await axios.post(
    `${BASE_CREATE}/deposit/create`,
    qs.stringify({
      api_key: ATLANTIC_KEY,
      reff_id,
      nominal,
      type: 'ewallet',
      metode,
    })
  );
  return data;
}

/**
 * Cek status deposit berdasarkan ID transaksi Atlantic.
 * @param {string} id - atlantic_tx_id
 */
async function checkDeposit(id) {
  const { data } = await axios.post(
    `${BASE_PROD}/deposit/status`,
    qs.stringify({ api_key: ATLANTIC_KEY, id })
  );
  return data;
}

/**
 * Ambil daftar metode pembayaran yang tersedia.
 * @param {string} type - default 'ewallet'
 */
async function getMetode(type = 'ewallet') {
  const { data } = await axios.post(
    `${BASE_PROD}/deposit/metode`,
    qs.stringify({ api_key: ATLANTIC_KEY, type })
  );
  return data;
}

module.exports = { createDeposit, checkDeposit, getMetode };
