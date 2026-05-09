import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { createMetricsHandler } from 'baileys-antiban'
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

export const startAntiBanMetricsServer = ({ logger, getStats }: StartAntiBanMetricsServerOptions): MetricsServerHandle => {
  if (!config.antibanEnabled || !config.antibanMetricsEnabled) {
    return {
      stop: async () => undefined,
    }
  }

  const metrics = createMetricsHandler(() => getStats() as Parameters<typeof createMetricsHandler>[0] extends () => infer T ? T : never)
  const server: Server = createServer(async (req, res) => {
    if (!isMetricsPath(req)) {
      notFound(res)
      return
    }
    try {
      await metrics.handle(req, res)
    } catch (error) {
      logger.error('falha ao renderizar metricas do antiban', { err: error })
      res.statusCode = 500
      res.setHeader('content-type', 'text/plain; charset=utf-8')
      res.end('internal server error')
    }
  })

  server.listen(config.antibanMetricsPort, config.antibanMetricsHost, () => {
    logger.info('endpoint de metricas do antiban iniciado', {
      host: config.antibanMetricsHost,
      port: config.antibanMetricsPort,
      path: config.antibanMetricsPath,
    })
  })

  return {
    stop: async () =>
      new Promise<void>((resolve, reject) => {
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
