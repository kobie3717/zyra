import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { config } from '../config/index.js'
import type { AppLogger } from './logger.js'

type StartAntiBanMetricsServerOptions = {
  logger: AppLogger
  getStats: () => unknown
}

type MetricsServerHandle = {
  stop: () => Promise<void>
}

const notFound = (res: ServerResponse) => {
  res.statusCode = 404
  res.setHeader('content-type', 'text/plain; charset=utf-8')
  res.end('not found')
}

const isMetricsPath = (req: IncomingMessage): boolean => {
  const url = req.url ?? ''
  const pathOnly = url.split('?')[0] ?? ''
  return pathOnly === config.antibanMetricsPath
}

// Flatten nested stats object into Prometheus gauge lines.
// E.g. { rateLimiter: { sent: 1 } } → zyra_antiban_rateLimiter_sent 1
function renderPrometheus(stats: unknown, prefix = 'zyra_antiban'): string {
  if (stats === null || stats === undefined) return ''
  const lines: string[] = []
  const walk = (obj: unknown, path: string) => {
    if (obj === null || obj === undefined) return
    if (typeof obj === 'number' && Number.isFinite(obj)) {
      lines.push(`${path} ${obj}`)
    } else if (typeof obj === 'boolean') {
      lines.push(`${path} ${obj ? 1 : 0}`)
    } else if (typeof obj === 'string') {
      // strings become labels on a present gauge
      lines.push(`${path}{value=${JSON.stringify(obj)}} 1`)
    } else if (typeof obj === 'object') {
      for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
        walk(value, `${path}_${key}`)
      }
    }
  }
  walk(stats, prefix)
  return lines.join('\n') + '\n'
}

export const startAntiBanMetricsServer = ({ logger, getStats }: StartAntiBanMetricsServerOptions): MetricsServerHandle => {
  if (!config.antibanEnabled || !config.antibanMetricsEnabled) {
    return {
      stop: async () => undefined,
    }
  }

  const server: Server = createServer((req, res) => {
    if (!isMetricsPath(req)) {
      notFound(res)
      return
    }
    try {
      const body = renderPrometheus(getStats())
      res.statusCode = 200
      res.setHeader('content-type', 'text/plain; version=0.0.4; charset=utf-8')
      res.end(body)
    } catch (error) {
      logger.error('failed to render antiban metrics', { err: error })
      res.statusCode = 500
      res.setHeader('content-type', 'text/plain; charset=utf-8')
      res.end('internal server error')
    }
  })

  server.listen(config.antibanMetricsPort, config.antibanMetricsHost, () => {
    logger.info('antiban metrics endpoint started', {
      host: config.antibanMetricsHost,
      port: config.antibanMetricsPort,
      path: config.antibanMetricsPath,
    })
  })

  return {
    stop: () =>
      new Promise<void>((resolve, reject) => {
        // Destroy keep-alive connections so server.close() callback fires promptly.
        server.closeAllConnections()
        server.close((error) => {
          if (error) {
            reject(error)
            return
          }
          resolve()
        })
      }),
  }
}
