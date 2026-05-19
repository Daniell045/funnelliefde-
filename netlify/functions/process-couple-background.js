// netlify/functions/process-couple-bg.js
//
// Aparte background function voor het geval dat partner KLAAR is NA
// de main payment. In dat geval triggert submit-partner.js deze om
// het couple rapport alsnog te genereren.

const { generateAndSendCouple } = require('./process-payment-background');

exports.handler = async (event) => {
  const secret = event.headers['x-internal-secret'];
  if (secret !== (process.env.INTERNAL_SECRET || 'dev')) {
    return { statusCode: 401, body: 'Unauthorized' };
  }

  try {
    const { token } = JSON.parse(event.body);
    if (!token) return { statusCode: 400, body: 'No token' };

    await generateAndSendCouple(token);
    return { statusCode: 200, body: 'Couple report sent' };
  } catch (err) {
    console.error('[couple-bg] failed:', err);
    return { statusCode: 500, body: err.message };
  }
};
