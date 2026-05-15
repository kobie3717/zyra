import { useMultiFileAuthState, type AuthenticationState } from 'baileys'
import { config } from '../../config/index.js'
import { resolveAuthDir } from './auth-dir.js'
import { useMysqlAuthState } from './mysql-auth-state.js'
import { useRedisAuthState } from './redis-auth-state.js'

/**
 * Generic interface for authentication state function returns.
 * Ensures any chosen strategy returns the structure required by Baileys.
 */
type AuthStateProvider =
  | ReturnType<typeof useMysqlAuthState>
  | ReturnType<typeof useRedisAuthState>
  | Promise<{
      state: AuthenticationState
      saveCreds: () => Promise<void>
    }>

/**
 * Authentication Strategy Factory.
 * * @remarks
 * This function is the central decision point for bot persistence.
 * It evaluates available configurations and selects the most robust driver in the following order:
 * * 1. **MySQL**: If `mysqlUrl` is present, uses SQL database persistence (Recommended for distributed production).
 * 2. **Redis**: If `redisUrl` is present (and not MySQL), uses Redis for high performance and controlled volatility.
 * 3. **Local File System**: If no database URL is provided, uses Baileys default driver to save in local JSON files.
 * * @param connectionId - Unique session/instance identifier. Essential for isolating data in multi-instance environments.
 * * @returns A promise that resolves to an object containing:
 * - `state`: Authentication state (creds and keys) to inject into `makeWASocket`.
 * - `saveCreds`: Callback function for persisting credential changes.
 * * @example
 * ```typescript
 * const { state, saveCreds } = await getAuthState('session_123');
 * const sock = makeWASocket({
 * auth: state,
 * // ... other configs
 * });
 * * // Listen for credential updates
 * sock.ev.on('creds.update', saveCreds);
 * ```
 */
export async function getAuthState(connectionId?: string): Promise<AuthStateProvider> {
  // 1st Priority: MySQL (ACID and centralized persistence)
  if (config.mysqlUrl) {
    return useMysqlAuthState(connectionId)
  }

  // 2nd Priority: Redis (In-memory persistence with fast cache)
  if (config.redisUrl) {
    return useRedisAuthState(connectionId)
  }

  // 3rd Priority/Fallback: Local File System (JSON)
  // Generally used in development environment or simple single instances.
  const { state, saveCreds } = await useMultiFileAuthState(resolveAuthDir(connectionId))

  return {
    state,
    saveCreds,
  }
}
