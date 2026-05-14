// Wordt gebouwd in volgende stap.
// Doel: lead opslaan in MailerLite + preview genereren via Claude API.

exports.handler = async (event) => {
  return {
    statusCode: 200,
    body: JSON.stringify({ ok: true, message: 'Backend komt nog' })
  };
};
