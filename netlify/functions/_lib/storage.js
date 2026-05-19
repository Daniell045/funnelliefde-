// Netlify Blobs storage layer
// Vervangt firebase-admin. Zelfde dbGet/dbSet interface zodat de rest
// van de code niet veranderd hoeft te worden.
//
// Path-conventie (precies zoals de Firebase calls):
//   sessions/<sessionId>      -> 1 sessie
//   couples/<token>           -> 1 couple
//   customerIndex/<customerId> -> mapping customerId -> sessionId
//   processed/<paymentId>     -> idempotency marker (true)

const { getStore } = require('@netlify/blobs');

// Splits "collection/id" -> { store, key }
function parsePath(path) {
  const parts = path.split('/');
  if (parts.length < 2) {
    throw new Error(`Invalid path "${path}" - expected "collection/id"`);
  }
  const collection = parts[0];
  const key = parts.slice(1).join('/'); // ondersteunt geneste keys
  return { store: getStore(collection), key };
}

async function dbGet(path) {
  const { store, key } = parsePath(path);
  try {
    // Probeer als JSON; valt terug op string als 't geen JSON is
    const val = await store.get(key, { type: 'json' });
    return val ?? null;
  } catch (err) {
    // Niet gevonden = null (zelfde gedrag als Firebase)
    if (err.message?.includes('not found') || err.status === 404) return null;
    // String waarde fallback (bv. customerIndex)
    try {
      const raw = await store.get(key);
      return raw ?? null;
    } catch {
      return null;
    }
  }
}

async function dbSet(path, value) {
  const { store, key } = parsePath(path);
  // Strings direct opslaan (customerIndex), objects als JSON
  if (typeof value === 'string') {
    await store.set(key, value);
  } else {
    await store.setJSON(key, value);
  }
  return value;
}

async function dbDelete(path) {
  const { store, key } = parsePath(path);
  await store.delete(key);
}

// Idempotency helper: returns true als deze payment al verwerkt is.
// Atomic-ish: we checken + zetten direct daarna. Bij race conditions
// kan het 2x doorlopen, maar de webhook zelf checkt ook nog reportSent.
async function isAlreadyProcessed(paymentId) {
  const marker = await dbGet(`processed/${paymentId}`);
  return marker !== null;
}

async function markProcessed(paymentId) {
  await dbSet(`processed/${paymentId}`, { at: Date.now() });
}

module.exports = { dbGet, dbSet, dbDelete, isAlreadyProcessed, markProcessed };
