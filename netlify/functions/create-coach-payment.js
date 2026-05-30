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
    const klant = await mollie.customers.create({
      name: naam,
      email: email,
      metadata: {
        coachToken: `luna_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        stijl,
        anxietyScore: anxietyScore || 50,
        avoidanceScore: avoidanceScore || 50,
        sessionId: sessionId || ''
      }
    });
 
    const coachToken = klant.metadata.coachToken;
 
    const betaling = await mollie.payments.create({
      // FIX: €0.01 zodat iDEAL werkt — wordt teruggestort of verrekend
      amount: { currency: 'EUR', value: '0.01' },
      customerId: klant.id,
      sequenceType: 'first',
      // FIX: iDEAL + creditcard + bancontact beschikbaar
      method: ['ideal', 'creditcard', 'bancontact'],
      description: 'Hechtingtest — 3 dagen gratis proberen, daarna €14,99/maand',
      redirectUrl: `${process.env.SITE_URL}/?token=${coachToken}`,
      webhookUrl: `${process.env.SITE_URL}/.netlify/functions/luna-webhook`,
      metadata: {
        coachToken,
        naam,
        email,
        stijl,
        anxietyScore: anxietyScore || 50,
        avoidanceScore: avoidanceScore || 50,
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

