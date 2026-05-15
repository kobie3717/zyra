import process from 'node:process'

function readBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback
  return value.toLowerCase() !== 'false'
}

function readNumber(value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function readOptionalNumber(value: string | undefined): number | undefined {
  if (value === undefined) return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

function readRiskLevel(value: string | undefined, fallback: 'low' | 'medium' | 'high' | 'critical'): 'low' | 'medium' | 'high' | 'critical' {
  if (!value) return fallback
  const normalized = value.trim().toLowerCase()
  if (normalized === 'low' || normalized === 'medium' || normalized === 'high' || normalized === 'critical') {
    return normalized
  }
  return fallback
}

function readCanonicalJidMode(value: string | undefined, fallback: 'pn' | 'lid'): 'pn' | 'lid' {
  if (!value) return fallback
  const normalized = value.trim().toLowerCase()
  if (normalized === 'pn' || normalized === 'lid') {
    return normalized
  }
  return fallback
}

/**
 * Global application configuration derived from environment variables.
 * Centralizes access to connection parameters, database, security and bot behavior.
 */
export const config = {
  /** Directory for local storage of authentication credentials (WA_AUTH_DIR). */
  get authDir() {
    return process.env.WA_AUTH_DIR ?? 'data/auth'
  },
  /** Prefix to identify commands (WA_COMMAND_PREFIX). */
  get commandPrefix() {
    return (process.env.WA_COMMAND_PREFIX ?? '!').trim() || '!'
  },
  /** Whether to print QR Code in terminal during pairing (WA_PRINT_QR). */
  get printQRInTerminal() {
    return readBoolean(process.env.WA_PRINT_QR, true)
  },
  /** Application log verbosity level (LOG_LEVEL). */
  get logLevel() {
    return process.env.LOG_LEVEL ?? 'info'
  },
  /** Redis connection URL (WA_REDIS_URL). */
  get redisUrl() {
    return process.env.WA_REDIS_URL
  },
  /** Prefix for keys stored in Redis (WA_REDIS_PREFIX). */
  get redisPrefix() {
    return process.env.WA_REDIS_PREFIX ?? 'zyra:conexao'
  },
  /** MySQL connection URL (MYSQL_URL or WA_DB_URL). */
  get mysqlUrl() {
    return process.env.MYSQL_URL ?? process.env.WA_DB_URL
  },
  /** Interval in ms to attempt MySQL reconnection on failure (WA_MYSQL_RETRY_MS). */
  get mysqlRetryIntervalMs() {
    return readNumber(process.env.WA_MYSQL_RETRY_MS, 60_000)
  },
  /** Unique identifier for bot connection (WA_CONNECTION_ID). */
  get connectionId() {
    return process.env.WA_CONNECTION_ID ?? 'default'
  },
  /** Whether bot should process its own sent messages (WA_ACCEPT_OWN_MESSAGES). */
  get allowOwnMessages() {
    return readBoolean(process.env.WA_ACCEPT_OWN_MESSAGES, false)
  },
  /** Whether to ignore status@broadcast messages to reduce session/decryption noise (WA_IGNORE_STATUS_BROADCAST). */
  get ignoreStatusBroadcast() {
    return readBoolean(process.env.WA_IGNORE_STATUS_BROADCAST, true)
  },
  /** Whether to persist authentication keys on disk even when using Redis/MySQL (WA_AUTH_PERSIST_KEYS). */
  get authPersistKeysOnDisk() {
    return readBoolean(process.env.WA_AUTH_PERSIST_KEYS, false)
  },
  /** Whether Anti-Ban module is enabled (WA_ANTIBAN_ENABLED). */
  get antibanEnabled() {
    return readBoolean(process.env.WA_ANTIBAN_ENABLED, false)
  },
  /** Whether to log Anti-Ban actions in detail (WA_ANTIBAN_LOGGING). */
  get antibanLogging() {
    return readBoolean(process.env.WA_ANTIBAN_LOGGING, false)
  },
  /** Directory to save persistent Anti-Ban state (WA_ANTIBAN_STATE_DIR). */
  get antibanStateDir() {
    return process.env.WA_ANTIBAN_STATE_DIR ?? 'data/antiban'
  },
  /** Interval to automatically save Anti-Ban state (WA_ANTIBAN_STATE_SAVE_MS). */
  get antibanStateSaveIntervalMs() {
    return readNumber(process.env.WA_ANTIBAN_STATE_SAVE_MS, 300_000)
  },
  /** Risk level at which Anti-Ban automatically pauses the bot (WA_ANTIBAN_AUTO_PAUSE_AT). */
  get antibanAutoPauseAt() {
    return readRiskLevel(process.env.WA_ANTIBAN_AUTO_PAUSE_AT, 'high')
  },
  /** Maximum messages per minute allowed by Anti-Ban (WA_ANTIBAN_MAX_PER_MINUTE). */
  get antibanMaxPerMinute() {
    return readOptionalNumber(process.env.WA_ANTIBAN_MAX_PER_MINUTE)
  },
  /** Maximum messages per hour allowed by Anti-Ban (WA_ANTIBAN_MAX_PER_HOUR). */
  get antibanMaxPerHour() {
    return readOptionalNumber(process.env.WA_ANTIBAN_MAX_PER_HOUR)
  },
  /** Maximum messages per day allowed by Anti-Ban (WA_ANTIBAN_MAX_PER_DAY). */
  get antibanMaxPerDay() {
    return readOptionalNumber(process.env.WA_ANTIBAN_MAX_PER_DAY)
  },
  /** Minimum delay between messages in ms (WA_ANTIBAN_MIN_DELAY_MS). */
  get antibanMinDelayMs() {
    return readOptionalNumber(process.env.WA_ANTIBAN_MIN_DELAY_MS)
  },
  /** Maximum delay between messages in ms (WA_ANTIBAN_MAX_DELAY_MS). */
  get antibanMaxDelayMs() {
    return readOptionalNumber(process.env.WA_ANTIBAN_MAX_DELAY_MS)
  },
  /** Additional delay when starting chat with new contact (WA_ANTIBAN_NEW_CHAT_DELAY_MS). */
  get antibanNewChatDelayMs() {
    return readOptionalNumber(process.env.WA_ANTIBAN_NEW_CHAT_DELAY_MS)
  },
  /** Maximum identical messages before blocking (WA_ANTIBAN_MAX_IDENTICAL_MESSAGES). */
  get antibanMaxIdenticalMessages() {
    return readOptionalNumber(process.env.WA_ANTIBAN_MAX_IDENTICAL_MESSAGES)
  },
  /** Window in ms for counting identical messages (WA_ANTIBAN_IDENTICAL_WINDOW_MS). */
  get antibanIdenticalMessageWindowMs() {
    return readOptionalNumber(process.env.WA_ANTIBAN_IDENTICAL_WINDOW_MS)
  },
  /** Number of burst messages allowed (WA_ANTIBAN_BURST_ALLOWANCE). */
  get antibanBurstAllowance() {
    return readOptionalNumber(process.env.WA_ANTIBAN_BURST_ALLOWANCE)
  },
  /** Account warm-up period in days (WA_ANTIBAN_WARMUP_DAYS). */
  get antibanWarmUpDays() {
    return readOptionalNumber(process.env.WA_ANTIBAN_WARMUP_DAYS)
  },
  /** Message limit on first day of warm-up (WA_ANTIBAN_WARMUP_DAY1_LIMIT). */
  get antibanWarmUpDay1Limit() {
    return readOptionalNumber(process.env.WA_ANTIBAN_WARMUP_DAY1_LIMIT)
  },
  /** Daily growth factor for limit during warm-up (WA_ANTIBAN_WARMUP_GROWTH_FACTOR). */
  get antibanWarmUpGrowthFactor() {
    return readOptionalNumber(process.env.WA_ANTIBAN_WARMUP_GROWTH_FACTOR)
  },
  /** Hours of inactivity to consider warm-up interrupted (WA_ANTIBAN_INACTIVITY_THRESHOLD_HOURS). */
  get antibanInactivityThresholdHours() {
    return readOptionalNumber(process.env.WA_ANTIBAN_INACTIVITY_THRESHOLD_HOURS)
  },
  /** Enables LID/PN mitigation (JID canonicalizer) in antiban (WA_ANTIBAN_JID_CANONICALIZER_ENABLED). */
  get antibanJidCanonicalizerEnabled() {
    return readBoolean(process.env.WA_ANTIBAN_JID_CANONICALIZER_ENABLED, true)
  },
  /** Canonical form used in LID/PN mitigation: pn or lid (WA_ANTIBAN_LID_CANONICAL). */
  get antibanLidCanonical() {
    return readCanonicalJidMode(process.env.WA_ANTIBAN_LID_CANONICAL, 'pn')
  },
  /** Maximum LID↔PN mappings in memory (WA_ANTIBAN_LID_MAX_ENTRIES). */
  get antibanLidMaxEntries() {
    return readOptionalNumber(process.env.WA_ANTIBAN_LID_MAX_ENTRIES)
  },
  /** Enables deaf session detector (socket connected without message events). */
  get antibanDeafSessionEnabled() {
    return readBoolean(process.env.WA_ANTIBAN_DEAF_SESSION_ENABLED, true)
  },
  /** Timeout in ms without activity to consider session "deaf". */
  get antibanDeafSessionTimeoutMs() {
    return readNumber(process.env.WA_ANTIBAN_DEAF_SESSION_TIMEOUT_MS, 5 * 60_000)
  },
  /** Minimum uptime in ms before starting to detect "deaf" session. */
  get antibanDeafSessionMinUptimeMs() {
    return readNumber(process.env.WA_ANTIBAN_DEAF_SESSION_MIN_UPTIME_MS, 2 * 60_000)
  },
  /** Whether "deaf" session detector should force auto-reconnect. */
  get antibanDeafSessionAutoReconnect() {
    return readBoolean(process.env.WA_ANTIBAN_DEAF_SESSION_AUTO_RECONNECT, true)
  },
  /** Enables Prometheus /metrics endpoint for Anti-Ban statistics. */
  get antibanMetricsEnabled() {
    return readBoolean(process.env.WA_ANTIBAN_METRICS_ENABLED, false)
  },
  /** Bind host for metrics server. */
  get antibanMetricsHost() {
    return process.env.WA_ANTIBAN_METRICS_HOST ?? '0.0.0.0'
  },
  /** Port for metrics server. */
  get antibanMetricsPort() {
    return readNumber(process.env.WA_ANTIBAN_METRICS_PORT, 9108)
  },
  /** TTL for WhatsApp protocol version cache (WA_VERSION_CACHE_TTL_MS). */
  get versionCacheTtlMs() {
    return readNumber(process.env.WA_VERSION_CACHE_TTL_MS, 24 * 60 * 60 * 1000)
  },
  /** HTTP path for metrics exposure. */
  get antibanMetricsPath() {
    const value = (process.env.WA_ANTIBAN_METRICS_PATH ?? '/metrics').trim()
    if (!value) return '/metrics'
    return value.startsWith('/') ? value : `/${value}`
  },
  /** Whether to automatically download received media to local disk (WA_MEDIA_AUTO_DOWNLOAD). */
  get mediaAutoDownload() {
    return readBoolean(process.env.WA_MEDIA_AUTO_DOWNLOAD, false)
  },
  /** Base directory to save downloaded media locally (WA_MEDIA_DOWNLOAD_DIR). */
  get mediaDownloadDir() {
    return process.env.WA_MEDIA_DOWNLOAD_DIR ?? 'data/media'
  },
  /** Maximum local media storage limit in bytes (WA_MEDIA_MAX_BYTES). */
  get mediaMaxBytes() {
    return readNumber(process.env.WA_MEDIA_MAX_BYTES, 10 * 1024 * 1024 * 1024)
  },
  /** Number of days for local media retention (WA_MEDIA_RETENTION_DAYS). */
  get mediaRetentionDays() {
    return readNumber(process.env.WA_MEDIA_RETENTION_DAYS, 7)
  },
  /** TTL in ms for newsletter metadata cache (WA_NEWSLETTER_METADATA_SYNC_TTL_MS). */
  get newsletterMetadataSyncTtlMs() {
    return readNumber(process.env.WA_NEWSLETTER_METADATA_SYNC_TTL_MS, 5 * 60_000)
  },
  /** TTL in ms for newsletter metadata retry after failure (WA_NEWSLETTER_METADATA_RETRY_TTL_MS). */
  get newsletterMetadataRetryTtlMs() {
    return readNumber(process.env.WA_NEWSLETTER_METADATA_RETRY_TTL_MS, 30_000)
  },
  /** Base in ms for newsletter media retry backoff (WA_NEWSLETTER_MEDIA_RETRY_BASE_MS). */
  get newsletterMediaRetryBaseMs() {
    return readNumber(process.env.WA_NEWSLETTER_MEDIA_RETRY_BASE_MS, 10_000)
  },
  /** Maximum retry attempts for newsletter media (WA_NEWSLETTER_MEDIA_RETRY_MAX_ATTEMPTS). */
  get newsletterMediaRetryMaxAttempts() {
    return readNumber(process.env.WA_NEWSLETTER_MEDIA_RETRY_MAX_ATTEMPTS, 5)
  },
  /** Maximum consecutive failures in backfill worker before shutdown (WA_BACKFILL_MAX_FAILURES). */
  get backfillMaxFailures() {
    return readNumber(process.env.WA_BACKFILL_MAX_FAILURES, 5)
  },
  /** Wait in ms between failed backfill cycles (WA_BACKFILL_FAILURE_BACKOFF_MS). */
  get backfillFailureBackoffMs() {
    return readNumber(process.env.WA_BACKFILL_FAILURE_BACKOFF_MS, 60_000)
  },
  /** Timeout in ms for a single command execution, 0 = disabled (WA_COMMAND_TIMEOUT_MS). */
  get commandTimeoutMs() {
    return readNumber(process.env.WA_COMMAND_TIMEOUT_MS, 60_000)
  },
  /** Base delay in ms for reconnect exponential backoff (WA_RECONNECT_BASE_DELAY_MS). */
  get reconnectBaseDelayMs() {
    return readNumber(process.env.WA_RECONNECT_BASE_DELAY_MS, 2_500)
  },
  /** Maximum delay cap in ms for reconnect backoff (WA_RECONNECT_MAX_DELAY_MS). */
  get reconnectMaxDelayMs() {
    return readNumber(process.env.WA_RECONNECT_MAX_DELAY_MS, 60_000)
  },
  /** Maximum reconnect attempts before giving up, 0 = unlimited (WA_RECONNECT_MAX_ATTEMPTS). */
  get reconnectMaxAttempts() {
    return readNumber(process.env.WA_RECONNECT_MAX_ATTEMPTS, 0)
  },
  /** Maximum number of messages kept in the in-memory cache, 0 = unlimited (WA_MAX_CACHED_MESSAGES). */
  get maxCachedMessages() {
    return readNumber(process.env.WA_MAX_CACHED_MESSAGES, 10_000)
  },
  /** Enables HTTP /health endpoint for liveness probes (WA_HEALTH_ENABLED). */
  get healthEnabled() {
    return readBoolean(process.env.WA_HEALTH_ENABLED, true)
  },
  /** Port for health check server (WA_HEALTH_PORT). */
  get healthPort() {
    return readNumber(process.env.WA_HEALTH_PORT, 9109)
  },
  /** Bind host for health check server (WA_HEALTH_HOST). */
  get healthHost() {
    return process.env.WA_HEALTH_HOST ?? '0.0.0.0'
  },
}
