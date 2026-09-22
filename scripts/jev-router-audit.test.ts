// ============ Jev router audit — development-time, not shipped ============
// Asks Jev (TypeSafe System One) which capability a given phrasing needs,
// then diffs that against what answerQuestion() actually routes to.
//
// Why this exists: tests/ai-routing.test.ts asserts reply.text *contains a string*,
// which proves the right handler ran but not that it was the right handler. This
// records where a second opinion disagrees with the deterministic route; it is not
// proof that either route is wrong.
//
// Deliberately does NOT re-implement the if-chain to predict the route — that is
// the "two truths drift apart" failure mode scripts/validate-itinerary.mjs warns
// about. The route is read back out of the handler's own output instead.
//
// ONE QUESTION PER REQUEST, on purpose. An earlier version batched 25 questions
// into one call with identical criteria differing only by a `requests[N]` index.
// It silently lost attribution: the first ~10 answered correctly, then the model
// collapsed and returned "none" for the last 20 regardless of content. Asking one
// phrasing per request removes the indirection entirely — state IS the phrasing.
//
// Skipped unless JEV_AUDIT=1, so `npm test` and `npm run verify` stay offline
// and deterministic.
//
//   JEV_AUDIT=1 npx vitest run scripts/jev-router-audit.test.ts
//
// Requires TYPESAFE_API_KEY in the environment. Read-only: makes no writes.

import { describe, it, expect } from 'vitest'
import { answerQuestion } from '../src/lib/ai'
import { seedData } from '../src/data/seed'
import type { Trip } from '../src/data/types'
import { CORPUS } from './jev-router-corpus'
import { HARVESTED, HARVESTED_PROVENANCE } from './jev-router-corpus-harvested'
import { INTENT_CRITERIA } from '../src/lib/jevTaxonomy'

const ENABLED = process.env.JEV_AUDIT === '1'
const API_KEY = process.env.TYPESAFE_API_KEY
const MODEL = 'jev-latest'
const ENDPOINT = 'https://api.typesafe.ai/v1/systemone'
const CONCURRENCY = 8

// ---- Route detection -------------------------------------------------------
// Each handler opens with a distinctive line. More than one hit means the marker
// set stopped discriminating, which we report rather than silently pick.
const MARKERS: Record<string, string[]> = {
  tiring: ['is your heaviest:'],
  airport: [
    'no flight/train departure commitments saved',
    'is empty, so reaching',
    'Yes, workable.',
    'Risky. The current Day',
  ],
  cheaper: ['Biggest levers:'],
  rain: ['Three rain options:'],
  family: ['A family-friendlier version would:'],
  kids: ['With children along, first consider removing:'],
  compare: ['stops/day.', 'to compare a relaxed'],
  risks: ['Top risks right now:', 'No schedule risks detected'],
  delay: ["Backup plan if you're delayed"],
  youtube: ['#travelvlog'],
  cost: ['Where it goes:'],
  summary: ['distinct overnight bases.'],
  none: ["Here's what I can see in"],
}

function routeOf(text: string): string {
  const hits = Object.entries(MARKERS).filter(([, ms]) => ms.some((m) => text.includes(m)))
  if (hits.length === 1) return hits[0][0]
  if (hits.length === 0) return 'UNKNOWN'
  return `AMBIGUOUS(${hits.map(([k]) => k).join('+')})`
}

// ---- Intent taxonomy handed to Jev ----------------------------------------
// Written as what the traveller WANTS, so Jev judges intent rather than keywords.
// Scope note: this is what the AI companion exposes. Placing a stop, booking, or
// looking up live data are app features the companion cannot do, so they are
// deliberately absent and fall to "none".
// The criteria now live in src/lib/jevTaxonomy.ts — one truth shared with the
// runtime classifier, so the audit and the product can never classify differently.
const CRITERIA: Record<string, string> = INTENT_CRITERIA

// ---- Jev call --------------------------------------------------------------
interface JevAnswer {
  type: string
  choice: string
  confidence: number
  probabilities: Record<string, number>
}

async function askJevOne(text: string): Promise<{ answer: JevAnswer; ms: number; inTok: number; outTok: number }> {
  const body = {
    state: text,
    model: MODEL,
    questions: {
      intent: {
        type: 'choice',
        instructions:
          'A traveller planning a group trip typed the message in the state. ' +
          'Decide which ONE capability described in the criteria best serves what they actually want. ' +
          'Judge the intent behind the message, not its surface keywords. ' +
          'Choose "none" when no listed capability genuinely serves it.',
        criteria: CRITERIA,
      },
    },
  }

  for (let attempt = 0; ; attempt++) {
    const started = Date.now()
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const ms = Date.now() - started
    if (res.status === 429 || res.status === 529) {
      if (attempt >= 4) throw new Error(`Jev ${res.status} after ${attempt} retries`)
      await new Promise((r) => setTimeout(r, 500 * 2 ** attempt))
      continue
    }
    if (!res.ok) throw new Error(`Jev HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`)
    const json = (await res.json()) as {
      answers: Record<string, JevAnswer>
      usage: { input_tokens: number; output_tokens: number }
    }
    return { answer: json.answers.intent, ms, inTok: json.usage.input_tokens, outTok: json.usage.output_tokens }
  }
}

async function pool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length)
  let next = 0
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      for (;;) {
        const i = next++
        if (i >= items.length) return
        out[i] = await fn(items[i])
      }
    }),
  )
  return out
}

