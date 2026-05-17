const fs = require('fs');
const path = require('path');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  try {
    const { images, modelIndex } = req.body;

    const modelPath = path.join(process.cwd(), `model${(modelIndex || 0) + 1}.jpg`);
    const modelBuffer = fs.readFileSync(modelPath);
    const modelBase64 = modelBuffer.toString('base64');

    const parts = [
      {
        text: "Virtual try-on: The first image is a person. The following images show a clothing item. Generate a realistic photo of the person wearing exactly that clothing item. Keep their face, pose, body, hair, and background identical. Only change the clothing."
      },
      { inline_data: { mime_type: 'image/jpeg', data: modelBase64 } }
    ];

    for (const img of images) {
      const match = img.match(/^data:([^;]+);base64,(.+)$/);
      if (match) {
        parts.push({ inline_data: { mime_type: match[1], data: match[2] } });
      }
    }

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-preview-image-generation:generateContent?key=${process.env.GOOGLE_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts }],
          generationConfig: { responseModalities: ['IMAGE', 'TEXT'] }
        })
      }
    );

    const geminiData = await geminiRes.json();

    if (geminiData.error) {
      return res.status(500).json({ error: `Gemini: ${geminiData.error.message}` });
    }

    const responseParts = geminiData.candidates?.[0]?.content?.parts || [];
    const imagePart = responseParts.find(p => p.inline_data);

    if (!imagePart) {
      const textPart = responseParts.find(p => p.text);
      return res.status(500).json({ error: textPart?.text || JSON.stringify(geminiData).slice(0, 200) });
    }

    const image = `data:${imagePart.inline_data.mime_type};base64,${imagePart.inline_data.data}`;
    res.status(200).json({ image });

  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
