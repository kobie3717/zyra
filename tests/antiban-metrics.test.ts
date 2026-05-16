import { beforeEach, describe, expect, it, vi } from 'vitest'
import http from 'node:http'

const mockConfig = {
  antibanEnabled: true,
  antibanMetricsEnabled: true,
  antibanMetricsPort: 19200,
  antibanMetricsHost: '127.0.0.1',
  antibanMetricsPath: '/antiban-metrics',
}

vi.mock('../src/config/index.js', () => ({ config: mockConfig }))

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

async function httpGet(port: number, path: string, agent?: http.Agent): Promise<{ status: number; body: string; contentType: string | undefined }> {
  return new Promise((resolve, reject) => {
    http
      .get(`http://127.0.0.1:${port}${path}`, { agent }, (res) => {
        let body = ''
        res.on('data', (chunk: Buffer) => { body += chunk.toString() })
        res.on('end', () => resolve({ status: res.statusCode ?? 0, body, contentType: res.headers['content-type'] }))
      })
      .on('error', reject)
  })
}

const makeLogger = () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), trace: vi.fn() })

describe('antiban-metrics', () => {
  beforeEach(() => {
    vi.resetModules()
    mockConfig.antibanEnabled = true
    mockConfig.antibanMetricsEnabled = true
    mockConfig.antibanMetricsPort = 19200
    mockConfig.antibanMetricsPath = '/antiban-metrics'
  })

  it('returns Prometheus text for nested stats object', async () => {
    const { startAntiBanMetricsServer } = await import('../src/observability/antiban-metrics.ts')
    const handle = startAntiBanMetricsServer({
      logger: makeLogger() as never,
      getStats: () => ({ rateLimiter: { sent: 42, queued: 7 }, paused: false }),
    })

    await wait(80)

    const res = await httpGet(19200, '/antiban-metrics')
    expect(res.status).toBe(200)
    expect(res.contentType).toMatch(/text\/plain/)
    expect(res.body).toContain('zyra_antiban_rateLimiter_sent 42')
    expect(res.body).toContain('zyra_antiban_rateLimiter_queued 7')
    expect(res.body).toContain('zyra_antiban_paused 0')

    await handle.stop()
  })

  it('renders boolean true as 1', async () => {
    mockConfig.antibanMetricsPort = 19201
    const { startAntiBanMetricsServer } = await import('../src/observability/antiban-metrics.ts')
    const handle = startAntiBanMetricsServer({
      logger: makeLogger() as never,
      getStats: () => ({ active: true }),
    })

    await wait(80)

    const res = await httpGet(19201, '/antiban-metrics')
    expect(res.body).toContain('zyra_antiban_active 1')

    await handle.stop()
  })

  it('renders string values as labelled gauge', async () => {
    mockConfig.antibanMetricsPort = 19202
    const { startAntiBanMetricsServer } = await import('../src/observability/antiban-metrics.ts')
    const handle = startAntiBanMetricsServer({
      logger: makeLogger() as never,
      getStats: () => ({ mode: 'strict' }),
    })

    await wait(80)

    const res = await httpGet(19202, '/antiban-metrics')
    expect(res.body).toContain('zyra_antiban_mode{value="strict"} 1')

    await handle.stop()
  })

  it('returns 404 for unknown paths', async () => {
    mockConfig.antibanMetricsPort = 19203
    const { startAntiBanMetricsServer } = await import('../src/observability/antiban-metrics.ts')
    const handle = startAntiBanMetricsServer({
      logger: makeLogger() as never,
      getStats: () => ({}),
    })

    await wait(80)

    const res = await httpGet(19203, '/other')
    expect(res.status).toBe(404)

    await handle.stop()
  })

  it('returns 500 when getStats throws', async () => {
    mockConfig.antibanMetricsPort = 19204
    const { startAntiBanMetricsServer } = await import('../src/observability/antiban-metrics.ts')
    const logger = makeLogger()
    const handle = startAntiBanMetricsServer({
      logger: logger as never,
      getStats: () => { throw new Error('boom') },
    })

    await wait(80)

    const res = await httpGet(19204, '/antiban-metrics')
    expect(res.status).toBe(500)
    expect(logger.error).toHaveBeenCalledWith('failed to render antiban metrics', expect.objectContaining({ err: expect.any(Error) }))

    await handle.stop()
  })

  it('does not start when disabled', async () => {
    mockConfig.antibanEnabled = false
    mockConfig.antibanMetricsPort = 19205
    const { startAntiBanMetricsServer } = await import('../src/observability/antiban-metrics.ts')
    const handle = startAntiBanMetricsServer({ logger: makeLogger() as never, getStats: () => ({}) })

    await wait(50)
    await expect(httpGet(19205, '/antiban-metrics')).rejects.toThrow()
    await handle.stop()
  })

  it('stop() resolves promptly even with an active keep-alive connection', async () => {
    mockConfig.antibanMetricsPort = 19206
    const { startAntiBanMetricsServer } = await import('../src/observability/antiban-metrics.ts')
    const handle = startAntiBanMetricsServer({
      logger: makeLogger() as never,
      getStats: () => ({ ok: true }),
    })

    await wait(80)

    const agent = new http.Agent({ keepAlive: true })
    await httpGet(19206, '/antiban-metrics', agent)

    await expect(
      Promise.race([
        handle.stop(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('stop() timed out')), 1000)),
      ])
    ).resolves.toBeUndefined()

    agent.destroy()
  })
})
