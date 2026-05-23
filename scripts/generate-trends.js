// VintifyAI – Weekly Trend Generator
// Wird von GitHub Actions jeden Montag aufgerufen.
// Benötigt: ANTHROPIC_API_KEY als GitHub Secret gesetzt.

const fs = require('fs');
const path = require('path');

const OUTPUT_FILE = path.join(__dirname, '..', 'api', 'market-data.json');

async function generateTrends() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('❌ ANTHROPIC_API_KEY nicht gesetzt!');
    process.exit(1);
  }

  const now = new Date();
  const month = now.toLocaleString('de-DE', { month: 'long' });
  const year = now.getFullYear();

  const prompt = `Du bist ein Vinted-Marktexperte (DE/AT) mit Echtzeit-Gespür für Trends. Heute: ${month} ${year}.

Erstelle GENAU 5 HOT + 5 NEXT Einträge für den Vinted-Markt.

⚠️ WICHTIGSTE REGEL: Sei KREATIV und AKTUELL. Denke NICHT an fixe Markenlisten – denke daran, was Menschen GERADE JETZT auf Vinted suchen und kaufen.

Berücksichtige diese Einflussfaktoren:
1. AKTUELLE EVENTS & SPORTS: Gibt es gerade eine WM, EM, Olympia, Champions League? → Trikots, Fußball-Retro, Teamjacken könnten HOT sein
2. MUSIK & KULTUR: Welche Artists sind gerade relevant? Welche Aesthetics sind auf TikTok/Instagram viral?
3. JAHRESZEIT: ${month} → Was zieht man gerade an? Was kauft man für die nächste Saison?
4. SOCIAL MEDIA TRENDS: Welche Styles (Y2K, Gorpcore, Old Money, Prep, Workwear) sind aktuell?
5. VINTED-SPEZIFISCH: Was hat kurze Standzeiten in DE/AT? Was wird schnell weggekauft?

Mögliche Marken (NUR als Inspiration – wähle die AKTUELL PASSENDSTEN, nicht immer dieselben):
Vintage Sport: Fred Perry, Lacoste, Sergio Tacchini, Le Coq Sportif, Kappa, Umbro, Fila, Ellesse, Diadora
Premium: Stone Island, CP Company, Paul & Shark, Belstaff, Barbour
Streetwear: Carhartt WIP, Stüssy, Nike Vintage, Adidas Originals, New Balance, FILA
Americana: Ralph Lauren, Tommy Hilfiger, Levi's Vintage, Wrangler, Lee, Dickies
Football: Verschiedene Nationalteams, Bundesliga-Retro, Champions League Vintage-Trikots
Emerging: Napapijri, Berghaus, Columbia Vintage, Timberland, Nautica, Polo Sport

HOT = jetzt sofort gefragt, wird in Stunden verkauft
NEXT = kaufe jetzt günstig, in 2-4 Wochen steigt Nachfrage

Antworte NUR mit diesem JSON (kein weiterer Text):
{
  "hot":[{"brand":"Marke","title":"Artikeltyp","tip":"Konkreter Tipp max 7 Wörter"}],
  "next":[{"brand":"Marke","title":"Artikeltyp","tip":"Konkreter Tipp max 7 Wörter"}]
}`;

  console.log(`🤖 Generiere Trends für ${month} ${year}...`);

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }]
    })
  });

  if (!response.ok) {
    const err = await response.text();
    console.error('❌ Anthropic API Error:', err);
    process.exit(1);
  }

  const data = await response.json();
  const rawText = data.content[0].text.trim();

  // JSON aus der Antwort extrahieren
  const jsonMatch = rawText.match(/\{[\s\S]+\}/);
  if (!jsonMatch) {
    console.error('❌ Kein JSON in Antwort gefunden:', rawText);
    process.exit(1);
  }

  const parsed = JSON.parse(jsonMatch[0]);

  if (!parsed.hot || !parsed.next) {
    console.error('❌ JSON hat kein hot/next:', parsed);
    process.exit(1);
  }

  const today = new Date().toISOString().split('T')[0];

  const output = {
    updatedAt: today,
    hot:  parsed.hot.map((x, i)  => ({ ...x, id: 'h' + (i + 1) })),
    next: parsed.next.map((x, i) => ({ ...x, id: 'n' + (i + 1) }))
  };

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2), 'utf8');
  console.log(`✅ Trend-Daten gespeichert: ${OUTPUT_FILE}`);
  console.log(`📊 HOT: ${output.hot.length} Einträge, NEXT: ${output.next.length} Einträge`);
  output.hot.forEach(e  => console.log(`  🔥 ${e.brand} – ${e.title}`));
  output.next.forEach(e => console.log(`  📈 ${e.brand} – ${e.title}`));
}

generateTrends().catch(err => {
  console.error('❌ Fehler:', err.message);
  process.exit(1);
});
