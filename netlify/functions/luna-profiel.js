const { getStore } = require('@netlify/blobs');

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
    const store = getStore('hechtingtest');
    const data = await store.get(`coach:user:${token}:profile`);

    if (!data) {
      return { statusCode: 404, headers, body: JSON.stringify({ error: 'Gebruiker niet gevonden. Gebruik de link uit je welkomstmail.' }) };
    }

    const profiel = JSON.parse(data);

    if (!profiel.abonnementActief) {
      return { statusCode: 403, headers, body: JSON.stringify({ error: 'Geen actief abonnement.' }) };
    }

    // Stuur alleen wat de UI nodig heeft — geen gevoelige data
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
