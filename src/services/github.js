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

/**
 * Baca file JSON dari GitHub repo.
 * @param {string} filePath  - contoh: 'data/orders.json'
 * @returns {{ json: any, sha: string }}
 */
async function readFile(filePath) {
  const { data } = await axios.get(
    `${BASE}/repos/${REPO}/contents/${filePath}`,
    { headers: getHeaders() }
  );
  const content = Buffer.from(data.content, 'base64').toString('utf8');
  return { json: JSON.parse(content), sha: data.sha };
}

/**
 * Tulis / update file JSON ke GitHub repo.
 * @param {string} filePath  - contoh: 'data/orders.json'
 * @param {any}    jsonData  - data yang akan disimpan
 * @param {string} sha       - SHA dari readFile() sebelumnya
 */
async function writeFile(filePath, jsonData, sha) {
  const content = Buffer.from(JSON.stringify(jsonData, null, 2)).toString('base64');
  await axios.put(
    `${BASE}/repos/${REPO}/contents/${filePath}`,
    {
      message: `update ${filePath}`,
      content,
      sha,
    },
    { headers: getHeaders() }
  );
}

/**
 * Helper: baca lalu update satu item dalam array JSON.
 * Mengembalikan array terbaru setelah update.
 */
async function updateOneInArray(filePath, id, updater) {
  const { json, sha } = await readFile(filePath);
  const idx = json.findIndex((item) => item.id === id);
  if (idx === -1) throw new Error(`Item id=${id} tidak ditemukan di ${filePath}`);
  json[idx] = { ...json[idx], ...updater(json[idx]), updated_at: new Date().toISOString() };
  await writeFile(filePath, json, sha);
  return json[idx];
}

module.exports = { readFile, writeFile, updateOneInArray };
