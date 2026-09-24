// Pure parsing and measurement helpers for the token-throughput benchmark CLI.

export const DEFAULT_BASE_URL = 'https://api.minimax.io/v1'
export const DEFAULT_MODEL = 'MiniMax-M3'
export const DEFAULT_MAX_TOKENS = 16_384
export const DEFAULT_MAX_SECONDS = 120
export const TOKENIZER_REVISION = 'main'

function optionValue(argv, index, inline, name) {
  if (inline !== undefined) return { value: inline, next: index }
  const value = argv[index + 1]
  if (value === undefined || value.startsWith('-')) throw new Error(`${name} needs a value`)
  return { value, next: index + 1 }
}

export function parseArgs(argv, env = process.env) {
  const options = {
    baseUrl: env.MINIMAX_BASE_URL || env.OPENAI_BASE_URL || DEFAULT_BASE_URL,
    model: env.MINIMAX_MODEL || env.OPENAI_MODEL || DEFAULT_MODEL,
    apiKey: env.MINIMAX_API_KEY || env.OPENAI_API_KEY || '',
    maxTokens: DEFAULT_MAX_TOKENS,
    maxSeconds: DEFAULT_MAX_SECONDS,
    temperature: 1,
    thinking: 'disabled',
    prompt: null,
    promptFile: null,
    tokenizerRepo: null,
    tokenizerRevision: env.TOKENIZER_REVISION || TOKENIZER_REVISION,
    refreshTokenizer: false,
    useTokenizer: true,
    output: null,
    showOutput: false,
    json: false,
    help: false,
  }

  for (let i = 0; i < argv.length; i++) {
    const equals = argv[i].indexOf('=')
    const flag = equals === -1 ? argv[i] : argv[i].slice(0, equals)
    const inline = equals === -1 ? undefined : argv[i].slice(equals + 1)
    const read = (name) => {
      const got = optionValue(argv, i, inline, name)
      i = got.next
      return got.value
    }

    switch (flag) {
      case '-b': case '--base-url': options.baseUrl = read(flag); break
      case '-m': case '--model': options.model = read(flag); break
      case '--api-key': options.apiKey = read(flag); break
      case '--max-tokens': options.maxTokens = Number(read(flag)); break
      case '--max-seconds': options.maxSeconds = Number(read(flag)); break
      case '--temperature': options.temperature = Number(read(flag)); break
      case '--thinking': options.thinking = read(flag); break
      case '--prompt': options.prompt = read(flag); break
      case '--prompt-file': options.promptFile = read(flag); break
      case '--tokenizer-repo': options.tokenizerRepo = read(flag); break
      case '--tokenizer-revision': options.tokenizerRevision = read(flag); break
      case '--refresh-tokenizer': options.refreshTokenizer = true; break
      case '--no-tokenizer': options.useTokenizer = false; break
      case '--output': options.output = read(flag); break
      case '--show-output': options.showOutput = true; break
      case '--json': options.json = true; break
      case '-h': case '--help': options.help = true; break
      default: throw new Error(`Unknown option: ${flag}`)
    }
  }

  if (!Number.isInteger(options.maxTokens) || options.maxTokens < 1) throw new Error('--max-tokens must be a positive integer')
  if (!Number.isFinite(options.maxSeconds) || options.maxSeconds < 0) throw new Error('--max-seconds must be zero or greater')
  if (!Number.isFinite(options.temperature) || options.temperature < 0 || options.temperature > 2) throw new Error('--temperature must be between 0 and 2')
  if (!['disabled', 'adaptive'].includes(options.thinking)) throw new Error('--thinking must be disabled or adaptive')
  if (options.prompt !== null && options.promptFile !== null) throw new Error('Use either --prompt or --prompt-file, not both')
  if (options.tokenizerRepo !== null && !/^[\w.-]+\/[\w.-]+$/.test(options.tokenizerRepo)) throw new Error('--tokenizer-repo must look like owner/model')
  return options
}

