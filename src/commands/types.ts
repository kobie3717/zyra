import type { CommandContext } from '../core/command-runtime/context.js'

/**
 * Interface defining system command structure.
 */
export type Command = {
  /** Unique command name (used for invocation). */
  name: string
  /** Brief description of command functionality. */
  description: string
  /**
   * Command execution logic.
   * @param ctx Command context containing message data and utility methods.
   */
  execute: (ctx: CommandContext) => Promise<void>
}
