const mollieClient = require('@mollie/api-client');
const Anthropic = require('@anthropic-ai/sdk');
const { Resend } = require('resend');
const { getStore } = require('@netlify/blobs');
const { buildSoloPrompt, buildCouplePrompt, emailWrapper } = require('./_lib/helpers');

exports.handler = async (event) => {
  try {
    // Mollie stuurt paymentId als form-encoded body OF query param
    let paymentId = event.queryStringParameters?.id;
    if (!paymentId && event.body) {
      const params = new URLSearchParams(event.body);
      paymentId = params.get('id');
    }
    if (!paymentId) return { statusCode: 400, body: 'No payment ID' };

    const mollie = mollieClient.default({ apiKey: process.env.MOLLIE_API_KEY });
    const payment = await mollie.payments.get(paymentId);

    if (payment.status !== 'paid') {
      return { statusCode: 200, body: 'Status: ' + payment.status };
    }

    const { sessionId, plan } = payment.metadata;

    // ─── SUBSCRIPTION: eerste betaling (sequenceType = 'first') ───────────────
    if (plan === 'subscription') {
      const sessions = getStore('sessions');
      const sess = await sessions.get(sessionId, { type: 'json' });
      if (!sess) return { statusCode: 404, body: 'Session not found' };

      // Idempotency
      if (sess.subscriptionActive) {
        return { statusCode: 200, body: 'Subscription already active' };
      }

      sess.paid = true;
      sess.subscriptionActive = true;
      sess.plan = 'subscription';

      // Mollie klant aanmaken (vereist voor recurring)
      let customerId = sess.mollieCustomerId;
      if (!customerId) {
        const customer = await mollie.customers.create({
          name: sess.user?.name || sess.subscriptionEmail,
          email: sess.user?.email || sess.subscriptionEmail
        });
        customerId = customer.id;
        sess.mollieCustomerId = customerId;

        // Sla customer → session lookup op (nodig voor recurring webhooks)
        const customerIndex = getStore('customer-index');
        await customerIndex.set(customerId, sessionId);
      }

      // Mandaat koppelen aan klant via betaling
      // (Mollie doet dit automatisch als je customerId meegeeft bij 'first' payment,
      //  maar we kunnen het ook ophalen via payment.mandateId)
      if (payment.mandateId) {
        sess.mollieManateId = payment.mandateId;
      }

      // Recurring subscription aanmaken in Mollie
      // Dit zorgt voor automatische incasso elke maand
      const subscription = await mollie.customerSubscriptions.create({
        customerId,
        amount: { currency: 'EUR', value: '9.99' },
        interval: '1 month',
        description: 'Hechtingtest Premium',
        webhookUrl: `${process.env.SITE_URL}/.netlify/functions/mollie-webhook`,
        metadata: { sessionId, plan: 'subscription_recurring' }
      });

      sess.mollieSubscriptionId = subscription.id;
      await sessions.setJSON(sessionId, sess);

      // Eerste rapport genereren + mailen
      const html = await generateSoloReport(sess);
      await sendMail(
        sess.user?.email || sess.subscriptionEmail,
        `Welkom bij Hechtingtest Premium — jouw eerste rapport`,
        emailWrapper(`Welkom ${sess.user?.name || ''}!`, `
          <p style="color: #5C4A32; font-size: 1.05rem; margin-bottom: 1.5rem;">
            Bedankt voor jouw Premium abonnement. Hieronder vind je jouw persoonlijke hechtingsrapport.
            Elke maand ontvang je nieuwe inzichten en oefeningen.
          </p>
          ${html}
          <hr style="margin: 2rem 0; border: none; border-top: 1px solid #EBE3D4;">
          <p style="color: #8C7B6B; font-size: 0.9rem;">
            Je kunt jouw dashboard bekijken op 
            <a href="${process.env.SITE_URL}/dashboard.html" style="color: #C97B5F;">hechtingtest.nl/dashboard</a>.
            Je abonnement verlengt automatisch elke maand voor €9,99.
          </p>
        `)
      );

      sess.reportSent = true;
      await sessions.setJSON(sessionId, sess);

      return { statusCode: 200, body: 'Subscription activated + report sent' };
    }

    // ─── SUBSCRIPTION: herhalende betaling (subscription_recurring) ───────────
    if (plan === 'subscription_recurring') {
      // Mollie stuurt bij recurring geen sessionId mee via payment.metadata
      // maar wel via de subscription metadata — we zoeken op customerId
      const customerId = payment.customerId;
      if (!customerId) return { statusCode: 200, body: 'No customerId on recurring payment' };

      // Zoek sessie op via customerId (we slaan mollieCustomerId op in sessie)
      // Netlify Blobs heeft geen query, dus we slaan een aparte lookup op
      const customerIndex = getStore('customer-index');
      const sessionIdForCustomer = await customerIndex.get(customerId);

      if (!sessionIdForCustomer) {
        console.warn('No session found for customerId:', customerId);
        return { statusCode: 200, body: 'Customer not found in index' };
      }

      const sessions = getStore('sessions');
      const sess = await sessions.get(sessionIdForCustomer, { type: 'json' });
      if (!sess) return { statusCode: 200, body: 'Session not found' };

      // Maandelijkse content mail sturen
      await sendMail(
        sess.user?.email || sess.subscriptionEmail,
        `Jouw maandelijkse hechtings-inzichten`,
        emailWrapper(`Hallo ${sess.user?.name || ''}!`, `
          <p style="color: #5C4A32; font-size: 1.05rem;">
            Een nieuwe maand, nieuwe inzichten voor jouw hechtingsstijl: <strong>${sess.style?.title || ''}</strong>.
          </p>
          <p style="color: #5C4A32;">
            Bekijk jouw persoonlijke dashboard voor nieuwe oefeningen en reflecties.
          </p>
          <a href="${process.env.SITE_URL}/dashboard.html" 
             style="display: inline-block; margin-top: 1rem; padding: 0.75rem 1.5rem; 
                    background: #C97B5F; color: white; text-decoration: none; border-radius: 8px;">
            Open jouw dashboard
          </a>
        `)
      );

      return { statusCode: 200, body: 'Monthly renewal mail sent' };
    }

    // ─── SOLO (€5 eenmalig) ───────────────────────────────────────────────────
    const sessions = getStore('sessions');
    const sess = await sessions.get(sessionId, { type: 'json' });
    if (!sess) return { statusCode: 404, body: 'Session not found' };

    if (sess.reportSent && plan === 'solo') {
      return { statusCode: 200, body: 'Already sent' };
    }

    sess.paid = true;
    await sessions.setJSON(sessionId, sess);

    if (plan === 'solo') {
      const html = await generateSoloReport(sess);
      await sendMail(
        sess.user.email,
        `Jouw hechtingsrapport — ${sess.style?.title || ''}`,
        emailWrapper(`Hallo ${sess.user.name}`, html)
      );
      sess.reportSent = true;
      await sessions.setJSON(sessionId, sess);
      return { statusCode: 200, body: 'Solo report sent' };
    }

    // ─── COUPLE (€9 eenmalig) ─────────────────────────────────────────────────
    const { token } = payment.metadata;
    if (plan === 'couple' && token) {
      const couples = getStore('couples');
      const couple = await couples.get(token, { type: 'json' });
      if (couple) {
        couple.paid = true;
        await couples.setJSON(token, couple);

        if (couple.partnerSessionId && !couple.reportSent) {
          await generateAndSendCouple(token);
        }
      }
      return { statusCode: 200, body: 'Couple payment recorded' };
    }

    return { statusCode: 200, body: 'OK' };
  } catch (err) {
    console.error('webhook err:', err);
    return { statusCode: 500, body: err.message };
  }
};

