import { createServer, type Server } from 'node:http'
import { config } from '../config/index.js'
import type { AppLogger } from './logger.js'

type HealthServerHandle = {
  stop: () => Promise<void>
}

export function startHealthServer(logger: AppLogger): HealthServerHandle {
  if (!config.healthEnabled) {
    return { stop: async () => undefined }
  }

  const server: Server = createServer((_req, res) => {
    res.statusCode = 200
    res.setHeader('content-type', 'application/json; charset=utf-8')
    res.end(JSON.stringify({ status: 'ok' }))
  })

  server.listen(config.healthPort, config.healthHost, () => {
    logger.info('health server iniciado', { host: config.healthHost, port: config.healthPort })
  })

  return {
    stop: () =>
      new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()))
      }),
  }
}
