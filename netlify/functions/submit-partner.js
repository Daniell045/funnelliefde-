const { dbGet } = require('./_lib/storage');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method not allowed' };

  try {
    const { token } = JSON.parse(event.body);
    if (!token) return { statusCode: 400, body: 'No token' };

    const couple = await dbGet(`couples/${token}`);
    if (!couple) return { statusCode: 404, body: 'Couple not found' };

    // Als main betaald + partner klaar + rapport nog niet verstuurd → trigger bg
    if (couple.paid && couple.partnerSessionId && !couple.reportSent) {
      const siteUrl = process.env.SITE_URL || 'https://hechtingtest.nl';
      // Fire-and-forget naar background function. We geven een speciale
      // marker mee (geen paymentId maar coupleToken) zodat de bg weet
      // dat-ie alleen het couple-rapport hoeft te maken.
      // -background suffix BLIJFT in de URL
      await fetch(`${siteUrl}/.netlify/functions/process-couple-background`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-internal-secret': process.env.INTERNAL_SECRET || 'dev'
        },
        body: JSON.stringify({ token })
      }).catch(err => console.error('[partner] bg trigger failed:', err.message));
    }

    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
