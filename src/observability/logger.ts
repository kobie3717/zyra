import { mkdirSync } from 'node:fs'
import path from 'node:path'
import winston from 'winston'
import 'winston-daily-rotate-file'
import { config } from '../config/index.js'

export type AppLogger = winston.Logger & {
  trace: (...args: unknown[]) => void
}

function ensureTrace(logger: winston.Logger): AppLogger {
  const l = logger as AppLogger
  if (!l.trace) {
    l.trace = (logger.debug ?? logger.info).bind(logger)
  }
  const originalChild = logger.child.bind(logger)
  l.child = ((meta?: object) => ensureTrace(originalChild((meta ?? {}) as object))) as AppLogger['child']
  return l
}

export function createLogger(): AppLogger {
  const logDir = path.resolve(process.cwd(), 'logs')
  mkdirSync(logDir, { recursive: true })

  const consoleFormat = winston.format.combine(
    winston.format.colorize(),
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.printf((info) => {
      const { timestamp, level, message, ...rest } = info
      const meta = Object.keys(rest).length ? ` ${JSON.stringify(rest)}` : ''
      return `${String(timestamp ?? '')} [${level}] ${String(message ?? '')}${meta}`
    })
  )
  const fileFormat = winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  )

  const logger = winston.createLogger({
    level: config.logLevel,
    transports: [
      new winston.transports.Console({
        level: config.logLevel,
        format: consoleFormat,
        handleExceptions: true,
        handleRejections: true,
      }),
      new winston.transports.DailyRotateFile({
        filename: path.join(logDir, 'application-%DATE%.log'),
        level: config.logLevel,
        format: fileFormat,
        datePattern: 'YYYY-MM-DD',
        zippedArchive: true,
        maxSize: '20m',
        maxFiles: '14d',
      }),
      new winston.transports.DailyRotateFile({
        filename: path.join(logDir, 'error-%DATE%.log'),
        level: 'error',
        format: fileFormat,
        datePattern: 'YYYY-MM-DD',
        zippedArchive: true,
        maxSize: '20m',
        maxFiles: '30d',
      }),
      new winston.transports.DailyRotateFile({
        filename: path.join(logDir, 'warning-%DATE%.log'),
        level: 'warn',
        format: fileFormat,
        datePattern: 'YYYY-MM-DD',
        zippedArchive: true,
        maxSize: '20m',
        maxFiles: '30d',
      }),
    ],
  })

  return ensureTrace(logger)
}
