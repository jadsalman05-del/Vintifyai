const crypto = require('crypto');

function generateCode(plan) {
  const random = crypto.randomBytes(8).toString('hex').toUpperCase();
  const createdAt = Date.now();
  const expiry = createdAt + 30 * 24 * 60 * 60 * 1000; // 30 Tage
  return Buffer.from(`VFY:${plan}:${random}:${createdAt}:${expiry}`).toString('base64');
}

module.exports = async function handler(req, res) {
  const sessionId = req.query.session;
  if (!sessionId) return res.redirect('/');

  try {
    // Verify session with Stripe
    const r = await fetch(`https://api.stripe.com/v1/checkout/sessions/${sessionId}`, {
      headers: {
        'Authorization': `Bearer ${process.env.STRIPE_SECRET_KEY}`,
      },
    });
    const session = await r.json();

    if (session.error || session.payment_status !== 'paid') {
      return res.redirect('/?activate=error');
    }

    // Determine plan by amount (499 cents = Starter, 999 = Premium)
    const plan = session.amount_total >= 999 ? 'premium' : 'starter';
    const code = generateCode(plan);

    // Notify Discord (optional, no crash if missing)
    try {
      const WEBHOOK = process.env.DISCORD_WEBHOOK;
      if (WEBHOOK) {
        await fetch(WEBHOOK, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            embeds: [{
              title: `💰 New Purchase – ${plan.toUpperCase()}`,
              color: plan === 'premium' ? 0x9d4edd : 0x00c2cb,
              fields: [
                { name: '📧 Customer', value: session.customer_details?.email || '–', inline: true },
                { name: '📦 Plan',     value: plan,  inline: true },
              ],
              timestamp: new Date().toISOString(),
            }],
          }),
        });
      }
    } catch (_) {}

    // Redirect back to app with code in URL — app will auto-activate
    res.redirect(`/?activate=${encodeURIComponent(code)}`);
  } catch (e) {
    res.redirect('/?activate=error');
  }
};
