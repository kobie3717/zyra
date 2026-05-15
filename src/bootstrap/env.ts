import { config as loadDotEnv } from 'dotenv'

let envLoaded = false

/**
 * Loads environment variables from .env file.
 */
export function loadEnv(): void {
  if (envLoaded) return
  loadDotEnv()
  envLoaded = true
}
