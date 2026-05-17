const { readFileSync, writeFileSync } = require('fs');

const DATA_FILE = '/tmp/vintify-market.json';

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');

  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'GET') {
    try {
      const data = JSON.parse(readFileSync(DATA_FILE, 'utf8'));
      return res.status(200).json(data);
    } catch {
      return res.status(200).json(null);
    }
  }

  if (req.method === 'POST') {
    try {
      writeFileSync(DATA_FILE, JSON.stringify(req.body));
      return res.status(200).json({ ok: true });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  res.status(405).send('Method Not Allowed');
};
