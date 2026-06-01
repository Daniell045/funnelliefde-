const { getStore } = require('@netlify/blobs');
const Anthropic = require('@anthropic-ai/sdk');

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const DAG_LIMIET = 10;

function getConfiguredStore() {
  const siteID = process.env.NETLIFY_SITE_ID;
  const token = process.env.NETLIFY_BLOBS_TOKEN;
  if (siteID && token) {
    return getStore({ name: 'hechtingtest', siteID, token });
  }
  return getStore('hechtingtest');
}

// Nederlandse datum (middernacht NL = reset)
function getNederlandseDatum() {
  return new Date().toLocaleDateString('nl-NL', {
    timeZone: 'Europe/Amsterdam',
    year: 'numeric', month: '2-digit', day: '2-digit'
  }).split('-').reverse().join('-'); // YYYY-MM-DD
}

function getToonInstructie(stijl, anxietyScore, avoidanceScore) {
  const anxiety = anxietyScore > 60;
  const avoidant = avoidanceScore > 60;

  if (anxiety && avoidant) {
    return `Deze gebruiker heeft een angstig-vermijdende hechtingsstijl (hoge anxiety: ${anxietyScore}, hoge avoidance: ${avoidanceScore}). 
Ze zijn tegelijk bang voor verlating EN bang voor intimiteit. Wees extra voorzichtig en geduldig. 
Valideer eerst altijd hun gevoel voordat je iets suggereert. Dring nooit aan. Geef ruimte.
Gebruik een warme maar rustige toon — niet te intens, niet te afstandelijk.`;
  }

  if (anxiety) {
    return `Deze gebruiker heeft een angstig-gepreoccupeerde hechtingsstijl (hoge anxiety: ${anxietyScore}, lage avoidance: ${avoidanceScore}).
Ze hebben sterke behoefte aan bevestiging en zijn snel bang voor verlating.
Wees warm, geruststellend en consistent. Bevestig hun gevoelens expliciet.
Vermijd vage antwoorden — die triggeren meer angst. Wees duidelijk en direct.`;
  }

  if (avoidant) {
    return `Deze gebruiker heeft een vermijdend-onthechte hechtingsstijl (lage anxiety: ${anxietyScore}, hoge avoidance: ${avoidanceScore}).
Ze zijn gewend aan emotionele afstand en vinden intimiteit ongemakkelijk.
Respecteer hun behoefte aan ruimte. Wees niet te warm of te opdringerig.
Stel vragen die ze zelf laten nadenken — niet te veel emotionele labels plakken.
Wees professioneel maar toegankelijk, niet te emotioneel geladen.`;
  }

  return `Deze gebruiker heeft een veilige hechtingsstijl (lage anxiety: ${anxietyScore}, lage avoidance: ${avoidanceScore}).
Ze staan open voor verbinding en reflectie. Je kunt directe, diepgaande vragen stellen.
Wees warm en betrokken. Ze kunnen ook kritische feedback aan.`;
}

function isOpzegVerzoek(tekst) {
  const lower = tekst.toLowerCase();
  return ['opzeggen', 'opzeg', 'annuleren', 'annuleer', 'stoppen', 'stop abonnement', 'abonnement opzeggen', 'uitschrijven'].some(function(w) {
    return lower.includes(w);
  });
}

