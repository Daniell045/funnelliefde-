const mollieClient = require('@mollie/api-client');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method not allowed' };

  try {
    const { sessionId, plan, user } = JSON.parse(event.body);
    const mollieApi = mollieClient({ apiKey: process.env.MOLLIE_API_KEY });

    const amount = plan === 'couple' ? '9.00' : '5.00';
    const description = plan === 'couple' ? 'Hechtingtest koppel rapport' : 'Hechtingtest solo rapport';

    const payment = await mollieApi.payments.create({
      amount: { currency: 'EUR', value: amount },
      description,
      redirectUrl: `${process.env.SITE_URL || 'https://hechtingtest.nl'}/success.html?session=${sessionId}&plan=${plan}`,
      webhookUrl: `${process.env.SITE_URL || 'https://hechtingtest.nl'}/.netlify/functions/mollie-webhook`,
      metadata: { sessionId, plan, userEmail: user.email }
    });

    // TODO: save payment ID + plan to Netlify Blobs

    return {
      statusCode: 200,
      body: JSON.stringify({
        checkoutUrl: payment.getCheckoutUrl(),
        token: plan === 'couple' ? 'partner_' + Math.random().toString(36).slice(2, 11) : null
      })
    };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
