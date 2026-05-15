import type { Command } from './types.js'

/**
 * Simple command used to validate if the bot is responding.
 */
export const pingCommand: Command = {
  /** Command identifier. */
  name: 'ping',
  /** Command description shown in help. */
  description: 'Responds pong to verify if bot is active',
  /** Executes test response. */
  async execute(ctx) {
    await ctx.reply('pong! system active and operating without issues.')
  },
}
