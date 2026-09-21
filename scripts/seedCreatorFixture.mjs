#!/usr/bin/env node
// ============================================================================
// YatraFlow — local creator fixture (M7 surfaces)
// ============================================================================
// WHY THIS EXISTS
//   The Earnings tab, the payout-runs ledger and the publish editor need a
//   creator with REAL sales behind them. A node test cannot supply that — the
//   suite is a no-DOM environment with no session — so the arithmetic is pinned
//   by `tests/earnings.test.ts` while the RENDERING of those surfaces was never
//   checked by anything at all. This script builds the account they need, and
//   prints the credentials and deep links so they can be looked at.
//
//   The five sales below are not decorative: they are the same five rows that
//   `tests/earnings.test.ts` pins the ledger arithmetic against ("prices the
//   local creator fixture's sales plan"), so the numbers on screen have an
//   answer key that CI keeps honest — gross ₹26,046 · fee ₹3,855 · net ₹22,191.
//   They deliberately span the ladder (one ₹25,000 sale carries most of the
//   15% tier) and several Fridays (so the runs ledger has past, present and
//   under-minimum rows).
//
// WHAT IT CREATES
//   creator-fixture@example.com    — owns the two creator publications
//   admin-fixture@example.com      — promoted to `masteradmin`, and a creator
//                                     in its own right, so the CONSOLE has a
//                                     second payee to ladder the fee against
//   fixture-buyer-1/2/3@example.com — own the entitlement rows behind the sales
//   four trips + trip_members rows  — so `#/trip/<id>/share` (the publish
//                                     editor) has something to render
//   three publications              — ₹199 Kerala and ₹500 Goa (the two price
//                                     points the monetisation plan measured),
//                                     plus the admin's ₹12,000 Spiti circuit
//   seven orders + entitlements     — backdated, so the ledgers are not one day
//
// WHY A SECOND CREATOR, NOT JUST AN ADMIN: one creator exercises a ledger; two
// exercise the CONSOLE. The platform fee is charged PER CREATOR, so with a
// single payee the console's figure and one ladder over the platform total are
// the SAME number and the console's own correctness is invisible. Two payees
// make it explicit and pinnable — ₹6,855 charged, where one shared ladder over
// the same ₹46,046 would claim ₹5,855. `tests/admin.test.ts` asserts both, and
// the console's prose names the creator count, so the difference is on screen.
//
// SAFETY
//   * A plain run is a DRY RUN: it prints the plan and changes nothing. Add
//     `--apply` to write, `--clean` to remove the fixture's rows.
//   * It only touches rows it names: the fixture's own four trips, its three
//     publications, and the orders/entitlements pointing at them. The buyer,
//     creator and admin accounts are shared with nothing else — they exist per
//     fixture — and `--clean` leaves them (and the admin's role) in place,
//     because deleting an auth user, or unpromoting one, is an admin-key
//     operation this script will not perform behind your back.
//   * The sales rows need elevation, and say so instead of failing quietly:
//     `entitlements` is SELECT-only for authenticated clients by design (the
//     only write path is the buyer-scoped `claim_paid_order` RPC), so the script
//     uses `SUPABASE_SERVICE_ROLE_KEY` or `PGCONN` when either is set — and when
//     neither is, prints the SQL to paste into the Supabase SQL editor rather
//     than half-seeding a creator with no sales.
//   * Promoting the admin needs the same elevation for the same reason: the
//     role lives in the JWT's `app_metadata`, which only the admin API
//     (service role) or a raw `auth.users` write can set. There is deliberately
//     no `is_admin` column to flip — it would be self-grantable through the
//     "profiles update self" policy. Without elevation the script prints the
//     one statement instead of pretending the account is an admin.
//
// USAGE
//   node scripts/seedCreatorFixture.mjs                      # plan only
//   node scripts/seedCreatorFixture.mjs --apply              # create everything
//   node scripts/seedCreatorFixture.mjs --clean              # remove the rows
//
//   Then: npm run dev → http://localhost:5173/#/creator-hub and sign in as the
//   creator (see the credentials the script prints).
// ============================================================================

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { randomBytes } from 'node:crypto'

const GREEN = '\x1b[32m', RED = '\x1b[31m', YELLOW = '\x1b[33m', DIM = '\x1b[2m', OFF = '\x1b[0m'

