import process from 'node:process'
import { loadEnv } from './bootstrap/env.js'
import { start } from './bootstrap/start.js'
import { config } from './config/index.js'

type ValidationResult = {
  errors: string[]
  warnings: string[]
}

const LOG_LEVELS = new Set(['trace', 'debug', 'info', 'warn', 'error', 'fatal'])
const BOOLEAN_VALUES = new Set(['true', 'false'])

/**
 * Performs basic environment and configuration validation before initialization (boot).
 */
const validateEnvironment = (): ValidationResult => {
  const errors: string[] = []
  const warnings: string[] = []

  const ensureBoolean = (key: string) => {
    const raw = process.env[key]
    if (!raw) return
    const normalized = raw.trim().toLowerCase()
    if (!BOOLEAN_VALUES.has(normalized)) {
      warnings.push(`${key} must be "true" or "false" (current value: "${raw}").`)
    }
  }

  const ensureUrl = (key: string, value: string | undefined, options: { requireDatabase?: boolean; allowedProtocols?: string[] } = {}) => {
    if (!value) return
    try {
      const url = new URL(value)
      const allowed = options.allowedProtocols ?? []
      if (allowed.length && !allowed.includes(url.protocol)) {
        errors.push(`${key} must use protocol ${allowed.join(' or ')} (current value: "${value}").`)
      }
      if (options.requireDatabase) {
        const dbName = url.pathname.replace(/^\//, '').trim()
        if (!dbName) {
          errors.push(`${key} needs to point to a database (e.g. /zyra).`)
        }
      }
    } catch {
      errors.push(`${key} is not a valid URL (current value: "${value}").`)
    }
  }

  const ensurePositiveNumber = (key: string) => {
    const raw = process.env[key]
    if (!raw) return
    const parsed = Number(raw)
    if (!Number.isFinite(parsed) || parsed < 0) {
      warnings.push(`${key} must be a non-negative number (current value: "${raw}").`)
    }
  }

  const ensurePort = (key: string) => {
    const raw = process.env[key]
    if (!raw) return
    const parsed = Number(raw)
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
      errors.push(`${key} must be a valid port (1–65535) (current value: "${raw}").`)
    }
  }

  const ensureDeprecated = (oldKey: string, newKey: string) => {
    if (process.env[oldKey] !== undefined) {
      warnings.push(`${oldKey} is deprecated — use ${newKey} instead.`)
    }
  }

  if (!config.authDir.trim()) {
    errors.push('WA_AUTH_DIR cannot be empty.')
  }

  if (!LOG_LEVELS.has(config.logLevel)) {
    warnings.push(`Invalid LOG_LEVEL ("${config.logLevel}"). Accepted values: ${[...LOG_LEVELS].join(', ')}.`)
  }

  ensureBoolean('WA_PRINT_QR')
  ensureBoolean('WA_ACCEPT_OWN_MESSAGES')
  ensureBoolean('WA_IGNORE_STATUS_BROADCAST')
  ensureBoolean('WA_ANTIBAN_ENABLED')
  ensureBoolean('WA_HEALTH_ENABLED')

  const mysqlUrl = process.env.MYSQL_URL ?? process.env.WA_DB_URL
  ensureUrl('MYSQL_URL', mysqlUrl, {
    requireDatabase: true,
    allowedProtocols: ['mysql:', 'mariadb:'],
  })
  ensureUrl('WA_REDIS_URL', process.env.WA_REDIS_URL, {
    allowedProtocols: ['redis:', 'rediss:'],
  })

  ensureDeprecated('WA_DB_URL', 'MYSQL_URL')

  ensurePort('WA_HEALTH_PORT')
  ensurePort('WA_ANTIBAN_METRICS_PORT')

  ensurePositiveNumber('WA_SHUTDOWN_TIMEOUT_MS')
  ensurePositiveNumber('WA_CREDS_DEBOUNCE_MS')
  ensurePositiveNumber('WA_RECONNECT_BASE_DELAY_MS')
  ensurePositiveNumber('WA_RECONNECT_MAX_DELAY_MS')
  ensurePositiveNumber('WA_RECONNECT_MAX_ATTEMPTS')
  ensurePositiveNumber('WA_VERSION_CACHE_TTL_MS')

  if (!config.connectionId.trim()) {
    errors.push('WA_CONNECTION_ID cannot be empty.')
  }

  return { errors, warnings }
}

/**
 * Initializes the bot with validation and standard error handling.
 */
const bootstrap = async (): Promise<void> => {
  loadEnv()

  const { errors, warnings } = validateEnvironment()
  for (const warning of warnings) {
    console.warn(`[Warning] ${warning}`)
  }
  if (errors.length) {
    for (const error of errors) {
      console.error(`[Error] ${error}`)
    }
    process.exit(1)
  }

  await start()
}

bootstrap().catch((error) => {
  console.error('Failed to start bot:', error)
  process.exit(1)
})
