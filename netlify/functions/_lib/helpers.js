const STYLES = {
  secure: { name: 'Veilig hechtende stijl', title: 'Verbinder' },
  anxious: { name: 'Angstig-gepreoccupeerde stijl', title: 'Zoeker' },
  avoidant: { name: 'Vermijdend-onthechte stijl', title: 'Beschermer' },
  fearful: { name: 'Angstig-vermijdende stijl', title: 'Beschermer in nood' }
};

// Scores komen nu binnen als percentage 0-100 per dimensie (anxiety/avoidance)
// 50 = neutraal, >50 = hoge score op die dimensie, <50 = lage score
function classifyStyle(scores) {
  const a = scores.anxiety, v = scores.avoidance;
  // Drempel op 55% (iets boven neutraal) om grijs gebied te vermijden
  const highA = a > 55, highV = v > 55;
  if (!highA && !highV) return 'secure';
  if (highA && !highV) return 'anxious';
  if (!highA && highV) return 'avoidant';
  return 'fearful';
}

// Scores zijn nu al 0-100, dus geen normalisering meer nodig.
// Behouden voor backwards compatibility.
function getNormalized(scores) {
  return {
    anxiety: Math.round(scores.anxiety),
    avoidance: Math.round(scores.avoidance),
    secure: Math.round(100 - Math.max(scores.anxiety, scores.avoidance))
  };
}

function buildSoloPrompt({ user, styleKey, scores, normalized, answers }) {
  const style = STYLES[styleKey];

  // Antwoorden zijn nu sliders 0-100. Vertaal naar leesbare tekst voor Claude.
  const answersText = answers.map((a, i) => {
    const intensity =
      a.value < 20 ? 'helemaal niet' :
      a.value < 40 ? 'beetje niet' :
      a.value < 60 ? 'neutraal/twijfel' :
      a.value < 80 ? 'best wel' : 'helemaal';
    return `Vraag ${i + 1}: "${a.q}" — antwoord: ${intensity} (${a.value}/100)`;
  }).join('\n');

  return `Je bent een warme, ervaren hechtingstherapeut. Schrijf een persoonlijk hechtingsrapport van circa 1400 woorden voor ${user.name} in geldige HTML (alleen body content - geen <html>, <head>, of <body> tags).

Profiel: ${style.name} (${style.title})
Scores: Verbinding ${normalized.secure}%, Onzekerheid bij afstand ${normalized.anxiety}%, Behoefte aan afstand ${normalized.avoidance}%

15 antwoorden (op 0-100 schaal, hoe meer richting 100 hoe sterker mee eens):
${answersText}

Structuur (gebruik <h2>, <h3>, <p>, <ul>, <li>, <em>, <strong>):
1. <h2>Hallo ${user.name}</h2> - warme opening, erken dat ze de moeite namen
2. <h2>Jouw stijl: ${style.title}</h2> - wat dit betekent, geen jargon, geen "stoornis"
3. <h2>Hoe dit speelt in je relaties</h2> - concrete voorbeelden uit hun antwoorden
4. <h2>Het patroon achter jouw antwoorden</h2> - verwijs naar minstens 3 specifieke antwoorden met hun score-intensiteit (bv. "Je gaf 'helemaal' aan bij vraag X, dat suggereert...")
5. <h2>Hoe je hecht aan andere stijlen</h2> - korte match-analyse
6. <h2>Drie oefeningen voor deze week</h2> - concreet, doe-baar
7. <h2>Tot slot</h2> - hoopvolle afsluiter

Toon: warm, professioneel, in 2e persoon. Nederlands. Geen claims over therapie/diagnose. Echt persoonlijk, geen platitudes. Maak gebruik van de score-intensiteit (helemaal vs beetje) voor diepgang.`;
}

function buildCouplePrompt({ p1, p2 }) {
  const s1 = STYLES[p1.styleKey];
  const s2 = STYLES[p2.styleKey];

  const formatAnswers = (answers) => answers.slice(0, 8).map(a => {
    const intensity =
      a.value < 20 ? 'helemaal niet' :
      a.value < 40 ? 'beetje niet' :
      a.value < 60 ? 'neutraal' :
      a.value < 80 ? 'best wel' : 'helemaal';
    return `"${a.q}" → ${intensity}`;
  }).join(' | ');

  return `Je bent een ervaren relatie- en hechtingstherapeut. Schrijf een koppels-rapport van circa 1700 woorden voor ${p1.user.name} en ${p2.user.name} in geldige HTML (alleen body content).

${p1.user.name}: ${s1.title} (${s1.name}) | Verbinding ${p1.normalized.secure}%, Onzekerheid ${p1.normalized.anxiety}%, Afstand ${p1.normalized.avoidance}%
${p2.user.name}: ${s2.title} (${s2.name}) | Verbinding ${p2.normalized.secure}%, Onzekerheid ${p2.normalized.anxiety}%, Afstand ${p2.normalized.avoidance}%

Kern-antwoorden ${p1.user.name}: ${formatAnswers(p1.answers)}
Kern-antwoorden ${p2.user.name}: ${formatAnswers(p2.answers)}

Structuur:
1. <h2>Voor ${p1.user.name} en ${p2.user.name}</h2> - opening
2. <h2>Jullie dynamiek</h2> - wat deze combinatie typisch betekent
3. <h2>Waar jullie elkaar versterken</h2> - 3-4 concrete punten
4. <h2>Waar jullie elkaar triggeren</h2> - eerlijk over conflict-dynamiek
5. <h2>Wat ${p1.user.name} van ${p2.user.name} nodig heeft</h2>
6. <h2>Wat ${p2.user.name} van ${p1.user.name} nodig heeft</h2>
7. <h2>Drie oefeningen samen</h2>
8. <h2>Tot slot</h2>

Warm, eerlijk, specifiek. Nederlands. Geen jargon.`;
}

function emailWrapper(title, htmlContent) {
  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>${title}</title></head>
<body style="font-family: -apple-system, sans-serif; max-width: 640px; margin: 0 auto; padding: 2rem; color: #2A1F1A; background: #F4EFE6; line-height: 1.6;">
<div style="background: #FAF6EE; padding: 2rem; border-radius: 16px;">
<h1 style="color: #2D4A3E; font-size: 1.75rem; margin: 0 0 1rem;">${title}</h1>
${htmlContent}
<hr style="margin: 2rem 0; border: none; border-top: 1px solid #EBE3D4;">
<p style="font-size: 0.75rem; color: #6B5D52;">Hechtingtest.nl — voor zelfreflectie, geen psychologische diagnose. Bij ernstige klachten: raadpleeg een professional.</p>
</div></body></html>`;
}

module.exports = { STYLES, classifyStyle, getNormalized, buildSoloPrompt, buildCouplePrompt, emailWrapper };
