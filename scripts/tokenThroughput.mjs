#!/usr/bin/env node
// Streaming token-throughput benchmark for OpenAI-compatible chat-completions APIs.

import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { performance } from 'node:perf_hooks'
import { pathToFileURL } from 'node:url'
import { Tokenizer } from '@huggingface/tokenizers'
import {
  apiErrorDetail, chatCompletionsUrl, extractDelta, extractUsage, metrics,
  minimaxTokenizerRepo, parseArgs, parseSseData,
} from './tokenThroughputCore.mjs'

export const DEFAULT_BENCHMARK_PROMPT = `Act as a principal engineer and write a production design document for a collaborative, offline-first India trip-planning application.

Target 3,500-4,500 words. Use these exact top-level sections, with substantive content rather than filler:
1. Assumptions and non-goals
2. Architecture and data flow
3. Data model and migrations
4. Offline persistence and synchronization
5. Conflict resolution and merge rules
6. Authentication, authorization, and RLS
7. Failure modes and recovery
8. Performance and accessibility budgets
9. Observability and incident response
10. Test strategy with at least 20 concrete cases
11. Rollout plan and rollback
12. Prioritized implementation backlog, risk register, and go/no-go checklist

Include a Mermaid architecture diagram, concrete API and TypeScript data shapes, edge cases, measurable acceptance criteria, and explicit tradeoffs. Do not ask questions, use tools, cite external sources, or repeat the brief. Return the document only.`

const HELP = `MiniMax / OpenAI-compatible streaming token benchmark

Usage:
  npm run benchmark:tokens -- [options]

Options:
  -b, --base-url URL          API base (default: $MINIMAX_BASE_URL or $OPENAI_BASE_URL)
  -m, --model ID             Model id (default: $MINIMAX_MODEL or $OPENAI_MODEL, else MiniMax-M3)
      --api-key KEY          API key; prefer MINIMAX_API_KEY or OPENAI_API_KEY
      --max-tokens N         Output cap (default: 16384)
      --max-seconds N        Duration safety cap, 0 disables (default: 120)
      --temperature N        Sampling temperature (default: 1)
      --thinking MODE        disabled or adaptive (default: disabled for M3)
      --prompt TEXT          Replace the built-in 1-2 minute benchmark task
      --prompt-file PATH     Read a custom prompt from a file
      --tokenizer-repo REPO  Hugging Face tokenizer repo, e.g. MiniMaxAI/MiniMax-M3
      --tokenizer-revision R Tokenizer revision (default: main)
      --refresh-tokenizer    Ignore the cached tokenizer files
      --no-tokenizer         Do not load a model tokenizer
      --output PATH          Save the response to a file
      --show-output          Print the response after the final summary
      --json                 Print the final result as JSON
  -h, --help                 Show this help

The API key is read from the environment when possible so it stays out of shell
history. Tokenizer files are cached under the user's cache directory.`

function cacheDirectory(repo, revision) {
  const root = process.env.TOKEN_THROUGHPUT_CACHE
    || join(process.env.XDG_CACHE_HOME || join(homedir(), '.cache'), 'yatraflow', 'token-throughput')
  return join(root, `${repo}@${revision}`.replace(/[^a-zA-Z0-9._-]+/g, '__'))
}

async function readJson(path) {
  try {
    return JSON.parse(await readFile(path, 'utf8'))
  } catch {
    return null
  }
}

async function downloadJson(url, path) {
  const response = await fetch(url, { signal: AbortSignal.timeout(60_000) })
  if (!response.ok) throw new Error(`Tokenizer download failed: HTTP ${response.status} ${url}`)
  const value = await response.json()
  const temporary = `${path}.${process.pid}.tmp`
  await writeFile(temporary, JSON.stringify(value), 'utf8')
  await rename(temporary, path)
  return value
}

