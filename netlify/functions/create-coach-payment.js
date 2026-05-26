const { getStore } = require('@netlify/blobs');
const { createMollieClient } = require('@mollie/api-client');

const mollie = createMollieClient({ apiKey: process.env.MOLLIE_API_KEY });

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
  };

  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Ongeldig verzoek' }) };
  }

  const { naam, email, stijl, anxietyScore, avoidanceScore, sessionId } = body;

  if (!naam || !email || !stijl) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Naam, email en stijl zijn verplicht' }) };
  }

  try {
    // 1. Maak Mollie klant aan (nodig voor subscriptions)
    const klant = await mollie.customers.create({
      name: naam,
      email: email,
      metadata: { stijl, sessionId }
    });

    // 2. Genereer unieke coach token
    const coachToken = `luna_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // 3. Sla gebruikersprofiel op in Blobs (nog niet actief — wordt actief na betaling)
    const store = getStore('hechtingtest');
    await store.set(`coach:user:${coachToken}:profile`, JSON.stringify({
      naam,
      email,
      stijl,
      anxietyScore: anxietyScore || 50,
      avoidanceScore: avoidanceScore || 50,
      mollieKlantId: klant.id,
      abonnementActief: false,
      aangemaaktOp: new Date().toISOString()
    }));

    // 4. Eerste betaling: €0,00 voor mandaat — 3 dagen gratis trial
    // Mollie vereist eerst een mandaat, daarna start de subscription pas na 3 dagen
    const betaling = await mollie.payments.create({
      amount: { currency: 'EUR', value: '0.00' },
      customerId: klant.id,
      sequenceType: 'first',
      description: 'Luna hechtingscoach — 3 dagen gratis proberen, daarna €14,99/maand',
      redirectUrl: `${process.env.URL}/?token=${coachToken}`,
      webhookUrl: `${process.env.URL}/.netlify/functions/luna-webhook`,
      metadata: {
        coachToken,
        type: 'coach_eerste_betaling'
      }
    });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        checkoutUrl: betaling.getCheckoutUrl(),
        coachToken
      })
    };

  } catch (err) {
    console.error('Mollie fout:', err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Betaling aanmaken mislukt: ' + err.message })
    };
  }
};
