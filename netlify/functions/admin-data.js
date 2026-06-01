const { getStore } = require('@netlify/blobs');
const { createMollieClient } = require('@mollie/api-client');

const mollie = createMollieClient({ apiKey: process.env.MOLLIE_API_KEY });

function getConfiguredStore() {
  const siteID = process.env.NETLIFY_SITE_ID;
  const token = process.env.NETLIFY_BLOBS_TOKEN;
  if (siteID && token) {
    return getStore({ name: 'hechtingtest', siteID, token });
  }
  return getStore('hechtingtest');
}

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: 'Method not allowed' };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Ongeldig verzoek' }) };
  }

  const { password } = body;
  if (!password || password !== process.env.ADMIN_PASSWORD) {
    return { statusCode: 401, headers, body: JSON.stringify({ error: 'Ongeldig wachtwoord' }) };
  }

  try {
    const store = getConfiguredStore();

    // Haal alle coach profielen op
    const { blobs } = await store.list({ prefix: 'coach:user:' });
    const profielen = [];

    for (const blob of blobs) {
      if (!blob.key.endsWith(':profile')) continue;
      try {
        const data = await store.get(blob.key);
        if (data) {
          const profiel = typeof data === 'string' ? JSON.parse(data) : data;
          // Haal token uit key: coach:user:{token}:profile
          const token = blob.key.split(':')[2];
          profielen.push({ ...profiel, coachToken: token });
        }
      } catch (e) {
        console.error('Profiel lezen fout:', e);
      }
    }

    // Haal betalingen op uit Mollie
    let betalingen = [];
    let totalOntvangen = 0;
    try {
      const payments = await mollie.payments.list({ limit: 100 });
      betalingen = payments
        .filter(p => p.status === 'paid')
        .map(p => ({
          id: p.id,
          bedrag: parseFloat(p.amount.value),
          omschrijving: p.description,
          datum: p.paidAt || p.createdAt,
          email: p.metadata?.email || '',
          type: p.metadata?.type || ''
        }));
      totalOntvangen = betalingen.reduce((sum, p) => sum + p.bedrag, 0);
    } catch (e) {
      console.error('Mollie fout:', e);
    }

    // Bereken stats
    const actieveAbonnementen = profielen.filter(p => p.abonnementActief).length;
    const mrrVerwacht = actieveAbonnementen * 14.99;

    // Funnel data uit sessions
    let funnelData = { quizGestart: 0, emailIngevuld: 0, betaald: 0, actief: actieveAbonnementen };
    try {
      const { blobs: sessionBlobs } = await store.list({ prefix: 'sessions/' });
      funnelData.emailIngevuld = sessionBlobs.length;
      funnelData.betaald = profielen.length;
      funnelData.quizGestart = Math.max(sessionBlobs.length, profielen.length);
    } catch (e) {
      console.error('Sessions fout:', e);
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        profielen,
        betalingen,
        stats: {
          totalOntvangen: totalOntvangen.toFixed(2),
          mrrVerwacht: mrrVerwacht.toFixed(2),
          actieveAbonnementen,
          totalGebruikers: profielen.length
        },
        funnel: funnelData
      })
    };

  } catch (err) {
    console.error('Admin fout:', err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
