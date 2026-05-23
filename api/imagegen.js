const fs = require('fs');
const path = require('path');

async function parseJson(response) {
  const text = await response.text();
  if (!text || !text.trim()) throw new Error(`Empty response (HTTP ${response.status}) from fal.ai`);
  try {
    return JSON.parse(text);
  } catch (e) {
    throw new Error(`fal.ai returned non-JSON (HTTP ${response.status}): ${text.slice(0, 300)}`);
  }
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  try {
    const { images, modelIndex, category, request_id } = req.body;

    // Phase 2: check status of existing job
    if (request_id) {
      const statusRes = await fetch(`https://queue.fal.run/fal-ai/fashn/tryon/v1.5/requests/${request_id}/status`, {
        headers: { 'Authorization': `Key ${process.env.FAL_API_KEY}` },
      });
      const status = await parseJson(statusRes);

      if (status.status === 'COMPLETED') {
        const resultRes = await fetch(`https://queue.fal.run/fal-ai/fashn/tryon/v1.5/requests/${request_id}`, {
          headers: { 'Authorization': `Key ${process.env.FAL_API_KEY}` },
        });
        const result = await parseJson(resultRes);
        const url = result.images?.[0]?.url || result.image?.url || result.output?.images?.[0]?.url;
        if (url) return res.status(200).json({ done: true, image: url });
        return res.status(200).json({ done: true, error: 'No image in response: ' + JSON.stringify(result).slice(0, 300) });
      }

      if (status.status === 'FAILED') {
        return res.status(200).json({ done: true, error: status.error || 'Generation failed' });
      }

      return res.status(200).json({ done: false, status: status.status || 'IN_QUEUE' });
    }

    // Phase 1: submit job
    if (!images || !images[0]) return res.status(400).json({ error: 'No garment image provided' });

    const modelPath = path.join(process.cwd(), `model${(modelIndex || 0) + 1}.jpg`);
    const modelBuffer = fs.readFileSync(modelPath);
    const modelDataUri = `data:image/jpeg;base64,${modelBuffer.toString('base64')}`;

    const submitRes = await fetch('https://queue.fal.run/fal-ai/fashn/tryon/v1.5', {
      method: 'POST',
      headers: {
        'Authorization': `Key ${process.env.FAL_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model_image: modelDataUri,
        garment_image: images[0],
        category: category || 'tops',
        mode: 'balanced',
      }),
    });

    const submitData = await parseJson(submitRes);
    if (!submitData.request_id) {
      return res.status(500).json({ error: submitData.detail || submitData.error || JSON.stringify(submitData).slice(0, 300) });
    }

    return res.status(200).json({ request_id: submitData.request_id });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
