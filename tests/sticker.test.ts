import { EventEmitter } from 'node:events'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

let spawnMock: ReturnType<typeof vi.fn>

vi.mock('node:child_process', () => ({
  spawn: (...args: unknown[]) => spawnMock(...args),
}))

vi.mock('baileys', () => ({
  downloadContentFromMessage: vi.fn(),
  extractMessageContent: vi.fn(),
  getContentType: vi.fn(),
  normalizeMessageContent: vi.fn(),
}))

const fsMock = {
  mkdtemp: vi.fn().mockResolvedValue('/tmp/zyra-sticker-test'),
  writeFile: vi.fn().mockResolvedValue(undefined),
  copyFile: vi.fn().mockResolvedValue(undefined),
  readFile: vi.fn().mockResolvedValue(Buffer.from('webp-data')),
  rm: vi.fn().mockResolvedValue(undefined),
}

vi.mock('node:fs/promises', () => ({ default: fsMock }))

/** Minimal WEBP header bytes: RIFF....WEBP */
const WEBP_HEADER = Buffer.from([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50])

/** Creates a fake child process whose lifecycle can be controlled manually. */
function createFakeChild() {
  const child = new EventEmitter() as EventEmitter & {
    stdout: EventEmitter
    stderr: EventEmitter
    kill: ReturnType<typeof vi.fn>
  }
  child.stdout = new EventEmitter()
  child.stderr = new EventEmitter()
  child.kill = vi.fn()
  return child
}

beforeEach(() => {
  vi.useFakeTimers()
  spawnMock = vi.fn()
})

afterEach(() => {
  vi.useRealTimers()
  vi.resetModules()
})

describe('runProcess (via sticker internals)', () => {
  it('cancela o timer SIGKILL quando o processo encerra após receber SIGTERM', async () => {
    const child = createFakeChild()
    spawnMock.mockReturnValue(child)

    const { createStickerFromMedia } = await import('../src/utils/sticker.ts')

    // Sticker mediaType: convertToWebp is a no-op (copyFile), then webpmux runProcess(timeout=12_000)
    // Attach .catch immediately to prevent unhandled rejection warnings while timers run
    let caughtError: Error | null = null
    const stickerPromise = createStickerFromMedia(
      { buffer: WEBP_HEADER, mediaType: 'sticker' },
      { packName: 'Test', packAuthor: 'Test' }
    ).catch((e: Error) => { caughtError = e })

    // Flush microtasks so async chain runs up to the runProcess setTimeout
    await vi.advanceTimersByTimeAsync(0)

    // Advance to trigger the 12_000ms outer SIGTERM timeout
    await vi.advanceTimersByTimeAsync(12_000)

    expect(child.kill).toHaveBeenCalledWith('SIGTERM')
    expect(child.kill).toHaveBeenCalledTimes(1)

    // Process exits from SIGTERM before the 1500ms SIGKILL fires
    child.emit('close', null)
    await vi.advanceTimersByTimeAsync(0)

    // Advance past the SIGKILL window — timer must be cleared, SIGKILL must NOT fire
    await vi.advanceTimersByTimeAsync(2_000)

    expect(child.kill).toHaveBeenCalledTimes(1)
    expect(child.kill).not.toHaveBeenCalledWith('SIGKILL')

    await stickerPromise
    expect(caughtError).not.toBeNull()
    expect(caughtError!.message).toMatch(/excedeu o timeout/)
  })

  it('cancela o timer SIGKILL quando o processo emite error após receber SIGTERM', async () => {
    const child = createFakeChild()
    spawnMock.mockReturnValue(child)

    const { createStickerFromMedia } = await import('../src/utils/sticker.ts')

    let caughtError: Error | null = null
    const stickerPromise = createStickerFromMedia(
      { buffer: WEBP_HEADER, mediaType: 'sticker' },
      { packName: 'Test', packAuthor: 'Test' }
    ).catch((e: Error) => { caughtError = e })

    await vi.advanceTimersByTimeAsync(0)
    await vi.advanceTimersByTimeAsync(12_000)

    expect(child.kill).toHaveBeenCalledWith('SIGTERM')
    expect(child.kill).toHaveBeenCalledTimes(1)

    // Process emits error (e.g. ENOENT) instead of close
    child.emit('error', new Error('spawn ENOENT'))
    await vi.advanceTimersByTimeAsync(2_000)

    expect(child.kill).toHaveBeenCalledTimes(1)
    expect(child.kill).not.toHaveBeenCalledWith('SIGKILL')

    await stickerPromise
    expect(caughtError).not.toBeNull()
    expect(caughtError!.message).toMatch(/ENOENT/)
  })
})
