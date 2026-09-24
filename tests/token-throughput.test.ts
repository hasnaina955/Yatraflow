import { describe, expect, it, vi } from 'vitest'
import {
  apiErrorDetail, chatCompletionsUrl, extractDelta, extractUsage, metrics,
  minimaxTokenizerRepo, parseArgs, parseSseData,
} from '../scripts/tokenThroughputCore.mjs'
import { DEFAULT_BENCHMARK_PROMPT, runStreamingBenchmark } from '../scripts/tokenThroughput.mjs'

function byteStream(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk))
      controller.close()
    },
  })
}

async function collect(stream: AsyncIterable<string>) {
  const values: string[] = []
  for await (const value of stream) values.push(value)
  return values
}

describe('token-throughput CLI configuration', () => {
  it('uses MiniMax defaults and supports inline flags', () => {
    const defaults = parseArgs([], {})
    expect(defaults.baseUrl).toBe('https://api.minimax.io/v1')
    expect(defaults.model).toBe('MiniMax-M3')
    expect(defaults.maxSeconds).toBe(120)

    const custom = parseArgs([
      '--base-url=https://example.test/v1/', '--model', 'MiniMax-M2.7-highspeed',
      '--max-tokens=999', '--max-seconds', '0', '--no-tokenizer', '--json',
    ], {})
    expect(custom.baseUrl).toBe('https://example.test/v1/')
    expect(custom.model).toBe('MiniMax-M2.7-highspeed')
    expect(custom.maxTokens).toBe(999)
    expect(custom.maxSeconds).toBe(0)
    expect(custom.useTokenizer).toBe(false)
    expect(custom.json).toBe(true)
  })

  it('rejects invalid values and ambiguous prompt sources', () => {
    expect(() => parseArgs(['--max-tokens=0'], {})).toThrow(/positive integer/)
    expect(() => parseArgs(['--temperature=3'], {})).toThrow(/between 0 and 2/)
    expect(() => parseArgs(['--thinking=maybe'], {})).toThrow(/disabled or adaptive/)
    expect(() => parseArgs(['--prompt=x', '--prompt-file=y'], {})).toThrow(/either --prompt/)
    expect(() => parseArgs(['--tokenizer-repo=bad'], {})).toThrow(/owner\/model/)
  })

  it('normalizes endpoints and maps model ids to official tokenizer repos', () => {
    expect(chatCompletionsUrl('https://example.test/v1/')).toBe('https://example.test/v1/chat/completions')
    expect(chatCompletionsUrl('https://example.test/v1/chat/completions')).toBe('https://example.test/v1/chat/completions')
    expect(minimaxTokenizerRepo('MiniMax-M3')).toBe('MiniMaxAI/MiniMax-M3')
    expect(minimaxTokenizerRepo('MiniMax-M2.7-highspeed')).toBe('MiniMaxAI/MiniMax-M2.7')
    expect(minimaxTokenizerRepo('gpt-4.1')).toBeNull()
  })

  it('ships a substantive task targeted at roughly one to two minutes', () => {
    expect(DEFAULT_BENCHMARK_PROMPT).toMatch(/3,500-4,500 words/)
    expect(DEFAULT_BENCHMARK_PROMPT).toMatch(/Mermaid architecture diagram/)
    for (let section = 1; section <= 12; section++) expect(DEFAULT_BENCHMARK_PROMPT).toContain(`${section}.`)
  })
})