describe.skipIf(!ENABLED)('Jev router audit', () => {
  it(
    'compares Jev intent against the deterministic route',
    async () => {
      if (!API_KEY) throw new Error('TYPESAFE_API_KEY is not set')
      const trip = seedData.trips[0] as unknown as Trip

      // Authored phrasings measure intent coverage. Harvested ones lean on abstention
      // and come from this repo's own files. Reported separately — never averaged
      // into one number.
      const ALL = [
        ...CORPUS.map((p) => ({ ...p, source: 'authored' as const, origin: '' })),
        ...HARVESTED.map((h) => ({ ...h, source: 'harvested' as const })),
      ]

      const started = Date.now()
      const results = await pool(ALL, CONCURRENCY, (c) => askJevOne(c.text))
      const wall = Date.now() - started

      const inTok = results.reduce((s, r) => s + r.inTok, 0)
      const outTok = results.reduce((s, r) => s + r.outTok, 0)

      const rows = ALL.map((c, i) => {
        const code = routeOf(answerQuestion(trip, c.text).text)
        const jev = results[i].answer?.choice ?? 'NO-ANSWER'
        return { ...c, code, jev, confidence: results[i].answer?.confidence ?? 0 }
      })

      console.log(`\n===== JEV ROUTER AUDIT =====`)
      console.log(HARVESTED_PROVENANCE)
      console.log(`phrasings=${rows.length}; agreement is not accuracy; Jev judgments can vary between runs`)
      console.log(`tokens: ${inTok} in / ${outTok} out  ·  wall ${wall}ms  ·  concurrency ${CONCURRENCY}`)

      console.log(`\nSPLIT BY CORPUS SOURCE (do not average these)`)
      for (const src of ['authored', 'harvested'] as const) {
        const set = rows.filter((r) => r.source === src)
        const ok = set.filter((r) => r.code === r.jev)
        const pct = set.length ? Math.round((ok.length / set.length) * 100) : 0
        const abstained = set.filter((r) => r.want === 'none')
        const abstainedOk = abstained.filter((r) => r.code === 'none')
        const jevAbstained = abstained.filter((r) => r.jev === 'none')
        console.log(`  ${src} expected-label matches: code=${set.filter(r => r.code === r.want).length}/${set.length}, jev=${set.filter(r => r.jev === r.want).length}/${set.length}`)
        console.log(
          `  ${src.padEnd(10)} n=${String(set.length).padStart(3)}  code==jev ${ok.length}/${set.length} (${pct}%)` +
            (abstained.length
              ? `  ·  expected-none matches: code=${abstainedOk.length}/${abstained.length}, jev=${jevAbstained.length}/${abstained.length}`
              : ''),
        )
      }

      // Coverage by intended intent, AUTHORED ONLY — the harvested set is mostly
      // abstain tests and would distort this table.
      const authored = rows.filter((r) => r.source === 'authored')
      const byWant = new Map<string, { total: number; codeOk: number; jevOk: number }>()
      for (const r of authored) {
        const e = byWant.get(r.want) ?? { total: 0, codeOk: 0, jevOk: 0 }
        e.total++
        if (r.code === r.want) e.codeOk++
        if (r.jev === r.want) e.jevOk++
        byWant.set(r.want, e)
      }
      console.log(`\nCOVERAGE BY INTENDED INTENT (authored corpus only)`)
      for (const [want, e] of [...byWant.entries()].sort((a, b) => a[1].codeOk / a[1].total - b[1].codeOk / b[1].total)) {
        const pct = (n: number) => String(Math.round((n / e.total) * 100)).padStart(3)
        console.log(`  ${want.padEnd(8)} n=${String(e.total).padStart(3)}  code ${pct(e.codeOk)}%  jev ${pct(e.jevOk)}%`)
      }

      for (const src of ['authored', 'harvested'] as const) {
        const bad = rows.filter((r) => r.source === src && r.code !== r.jev)
        console.log(`\n----- ${src.toUpperCase()} DISAGREEMENTS (${bad.length}) -----`)
        for (const r of bad) {
          console.log(
            `[${r.id}] "${r.text}"\n` +
              `      code=${r.code}  jev=${r.jev}  want=${r.want}  conf=${r.confidence.toFixed(2)}` +
              (r.origin ? `\n      from: ${r.origin}` : ''),
          )
        }
      }

      const broken = rows.filter((r) => r.code.startsWith('UNKNOWN') || r.code.startsWith('AMBIGUOUS'))
      if (broken.length) {
        console.log(`\n----- ROUTE DETECTION PROBLEMS (fix markers) -----`)
        for (const r of broken) console.log(`[${r.id}] ${r.code} · "${r.text}"`)
      }

      const offTaxonomy = rows.filter((r) => !(r.jev in CRITERIA))
      if (offTaxonomy.length) {
        console.log(`\n----- JEV CHOICES OUTSIDE THE CRITERIA SET -----`)
        for (const r of offTaxonomy) console.log(`[${r.id}] jev=${r.jev} · "${r.text}"`)
      }

      expect(broken.map((r) => `${r.id}:${r.code}`)).toEqual([])
      expect(offTaxonomy.map((r) => `${r.id}:${r.jev}`)).toEqual([])
      expect(rows.length).toBe(ALL.length)
    },
    900000,
  )
})
