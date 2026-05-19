// netlify/functions/process-payment-bg.js
//
// Background worker: doet het zware werk (Claude rapport genereren +
// Resend mail sturen) na een betaling. Wordt async getriggerd door
// de mollie-webhook met paymentId.
//
// Let op de filename: "-bg" suffix is OPTIONEEL, maar als je hem ".background.js"
// noemt of via netlify.toml als background function configureert, krijg
// je 15 min runtime ipv 10 sec. Standaard sync function is 10 sec — te
// kort voor een couple rapport (3x Claude calls).
//
// → Zie netlify.toml: deze function heeft timeout = 900 (15 min).

const mollieClient = require('@mollie/api-client');
const Anthropic = require('@anthropic-ai/sdk');
const { Resend } = require('resend');
const { dbGet, dbSet } = require('./_lib/storage');
const { buildSoloPrompt, buildCouplePrompt, emailWrapper } = require('./_lib/helpers');

exports.handler = async (event) => {
  // Simpele secret check zodat niemand anders dit endpoint kan triggeren
  const secret = event.headers['x-internal-secret'];
  if (secret !== (process.env.INTERNAL_SECRET || 'dev')) {
    return { statusCode: 401, body: 'Unauthorized' };
  }

  let paymentId;
  try {
    ({ paymentId } = JSON.parse(event.body));
  } catch {
    return { statusCode: 400, body: 'Bad body' };
  }
  if (!paymentId) return { statusCode: 400, body: 'No paymentId' };

  try {
    const mollie = mollieClient.default({ apiKey: process.env.MOLLIE_API_KEY });
    const payment = await mollie.payments.get(paymentId);
    if (payment.status !== 'paid') {
      console.log(`[bg] ${paymentId} not paid, skip`);
      return { statusCode: 200, body: 'Not paid' };
    }

    const { sessionId, plan, token } = payment.metadata;
    console.log(`[bg] processing ${paymentId} plan=${plan} session=${sessionId}`);

    // ─── SUBSCRIPTION: eerste betaling ───────────────────────────────
    if (plan === 'subscription') {
      await handleSubscriptionFirst({ mollie, payment, sessionId });
      return { statusCode: 200, body: 'Subscription done' };
    }

    // ─── SUBSCRIPTION: herhalende betaling ───────────────────────────
    if (plan === 'subscription_recurring') {
      await handleSubscriptionRecurring({ payment });
      return { statusCode: 200, body: 'Recurring done' };
    }

    // ─── SOLO (€5) ───────────────────────────────────────────────────
    if (plan === 'solo') {
      await handleSolo({ sessionId });
      return { statusCode: 200, body: 'Solo done' };
    }

    // ─── COUPLE (€9) ─────────────────────────────────────────────────
    if (plan === 'couple') {
      await handleCouple({ sessionId, token });
      return { statusCode: 200, body: 'Couple recorded' };
    }

    return { statusCode: 200, body: 'Unknown plan: ' + plan };

  } catch (err) {
    console.error(`[bg] ${paymentId} failed:`, err);
    // Geen retry-trigger; we hebben de paymentId al gemarkeerd als
    // processed. Bij echte failures moet je dit handmatig oppakken.
    return { statusCode: 500, body: err.message };
  }
};

// ─── HANDLERS ────────────────────────────────────────────────────────

async function handleSolo({ sessionId }) {
  const sess = await dbGet(`sessions/${sessionId}`);
  if (!sess) throw new Error(`Session ${sessionId} not found`);
  if (sess.reportSent) {
    console.log(`[bg] solo ${sessionId} already sent, skip`);
    return;
  }

  await dbSet(`sessions/${sessionId}`, { ...sess, paid: true });

  const html = await generateSoloReport(sess);
  await sendMail(
    sess.user.email,
    `Jouw hechtingsrapport — ${sess.style?.title || ''}`,
    emailWrapper(`Hallo ${sess.user.name}`, html)
  );

  await dbSet(`sessions/${sessionId}`, { ...sess, paid: true, reportSent: true });
}

