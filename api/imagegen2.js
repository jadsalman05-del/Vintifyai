const { fal } = require('@fal-ai/client');

const BG_PROMPTS = {
  studio:    'pure white seamless studio background with soft subtle shadow below the garment',
  marmor:    'luxurious white marble floor and background with subtle veining',
  holz:      'warm natural oak wood planks floor with clean light background',
  lifestyle: 'minimal modern home setting, light wooden floor, white wall, soft natural daylight',
  verlauf:   'smooth gradient background from light lavender to deep purple, minimalist clean',
};

function base64ToBuffer(dataUri) {
  return Buffer.from(dataUri.replace(/^data:image\/[\w+]+;base64,/, ''), 'base64');
}

function getContentType(dataUri) {
  if (dataUri.startsWith('data:image/png')) return 'image/png';
  if (dataUri.startsWith('data:image/webp')) return 'image/webp';
  return 'image/jpeg';
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  fal.config({ credentials: process.env.FAL_API_KEY });

  try {
    const { modelBase64, garmentBase64, mode, background, category } = req.body;
    if (!garmentBase64) return res.status(400).json({ error: 'Kein Artikel-Foto hochgeladen' });

    if (mode === 'product') {
      // ── Produktfoto: Hintergrund entfernen + ersetzen ──
      const garmentBuffer = base64ToBuffer(garmentBase64);
      const garmentType = getContentType(garmentBase64);
      const garmentBlob = new Blob([garmentBuffer], { type: garmentType });
      const garmentUrl = await fal.storage.upload(garmentBlob);

      const bgPrompt = BG_PROMPTS[background] || BG_PROMPTS.studio;
      const result = await fal.run('fal-ai/bria/background/replace', {
        input: {
          image_url: garmentUrl,
          prompt: bgPrompt,
          refine_prompt: true,
        },
      });

      const out = result?.data || result;
      const imageUrl = out?.images?.[0]?.url || out?.image?.url;
      if (!imageUrl) return res.status(500).json({ error: 'Kein Bild: ' + JSON.stringify(result).slice(0, 300) });
      return res.status(200).json({ image: imageUrl });

    } else {
      // ── Virtual Try-On: FASHN v1.5 ──
      if (!modelBase64) return res.status(400).json({ error: 'Kein Personen-Foto hochgeladen' });

      const modelBuffer = base64ToBuffer(modelBase64);
      const modelType = getContentType(modelBase64);
      const garmentBuffer = base64ToBuffer(garmentBase64);
      const garmentType = getContentType(garmentBase64);

      // Upload both images to fal storage in parallel
      const [modelUrl, garmentUrl] = await Promise.all([
        fal.storage.upload(new Blob([modelBuffer], { type: modelType })),
        fal.storage.upload(new Blob([garmentBuffer], { type: garmentType })),
      ]);

      // Run FASHN try-on (polls internally, max 55s)
      const result = await fal.subscribe('fal-ai/fashn/tryon/v1.5', {
        input: {
          model_image: modelUrl,
          garment_image: garmentUrl,
          category: category || 'tops',
          mode: 'balanced',
        },
        pollInterval: 2000,
        timeout: 55000,
      });

      const out = result?.data || result;
      const imageUrl = out?.images?.[0]?.url || out?.image?.url || out?.output?.images?.[0]?.url;
      if (!imageUrl) return res.status(500).json({ error: 'Kein Bild: ' + JSON.stringify(result).slice(0, 300) });
      return res.status(200).json({ image: imageUrl });
    }

  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
