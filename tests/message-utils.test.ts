import { describe, expect, it, vi } from 'vitest'

let mockExtractMessageContent: ReturnType<typeof vi.fn>
let mockGetContentType: ReturnType<typeof vi.fn>
let mockNormalizeMessageContent: ReturnType<typeof vi.fn>

vi.mock('baileys', () => ({
  extractMessageContent: (...args: unknown[]) => mockExtractMessageContent(...args),
  getContentType: (...args: unknown[]) => mockGetContentType(...args),
  normalizeMessageContent: (...args: unknown[]) => mockNormalizeMessageContent(...args),
  proto: {
    Message: {
      EventResponseMessage: {
        EventResponseType: { UNKNOWN: 0, GOING: 1, NOT_GOING: 2, MAYBE: 3 },
      },
    },
  },
}))

const setup = (contentType: string | null, content: Record<string, unknown> | null) => {
  mockNormalizeMessageContent = vi.fn((msg) => msg)
  mockExtractMessageContent = vi.fn(() => content)
  mockGetContentType = vi.fn(() => contentType)
}

const msg = (message: Record<string, unknown>) => ({ message } as never)

describe('getMessageText', () => {
  it('returns null when message has no content', async () => {
    setup(null, null)
    const { getMessageText } = await import('../src/utils/message.ts')
    expect(getMessageText(msg({}))).toBeNull()
  })

  it('returns null when text is empty or whitespace only', async () => {
    setup('conversation', { conversation: '   ' })
    const { getMessageText } = await import('../src/utils/message.ts')
    expect(getMessageText(msg({ conversation: '   ' }))).toBeNull()
  })

  it('returns conversation text', async () => {
    setup('conversation', { conversation: 'hello' })
    const { getMessageText } = await import('../src/utils/message.ts')
    expect(getMessageText(msg({ conversation: 'hello' }))).toBe('hello')
  })

  it('returns extendedTextMessage text', async () => {
    setup('extendedTextMessage', { extendedTextMessage: { text: 'extended' } })
    const { getMessageText } = await import('../src/utils/message.ts')
    expect(getMessageText(msg({}))).toBe('extended')
  })

  it('returns imageMessage caption', async () => {
    setup('imageMessage', { imageMessage: { caption: 'photo caption' } })
    const { getMessageText } = await import('../src/utils/message.ts')
    expect(getMessageText(msg({}))).toBe('photo caption')
  })

  it('returns videoMessage caption', async () => {
    setup('videoMessage', { videoMessage: { caption: 'video caption' } })
    const { getMessageText } = await import('../src/utils/message.ts')
    expect(getMessageText(msg({}))).toBe('video caption')
  })

  it('returns documentMessage caption', async () => {
    setup('documentMessage', { documentMessage: { caption: 'doc caption' } })
    const { getMessageText } = await import('../src/utils/message.ts')
    expect(getMessageText(msg({}))).toBe('doc caption')
  })

  it('returns null for audioMessage with no quoted text', async () => {
    setup('audioMessage', { audioMessage: {} })
    const { getMessageText } = await import('../src/utils/message.ts')
    expect(getMessageText(msg({}))).toBeNull()
  })

  it('returns listMessage title', async () => {
    setup('listMessage', { listMessage: { title: 'pick one' } })
    const { getMessageText } = await import('../src/utils/message.ts')
    expect(getMessageText(msg({}))).toBe('pick one')
  })

  it('returns listResponseMessage selected row id', async () => {
    setup('listResponseMessage', {
      listResponseMessage: { singleSelectReply: { selectedRowId: 'row-1' } },
    })
    const { getMessageText } = await import('../src/utils/message.ts')
    expect(getMessageText(msg({}))).toBe('row-1')
  })

  it('returns reactionMessage text', async () => {
    setup('reactionMessage', { reactionMessage: { text: '👍' } })
    const { getMessageText } = await import('../src/utils/message.ts')
    expect(getMessageText(msg({}))).toBe('👍')
  })

  it('returns contactMessage displayName', async () => {
    setup('contactMessage', { contactMessage: { displayName: 'Alice' } })
    const { getMessageText } = await import('../src/utils/message.ts')
    expect(getMessageText(msg({}))).toBe('Alice')
  })

  it('returns locationMessage comment', async () => {
    setup('locationMessage', { locationMessage: { comment: 'here' } })
    const { getMessageText } = await import('../src/utils/message.ts')
    expect(getMessageText(msg({}))).toBe('here')
  })

  it('returns locationMessage name when comment is absent', async () => {
    setup('locationMessage', { locationMessage: { name: 'Coffee Shop' } })
    const { getMessageText } = await import('../src/utils/message.ts')
    expect(getMessageText(msg({}))).toBe('Coffee Shop')
  })

  it('returns groupInviteMessage caption', async () => {
    setup('groupInviteMessage', { groupInviteMessage: { caption: 'join us' } })
    const { getMessageText } = await import('../src/utils/message.ts')
    expect(getMessageText(msg({}))).toBe('join us')
  })

  it('returns pollCreationMessage name', async () => {
    setup('pollCreationMessage', { pollCreationMessage: { name: 'Best language?' } })
    const { getMessageText } = await import('../src/utils/message.ts')
    expect(getMessageText(msg({}))).toBe('Best language?')
  })

  it('returns eventMessage name', async () => {
    setup('eventMessage', { eventMessage: { name: 'Team Sync' } })
    const { getMessageText } = await import('../src/utils/message.ts')
    expect(getMessageText(msg({}))).toBe('Team Sync')
  })

  it('returns null for encEventResponseMessage', async () => {
    setup('encEventResponseMessage', { encEventResponseMessage: {} })
    const { getMessageText } = await import('../src/utils/message.ts')
    expect(getMessageText(msg({}))).toBeNull()
  })

  it('returns GOING for eventResponseMessage GOING type', async () => {
    // proto.Message.EventResponseMessage.EventResponseType.GOING = 1
    setup('conversation', { eventResponseMessage: { response: 1 }, conversation: 'ignored' })
    const { getMessageText } = await import('../src/utils/message.ts')
    expect(getMessageText(msg({}))).toBe('GOING')
  })

  it('returns NOT_GOING for eventResponseMessage NOT_GOING type', async () => {
    // proto.Message.EventResponseMessage.EventResponseType.NOT_GOING = 2
    setup('conversation', { eventResponseMessage: { response: 2 }, conversation: 'ignored' })
    const { getMessageText } = await import('../src/utils/message.ts')
    expect(getMessageText(msg({}))).toBe('NOT_GOING')
  })

  it('falls through to pickTextFromRecord for unknown content type', async () => {
    setup('stickerMessage', { stickerMessage: { caption: 'sticker text', text: 'sticker' } })
    const { getMessageText } = await import('../src/utils/message.ts')
    // Falls into default branch, pickTextFromRecord picks 'text' first
    expect(getMessageText(msg({}))).toBe('sticker')
  })

  it('returns null for unknown content type with no text fields', async () => {
    setup('stickerMessage', { stickerMessage: { url: null, mimetype: 'image/webp' } })
    const { getMessageText } = await import('../src/utils/message.ts')
    expect(getMessageText(msg({}))).toBeNull()
  })
})

describe('getNormalizedMessage', () => {
  it('returns content and type for valid message', async () => {
    setup('conversation', { conversation: 'hello' })
    const { getNormalizedMessage } = await import('../src/utils/message.ts')
    const result = getNormalizedMessage(msg({ conversation: 'hello' }))
    expect(result.type).toBe('conversation')
    expect(result.content).toEqual({ conversation: 'hello' })
  })

  it('returns null type when extractMessageContent returns null', async () => {
    setup(null, null)
    const { getNormalizedMessage } = await import('../src/utils/message.ts')
    const result = getNormalizedMessage(msg({}))
    expect(result.type).toBeNull()
    expect(result.content).toBeNull()
  })
})
