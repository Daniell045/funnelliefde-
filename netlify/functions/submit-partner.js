const { getStore } = require('@netlify/blobs');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method not allowed' };

  try {
    const { token } = JSON.parse(event.body);
    if (!token) return { statusCode: 400, body: 'No token' };

    const couples = getStore('couples');
    const couple = await couples.get(token, { type: 'json' });
    if (!couple) return { statusCode: 404, body: 'Couple not found' };

    // If main paid + partner done → trigger report
    if (couple.paid && couple.partnerSessionId && !couple.reportSent) {
      // Lazy require to avoid circular
      const { generateAndSendCouple } = require('./mollie-webhook');
      await generateAndSendCouple(token);
    }

    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
