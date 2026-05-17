const fs = require('fs');
const path = require('path');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  try {
    const { images, modelIndex } = req.body;

    // Read model image as base64 data URI
    const modelPath = path.join(process.cwd(), `model${(modelIndex || 0) + 1}.jpg`);
    const modelBuffer = fs.readFileSync(modelPath);
    const modelDataUri = `data:image/jpeg;base64,${modelBuffer.toString('base64')}`;

    // Use first clothing image
    const clothingImage = images[0];

    // Describe clothing with Gemini (free text-only)
    const visionParts = [];
    for (const img of images) {
      const match = img.match(/^data:([^;]+);base64,(.+)$/);
      if (match) visionParts.push({ inline_data: { mime_type: match[1], data: match[2] } });
    }
    visionParts.push({ text: "Describe this clothing item briefly: color, brand, type." });

    const visionRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GOOGLE_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: visionParts }] })
      }
    );
    const visionData = await visionRes.json();
    const clothingDesc = visionData.candidates?.[0]?.content?.parts?.[0]?.text || "a clothing item";

    // Start Replicate prediction (IDM-VTON)
    const predRes = await fetch('https://api.replicate.com/v1/models/cuuupid/idm-vton/predictions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.REPLICATE_API_TOKEN}`,
        'Content-Type': 'application/json',
        'Prefer': 'wait'
      },
      body: JSON.stringify({
        input: {
          human_img: modelDataUri,
          garm_img: clothingImage,
          garment_des: clothingDesc,
          is_checked: true,
          is_checked_crop: false,
          denoise_steps: 30,
          seed: 42
        }
      })
    });

    const predData = await predRes.json();

    if (predData.error) {
      return res.status(500).json({ error: predData.error });
    }

    // Poll for result if not done yet
    let result = predData;
    let attempts = 0;
    while (result.status !== 'succeeded' && result.status !== 'failed' && attempts < 60) {
      await new Promise(r => setTimeout(r, 2000));
      const pollRes = await fetch(`https://api.replicate.com/v1/predictions/${result.id}`, {
        headers: { 'Authorization': `Bearer ${process.env.REPLICATE_API_TOKEN}` }
      });
      result = await pollRes.json();
      attempts++;
    }

    if (result.status === 'failed') {
      return res.status(500).json({ error: result.error || 'Replicate failed' });
    }

    const imageUrl = Array.isArray(result.output) ? result.output[0] : result.output;
    if (!imageUrl) return res.status(500).json({ error: 'Kein Bild generiert' });

    res.status(200).json({ image: imageUrl });

  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
