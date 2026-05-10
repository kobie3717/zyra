import type { RowDataPacket } from 'mysql2/promise'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { config } from '../config/index.js'
import { getMysqlPool } from '../core/db/mysql.js'
import { getRedisClient } from '../core/redis/client.js'
import { getRedisNamespace } from '../core/redis/prefix.js'

type GroupFeatureState = {
  antilink?: boolean
  antilinkAllowedDomains?: string[]
  antilinkAllowOwnGroupInvite?: boolean
}

type GroupFeaturesData = Record<string, GroupFeatureState>
type GroupFeatureRow = RowDataPacket & {
  antilink_enabled: number | null
  antilink_allowed_domains_json: string | null
  antilink_allow_own_group_invite: number | null
}

const DATA_DIR = path.resolve(process.cwd(), '.zyra-data')
const DATA_FILE = path.join(DATA_DIR, 'group-features.json')
const REDIS_FEATURES_KEY = `${getRedisNamespace(config.connectionId)}:features:group`

class GroupFeatureStore {
  #loaded = false
  #data: GroupFeaturesData = {}
  #cache = new Map<string, GroupFeatureState>()
  #tableReady = false

  async #load(): Promise<void> {
    if (this.#loaded) return
    this.#loaded = true

    try {
      const raw = await readFile(DATA_FILE, 'utf8')
      const parsed = JSON.parse(raw) as GroupFeaturesData
      if (parsed && typeof parsed === 'object') {
        this.#data = parsed
      }
    } catch {
      this.#data = {}
    }
  }

  async #save(): Promise<void> {
    await mkdir(DATA_DIR, { recursive: true })
    await writeFile(DATA_FILE, JSON.stringify(this.#data, null, 2), 'utf8')
  }

  #normalizeState(input?: GroupFeatureState | null): GroupFeatureState {
    if (!input) return {}
    return {
      ...(typeof input.antilink === 'boolean' ? { antilink: input.antilink } : {}),
      ...(Array.isArray(input.antilinkAllowedDomains)
        ? { antilinkAllowedDomains: [...new Set(input.antilinkAllowedDomains.map((entry) => entry.trim().toLowerCase()).filter(Boolean))] }
        : {}),
      ...(typeof input.antilinkAllowOwnGroupInvite === 'boolean' ? { antilinkAllowOwnGroupInvite: input.antilinkAllowOwnGroupInvite } : {}),
    }
  }