export async function loadTokenizer(repo, revision, options = {}) {
  const directory = cacheDirectory(repo, revision)
  const tokenizerPath = join(directory, 'tokenizer.json')
  const configPath = join(directory, 'tokenizer_config.json')
  if (options.refresh) await rm(directory, { recursive: true, force: true })
  await mkdir(directory, { recursive: true })
  let tokenizerJson = await readJson(tokenizerPath)
  let configJson = await readJson(configPath)
  if (!tokenizerJson) tokenizerJson = await downloadJson(`https://huggingface.co/${repo}/resolve/${revision}/tokenizer.json`, tokenizerPath)
  if (!configJson) configJson = await downloadJson(`https://huggingface.co/${repo}/resolve/${revision}/tokenizer_config.json`, configPath)
  const tokenizer = new Tokenizer(tokenizerJson, configJson)
  return {
    source: `${repo}@${revision}`,
    count(text) {
      return text ? tokenizer.encode(text).ids.length : 0
    },
  }
}

function formatSeconds(value) {
  if (value === null) return '—'
  if (value < 1) return `${Math.round(value * 1000)} ms`
  if (value < 120) return `${value.toFixed(2)} s`
  const minutes = Math.floor(value / 60)
  return `${minutes}m ${(value - minutes * 60).toFixed(1)}s`
}

function formatRate(value) {
  return value === null ? '—' : `${value.toFixed(1)} tok/s`
}

function statusLine(state) {
  const count = state.estimatedTokens === null ? '—' : `${state.estimatedTokens.toLocaleString()}${state.tokenCountEstimated ? '~' : ''}`
  return [
    state.phase,
    `elapsed ${formatSeconds(state.totalSeconds)}`,
    `TTFT ${formatSeconds(state.ttftSeconds)}`,
    `output ${count}`,
    `live ${formatRate(state.liveTokensPerSecond)}`,
    `avg ${formatRate(state.decodeTokensPerSecond)}`,
  ].join('  │  ')
}

function makeRenderer() {
  const interactive = Boolean(process.stderr.isTTY) && !process.env.NO_COLOR
  let lastLog = 0
  return {
    update(state, force = false) {
      const line = statusLine(state)
      if (interactive) {
        process.stderr.write(`\r[2K${line}`)
        return
      }
      const now = performance.now()
      if (force || now - lastLog >= 5_000) {
        process.stderr.write(`${line}\n`)
        lastLog = now
      }
    },
    clear() {
      if (interactive) process.stderr.write('\r[2K')
    },
  }
}

function requestBody({ model, prompt, maxTokens, temperature, thinking }) {
  return {
    model,
    messages: [{ role: 'user', content: prompt }],
    stream: true,
    stream_options: { include_usage: true },
    max_completion_tokens: maxTokens,
    temperature,
    ...(model.startsWith('MiniMax-') ? { reasoning_split: true, thinking: { type: thinking } } : {}),
  }
}

