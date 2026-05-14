# Hechtingtest.nl

Quiz-funnel die mensen hun hechtingsstijl laat ontdekken. Solo (€5) of koppels (€9) rapport via Claude API + Mollie + Resend + MailerLite.

## Stack

- **Frontend**: Single HTML file (vanilla JS, geen build step)
- **Hosting**: Netlify
- **Backend**: Netlify Functions (Node.js)
- **Betalingen**: Mollie
- **Email transactioneel**: Resend
- **Email marketing**: MailerLite
- **AI**: Anthropic Claude API
- **Domein**: hechtingtest.nl (via TransIP)

## Lokaal draaien

```bash
npm install
netlify dev
```

Open http://localhost:8888

## Deploy

Push naar `main` → Netlify deployt automatisch.

## Environment variables (Netlify dashboard)

```
ANTHROPIC_API_KEY=sk-ant-...
MOLLIE_API_KEY=live_...
RESEND_API_KEY=re_...
MAILERLITE_API_KEY=...
SITE_URL=https://hechtingtest.nl
```

## Funnel-flow

1. **Intro** → quiz starten
2. **12 vragen** (2-keuze met plaatjes) — score op anxiety/avoidance assen
3. **Email capture** (naam + email → MailerLite)
4. **Loading** (Claude API berekent profiel)
5. **Resultaat preview** met 2 opties: Solo €5 / Samen €9
6. **Mollie checkout**
7a. **Solo**: Resend stuurt rapport (PDF/HTML)
7b. **Samen**: Share-pagina met partner-link → partner doet quiz → koppels-rapport naar beide

## Repo structuur

```
.
├── index.html              # Hele frontend (quiz, capture, result, share)
├── netlify.toml            # Netlify config + redirects + headers
├── package.json
└── netlify/functions/      # Backend (komt nog)
    ├── process-quiz.js     # MailerLite + preview gen
    ├── create-payment.js   # Mollie checkout
    ├── mollie-webhook.js   # Payment status updates
    ├── submit-partner.js   # Koppel-flow afhandeling
    └── generate-report.js  # Claude API → Resend
```

## TODO

- [ ] Netlify Functions bouwen (zie hierboven)
- [ ] Higgsfield-illustraties voor quiz vragen
- [ ] /success en /privacy en /algemene-voorwaarden pagina's
- [ ] App-dashboard voor €9,99/maand abonnement
- [ ] Email sequence non-subscribers (MailerLite automations)
