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
    // Debug endpoint: /api/suppliers?debug=1
    if (req.query && req.query.debug) {
      const debug = { token: token ? 'SET' : 'MISSING', repo };
      if (token) {
        try {
          const r = await fetch(
            `https://api.github.com/repos/${repo}/contents/api/suppliers-data.json`,
            { headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github.v3+json' } }
          );
          debug.githubStatus = r.status;
          if (r.ok) {
            const json = await r.json();
            debug.githubOk = true;
            debug.fileSha = json.sha;
            const raw = JSON.parse(Buffer.from(json.content, 'base64').toString('utf8'));
            debug.fileTs = raw.ts || 0;
            debug.supplierCount = (raw.suppliers || raw).length;
          } else {
            debug.githubOk = false;
            debug.githubError = await r.text();
          }
        } catch(e) { debug.githubError = e.message; }
      }
      return res.status(200).json(debug);
    }

    if (token) {
      try {
        const r = await fetch(
          `https://api.github.com/repos/${repo}/contents/api/suppliers-data.json`,
          { headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github.v3+json' } }
        );
        if (r.ok) {
          const json = await r.json();
          const raw  = JSON.parse(Buffer.from(json.content, 'base64').toString('utf8'));
          if (raw && raw.suppliers) {
            return res.status(200).json(raw);
          } else if (Array.isArray(raw)) {
            return res.status(200).json({ suppliers: raw, ts: 0 });
          }
        } else {
          console.error('GitHub GET failed:', r.status);
        }
      } catch(e) {
        console.error('GitHub GET error:', e.message);
      }
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
      const suppliers = body.suppliers || (Array.isArray(body) ? body : []);
      const ts        = body.ts || Date.now();
      const payload   = { suppliers, ts };
      const content   = Buffer.from(JSON.stringify(payload, null, 2)).toString('base64');

      // Retry up to 3 times in case of SHA mismatch
      let lastError = null;
      for (let attempt = 0; attempt < 3; attempt++) {
        // Always fetch fresh SHA before each attempt
        const getR = await fetch(
          `https://api.github.com/repos/${repo}/contents/api/suppliers-data.json`,
          { headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github.v3+json', 'Cache-Control': 'no-cache' } }
        );
        if (!getR.ok) {
          const err = await getR.json();
          lastError = 'SHA fetch failed: ' + (err.message || getR.status);
          break;
        }
        const sha = (await getR.json()).sha;

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

        if (updateR.ok) {
          return res.status(200).json({ ok: true, ts });
        }

        const err = await updateR.json();
        lastError = err.message || updateR.status;
        // If not a SHA conflict, don't retry
        if (!lastError.includes('sha') && !lastError.includes('SHA') && updateR.status !== 409) break;
      }

      return res.status(500).json({ error: lastError });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  res.status(405).send('Method Not Allowed');
};