// ---------------------------------------------------------------- env loading
// Same shape as scripts/integration/integrationHarness.mjs: `.env.local` first,
// then process.env overrides. One Map, no dynamic property access.
function loadEnv() {
  const env = new Map()
  try {
    for (const line of readFileSync(resolve('.env.local'), 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      if (!m) continue
      let v = m[2].trim()
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
      env.set(m[1], v)
    }
  } catch { /* no .env.local — process.env only */ }
  for (const [k, v] of Object.entries(process.env)) if (v !== undefined) env.set(k, v)
  return env
}

const dotenv = loadEnv()
const env = k => dotenv.get(k) ?? ''

const URL = env('VITE_SUPABASE_URL')
const ANON = env('VITE_SUPABASE_ANON_KEY')
const SERVICE = env('SUPABASE_SERVICE_ROLE_KEY')
const PGCONN = env('PGCONN')

const args = new Set(process.argv.slice(2))
const APPLY = args.has('--apply')
const CLEAN = args.has('--clean')

// ------------------------------------------------------------------- fixture
const PASSWORD = env('FIXTURE_PASSWORD') || 'yatraflow-fixture-2026'
const CREATOR = { email: env('FIXTURE_CREATOR_EMAIL') || 'creator-fixture@example.com', pass: PASSWORD }
const BUYERS = [1, 2, 3].map(n => ({ email: `fixture-buyer-${n}@example.com`, pass: PASSWORD }))
// The console's operator, and a creator too: the second payee the per-creator
// fee rule needs to be visible at all (see WHY A SECOND CREATOR above).
const ADMIN = { email: env('FIXTURE_ADMIN_EMAIL') || 'admin-fixture@example.com', pass: PASSWORD }

// Publication ids are prefixed so `--clean` can find them without a lookup, and
// the run id keeps two concurrent fixtures from colliding on the slug (the id IS
// the primary key).
const RUN = randomBytes(3).toString('hex')

const PUBLICATIONS = [
  {
    id: `pub-fixture-kerala-${RUN}`,
    // `slug` is how a RE-RUN recognizes this publication again: publication ids
    // carry a fresh random RUN, so a second --apply would otherwise stack a
    // second Kerala beside the first. See `seedOwner`.
    slug: 'kerala',
    title: 'Kerala Backwaters & Hills (fixture)',
    tagline: 'The fixture publication — priced ₹199',
    priceInr: 199,
    tripName: 'Fixture · Kerala backwaters',
    days: keralaDays(),
  },
  {
    id: `pub-fixture-goa-${RUN}`,
    slug: 'goa',
    title: 'Goa Coast in Four Days (fixture)',
    tagline: 'The fixture publication — priced ₹500',
    priceInr: 500,
    tripName: 'Fixture · Goa coast',
    days: goaDays(),
  },
]

// The admin's own publication, so the second payee has something to sell. Its
// two sales are round numbers ON PURPOSE: ₹12,000 + ₹8,000 = ₹20,000 sits
// entirely inside the 15% tier, so the admin's fee is exactly ₹3,000 with no
// straddling arithmetic — which keeps the console's answer key (₹6,855) a
// statement about PER-CREATOR charging rather than about rounding.
const ADMIN_PUBLICATION = {
  id: `pub-fixture-spiti-${RUN}`,
  slug: 'spiti',
  title: 'Spiti Circuit, Seven Days (fixture · admin)',
  tagline: 'The admin fixture publication — priced ₹12,000',
  priceInr: 12_000,
  tripName: 'Fixture · Spiti circuit',
  days: spitiDays(),
}

const ADMIN_SALES = [
  { amountInr: 12_000, buyer: 0, daysAgo: 12 },
  { amountInr: 8_000, buyer: 1, daysAgo: 5 },
]

// The admin's ledger, and the console's, as the shipped ladder reads them.
const ADMIN_EXPECTED = { grossInr: 20_000, feeInr: 3_000, netInr: 17_000 }
const CONSOLE_EXPECTED = {
  grossInr: 46_046, feeInr: 6_855, netInr: 39_191, sales: 7, creators: 2,
  // What the WRONG rule would say: one ladder over the platform's whole gross
  // instead of one per creator. The console renders ₹6,855; this is the number
  // it must never show, and tests/admin.test.ts pins the two apart.
  oneSharedLadderFeeInr: 5_855,
}

// The sales plan, oldest first. Kept deliberately awkward: the ₹25,000 sale
// walks the ladder's line, and the ₹149 sale leaves a net under the ₹500
// minimum so one run reads "rolls over". buyerIndex must be unique per
// publication — the table enforces one unlock per (buyer, publication) forever.
const SALES = [
  { pub: 0, buyer: 0, amountInr: 199, daysAgo: 30 },
  { pub: 0, buyer: 1, amountInr: 499, daysAgo: 21 },
  { pub: 1, buyer: 0, amountInr: 149, daysAgo: 9 },
  { pub: 1, buyer: 1, amountInr: 25_000, daysAgo: 3 },
  { pub: 0, buyer: 2, amountInr: 199, daysAgo: 0 },
]

/** ₹Expected ledger, from the shipped ladder — pinned in tests/earnings.test.ts. */
const EXPECTED = { grossInr: 26_046, feeInr: 3_855, netInr: 22_191 }

// ------------------------------------------------------------- trip contents
// Minimal but VALID ItineraryDay/ItineraryStop shapes (src/data/types.ts): the
// publish editor and the trip page render these, so the fixture cannot get away
// with an empty days array — it would prove nothing about either surface.
function stop(dayIdx, order, over) {
  return {
    id: `fx-${dayIdx}-${order}`,
    title: over.title,
    category: over.category ?? 'sightseeing',
    locationName: over.locationName ?? '',
    lat: over.lat, lng: over.lng,
    description: over.description ?? '',
    visitMinutes: over.visitMinutes ?? 90,
    openTime: over.openTime,
    closeTime: over.closeTime,
    entryFeeInrPerPerson: over.entryFeeInrPerPerson ?? 0,
    transportCostInrTotal: over.transportCostInrTotal ?? 0,
    priority: 'must-do',
    notes: '',
    status: 'confirmed',
    orderInDay: order,
    auto: false,
  }
}

function day(index, title, stops) {
  return { id: `fx-day-${index}`, index, title, startTime: '08:30', stops }
}

function keralaDays() {
  return [
    day(0, 'Kochi to Alleppey', [
      stop(0, 0, { title: 'Fort Kochi walk', locationName: 'Fort Kochi', lat: 9.9658, lng: 76.2421, category: 'sightseeing', entryFeeInrPerPerson: 0 }),
      stop(0, 1, { title: 'Backwater houseboat', locationName: 'Alleppey', lat: 9.4981, lng: 76.3388, category: 'nature', entryFeeInrPerPerson: 1200, description: 'Book the small boat, not the big one.' }),
    ]),
    day(1, 'Alleppey to Munnar', [
      stop(1, 0, { title: 'Tea estate walk', locationName: 'Munnar', lat: 10.0889, lng: 77.0595, category: 'nature', entryFeeInrPerPerson: 150 }),
      stop(1, 1, { title: 'Top Station viewpoint', locationName: 'Top Station', lat: 10.1143, lng: 77.2483, category: 'sightseeing' }),
    ]),
  ]
}

function goaDays() {
  return [
    day(0, 'Panaji to the north coast', [
      stop(0, 0, { title: 'Fontainhas lanes', locationName: 'Panaji', lat: 15.4989, lng: 73.8278, category: 'sightseeing' }),
      stop(0, 1, { title: 'Anjuna cliff sunset', locationName: 'Anjuna', lat: 15.5735, lng: 73.7405, category: 'beach' }),
    ]),
    day(1, 'Old Goa to the south', [
      stop(1, 0, { title: 'Basilica of Bom Jesus', locationName: 'Old Goa', lat: 15.5009, lng: 73.9116, category: 'temple' }),
      stop(1, 1, { title: 'Palolem beach shack', locationName: 'Palolem', lat: 15.0100, lng: 74.0233, category: 'food', entryFeeInrPerPerson: 600 }),
    ]),
  ]
}

/** The admin's trip. Same minimal-but-valid shape as the others: the publish
 *  editor and the public itinerary page render these, so an empty days array
 *  would prove nothing about either. */
function spitiDays() {
  return [
    day(0, 'Manali to Kaza over Kunzum', [
      stop(0, 0, { title: 'Atal Tunnel', locationName: 'Sissu', lat: 32.3620, lng: 77.2020, category: 'sightseeing' }),
      stop(0, 1, { title: 'Chandratal camp', locationName: 'Chandratal', lat: 32.4790, lng: 77.6150, category: 'nature', entryFeeInrPerPerson: 300 }),
    ]),
    day(1, 'Kaza and the high villages', [
      stop(1, 0, { title: 'Key Monastery', locationName: 'Kaza', lat: 32.2977, lng: 78.0122, category: 'temple', entryFeeInrPerPerson: 50 }),
      stop(1, 1, { title: 'Hikkim post office', locationName: 'Hikkim', lat: 32.2833, lng: 78.0333, category: 'sightseeing' }),
    ]),
  ]
}

/** The trips row, shaped exactly as the store writes it (src/data/types.ts Trip). */
function tripRow(pub) {
  return {
    id: randomUUID(),
    name: pub.tripName,
    start_location: pub.days[0].stops[0].locationName,
    start_location_coords: { lat: pub.days[0].stops[0].lat, lng: pub.days[0].stops[0].lng },
    destinations: pub.days.flatMap(d => d.stops.slice(1).map(s => s.locationName)),
    start_date: '', end_date: '',
    travellers: 2, transport_mode: 'car',
    budget_per_person_inr: 25_000, travel_style: 'balanced',
    stay_style: 'comfort',
    fixed_commitments: [], days: pub.days, expenses: [],
    cover_emoji: '🧭',
    visibility: 'public',
    created_at: Date.now(), updated_at: Date.now(),
  }
}

function randomUUID() {
  return crypto.randomUUID()
}

// ------------------------------------------------------------------- clients
function anonClient() {
  return createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } })
}

