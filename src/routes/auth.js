// src/routes/auth.js

const express = require('express');
const router = express.Router();
const admin = require('../services/firebase');
const { readFile, writeFile } = require('../services/github');

// ─── POST /api/auth/login ─────────────────────────────────────────────────────
// Menerima Firebase ID Token dari client → verifikasi → set cookie 30 hari
router.post('/login', async (req, res) => {
  const { idToken } = req.body;
  if (!idToken) return res.status(400).json({ error: 'idToken diperlukan' });

  try {
    const decoded = await admin.auth().verifyIdToken(idToken);

    // Set cookie httpOnly agar tidak bisa diakses JS client
    res.cookie('fb_token', idToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 hari
      sameSite: 'lax',
    });

    res.json({ success: true, uid: decoded.uid });
  } catch (err) {
    console.error('Login error:', err.message);
    res.status(401).json({ error: 'Token tidak valid' });
  }
});

// ─── POST /api/auth/register ──────────────────────────────────────────────────
// Simpan data user baru ke users.json di GitHub setelah Firebase create account
router.post('/register', async (req, res) => {
  const { uid, name, email } = req.body;
  if (!uid || !name || !email)
    return res.status(400).json({ error: 'uid, name, dan email diperlukan' });

  try {
    const { json: users, sha } = await readFile('data/users.json');

    // Cegah duplikat
    if (users.find((u) => u.uid === uid)) {
      return res.json({ success: true, message: 'User sudah terdaftar' });
    }

    users.push({
      uid,
      name,
      email,
      created_at: new Date().toISOString(),
    });

    await writeFile('data/users.json', users, sha);
    res.json({ success: true });
  } catch (err) {
    console.error('Register error:', err.message);
    res.status(500).json({ error: 'Gagal menyimpan data user' });
  }
});

// ─── POST /api/auth/logout ────────────────────────────────────────────────────
router.post('/logout', (req, res) => {
  res.clearCookie('fb_token');
  res.json({ success: true });
});

module.exports = router;
