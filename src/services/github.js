// src/services/github.js

const axios = require('axios');

const BASE = 'https://api.github.com';
const REPO = `${process.env.GITHUB_OWNER}/${process.env.GITHUB_REPO}`;

function getHeaders() {
  return {
    Authorization: `token ${process.env.GITHUB_TOKEN}`,
    Accept: 'application/vnd.github.v3+json',
  };
}

// ─── Baca file JSON (orders/users/services) ───────────────────────────────────
async function readFile(filePath) {
  const { data } = await axios.get(
    `${BASE}/repos/${REPO}/contents/${filePath}`,
    { headers: getHeaders() }
  );
  const content = Buffer.from(data.content, 'base64').toString('utf8');
  return { json: JSON.parse(content), sha: data.sha };
}

// ─── Tulis file JSON ke repo ──────────────────────────────────────────────────
async function writeFile(filePath, jsonData, sha) {
  const content = Buffer.from(JSON.stringify(jsonData, null, 2)).toString('base64');
  await axios.put(
    `${BASE}/repos/${REPO}/contents/${filePath}`,
    { message: `update ${filePath}`, content, sha },
    { headers: getHeaders() }
  );
}

// ─── Upload file hasil kerja ke repo (binary) ─────────────────────────────────
// Simpan di: results/{orderId}/{timestamp}_{filename}
// GitHub Contents API max ~100MB per file
async function uploadResultFile(orderId, buffer, originalName) {
  const safeName    = originalName.replace(/[^a-zA-Z0-9._\-]/g, '_');
  const timestamp   = Date.now();
  const githubPath  = `results/${orderId}/${timestamp}_${safeName}`;
  const content     = buffer.toString('base64');

  // Cek apakah file sudah ada (untuk dapat SHA jika replace)
  let sha;
  try {
    const { data } = await axios.get(
      `${BASE}/repos/${REPO}/contents/${githubPath}`,
      { headers: getHeaders() }
    );
    sha = data.sha;
  } catch {
    sha = undefined; // file baru, tidak perlu SHA
  }

  const body = {
    message: `upload result: ${githubPath}`,
    content,
    ...(sha ? { sha } : {}),
  };

  await axios.put(
    `${BASE}/repos/${REPO}/contents/${githubPath}`,
    body,
    { headers: getHeaders() }
  );

  return {
    github_path:  githubPath,
    name:         originalName,
    size:         buffer.length,
    uploaded_at:  new Date().toISOString(),
  };
}

// ─── Ambil isi file dari repo (return Buffer) ─────────────────────────────────
async function getResultFile(githubPath) {
  const { data } = await axios.get(
    `${BASE}/repos/${REPO}/contents/${githubPath}`,
    { headers: getHeaders() }
  );
  return {
    buffer:   Buffer.from(data.content, 'base64'),
    sha:      data.sha,
    name:     data.name,
    size:     data.size,
  };
}

// ─── Hapus file dari repo ─────────────────────────────────────────────────────
async function deleteResultFile(githubPath) {
  try {
    const { data } = await axios.get(
      `${BASE}/repos/${REPO}/contents/${githubPath}`,
      { headers: getHeaders() }
    );
    await axios.delete(
      `${BASE}/repos/${REPO}/contents/${githubPath}`,
      {
        headers: getHeaders(),
        data: { message: `delete result: ${githubPath}`, sha: data.sha },
      }
    );
  } catch (err) {
    console.warn('deleteResultFile warn:', err.message);
  }
}

// ─── Helper update item dalam array JSON ──────────────────────────────────────
async function updateOneInArray(filePath, id, updater) {
  const { json, sha } = await readFile(filePath);
  const idx = json.findIndex((item) => item.id === id);
  if (idx === -1) throw new Error(`Item id=${id} tidak ditemukan di ${filePath}`);
  json[idx] = { ...json[idx], ...updater(json[idx]), updated_at: new Date().toISOString() };
  await writeFile(filePath, json, sha);
  return json[idx];
}

module.exports = { readFile, writeFile, uploadResultFile, getResultFile, deleteResultFile, updateOneInArray };
