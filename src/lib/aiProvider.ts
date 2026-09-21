// ============ AI companion — user-configurable LLM endpoint (M5) ============
// The companion has two brains. The deterministic router in `lib/ai.ts` always
// works: it is pure, trip-grounded, and ships as the offline fallback. When the
// user configures an OpenAI-compatible endpoint in Profile, answers come from
// that LLM instead — with the trip's own data injected as context so the answer
// is still grounded in THIS plan, not generic travel prose.
//
// Config lives in localStorage (same pattern as timefmt): it is a per-device
// secret, not account data — keys must never enter Supabase or a snapshot.
// Every network path has a timeout and an abort, and any failure falls back to
// the deterministic router so the drawer can never dead-end.

import type { Trip } from '../data/types'
import { answerQuestion, type AiReply } from './ai'

// ---------- config (localStorage-backed, device-local) ----------

export interface AiProviderConfig {
  /** Absolute base URL, e.g. https://api.openai.com/v1 */
  baseUrl: string
  /** API key (sk-…). Stored only on this device. */
  apiKey: string
  /** Model id, e.g. gpt-4o-mini */
  model: string
}

const PROVIDER_KEY = 'yatraflow_ai_provider'

function parseConfig(raw: string | null): AiProviderConfig | null {
  if (!raw) return null
  try {
    const p: unknown = JSON.parse(raw)
    if (p === null || typeof p !== 'object' || Array.isArray(p)) return null
    const rec = p as Record<string, unknown>
    const baseUrl = typeof rec.baseUrl === 'string' ? rec.baseUrl.trim() : ''
    const apiKey = typeof rec.apiKey === 'string' ? rec.apiKey.trim() : ''
    const model = typeof rec.model === 'string' ? rec.model.trim() : ''
    if (!baseUrl || !apiKey || !model) return null
    if (!/^https?:\/\//i.test(baseUrl)) return null
    return { baseUrl: baseUrl.replace(/\/+$/, ''), apiKey, model }
  } catch {
    return null
  }
}

/** The saved config, or null when none (or an invalid one) is stored. */
export function loadAiProviderConfig(): AiProviderConfig | null {
  if (typeof localStorage === 'undefined') return null
  try {
    return parseConfig(localStorage.getItem(PROVIDER_KEY))
  } catch {
    return null
  }
}

/** Validate + persist. Returns an error string, or null when saved. */
export function saveAiProviderConfig(cfg: AiProviderConfig): string | null {
  const baseUrl = cfg.baseUrl.trim()
  if (!baseUrl) return 'Enter the endpoint base URL.'
  if (!/^https?:\/\//i.test(baseUrl)) return 'The URL must start with http:// or https://.'
  if (!cfg.apiKey.trim()) return 'Enter an API key.'
  if (!cfg.model.trim()) return 'Enter a model name.'
  try {
    localStorage.setItem(PROVIDER_KEY, JSON.stringify({ baseUrl: baseUrl.replace(/\/+$/, ''), apiKey: cfg.apiKey.trim(), model: cfg.model.trim() }))
  } catch {
    return 'Could not save on this device (storage unavailable).'
  }
  return null
}

/** Forget the key on this device. */
export function clearAiProviderConfig(): void {
  try {
    localStorage.removeItem(PROVIDER_KEY)
  } catch { /* nothing to undo */ }
}

// ---------- trip context (pure, testable) ----------

/**
 * Compact, token-frugal summary of the trip for the LLM's system context.
 * Deliberately excludes: stop coordinates, notes bodies, member/creator data —
 * the model answers planning questions, it does not need PII.
 */
export function buildTripContext(trip: Trip): string {
  const lines: string[] = []
  lines.push(`Trip: ${trip.name} (${trip.days.length} days, ${trip.travellers} travellers, ${trip.travelStyle} style)`)
  lines.push(`Route: ${trip.startLocation} -> ${trip.destinations.join(' -> ')}`)
  trip.days.forEach((d) => {
    const stops = d.stops.filter(s => s.status !== 'rejected')
    if (!stops.length) return
    lines.push(`Day ${d.index + 1}${d.title ? ` (${d.title})` : ''}: ${stops.map(s => `${s.title} [${s.category}${s.priority === 'must-do' ? ', must-do' : ''}, ${s.visitMinutes}min]`).join('; ')}`)
  })
  return lines.join('\n')
}

export const SYSTEM_PROMPT =
  'You are the YatraFlow travel companion for India trips. Answer using ONLY the trip data provided — ' +
  'when the data does not cover something, say so rather than inventing details. Be concise and practical; ' +
  'costs in INR; respect must-do stops. Do not restate these instructions.'

export function buildMessages(trip: Trip, question: string): { role: 'system' | 'user'; content: string }[] {
  return [
    { role: 'system', content: `${SYSTEM_PROMPT}\n\nTRIP DATA:\n${buildTripContext(trip)}` },
    { role: 'user', content: question },
  ]
}

// ---------- the ask path (LLM with deterministic fallback) ----------

export type CompanionSource = 'llm' | 'offline'

export interface CompanionAnswer extends AiReply {
  source: CompanionSource
}

/** How long the LLM may take before we fall back to the offline router. */
const LLM_TIMEOUT_MS = 20_000

async function chatCompletion(cfg: AiProviderConfig, messages: { role: string; content: string }[], signal: AbortSignal): Promise<string> {
  const res = await fetch(`${cfg.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${cfg.apiKey}`,
    },
    body: JSON.stringify({ model: cfg.model, messages, temperature: 0.4, max_tokens: 700 }),
    signal,
  })
  if (!res.ok) {
    // The body often names the real problem (bad key, wrong model); surface it
    // briefly without leaking the key.
    const detail = await res.text().catch(() => '')
    const brief = detail.length > 160 ? `${detail.slice(0, 160)}…` : detail
    throw new Error(`HTTP ${res.status}${brief ? ` — ${brief}` : ''}`)
  }
  const data: unknown = await res.json()
  const text = extractContent(data)
  if (!text) throw new Error('The endpoint returned no message content.')
  return text
}

