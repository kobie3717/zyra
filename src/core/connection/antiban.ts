import path from 'node:path'
import { FileStateAdapter, wrapSocket, type AntiBanConfig, type WarmUpState, type WrappedSocket } from 'baileys-antiban'
import { config } from '../../config/index.js'
import type { AppLogger } from '../../observability/logger.js'

/**
 * Socket extension to include Anti-Ban methods.
 */
type SocketWithAntiBan = {
  /** Properties injected by Anti-Ban wrapper. */
  antiban?: {
    /** Exports current warm-up state. */
    exportWarmUpState: () => WarmUpState
    /** Gets internal usage statistics. */
    getStats: () => unknown
  }
}

const buildRateLimiterConfig = () => ({
  ...(config.antibanMaxPerMinute !== undefined ? { maxPerMinute: config.antibanMaxPerMinute } : {}),
  ...(config.antibanMaxPerHour !== undefined ? { maxPerHour: config.antibanMaxPerHour } : {}),
  ...(config.antibanMaxPerDay !== undefined ? { maxPerDay: config.antibanMaxPerDay } : {}),
  ...(config.antibanMinDelayMs !== undefined ? { minDelayMs: config.antibanMinDelayMs } : {}),
  ...(config.antibanMaxDelayMs !== undefined ? { maxDelayMs: config.antibanMaxDelayMs } : {}),
  ...(config.antibanNewChatDelayMs !== undefined ? { newChatDelayMs: config.antibanNewChatDelayMs } : {}),
  ...(config.antibanMaxIdenticalMessages !== undefined ? { maxIdenticalMessages: config.antibanMaxIdenticalMessages } : {}),
  ...(config.antibanIdenticalMessageWindowMs !== undefined ? { identicalMessageWindowMs: config.antibanIdenticalMessageWindowMs } : {}),
  ...(config.antibanBurstAllowance !== undefined ? { burstAllowance: config.antibanBurstAllowance } : {}),
})

const buildWarmUpConfig = () => ({
  ...(config.antibanWarmUpDays !== undefined ? { warmUpDays: config.antibanWarmUpDays } : {}),
  ...(config.antibanWarmUpDay1Limit !== undefined ? { day1Limit: config.antibanWarmUpDay1Limit } : {}),
  ...(config.antibanWarmUpGrowthFactor !== undefined ? { growthFactor: config.antibanWarmUpGrowthFactor } : {}),
  ...(config.antibanInactivityThresholdHours !== undefined ? { inactivityThresholdHours: config.antibanInactivityThresholdHours } : {}),
})

const resolveStateAdapter = (connectionId: string): FileStateAdapter =>
  new FileStateAdapter(path.resolve(process.cwd(), config.antibanStateDir, connectionId))

/**
 * Creates Anti-Ban configuration based on application global settings.
 * @param logger Application logger to report risks and blocks.
 * @param connectionId Unique connection identifier (e.g. 'main').
 * @returns Configuration object compatible with baileys-antiban library.
 */
