const crypto = require('crypto');

// Generates a VFY activation code in the same format the app expects
function generateCode(plan) {
  const random = crypto.randomBytes(8).toString('hex').toUpperCase();
  const raw = `VFY:${plan}:${random}`;
  return Buffer.from(raw).toString('base64');
}

// Send email via Resend
async function sendEmail(to, plan, code) {
  const planLabel = plan === 'premium' ? 'Premium (200 Scans)' : 'Starter (100 Scans)';
  const emoji    = plan === 'premium' ? '👑' : '🚀';

  const html = `
    <div style="font-family:Inter,sans-serif;background:#04040d;color:#fff;padding:40px;max-width:520px;margin:0 auto;border-radius:16px">
      <div style="text-align:center;margin-bottom:32px">
        <div style="width:52px;height:52px;background:linear-gradient(135deg,#9d4edd,#00c2cb);border-radius:12px;display:inline-flex;align-items:center;justify-content:center;font-size:22px;margin-bottom:12px">${emoji}</div>
        <h1 style="font-size:1.6rem;font-weight:900;letter-spacing:-.5px;margin:0">VintifyAI</h1>
        <p style="color:rgba(255,255,255,.5);font-size:.85rem;margin-top:4px">Your AI Reselling Toolkit</p>
      </div>

      <h2 style="font-size:1.2rem;font-weight:800;margin-bottom:8px">${emoji} ${planLabel} activated!</h2>
      <p style="color:rgba(255,255,255,.6);font-size:.88rem;line-height:1.6;margin-bottom:24px">
        Thank you for your purchase! Copy the code below and enter it in the app under <strong>Pricing → Activate Code</strong>.
      </p>

      <div style="background:rgba(157,78,221,.12);border:1px solid rgba(157,78,221,.3);border-radius:12px;padding:20px;text-align:center;margin-bottom:28px">
        <div style="font-size:.7rem;font-weight:700;color:rgba(255,255,255,.4);letter-spacing:.1em;margin-bottom:8px">YOUR ACTIVATION CODE</div>
        <div style="font-family:monospace;font-size:1rem;font-weight:800;letter-spacing:.05em;color:#c77dff;word-break:break-all">${code}</div>
      </div>

      <div style="background:rgba(255,255,255,.04);border-radius:10px;padding:16px;font-size:.82rem;color:rgba(255,255,255,.5);line-height:1.8">
        <strong style="color:#fff">How to activate:</strong><br>
        1. Open <a href="https://vintifyai.com" style="color:#c77dff">vintifyai.com</a><br>
        2. Go to <strong>Pricing</strong> in the sidebar<br>
        3. Click <strong>"Activate ${plan === 'premium' ? 'Premium' : 'Starter'} Code"</strong><br>
        4. Paste the code above → done!
      </div>

      <p style="text-align:center;font-size:.75rem;color:rgba(255,255,255,.25);margin-top:28px">
        Questions? Contact us via Discord or at vintifyai.com
      </p>
    </div>
  `;

  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'VintifyAI <noreply@vintifyai.com>',
      to,
      subject: `${emoji} Your VintifyAI ${planLabel} activation code`,
      html,
    }),
  });
}

// Notify admin Discord
async function notifyDiscord(plan, email, code) {
  const WEBHOOK = process.env.DISCORD_WEBHOOK;
  if (!WEBHOOK) return;
  await fetch(WEBHOOK, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      embeds: [{
        title: `💰 New Purchase – ${plan.toUpperCase()}`,
        color: plan === 'premium' ? 0x9d4edd : 0x00c2cb,
        fields: [
          { name: '📧 Customer', value: email, inline: true },
          { name: '📦 Plan',     value: plan,  inline: true },
          { name: '🔑 Code sent', value: '✅ Email delivered', inline: true },
        ],
        footer: { text: 'VintifyAI – Stripe Webhook' },
        timestamp: new Date().toISOString(),
      }],
    }),
  });
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  // Verify Stripe signature
  const sig    = req.headers['stripe-signature'];
  const secret = process.env.STRIPE_WEBHOOK_SECRET;

  let rawBody = '';
  await new Promise((resolve, reject) => {
    req.on('data', chunk => rawBody += chunk);
    req.on('end', resolve);
    req.on('error', reject);
  });

  // Compute expected signature
  const timestamp = sig.split(',').find(p => p.startsWith('t=')).slice(2);
  const expected  = crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.${rawBody}`)
    .digest('hex');
  const received  = sig.split(',').find(p => p.startsWith('v1=')).slice(3);

  if (!crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(received))) {
    return res.status(400).send('Invalid signature');
  }

  const event = JSON.parse(rawBody);

  if (event.type === 'checkout.session.completed') {
    const session     = event.data.object;
    const email       = session.customer_details?.email;
    const amountTotal = session.amount_total; // in cents

    // Determine plan by price (499 = Starter, 999 = Premium)
    let plan = 'starter';
    if (amountTotal >= 999) plan = 'premium';

    // Generate code + send
    const code = generateCode(plan);
    if (email) {
      await sendEmail(email, plan, code);
      await notifyDiscord(plan, email, code);
    }
  }

  res.status(200).json({ received: true });
};