export async function runStreamingBenchmark({
  baseUrl, model, apiKey, prompt, maxTokens, temperature, thinking,
  maxSeconds = 0, tokenizer = null, signal = null, fetchImpl = fetch,
  now = () => performance.now(), onUpdate = () => {},
}) {
  if (!apiKey) throw new Error('Missing API key. Set MINIMAX_API_KEY or OPENAI_API_KEY.')
  if (!prompt?.trim()) throw new Error('The benchmark prompt is empty.')
  const endpoint = chatCompletionsUrl(baseUrl)
  const startedAt = now()
  let phase = 'connecting'
  let firstOutputAt = null
  let lastOutputAt = null
  let finishedAt = null
  let visibleText = ''
  let reasoningText = ''
  let liveTokenEstimate = 0
  let recent = []
  let lastRenderAt = 0
  let finishReason = null
  let usage = { inputTokens: null, outputTokens: null, totalTokens: null }
  let chunkCount = 0
  let timedOut = false
  let interrupted = false

  const controller = new AbortController()
  const abort = () => {
    interrupted = true
    controller.abort()
  }
  if (signal) {
    if (signal.aborted) abort()
    else signal.addEventListener('abort', abort, { once: true })
  }
  const timer = maxSeconds > 0 ? setTimeout(() => {
    timedOut = true
    controller.abort()
  }, maxSeconds * 1000) : null


  const snapshot = () => {
    const localOutputTokens = tokenizer ? tokenizer.count(reasoningText + visibleText) : null
    const serverOutputTokens = usage.outputTokens
    const outputTokens = serverOutputTokens ?? localOutputTokens
    const speed = metrics({ outputTokens, firstOutputAt, lastOutputAt, startedAt, finishedAt: finishedAt ?? now() })
    let liveTokensPerSecond = null
    if (recent.length > 1) {
      const first = recent[0]
      const last = recent[recent.length - 1]
      const seconds = (last.at - first.at) / 1000
      if (seconds >= 0.5) liveTokensPerSecond = Math.max(0, (last.tokens - first.tokens) / seconds)
    }
    return {
      phase, chunkCount, charCount: visibleText.length + reasoningText.length,
      estimatedTokens: outputTokens, localOutputTokens, serverOutputTokens,
      tokenCountEstimated: serverOutputTokens === null,
      ...speed, liveTokensPerSecond, usage, finishReason, timedOut, interrupted,
    }
  }
  const render = (force = false) => {
    const at = now()
    if (!force && at - lastRenderAt < 200) return
    lastRenderAt = at
    const state = snapshot()
    if (tokenizer && state.localOutputTokens !== null) {
      recent.push({ at, tokens: liveTokenEstimate })
      const cutoff = at - 5_000
      recent = recent.filter(sample => sample.at >= cutoff)
    }
    onUpdate(state)
  }

  try {
    const response = await fetchImpl(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(requestBody({ model, prompt, maxTokens, temperature, thinking })),
      signal: controller.signal,
    })
    if (!response.ok) {
      const detail = apiErrorDetail(await response.text().catch(() => ''))
      throw new Error(`Benchmark request failed: HTTP ${response.status}${detail ? ` — ${detail}` : ''}`)
    }
    if (!response.body) throw new Error('The endpoint returned no streaming response body.')
    phase = 'streaming'
    render(true)
    for await (const data of parseSseData(response.body)) {
      if (data === '[DONE]') break
      let payload
      try {
        payload = JSON.parse(data)
      } catch {
        throw new Error('The endpoint emitted malformed JSON in its stream.')
      }
      if (payload?.error) throw new Error(`Endpoint stream error: ${apiErrorDetail(JSON.stringify(payload.error))}`)
      const usageUpdate = extractUsage(payload)
      if (Object.values(usageUpdate).some(value => value !== null)) usage = usageUpdate
      const delta = extractDelta(payload)
      if (delta.finishReason) finishReason = delta.finishReason
      if (delta.content || delta.reasoning) {
        const at = now()
        firstOutputAt ??= at
        lastOutputAt = at
        chunkCount++
        visibleText += delta.content
        reasoningText += delta.reasoning
        if (tokenizer) liveTokenEstimate += tokenizer.count(`${delta.reasoning}${delta.content}`)
        render()
      }
    }
    phase = timedOut || interrupted ? 'stopped' : 'complete'
  } catch (error) {
    if (controller.signal.aborted && (timedOut || interrupted)) phase = 'stopped'
    else throw error
  } finally {
    if (timer) clearTimeout(timer)
    if (signal) signal.removeEventListener('abort', abort)
    finishedAt = now()
  }

  const result = snapshot()
  const warnings = []
  if (timedOut) warnings.push(`Stopped at the ${maxSeconds}-second safety cap; this is a partial sample.`)
  if (interrupted) warnings.push('Interrupted; this is a partial sample.')
  if (usage.totalTokens !== null && usage.outputTokens === null) {
    warnings.push('The endpoint reported only total_tokens; output TPS uses the local model tokenizer.')
  }
  if (!tokenizer && usage.outputTokens === null) {
    warnings.push('No output token count is available. Supply --tokenizer-repo or use an endpoint that reports completion_tokens.')
  }
  return {
    ...result, endpoint, model, tokenizer: tokenizer?.source ?? null,
    text: visibleText, reasoningText, warnings,
  }
}

