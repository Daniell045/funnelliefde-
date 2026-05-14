const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);

exports.handler = async (event) => {
  // Mollie sends POST with id= parameter
  try {
    const paymentId = event.queryStringParameters?.id;
    if (!paymentId) return { statusCode: 400, body: 'No payment ID' };

    // TODO: fetch payment from Mollie, check status
    // If paid:
    //   - get sessionId from metadata
    //   - load full quiz data from Blobs
    //   - generate full rapport via Claude
    //   - send via Resend
    //   - if couple: check if partner is done
    //     - if yes: generate couple rapport too

    // For now: stub
    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: 'Webhook error' };
  }
};
