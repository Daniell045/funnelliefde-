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

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: 'Method not allowed' };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Ongeldig verzoek' }) };
  }

  const { email } = body;
  if (!email) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'E-mailadres verplicht' }) };
  }

  try {
    const store = getConfiguredStore();

    // Zoek coachToken op via email index
    const emailIndex = await store.get(`coach:email:${email.toLowerCase()}`);
    if (!emailIndex) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ error: 'Geen account gevonden met dit e-mailadres.' })
      };
    }

    const { coachToken } = typeof emailIndex === 'string' ? JSON.parse(emailIndex) : emailIndex;
    if (!coachToken) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ error: 'Geen account gevonden met dit e-mailadres.' })
      };
    }

    // Controleer of abonnement actief is
    const profiel = await store.get(`coach:user:${coachToken}:profile`);
    if (!profiel) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ error: 'Geen account gevonden met dit e-mailadres.' })
      };
    }

    const profielData = typeof profiel === 'string' ? JSON.parse(profiel) : profiel;
    if (!profielData.abonnementActief) {
      return {
        statusCode: 403,
        headers,
        body: JSON.stringify({ error: 'Je abonnement is niet actief. Neem contact op via info@hechtingstest.nl' })
      };
    }

    const siteUrl = process.env.SITE_URL || 'https://hechtingstest.nl';
    const loginUrl = `${siteUrl}/?token=${coachToken}`;
    const naam = profielData.naam ? profielData.naam.split(' ')[0] : 'daar';

    // Stuur inloglink via Resend
    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Hechtingtest <noreply@hechtingstest.nl>',
        to: email,
        subject: 'Jouw inloglink voor Luna',
        html: `
          <div style="font-family:'Manrope',system-ui,sans-serif;max-width:520px;margin:0 auto;background:#F4EFE6;padding:2rem;border-radius:16px;">
            <div style="margin-bottom:1.5rem;">
              <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#C97B5F;margin-right:0.5rem;"></span>
              <strong style="color:#2D4A3E;font-size:1rem;">Hechtingtest</strong>
            </div>
            <h2 style="font-size:1.75rem;font-weight:400;color:#2A1F1A;line-height:1.1;margin-bottom:0.75rem;">
              Hoi ${naam},<br><em>hier is je inloglink.</em>
            </h2>
            <p style="color:#6B5D52;line-height:1.65;margin-bottom:1.5rem;">
              Klik op de knop hieronder om direct in te loggen bij Luna. De link is 24 uur geldig.
            </p>
            <a href="${loginUrl}" style="display:inline-block;background:#C97B5F;color:#2A1F1A;text-decoration:none;padding:1rem 2rem;border-radius:999px;font-weight:600;font-size:1rem;">
              Inloggen bij Luna →
            </a>
            <p style="color:#6B5D52;font-size:0.8125rem;margin-top:1.5rem;line-height:1.6;">
              Of kopieer deze link: <a href="${loginUrl}" style="color:#2D4A3E;">${loginUrl}</a>
            </p>
            <hr style="border:none;border-top:1px solid rgba(42,31,26,0.08);margin:1.5rem 0;">
            <p style="color:#6B5D52;font-size:0.75rem;line-height:1.6;">
              Niet aangevraagd? Dan kun je deze mail negeren.<br>
              Vragen? <a href="mailto:info@hechtingstest.nl" style="color:#2D4A3E;">info@hechtingstest.nl</a>
            </p>
          </div>
        `
      })
    });

    if (!resendRes.ok) {
      const resendErr = await resendRes.text();
      console.error('Resend fout:', resendErr);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'Mail versturen mislukt. Probeer opnieuw.' })
      };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ ok: true })
    };

  } catch (err) {
    console.error('Login fout:', err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Er ging iets mis. Probeer opnieuw.' })
    };
  }
};
