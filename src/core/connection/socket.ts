import makeWASocket, { Browsers, DEFAULT_CONNECTION_CONFIG, DisconnectReason, fetchLatestBaileysVersion, useMultiFileAuthState, type SignalRepositoryWithLIDStore } from 'baileys'
import type { WarmUpState } from 'baileys-antiban'
import { Boom } from '@hapi/boom'
import { config } from '../../config/index.js'
import type { AppLogger } from '../../observability/logger.js'
import { createBaileysLogger } from '../../observability/baileys-logger.js'
import { createBaileysStore } from '../../store/baileys-store.js'
import { getAuthState } from '../auth/state.js'
import { resolveAuthDir } from '../auth/auth-dir.js'
import { closeRedisClient } from '../redis/client.js'
import { closeMysqlPool } from '../db/mysql.js'
import { loadAntiBanWarmUpState, saveAntiBanWarmUpState, wrapSocketWithAntiBan } from './antiban.js'
import { createHistorySyncPolicy } from './history-sync.js'

/**
 * Type extension to access Baileys internal LID (Linked Identity) repositories.
 * @internal
 */
type SocketWithSignalRepository = {
  /** Signal repository containing LID mappings. */
  signalRepository?: SignalRepositoryWithLIDStore
}

/**
 * Socket extension to include immediate persistence methods and Anti-Ban.
 */
type SocketWithCredsFlush = ReturnType<typeof makeWASocket> & {
  /** Forces immediate persistence of credentials to disk/DB. */
  flushCredsNow?: (reason: string) => Promise<void>
  /** Anti-Ban actions coupled to the socket. */
  antiban?: {
    /** Exports current warm-up state. */
    exportWarmUpState: () => WarmUpState
    /** Gets Anti-Ban operation statistics. */
    getStats: () => unknown
  }
}

/** Type representing WhatsApp protocol version format (e.g. [2, 3000, 101]) */
type SocketVersion = typeof DEFAULT_CONNECTION_CONFIG.version

const VERSION_CACHE_TTL_MS = config.versionCacheTtlMs
/** Maximum timeout for graceful shutdown before forcing exit in milliseconds */
const SHUTDOWN_TIMEOUT_MS = Math.max(0, config.shutdownTimeoutMs)
/** Debounce to avoid storm of writes on creds.update in milliseconds */
const CREDS_DEBOUNCE_MS = Math.max(0, config.credsDebounceMs)
/** Error code associated with reach-out timelock/account restriction on sends/calls */
const REACHOUT_TIMELOCK_STATUS_CODE = 463

/** Volatile WhatsApp Web version cache */
let cachedVersion: { version: SocketVersion; fetchedAt: number } | null = null

/**
 * Resolves the ideal WhatsApp Web version for the connection.
 * @remarks
 * Implements in-memory cache to avoid bottlenecks on boot of multiple instances.
 * If fetch fails, uses last cached version or the library's default constant.
 * @param logger Logger instance for version alert registration.
 * @returns Promise with version [major, minor, patch].
 */
async function resolveBaileysVersion(logger: AppLogger): Promise<SocketVersion> {
  const cached = cachedVersion
  if (cached && Date.now() - cached.fetchedAt < VERSION_CACHE_TTL_MS) {
    return cached.version
  }
  try {
    const latest = await fetchLatestBaileysVersion()
    if ('error' in latest && latest.error) {
      logger.warn('failed to fetch latest Baileys version, using fallback', { err: latest.error })
      return cached?.version ?? DEFAULT_CONNECTION_CONFIG.version
    }

    if (!latest.isLatest) {
      logger.warn('outdated Baileys version detected', {
        version: latest.version,
      })
    }

    cachedVersion = { version: latest.version, fetchedAt: Date.now() }
    return latest.version
  } catch (error) {
    logger.warn('error fetching version, using default', { err: error })
    return cached?.version ?? DEFAULT_CONNECTION_CONFIG.version
  }
}

/**
 * Initializes authentication state based on infrastructure configuration.
 * @remarks
 * Attempts to use centralized strategy (MySQL/Redis).
 * On critical error, falls back to local filesystem to ensure availability.
 * @param connectionId Unique connection ID.
 * @param logger Logger for authentication failure tracking.
 * @returns Authentication state and function to save credentials.
 */
async function resolveAuthState(connectionId: string, logger: AppLogger) {
  try {
    return await getAuthState(connectionId)
  } catch (error) {
    logger.error('failed to resolve auth state, activating local fallback', {
      err: error,
    })
    const { state, saveCreds } = await useMultiFileAuthState(resolveAuthDir(connectionId))
    return { state, saveCreds }
  }
}

/**
 * Defines the contract for objects registered for graceful shutdown.
 */
type ShutdownTarget = {
  /** Active Baileys socket instance. */
  sock: SocketWithCredsFlush
  /** Data repository linked to the connection. */
  store: ReturnType<typeof createBaileysStore>
  /** Credentials persistence function. */
  saveCreds: () => Promise<void>
  /** Anti-Ban state persistence. */
  saveAntiBanState?: (reason: string) => Promise<void>
  /** Timer and resource cleanup function. */
  cleanup?: () => void
  /** Application logger. */
  logger: AppLogger
  /** Connection ID. */
  connectionId: string
}

