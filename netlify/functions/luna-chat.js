const { getStore } = require('@netlify/blobs');
const Anthropic = require('@anthropic-ai/sdk');

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const DAG_LIMIET = 10;

// Toon per hechtingsstijl
function getToonInstructie(stijl, anxietyScore, avoidanceScore) {
  const anxiety = anxietyScore > 60;
  const avoidant = avoidanceScore > 60;

  if (anxiety && avoidant) {
    return `Deze gebruiker heeft een angstig-vermijdende hechtingsstijl (hoge anxiety: ${anxietyScore}, hoge avoidance: ${avoidanceScore}). 
Ze zijn tegelijk bang voor verlating én bang voor intimiteit. Wees extra voorzichtig en geduldig. 
Valideer eerst altijd hun gevoel voordat je iets suggereert. Dring nooit aan. Geef ruimte.
Gebruik een warme maar rustige toon — niet te intens, niet te afstandelijk.`;
  }

  if (anxiety) {
    return `Deze gebruiker heeft een angstig-gepreoccupeerde hechtingsstijl (hoge anxiety: ${anxietyScore}, lage avoidance: ${avoidanceScore}).
Ze hebben sterke behoefte aan bevestiging en zijn snel bang voor verlating.
Wees warm, gerustststellend en consistent. Bevestig hun gevoelens expliciet.
Vermijd vage antwoorden — die triggeren meer angst. Wees duidelijk en direct.`;
  }

  if (avoidant) {
    return `Deze gebruiker heeft een vermijdend-onthechte hechtingsstijl (lage anxiety: ${anxietyScore}, hoge avoidance: ${avoidanceScore}).
Ze zijn gewend aan emotionele afstand en vinden intimiteit ongemakkelijk.
Respecteer hun behoefte aan ruimte. Wees niet te warm of te opdringerig.
Stel vragen die ze zelf laten nadenken — niet te veel emotionele labels plakken.
Wees professioneel maar toegankelijk, niet te emotioneel geladen.`;
  }

  // Veilig hechter
  return `Deze gebruiker heeft een veilige hechtingsstijl (lage anxiety: ${anxietyScore}, lage avoidance: ${avoidanceScore}).
Ze staan open voor verbinding en reflectie. Je kunt directe, diepgaande vragen stellen.
Wees warm en betrokken. Ze kunnen ook kritische feedback aan.`;
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

  const store = getStore('hechtingtest');

  // 1. Laad gebruikersprofiel
  let profiel;
  try {
    const profielData = await store.get(`coach:user:${token}:profile`);
    if (!profielData) {
      return { statusCode: 401, headers, body: JSON.stringify({ error: 'Onbekende gebruiker' }) };
    }
    profiel = JSON.parse(profielData);
  } catch {
    return { statusCode: 401, headers, body: JSON.stringify({ error: 'Gebruiker niet gevonden' }) };
  }

  // 2. Check abonnement actief
  if (!profiel.abonnementActief) {
    return { statusCode: 403, headers, body: JSON.stringify({ error: 'Geen actief abonnement', code: 'NO_SUB' }) };
  }

  // 3. Check daglimiet
  const vandaag = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  const limitKey = `coach:user:${token}:limit:${vandaag}`;

  let aantalVandaag = 0;
  try {
    const limitData = await store.get(limitKey);
    if (limitData) aantalVandaag = parseInt(limitData, 10);
  } catch { aantalVandaag = 0; }

  if (aantalVandaag >= DAG_LIMIET) {
    return {
      statusCode: 429,
      headers,
      body: JSON.stringify({
        error: 'Daglimiet bereikt',
        code: 'LIMIT',
        bericht: `Je hebt je ${DAG_LIMIET} berichten voor vandaag gebruikt. Morgen kun je weer verder. Neem de tijd om te reflecteren op wat je vandaag hebt gedeeld.`,
        resterend: 0
      })
    };
  }

  // 4. Laad of maak gesprek
  const huidigGesprekId = gesprekId || `gesprek_${Date.now()}`;
  const gesprekKey = `coach:user:${token}:gesprek:${huidigGesprekId}`;

  let geschiedenis = [];
  try {
    const gesprekData = await store.get(gesprekKey);
    if (gesprekData) geschiedenis = JSON.parse(gesprekData);
  } catch { geschiedenis = []; }

  // 5. Bouw systeem prompt
  const toonInstructie = getToonInstructie(
    profiel.stijl,
    profiel.anxietyScore || 50,
    profiel.avoidanceScore || 50
  );

  const systeemPrompt = `Je bent Luna, een persoonlijke hechtingscoach. Je helpt mensen inzicht te krijgen in hun hechtingspatronen en relaties.

GEBRUIKERSPROFIEL:
- Naam: ${profiel.naam}
- Hechtingsstijl: ${profiel.stijl}
- Anxiety score: ${profiel.anxietyScore}/100
- Avoidance score: ${profiel.avoidanceScore}/100

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
- Gebruik de gespreksgeschiedenis om patronen te herkennen en daarop voort te bouwen`;

  // 6. Voeg nieuw bericht toe aan geschiedenis
  geschiedenis.push({ role: 'user', content: bericht });

  // 7. Claude API aanroep
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

  // 8. Sla antwoord op in geschiedenis
  geschiedenis.push({ role: 'assistant', content: antwoord });

  // 9. Sla gesprek op
  try {
    await store.set(gesprekKey, JSON.stringify(geschiedenis));
  } catch (err) {
    console.error('Blobs opslaan mislukt:', err);
  }

  // 10. Update gesprekkenlijst
  try {
    const lijstKey = `coach:user:${token}:gesprekken`;
    let gesprekken = [];
    const lijstData = await store.get(lijstKey);
    if (lijstData) gesprekken = JSON.parse(lijstData);

    if (!gesprekken.find(g => g.id === huidigGesprekId)) {
      gesprekken.unshift({
        id: huidigGesprekId,
        aangemaakt: new Date().toISOString(),
        preview: bericht.substring(0, 60)
      });
      await store.set(lijstKey, JSON.stringify(gesprekken));
    }
  } catch (err) {
    console.error('Gesprekkenlijst updaten mislukt:', err);
  }

  // 11. Update dagteller
  try {
    await store.set(limitKey, String(aantalVandaag + 1));
  } catch (err) {
    console.error('Dagteller updaten mislukt:', err);
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
