import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const schemaPath = path.join(__dirname, '..', 'pocketbase', 'schema.json');

const PB_URL = process.env.PB_URL || process.env.POCKETBASE_URL;
const PB_ADMIN_EMAIL = process.env.PB_ADMIN_EMAIL || process.env.POCKETBASE_ADMIN_EMAIL;
const PB_ADMIN_PASSWORD = process.env.PB_ADMIN_PASSWORD || process.env.POCKETBASE_ADMIN_PASSWORD;

if (!PB_URL || !PB_ADMIN_EMAIL || !PB_ADMIN_PASSWORD) {
  throw new Error('Missing PocketBase schema credentials');
}

async function auth() {
  const response = await fetch(`${PB_URL}/api/collections/_superusers/auth-with-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      identity: PB_ADMIN_EMAIL,
      password: PB_ADMIN_PASSWORD,
    }),
  });

  if (!response.ok) {
    throw new Error(`PocketBase auth failed: ${response.status} ${await response.text()}`);
  }

  return response.json();
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

async function fetchCollections(token) {
  const response = await fetch(`${PB_URL}/api/collections?perPage=200`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    throw new Error(`Fetch collections failed: ${response.status} ${await response.text()}`);
  }

  const payload = await response.json();
  return payload.items;
}

async function createCollection(token, collection) {
  const response = await fetch(`${PB_URL}/api/collections`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(collection),
  });

  if (!response.ok) {
    throw new Error(`Create collection ${collection.name} failed: ${response.status} ${await response.text()}`);
  }

  return response.json();
}

async function updateCollection(token, collection) {
  const response = await fetch(`${PB_URL}/api/collections/${collection.id}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(collection),
  });

  if (!response.ok) {
    throw new Error(`Update collection ${collection.name} failed: ${response.status} ${await response.text()}`);
  }

  return response.json();
}

async function upsertCollection(token, collectionsByName, desired) {
  const existing = collectionsByName.get(desired.name);
  if (existing) {
    return updateCollection(token, { ...clone(existing), ...desired, id: existing.id });
  }
  return createCollection(token, desired);
}

async function main() {
  const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
  const { token } = await auth();
  const collections = await fetchCollections(token);
  const byName = new Map(collections.map((collection) => [collection.name, collection]));

  for (const collection of schema) {
    await upsertCollection(token, byName, collection);
  }

  console.log(JSON.stringify({ ok: true, collections: schema.map((collection) => collection.name) }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
