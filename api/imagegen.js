const fs = require('fs');
const path = require('path');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  try {
    const { images, modelIndex } = req.body;

    // Read model image
    const modelPath = path.join(process.cwd(), `model${(modelIndex || 0) + 1}.jpg`);
    const modelBuffer = fs.readFileSync(modelPath);
    const modelDataUri = `data:image/jpeg;base64,${modelBuffer.toString('base64')}`;

    // Use first clothing image
    const garmentImage = images[0];

    // Submit to fal.ai fashn/tryon
    const submitRes = await fetch('https://queue.fal.run/fashn/tryon', {
      method: 'POST',
      headers: {
        'Authorization': `Key ${process.env.FAL_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model_image: modelDataUri,
        garment_image: garmentImage,
        category: 'tops'
      })
    });

    const submitData = await submitRes.json();

    if (submitData.error) {
      return res.status(500).json({ error: submitData.error });
    }

    const requestId = submitData.request_id;
    if (!requestId) {
      return res.status(500).json({ error: JSON.stringify(submitData).slice(0, 200) });
    }

    // Poll for result
    let attempts = 0;
    while (attempts < 60) {
      await new Promise(r => setTimeout(r, 2000));

      const statusRes = await fetch(`https://queue.fal.run/fashn/tryon/requests/${requestId}`, {
        headers: { 'Authorization': `Key ${process.env.FAL_API_KEY}` }
      });
      const result = await statusRes.json();

      if (result.images?.[0]?.url) {
        return res.status(200).json({ image: result.images[0].url });
      }

      if (result.status === 'FAILED' || result.error) {
        return res.status(500).json({ error: result.error || 'fal.ai failed' });
      }

      attempts++;
    }

    res.status(500).json({ error: 'Timeout — bitte nochmal versuchen' });

  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
