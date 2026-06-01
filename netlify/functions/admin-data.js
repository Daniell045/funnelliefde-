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
      const betaalLijst = payments.filter(p => p.status === 'paid');

      // Haal emails op uit sessions store voor betalingen zonder email
      const siteID2 = process.env.NETLIFY_SITE_ID;
      const blobsToken2 = process.env.NETLIFY_BLOBS_TOKEN;
      const sessStore = (siteID2 && blobsToken2)
        ? getStore({ name: 'sessions', siteID: siteID2, token: blobsToken2 })
        : getStore('sessions');

      betalingen = await Promise.all(betaalLijst.map(async p => {
        let email = p.metadata?.email || p.metadata?.userEmail || '';
        let plan = p.metadata?.plan || p.metadata?.type || '';

        // Probeer email uit session als het leeg is
        if (!email && p.metadata?.sessionId) {
          try {
            const sess = await sessStore.get(p.metadata.sessionId, { type: 'json' });
            if (sess) email = sess.user?.email || sess.subscriptionEmail || '';
          } catch (e) {}
        }

        return {
          id: p.id,
          bedrag: parseFloat(p.amount.value),
          omschrijving: p.description,
          datum: p.paidAt || p.createdAt,
          email,
          type: plan
        };
      }));

      totalOntvangen = betalingen.reduce((sum, p) => sum + p.bedrag, 0);
    } catch (e) {
      console.error('Mollie fout:', e);
    }

    // Dedup op email — houd actief abonnement, anders meest recente
    const emailMap = {};
    profielen.forEach(function(p) {
      const key = (p.email || '').toLowerCase();
      if (!key) return;
      if (!emailMap[key]) {
        emailMap[key] = p;
      } else {
        const bestaande = emailMap[key];
        // Actief abonnement heeft altijd voorrang
        if (p.abonnementActief && !bestaande.abonnementActief) {
          emailMap[key] = p;
        } else if (!p.abonnementActief && bestaande.abonnementActief) {
          // houd bestaande
        } else if (new Date(p.aangemaaktOp || 0) > new Date(bestaande.aangemaaktOp || 0)) {
          emailMap[key] = p;
        }
      }
    });
    const uniekeProfielenList = Object.values(emailMap);

    // Splitsen in actief, afgemeld, inactief
    const actieven = uniekeProfielenList.filter(function(p) { return p.abonnementActief && !p.opzeggingAangevraagd; });
    const afgemeld = uniekeProfielenList.filter(function(p) { return p.opzeggingAangevraagd; });
    const inactief = uniekeProfielenList.filter(function(p) { return !p.abonnementActief && !p.opzeggingAangevraagd; });

    // Funnel data uit sessions store (aparte store genaamd 'sessions')
    let funnelData = { quizGestart: 0, emailIngevuld: 0, betaald: uniekeProfielenList.length, actief: actieven.length };
    try {
      const siteID = process.env.NETLIFY_SITE_ID;
      const blobsToken = process.env.NETLIFY_BLOBS_TOKEN;
      const sessionsStore = (siteID && blobsToken)
        ? getStore({ name: 'sessions', siteID, token: blobsToken })
        : getStore('sessions');
      const { blobs: sessionBlobs } = await sessionsStore.list();
      funnelData.emailIngevuld = sessionBlobs.length;
      funnelData.quizGestart = sessionBlobs.length;
    } catch (e) {
      console.error('Sessions fout:', e);
    }

    // Rapporten ophalen
    let rapporten = [];
    try {
      const siteIDr = process.env.NETLIFY_SITE_ID;
      const blobsTokenr = process.env.NETLIFY_BLOBS_TOKEN;
      const rapStore = (siteIDr && blobsTokenr)
        ? getStore({ name: 'rapporten', siteID: siteIDr, token: blobsTokenr })
        : getStore('rapporten');
      const { blobs: rapBlobs } = await rapStore.list();
      rapporten = await Promise.all(rapBlobs.map(async blob => {
        try {
          const data = await rapStore.get(blob.key, { type: 'json' });
          return data;
        } catch (e) { return null; }
      }));
      rapporten = rapporten.filter(Boolean).sort((a, b) => new Date(b.datum) - new Date(a.datum));
    } catch (e) {
      console.error('Rapporten fout:', e);
    }

    // Alle sessions ophalen voor warme leads
    let alleSessions = [];
    try {
      const siteID3 = process.env.NETLIFY_SITE_ID;
      const blobsToken3 = process.env.NETLIFY_BLOBS_TOKEN;
      const sessStore2 = (siteID3 && blobsToken3)
        ? getStore({ name: 'sessions', siteID: siteID3, token: blobsToken3 })
        : getStore('sessions');
      const { blobs: sessBlobs2 } = await sessStore2.list();
      const sessData = await Promise.all(sessBlobs2.map(async blob => {
        try {
          const d = await sessStore2.get(blob.key, { type: 'json' });
          return d;
        } catch (e) { return null; }
      }));
      alleSessions = sessData.filter(Boolean);
    } catch (e) {
      console.error('Sessions ophalen fout:', e);
    }

    // Betaalde emails verzamelen
    const betaaldeEmails = new Set(betalingen.map(b => (b.email || '').toLowerCase()).filter(Boolean));
    const profielEmails = new Set(uniekeProfielenList.map(p => (p.email || '').toLowerCase()).filter(Boolean));

    // Niet betaald — hebben quiz ingevuld maar nooit betaald
    const nietBetaald = alleSessions
      .filter(s => s.user?.email && !betaaldeEmails.has(s.user.email.toLowerCase()) && !profielEmails.has(s.user.email.toLowerCase()))
      .map(s => ({
        naam: s.user?.name || '—',
        email: s.user?.email || '—',
        stijl: s.style?.title || s.styleKey || '—',
        datum: s.createdAt ? new Date(s.createdAt).toISOString() : null
      }))
      .sort((a, b) => new Date(b.datum || 0) - new Date(a.datum || 0));

    // Alleen rapport — eenmalig betaald, geen Luna abonnement
    const alleenRapport = alleSessions
      .filter(s => {
        const email = (s.user?.email || '').toLowerCase();
        return email && betaaldeEmails.has(email) && !profielEmails.has(email);
      })
      .map(s => ({
        naam: s.user?.name || '—',
        email: s.user?.email || '—',
        stijl: s.style?.title || s.styleKey || '—',
        datum: s.createdAt ? new Date(s.createdAt).toISOString() : null
      }))
      .sort((a, b) => new Date(b.datum || 0) - new Date(a.datum || 0));

    // Aanmeldingen gesorteerd op datum
    const aanmeldingen = uniekeProfielenList
      .filter(function(p) { return p.abonnementStartOp; })
      .sort(function(a, b) { return new Date(b.abonnementStartOp) - new Date(a.abonnementStartOp); })
      .map(function(p) { return { naam: p.naam, email: p.email, stijl: p.stijl, datum: p.abonnementStartOp, coachToken: p.coachToken }; });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        profielen: uniekeProfielenList,
        rapporten,
        nietBetaald,
        alleenRapport,
        leden: actieven,
        actieven,
        afgemeld,
        inactief,
        aanmeldingen,
        betalingen,
        stats: {
          totalOntvangen: totalOntvangen.toFixed(2),
          mrrVerwacht: (actieven.length * 14.99).toFixed(2),
          actieveAbonnementen: actieven.length,
          afgemeldCount: afgemeld.length,
          totalGebruikers: uniekeProfielenList.length
        },
        funnel: funnelData
      })
    };

  } catch (err) {
    console.error('Admin fout:', err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