/** Sign in, or sign up then sign in — the harness's own idiom. Signup is
 *  best-effort: an existing account answers "already registered", which is not
 *  a failure here. */
async function sessionFor(who) {
  const sb = anonClient()
  await sb.auth.signUp({ email: who.email, password: who.pass }).catch(() => {})
  const { data, error } = await sb.auth.signInWithPassword({ email: who.email, password: who.pass })
  if (error) throw new Error(`${who.email}: ${error.message}`)
  return { sb, userId: data.user.id }
}

// --------------------------------------------------------------- write paths
// Trips, members and publications go through the caller's OWN session, which is
// the point: those writes are exactly the ones a real creator makes, and RLS
// (`published write`: creator_id = auth.uid()) is what authorizes them. Only the
// sales need elevation, because `entitlements` has no authenticated write path.
async function insertAsUser(sb, table, rows) {
  const { error } = await sb.from(table).insert(rows)
  if (error) throw new Error(`${table}: ${error.message}`)
}

/**
 * The elevated writer the sales need, over whichever elevation the machine
 * already has: the service-role REST client, or a `pg` connection (`PGCONN`, the
 * same env var `scripts/apply-schema.mjs` uses). One interface, two transports,
 * so the fixture does not care which one is available.
 *
 * `jsonb_populate_recordset` writes any of these shapes from the same JSON the
 * REST path posts, so the `pg` branch is a single statement rather than a
 * hand-built column list that would drift from the tables.
 */
