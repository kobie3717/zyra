import type { proto, AuthenticationCreds } from 'baileys'

export type HistorySyncPolicy = {
  allowOnceForNewLogin: () => void
  shouldSyncHistoryMessage: (msg: proto.Message.IHistorySyncNotification) => boolean
}

/**
 * Creates a history sync policy isolated per socket.
 * Important when a process manages multiple connections.
 */
export const createHistorySyncPolicy = (creds: AuthenticationCreds): HistorySyncPolicy => {
  let allowHistorySyncOnce = creds.accountSyncCounter === 0

  return {
    allowOnceForNewLogin: () => {
      allowHistorySyncOnce = true
    },
    shouldSyncHistoryMessage: (msg) => {
      void msg
      if (allowHistorySyncOnce) {
        allowHistorySyncOnce = false
        return true
      }
      return false
    },
  }
}
