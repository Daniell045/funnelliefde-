const Anthropic = require('@anthropic-ai/sdk');
const { dbGet, dbSet } = require('./_lib/firebase-admin');
const { STYLES, classifyStyle, getNormalized, buildSoloPrompt } = require('./_lib/helpers');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method not allowed' };

  try {
    const { user, scores, answers, isPartner, coupleToken } = JSON.parse(event.body);
    const styleKey = classifyStyle(scores);
    const style = STYLES[styleKey];
    const normalized = getNormalized(scores);
    const sessionId = 'sess_' + Math.random().toString(36).slice(2, 11) + Date.now().toString(36);

    // Sessie opslaan in Firebase
    await dbSet(`sessions/${sessionId}`, {
      sessionId, user, scores, normalized, answers, styleKey, style,
      isPartner: !!isPartner, coupleToken: coupleToken || null,
      paid: false, reportSent: false, createdAt: Date.now()
    });

    // Als partner: koppel aan couple record
    if (isPartner && coupleToken) {
      const couple = await dbGet(`couples/${coupleToken}`);
      if (couple) {
        await dbSet(`couples/${coupleToken}`, {
          ...couple,
          partnerSessionId: sessionId
        });
      }
    }

    // Preview genereren (alleen voor hoofd-gebruiker, niet partner)
    let preview = 'Je rapport wordt zo gegenereerd.';
    if (!isPartner && process.env.ANTHROPIC_API_KEY) {
      try {
        const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
        const prompt = buildSoloPrompt({ user, styleKey, scores, normalized, answers });
        const resp = await anthropic.messages.create({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 250,
          messages: [{ role: 'user', content: prompt + '\n\nGeef ALLEEN een korte preview (3-4 zinnen, geen HTML).' }]
        });
        preview = resp.content[0].text + '…';
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
