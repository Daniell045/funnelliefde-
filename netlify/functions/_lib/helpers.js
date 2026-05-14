// helpers.js - shared utils

const STYLES = {
  secure: { name: 'Veilig hechtende stijl', title: 'Verbinder' },
  anxious: { name: 'Angstig-gepreoccupeerde stijl', title: 'Zoeker' },
  avoidant: { name: 'Vermijdend-onthechte stijl', title: 'Beschermer' },
  fearful: { name: 'Angstig-vermijdende stijl', title: 'Beschermer in nood' }
};

function classifyStyle(scores) {
  const a = scores.anxiety, v = scores.avoidance;
  const highA = a > 3, highV = v > 3;
  if (!highA && !highV) return 'secure';
  if (highA && !highV) return 'anxious';
  if (!highA && highV) return 'avoidant';
  return 'fearful';
}

function normalize(score, min, max) {
  const clamped = Math.max(min, Math.min(max, score));
  return Math.round((clamped - min) / (max - min) * 100);
}

function getNormalized(scores) {
  return {
    anxiety: normalize(scores.anxiety, -9, 14),
    avoidance: normalize(scores.avoidance, -9, 14),
    secure: 100 - Math.max(normalize(scores.anxiety, -9, 14), normalize(scores.avoidance, -9, 14))
  };
}

function buildSoloPrompt({ user, styleKey, scores, normalized, answers }) {
  const style = STYLES[styleKey];
  const answersText = answers.map((a, i) => `Q${i+1}: "${a.chosen}"`).join(', ');
  
  return `Schrijf een warm, persoonlijk hechtingsrapport van ~800 woorden (HTML, geen html/body tags) voor ${user.name} die een ${style.title}-hechtingsstijl heeft (${style.name}).

Scores: Verbinding=${normalized.secure}%, Onzekerheid=${normalized.anxiety}%, Afstand=${normalized.avoidance}%

Hun antwoorden: ${answersText}

Structuur: welkom, wat deze stijl betekent, hoe het in relaties speelt, hun patronen, oefeningen, afsluiter. Warm, geen jargon, specifiek op hun antwoorden.`;
}

function buildCouplePrompt({ p1, p2 }) {
  const s1 = STYLES[p1.styleKey];
  const s2 = STYLES[p2.styleKey];
  return `Schrijf een warm koppels-rapport van ~1000 woorden (HTML, geen html/body tags) voor ${p1.user.name} en ${p2.user.name}.

${p1.user.name}: ${s1.title} (${s1.name}), Scores: Verbinding=${p1.normalized.secure}%, Onzekerheid=${p1.normalized.anxiety}%, Afstand=${p1.normalized.avoidance}%
${p2.user.name}: ${s2.title} (${s2.name}), Scores: Verbinding=${p2.normalized.secure}%, Onzekerheid=${p2.normalized.anxiety}%, Afstand=${p2.normalized.avoidance}%

Structuur: jullie samen, waar jullie elkaar versterken, waar jullie triggeren, wat elk nodig heeft van de ander, oefeningen, afsluiter. Warm, eerlijk, specifiek op hun combinatie.`;
}

module.exports = { STYLES, classifyStyle, normalize, getNormalized, buildSoloPrompt, buildCouplePrompt };