export function chatCompletionsUrl(baseUrl) {
  const url = new URL(baseUrl)
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error('API base URL must use http or https')
  url.hash = ''
  url.search = ''
  url.pathname = url.pathname.replace(/\/+$/, '')
  if (!url.pathname.endsWith('/chat/completions')) url.pathname += '/chat/completions'
  return url.toString()
}

export function minimaxTokenizerRepo(model) {
  if (!/^MiniMax-(?:M3|M2(?:\.|-|$))/.test(model)) return null
  return `MiniMaxAI/${model.replace(/-highspeed$/, '')}`
}

export function extractUsage(payload) {
  const usage = payload && typeof payload === 'object' ? payload.usage : null
  if (!usage || typeof usage !== 'object') return { inputTokens: null, outputTokens: null, totalTokens: null }
  const number = (...keys) => {
    for (const key of keys) if (typeof usage[key] === 'number' && Number.isFinite(usage[key])) return usage[key]
    return null
  }
  return {
    inputTokens: number('prompt_tokens', 'input_tokens', 'promptTokens', 'inputTokens'),
    outputTokens: number('completion_tokens', 'output_tokens', 'completionTokens', 'outputTokens'),
    totalTokens: number('total_tokens', 'totalTokens'),
  }
}

export function extractDelta(payload) {
  const choice = payload && Array.isArray(payload.choices) ? payload.choices[0] : null
  const delta = choice?.delta && typeof choice.delta === 'object' ? choice.delta : {}
  return {
    content: typeof delta.content === 'string' ? delta.content : '',
    reasoning: typeof delta.reasoning_content === 'string' ? delta.reasoning_content : typeof delta.reasoning === 'string' ? delta.reasoning : '',
    finishReason: typeof choice?.finish_reason === 'string' ? choice.finish_reason : null,
  }
}

export async function* parseSseData(body) {
  const decoder = new TextDecoder()
  let buffer = ''
  let dataLines = []
  const emit = () => {
    if (!dataLines.length) return null
    const data = dataLines.join('\n')
    dataLines = []
    return data
  }
  for await (const chunk of body) {
    buffer += decoder.decode(chunk, { stream: true })
    let newline
    while ((newline = buffer.indexOf('\n')) !== -1) {
      let line = buffer.slice(0, newline)
      buffer = buffer.slice(newline + 1)
      if (line.endsWith('\r')) line = line.slice(0, -1)
      if (line === '') {
        const data = emit()
        if (data !== null) yield data
      } else if (line.startsWith('data:')) {
        dataLines.push(line.slice(5).replace(/^ /, ''))
      }
    }
  }
  buffer += decoder.decode()
  if (buffer.startsWith('data:')) dataLines.push(buffer.slice(5).replace(/^ /, ''))
  const data = emit()
  if (data !== null) yield data
}

export function metrics({ outputTokens, firstOutputAt, lastOutputAt, startedAt, finishedAt }) {
  const decodeSeconds = outputTokens !== null && firstOutputAt !== null && lastOutputAt !== null ? Math.max(0, (lastOutputAt - firstOutputAt) / 1000) : null
  const totalSeconds = startedAt !== null && finishedAt !== null ? Math.max(0, (finishedAt - startedAt) / 1000) : null
  return {
    decodeSeconds,
    totalSeconds,
    ttftSeconds: firstOutputAt !== null && startedAt !== null ? Math.max(0, (firstOutputAt - startedAt) / 1000) : null,
    decodeTokensPerSecond: outputTokens !== null && decodeSeconds !== null && decodeSeconds > 0 ? outputTokens / decodeSeconds : null,
    endToEndTokensPerSecond: outputTokens !== null && totalSeconds !== null && totalSeconds > 0 ? outputTokens / totalSeconds : null,
  }
}

export function apiErrorDetail(body) {
  const text = typeof body === 'string' ? body : JSON.stringify(body)
  if (!text) return ''
  try {
    const parsed = JSON.parse(text)
    const detail = parsed?.error?.message || parsed?.error || parsed?.message || parsed?.base_resp?.status_msg
    if (typeof detail === 'string') return detail.slice(0, 300)
  } catch { /* Non-JSON error; its short text is still useful. */ }
  return text.replace(/\s+/g, ' ').slice(0, 300)
}