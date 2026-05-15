import path from 'node:path'
import { config } from '../../config/index.js'

/**
 * Resolves auth directory isolating by connectionId.
 * Important when a single process maintains multiple connections.
 */
export const resolveAuthDir = (connectionId?: string): string => {
  const resolvedConnectionId = connectionId ?? config.connectionId ?? 'default'
  return path.resolve(process.cwd(), config.authDir, resolvedConnectionId)
}

