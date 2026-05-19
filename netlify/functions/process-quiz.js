const Anthropic = require('@anthropic-ai/sdk');
const { getStore } = require('@netlify/blobs');
const { STYLES, classifyStyle, getNormalized, buildSoloPrompt } = require('./_lib/helpers');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method not allowed' };
  try {
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const { user, scores, answers, isPartner, coupleToken } = JSON.parse(event.body);
    
    const styleKey = classifyStyle(scores);
    const style = STYLES[styleKey];
    const normalized = getNormalized(scores);

    // Generate preview via Claude
    const prompt = buildSoloPrompt({
      user,
      styleKey,
      scores: { anxiety: scores.anxiety, avoidance: scores.avoidance },
      normalized,
      answers
    });

    const resp = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 400,
      messages: [{ role: 'user', content: prompt }]
    });

    const preview = resp.content[0].type === 'text' 
      ? resp.content[0].text.substring(0, 300) + '…' 
      : 'Rapport volgt…';

    // Save session to Netlify Blobs
    const sessionId = 'sess_' + Math.random().toString(36).slice(2, 11);
    const sessions = getStore('sessions');
    await sessions.setJSON(sessionId, {
      sessionId,
      user,
      scores,
      answers,
      styleKey,
      style,
      normalized,
      preview,
      isPartner,
      coupleToken,
      paid: false,
      reportSent: false,
      createdAt: Date.now()
    });

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
    console.error('process-quiz error:', err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
