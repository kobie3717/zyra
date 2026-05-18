import { createClient } from 'redis'
import { config } from '../../config/index.js'
import { createLogger } from '../../observability/logger.js'

let redisLoggerRef: ReturnType<typeof createLogger> | null = null
const getRedisLogger = () => {
  if (!redisLoggerRef) redisLoggerRef = createLogger()
  return redisLoggerRef
}

const REDIS_CONNECT_RETRY_BASE_MS = Math.max(100, config.redisConnectRetryBaseMs)
const REDIS_CONNECT_RETRY_MAX_MS = Math.max(REDIS_CONNECT_RETRY_BASE_MS, config.redisConnectRetryMaxMs)
const REDIS_CONNECT_MAX_ATTEMPTS = Math.max(1, config.redisConnectMaxAttempts)
const REDIS_CONNECT_RETRY_JITTER_MS = Math.max(0, config.redisConnectRetryJitterMs)

type AppRedisClient = ReturnType<typeof createClient>

let redisClient: AppRedisClient | null = null
let redisConnectPromise: Promise<AppRedisClient> | null = null
let redisClosePromise: Promise<void> | null = null
let shutdownHooksRegistered = false

const wait = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms)
  })

const computeBackoffMs = (attempt: number): number => {
  const exponential = REDIS_CONNECT_RETRY_BASE_MS * Math.pow(2, Math.max(0, attempt - 1))
  const jitter = Math.floor(Math.random() * REDIS_CONNECT_RETRY_JITTER_MS)
  return Math.min(REDIS_CONNECT_RETRY_MAX_MS, Math.floor(exponential + jitter))
}

const ensureRedisUrl = (): string => {
  if (!config.redisUrl) {
    throw new Error('WA_REDIS_URL not configured')
  }
  return config.redisUrl
}

const registerShutdownHooks = (): void => {
  if (shutdownHooksRegistered) return
  shutdownHooksRegistered = true
  process.once('beforeExit', () => {
    void closeRedisClient()
  })
}

const createRedisConnection = (): AppRedisClient => {
  const url = ensureRedisUrl()
  const client = createClient({
    url,
    socket: {
      reconnectStrategy: (retries) => computeBackoffMs(retries + 1),
    },
  })
  client.on('error', (error) => {
    getRedisLogger().error('redis client failure', { err: error })
  })
  client.on('end', () => {
    redisConnectPromise = null
  })
  registerShutdownHooks()
  return client
}

/**
 * Returns a singleton Redis client ready for use.
 * Implements connection attempts with backoff and allows retry on future calls.
 */
export async function getRedisClient(): Promise<AppRedisClient> {
  if (redisClient?.isReady) {
    return redisClient
  }
  if (redisConnectPromise) {
    return redisConnectPromise
  }

  if (!redisClient) {
    redisClient = createRedisConnection()
  }

  const client = redisClient
  redisConnectPromise = (async () => {
    let lastError: unknown
    for (let attempt = 1; attempt <= REDIS_CONNECT_MAX_ATTEMPTS; attempt++) {
      if (client.isReady) {
        return client
      }
      try {
        await client.connect()
        return client
      } catch (error) {
        lastError = error
        const hasMoreAttempts = attempt < REDIS_CONNECT_MAX_ATTEMPTS
        if (!hasMoreAttempts) break
        const delayMs = computeBackoffMs(attempt)
        await wait(delayMs)
      }
    }
    throw lastError instanceof Error ? lastError : new Error('failed to connect to Redis')
  })()
    .catch((error) => {
      redisConnectPromise = null
      throw error
    })
    .finally(() => {
      if (client.isReady) {
        redisConnectPromise = null
      }
    })

  return redisConnectPromise
}

/**
 * Closes the singleton Redis client gracefully.
 */
export async function closeRedisClient(): Promise<void> {
  if (!redisClient) return
  if (redisClosePromise) {
    await redisClosePromise
    return
  }

  const client = redisClient
  redisClosePromise = (async () => {
    try {
      if (client.isOpen) {
        await client.quit()
      } else {
        await client.disconnect()
      }
    } catch (error) {
      getRedisLogger().error('failed to close redis client, disconnecting', { err: error })
      await client.disconnect().catch(() => undefined)
    } finally {
      if (redisClient === client) {
        redisClient = null
      }
      redisConnectPromise = null
      redisClosePromise = null
    }
  })()

  await redisClosePromise
}
