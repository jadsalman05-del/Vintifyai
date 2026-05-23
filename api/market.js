const path = require('path');
const { readFileSync, writeFileSync } = require('fs');

// market-data.json liegt im api/ Ordner und ist Teil des Deployments
const DATA_FILE = path.join(__dirname, 'market-data.json');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');

  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'GET') {
    try {
      const data = JSON.parse(readFileSync(DATA_FILE, 'utf8'));
      return res.status(200).json(data);
    } catch {
      // Fallback: leere Antwort, client nutzt DEFAULT_MARKET
      return res.status(200).json(null);
    }
  }

  if (req.method === 'POST') {
    try {
      // Nur schreiben wenn in /tmp (Serverless-Umgebung) – für Admin-Updates via UI
      const tmpFile = '/tmp/vintify-market-override.json';
      writeFileSync(tmpFile, JSON.stringify(req.body));
      return res.status(200).json({ ok: true });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  res.status(405).send('Method Not Allowed');
};
