# Hechtingtest.nl

Quiz-funnel: people discover their attachment style, pay €5 (solo) or €9 (couple), get personalized AI rapport.

## Stack

- Frontend: Single HTML (vanilla JS)
- Backend: Netlify Functions (Node.js)
- Payments: Mollie
- Email: Resend (transactional) + MailerLite (marketing)
- AI: Anthropic Claude
- Database: Netlify Blobs (simple key-value)

## Setup

```bash
npm install
netlify dev
```

Open http://localhost:8888

## Deploy to Netlify

1. Push repo to GitHub
2. Netlify dashboard → Add site → Import from Git
3. Select `hechtingtest` repo
4. Netlify auto-deploys on push to main

## Environment Variables (Netlify dashboard)

```
ANTHROPIC_API_KEY=sk-ant-...
MOLLIE_API_KEY=live_xxx
RESEND_API_KEY=re_xxx
MAILERLITE_API_KEY=xxx (optional for now)
SITE_URL=https://hechtingtest.nl
```

## Domain

Registered at TransIP → Netlify DNS settings

## Funnel Flow

1. **Quiz** (12 vragen, 2-keuze) → scores on anxiety/avoidance axes
2. **Email capture** → MailerLite lead
3. **Preview** (AI-generated via Claude) → locked
4. **Pricing choice**: Solo €5 / Couple €9
5. **Mollie payment** → webhook
6. **Rapport delivery** (Resend)
7. **Couple flow**: share link → partner quiz → combined rapport

## TODO

- [ ] Complete Netlify Blobs integration (save/load state)
- [ ] Mollie webhook → generate full rapport
- [ ] Resend email templates (HTML)
- [ ] MailerLite integration (lead capture)
- [ ] Partner flow validation
- [ ] Landing page from Meta/TikTok traffic
- [ ] Email sequence for non-buyers
- [ ] Dashboard for €9.99/month subscribers

## Notes

- No external DB needed; Netlify Blobs handles state
- Claude API calls for preview (~400 chars) + full rapports (~1500 chars each)
- Couple rapport generated when both users done + main user paid
- All rappöorts in HTML, ready for Resend