async function makeSqlRunner() {
  if (SERVICE) {
    const svc = createClient(URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } })
    return {
      async insert(table, rows) {
        const { error } = await svc.from(table).insert(rows)
        if (error) throw new Error(`${table}: ${error.message}`)
      },
      async remove(table, column, values) {
        const { error } = await svc.from(table).delete().in(column, values)
        if (error) throw new Error(`${table}: ${error.message}`)
      },
    }
  }
  if (PGCONN) {
    const { Client } = await import('pg')
    const client = new Client({ connectionString: PGCONN, ssl: { rejectUnauthorized: false } })
    await client.connect()
    return {
      async insert(table, rows) {
        await client.query(
          `insert into public.${table} select * from jsonb_populate_recordset(null::public.${table}, $1::jsonb)`,
          [JSON.stringify(rows)],
        )
      },
      async remove(table, column, values) {
        await client.query(`delete from public.${table} where ${column} = any($1)`, [values])
      },
    }
  }
  return null
}

// ------------------------------------------------------------------ the plan
function printPlan() {
  console.log(`\n${DIM}YatraFlow creator fixture — ${APPLY ? 'APPLY' : 'DRY RUN'}${OFF}`)
  console.log(`project: ${URL}`)
  console.log(`creator: ${CREATOR.email}`)
  console.log(`buyers:  ${BUYERS.map(b => b.email).join(', ')}\n`)
  console.log('publications')
  for (const p of PUBLICATIONS) console.log(`  ${p.id}  ₹${p.priceInr}  ${p.title}`)
  console.log('\nsales (oldest first)')
  for (const s of SALES) {
    console.log(`  ${String(s.daysAgo).padStart(3)}d ago  ₹${String(s.amountInr).padStart(6)}  ${PUBLICATIONS[s.pub].title}  ← ${BUYERS[s.buyer].email}`)
  }
  console.log(`\nexpected ledger (shipped ladder, pinned in tests/earnings.test.ts)`)
  console.log(`  gross ₹${EXPECTED.grossInr.toLocaleString('en-IN')} · fee ₹${EXPECTED.feeInr.toLocaleString('en-IN')} · net ₹${EXPECTED.netInr.toLocaleString('en-IN')}`)
  console.log(`\nadmin`)
  console.log(`  ${ADMIN.email}  → ${ADMIN_PUBLICATION.id}  ₹${ADMIN_PUBLICATION.priceInr.toLocaleString('en-IN')}  ${ADMIN_PUBLICATION.title}`)
  console.log(`  to be promoted to masteradmin (JWT app_metadata role)`)
  console.log(`  its own ledger: gross ₹${ADMIN_EXPECTED.grossInr.toLocaleString('en-IN')} · fee ₹${ADMIN_EXPECTED.feeInr.toLocaleString('en-IN')} · net ₹${ADMIN_EXPECTED.netInr.toLocaleString('en-IN')}`)
  console.log('  its sales:')
  for (const s of ADMIN_SALES) {
    console.log(`    ${String(s.daysAgo).padStart(3)}d ago  ₹${String(s.amountInr).padStart(6)}  ${ADMIN_PUBLICATION.title}  ← ${BUYERS[s.buyer].email}`)
  }
  console.log(`\nexpected CONSOLE revenue (#/admin → Analytics, all sales, pinned in tests/admin.test.ts)`)
  console.log(`  gross ₹${CONSOLE_EXPECTED.grossInr.toLocaleString('en-IN')} · fee ₹${CONSOLE_EXPECTED.feeInr.toLocaleString('en-IN')} · net ₹${CONSOLE_EXPECTED.netInr.toLocaleString('en-IN')} · ${CONSOLE_EXPECTED.sales} sales · ${CONSOLE_EXPECTED.creators} creators`)
  console.log(`  the fee MUST be ₹${CONSOLE_EXPECTED.feeInr.toLocaleString('en-IN')}, not ₹${CONSOLE_EXPECTED.oneSharedLadderFeeInr.toLocaleString('en-IN')}`)
  console.log(`  ${DIM}(one shared ladder over the platform total is the wrong answer — the tier follows each creator's own gross)${OFF}`)
}/**
 * The order + entitlement ROWS for one owner's sale plan.
 *
 * ONE builder, consumed by both transports — the elevated REST/pg writer and the
 * SQL the fallback prints — so a machine with a service key and a machine
 * without one cannot end up describing different ledgers. (Building the row
 * shape twice is exactly how the two would drift the first time a column
 * moved.) `pubIndex` says which publication a plan's sale belongs to: `s.pub`
 * when the owner has several, a constant when they have one.
 */
