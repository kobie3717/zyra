import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { config } from '../config/index.js'
import type { AppLogger } from './logger.js'

const HEALTH_PATH = '/health'
const READY_PATH = '/ready'

type HealthState = {
  connected: boolean
}

type StartHealthServerOptions = {
  logger: AppLogger
  getState: () => HealthState
}

type HealthServerHandle = {
  stop: () => Promise<void>
}

const getPath = (req: IncomingMessage): string => (req.url ?? '').split('?')[0] ?? '/'

const notFound = (res: ServerResponse) => {
  res.statusCode = 404
  res.setHeader('content-type', 'text/plain; charset=utf-8')
  res.end('not found')
}

const jsonResponse = (res: ServerResponse, statusCode: number, body: object) => {
  res.statusCode = statusCode
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(body))
}

export function startHealthServer({ logger, getState }: StartHealthServerOptions): HealthServerHandle {
  if (!config.healthEnabled) {
    return { stop: async () => undefined }
  }

  const server: Server = createServer((req, res) => {
    const path = getPath(req)
    const { connected } = getState()

    if (path === HEALTH_PATH) {
      jsonResponse(res, 200, { status: 'ok', connected, uptime: Math.floor(process.uptime()) })
      return
    }

    if (path === READY_PATH) {
      if (connected) {
        jsonResponse(res, 200, { status: 'ready', connected: true })
      } else {
        jsonResponse(res, 503, { status: 'not ready', connected: false })
      }
      return
    }

    notFound(res)
  })

  server.listen(config.healthPort, config.healthHost, () => {
    logger.info('health server started', {
      host: config.healthHost,
      port: config.healthPort,
      healthPath: HEALTH_PATH,
      readyPath: READY_PATH,
    })
  })

  return {
    stop: () =>
      new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()))
      }),
  }
}
