const { getStore } = require('@netlify/blobs');

function getSessionsStore() {
  const siteID = process.env.NETLIFY_SITE_ID;
  const token = process.env.NETLIFY_BLOBS_TOKEN;
  if (siteID && token) {
    return getStore({ name: 'sessions', siteID, token });
  }
  return getStore('sessions');
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

  const { password, email, naam, stijl, type } = body;
  if (!password || password !== process.env.ADMIN_PASSWORD) {
    return { statusCode: 401, headers, body: JSON.stringify({ error: 'Ongeldig wachtwoord' }) };
  }

  if (!email || !naam) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Email en naam verplicht' }) };
  }

  const siteUrl = process.env.SITE_URL || 'https://hechtingstest.nl';
  const voornaam = naam.split(' ')[0];

  let subject, html;

  if (type === 'rapport_follow_up') {
    // Mail voor mensen die rapport hebben maar geen abonnement
    subject = `${voornaam}, 87% doorbreekt het patroon — jij ook?`;
    html = `
      <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:2rem;color:#2A1F1A;">
        <div style="margin-bottom:1.5rem;">
          <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#C97B5F;margin-right:0.5rem;"></span>
          <strong style="color:#2D4A3E;">Hechtingtest</strong>
        </div>
        <h2 style="font-size:1.75rem;font-weight:400;line-height:1.1;margin-bottom:0.75rem;">
          Hoi ${voornaam},<br><em style="font-style:italic;">je hechtingsstijl kennen is stap 1.</em>
        </h2>
        <p style="color:#6B5D52;line-height:1.65;margin-bottom:1rem;">
          Je hebt je rapport ontvangen — je weet nu dat je een <strong>${stijl || 'hechtingsstijl'}</strong> hebt. Maar kennis alleen verandert niets.
        </p>
        <p style="color:#6B5D52;line-height:1.65;margin-bottom:1rem;">
          87% van de mensen die actief met hun hechtingsstijl werken, doorbreken binnen 3 maanden hun patroon. De andere 13% leest het rapport en gaat verder zoals altijd.
        </p>
        <p style="color:#6B5D52;line-height:1.65;margin-bottom:1.5rem;">
          Luna is een AI-coach die jóuw stijl kent. Stuur haar een situatie — ze legt uit wat er speelt en wat je kunt doen. Elke dag. 3 dagen gratis.
        </p>
        <a href="${siteUrl}" style="display:inline-block;background:#2D4A3E;color:#FAF6EE;padding:1rem 2rem;border-radius:999px;text-decoration:none;font-weight:600;font-size:1rem;margin-bottom:1.5rem;">
          Start met Luna — 3 dagen gratis →
        </a>
        <p style="font-size:0.8125rem;color:#6B5D52;border-top:1px solid rgba(42,31,26,0.08);padding-top:1rem;line-height:1.6;">
          Vragen? <a href="mailto:info@hechtingstest.nl" style="color:#2D4A3E;">info@hechtingstest.nl</a>
        </p>
      </div>
    `;
  } else {
    // Mail voor mensen die quiz hebben ingevuld maar niet betaald
    subject = `${voornaam}, je hechtingsstijl wacht nog op je`;
    html = `
      <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:2rem;color:#2A1F1A;">
        <div style="margin-bottom:1.5rem;">
          <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#C97B5F;margin-right:0.5rem;"></span>
          <strong style="color:#2D4A3E;">Hechtingtest</strong>
        </div>
        <h2 style="font-size:1.75rem;font-weight:400;line-height:1.1;margin-bottom:0.75rem;">
          Hoi ${voornaam},<br><em style="font-style:italic;">je resultaat staat klaar.</em>
        </h2>
        <p style="color:#6B5D52;line-height:1.65;margin-bottom:1rem;">
          Je hebt de hechtingstest ingevuld — maar je rapport nog niet ontvangen. Je hechtingsstijl bepaalt hoe je liefhebt, ruzie maakt en je veilig voelt in relaties.
        </p>
        <p style="color:#6B5D52;line-height:1.65;margin-bottom:1.5rem;">
          Haal je rapport op — het duurt 2 minuten en kost €6. Je ontvangt direct een diepgaande analyse van jouw stijl.
        </p>
        <a href="${siteUrl}" style="display:inline-block;background:#C97B5F;color:#2A1F1A;padding:1rem 2rem;border-radius:999px;text-decoration:none;font-weight:600;font-size:1rem;margin-bottom:1.5rem;">
          Haal mijn rapport op — €6 →
        </a>
        <p style="color:#6B5D52;font-size:0.875rem;line-height:1.6;margin-bottom:1.5rem;">
          Of doe het samen met je partner voor €10 — jullie ontvangen allebei een rapport plus een koppelsanalyse.
        </p>
        <p style="font-size:0.8125rem;color:#6B5D52;border-top:1px solid rgba(42,31,26,0.08);padding-top:1rem;line-height:1.6;">
          Vragen? <a href="mailto:info@hechtingstest.nl" style="color:#2D4A3E;">info@hechtingstest.nl</a>
        </p>
      </div>
    `;
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Hechtingtest <noreply@hechtingstest.nl>',
        to: email,
        subject,
        html,
        headers: {
          'List-Unsubscribe': '<mailto:info@hechtingstest.nl?subject=Uitschrijven>'
        }
      })
    });

    if (!res.ok) {
      const err = await res.text();
      console.error('Resend fout:', err);
      return { statusCode: 500, headers, body: JSON.stringify({ error: 'Mail versturen mislukt' }) };
    }

    // Markeer als follow-up verstuurd in sessions store
    try {
      const store = getSessionsStore();
      const { blobs } = await store.list();
      for (const blob of blobs) {
        const sess = await store.get(blob.key, { type: 'json' });
        if (sess?.user?.email?.toLowerCase() === email.toLowerCase()) {
          await store.setJSON(blob.key, { ...sess, followUpVerstuurd: true, followUpDatum: new Date().toISOString() });
          break;
        }
      }
    } catch (e) {
      console.error('Follow-up markeren mislukt:', e);
    }

    return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };

  } catch (err) {
    console.error('Follow-up fout:', err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
