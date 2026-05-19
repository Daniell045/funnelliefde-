const mollieClient = require('@mollie/api-client');
const { getStore } = require('@netlify/blobs');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method not allowed' };

  try {
    const { sessionId, plan, user } = JSON.parse(event.body);
    const mollie = mollieClient.default({ apiKey: process.env.MOLLIE_API_KEY });
    const siteUrl = process.env.SITE_URL || 'https://hechtingtest.nl';

    // ─── SUBSCRIPTION (premium €9,99/maand) ───────────────────────────────────
    if (plan === 'subscription') {
      // Stap 1: maak een eerste betaling aan met sequenceType 'first'
      // Mollie slaat daarna het mandaat op voor recurring
      const payment = await mollie.payments.create({
        amount: { currency: 'EUR', value: '9.99' },
        description: 'Hechtingtest Premium — eerste maand',
        sequenceType: 'first',
        redirectUrl: `${siteUrl}/success.html?session=${sessionId}&plan=subscription`,
        webhookUrl: `${siteUrl}/.netlify/functions/mollie-webhook`,
        metadata: { sessionId, plan: 'subscription', userEmail: user.email }
      });

      // Sessie opslaan
      const sessions = getStore('sessions');
      const sess = await sessions.get(sessionId, { type: 'json' });
      if (sess) {
        sess.paymentId = payment.id;
        sess.plan = 'subscription';
        sess.subscriptionEmail = user.email;
        await sessions.setJSON(sessionId, sess);
      }

      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ checkoutUrl: payment.getCheckoutUrl() })
      };
    }

    // ─── COUPLE (€9 eenmalig) ─────────────────────────────────────────────────
    let token = null;
    if (plan === 'couple') {
      token = Math.random().toString(36).slice(2, 10).toUpperCase();
      const couples = getStore('couples');
      await couples.setJSON(token, {
        token, mainSessionId: sessionId, partnerSessionId: null,
        plan, paid: false, reportSent: false, createdAt: Date.now()
      });
    }

    // ─── SOLO (€5) + COUPLE (€9) ──────────────────────────────────────────────
    const amount = plan === 'couple' ? '9.00' : '5.00';
    const description = plan === 'couple' ? 'Hechtingtest koppels-rapport' : 'Hechtingtest solo rapport';

    const payment = await mollie.payments.create({
      amount: { currency: 'EUR', value: amount },
      description,
      redirectUrl: `${siteUrl}/success.html?session=${sessionId}&plan=${plan}${token ? '&token=' + token : ''}`,
      webhookUrl: `${siteUrl}/.netlify/functions/mollie-webhook`,
      metadata: { sessionId, plan, userEmail: user.email, token }
    });

    // Sessie opslaan
    const sessions = getStore('sessions');
    const sess = await sessions.get(sessionId, { type: 'json' });
    if (sess) {
      sess.paymentId = payment.id;
      sess.plan = plan;
      sess.token = token;
      await sessions.setJSON(sessionId, sess);
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
