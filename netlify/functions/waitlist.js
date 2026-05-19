const { getStore } = require('@netlify/blobs');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method not allowed' };

  try {
    const { name, email, style } = JSON.parse(event.body || '{}');
    if (!email) return { statusCode: 400, body: 'No email' };

    const store = getStore('waitlist');
    const key = email.toLowerCase().replace(/[^a-z0-9@.]/g, '_');
    await store.setJSON(key, { name, email, style, at: Date.now() });

    console.log('[waitlist]', email, style);
    return { statusCode: 200, body: 'ok' };
  } catch (err) {
    console.error(err);
    return { statusCode: 200, body: 'ok' }; // altijd 200, anders ziet gebruiker een fout
  }
};