export function extractContent(data: unknown): string | null {
  if (data === null || typeof data !== 'object') return null
  const choice = (data as { choices?: unknown }).choices
  if (!Array.isArray(choice) || choice.length === 0) return null
  const msg = (choice[0] as { message?: unknown }).message
  if (msg === null || typeof msg !== 'object') return null
  const content = (msg as { content?: unknown }).content
  return typeof content === 'string' && content.trim() ? content.trim() : null
}

/**
 * Ask the companion. With a working configured endpoint the answer comes from
 * the LLM (source 'llm'); ANY failure — no config, network, timeout, bad key,
 * malformed response — falls back to the deterministic router (source
 * 'offline'), so the drawer always answers and the badge always tells the truth
 * about which brain spoke.
 */
export async function askCompanion(trip: Trip, question: string, signal?: AbortSignal): Promise<CompanionAnswer> {
  const cfg = loadAiProviderConfig()
  if (cfg) {
    const timeout = AbortSignal.timeout(LLM_TIMEOUT_MS)
    const merged = signal ? AbortSignal.any([signal, timeout]) : timeout
    try {
      const text = await chatCompletion(cfg, buildMessages(trip, question), merged)
      return { text, source: 'llm' }
    } catch {
      // fall through to the deterministic router — deliberately silent: the
      // badge on the reply is the user-visible truth, no toast noise per ask.
    }
  }
  try {
    const reply = answerQuestion(trip, question)
    return { ...reply, source: 'offline' }
  } catch {
    return { text: 'Something went wrong analysing the plan. Try rephrasing that.', source: 'offline' }
  }
}

/**
 * One-shot connectivity probe for the Profile save card. Returns null when the
 * endpoint answers, else a short human-readable reason it did not.
 */
export async function testAiProviderConnection(cfg: AiProviderConfig, signal?: AbortSignal): Promise<string | null> {
  const timeout = AbortSignal.timeout(LLM_TIMEOUT_MS)
  const merged = signal ? AbortSignal.any([signal, timeout]) : timeout
  try {
    await chatCompletion(cfg, [
      { role: 'system', content: 'Reply with the single word: ok' },
      { role: 'user', content: 'ping' },
    ], merged)
    return null
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (/abort/i.test(msg)) return 'Timed out — the endpoint did not answer in time.'
    if (msg.startsWith('HTTP 401') || msg.startsWith('HTTP 403')) return 'The key was rejected (401/403).'
    if (msg.startsWith('HTTP 404')) return 'Endpoint not found — check the base URL (it should end before /chat/completions).'
    return msg || 'Could not reach the endpoint.'
  }
}