export function createAntiBanConfig(logger: AppLogger, connectionId: string): AntiBanConfig {
  const lidResolver = {
    canonical: config.antibanLidCanonical,
    ...(config.antibanLidMaxEntries !== undefined ? { maxEntries: config.antibanLidMaxEntries } : {}),
  } as const

  const antiBanConfig: AntiBanConfig = {
    logging: config.antibanLogging,
    ...buildRateLimiterConfig(),
    ...buildWarmUpConfig(),
    lidResolver,
    jidCanonicalizer: {
      enabled: config.antibanJidCanonicalizerEnabled,
      canonicalizeOutbound: true,
      learnFromEvents: true,
      resolverConfig: lidResolver,
    },
    health: {
      autoPauseAt: config.antibanAutoPauseAt,
      onRiskChange: (status) => {
        logger.warn('antiban changed risk level', {
          connectionId,
          risk: status.risk,
          score: status.score,
          reasons: status.reasons,
          recommendation: status.recommendation,
        })
      },
    },
    timelock: {
      onTimelockDetected: (state) => {
        logger.warn('antiban detected reachout timelock', {
          connectionId,
          enforcementType: state.enforcementType ?? null,
          expiresAt: state.expiresAt?.toISOString() ?? null,
          errorCount: state.errorCount,
        })
      },
      onTimelockLifted: (state) => {
        logger.info('antiban lifted reachout timelock', {
          connectionId,
          enforcementType: state.enforcementType ?? null,
          errorCount: state.errorCount,
        })
      },
    },
  }

  // Compatibility: some package versions don't expose `deafSession` in typing yet,
  // although runtime accepts the option.
  if (config.antibanDeafSessionEnabled) {
    ;(antiBanConfig as Record<string, unknown>).deafSession = {
      timeoutMs: config.antibanDeafSessionTimeoutMs,
      minUptimeMs: config.antibanDeafSessionMinUptimeMs,
      autoReconnect: config.antibanDeafSessionAutoReconnect,
      onDeafSession: (state: { silenceMs?: number; timeoutMs?: number; uptimeMs?: number; autoReconnect?: boolean }) => {
        logger.warn('antiban detected possibly deaf session', {
          connectionId,
          silenceMs: state.silenceMs ?? null,
          timeoutMs: state.timeoutMs ?? null,
          uptimeMs: state.uptimeMs ?? null,
          autoReconnect: state.autoReconnect ?? null,
        })
      },
    }
  }

  return antiBanConfig
}

/**
 * Loads Anti-Ban warm-up state from persistent storage.
 * @param connectionId Connection identifier.
 * @param logger Logger to report loading errors.
 * @returns Warm-up state or undefined if it doesn't exist or if Anti-Ban is disabled.
 */
export async function loadAntiBanWarmUpState(connectionId: string, logger: AppLogger): Promise<WarmUpState | undefined> {
  if (!config.antibanEnabled) return undefined
  try {
    const state = await resolveStateAdapter(connectionId).load('warmup')
    return state ?? undefined
  } catch (error) {
    logger.warn('failed to load antiban warm-up state', {
      connectionId,
      err: error,
    })
    return undefined
  }
}

/**
 * Saves current Anti-Ban warm-up state to persistent storage.
 * @param sock Socket wrapped by Anti-Ban.
 * @param connectionId Connection identifier.
 * @param logger Logger to report operation status.
 * @param reason Reason why state is being saved (e.g. 'periodic', 'disconnect').
 */
export async function saveAntiBanWarmUpState(sock: SocketWithAntiBan, connectionId: string, logger: AppLogger, reason: string): Promise<void> {
  if (!config.antibanEnabled || !sock.antiban) return
  try {
    await resolveStateAdapter(connectionId).save('warmup', sock.antiban.exportWarmUpState())
    logger.debug('antiban warm-up state saved', { connectionId, reason })
  } catch (error) {
    logger.warn('failed to save antiban warm-up state', {
      connectionId,
      reason,
      err: error,
    })
  }
}

/**
 * Wraps a Baileys socket with Anti-Ban protection layer.
 * @param sock Original socket instance.
 * @param logger Application logger.
 * @param connectionId Connection identifier.
 * @param warmUpState Optional initial warm-up state.
 * @returns Protected socket or original if Anti-Ban is disabled.
 */
export function wrapSocketWithAntiBan<T extends Record<string, unknown>>(
  sock: T,
  logger: AppLogger,
  connectionId: string,
  warmUpState?: WarmUpState
): T & Partial<WrappedSocket> {
  if (!config.antibanEnabled) return sock as T & Partial<WrappedSocket>
  const wrapped = wrapSocket(sock as unknown as Parameters<typeof wrapSocket>[0], createAntiBanConfig(logger, connectionId), warmUpState)
  logger.info('antiban enabled on socket', { connectionId })
  return wrapped as unknown as T & Partial<WrappedSocket>
}
