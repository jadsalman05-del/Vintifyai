const fs = require('fs');
const path = require('path');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  try {
    const { images, modelIndex } = req.body;

    // Describe clothing with Gemini Vision (text only - free)
    const visionParts = [];
    for (const img of images) {
      const match = img.match(/^data:([^;]+);base64,(.+)$/);
      if (match) {
        visionParts.push({ inline_data: { mime_type: match[1], data: match[2] } });
      }
    }
    visionParts.push({
      text: "Describe this exact clothing item very precisely: exact color(s), brand name and logo details, type of garment, all visible text, patterns, materials, and unique design features. Be extremely detailed."
    });

    const visionRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GOOGLE_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: visionParts }] })
      }
    );
    const visionData = await visionRes.json();
    const clothingDesc = visionData.candidates?.[0]?.content?.parts?.[0]?.text || "a stylish clothing item";

    // Read model image
    const modelPath = path.join(process.cwd(), `model${(modelIndex || 0) + 1}.jpg`);
    const modelBuffer = fs.readFileSync(modelPath);

    const prompt = `Virtual try-on photo shoot. Take the person in this photo and dress them in this EXACT clothing item: ${clothingDesc}. The clothing must be reproduced exactly as described with all logos, colors, text and details. Do NOT change the person's face, skin, pose, hair, or background. Only swap the clothing.`;

    const formData = new FormData();
    formData.append('model', 'gpt-image-1');
    formData.append('prompt', prompt);
    formData.append('n', '1');
    formData.append('size', '1024x1024');
    formData.append('quality', 'high');
    formData.append('image[]', new Blob([modelBuffer], { type: 'image/jpeg' }), 'model.jpg');

    for (let i = 0; i < images.length; i++) {
      const match = images[i].match(/^data:([^;]+);base64,(.+)$/);
      if (match) {
        const buf = Buffer.from(match[2], 'base64');
        formData.append('image[]', new Blob([buf], { type: match[1] }), `clothing${i}.jpg`);
      }
    }

    const editRes = await fetch('https://api.openai.com/v1/images/edits', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}` },
      body: formData
    });

    const editData = await editRes.json();

    if (editData.error) {
      return res.status(500).json({ error: editData.error.message });
    }

    const b64 = editData.data?.[0]?.b64_json;
    const url = editData.data?.[0]?.url;
    const image = b64 ? `data:image/png;base64,${b64}` : url;

    if (!image) return res.status(500).json({ error: 'Kein Bild generiert' });

    res.status(200).json({ image });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