describe('OpenAI-compatible stream parsing', () => {
  it('parses CRLF events split across arbitrary byte boundaries', async () => {
    const stream = byteStream([
      'data: {"choices":[{"delta":{"content":"hel', 'lo"}}]}\r',
      '\n\r\ndata: {"choices":[{"delta":{"content":" world"}}]}\n\n',
      'data: [DONE]\n\n',
    ])
    await expect(collect(parseSseData(stream))).resolves.toEqual([
      '{"choices":[{"delta":{"content":"hello"}}]}',
      '{"choices":[{"delta":{"content":" world"}}]}',
      '[DONE]',
    ])
  })

  it('extracts visible output, split reasoning, finish reason, and usage variants', () => {
    expect(extractDelta({ choices: [{ delta: { reasoning_content: 'think', content: 'answer' }, finish_reason: 'stop' }] })).toEqual({
      content: 'answer', reasoning: 'think', finishReason: 'stop',
    })
    expect(extractUsage({ usage: { prompt_tokens: 12, completion_tokens: 34, total_tokens: 46 } })).toEqual({
      inputTokens: 12, outputTokens: 34, totalTokens: 46,
    })
    expect(extractUsage({ usage: { total_tokens: 46 } }).outputTokens).toBeNull()
  })

  it("uses MiniMax's first-token-to-last-token TPS definition", () => {
    const result = metrics({ outputTokens: 100, firstOutputAt: 1_000, lastOutputAt: 3_000, startedAt: 0, finishedAt: 4_000 })
    expect(result.ttftSeconds).toBe(1)
    expect(result.decodeSeconds).toBe(2)
    expect(result.decodeTokensPerSecond).toBe(50)
    expect(result.endToEndTokensPerSecond).toBe(25)
  })

  it('surfaces a useful API error without dumping an unbounded body', () => {
    expect(apiErrorDetail('{"error":{"message":"bad model"}}')).toBe('bad model')
    expect(apiErrorDetail('x'.repeat(500))).toHaveLength(300)
  })
})

describe('streaming benchmark', () => {
  it('streams text, reconciles local token counts, and times the decode window', async () => {
    const chunks = [
      'data: {"choices":[{"delta":{"role":"assistant"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":" world"}}]}\n\n',
      'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n',
      'data: {"choices":[],"usage":{"total_tokens":99}}\n\n',
      'data: [DONE]\n\n',
    ]
    const fetchImpl = vi.fn(async (_url, init) => {
      const body = JSON.parse(String(init?.body))
      expect(body).toMatchObject({
        model: 'MiniMax-M3', stream: true, stream_options: { include_usage: true },
        reasoning_split: true, thinking: { type: 'disabled' },
      })
      return new Response(byteStream(chunks), { status: 200, headers: { 'content-type': 'text/event-stream' } })
    })
    const tokenizer = { source: 'test/tokenizer', count: (text: string) => text.trim().split(/\s+/).filter(Boolean).length }
    let tick = 0
    const result = await runStreamingBenchmark({
      baseUrl: 'https://example.test/v1', model: 'MiniMax-M3', apiKey: 'secret',
      prompt: 'test', maxTokens: 100, temperature: 1, thinking: 'disabled', maxSeconds: 5,
      tokenizer, fetchImpl, now: () => (tick += 100),
    })

    expect(result.text).toBe('Hello world')
    expect(result.estimatedTokens).toBe(2)
    expect(result.tokenCountEstimated).toBe(true)
    expect(result.decodeTokensPerSecond).toBeGreaterThan(0)
    expect(result.finishReason).toBe('stop')
    expect(result.usage.totalTokens).toBe(99)
    expect(result.warnings.join(' ')).toMatch(/only total_tokens/)
    expect(fetchImpl).toHaveBeenCalledOnce()
  })


  it('prefers a server-reported completion count when the endpoint provides one', async () => {
    const fetchImpl = async () => new Response(byteStream([
      'data: {"choices":[{"delta":{"content":"done"},"finish_reason":"stop"}]}\n\n',
      'data: {"choices":[],"usage":{"prompt_tokens":4,"completion_tokens":1,"total_tokens":5}}\n\n',
    ]), { status: 200 })
    const result = await runStreamingBenchmark({
      baseUrl: 'https://example.test/v1', model: 'other-model', apiKey: 'secret',
      prompt: 'test', maxTokens: 20, temperature: 0, thinking: 'disabled', maxSeconds: 0,
      fetchImpl,
    })
    expect(result.serverOutputTokens).toBe(1)
    expect(result.tokenCountEstimated).toBe(false)
    expect(result.text).toBe('done')
  })
})