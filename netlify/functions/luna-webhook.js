const { getStore } = require('@netlify/blobs');
const { createMollieClient } = require('@mollie/api-client');
const { Resend } = require('resend');

const mollie = createMollieClient({ apiKey: process.env.MOLLIE_API_KEY });
const resend = new Resend(process.env.RESEND_API_KEY);

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  const params = new URLSearchParams(event.body);
  const betalingId = params.get('id');

  if (!betalingId) {
    return { statusCode: 400, body: 'Geen betaling ID' };
  }

  try {
    const betaling = await mollie.payments.get(betalingId);

    if (betaling.status !== 'paid') {
      return { statusCode: 200, body: 'Niet betaald, niets doen' };
    }

    const { coachToken, type } = betaling.metadata || {};

    if (!coachToken) {
      return { statusCode: 200, body: 'Geen coachToken in metadata' };
    }

    const store = getStore('hechtingtest');
    const profielKey = `coach:user:${coachToken}:profile`;

    let profiel;
    try {
      const data = await store.get(profielKey);
      profiel = JSON.parse(data);
    } catch {
      console.error('Profiel niet gevonden voor token:', coachToken);
      return { statusCode: 200, body: 'Profiel niet gevonden' };
    }

    if (type === 'coach_eerste_betaling') {
      // 1. Maak Mollie subscription aan voor maandelijkse incasso
      const subscription = await mollie.customerSubscriptions.create({
        customerId: profiel.mollieKlantId,
        amount: { currency: 'EUR', value: '14.99' },
        interval: '1 month',
        startDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 3 dagen later
        description: 'Luna hechtingscoach — maandelijks',
        webhookUrl: `${process.env.URL}/.netlify/functions/luna-webhook`,
        metadata: { coachToken, type: 'coach_maandelijks' }
      });

      // 2. Activeer abonnement in Blobs
      profiel.abonnementActief = true;
      profiel.subscriptionId = subscription.id;
      profiel.abonnementStartOp = new Date().toISOString();
      profiel.abonnementVerlengOp = subscription.nextPaymentDate;
      await store.set(profielKey, JSON.stringify(profiel));

      // 3. Stuur welkomstmail met coach link
      const coachUrl = `${process.env.URL}/coach.html?token=${coachToken}`;

      await resend.emails.send({
        from: 'Luna <luna@hechtingstest.nl>',
        to: profiel.email,
        subject: 'Welkom — jouw persoonlijke coach staat klaar',
        html: `
          <div style="font-family: 'Manrope', sans-serif; max-width: 520px; margin: 0 auto; padding: 2rem; color: #2A1F1A;">
            <div style="margin-bottom: 1.5rem;">
              <span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: #C97B5F; margin-right: 0.5rem;"></span>
              <span style="font-weight: 500; color: #2D4A3E;">Hechtingtest</span>
            </div>

            <h1 style="font-size: 2rem; font-weight: 400; line-height: 1.1; margin-bottom: 1rem;">
              Hoi ${profiel.naam},<br><em>ik ben Luna.</em>
            </h1>

            <p style="color: #6B5D52; line-height: 1.65; margin-bottom: 1rem;">
              Jouw persoonlijke hechtingscoach staat klaar. Ik ken je ${profiel.stijl.toLowerCase()} al — en ik ben er om je te helpen begrijpen waarom je voelt wat je voelt in relaties.
            </p>

            <p style="color: #6B5D52; line-height: 1.65; margin-bottom: 1.5rem;">
              Je hebt <strong>10 berichten per dag</strong>. Bewust zo gehouden — één goed gesprek verandert meer dan tien oppervlakkige.
            </p>

            <a href="${coachUrl}" style="display: inline-block; background: #2D4A3E; color: #FAF6EE; padding: 1rem 2rem; border-radius: 999px; text-decoration: none; font-weight: 600; font-size: 1rem; margin-bottom: 2rem;">
              Start gesprek met Luna →
            </a>

            <div style="background: #F4EFE6; border-radius: 14px; padding: 1.25rem; margin-bottom: 1.5rem;">
              <p style="font-size: 0.875rem; color: #2A1F1A; font-weight: 600; margin-bottom: 0.5rem;">Jouw proefperiode</p>
              <p style="font-size: 0.875rem; color: #6B5D52; line-height: 1.6; margin: 0;">
                De eerste <strong>3 dagen zijn gratis</strong>. Daarna wordt automatisch <strong>€14,99 per maand</strong> afgeschreven via de betaalmethode die je hebt opgegeven.<br><br>
                Wil je niet verder? Stuur dan vóór ${new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long' })} een mail naar <a href="mailto:info@hechtingstest.nl" style="color: #2D4A3E;">info@hechtingstest.nl</a> en je abonnement wordt direct stopgezet. Geen vragen, geen gedoe.
              </p>
            </div>

            <p style="font-size: 0.75rem; color: #6B5D52; line-height: 1.6; border-top: 1px solid rgba(42,31,26,0.08); padding-top: 1rem;">
              Bewaar deze mail — de link hierboven is jouw persoonlijke toegang tot Luna. Opzeggen kan altijd via <a href="mailto:info@hechtingstest.nl" style="color: #2D4A3E;">info@hechtingstest.nl</a>.
            </p>
          </div>
        `
      });

    } else if (type === 'coach_maandelijks') {
      // Maandelijkse verlenging — abonnement actief houden
      profiel.abonnementActief = true;
      profiel.laaatsteBetalingOp = new Date().toISOString();
      await store.set(profielKey, JSON.stringify(profiel));
    }

    return { statusCode: 200, body: 'OK' };

  } catch (err) {
    console.error('Webhook fout:', err);
    return { statusCode: 500, body: 'Webhook fout: ' + err.message };
  }
};
