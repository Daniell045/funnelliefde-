// netlify/functions/mollie-webhook.js
//
// KRITIEK: Mollie verwacht een 200 OK binnen ~15 sec. Zo niet, retryt
// hij met exponential backoff (tot ~24u). Dat is waarom mails 5-10x
// werden verstuurd: webhook deed 3x Claude calls + 2x Resend voor de
// 200 terugkwam, dus Mollie dacht dat 't faalde.
//
// FIX:
//   1. Check idempotency direct (paymentId al verwerkt? klaar.)
//   2. Markeer als processed VOOR het zware werk start
//   3. Return 200 direct
//   4. Doe Claude/Resend werk async via background fetch
//
// Background work via een aparte function (process-payment-bg) die we
// fire-and-forget aanroepen. Dat is de cleanste pattern op Netlify.

const mollieClient = require('@mollie/api-client');
const { dbGet, dbSet, isAlreadyProcessed, markProcessed } = require('./_lib/storage');

exports.handler = async (event) => {
  try {
    // Mollie stuurt paymentId als form-encoded body OF query param
    let paymentId = event.queryStringParameters?.id;
    if (!paymentId && event.body) {
      const params = new URLSearchParams(event.body);
      paymentId = params.get('id');
    }
    if (!paymentId) {
      return { statusCode: 400, body: 'No payment ID' };
    }

    // 1) IDEMPOTENCY: heeft Mollie dit al gepingd? Dan klaar.
    //    Hierdoor stopt het mail-spam-probleem direct.
    if (await isAlreadyProcessed(paymentId)) {
      console.log(`[webhook] ${paymentId} al verwerkt, skip`);
      return { statusCode: 200, body: 'Already processed' };
    }

    // 2) Haal payment-status op (snel, ~200ms)
    const mollie = mollieClient.default({ apiKey: process.env.MOLLIE_API_KEY });
    const payment = await mollie.payments.get(paymentId);

    // Niet-betaalde statussen: 200 teruggeven maar NIET markeren als
    // processed (kan later nog naar 'paid' switchen).
    if (payment.status !== 'paid') {
      console.log(`[webhook] ${paymentId} status=${payment.status}, skip`);
      return { statusCode: 200, body: `Status: ${payment.status}` };
    }

    // 3) Markeer DIRECT als processed (vóór het zware werk).
    //    Als de background-call faalt, kunnen we 'm handmatig opnieuw
    //    triggeren via een admin endpoint of de marker wissen.
    await markProcessed(paymentId);

    // 4) Fire-and-forget naar background function. We wachten NIET op
    //    de response — die mag minuten duren. Mollie krijgt direct 200.
    //
    // Background functions = filenames die eindigen op -background.js
    // Die zijn GRATIS op Netlify free tier met 15 min timeout, en
    // returnen direct 202 Accepted aan de caller. De -background suffix
    // BLIJFT in de URL.
    const siteUrl = process.env.SITE_URL || 'https://hechtingtest.nl';
    const bgUrl = `${siteUrl}/.netlify/functions/process-payment-background`;

    // We willen de fetch wel triggeren maar niet awaiten. Op Netlify
    // wordt fetch zonder await soms voortijdig gekilled, dus we doen
    // een minimaal await op het verzenden (niet op het antwoord).
    try {
      await fetch(bgUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-internal-secret': process.env.INTERNAL_SECRET || 'dev'
        },
        body: JSON.stringify({ paymentId })
      }).catch(err => console.error('[webhook] bg trigger failed:', err.message));
    } catch (err) {
      console.error('[webhook] fetch threw:', err.message);
      // Zelfs als dit faalt, geven we 200 terug — anders gaat Mollie
      // retryen. We loggen het zodat we het kunnen opvolgen.
    }

    console.log(`[webhook] ${paymentId} geaccepteerd, bg gestart`);
    return { statusCode: 200, body: 'Accepted' };

  } catch (err) {
    console.error('[webhook] error:', err);
    // 500 zorgt dat Mollie retryt. Liever een 200 + log dan een
    // retry-storm die alles erger maakt.
    return { statusCode: 200, body: 'Error logged: ' + err.message };
  }
};
