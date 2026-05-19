const admin = require('firebase-admin');

let db;

function getDb() {
  if (db) return db;

  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        // Netlify slaat \n op als letterlijke \n in env vars — dit fixt dat
        privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      }),
      databaseURL: process.env.FIREBASE_DATABASE_URL,
    });
  }

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
