exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method not allowed' };

  try {
    const { coupleToken, user, scores, answers } = JSON.parse(event.body);

    // TODO:
    // - Load main user data from Blobs using token
    // - Save partner data to Blobs
    // - Check if main user has paid (Mollie webhook recorded it)
    // - If yes: generate couple rapport
    // - Send couple rapport to both emails

    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true, message: 'Partner quiz registered' })
    };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