/** Collection of active instances for shutdown management */
const shutdownTargets = new Set<ShutdownTarget>()
/** Extra callbacks to execute on shutdown (e.g. stop HTTP servers) */
const shutdownHooks: Array<() => Promise<void>> = []
/** Flag to ensure process signal listener is registered only once */
let shutdownRegistered = false
/** Control flag to prevent multiple executions of shutdown flow */
let shutdownInProgress = false

/** Registers a callback for execution during graceful shutdown. */
export function registerShutdownHook(fn: () => Promise<void>): void {
  shutdownHooks.push(fn)
}

/**
 * Registers OS signal listeners (SIGINT, SIGTERM) for clean shutdown.
 * @remarks
 * When a signal is received, the function iterates through all active sockets,
 * persists pending credentials and clears references before closing the process.
 * @internal
 */
const registerGracefulShutdown = () => {
  if (shutdownRegistered) return
  shutdownRegistered = true

  const handler = async (signal: string) => {
    if (shutdownInProgress) return
    shutdownInProgress = true
    const targets = Array.from(shutdownTargets)
    shutdownTargets.clear()

    const baseLogger = targets[0]?.logger ?? null
    const forceExit =
      SHUTDOWN_TIMEOUT_MS > 0
        ? setTimeout(() => {
            if (baseLogger) {
              baseLogger.error('shutdown took too long, forcing exit', { signal })
            } else {
              console.error('shutdown took too long, forcing exit', {
                signal,
              })
            }
            process.exit(1)
          }, SHUTDOWN_TIMEOUT_MS)
        : null

    try {
      await Promise.all(
        targets.map(async ({ sock, saveCreds, saveAntiBanState, cleanup, logger, connectionId }) => {
          logger.warn('executing graceful socket shutdown', {
            signal,
            connectionId,
          })
          cleanup?.()
          if (saveAntiBanState) {
            await saveAntiBanState('shutdown')
          }
          try {
            await saveCreds()
          } catch (error) {
            logger.error('failed to persist credentials during shutdown', { err: error })
          }
          if (typeof sock.end === 'function') {
            await sock.end(undefined)
          }
        })
      )
      await closeRedisClient()
      await closeMysqlPool()
      await Promise.allSettled(shutdownHooks.map((fn) => fn()))
    } catch (error) {
      if (baseLogger) {
        baseLogger.error('failure during graceful shutdown', { err: error })
      } else {
        console.error('failure during graceful shutdown', { err: error })
      }
    } finally {
      if (forceExit) clearTimeout(forceExit)
    }
    process.exit(0)
  }

  process.once('SIGINT', () => void handler('SIGINT'))
  process.once('SIGTERM', () => void handler('SIGTERM'))
}

/**
 * Factory for creation and complete configuration of Baileys Socket.
 * * @remarks
 * This function orchestrates several vital components:
 * 1. **Auth**: Loads the defined strategy (MySQL, Redis, Disk).
 * 2. **Version**: Resolves protocol version with caching.
 * 3. **Sync**: Configures history sync policies to avoid excessive memory consumption.
 * 4. **Store**: Links message and metadata repository to event bus.
 * 5. **Graceful Shutdown**: Registers instance for safe persistence on process termination.
 * * @example
 * ```typescript
 * const sock = await createSocket('instance-1', logger);
 * ```
 * * @param connectionId - Unique session identifier (connection_id).
 * @param logger - Logger instance for monitoring.
 * @returns A configured `WASocket` instance.
 */
