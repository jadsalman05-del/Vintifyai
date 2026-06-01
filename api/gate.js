const fs = require('fs');
const path = require('path');

// ══════════════════════════════════════════════════════════════════
//  WARTUNGSMODUS / MAINTENANCE
//  → true  = Besucher sehen maintenance.html (Bearbeitungsmodus)
//  → false = Besucher sehen die normale index.html (live)
// ══════════════════════════════════════════════════════════════════
const MAINTENANCE = true;

module.exports = async function handler(req, res) {
  const file = MAINTENANCE ? 'maintenance.html' : 'index.html';
  const html = fs.readFileSync(path.join(process.cwd(), file), 'utf-8');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  // Während Wartung nichts cachen, damit Besucher sofort die neue Seite sehen, wenn du wieder live gehst
  if (MAINTENANCE) res.setHeader('Cache-Control', 'no-store, must-revalidate');
  return res.status(200).send(html);
};
