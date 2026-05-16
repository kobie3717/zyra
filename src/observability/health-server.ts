import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { config } from '../config/index.js'
import type { AppLogger } from './logger.js'

const HEALTH_PATH = '/health'
const READY_PATH = '/ready'
const METRICS_PATH = '/metrics'

type HealthState = {
  connected: boolean
  /** Total socket creations since process start (increments on each reconnect). */
  socketGeneration: number
  /** Current reconnect attempt counter, 0 when connected and stable. */
  reconnectAttempt: number
  /** Epoch ms of the last messages.upsert event, null if none received yet. */
  lastMessageReceivedAt: number | null
  /** Mark connected socket as stale when no messages arrive within this window (ms). 0 = disabled. */
  stalenessThresholdMs: number
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

const renderConnectionMetrics = ({ connected, socketGeneration, reconnectAttempt, lastMessageReceivedAt, stalenessThresholdMs }: HealthState): string => {
  const uptime = Math.floor(process.uptime())
  const stale = connected
    && stalenessThresholdMs > 0
    && lastMessageReceivedAt !== null
    && Date.now() - lastMessageReceivedAt > stalenessThresholdMs
  const lines = [
    '# HELP zyra_connected WhatsApp connection state (1=connected, 0=disconnected)',
    '# TYPE zyra_connected gauge',
    `zyra_connected ${connected ? 1 : 0}`,
    '# HELP zyra_socket_generation Total socket creations since process start',
    '# TYPE zyra_socket_generation counter',
    `zyra_socket_generation ${socketGeneration}`,
    '# HELP zyra_reconnect_attempt Current reconnect backoff attempt (0 when stable)',
    '# TYPE zyra_reconnect_attempt gauge',
    `zyra_reconnect_attempt ${reconnectAttempt}`,
    '# HELP zyra_uptime_seconds Process uptime in seconds',
    '# TYPE zyra_uptime_seconds gauge',
    `zyra_uptime_seconds ${uptime}`,
    '# HELP zyra_connection_stale Whether connected socket is delivering no messages (1=stale)',
    '# TYPE zyra_connection_stale gauge',
    `zyra_connection_stale ${stale ? 1 : 0}`,
  ]
  if (lastMessageReceivedAt !== null) {
    lines.push(
      '# HELP zyra_last_message_received_seconds Seconds since last message was received',
      '# TYPE zyra_last_message_received_seconds gauge',
      `zyra_last_message_received_seconds ${((Date.now() - lastMessageReceivedAt) / 1000).toFixed(1)}`,
    )
  }
  lines.push('')
  return lines.join('\n')
}

export function startHealthServer({ logger, getState }: StartHealthServerOptions): HealthServerHandle {
  if (!config.healthEnabled) {
    return { stop: async () => undefined }
  }

  const server: Server = createServer((req, res) => {
    const path = getPath(req)
    const state = getState()
    const { connected, socketGeneration, reconnectAttempt } = state

    if (path === HEALTH_PATH) {
      const { lastMessageReceivedAt, stalenessThresholdMs } = state
      const stale = connected
        && stalenessThresholdMs > 0
        && lastMessageReceivedAt !== null
        && Date.now() - lastMessageReceivedAt > stalenessThresholdMs
      jsonResponse(res, 200, {
        status: 'ok',
        connected,
        uptime: Math.floor(process.uptime()),
        socketGeneration,
        reconnectAttempt,
        stale: stale || false,
        ...(lastMessageReceivedAt !== null ? { lastMessageReceivedMs: Date.now() - lastMessageReceivedAt } : {}),
      })
      return
    }

    if (path === READY_PATH) {
      const { lastMessageReceivedAt, stalenessThresholdMs } = state
      const stale = connected
        && stalenessThresholdMs > 0
        && lastMessageReceivedAt !== null
        && Date.now() - lastMessageReceivedAt > stalenessThresholdMs
      if (connected && !stale) {
        jsonResponse(res, 200, { status: 'ready', connected: true, socketGeneration, reconnectAttempt, stale: false })
      } else {
        jsonResponse(res, 503, {
          status: stale ? 'stale' : 'not ready',
          connected,
          socketGeneration,
          reconnectAttempt,
          stale: stale || false,
          ...(stale && lastMessageReceivedAt !== null ? { lastMessageReceivedMs: Date.now() - lastMessageReceivedAt } : {}),
        })
      }
      return
    }

    if (path === METRICS_PATH) {
      res.statusCode = 200
      res.setHeader('content-type', 'text/plain; version=0.0.4; charset=utf-8')
      res.end(renderConnectionMetrics(state))
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
      metricsPath: METRICS_PATH,
    })
  })

  return {
    stop: () =>
      new Promise<void>((resolve, reject) => {
        // Destroy keep-alive connections so server.close() callback fires promptly.
        server.closeAllConnections()
        server.close((err) => (err ? reject(err) : resolve()))
      }),
  }
}
