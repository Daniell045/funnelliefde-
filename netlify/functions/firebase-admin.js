const admin = require('firebase-admin');

let db;

function getDb() {
  // Als de database al is geïnitieerd, geef deze dan direct terug
  if (db) return db;

  if (!admin.apps.length) {
    const privateKey = process.env.FIREBASE_PRIVATE_KEY;
    
    // Veiligheidscheck voor het geval de omgevingsvariabelen (lokaal) ontbreken
    if (!privateKey) {
      throw new Error("Missing FIREBASE_PRIVATE_KEY environment variable.");
    }

    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        // Netlify slaat \n op als letterlijke \n in env vars — dit fixt dat
        privateKey: privateKey.replace(/\\n/g, '\n'),
      }),
      databaseURL: process.env.FIREBASE_DATABASE_URL,
    });
  }

  // Koppel de Realtime Database instantie aan onze globale variabele
  db = admin.database();
  return db;
}

// Helpers die de Netlify Blobs API nabootsen maar Firebase gebruiken

async function dbGet(path) {
  const snap = await getDb().ref(path).once('value');
  return snap.exists() ? snap.val() : null;
}

async function dbSet(path, data) {
  await getDb().ref(path).set(data);
}

async function dbUpdate(path, data) {
  await getDb().ref(path).update(data);
}

module.exports = { getDb, dbGet, dbSet, dbUpdate };