function serializableResult(result) {
  const { text, reasoningText, ...summary } = result
  return summary
}

function printSummary(result, renderer) {
  renderer.clear()
  const lines = [
    '',
    'Token throughput result',
    '────────────────────────',
    `Model:             ${result.model}`,
    `Endpoint:          ${result.endpoint}`,
    `Tokenizer:         ${result.tokenizer ?? 'server usage only'}`,
    `Output tokens:     ${result.estimatedTokens?.toLocaleString() ?? 'unknown'}${result.tokenCountEstimated ? ' (local tokenizer)' : ' (server reported)'}`,
    `Decode throughput: ${formatRate(result.decodeTokensPerSecond)}`,
    `End-to-end rate:   ${formatRate(result.endToEndTokensPerSecond)}`,
    `Time to first tok: ${formatSeconds(result.ttftSeconds)}`,
    `Decode duration:   ${formatSeconds(result.decodeSeconds)}`,
    `Total duration:    ${formatSeconds(result.totalSeconds)}`,
    `Stream chunks:     ${result.chunkCount}`,
    `Finish reason:     ${result.finishReason ?? '—'}`,
    `Usage:             input=${result.usage.inputTokens ?? '—'}, output=${result.usage.outputTokens ?? '—'}, total=${result.usage.totalTokens ?? '—'}`,
  ]
  if (result.reasoningText) lines.push(`Reasoning output:  ${result.reasoningText.length.toLocaleString()} characters`)
  if (result.warnings.length) lines.push('', ...result.warnings.map(warning => `Warning: ${warning}`))
  process.stdout.write(`${lines.join('\n')}\n`)
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  if (options.help) {
    process.stdout.write(`${HELP}\n`)
    return
  }
  const prompt = options.promptFile
    ? await readFile(resolve(options.promptFile), 'utf8')
    : options.prompt ?? DEFAULT_BENCHMARK_PROMPT
  const repo = options.tokenizerRepo ?? minimaxTokenizerRepo(options.model)
  let tokenizer = null
  if (options.useTokenizer && repo) {
    process.stderr.write(`Loading tokenizer ${repo}@${options.tokenizerRevision}…\n`)
    tokenizer = await loadTokenizer(repo, options.tokenizerRevision, { refresh: options.refreshTokenizer })
  }
  if (options.useTokenizer && !repo) {
    process.stderr.write('No tokenizer repository is known for this model; falling back to server usage.\n')
  }

  const renderer = makeRenderer()
  const controller = new AbortController()
  const onSignal = () => controller.abort()
  process.once('SIGINT', onSignal)
  process.once('SIGTERM', onSignal)
  try {
    const result = await runStreamingBenchmark({
      ...options, prompt, tokenizer, signal: controller.signal, onUpdate: state => renderer.update(state),
    })
    if (options.output) {
      const output = resolve(options.output)
      await mkdir(dirname(output), { recursive: true })
      await writeFile(output, result.text, 'utf8')
    }
    if (options.json) process.stdout.write(`${JSON.stringify(serializableResult(result), null, 2)}\n`)
    else printSummary(result, renderer)
    if (options.showOutput) process.stdout.write(`\n${result.text}`)
  } finally {
    process.removeListener('SIGINT', onSignal)
    process.removeListener('SIGTERM', onSignal)
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : ''
if (invokedPath === import.meta.url) {
  main().catch(error => {
    rendererClear()
    process.stderr.write(`\nBenchmark failed: ${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  })
}

function rendererClear() {
  if (process.stderr.isTTY && !process.env.NO_COLOR) process.stderr.write('\r[2K')
}