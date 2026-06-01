const { getStore } = require('@netlify/blobs');

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

  const token = event.queryStringParameters?.token;
  if (!token) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Geen token' }) };
  }

  try {
    const store = getConfiguredStore();
    const data = await store.get(`coach:user:${token}:profile`);
    if (!data) {
      return { statusCode: 404, headers, body: JSON.stringify({ error: 'Gebruiker niet gevonden. Gebruik de link uit je welkomstmail.' }) };
    }
    const profiel = typeof data === 'string' ? JSON.parse(data) : data;
    if (!profiel.abonnementActief) {
      return { statusCode: 403, headers, body: JSON.stringify({ error: 'Geen actief abonnement.' }) };
    }
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        naam: profiel.naam,
        stijl: profiel.stijl
      })
    };
  } catch (err) {
    console.error('Profiel ophalen fout:', err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Fout bij ophalen profiel' }) };
  }
};
