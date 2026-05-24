const path = require('path');
const { readFileSync } = require('fs');

const STATIC_FILE = path.join(__dirname, 'suppliers-data.json');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const token = process.env.GITHUB_TOKEN;
  const repo  = process.env.GITHUB_REPO || 'jadsalman05-del/Vintifyai';

  // ── GET ──────────────────────────────────────────────────────────────────
  if (req.method === 'GET') {
    if (token) {
      try {
        const r = await fetch(
          `https://api.github.com/repos/${repo}/contents/api/suppliers-data.json`,
          { headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github.v3+json' } }
        );
        if (r.ok) {
          const json = await r.json();
          const raw  = JSON.parse(Buffer.from(json.content, 'base64').toString('utf8'));
          // Support both wrapped { suppliers, ts } and legacy plain array
          if (raw && raw.suppliers) {
            return res.status(200).json(raw);
          } else if (Array.isArray(raw)) {
            return res.status(200).json({ suppliers: raw, ts: 0 });
          }
        } else {
          console.error('GitHub GET failed:', r.status, await r.text());
        }
      } catch(e) {
        console.error('GitHub GET error:', e.message);
      }
    } else {
      console.warn('GITHUB_TOKEN not set – using static fallback');
    }

    // Fallback: committed static file
    try {
      const raw = JSON.parse(readFileSync(STATIC_FILE, 'utf8'));
      if (raw && raw.suppliers) return res.status(200).json(raw);
      return res.status(200).json({ suppliers: Array.isArray(raw) ? raw : [], ts: 0 });
    } catch {
      return res.status(200).json({ suppliers: [], ts: 0 });
    }
  }

  // ── POST ─────────────────────────────────────────────────────────────────
  if (req.method === 'POST') {
    if (!token) {
      return res.status(503).json({ error: 'GITHUB_TOKEN not configured' });
    }

    try {
      const body = req.body;
      // Accept both { suppliers, ts } and plain array
      const suppliers = body.suppliers || (Array.isArray(body) ? body : []);
      const ts        = body.ts || Date.now();
      const payload   = { suppliers, ts };

      // Get current SHA
      const getR = await fetch(
        `https://api.github.com/repos/${repo}/contents/api/suppliers-data.json`,
        { headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github.v3+json' } }
      );
      if (!getR.ok) {
        const err = await getR.json();
        return res.status(500).json({ error: 'SHA fetch failed: ' + (err.message || getR.status) });
      }
      const getJson = await getR.json();
      const sha = getJson.sha;

      // Update file
      const content = Buffer.from(JSON.stringify(payload, null, 2)).toString('base64');
      const updateR = await fetch(
        `https://api.github.com/repos/${repo}/contents/api/suppliers-data.json`,
        {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/vnd.github.v3+json',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ message: 'admin: update suppliers', content, sha })
        }
      );

      if (!updateR.ok) {
        const err = await updateR.json();
        return res.status(500).json({ error: err.message });
      }

      return res.status(200).json({ ok: true, ts });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  res.status(405).send('Method Not Allowed');
};