async function verwerkOpzegging(store, token, profiel) {
  // Markeer als opzegging aangevraagd
  profiel.opzeggingAangevraagd = true;
  profiel.opzeggingDatum = new Date().toISOString();
  await store.set(`coach:user:${token}:profile`, JSON.stringify(profiel));

  // Stuur mail naar gebruiker
  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Luna <luna@hechtingstest.nl>',
        to: profiel.email,
        subject: 'Je opzegging is ontvangen',
        html: `
          <div style="font-family:sans-serif;max-width:480px;padding:1.5rem;color:#2A1F1A;">
            <div style="margin-bottom:1rem;">
              <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#C97B5F;margin-right:0.5rem;"></span>
              <strong style="color:#2D4A3E;">Hechtingtest</strong>
            </div>
            <h2 style="font-weight:400;font-size:1.5rem;margin-bottom:0.75rem;">Je opzegging is ontvangen.</h2>
            <p style="color:#6B5D52;line-height:1.65;margin-bottom:1rem;">
              Hoi ${profiel.naam.split(' ')[0]}, we hebben je opzegging ontvangen. Het team verwerkt dit binnen 24 uur en je abonnement wordt stopgezet.
            </p>
            <p style="color:#6B5D52;line-height:1.65;margin-bottom:1.5rem;">
              Tot die tijd kun je gewoon gebruik blijven maken van Luna.
            </p>
            <p style="font-size:0.8125rem;color:#6B5D52;border-top:1px solid rgba(42,31,26,0.08);padding-top:1rem;">
              Vragen? Mail naar <a href="mailto:info@hechtingstest.nl" style="color:#2D4A3E;">info@hechtingstest.nl</a>
            </p>
          </div>
        `
      })
    });
  } catch (e) {
    console.error('Opzegging gebruikersmail mislukt:', e);
  }

  // Stuur mail naar admin via Resend
  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Luna System <noreply@hechtingstest.nl>',
        to: 'info@hechtingstest.nl',
        subject: 'Opzegging aangevraagd — ' + profiel.naam,
        html: `
          <div style="font-family:sans-serif;max-width:480px;padding:1.5rem;">
            <h2 style="color:#2D4A3E;">Opzegging aangevraagd</h2>
            <p><strong>Naam:</strong> ${profiel.naam}</p>
            <p><strong>Email:</strong> ${profiel.email}</p>
            <p><strong>Stijl:</strong> ${profiel.stijl}</p>
            <p><strong>Abonnement gestart:</strong> ${profiel.abonnementStartOp ? new Date(profiel.abonnementStartOp).toLocaleDateString('nl-NL') : '—'}</p>
            <p><strong>Mollie klant ID:</strong> ${profiel.mollieKlantId || '—'}</p>
            <p><strong>Subscription ID:</strong> ${profiel.subscriptionId || '—'}</p>
            <hr>
            <p style="color:#6B5D52;font-size:0.875rem;">Zet het abonnement stop in Mollie en bevestig naar de gebruiker.</p>
          </div>
        `
      })
    });
  } catch (e) {
    console.error('Opzegging mail mislukt:', e);
  }
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
  };

  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Ongeldig verzoek' }) };
  }

  const { token, bericht, gesprekId } = body;

  if (!token || !bericht) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Token en bericht zijn verplicht' }) };
  }

  const store = getConfiguredStore();

  // 1. Laad gebruikersprofiel
  let profiel;
  try {
    const profielData = await store.get(`coach:user:${token}:profile`);
    if (!profielData) {
      return { statusCode: 401, headers, body: JSON.stringify({ error: 'Onbekende gebruiker' }) };
    }
    profiel = typeof profielData === 'string' ? JSON.parse(profielData) : profielData;
  } catch (err) {
    console.error('Profiel fout:', err);
    return { statusCode: 401, headers, body: JSON.stringify({ error: 'Gebruiker niet gevonden' }) };
  }

  // 2. Check abonnement actief
  if (!profiel.abonnementActief) {
    return { statusCode: 403, headers, body: JSON.stringify({ error: 'Geen actief abonnement', code: 'NO_SUB' }) };
  }

  // 3. Check daglimiet — reset om middernacht Nederlandse tijd
  const vandaag = getNederlandseDatum();
  const limitKey = `coach:user:${token}:limit:${vandaag}`;

  let aantalVandaag = 0;
  try {
    const limitData = await store.get(limitKey);
    if (limitData) aantalVandaag = parseInt(typeof limitData === 'string' ? limitData : String(limitData), 10) || 0;
  } catch { aantalVandaag = 0; }

  if (aantalVandaag >= DAG_LIMIET) {
    return {
      statusCode: 429,
      headers,
      body: JSON.stringify({ error: 'Daglimiet bereikt', code: 'LIMIT', resterend: 0 })
    };
  }

  // 4. Detecteer opzegging
  if (isOpzegVerzoek(bericht)) {
    await verwerkOpzegging(store, token, profiel);
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        antwoord: `Ik begrijp dat je wilt stoppen, ${profiel.naam.split(' ')[0]}. Ik heb je opzegging doorgegeven aan het team — je ontvangt binnen 24 uur een bevestiging per mail op ${profiel.email}.\n\nTot die tijd kun je gewoon gebruik blijven maken van Luna. Is er nog iets anders waarbij ik je kan helpen?`,
        gesprekId: gesprekId || `gesprek_${Date.now()}`,
        resterend: DAG_LIMIET - aantalVandaag - 1,
        opzegging: true
      })
    };
  }

  // 5. Laad of maak gesprek
  const huidigGesprekId = gesprekId || `gesprek_${Date.now()}`;
  const gesprekKey = `coach:user:${token}:gesprek:${huidigGesprekId}`;

  let geschiedenis = [];
  try {
    const gesprekData = await store.get(gesprekKey);
    if (gesprekData) {
      geschiedenis = typeof gesprekData === 'string' ? JSON.parse(gesprekData) : gesprekData;
    }
  } catch { geschiedenis = []; }

  // 6. Bouw systeem prompt
  const toonInstructie = getToonInstructie(
    profiel.stijl,
    profiel.anxietyScore || 50,
    profiel.avoidanceScore || 50
  );

  // Bouw geheugen van eerdere gesprekken
  let geheugenSamenvatting = '';
  try {
    const lijstKey = `coach:user:${token}:gesprekken`;
    const lijstData = await store.get(lijstKey);
    if (lijstData) {
      const gesprekken = typeof lijstData === 'string' ? JSON.parse(lijstData) : lijstData;
      const eerdere = gesprekken.filter(function(g) { return g.id !== huidigGesprekId; }).slice(0, 5);
      if (eerdere.length > 0) {
        geheugenSamenvatting = '\n\nEERDERE GESPREKKEN (preview):\n' + eerdere.map(function(g) {
          return '- ' + new Date(g.aangemaakt).toLocaleDateString('nl-NL') + ': "' + g.preview + '"';
        }).join('\n');
      }
    }
  } catch (e) {}

  const systeemPrompt = `Je bent Luna, een persoonlijke hechtingscoach. Je helpt mensen inzicht te krijgen in hun hechtingspatronen en relaties.

GEBRUIKERSPROFIEL:
- Naam: ${profiel.naam}
- Hechtingsstijl: ${profiel.stijl}
- Anxiety score: ${profiel.anxietyScore}/100
- Avoidance score: ${profiel.avoidanceScore}/100
- Lid sinds: ${profiel.abonnementStartOp ? new Date(profiel.abonnementStartOp).toLocaleDateString('nl-NL') : 'onbekend'}${geheugenSamenvatting}

TOON EN AANPAK:
${toonInstructie}

ALGEMENE REGELS:
- Spreek altijd Nederlands
- Spreek de gebruiker aan met hun naam (${profiel.naam}) maar niet bij elk bericht — doe het natuurlijk
- Je bent Luna — nooit "AI" of "chatbot" noemen
- Houd antwoorden beknopt: max 3-4 korte alinea's. Geen lange lappen tekst
- Eindig altijd met één concrete vraag OF één kleine oefening — nooit beide
- Geef geen medisch of therapeutisch advies. Bij ernstige klachten verwijs je naar een professional
- Je hebt bewust een limiet van ${DAG_LIMIET} berichten per dag — maak elk antwoord de moeite waard
- Als iemand vraagt om op te zeggen, zeg dan dat je het doorstuurt naar het team
- Gebruik de gespreksgeschiedenis om patronen te herkennen en daarop voort te bouwen`;

  // 7. Voeg nieuw bericht toe
  geschiedenis.push({ role: 'user', content: bericht });

  // 8. Claude API
  let antwoord;
  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 600,
      system: systeemPrompt,
      messages: geschiedenis
    });
    antwoord = response.content[0].text;
  } catch (err) {
    console.error('Claude API fout:', err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Luna is even niet beschikbaar. Probeer het zo opnieuw.' }) };
  }

  // 9. Sla antwoord op in gesprek
  geschiedenis.push({ role: 'assistant', content: antwoord });
  try {
    await store.set(gesprekKey, JSON.stringify(geschiedenis));
  } catch (err) {
    console.error('Gesprek opslaan mislukt:', err);
  }

  // 10. Update gesprekkenlijst
  try {
    const lijstKey = `coach:user:${token}:gesprekken`;
    let gesprekken = [];
    const lijstData = await store.get(lijstKey);
    if (lijstData) {
      gesprekken = typeof lijstData === 'string' ? JSON.parse(lijstData) : lijstData;
    }
    const bestaand = gesprekken.find(function(g) { return g.id === huidigGesprekId; });
    if (!bestaand) {
      gesprekken.unshift({ id: huidigGesprekId, aangemaakt: new Date().toISOString(), preview: bericht.substring(0, 60) });
    } else {
      bestaand.laatstActief = new Date().toISOString();
      bestaand.aantalBerichten = (bestaand.aantalBerichten || 0) + 1;
    }
    await store.set(lijstKey, JSON.stringify(gesprekken));
  } catch (err) {
    console.error('Gesprekkenlijst mislukt:', err);
  }

  // 11. Update profiel — laatste activiteit bijhouden
  try {
    profiel.laatsteActiviteit = new Date().toISOString();
    profiel.totaleBerichten = (profiel.totaleBerichten || 0) + 1;
    await store.set(`coach:user:${token}:profile`, JSON.stringify(profiel));
  } catch (err) {
    console.error('Profiel update mislukt:', err);
  }

  // 12. Update dagteller
  try {
    await store.set(limitKey, String(aantalVandaag + 1));
  } catch (err) {
    console.error('Dagteller mislukt:', err);
  }

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({
      antwoord,
      gesprekId: huidigGesprekId,
      resterend: DAG_LIMIET - (aantalVandaag + 1)
    })
  };
};
