# Hechtingtest.nl

Quiz-funnel: people discover their attachment style, pay €5 (solo) of €9 (couple) of €9,99/maand (premium), get personalized AI rapport.

## Stack

- Frontend: Single HTML (vanilla JS)
- Backend: Netlify Functions (Node.js) — **alles op free tier**
- Payments: Mollie
- Email: Resend
- AI: Anthropic Claude
- **Database: Netlify Blobs** (was Firebase, nu eruit)

## Hoe het Mollie-spam-probleem opgelost is

**Probleem (oud):** Mollie pingt webhook → webhook doet Firebase reads + 3x Claude calls (10-20s elk) + 2x Resend mails → totaal 30-60 sec. Mollie wacht max ~15 sec, denkt dat het faalde, retryt elke minuut. Mail werd 5-10x gestuurd.

**Oplossing (nieuw):**

```
Mollie → mollie-webhook (~1 sec response):
           1. Check idempotency (paymentId al verwerkt? skip)
           2. Mark als processed
           3. Trigger process-payment-background async (fire & forget)
           4. Return 200 OK direct
                                     ↓
         process-payment-background (max 15 min, GRATIS):
           - Genereer rapport via Claude
           - Stuur mail via Resend
           - Update Netlify Blobs
```

## Background functions = gratis op alle plans

Netlify functions met **`-background`** in de filename (bv. `process-payment-background.js`) draaien tot 15 minuten en zijn beschikbaar op het **free tier**. Ze returnen direct 202 aan de caller en doen de rest in een queue.

Beperking: ze geven geen response terug, dus errors moet je via logs monitoren (geen client kan op het resultaat wachten). Voor onze flow (mail wordt vanzelf gestuurd) is dat perfect.

## Setup

```bash
npm install
netlify dev
```

Open http://localhost:8888

## Environment Variables (Netlify dashboard)

```
ANTHROPIC_API_KEY=sk-ant-...
MOLLIE_API_KEY=live_xxx
RESEND_API_KEY=re_xxx
SITE_URL=https://hechtingtest.nl
INTERNAL_SECRET=een-lang-random-string
```

**`INTERNAL_SECRET`** is een random string die je zelf bedenkt (`openssl rand -hex 32` op Mac/Linux, of gewoon iets willekeurigs typen). Beveiligt de background endpoints zodat anderen ze niet kunnen aanroepen.

## Files

```
netlify/functions/
  _lib/
    helpers.js                       - STYLES, prompts, email wrapper
    storage.js                       - Netlify Blobs (was firebase-admin)
  process-quiz.js                    - quiz submit + preview
  create-payment.js                  - Mollie checkout aanmaken
  mollie-webhook.js                  - SNEL: idempotency + trigger bg + 200 OK
  process-payment-background.js      - LANG: Claude + mail (15 min, gratis)
  process-couple-background.js       - LANG: couple rapport als partner laat klaar is
  submit-partner.js                  - partner-klaar trigger
```

## URLs (let op suffix)

Filename `process-payment-background.js` → endpoint `/.netlify/functions/process-payment-background` (suffix BLIJFT in de URL).

## Funnel Flow

1. Quiz (12 vragen, 2-keuze) → scores
2. Email capture → opslaan in sessie
3. Preview (AI-generated via Claude) → locked
4. Pricing: Solo €5 / Couple €9 / Premium €9,99/mnd
5. Mollie payment → webhook (1 sec) → background worker (~30-60 sec)
6. Rapport delivery via Resend
7. Couple: share link → partner quiz → trigger couple-background

## Migratie

Firebase eruit, geen migratie nodig — Netlify Blobs start leeg. Lopende sessies in Firebase ben je kwijt tenzij je ze exporteert.

```bash
npm uninstall firebase-admin
```

## TODO

- [ ] privacy.html + algemene-voorwaarden.html invullen (nog placeholders)
- [ ] Dashboard voor €9,99/mnd subscribers
- [ ] Email sequence voor non-buyers
- [ ] Landing page (Meta/TikTok)

## Debugging

**Mollie pingt en niks gebeurt?**
- Check `mollie-webhook` logs: moet "Accepted" zeggen
- Check `process-payment-background` logs: zou direct daarna moeten starten
- Check Netlify Blobs in dashboard

**Mail komt niet aan?**
- Check `process-payment-background` logs voor Resend errors
- Check spam folder
- Verify dat `hello@hechtingtest.nl` geverifieerd is bij Resend

**Webhook 401 op bg endpoint?**
- `INTERNAL_SECRET` env var ontbreekt of staat verschillend
