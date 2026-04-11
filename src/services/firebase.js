// src/services/firebase.js

const admin = require('firebase-admin');

// Hindari inisialisasi ulang saat hot-reload di development
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      // Vercel menyimpan private key dengan literal \n — replace agar jadi newline asli
      privateKey: process.env.FIREBASE_PRIVATE_KEY
        ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
        : undefined,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    }),
  });
}

module.exports = admin;
