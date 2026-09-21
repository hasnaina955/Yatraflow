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
//   creator-fixture@example.com    — owns both publications
//   fixture-buyer-1/2/3@example.com — own the entitlement rows behind the sales
//   two trips + trip_members rows   — so `#/trip/<id>/share` (the publish
//                                     editor) has something to render
//   two publications                — ₹199 Kerala, ₹500 Goa (the two price
//                                     points the monetisation plan measured)
//   five orders + entitlements      — backdated, so the ledger is not one day
//
// SAFETY
//   * A plain run is a DRY RUN: it prints the plan and changes nothing. Add
//     `--apply` to write, `--clean` to remove the fixture's rows.
//   * It only touches rows it names: the fixture's own two trips, its two
//     publications, and the orders/entitlements pointing at them. The buyer and
//     creator accounts are shared with nothing else — they exist per fixture —
//     and `--clean` leaves them in place because deleting an auth user is an
//     admin-key operation this script will not do behind your back.
//   * The sales rows need elevation, and say so instead of failing quietly:
//     `entitlements` is SELECT-only for authenticated clients by design (the
//     only write path is the buyer-scoped `claim_paid_order` RPC), so the script
//     uses `SUPABASE_SERVICE_ROLE_KEY` or `PGCONN` when either is set — and when
//     neither is, prints the SQL to paste into the Supabase SQL editor rather
//     than half-seeding a creator with no sales.
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

// Publication ids are prefixed so `--clean` can find them without a lookup, and
// the run id keeps two concurrent fixtures from colliding on the slug (the id IS
// the primary key).
const RUN = randomBytes(3).toString('hex')

const PUBLICATIONS = [
  {
    id: `pub-fixture-kerala-${RUN}`,
    title: 'Kerala Backwaters & Hills (fixture)',
    tagline: 'The fixture publication — priced ₹199',
    priceInr: 199,
    tripName: 'Fixture · Kerala backwaters',
    days: keralaDays(),
  },
  {
    id: `pub-fixture-goa-${RUN}`,
    title: 'Goa Coast in Four Days (fixture)',
    tagline: 'The fixture publication — priced ₹500',
    priceInr: 500,
    tripName: 'Fixture · Goa coast',
    days: goaDays(),
  },
]

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
}

function printSqlFallback(creatorId, buyerIds, pubIds, orderIds) {
  const rows = SALES.map((s, i) => {
    const grantedAt = new Date(Date.now() - s.daysAgo * 86_400_000).toISOString()
    return `  ('${orderIds[i]}', '${buyerIds[s.buyer]}', '${pubIds[s.pub]}', 'fixture_order_${i}_${RUN}', ${s.amountInr}, ${s.amountInr}, 'paid', '${grantedAt}', '${grantedAt}')`
  }).join(',\n')
  const ents = SALES.map((s, i) => {
    const grantedAt = new Date(Date.now() - s.daysAgo * 86_400_000).toISOString()
    return `  (gen_random_uuid(), '${grantedAt}', '${buyerIds[s.buyer]}', '${pubIds[s.pub]}', '${orderIds[i]}', ${s.amountInr})`
  }).join(',\n')
  console.log(`\n${YELLOW}No SUPABASE_SERVICE_ROLE_KEY and no PGCONN — paste this into the Supabase SQL editor.${OFF}
It is the same five sales the script would have written (creator ${creatorId}).

-- 1. orders
insert into public.purchase_orders
  (id, user_id, pub_id, razorpay_order_id, amount_inr, price_snapshot_inr, status, created_at, paid_at)
values
${rows};

-- 2. entitlements (the ledger reads these)
insert into public.entitlements (id, granted_at, user_id, pub_id, order_id, amount_paid_inr)
values
${ents};
`)
}

