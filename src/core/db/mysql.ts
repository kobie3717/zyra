import mysql, { type Pool } from 'mysql2/promise'
import { config } from '../../config/index.js'

let pool: Pool | null = null

export function getMysqlPool(): Pool | null {
  if (!config.mysqlUrl) return null
  if (!pool) {
    pool = mysql.createPool({
      uri: config.mysqlUrl,
      connectionLimit: 10,
      waitForConnections: true,
      queueLimit: 0,
      enableKeepAlive: true,
      keepAliveInitialDelay: 10_000,
    })
    // Without a listener, pool-level errors (e.g. PROTOCOL_CONNECTION_LOST on idle
    // connections) would be re-thrown as an uncaught exception and crash the process.
    // Cast through EventEmitter: mysql2 Pool types only expose 'enqueue' in their
    // overloads but the underlying object is a full EventEmitter.
    ;(pool as unknown as import('node:events').EventEmitter).on('error', (err) => {
      console.error('[mysql] pool error', err)
    })
  }
  return pool
}

export async function closeMysqlPool(): Promise<void> {
  if (pool) {
    await pool.end()
    pool = null
  }
}