function saleRows(plan, pubIds, pubIndex, buyerIds, orderIds) {
  const at = s => new Date(Date.now() - s.daysAgo * 86_400_000).toISOString()
  return plan.map((s, i) => ({
    order: {
      id: orderIds[i], user_id: buyerIds[s.buyer], pub_id: pubIds[pubIndex(s)],
      razorpay_order_id: `fixture_order_${i}_${RUN}`,
      amount_inr: s.amountInr, price_snapshot_inr: s.amountInr,
      status: 'paid', created_at: at(s), paid_at: at(s),
    },
    // `id` is left to the column default: the elevated path lets the database
    // mint it too, so both transports leave it out for the same reason.
    entitlement: {
      granted_at: at(s), user_id: buyerIds[s.buyer], pub_id: pubIds[pubIndex(s)],
      order_id: orderIds[i], amount_paid_inr: s.amountInr,
    },
  }))
}

/**
 * One insert statement from row objects, naming its columns from the objects
 * themselves — so a pasted seed cannot name a column the elevated path stopped
 * writing, and the two cannot disagree about the ledger's shape.
 */
function insertSql(table, rows) {
  const cols = Object.keys(rows[0])
  const lit = v => (typeof v === 'number' ? String(v) : `'${v}'`)
  return `insert into public.${table} (${cols.join(', ')})\nvalues\n`
    + rows.map(r => `  (${cols.map(c => lit(r[c])).join(', ')})`).join(',\n') + ';'
}

/**
 * The statement that makes the admin an admin — the ONLY way, since the role
 * lives in the JWT's `app_metadata` and no `is_admin` column exists to flip
 * (one would be self-grantable through "profiles update self").
 *
 * It MERGES (`||`) rather than replaces, which is the opposite of what
 * `auth.admin.updateUserById` does above: a real account can carry other
 * app_metadata, and a fixture statement pasted against the wrong email would
 * silently drop it. `coalesce` because `null::jsonb || '{…}'` is not something
 * to be clever about.
 */
function adminPromotionSql(email) {
  return `update auth.users
   set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"role":"masteradmin"}'::jsonb
 where email = '${email}';`
}