export async function createSocket(connectionId: string, logger: AppLogger) {
  const store = createBaileysStore(connectionId)
  const strategy = config.mysqlUrl ? 'mysql' : config.redisUrl ? 'redis' : 'disk'

  logger.info('initializing socket setup', { strategy, connectionId })

  const { state, saveCreds } = await resolveAuthState(connectionId, logger)
  const version = await resolveBaileysVersion(logger)

  const historySyncPolicy = createHistorySyncPolicy(state.creds)

  const rawSock = makeWASocket({
    auth: state,
    version,
    browser: Browsers.ubuntu('Zyra System'),
    logger: createBaileysLogger(logger),
    emitOwnEvents: true,
    fireInitQueries: false,
    syncFullHistory: false,
    shouldSyncHistoryMessage: historySyncPolicy.shouldSyncHistoryMessage,
    shouldIgnoreJid: (jid) => config.ignoreStatusBroadcast && jid === 'status@broadcast',
    getMessage: store.getMessage,
    cachedGroupMetadata: store.getGroupMetadata,
    msgRetryCounterCache: store.caches.msgRetryCounterCache,
    callOfferCache: store.caches.callOfferCache,
    placeholderResendCache: store.caches.placeholderResendCache,
    userDevicesCache: store.caches.userDevicesCache,
    mediaCache: store.caches.mediaCache,
  })

  // Initial bot JID synchronization
  store.setSelfJid(rawSock.user?.id ?? null)

  const warmUpState = await loadAntiBanWarmUpState(connectionId, logger)
  const sock = wrapSocketWithAntiBan(rawSock, logger, connectionId, warmUpState) as SocketWithCredsFlush

  // Listen for cryptographic keys and tokens updates
  let credsSaveTimer: NodeJS.Timeout | null = null
  let credsSaveRequested = false
  let credsSaveRunner: Promise<void> | null = null
  let antibanStateTimer: NodeJS.Timeout | null = null

  const clearAntibanStateTimer = () => {
    if (!antibanStateTimer) return
    clearInterval(antibanStateTimer)
    antibanStateTimer = null
  }

  const startAntibanStateTimer = () => {
    if (!config.antibanEnabled || config.antibanStateSaveIntervalMs <= 0) return
    if (antibanStateTimer) return
    antibanStateTimer = setInterval(() => {
      void saveAntibanState('interval')
    }, config.antibanStateSaveIntervalMs)
  }

  const saveAntibanState = async (reason: string): Promise<void> => {
    await saveAntiBanWarmUpState(sock, connectionId, logger, reason)
  }

  const flushCredsSave = (): Promise<void> => {
    credsSaveRequested = true
    if (credsSaveRunner) return credsSaveRunner

    credsSaveRunner = (async () => {
      while (credsSaveRequested) {
        credsSaveRequested = false
        try {
          await saveCreds()
        } catch (error) {
          logger.error('error saving credentials during lifecycle', {
            err: error,
          })
        }
      }
    })().finally(() => {
      credsSaveRunner = null
    })

    return credsSaveRunner
  }

  const flushCredsNow = async (reason: string): Promise<void> => {
    if (credsSaveTimer) {
      clearTimeout(credsSaveTimer)
      credsSaveTimer = null
    }
    logger.info('forcing immediate credentials persistence', { connectionId, reason })
    await flushCredsSave()
  }

  const forceCredsSave = (reason: string) => {
    void flushCredsNow(reason)
  }

  const scheduleCredsSave = () => {
    if (CREDS_DEBOUNCE_MS <= 0) {
      void flushCredsSave()
      return
    }
    if (credsSaveTimer) clearTimeout(credsSaveTimer)
    credsSaveTimer = setTimeout(() => {
      credsSaveTimer = null
      void flushCredsSave()
    }, CREDS_DEBOUNCE_MS)
  }

  sock.ev.on('connection.update', (update) => {
    if (update.connection && update.connection !== 'open') {
      clearAntibanStateTimer()
    }

    if (update.connection === 'open') {
      startAntibanStateTimer()
      store.setSelfJid(sock.user?.id ?? null)
      logger.info('connection status: open', { connectionId })
    }

    if (update.isNewLogin) {
      historySyncPolicy.allowOnceForNewLogin()
      forceCredsSave('new_login')
    }

    if (update.connection === 'close') {
      clearAntibanStateTimer()
      if (credsSaveTimer) {
        clearTimeout(credsSaveTimer)
        credsSaveTimer = null
      }
      void saveAntibanState('connection_close')
      const statusCode = (update.lastDisconnect?.error as Boom | undefined)?.output?.statusCode
      logger.warn('connection status: closed', { connectionId, statusCode })
      if (statusCode === REACHOUT_TIMELOCK_STATUS_CODE) {
        logger.error('account restriction alert detected (463)', {
          connectionId,
          statusCode,
          recommendation: 'validate account timelock and reduce sends to new contacts',
        })
      }

      if (statusCode === DisconnectReason.restartRequired) {
        forceCredsSave('restart_required')
      }

      if (statusCode === DisconnectReason.loggedOut) {
        logger.error('session invalidated/removed, requires re-pairing', {
          connectionId,
        })
        store.setSelfJid(null)
      }
    }
  })

  // Bind LID repository if available (WhatsApp Multi-Device v2)
  const lidMappingStore = (rawSock as SocketWithSignalRepository).signalRepository?.lidMapping
  if (lidMappingStore) {
    store.bindLidMappingStore(lidMappingStore)
  }

  // Attach store to socket event flow
  store.bind(sock.ev)

  sock.ev.on('creds.update', scheduleCredsSave)

  ;(sock as SocketWithCredsFlush).flushCredsNow = flushCredsNow

  // Registration for safe process termination
  shutdownTargets.add({
    sock,
    store,
    saveCreds,
    saveAntiBanState: config.antibanEnabled ? saveAntibanState : undefined,
    cleanup: clearAntibanStateTimer,
    logger,
    connectionId,
  })
  registerGracefulShutdown()

  return sock
}

/**
 * Removes a shutdown target from the current connection if it still points to the same socket.
 */
export const unregisterShutdownTarget = (connectionId: string, sock?: ReturnType<typeof makeWASocket>) => {
  for (const target of shutdownTargets) {
    if (target.connectionId !== connectionId) continue
    if (sock && target.sock !== sock) continue
    shutdownTargets.delete(target)
  }
}

/**
 * Indicates whether the process is in graceful shutdown cycle.
 */
export const isShutdownInProgress = () => shutdownInProgress