async function handleCouple({ sessionId, token }) {
  const couple = await dbGet(`couples/${token}`);
  if (!couple) throw new Error(`Couple ${token} not found`);

  await dbSet(`couples/${token}`, { ...couple, paid: true });

  // Alleen rapport sturen als partner ook klaar is
  if (couple.partnerSessionId && !couple.reportSent) {
    await generateAndSendCouple(token);
  } else {
    console.log(`[bg] couple ${token} paid maar partner nog niet klaar, wacht`);
  }
}

async function handleSubscriptionFirst({ mollie, payment, sessionId }) {
  const sess = await dbGet(`sessions/${sessionId}`);
  if (!sess) throw new Error(`Session ${sessionId} not found`);
  if (sess.subscriptionActive) {
    console.log(`[bg] sub ${sessionId} already active`);
    return;
  }

  // Mollie klant aanmaken voor recurring
  let customerId = sess.mollieCustomerId;
  if (!customerId) {
    const customer = await mollie.customers.create({
      name: sess.user?.name || sess.subscriptionEmail,
      email: sess.user?.email || sess.subscriptionEmail
    });
    customerId = customer.id;
    await dbSet(`customerIndex/${customerId}`, sessionId);
  }

  const subscription = await mollie.customerSubscriptions.create({
    customerId,
    amount: { currency: 'EUR', value: '9.99' },
    interval: '1 month',
    description: 'Hechtingtest Premium',
    webhookUrl: `${process.env.SITE_URL}/.netlify/functions/mollie-webhook`,
    metadata: { plan: 'subscription_recurring' }
  });

  const updatedSess = {
    ...sess,
    paid: true,
    subscriptionActive: true,
    plan: 'subscription',
    mollieCustomerId: customerId,
    mollieMandateId: payment.mandateId || null,
    mollieSubscriptionId: subscription.id
  };
  await dbSet(`sessions/${sessionId}`, updatedSess);

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

  await dbSet(`sessions/${sessionId}`, { ...updatedSess, reportSent: true });
}

async function handleSubscriptionRecurring({ payment }) {
  const customerId = payment.customerId;
  if (!customerId) {
    console.log('[bg] recurring zonder customerId, skip');
    return;
  }

  const sessionIdForCustomer = await dbGet(`customerIndex/${customerId}`);
  if (!sessionIdForCustomer) {
    console.warn('[bg] geen session voor customer', customerId);
    return;
  }

  const sess = await dbGet(`sessions/${sessionIdForCustomer}`);
  if (!sess) return;

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
}

// ─── REPORT GENERATION ───────────────────────────────────────────────

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

  // 3x Claude calls parallel (was ook al zo, maar nu in background = oké)
  const [mainReport, partnerReport, coupleReport] = await Promise.all([
    anthropic.messages.create({
      model: 'claude-sonnet-4-20250514', max_tokens: 4000,
      messages: [{ role: 'user', content: buildSoloPrompt({
        user: main.user, styleKey: main.styleKey, scores: main.scores,
        normalized: main.normalized, answers: main.answers
      }) }]
    }),
    anthropic.messages.create({
      model: 'claude-sonnet-4-20250514', max_tokens: 4000,
      messages: [{ role: 'user', content: buildSoloPrompt({
        user: partner.user, styleKey: partner.styleKey, scores: partner.scores,
        normalized: partner.normalized, answers: partner.answers
      }) }]
    }),
    anthropic.messages.create({
      model: 'claude-sonnet-4-20250514', max_tokens: 5000,
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

  await dbSet(`couples/${token}`, { ...couple, reportSent: true });
}

async function sendMail(to, subject, html) {
  const resend = new Resend(process.env.RESEND_API_KEY);
  return resend.emails.send({
    from: 'Hechtingtest <hello@hechtingtest.nl>',
    to, subject, html
  });
}

// Exporteer zodat submit-partner.js dit kan triggeren
module.exports.generateAndSendCouple = generateAndSendCouple;
