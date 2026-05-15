import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import http from 'node:http'

const mockConfig = {
  healthEnabled: true,
  healthPort: 19109,
  healthHost: '127.0.0.1',
}

vi.mock('../src/config/index.js', () => ({ config: mockConfig }))

async function httpGet(port: number, path = '/health'): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    http
      .get(`http://127.0.0.1:${port}${path}`, (res) => {
        let body = ''
        res.on('data', (chunk: Buffer) => { body += chunk.toString() })
        res.on('end', () => resolve({ status: res.statusCode ?? 0, body }))
      })
      .on('error', reject)
  })
}

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

describe('health-server', () => {
  beforeEach(() => {
    vi.resetModules()
    mockConfig.healthEnabled = true
    mockConfig.healthPort = 19109
  })

  afterEach(() => {
    vi.resetModules()
  })

  const defaultState = () => ({ connected: true, socketGeneration: 1, reconnectAttempt: 0 })

  it('GET /health returns 200 with status, connected, uptime and socket stats', async () => {
    const { startHealthServer } = await import('../src/observability/health-server.ts')
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), trace: vi.fn() }
    const handle = startHealthServer({ logger: logger as never, getState: defaultState })

    await wait(80)

    const res = await httpGet(19109, '/health')
    expect(res.status).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.status).toBe('ok')
    expect(body.connected).toBe(true)
    expect(typeof body.uptime).toBe('number')
    expect(body.socketGeneration).toBe(1)
    expect(body.reconnectAttempt).toBe(0)
    expect(logger.info).toHaveBeenCalledWith('health server started', expect.objectContaining({ port: 19109 }))

    await handle.stop()
  })

  it('GET /ready returns 200 with socket stats when connected', async () => {
    mockConfig.healthPort = 19112
    const { startHealthServer } = await import('../src/observability/health-server.ts')
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), trace: vi.fn() }
    const handle = startHealthServer({ logger: logger as never, getState: defaultState })

    await wait(80)

    const res = await httpGet(19112, '/ready')
    expect(res.status).toBe(200)
    expect(JSON.parse(res.body)).toMatchObject({ status: 'ready', connected: true, socketGeneration: 1, reconnectAttempt: 0 })

    await handle.stop()
  })

  it('GET /ready returns 503 with socket stats when not connected', async () => {
    mockConfig.healthPort = 19113
    const { startHealthServer } = await import('../src/observability/health-server.ts')
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), trace: vi.fn() }
    const getState = () => ({ connected: false, socketGeneration: 3, reconnectAttempt: 2 })
    const handle = startHealthServer({ logger: logger as never, getState })

    await wait(80)

    const res = await httpGet(19113, '/ready')
    expect(res.status).toBe(503)
    expect(JSON.parse(res.body)).toMatchObject({ status: 'not ready', connected: false, socketGeneration: 3, reconnectAttempt: 2 })

    await handle.stop()
  })

  it('GET /health reflects live state changes', async () => {
    mockConfig.healthPort = 19114
    const { startHealthServer } = await import('../src/observability/health-server.ts')
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), trace: vi.fn() }
    let state = { connected: false, socketGeneration: 1, reconnectAttempt: 1 }
    const handle = startHealthServer({ logger: logger as never, getState: () => state })

    await wait(80)

    const before = JSON.parse((await httpGet(19114, '/health')).body)
    expect(before.connected).toBe(false)
    expect(before.reconnectAttempt).toBe(1)

    state = { connected: true, socketGeneration: 2, reconnectAttempt: 0 }
    const after = JSON.parse((await httpGet(19114, '/health')).body)
    expect(after.connected).toBe(true)
    expect(after.socketGeneration).toBe(2)
    expect(after.reconnectAttempt).toBe(0)

    await handle.stop()
  })

  it('does not start when healthEnabled=false', async () => {
    mockConfig.healthEnabled = false
    mockConfig.healthPort = 19110

    const { startHealthServer } = await import('../src/observability/health-server.ts')
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), trace: vi.fn() }
    const handle = startHealthServer({ logger: logger as never, getState: () => ({ connected: false, socketGeneration: 0, reconnectAttempt: 0 }) })

    await wait(50)

    await expect(httpGet(19110)).rejects.toThrow()
    expect(logger.info).not.toHaveBeenCalled()

    await handle.stop()
  })

  it('stop() closes the server and releases the port', async () => {
    mockConfig.healthPort = 19111

    const { startHealthServer } = await import('../src/observability/health-server.ts')
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), trace: vi.fn() }
    const handle = startHealthServer({ logger: logger as never, getState: defaultState })

    await wait(80)
    const before = await httpGet(19111)
    expect(before.status).toBe(200)

    await handle.stop()

    await expect(httpGet(19111)).rejects.toThrow()
  })
})
