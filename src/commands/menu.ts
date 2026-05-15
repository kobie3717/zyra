import { config } from '../config/index.js'
import type { Command } from './types.js'

type CommandsProvider = () => Record<string, Command>

/**
 * Creates menu command with dynamic reading of command registry.
 */
export const createMenuCommand = (getCommands: CommandsProvider): Command => ({
  name: 'menu',
  description: 'Shows available commands',
  async execute(ctx) {
    const prefix = config.commandPrefix || '!'
    const availableCommands = Object.values(getCommands()).sort((a, b) => a.name.localeCompare(b.name))
    const lines = [
      '📚 Available commands:',
      ...availableCommands.map((command) => `- ${prefix}${command.name} — ${command.description}`),
    ]

    await ctx.reply(lines.join('\n'))
  },
})
