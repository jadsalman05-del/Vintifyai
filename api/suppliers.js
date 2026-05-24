const path = require('path');
const { readFileSync } = require('fs');

// Committed static file als Basis
const STATIC_FILE = path.join(__dirname, 'suppliers-data.json');

// In-memory store für Admin-Updates (überlebt innerhalb einer Vercel-Instance)
let memoryStore = null;

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');

  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'GET') {
    // Zuerst GitHub prüfen (wenn GITHUB_TOKEN gesetzt)
    const token = process.env.GITHUB_TOKEN;
    const repo  = process.env.GITHUB_REPO || 'jadsalman05-del/Vintifyai';

    if (token) {
      try {
        const r = await fetch(
          `https://api.github.com/repos/${repo}/contents/api/suppliers-data.json`,
          { headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github.v3+json' } }
        );
        if (r.ok) {
          const json = await r.json();
          const data = JSON.parse(Buffer.from(json.content, 'base64').toString('utf8'));
          return res.status(200).json(data);
        }
      } catch(e) {}
    }

    // Fallback: committed static file
    try {
      const data = JSON.parse(readFileSync(STATIC_FILE, 'utf8'));
      return res.status(200).json(data);
    } catch {
      return res.status(200).json([]);
    }
  }

  if (req.method === 'POST') {
    const token = process.env.GITHUB_TOKEN;
    const repo  = process.env.GITHUB_REPO || 'jadsalman05-del/Vintifyai';

    if (!token) {
      return res.status(503).json({ error: 'GITHUB_TOKEN not configured' });
    }

    try {
      const suppliers = req.body;

      // Aktuelle SHA holen (braucht GitHub für Update)
      const getR = await fetch(
        `https://api.github.com/repos/${repo}/contents/api/suppliers-data.json`,
        { headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github.v3+json' } }
      );
      const getJson = await getR.json();
      const sha = getJson.sha;

      // Datei updaten
      const content = Buffer.from(JSON.stringify(suppliers, null, 2)).toString('base64');
      const updateR = await fetch(
        `https://api.github.com/repos/${repo}/contents/api/suppliers-data.json`,
        {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/vnd.github.v3+json',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            message: 'admin: update suppliers',
            content,
            sha
          })
        }
      );

      if (!updateR.ok) {
        const err = await updateR.json();
        return res.status(500).json({ error: err.message });
      }

      return res.status(200).json({ ok: true });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  res.status(405).send('Method Not Allowed');
};