// ------------------------------------------------------------------- actions
async function apply() {
  const creator = await sessionFor(CREATOR)
  console.log(`${GREEN}creator ready${OFF} ${CREATOR.email} (${creator.userId})`)

  // Creator mode, or the hub renders the "become a creator" card instead of the
  // ledger — the same flag the Profile page flips.
  const { error: profErr } = await creator.sb.from('profiles')
    .update({ is_creator: true, creator_bio: 'Fixture account — seeded by scripts/seedCreatorFixture.mjs so the money surfaces can be looked at.' })
    .eq('id', creator.userId)
  if (profErr) throw new Error(`profiles: ${profErr.message}`)

  const buyers = []
  for (const b of BUYERS) {
    const s = await sessionFor(b)
    buyers.push(s.userId)
    console.log(`${GREEN}buyer ready${OFF}   ${b.email} (${s.userId})`)
  }

  const trips = []
  for (const p of PUBLICATIONS) {
    const row = tripRow(p)
    await insertAsUser(creator.sb, 'trips', [row])
    // Without a membership row the creator cannot read their own trip back
    // (every trip read goes through trip_members), and the publish editor
    // renders "trip not found".
    await insertAsUser(creator.sb, 'trip_members', [{ trip_id: row.id, user_id: creator.userId, role: 'owner', joined_at: Date.now() }])
    trips.push(row)
    console.log(`${GREEN}trip${OFF}   ${row.id}  ${row.name}`)
  }

  for (let i = 0; i < PUBLICATIONS.length; i++) {
    const p = PUBLICATIONS[i]
    const t = trips[i]
    await insertAsUser(creator.sb, 'published_itineraries', [{
      id: p.id, trip_id: t.id, creator_id: creator.userId,
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

  const sql = await makeSqlRunner()
  if (!sql) {
    printSqlFallback(creator.userId, buyers, PUBLICATIONS.map(p => p.id), SALES.map(() => randomUUID()))
  } else {
    const orderIds = SALES.map(() => randomUUID())
    await sql.insert('purchase_orders', SALES.map((s, i) => {
      const at = new Date(Date.now() - s.daysAgo * 86_400_000).toISOString()
      return {
        id: orderIds[i], user_id: buyers[s.buyer], pub_id: PUBLICATIONS[s.pub].id,
        razorpay_order_id: `fixture_order_${i}_${RUN}`,
        amount_inr: s.amountInr, price_snapshot_inr: s.amountInr,
        status: 'paid', created_at: at, paid_at: at,
      }
    }))
    await sql.insert('entitlements', SALES.map((s, i) => ({
      granted_at: new Date(Date.now() - s.daysAgo * 86_400_000).toISOString(),
      user_id: buyers[s.buyer], pub_id: PUBLICATIONS[s.pub].id,
      order_id: orderIds[i], amount_paid_inr: s.amountInr,
    })))
    console.log(`${GREEN}${SALES.length} sales written${OFF} (orders + entitlements, backdated)`)
  }

  console.log(`
${DIM}-------------------------------------------------------------${OFF}
Open the app and sign in as the creator:

  creator:  ${CREATOR.email}
  password: ${PASSWORD}

  http://localhost:5173/#/creator-hub                       the earnings ledger, the fee column,
                                                            the Gross/Net switch, the payout card
                                                            and the payout-runs ledger
  http://localhost:5173/#/trip/${trips[0]?.id}/share        the publish editor for a ₹${PUBLICATIONS[0].priceInr} plan
  http://localhost:5173/#/creator                             the public creator page

Expected ledger: gross ₹${EXPECTED.grossInr.toLocaleString('en-IN')} · fee ₹${EXPECTED.feeInr.toLocaleString('en-IN')} · net ₹${EXPECTED.netInr.toLocaleString('en-IN')}
(If the rendered ledger disagrees, the ladder and the surface have drifted apart —
 tests/earnings.test.ts pins these same five sales.)

An admin account also sees them in the console's revenue row at #/admin → Analytics.
Remove the fixture with:  node scripts/seedCreatorFixture.mjs --clean
`)
}

async function clean() {
  const sql = await makeSqlRunner()
  if (!sql) {
    console.error(`${RED}--clean needs SUPABASE_SERVICE_ROLE_KEY or PGCONN${OFF} — without elevation this script cannot
delete the entitlement rows, and deleting only the publications would leave the
creator's ledger reading sales for plans that no longer exist.`)
    process.exit(2)
  }
  const creator = await sessionFor(CREATOR)
  const { data: pubs } = await creator.sb.from('published_itineraries').select('id, trip_id').eq('creator_id', creator.userId)
  const mine = (pubs ?? []).filter(p => String(p.id).includes('-fixture-'))
  if (mine.length === 0) {
    console.log('nothing to clean — no fixture publications on this account')
    return
  }
  const pubIds = mine.map(p => p.id)
  const tripIds = mine.map(p => p.trip_id)
  // Sales first: entitlements and orders reference the publication, and the FK
  // would refuse the delete the other way round.
  await sql.remove('entitlements', 'pub_id', pubIds)
  await sql.remove('purchase_orders', 'pub_id', pubIds)
  const del = await creator.sb.from('published_itineraries').delete().in('id', pubIds)
  if (del.error) throw new Error(`published_itineraries: ${del.error.message}`)
  const delTrips = await creator.sb.from('trips').delete().in('id', tripIds)
  if (delTrips.error) throw new Error(`trips: ${delTrips.error.message}`)
  console.log(`${GREEN}cleaned${OFF} ${pubIds.length} publication(s) and ${tripIds.length} trip(s); the accounts remain (deleting an auth user needs the admin API).`)
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
accounts, trips and publications and then print the SQL for the sales rows
(entitlements have no authenticated write path by design).`)
  }
}