  async #ensureSqlTable(): Promise<void> {
    if (this.#tableReady) return
    const pool = getMysqlPool()
    if (!pool) return
    await pool.execute(
      `CREATE TABLE IF NOT EXISTS group_feature_flags (
        connection_id VARCHAR(128) NOT NULL,
        group_jid VARCHAR(128) NOT NULL,
        antilink_enabled TINYINT(1) NULL,
        antilink_allowed_domains_json JSON NULL,
        antilink_allow_own_group_invite TINYINT(1) NULL,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (connection_id, group_jid),
        INDEX idx_group_feature_flags_updated (connection_id, updated_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
    )
    this.#tableReady = true
  }

  async #loadStateFromSql(groupJid: string): Promise<GroupFeatureState | null> {
    if (!config.mysqlUrl) return null
    const pool = getMysqlPool()
    if (!pool) return null
    try {
      await this.#ensureSqlTable()
      const [rows] = await pool.execute<GroupFeatureRow[]>(
        `SELECT antilink_enabled, antilink_allowed_domains_json, antilink_allow_own_group_invite
         FROM group_feature_flags
         WHERE connection_id = ? AND group_jid = ?
         LIMIT 1`,
        [config.connectionId ?? 'default', groupJid]
      )
      const row = rows[0]
      if (!row) return null
      const parsedDomains = row.antilink_allowed_domains_json ? JSON.parse(row.antilink_allowed_domains_json) : []
      const state: GroupFeatureState = {
        ...(typeof row.antilink_enabled === 'number' ? { antilink: row.antilink_enabled === 1 } : {}),
        ...(Array.isArray(parsedDomains) ? { antilinkAllowedDomains: parsedDomains } : {}),
        ...(typeof row.antilink_allow_own_group_invite === 'number'
          ? { antilinkAllowOwnGroupInvite: row.antilink_allow_own_group_invite === 1 }
          : {}),
      }
      return this.#normalizeState(state)
    } catch {
      return null
    }
  }

  async #saveStateToSql(groupJid: string, state: GroupFeatureState): Promise<void> {
    if (!config.mysqlUrl) return
    const pool = getMysqlPool()
    if (!pool) return
    try {
      await this.#ensureSqlTable()
      await pool.execute(
        `INSERT INTO group_feature_flags (
           connection_id,
           group_jid,
           antilink_enabled,
           antilink_allowed_domains_json,
           antilink_allow_own_group_invite
         ) VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           antilink_enabled = VALUES(antilink_enabled),
           antilink_allowed_domains_json = VALUES(antilink_allowed_domains_json),
           antilink_allow_own_group_invite = VALUES(antilink_allow_own_group_invite)`,
        [
          config.connectionId ?? 'default',
          groupJid,
          typeof state.antilink === 'boolean' ? (state.antilink ? 1 : 0) : null,
          JSON.stringify(state.antilinkAllowedDomains ?? []),
          typeof state.antilinkAllowOwnGroupInvite === 'boolean' ? (state.antilinkAllowOwnGroupInvite ? 1 : 0) : null,
        ]
      )
    } catch {
      // fallbacks locais continuam funcionando mesmo sem SQL
    }
  }

  async #loadStateFromRedis(groupJid: string): Promise<GroupFeatureState | null> {
    if (!config.redisUrl) return null
    try {
      const client = await getRedisClient()
      const raw = await client.hGet(REDIS_FEATURES_KEY, groupJid)
      if (!raw) return null
      return this.#normalizeState(JSON.parse(raw) as GroupFeatureState)
    } catch {
      return null
    }
  }

  async #saveStateToRedis(groupJid: string, state: GroupFeatureState): Promise<void> {
    if (!config.redisUrl) return
    try {
      const client = await getRedisClient()
      await client.hSet(REDIS_FEATURES_KEY, groupJid, JSON.stringify(state))
    } catch {
      // fallbacks locais continuam funcionando mesmo sem Redis
    }
  }

  async #getState(groupJid: string): Promise<GroupFeatureState> {
    const cached = this.#cache.get(groupJid)
    if (cached) return cached

    const fromSql = await this.#loadStateFromSql(groupJid)
    if (fromSql) {
      this.#cache.set(groupJid, fromSql)
      this.#data[groupJid] = fromSql
      await this.#saveStateToRedis(groupJid, fromSql)
      return fromSql
    }

    const fromRedis = await this.#loadStateFromRedis(groupJid)
    if (fromRedis) {
      this.#cache.set(groupJid, fromRedis)
      this.#data[groupJid] = fromRedis
      return fromRedis
    }

    await this.#load()
    const fromFile = this.#normalizeState(this.#data[groupJid] ?? {})
    this.#cache.set(groupJid, fromFile)
    if (Object.keys(fromFile).length) {
      await this.#saveStateToSql(groupJid, fromFile)
      await this.#saveStateToRedis(groupJid, fromFile)
    }
    return fromFile
  }

  async #setState(groupJid: string, next: GroupFeatureState): Promise<void> {
    const normalized = this.#normalizeState(next)
    this.#cache.set(groupJid, normalized)
    await this.#load()
    this.#data[groupJid] = normalized
    await this.#save()
    await Promise.all([this.#saveStateToSql(groupJid, normalized), this.#saveStateToRedis(groupJid, normalized)])
  }

  async isAntilinkEnabled(groupJid: string): Promise<boolean> {
    const state = await this.#getState(groupJid)
    return state.antilink === true
  }

  async setAntilinkEnabled(groupJid: string, enabled: boolean): Promise<void> {
    const current = await this.#getState(groupJid)
    await this.#setState(groupJid, { ...current, antilink: enabled })
  }

  async getAntilinkAllowedDomains(groupJid: string): Promise<string[]> {
    const state = await this.#getState(groupJid)
    const domains = state.antilinkAllowedDomains
    return Array.isArray(domains) ? [...domains] : []
  }

  async addAntilinkAllowedDomain(groupJid: string, domain: string): Promise<void> {
    const normalized = domain.trim().toLowerCase()
    if (!normalized) return
    const currentState = await this.#getState(groupJid)
    const current = await this.getAntilinkAllowedDomains(groupJid)
    if (current.includes(normalized)) return
    await this.#setState(groupJid, {
      ...currentState,
      antilinkAllowedDomains: [...current, normalized],
    })
  }

  async removeAntilinkAllowedDomain(groupJid: string, domain: string): Promise<void> {
    const normalized = domain.trim().toLowerCase()
    if (!normalized) return
    const currentState = await this.#getState(groupJid)
    const current = await this.getAntilinkAllowedDomains(groupJid)
    await this.#setState(groupJid, {
      ...currentState,
      antilinkAllowedDomains: current.filter((entry) => entry !== normalized),
    })
  }

  async isAntilinkAllowOwnGroupInviteEnabled(groupJid: string): Promise<boolean> {
    const state = await this.#getState(groupJid)
    return state.antilinkAllowOwnGroupInvite === true
  }

  async setAntilinkAllowOwnGroupInviteEnabled(groupJid: string, enabled: boolean): Promise<void> {
    const current = await this.#getState(groupJid)
    await this.#setState(groupJid, { ...current, antilinkAllowOwnGroupInvite: enabled })
  }
}

export const groupFeatureStore = new GroupFeatureStore()