function printSqlFallback({ creatorId, adminId, buyerIds, creatorPubIds, adminPubIds, creatorOrderIds, adminOrderIds }) {
  const rows = [
    ...saleRows(SALES, creatorPubIds, s => s.pub, buyerIds, creatorOrderIds),
    ...saleRows(ADMIN_SALES, adminPubIds, () => 0, buyerIds, adminOrderIds),
  ]
  const orders = insertSql('purchase_orders', rows.map(r => r.order))
  const ents = insertSql('entitlements', rows.map(r => r.entitlement))
  console.log(`\n${YELLOW}No SUPABASE_SERVICE_ROLE_KEY and no PGCONN — paste this into the Supabase SQL editor,\nthen sign out and back in (the admin role lives in the JWT, so a fresh one is needed).${OFF}

-- 1. the admin's role (account ${adminId})
${adminPromotionSql(ADMIN.email)}

-- 2. orders — ${SALES.length} for creator ${creatorId}, ${ADMIN_SALES.length} for admin ${adminId}
${orders}

-- 3. entitlements (the ledgers read these)
${ents}
`)
}

// ------------------------------------------------------------------- actions
/**
 * One owner's account, trips and publications.
 *
 * Extracted so the creator and the admin go through the SAME code. The admin's
 * publication is not a special case, and a second copy of this loop is how the
 * two would drift — the admin's trip would stop getting its `trip_members` row,
 * say, and their publish editor would render "trip not found" while the
 * creator's kept working.
 *
 * Every write here goes through the owner's OWN session, which is the point:
 * those are exactly the writes a real creator makes, and RLS
 * (`published write`: creator_id = auth.uid()) is what authorizes them.
 */
async function seedOwner(who, pubs, label) {
  const owner = await sessionFor(who)
  console.log(`${GREEN}${label} ready${OFF} ${who.email} (${owner.userId})`)

  // Creator mode, or the hub renders the "become a creator" card instead of the
  // ledger — the same flag the Profile page flips. The admin wants it too: the
  // console is not their only surface, and their own sales should be readable.
  const { error: profErr } = await owner.sb.from('profiles')
    .update({ is_creator: true, creator_bio: 'Fixture account — seeded by scripts/seedCreatorFixture.mjs so the money surfaces can be looked at.' })
    .eq('id', owner.userId)
  if (profErr) throw new Error(`profiles: ${profErr.message}`)

  // A RE-RUN must not double the fixture. Publication ids carry a fresh random
  // RUN, so without this a second --apply would create a second set of trips and
  // publications and then point the sales at the new ids, leaving the old ones
  // behind — the ledgers would read right and the account would quietly hold
  // two of everything. Reuse what is already there, matched by slug.
  const { data: already } = await owner.sb.from('published_itineraries').select('id, title').eq('creator_id', owner.userId)
  const existing = (already ?? []).filter(p => String(p.id).includes('-fixture-'))
  if (existing.length > 0) {
    const pubIds = pubs.map(p => {
      const found = existing.find(e => String(e.id).includes(`-${p.slug}-`))
      if (!found) throw new Error(`${label}: has fixture publications but none matching "${p.slug}" — run --clean first`)
      return String(found.id)
    })
    console.log(`${YELLOW}${label} is already seeded${OFF} — reusing ${pubIds.length} existing publication(s), creating nothing new.`)
    return { userId: owner.userId, sb: owner.sb, trips: [], pubIds }
  }

  const trips = []
  for (const p of pubs) {
    const row = tripRow(p)
    await insertAsUser(owner.sb, 'trips', [row])
    // Without a membership row the owner cannot read their own trip back
    // (every trip read goes through trip_members), and the publish editor
    // renders "trip not found".
    await insertAsUser(owner.sb, 'trip_members', [{ trip_id: row.id, user_id: owner.userId, role: 'owner', joined_at: Date.now() }])
    trips.push(row)
    console.log(`${GREEN}trip${OFF}   ${row.id}  ${row.name}`)
  }

  for (let i = 0; i < pubs.length; i++) {
    const p = pubs[i]
    const t = trips[i]
    await insertAsUser(owner.sb, 'published_itineraries', [{
      id: p.id, trip_id: t.id, creator_id: owner.userId,
      title: p.title, tagline: p.tagline,
      cover_image_url: null,
      route_summary: t.destinations,
      duration_days: p.days.length,
      estimated_budget_per_person_inr: 25_000,
      travel_style: 'balanced',
      best_season: 'Oct–Feb',
      travel_tips: ['Fixture data — safe to delete with --clean.'],
      warnings_and_assumptions: [],
      // Day 0 free, the rest behind the paywall: the shape every priced
      // publication in the plan uses, and what the publish editor edits.
      free_day_indexes: [0],
      premium_price_inr: p.priceInr,
      subscriber_cta: null,
      published_at: Date.now(), refreshed_at: Date.now(),
      views: 1_240, copies: 86,
    }])
    console.log(`${GREEN}publication${OFF} ${p.id}  ₹${p.priceInr}`)
  }

  return { userId: owner.userId, sb: owner.sb, trips, pubIds: pubs.map(p => p.id) }
}

