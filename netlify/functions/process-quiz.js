const Anthropic = require('@anthropic-ai/sdk');
const { dbGet, dbSet } = require('./_lib/storage');
const { STYLES, classifyStyle, getNormalized } = require('./_lib/helpers');

function buildPreviewPrompt({ user, styleKey, normalized }) {
  const style = STYLES[styleKey];
  return `Schrijf een korte preview-tekst voor ${user.name} over hun hechtingsstijl. STRIKT MAX 3 ZINNEN.

Stijl: ${style.title} (${style.name})
Scores: Verbinding ${normalized.secure}%, Onzekerheid ${normalized.anxiety}%, Afstand ${normalized.avoidance}%

Regels:
- Schrijf in 2e persoon ("jij/je")
- Begin met een persoonlijke observatie die raak is
- Hint naar 1 inzicht uit het rapport zonder het te onthullen
- Eindig met spanning/nieuwsgierigheid naar het volledige rapport
- Toon: warm, professioneel, niet wollig
- GEEN HTML tags, GEEN aanhef ("Hallo X"), GEEN "in dit rapport..."
- Nederlands, maximaal 60 woorden totaal

Geef ALLEEN de preview tekst, niks anders.`;
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method not allowed' };

  try {
    const { user, scores, answers, isPartner, coupleToken } = JSON.parse(event.body);

    if (!scores || typeof scores.anxiety !== 'number' || typeof scores.avoidance !== 'number') {
      return { statusCode: 400, body: JSON.stringify({ error: 'Invalid scores format' }) };
    }

    const styleKey = classifyStyle(scores);
    const style = STYLES[styleKey];
    const normalized = getNormalized(scores);
    const sessionId = 'sess_' + Math.random().toString(36).slice(2, 11) + Date.now().toString(36);

    await dbSet(`sessions/${sessionId}`, {
      sessionId, user, scores, normalized, answers, styleKey, style,
      isPartner: !!isPartner, coupleToken: coupleToken || null,
      paid: false, reportSent: false, createdAt: Date.now()
    });

    if (isPartner && coupleToken) {
      const couple = await dbGet(`couples/${coupleToken}`);
      if (couple) {
        await dbSet(`couples/${coupleToken}`, { ...couple, partnerSessionId: sessionId });
      }
    }

    let preview = `Jouw resultaat laat een interessant patroon zien. In het volledige rapport ontdek je hoe jouw stijl je relaties beïnvloedt.`;

    if (!isPartner && process.env.ANTHROPIC_API_KEY) {
      try {
        const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
        const previewPrompt = buildPreviewPrompt({ user, styleKey, normalized });
        const resp = await anthropic.messages.create({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 150,
          messages: [{ role: 'user', content: previewPrompt }]
        });
        preview = resp.content[0].text
          .replace(/<[^>]+>/g, '')
          .replace(/^\s*[#*-]+\s*/gm, '')
          .trim();
        if (preview.length > 400) {
          preview = preview.substring(0, 350).split('.').slice(0, -1).join('.') + '…';
        }
      } catch (e) {
        console.error('preview err:', e.message);
      }
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId,
        style: { key: styleKey, name: style.name, title: style.title },
        normalized,
        preview
      })
    };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
