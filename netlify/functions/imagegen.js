exports.handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: 'Method Not Allowed' };

  const MODELS = [
    "a young blonde woman with long straight hair, slim figure, casual feminine aesthetic",
    "a young athletic muscular man, dark features, fitness model look, casual streetwear",
    "a slim young man with brown hair, casual everyday style",
    "a young woman with long straight black hair, slim elegant figure, modern stylish look",
    "a man with gold rings and watch, streetwear urban style, confident street pose"
  ];

  const CLOTHING_TYPES = [
    "upper body clothing item",
    "lower body clothing item",
    "full outfit",
    "jacket or outerwear",
    "dress or skirt"
  ];

  try {
    const { images, modelIndex, clothingType } = JSON.parse(event.body);
    const modelDesc = MODELS[modelIndex] || MODELS[0];

    // Analyze clothing with Gemini (fast, just text)
    const visionParts = [];
    for (const img of images) {
      const match = img.match(/^data:([^;]+);base64,(.+)$/);
      if (match) {
        visionParts.push({ inline_data: { mime_type: match[1], data: match[2] } });
      }
    }
    visionParts.push({
      text: "In one sentence, describe this clothing item: color, brand/logo if visible, type, and key design details. Be concise."
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

    const prompt = `Fashion photo: ${modelDesc}, wearing ${clothingDesc}. Full body, white background, professional lighting.`;

    const dalleRes = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'gpt-image-1',
        prompt,
        n: 1,
        size: '1024x1024',
        quality: 'medium'
      })
    });

    const dalleData = await dalleRes.json();

    if (dalleData.error) {
      return { statusCode: 500, headers, body: JSON.stringify({ error: dalleData.error.message }) };
    }

    const b64 = dalleData.data?.[0]?.b64_json;
    const url = dalleData.data?.[0]?.url;
    const image = b64 ? `data:image/png;base64,${b64}` : url;

    if (!image) {
      return { statusCode: 500, headers, body: JSON.stringify({ error: 'Kein Bild generiert' }) };
    }

    return { statusCode: 200, headers, body: JSON.stringify({ image }) };

  } catch (e) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
  }
};
