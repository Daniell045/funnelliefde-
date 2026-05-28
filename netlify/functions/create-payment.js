const mollieClient = require('@mollie/api-client');
const { dbGet, dbSet } = require('./_lib/storage');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method not allowed' };

  try {
    const { sessionId, plan, user } = JSON.parse(event.body);
    const mollie = mollieClient.default({ apiKey: process.env.MOLLIE_API_KEY });
    const siteUrl = process.env.SITE_URL || 'https://hechtingstest.nl';

    // Naam en email meesturen in redirect URL
    const naamParam = encodeURIComponent(user.name || '');
    const emailParam = encodeURIComponent(user.email || '');

    // ─── SUBSCRIPTION ────────────────────────────────────────────────
    if (plan === 'subscription') {
      const payment = await mollie.payments.create({
        amount: { currency: 'EUR', value: '9.99' },
        description: 'Hechtingtest Premium — eerste maand',
        sequenceType: 'first',
        redirectUrl: `${siteUrl}/bedankt.html?session=${sessionId}&plan=subscription&naam=${naamParam}&email=${emailParam}`,
        webhookUrl: `${siteUrl}/.netlify/functions/mollie-webhook`,
        metadata: { sessionId, plan: 'subscription', userEmail: user.email }
      });
      const sess = await dbGet(`sessions/${sessionId}`);
      if (sess) {
        await dbSet(`sessions/${sessionId}`, { ...sess, paymentId: payment.id, plan: 'subscription', subscriptionEmail: user.email });
      }
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ checkoutUrl: payment.getCheckoutUrl() })
      };
    }

    // ─── COUPLE ──────────────────────────────────────────────────────
    let token = null;
    if (plan === 'couple') {
      token = Math.random().toString(36).slice(2, 10).toUpperCase();
      await dbSet(`couples/${token}`, {
        token, mainSessionId: sessionId, partnerSessionId: null,
        plan, paid: false, reportSent: false, createdAt: Date.now()
      });
    }

    // ─── SOLO + COUPLE ───────────────────────────────────────────────
    const amount = plan === 'couple' ? '9.00' : '5.00';
    const description = plan === 'couple' ? 'Hechtingtest koppels-rapport' : 'Hechtingtest solo rapport';

    // Haal stijl op uit sessie voor in de URL
    const sess = await dbGet(`sessions/${sessionId}`);
    const stijlParam = encodeURIComponent(sess?.style?.name || '');

    const payment = await mollie.payments.create({
      amount: { currency: 'EUR', value: amount },
      description,
      redirectUrl: `${siteUrl}/bedankt.html?session=${sessionId}&plan=${plan}&naam=${naamParam}&email=${emailParam}&stijl=${stijlParam}${token ? '&token=' + token : ''}`,
      webhookUrl: `${siteUrl}/.netlify/functions/mollie-webhook`,
      metadata: { sessionId, plan, userEmail: user.email, token }
    });

    if (sess) {
      await dbSet(`sessions/${sessionId}`, { ...sess, paymentId: payment.id, plan, token });
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ checkoutUrl: payment.getCheckoutUrl(), token })
    };

  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