// ─── HELPERS ──────────────────────────────────────────────────────────────────

async function generateSoloReport(sess) {
  const anthropic = new Anthropic.default({ apiKey: process.env.ANTHROPIC_API_KEY });
  const prompt = buildSoloPrompt({
    user: sess.user, styleKey: sess.styleKey, scores: sess.scores,
    normalized: sess.normalized, answers: sess.answers
  });
  const resp = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4000,
    messages: [{ role: 'user', content: prompt }]
  });
  return resp.content[0].text;
}

async function generateAndSendCouple(token) {
  const couples = getStore('couples');
  const sessions = getStore('sessions');
  const couple = await couples.get(token, { type: 'json' });
  if (!couple || couple.reportSent) return;

  const main = await sessions.get(couple.mainSessionId, { type: 'json' });
  const partner = await sessions.get(couple.partnerSessionId, { type: 'json' });
  if (!main || !partner) return;

  const anthropic = new Anthropic.default({ apiKey: process.env.ANTHROPIC_API_KEY });

  const mainPrompt = buildSoloPrompt({
    user: main.user, styleKey: main.styleKey, scores: main.scores,
    normalized: main.normalized, answers: main.answers
  });
  const partnerPrompt = buildSoloPrompt({
    user: partner.user, styleKey: partner.styleKey, scores: partner.scores,
    normalized: partner.normalized, answers: partner.answers
  });
  const couplePrompt = buildCouplePrompt({
    p1: { user: main.user, styleKey: main.styleKey, normalized: main.normalized, answers: main.answers },
    p2: { user: partner.user, styleKey: partner.styleKey, normalized: partner.normalized, answers: partner.answers }
  });

  const [mainReport, partnerReport, coupleReport] = await Promise.all([
    anthropic.messages.create({ model: 'claude-sonnet-4-20250514', max_tokens: 4000, messages: [{ role: 'user', content: mainPrompt }] }),
    anthropic.messages.create({ model: 'claude-sonnet-4-20250514', max_tokens: 4000, messages: [{ role: 'user', content: partnerPrompt }] }),
    anthropic.messages.create({ model: 'claude-sonnet-4-20250514', max_tokens: 5000, messages: [{ role: 'user', content: couplePrompt }] })
  ]);

  const mainHtml = mainReport.content[0].text;
  const partnerHtml = partnerReport.content[0].text;
  const coupleHtml = coupleReport.content[0].text;

  await sendMail(main.user.email, `Jullie hechtings-rapport — ${main.user.name} & ${partner.user.name}`,
    emailWrapper('Jullie samen', `
      <h2 style="color: #C97B5F;">Jullie koppels-analyse</h2>${coupleHtml}
      <hr style="margin: 2rem 0; border: none; border-top: 1px solid #EBE3D4;">
      <h2 style="color: #2D4A3E;">Jouw individuele rapport (${main.user.name})</h2>${mainHtml}
      <hr style="margin: 2rem 0; border: none; border-top: 1px solid #EBE3D4;">
      <h2 style="color: #2D4A3E;">${partner.user.name}'s individuele rapport</h2>${partnerHtml}
    `));

  await sendMail(partner.user.email, `Jullie hechtings-rapport — ${main.user.name} & ${partner.user.name}`,
    emailWrapper('Jullie samen', `
      <h2 style="color: #C97B5F;">Jullie koppels-analyse</h2>${coupleHtml}
      <hr style="margin: 2rem 0; border: none; border-top: 1px solid #EBE3D4;">
      <h2 style="color: #2D4A3E;">Jouw individuele rapport (${partner.user.name})</h2>${partnerHtml}
      <hr style="margin: 2rem 0; border: none; border-top: 1px solid #EBE3D4;">
      <h2 style="color: #2D4A3E;">${main.user.name}'s individuele rapport</h2>${mainHtml}
    `));

  couple.reportSent = true;
  await couples.setJSON(token, couple);
}

async function sendMail(to, subject, html) {
  const resend = new Resend(process.env.RESEND_API_KEY);
  return resend.emails.send({
    from: 'Hechtingtest <hello@hechtingtest.nl>',
    to, subject, html
  });
}

module.exports.generateAndSendCouple = generateAndSendCouple;
