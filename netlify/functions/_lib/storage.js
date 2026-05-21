// Netlify Blobs storage layer met expliciete config
// Fix voor "environment has not been configured" error
const { getStore } = require('@netlify/blobs');

function getConfiguredStore(name) {
  const siteID = process.env.NETLIFY_SITE_ID;
  const token = process.env.NETLIFY_BLOBS_TOKEN;

  if (siteID && token) {
    return getStore({ name, siteID, token });
  }
  return getStore(name);
}

function parsePath(path) {
  const parts = path.split('/');
  if (parts.length < 2) {
    throw new Error(`Invalid path "${path}" - expected "collection/id"`);
  }
  const collection = parts[0];
  const key = parts.slice(1).join('/');
  return { store: getConfiguredStore(collection), key };
}

async function dbGet(path) {
  const { store, key } = parsePath(path);
  try {
    const val = await store.get(key, { type: 'json' });
    return val ?? null;
  } catch (err) {
    if (err.message?.includes('not found') || err.status === 404) return null;
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

async function isAlreadyProcessed(paymentId) {
  const marker = await dbGet(`processed/${paymentId}`);
  return marker !== null;
}

async function markProcessed(paymentId) {
  await dbSet(`processed/${paymentId}`, { at: Date.now() });
}

module.exports = { dbGet, dbSet, dbDelete, isAlreadyProcessed, markProcessed };
