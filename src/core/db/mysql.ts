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
  }
  return pool
}

export async function closeMysqlPool(): Promise<void> {
  if (pool) {
    await pool.end()
    pool = null
  }
}
