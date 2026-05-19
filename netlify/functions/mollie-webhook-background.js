const mollieClient = require('@mollie/api-client');
const Anthropic = require('@anthropic-ai/sdk');
const { Resend } = require('resend');
const { dbGet, dbUpdate } = require('./_lib/firebase-admin');
const { buildSoloPrompt, buildCouplePrompt, emailWrapper } = require('./_lib/helpers');

exports.handler = async (event) => {
  try {
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

    // ─── SUBSCRIPTION: eerste betaling ───────────────────────────────────────
    if (plan === 'subscription') {
      const sess = await dbGet(`sessions/${sessionId}`);
      if (!sess) return { statusCode: 404, body: 'Session not found' };

      // Idempotency check via de veilige statusvelden
      if (sess.subscriptionActive || sess.status === 'processing') {
        return { statusCode: 200, body: 'Subscription already active or processing' };
      }

      // Lock de sessie direct om dubbele triggers te blokkeren
      await dbUpdate(`sessions/${sessionId}`, { status: 'processing' });

      let customerId = sess.mollieCustomerId;
      if (!customerId) {
        const customer = await mollie.customers.create({
          name: sess.user?.name || sess.subscriptionEmail,
          email: sess.user?.email || sess.subscriptionEmail
        });
        customerId = customer.id;
        await dbUpdate(`customerIndex/${customerId}`, { sessionId: sessionId });
      }

      const subscription = await mollie.customerSubscriptions.create({
        customerId,
        amount: { currency: 'EUR', value: '9.99' },
        interval: '1 month',
        description: 'Hechtingtest Premium',
        webhookUrl: `${process.env.SITE_URL}/.netlify/functions/mollie-webhook-background`,
        metadata: { plan: 'subscription_recurring' }
      });

      // Update alle abonnementsgegevens in één gerichte update
      await dbUpdate(`sessions/${sessionId}`, {
        paid: true,
        subscriptionActive: true,
        plan: 'subscription',
        mollieCustomerId: customerId,
        mollieMandateId: payment.mandateId || null,
        mollieSubscriptionId: subscription.id,
        status: 'active'
      });

      // Eerste rapport genereren + mailen
      const updatedSess = await dbGet(`sessions/${sessionId}`);
      const html = await generateSoloReport(updatedSess);
      await sendMail(
        sess.user?.email || sess.subscriptionEmail,
        'Welkom bij Hechtingtest Premium — jouw eerste rapport',
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

      await dbUpdate(`sessions/${sessionId}`, { reportSent: true });
      return { statusCode: 200, body: 'Subscription activated + report sent' };
    }

    // ─── SUBSCRIPTION: herhalende betaling ───────────────────────────────────
    if (plan === 'subscription_recurring') {
      const customerId = payment.customerId;
      if (!customerId) return { statusCode: 200, body: 'No customerId on recurring payment' };

      const customerIdx = await dbGet(`customerIndex/${customerId}`);
      const sessionIdForCustomer = customerIdx?.sessionId || customerIdx; // Compatibiliteit met oude index data structuren
      
      if (!sessionIdForCustomer) {
        console.warn('No session found for customerId:', customerId);
        return { statusCode: 200, body: 'Customer not found in index' };
      }

      const sess = await dbGet(`sessions/${sessionIdForCustomer}`);
      if (!sess) return { statusCode: 200, body: 'Session not found' };

      await sendMail(
        sess.user?.email || sess.subscriptionEmail,
        'Jouw maandelijkse hechtings-inzichten',
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

    // ─── SOLO (€5 eenmalig) ──────────────────────────────────────────────────
    const sess = await dbGet(`sessions/${sessionId}`);
    if (!sess) return { statusCode: 404, body: 'Session not found' };

    if ((sess.reportSent || sess.status === 'processing') && plan === 'solo') {
      return { statusCode: 200, body: 'Already sent or processing' };
    }

    await dbUpdate(`sessions/${sessionId}`, { paid: true, status: 'processing' });

    if (plan === 'solo') {
      const html = await generateSoloReport(sess);
      await sendMail(
        sess.user.email,
        `Jouw hechtingsrapport — ${sess.style?.title || ''}`,
        emailWrapper(`Hallo ${sess.user.name}`, html)
      );
      await dbUpdate(`sessions/${sessionId}`, { reportSent: true, status: 'completed' });
      return { statusCode: 200, body: 'Solo report sent' };
    }

    // ─── COUPLE (€9 eenmalig) ────────────────────────────────────────────────
    const { token } = payment.metadata;
    if (plan === 'couple' && token) {
      const couple = await dbGet(`couples/${token}`);
      if (couple) {
        if (couple.status === 'processing') {
          return { statusCode: 200, body: 'Couple payment processing elsewhere' };
        }
        await dbUpdate(`couples/${token}`, { paid: true });

        if (couple.partnerSessionId && !couple.reportSent) {
          await dbUpdate(`couples/${token}`, { status: 'processing' });
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

async function generateSoloReport(sess) {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
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
  const couple = await dbGet(`couples/${token}`);
  if (!couple || couple.reportSent) return;

  const main = await dbGet(`sessions/${couple.mainSessionId}`);
  const partner = await dbGet(`sessions/${couple.partnerSessionId}`);
  if (!main || !partner) return;

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const [mainReport, partnerReport, coupleReport] = await Promise.all([
    anthropic.messages.create({
      model: 'Claude-sonnet-4-20250514', max_tokens: 4000,
      messages: [{ role: 'user', content: buildSoloPrompt({ user: main.user, styleKey: main.styleKey, scores: main.scores, normalized: main.normalized, answers: main.answers }) }]
    }),
    anthropic.messages.create({
      model: 'Claude-sonnet-4-20250514', max_tokens: 4000,
      messages: [{ role: 'user', content: buildSoloPrompt({ user: partner.user, styleKey: partner.styleKey, scores: partner.scores, normalized: partner.normalized, answers: partner.answers }) }]
    }),
    anthropic.messages.create({
      model: 'Claude-sonnet-4-20250514', max_tokens: 5000,
      messages: [{ role: 'user', content: buildCouplePrompt({
        p1: { user: main.user, styleKey: main.styleKey, normalized: main.normalized, answers: main.answers },
        p2: { user: partner.user, styleKey: partner.styleKey, normalized: partner.normalized, answers: partner.answers }
      }) }]
    })
  ]);

  const mainHtml = mainReport.content[0].text;
  const partnerHtml = partnerReport.content[0].text;
  const coupleHtml = coupleReport.content[0].text;

  await Promise.all([
    sendMail(
      main.user.email,
      `Jullie hechtings-rapport — ${main.user.name} & ${partner.user.name}`,
      emailWrapper('Jullie samen', `
        <h2 style="color: #C97B5F;">Jullie koppels-analyse</h2>${coupleHtml}
        <hr style="margin: 2rem 0; border: none; border-top: 1px solid #EBE3D4;">
        <h2 style="color: #2D4A3E;">Jouw individuele rapport (${main.user.name})</h2>${mainHtml}
        <hr style="margin: 2rem 0; border: none; border-top: 1px solid #EBE3D4;">
        <h2 style="color: #2D4A3E;">${partner.user.name}'s individuele rapport</h2>${partnerHtml}
      `)
    ),
    sendMail(
      partner.user.email,
      `Jullie hechtings-rapport — ${main.user.name} & ${partner.user.name}`,
      emailWrapper('Jullie samen', `
        <h2 style="color: #C97B5F;">Jullie koppels-analyse</h2>${coupleHtml}
        <hr style="margin: 2rem 0; border: none; border-top: 1px solid #EBE3D4;">
        <h2 style="color: #2D4A3E;">Jouw individuele rapport (${partner.user.name})</h2>${partnerHtml}
        <hr style="margin: 2rem 0; border: none; border-top: 1px solid #EBE3D4;">
        <h2 style="color: #2D4A3E;">${main.user.name}'s individuele rapport</h2>${mainHtml}
      `)
    )
  ]);

  await dbUpdate(`couples/${token}`, { reportSent: true, status: 'completed' });
}

async function sendMail(to, subject, html) {
  const resend = new Resend(process.env.RESEND_API_KEY);
  return resend.emails.send({
    from: 'Hechtingtest <hello@hechtingtest.nl>',
    to, subject, html
  });
}

module.exports.generateAndSendCouple = generateAndSendCouple;