/**
 * Give the admin the JWT role the console gates on.
 *
 * `auth.admin.updateUserById` REPLACES `app_metadata` rather than merging it —
 * harmless for a fresh fixture signup with nothing else in there, and the reason
 * the printed SQL fallback MERGES instead (`adminPromotionSql`): a statement
 * pasted against a real account must not drop the metadata it already has.
 *
 * Returns false when the machine has no service key: an anon client cannot set
 * another user's metadata at all, and seeding an account that silently fails the
 * console's gate would look like a broken console rather than a missing key.
 */
async function promoteAdmin(userId) {
  if (!SERVICE) return false
  const svc = createClient(URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } })
  const { error } = await svc.auth.admin.updateUserById(userId, { app_metadata: { role: 'masteradmin' } })
  if (error) throw new Error(`promote ${ADMIN.email}: ${error.message}`)
  return true
}

async function apply() {
  const buyers = []
  for (const b of BUYERS) {
    const s = await sessionFor(b)
    buyers.push(s.userId)
    console.log(`${GREEN}buyer ready${OFF}   ${b.email} (${s.userId})`)
  }

  const creator = await seedOwner(CREATOR, PUBLICATIONS, 'creator')
  const admin = await seedOwner(ADMIN, [ADMIN_PUBLICATION], 'admin')

  const promoted = await promoteAdmin(admin.userId)
  if (promoted) {
    console.log(`${GREEN}admin promoted${OFF} ${ADMIN.email} → masteradmin (sign OUT and back in: the role lives in the JWT)`)
  } else {
    console.log(`${YELLOW}admin NOT promoted${OFF} — no elevation, so the role cannot be set. Paste the statement below, then sign out and back in.`)
  }

  // The ids the publications actually landed on: the fresh ones on a first run,
  // the EXISTING rows on a re-run (seedOwner reports what it reused), so the
  // sales always point at what is really there.
  const creatorPubIds = creator.pubIds
  const adminPubIds = admin.pubIds
  const creatorOrderIds = SALES.map(() => randomUUID())
  const adminOrderIds = ADMIN_SALES.map(() => randomUUID())
  const sql = await makeSqlRunner()
  if (!sql) {
    printSqlFallback({
      creatorId: creator.userId, adminId: admin.userId, buyerIds: buyers,
      creatorPubIds, adminPubIds, creatorOrderIds, adminOrderIds,
    })
  } else {
    // The SAME `saleRows` the SQL fallback formats, so an elevated seed and a
    // pasted one describe one ledger.
    const rows = [
      ...saleRows(SALES, creatorPubIds, s => s.pub, buyers, creatorOrderIds),
      ...saleRows(ADMIN_SALES, adminPubIds, () => 0, buyers, adminOrderIds),
    ]
    await sql.insert('purchase_orders', rows.map(r => r.order))
    await sql.insert('entitlements', rows.map(r => r.entitlement))
    console.log(`${GREEN}${rows.length} sales written${OFF} (orders + entitlements, backdated)`)
  }

  console.log(`
${DIM}-------------------------------------------------------------${OFF}
Open the app and sign in as the creator:

  creator:  ${CREATOR.email}
  admin:    ${ADMIN.email}
  password: ${PASSWORD}

  http://localhost:5173/#/creator-hub                       the earnings ledger, the fee column,
                                                            the Gross/Net switch, the payout card
                                                            and the payout-runs ledger
  http://localhost:5173/#/trip/${trips[0]?.id}/share        the publish editor for a ₹${PUBLICATIONS[0].priceInr} plan
  http://localhost:5173/#/creator                             the public creator page

Expected ledger: gross ₹${EXPECTED.grossInr.toLocaleString('en-IN')} · fee ₹${EXPECTED.feeInr.toLocaleString('en-IN')} · net ₹${EXPECTED.netInr.toLocaleString('en-IN')}
(If the rendered ledger disagrees, the ladder and the surface have drifted apart —
 tests/earnings.test.ts pins these same five sales.)

The admin sees both creators' sales in the console at #/admin → Analytics (sign out
and back in first — the role lives in the JWT, not in a profile column):

  CONSOLE   gross ₹${CONSOLE_EXPECTED.grossInr.toLocaleString('en-IN')} · fee ₹${CONSOLE_EXPECTED.feeInr.toLocaleString('en-IN')} · net ₹${CONSOLE_EXPECTED.netInr.toLocaleString('en-IN')} · ${CONSOLE_EXPECTED.sales} sales · ${CONSOLE_EXPECTED.creators} creators
  admin's own ledger: gross ₹${ADMIN_EXPECTED.grossInr.toLocaleString('en-IN')} · fee ₹${ADMIN_EXPECTED.feeInr.toLocaleString('en-IN')} · net ₹${ADMIN_EXPECTED.netInr.toLocaleString('en-IN')}

The console's fee is the number that matters: ₹${CONSOLE_EXPECTED.feeInr.toLocaleString('en-IN')}, NOT ₹${CONSOLE_EXPECTED.oneSharedLadderFeeInr.toLocaleString('en-IN')}.
The fee is charged once per creator, so with a single payee that distinction is
invisible — which is why the fixture seeds two (tests/admin.test.ts pins both).

Two surfaces need their migrations before they can read anything: the console's
revenue row (20260921_admin_revenue.sql) and the hub's funnel
(20260921_pub_funnel_events.sql). Without them each names the read failure
rather than showing a zero it cannot vouch for.

Remove the fixture with:  node scripts/seedCreatorFixture.mjs --clean
`)
}

