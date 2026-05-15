import type { WASocket } from 'baileys'
import { createLogger, type AppLogger } from '../observability/logger.js'
import { createSocket, isShutdownInProgress, registerShutdownHook, unregisterShutdownTarget } from '../core/connection/socket.js'
import { registerEvents } from '../events/register.js'
import { initMysqlSchema } from '../core/db/init.js'
import { config } from '../config/index.js'
import { startAntiBanMetricsServer } from '../observability/antiban-metrics.js'
import { startHealthServer } from '../observability/health-server.js'

let loggerRef: AppLogger | null = null
const RECONNECT_MIN_DELAY_MS = Math.max(500, Number(process.env.WA_RECONNECT_MIN_DELAY_MS ?? 2500))
let schemaInitPromise: Promise<void> | null = null
let reconnectPromise: Promise<void> | null = null
let activeSocket: WASocket | null = null
let socketGeneration = 0
let lastReconnectAt = 0
let metricsServerHandle: { stop: () => Promise<void> } | null = null
let healthServerHandle: { stop: () => Promise<void> } | null = null

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

  registerEvents({ sock, logger, reconnect: reconnectFromThisSocket, connectionId })
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
    const elapsedSinceLastReconnect = Date.now() - lastReconnectAt
    const waitMs = Math.max(0, RECONNECT_MIN_DELAY_MS - elapsedSinceLastReconnect)
    if (waitMs > 0) {
      logger.info('waiting minimum window before reconnecting', { waitMs, reason })
      await wait(waitMs)
    }
    await replaceSocket(reason)
    lastReconnectAt = Date.now()
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
    healthServerHandle = startHealthServer(logger)
    registerShutdownHook(() => healthServerHandle!.stop())
  }
  await scheduleReconnect('startup')
}
