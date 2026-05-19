const { dbGet, dbSet } = require('./_lib/firebase-admin');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method not allowed' };

  try {
    const { token } = JSON.parse(event.body);
    if (!token) return { statusCode: 400, body: 'No token' };

    const couple = await dbGet(`couples/${token}`);
    if (!couple) return { statusCode: 404, body: 'Couple not found' };

    if (couple.paid && couple.partnerSessionId && !couple.reportSent) {
      const { generateAndSendCouple } = require('./mollie-webhook');
      await generateAndSendCouple(token);
    }

    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