/** Remove one owner's fixture rows. Both owners go through this, so `--clean`
 *  cannot end up clearing the creator's publications while leaving the admin's
 *  sales behind (which would keep the console's revenue row populated by
 *  entitlements pointing at publications that no longer exist). */
async function cleanOwner(who, sql) {
  const owner = await sessionFor(who)
  const { data: pubs } = await owner.sb.from('published_itineraries').select('id, trip_id').eq('creator_id', owner.userId)
  const mine = (pubs ?? []).filter(p => String(p.id).includes('-fixture-'))
  if (mine.length === 0) {
    console.log(`${DIM}${who.email}: nothing to clean — no fixture publications on this account${OFF}`)
    return 0
  }
  const pubIds = mine.map(p => p.id)
  const tripIds = mine.map(p => p.trip_id)
  // Sales first: entitlements and orders reference the publication, and the FK
  // would refuse the delete the other way round.
  await sql.remove('entitlements', 'pub_id', pubIds)
  await sql.remove('purchase_orders', 'pub_id', pubIds)
  const del = await owner.sb.from('published_itineraries').delete().in('id', pubIds)
  if (del.error) throw new Error(`published_itineraries: ${del.error.message}`)
  const delTrips = await owner.sb.from('trips').delete().in('id', tripIds)
  if (delTrips.error) throw new Error(`trips: ${delTrips.error.message}`)
  console.log(`${GREEN}cleaned${OFF} ${who.email}: ${pubIds.length} publication(s), ${tripIds.length} trip(s)`)
  return pubIds.length
}

async function clean() {
  const sql = await makeSqlRunner()
  if (!sql) {
    console.error(`${RED}--clean needs SUPABASE_SERVICE_ROLE_KEY or PGCONN${OFF} — without elevation this script cannot
delete the entitlement rows, and deleting only the publications would leave every
ledger reading sales for plans that no longer exist.`)
    process.exit(2)
  }
  const cleaned = (await cleanOwner(CREATOR, sql)) + (await cleanOwner(ADMIN, sql))
  console.log(`${DIM}The accounts remain — and the admin keeps its role: unpromoting or deleting an
auth user is an admin-key operation, not something this script does quietly.${OFF}`)
  if (cleaned === 0) console.log(`${YELLOW}Nothing was removed.${OFF}`)
}

// -------------------------------------------------------------------- entry
if (!URL || !ANON) {
  console.error(`${RED}missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY${OFF} — copy .env.example to .env.local and fill them in.
Without them this script would have to guess the project, and a fixture is not
worth guessing about.`)
  process.exit(2)
}
if (/YOUR-PROJECT/.test(URL)) {
  console.error(`${RED}VITE_SUPABASE_URL still points at the .env.example template${OFF} — set the real project first.`)
  process.exit(2)
}

printPlan()

if (CLEAN) {
  await clean()
} else if (APPLY) {
  await apply()
} else {
  console.log(`\n${DIM}Dry run — nothing was written. Re-run with --apply to create it.${OFF}`)
  if (!SERVICE && !PGCONN) {
    console.log(`${YELLOW}Note:${OFF} no SUPABASE_SERVICE_ROLE_KEY and no PGCONN are set, so --apply will create the
accounts, trips and publications and then print the SQL for the rest: the sales
rows (entitlements have no authenticated write path by design) AND the admin's
promotion, because the role lives in the JWT's app_metadata and only the admin
API or a raw auth.users write can set it.`)
  }
}
