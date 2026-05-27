import fs from 'node:fs';
import PocketBase from 'pocketbase';

const sourcePath = process.argv[2] || process.env.DEFAULT_QUESTIONS_JSON || '/home/asi/Hämtningar/domande.json';
const PB_URL = process.env.PB_URL || process.env.POCKETBASE_URL || process.env.VITE_POCKETBASE_URL;
const PB_ADMIN_EMAIL = process.env.PB_ADMIN_EMAIL || process.env.POCKETBASE_ADMIN_EMAIL;
const PB_ADMIN_PASSWORD = process.env.PB_ADMIN_PASSWORD || process.env.POCKETBASE_ADMIN_PASSWORD;

if (!PB_URL || !PB_ADMIN_EMAIL || !PB_ADMIN_PASSWORD) {
  throw new Error('Missing PocketBase credentials');
}

function escapeFilter(value) {
  return String(value || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function normalize(entry) {
  const question = {
    externalId: String(entry?.id || entry?.externalId || '').slice(0, 64),
    IT: String(entry?.IT || entry?.it || '').trim().slice(0, 500),
    EN: String(entry?.EN || entry?.en || '').trim().slice(0, 500),
    SV: String(entry?.SV || entry?.sv || '').trim().slice(0, 500),
    active: true,
  };
  if (!question.IT || !question.EN || !question.SV) return null;
  return question;
}

const parsed = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));
const questions = (Array.isArray(parsed) ? parsed : parsed.questions).map(normalize).filter(Boolean);

const pb = new PocketBase(PB_URL);
pb.autoCancellation(false);
await pb.collection('_superusers').authWithPassword(PB_ADMIN_EMAIL, PB_ADMIN_PASSWORD);

let imported = 0;
for (const question of questions) {
  const existing = await pb.collection('icebreaker_questions').getList(1, 1, {
    filter: `IT="${escapeFilter(question.IT)}" && EN="${escapeFilter(question.EN)}" && SV="${escapeFilter(question.SV)}"`,
  });
  if (existing.items[0]) {
    await pb.collection('icebreaker_questions').update(existing.items[0].id, question);
  } else {
    await pb.collection('icebreaker_questions').create(question);
  }
  imported += 1;
}

console.log(JSON.stringify({ ok: true, sourcePath, imported }, null, 2));
