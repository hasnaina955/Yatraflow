// Cleanup pass: removes rows left by integration runs (prefix `rls_`).
// Run from the repo root:  node scripts/integration/cleanupHarness.mjs [name-like]
// Owner member row is seeded first so is_editor-gated deletes actually match.
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const env = new Map();
try {
  for (const line of readFileSync(resolve('.env.local'), 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) env.set(m[1], m[2].trim().replace(/^["']|["']$/g, ''));
  }
} catch { /* process.env only */ }
const envv = (k) => process.env[k] ?? env.get(k) ?? '';

const U1 = createClient(envv('VITE_SUPABASE_URL'), envv('VITE_SUPABASE_ANON_KEY'));
const auth = await U1.auth.signInWithPassword({ email: envv('TEST_USER1_EMAIL'), password: envv('TEST_USER1_PASS') });
if (auth.error) { console.log('FATAL: no session for cleanup pass:', auth.error.message); process.exit(1); }

const like = process.argv[2] ?? 'rls_%';
const found = await U1.from('trips').select('id, name').like('name', like);
if (found.error) { console.log('FATAL: cannot list leftovers:', found.error.message); process.exit(1); }
console.log('leftover trips:', found.data.length);
for (const t of found.data) {
  // seed is_editor evidence (INSERT policy allows self/owner), then delete
  const seed = await U1.from('trip_members').insert({ trip_id: t.id, user_id: (await U1.auth.getUser()).data.user.id, role: 'owner' });
  if (seed.error) console.log('  seed note:', t.id, seed.error.code);
  const g = await U1.from('published_itineraries').delete().eq('trip_id', t.id);
  if (g.error) console.log('  gallery note:', g.error.code);
  const d = await U1.from('trips').delete().eq('id', t.id);
  console.log('  deleted', t.id, d.error ? 'FAILED ' + d.error.code : 'ok');
}
const after = await U1.from('trips').select('id').like('name', like);
console.log('remaining:', after.data.length, '| done');
