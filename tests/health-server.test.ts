import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import http from 'node:http'

const mockConfig = {
  healthEnabled: true,
  healthPort: 19109,
  healthHost: '127.0.0.1',
}

vi.mock('../src/config/index.js', () => ({ config: mockConfig }))

async function httpGet(port: number): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    http
      .get(`http://127.0.0.1:${port}/health`, (res) => {
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

  it('retorna 200 e {"status":"ok"}', async () => {
    const { startHealthServer } = await import('../src/observability/health-server.ts')
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), trace: vi.fn() }
    const handle = startHealthServer(logger as never)

    await wait(80)

    const res = await httpGet(19109)
    expect(res.status).toBe(200)
    expect(JSON.parse(res.body)).toEqual({ status: 'ok' })
    expect(logger.info).toHaveBeenCalledWith('health server iniciado', expect.objectContaining({ port: 19109 }))

    await handle.stop()
  })

  it('nao inicia quando healthEnabled=false', async () => {
    mockConfig.healthEnabled = false
    mockConfig.healthPort = 19110

    const { startHealthServer } = await import('../src/observability/health-server.ts')
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), trace: vi.fn() }
    const handle = startHealthServer(logger as never)

    await wait(50)

    await expect(httpGet(19110)).rejects.toThrow()
    expect(logger.info).not.toHaveBeenCalled()

    await handle.stop()
  })

  it('stop() fecha o servidor e libera a porta', async () => {
    mockConfig.healthPort = 19111

    const { startHealthServer } = await import('../src/observability/health-server.ts')
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), trace: vi.fn() }
    const handle = startHealthServer(logger as never)

    await wait(80)
    const before = await httpGet(19111)
    expect(before.status).toBe(200)

    await handle.stop()

    await expect(httpGet(19111)).rejects.toThrow()
  })
})
