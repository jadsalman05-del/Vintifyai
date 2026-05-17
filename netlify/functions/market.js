const fs = require('fs');
const DATA_FILE = '/tmp/vintify-market.json';

exports.handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod === 'GET') {
    try {
      const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
      return { statusCode: 200, headers, body: JSON.stringify(data) };
    } catch {
      return { statusCode: 200, headers, body: JSON.stringify(null) };
    }
  }

  if (event.httpMethod === 'POST') {
    try {
      fs.writeFileSync(DATA_FILE, event.body);
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
    } catch (e) {
      return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
    }
  }

  return { statusCode: 405, headers, body: 'Method Not Allowed' };
};
