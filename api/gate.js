const fs = require('fs');
const path = require('path');

module.exports = async function handler(req, res) {
  const html = fs.readFileSync(path.join(process.cwd(), 'index.html'), 'utf-8');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  return res.status(200).send(html);
};
