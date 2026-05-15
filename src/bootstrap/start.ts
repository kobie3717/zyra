import type { WASocket } from 'baileys'
import { createLogger, type AppLogger } from '../observability/logger.js'
import { createSocket, isShutdownInProgress, registerShutdownHook, unregisterShutdownTarget } from '../core/connection/socket.js'
import { registerEvents } from '../events/register.js'
import { initMysqlSchema } from '../core/db/init.js'
import { config } from '../config/index.js'
import { startAntiBanMetricsServer } from '../observability/antiban-metrics.js'
import { startHealthServer } from '../observability/health-server.js'

let loggerRef: AppLogger | null = null
let schemaInitPromise: Promise<void> | null = null
let reconnectPromise: Promise<void> | null = null
let activeSocket: WASocket | null = null
let socketGeneration = 0
let reconnectAttempt = 0
let waConnected = false
let metricsServerHandle: { stop: () => Promise<void> } | null = null
let healthServerHandle: { stop: () => Promise<void> } | null = null

const computeReconnectDelay = (attempt: number): number => {
  if (attempt <= 1) return 0
  const base = config.reconnectBaseDelayMs
  const max = config.reconnectMaxDelayMs
  const exponential = base * Math.pow(2, attempt - 2)
  const jitter = Math.floor(Math.random() * Math.max(1, base * 0.25))
  return Math.min(max, Math.floor(exponential + jitter))
}

const getLogger = (): AppLogger => {
  if (!loggerRef) {
    loggerRef = createLogger()
  }
  return loggerRef
}

const wait = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms)
  })

const ensureSchemaReady = async () => {
  const logger = getLogger()
  if (!schemaInitPromise) {
    schemaInitPromise = initMysqlSchema(logger).catch((error) => {
      schemaInitPromise = null
      throw error
    })
  }
  await schemaInitPromise
}

const replaceSocket = async (reason: string) => {
  const logger = getLogger()
  await ensureSchemaReady()
  const connectionId = config.connectionId ?? 'default'
  const generation = ++socketGeneration
  const previousSocket = activeSocket

  if (previousSocket) {
    unregisterShutdownTarget(connectionId, previousSocket)
    logger.warn('closing previous socket to start new generation', {
      connectionId,
      generation,
      reason,
    })
    try {
      ;(previousSocket.ev as { removeAllListeners?: (...args: unknown[]) => unknown }).removeAllListeners?.()
    } catch (error) {
      logger.debug('failed to remove listeners from previous socket', {
        err: error,
        connectionId,
        generation,
      })
    }
    try {
      await previousSocket.end(new Error(`socket replaced: ${reason}`))
    } catch (error) {
      logger.debug('failed to close previous socket (proceeding with new connection)', {
        err: error,
        connectionId,
        generation,
      })
    }
  }

  waConnected = false
  const sock = await createSocket(connectionId, logger)
  activeSocket = sock

  const reconnectFromThisSocket = async () => {
    if (generation !== socketGeneration) {
      logger.debug('ignoring reconnect request from old socket', {
        connectionId,
        generation,
        currentGeneration: socketGeneration,
      })
      return
    }
    await scheduleReconnect(`connection_close_generation_${generation}`)
  }

  registerEvents({
    sock,
    logger,
    reconnect: reconnectFromThisSocket,
    connectionId,
    onConnected: () => {
      reconnectAttempt = 0
      waConnected = true
    },
    onDisconnected: () => {
      waConnected = false
    },
  })
  logger.info('Bot started successfully.', { connectionId, generation, reason })
}

const scheduleReconnect = async (reason: string) => {
  const logger = getLogger()
  if (isShutdownInProgress()) {
    logger.warn('reconnect ignored: shutdown in progress', { reason })
    return
  }
  if (reconnectPromise) {
    logger.warn('reconnect already in progress, ignoring parallel request', { reason })
    return reconnectPromise
  }

  reconnectPromise = (async () => {
    const attempt = ++reconnectAttempt
    const maxAttempts = config.reconnectMaxAttempts
    if (maxAttempts > 0 && attempt > maxAttempts) {
      logger.error('reconnect max attempts reached, giving up', { attempt, maxAttempts, reason })
      process.exit(1)
    }
    const delayMs = computeReconnectDelay(attempt)
    if (delayMs > 0) {
      logger.info('waiting before reconnecting', {
        delayMs,
        attempt,
        maxAttempts: maxAttempts || 'unlimited',
        reason,
      })
      await wait(delayMs)
    }
    await replaceSocket(reason)
  })().finally(() => {
    reconnectPromise = null
  })

  return reconnectPromise
}

/**
 * Initializes MySQL (if configured), creates socket and registers events.
 */
export async function start(): Promise<void> {
  const logger = getLogger()
  if (!metricsServerHandle && config.antibanEnabled && config.antibanMetricsEnabled) {
    metricsServerHandle = startAntiBanMetricsServer({
      logger,
      getStats: () => (activeSocket as { antiban?: { getStats?: () => unknown } } | null)?.antiban?.getStats?.() ?? {},
    })
    registerShutdownHook(() => metricsServerHandle!.stop())
  }
  if (!healthServerHandle) {
    healthServerHandle = startHealthServer({ logger, getState: () => ({ connected: waConnected }) })
    registerShutdownHook(() => healthServerHandle!.stop())
  }
  await scheduleReconnect('startup')
}
