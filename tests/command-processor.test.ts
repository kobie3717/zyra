import { describe, expect, it, vi, beforeEach } from 'vitest'

const mockConfig = {
  allowOwnMessages: false,
  commandPrefix: '!',
}

const mockCommands: Record<string, { execute: ReturnType<typeof vi.fn>; name: string; description: string }> = {}
const { mockGroupFeatureStore } = vi.hoisted(() => ({
  mockGroupFeatureStore: {
    isAntilinkEnabled: vi.fn(),
    getAntilinkAllowedDomains: vi.fn(),
    isAntilinkAllowOwnGroupInviteEnabled: vi.fn(),
  },
}))

vi.mock('../src/config/index.js', () => ({ config: mockConfig }))
vi.mock('../src/commands/index.js', () => ({ commands: mockCommands }))
vi.mock('../src/store/group-feature-store.js', () => ({ groupFeatureStore: mockGroupFeatureStore }))
vi.mock('../src/store/sql-store.js', () => ({
  createSqlStore: vi.fn(() => ({
    enabled: false,
    recordCommandLog: vi.fn(),
  })),
}))

const createLogger = () => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  trace: vi.fn(),
})

  const createMessage = (text: string, options: { chatId?: string; participant?: string } = {}) =>
  ({
    key: {
      remoteJid: options.chatId ?? 'chat@s.whatsapp.net',
      fromMe: false,
      id: 'msg-1',
      participant: options.participant ?? 'user@s.whatsapp.net',
    },
    pushName: 'Tester',
    message: {
      conversation: text,
    },
    messageTimestamp: 1,
  }) as const

const createStickerMessage = (text: string, options: { chatId?: string; participant?: string } = {}) =>
  ({
    key: {
      remoteJid: options.chatId ?? 'chat@s.whatsapp.net',
      fromMe: false,
      id: 'msg-sticker-1',
      participant: options.participant ?? 'user@s.whatsapp.net',
    },
    pushName: 'Tester',
    message: {
      stickerMessage: {
        mimetype: 'image/webp',
        url: text,
      },
    },
    messageTimestamp: 1,
  }) as const

beforeEach(() => {
  mockConfig.commandPrefix = '!'
  mockConfig.allowOwnMessages = false
  mockGroupFeatureStore.isAntilinkEnabled.mockReset().mockResolvedValue(false)
  mockGroupFeatureStore.getAntilinkAllowedDomains.mockReset().mockResolvedValue([])
  mockGroupFeatureStore.isAntilinkAllowOwnGroupInviteEnabled.mockReset().mockResolvedValue(false)
  for (const key of Object.keys(mockCommands)) {
    delete mockCommands[key]
  }
})

describe('CommandProcessor', () => {
  it('executa comando com ctx fechado e registra log', async () => {
    const sqlStore = {
      enabled: true,
      recordCommandLog: vi.fn(),
    }
    const logger = createLogger()
    const sendMessage = vi.fn().mockResolvedValue(undefined)
    const groupMetadata = vi.fn().mockResolvedValue({
      participants: [{ id: 'user@s.whatsapp.net', admin: 'admin' }],
    })
    const groupParticipantsUpdate = vi.fn().mockResolvedValue([])
    const execute = vi.fn(async (ctx) => {
      expect('socket' in ctx).toBe(false)
      expect('message' in ctx).toBe(false)
      expect(ctx.commandName).toBe('ping')
      expect(ctx.args).toEqual(['agora'])
      expect(await ctx.isAdmin()).toBe(true)
      await ctx.reply('pong')
      await ctx.promote('novo-admin@s.whatsapp.net')
    })

    mockCommands.ping = { name: 'ping', description: 'ping', execute }

    const sock = {
      user: { id: 'bot@s.whatsapp.net' },
      sendMessage,
      groupMetadata,
      groupParticipantsUpdate,
    }

    const { createCommandProcessor } = await import('../src/core/command-runtime/processor.ts')
    const processor = createCommandProcessor({ logger, sqlStore: sqlStore as never })

    await processor.process(sock as never, createMessage('!ping agora', { chatId: 'grupo@g.us' }) as never)

    expect(execute).toHaveBeenCalledTimes(1)
    expect(sendMessage).toHaveBeenCalledWith(
      'grupo@g.us',
      { text: 'pong' },
      expect.objectContaining({
        quoted: expect.objectContaining({
          key: expect.objectContaining({ id: 'msg-1' }),
        }),
      })
    )
    expect(groupMetadata).toHaveBeenCalledWith('grupo@g.us')
    expect(groupParticipantsUpdate).toHaveBeenCalledWith('grupo@g.us', ['novo-admin@s.whatsapp.net'], 'promote')
    expect(sqlStore.recordCommandLog).toHaveBeenCalledWith(
      expect.objectContaining({
        chatJid: 'grupo@g.us',
        commandName: 'ping',
        argsText: 'agora',
        success: true,
      })
    )
  })

  it('responde erro interno e registra falha quando comando quebra', async () => {
    const sqlStore = {
      enabled: true,
      recordCommandLog: vi.fn(),
    }
    const logger = createLogger()
    const sendMessage = vi.fn().mockResolvedValue(undefined)
    const execute = vi.fn().mockRejectedValue(new Error('boom'))

    mockCommands.ping = { name: 'ping', description: 'ping', execute }

    const sock = {
      user: { id: 'bot@s.whatsapp.net' },
      sendMessage,
      groupMetadata: vi.fn(),
      groupParticipantsUpdate: vi.fn(),
    }

    const { createCommandProcessor } = await import('../src/core/command-runtime/processor.ts')
    const processor = createCommandProcessor({ logger, sqlStore: sqlStore as never })

    await processor.process(sock as never, createMessage('!ping') as never)

    expect(logger.error).toHaveBeenCalledWith('comando falhou', {
      err: expect.any(Error),
      command: 'ping',
    })
    expect(sendMessage).toHaveBeenCalledWith(
      'chat@s.whatsapp.net',
      { text: '❌ Ocorreu um erro interno ao executar este comando.' },
      expect.any(Object)
    )
    expect(sqlStore.recordCommandLog).toHaveBeenCalledWith(
      expect.objectContaining({
        commandName: 'ping',
        success: false,
      })
    )
  })

  it('ignora mensagens sem comando ou invalidas', async () => {
    const logger = createLogger()
    const sqlStore = {
      enabled: false,
      recordCommandLog: vi.fn(),
    }
    const sendMessage = vi.fn().mockResolvedValue(undefined)

    const sock = {
      user: { id: 'bot@s.whatsapp.net' },
      sendMessage,
      groupMetadata: vi.fn(),
      groupParticipantsUpdate: vi.fn(),
    }

    const { buildIncomingCommandEnvelope, createCommandProcessor } = await import('../src/core/command-runtime/processor.ts')
    const processor = createCommandProcessor({ logger, sqlStore: sqlStore as never })

    expect(buildIncomingCommandEnvelope(sock as never, { key: null, message: null } as never)).toBeNull()

    await processor.process(sock as never, createMessage('ola') as never)

    expect(sendMessage).not.toHaveBeenCalled()
  })

  it('suporta prefixo customizado via config', async () => {
    mockConfig.commandPrefix = '.'

    const sqlStore = {
      enabled: true,
      recordCommandLog: vi.fn(),
    }
    const logger = createLogger()
    const sendMessage = vi.fn().mockResolvedValue(undefined)
    const execute = vi.fn().mockResolvedValue(undefined)

    mockCommands.ping = { name: 'ping', description: 'ping', execute }

    const sock = {
      user: { id: 'bot@s.whatsapp.net' },
      sendMessage,
      groupMetadata: vi.fn(),
      groupParticipantsUpdate: vi.fn(),
    }

    const { createCommandProcessor } = await import('../src/core/command-runtime/processor.ts')
    const processor = createCommandProcessor({ logger, sqlStore: sqlStore as never })

    await processor.process(sock as never, createMessage('.ping agora') as never)

    expect(execute).toHaveBeenCalledTimes(1)
  })

  it('propaga mencoes e remetente citado para o contexto do comando', async () => {
    const sqlStore = {
      enabled: false,
      recordCommandLog: vi.fn(),
    }
    const logger = createLogger()
    const sendMessage = vi.fn().mockResolvedValue(undefined)
    const execute = vi.fn(async (ctx) => {
      expect(ctx.mentionedJids).toEqual(['5511999999999@s.whatsapp.net'])
      expect(ctx.quotedSender).toBe('5511888888888@s.whatsapp.net')
    })

    mockCommands.ping = { name: 'ping', description: 'ping', execute }

    const sock = {
      user: { id: 'bot@s.whatsapp.net' },
      sendMessage,
      groupMetadata: vi.fn(),
      groupParticipantsUpdate: vi.fn(),
    }

    const message = {
      key: {
        remoteJid: 'grupo@g.us',
        fromMe: false,
        id: 'msg-ctx',
        participant: 'user@s.whatsapp.net',
      },
      pushName: 'Tester',
      message: {
        extendedTextMessage: {
          text: '!ping',
          contextInfo: {
            mentionedJid: ['5511999999999@s.whatsapp.net'],
            participant: '5511888888888@s.whatsapp.net',
          },
        },
      },
      messageTimestamp: 1,
    } as const

    const { createCommandProcessor } = await import('../src/core/command-runtime/processor.ts')
    const processor = createCommandProcessor({ logger, sqlStore: sqlStore as never })

    await processor.process(sock as never, message as never)

    expect(execute).toHaveBeenCalledTimes(1)
  })

  it('aplica antilink removendo participante quando ativo e link nao permitido', async () => {
    mockGroupFeatureStore.isAntilinkEnabled.mockResolvedValue(true)
    mockGroupFeatureStore.getAntilinkAllowedDomains.mockResolvedValue([])
    mockGroupFeatureStore.isAntilinkAllowOwnGroupInviteEnabled.mockResolvedValue(false)

    const logger = createLogger()
    const sqlStore = { enabled: false, recordCommandLog: vi.fn() }
    const sendMessage = vi.fn().mockResolvedValue(undefined)
    const groupMetadata = vi.fn().mockResolvedValue({
      participants: [
        { id: 'user@s.whatsapp.net' },
        { id: 'bot@s.whatsapp.net', admin: 'admin' },
      ],
    })
    const groupParticipantsUpdate = vi.fn().mockResolvedValue([])

    const sock = {
      user: { id: 'bot@s.whatsapp.net' },
      sendMessage,
      groupMetadata,
      groupParticipantsUpdate,
      groupInviteCode: vi.fn().mockResolvedValue('SELF123'),
    }

    const { createCommandProcessor } = await import('../src/core/command-runtime/processor.ts')
    const processor = createCommandProcessor({ logger, sqlStore: sqlStore as never })

    await processor.process(
      sock as never,
      createMessage('acesse https://exemplo.com', { chatId: 'grupo@g.us', participant: 'user@s.whatsapp.net' }) as never
    )

    expect(groupParticipantsUpdate).toHaveBeenCalledWith('grupo@g.us', ['user@s.whatsapp.net'], 'remove')
    expect(sendMessage).toHaveBeenCalledWith(
      'grupo@g.us',
      { text: '🚫 Tester removido por enviar link (antilink ativo).\n🧹 Mensagens apagadas: 1/1.' }
    )
    expect(sendMessage).toHaveBeenCalledWith(
      'grupo@g.us',
      {
        delete: expect.objectContaining({
          id: 'msg-1',
          remoteJid: 'grupo@g.us',
          participant: 'user@s.whatsapp.net',
          fromMe: false,
        }),
      }
    )
  })

  it('detecta varios tipos de link na mesma mensagem', async () => {
    mockGroupFeatureStore.isAntilinkEnabled.mockResolvedValue(true)
    mockGroupFeatureStore.getAntilinkAllowedDomains.mockResolvedValue([])
    mockGroupFeatureStore.isAntilinkAllowOwnGroupInviteEnabled.mockResolvedValue(false)

    const logger = createLogger()
    const sqlStore = { enabled: false, recordCommandLog: vi.fn() }
    const sendMessage = vi.fn().mockResolvedValue(undefined)
    const groupMetadata = vi.fn().mockResolvedValue({
      participants: [{ id: 'user@s.whatsapp.net' }, { id: 'bot@s.whatsapp.net', admin: 'admin' }],
    })
    const groupParticipantsUpdate = vi.fn().mockResolvedValue([])

    const sock = {
      user: { id: 'bot@s.whatsapp.net' },
      sendMessage,
      groupMetadata,
      groupParticipantsUpdate,
      groupInviteCode: vi.fn().mockResolvedValue('SELF123'),
    }

    const { createCommandProcessor } = await import('../src/core/command-runtime/processor.ts')
    const processor = createCommandProcessor({ logger, sqlStore: sqlStore as never })

    await processor.process(
      sock as never,
      createMessage('links: exemplo.com, www.site.org/path e ftp://arquivos.net/repo', {
        chatId: 'grupo@g.us',
        participant: 'user@s.whatsapp.net',
      }) as never
    )

    expect(groupParticipantsUpdate).toHaveBeenCalledWith('grupo@g.us', ['user@s.whatsapp.net'], 'remove')
  })

  it('nao remove quando dominio esta na whitelist do grupo', async () => {
    mockGroupFeatureStore.isAntilinkEnabled.mockResolvedValue(true)
    mockGroupFeatureStore.getAntilinkAllowedDomains.mockResolvedValue(['exemplo.com'])
    mockGroupFeatureStore.isAntilinkAllowOwnGroupInviteEnabled.mockResolvedValue(false)

    const logger = createLogger()
    const sqlStore = { enabled: false, recordCommandLog: vi.fn() }
    const sendMessage = vi.fn().mockResolvedValue(undefined)
    const groupMetadata = vi.fn().mockResolvedValue({
      participants: [{ id: 'user@s.whatsapp.net' }, { id: 'bot@s.whatsapp.net', admin: 'admin' }],
    })
    const groupParticipantsUpdate = vi.fn().mockResolvedValue([])

    const sock = {
      user: { id: 'bot@s.whatsapp.net' },
      sendMessage,
      groupMetadata,
      groupParticipantsUpdate,
      groupInviteCode: vi.fn().mockResolvedValue('SELF123'),
    }

    const { createCommandProcessor } = await import('../src/core/command-runtime/processor.ts')
    const processor = createCommandProcessor({ logger, sqlStore: sqlStore as never })

    await processor.process(
      sock as never,
      createMessage('acesse https://blog.exemplo.com/post', { chatId: 'grupo@g.us' }) as never
    )

    expect(groupParticipantsUpdate).not.toHaveBeenCalled()
  })

  it('respeita whitelist com dominio sem protocolo', async () => {
    mockGroupFeatureStore.isAntilinkEnabled.mockResolvedValue(true)
    mockGroupFeatureStore.getAntilinkAllowedDomains.mockResolvedValue(['exemplo.com'])
    mockGroupFeatureStore.isAntilinkAllowOwnGroupInviteEnabled.mockResolvedValue(false)

    const logger = createLogger()
    const sqlStore = { enabled: false, recordCommandLog: vi.fn() }
    const sendMessage = vi.fn().mockResolvedValue(undefined)
    const groupMetadata = vi.fn().mockResolvedValue({
      participants: [{ id: 'user@s.whatsapp.net' }, { id: 'bot@s.whatsapp.net', admin: 'admin' }],
    })
    const groupParticipantsUpdate = vi.fn().mockResolvedValue([])

    const sock = {
      user: { id: 'bot@s.whatsapp.net' },
      sendMessage,
      groupMetadata,
      groupParticipantsUpdate,
      groupInviteCode: vi.fn().mockResolvedValue('SELF123'),
    }

    const { createCommandProcessor } = await import('../src/core/command-runtime/processor.ts')
    const processor = createCommandProcessor({ logger, sqlStore: sqlStore as never })

    await processor.process(sock as never, createMessage('visite blog.exemplo.com/agora', { chatId: 'grupo@g.us' }) as never)

    expect(groupParticipantsUpdate).not.toHaveBeenCalled()
  })

  it('nao aciona antilink para email', async () => {
    mockGroupFeatureStore.isAntilinkEnabled.mockResolvedValue(true)
    mockGroupFeatureStore.getAntilinkAllowedDomains.mockResolvedValue([])
    mockGroupFeatureStore.isAntilinkAllowOwnGroupInviteEnabled.mockResolvedValue(false)

    const logger = createLogger()
    const sqlStore = { enabled: false, recordCommandLog: vi.fn() }
    const sendMessage = vi.fn().mockResolvedValue(undefined)
    const groupMetadata = vi.fn().mockResolvedValue({
      participants: [{ id: 'user@s.whatsapp.net' }, { id: 'bot@s.whatsapp.net', admin: 'admin' }],
    })
    const groupParticipantsUpdate = vi.fn().mockResolvedValue([])
    const sock = {
      user: { id: 'bot@s.whatsapp.net' },
      sendMessage,
      groupMetadata,
      groupParticipantsUpdate,
      groupInviteCode: vi.fn().mockResolvedValue('SELF123'),
    }

    const { createCommandProcessor } = await import('../src/core/command-runtime/processor.ts')
    const processor = createCommandProcessor({ logger, sqlStore: sqlStore as never })

    await processor.process(
      sock as never,
      createMessage('meu email e user@dominio.com', { chatId: 'grupo@g.us', participant: 'user@s.whatsapp.net' }) as never
    )

    expect(groupParticipantsUpdate).not.toHaveBeenCalled()
  })

  it('nao aciona antilink para nome de arquivo .json', async () => {
    mockGroupFeatureStore.isAntilinkEnabled.mockResolvedValue(true)
    mockGroupFeatureStore.getAntilinkAllowedDomains.mockResolvedValue([])
    mockGroupFeatureStore.isAntilinkAllowOwnGroupInviteEnabled.mockResolvedValue(false)

    const logger = createLogger()
    const sqlStore = { enabled: false, recordCommandLog: vi.fn() }
    const sendMessage = vi.fn().mockResolvedValue(undefined)
    const groupMetadata = vi.fn().mockResolvedValue({
      participants: [{ id: 'user@s.whatsapp.net' }, { id: 'bot@s.whatsapp.net', admin: 'admin' }],
    })
    const groupParticipantsUpdate = vi.fn().mockResolvedValue([])
    const sock = {
      user: { id: 'bot@s.whatsapp.net' },
      sendMessage,
      groupMetadata,
      groupParticipantsUpdate,
      groupInviteCode: vi.fn().mockResolvedValue('SELF123'),
    }

    const { createCommandProcessor } = await import('../src/core/command-runtime/processor.ts')
    const processor = createCommandProcessor({ logger, sqlStore: sqlStore as never })

    await processor.process(
      sock as never,
      createMessage('abre o arquivo config.json', { chatId: 'grupo@g.us', participant: 'user@s.whatsapp.net' }) as never
    )

    expect(groupParticipantsUpdate).not.toHaveBeenCalled()
  })

  it('ignora links internos do proprio WhatsApp em mensagens de midia', async () => {
    mockGroupFeatureStore.isAntilinkEnabled.mockResolvedValue(true)
    mockGroupFeatureStore.getAntilinkAllowedDomains.mockResolvedValue([])
    mockGroupFeatureStore.isAntilinkAllowOwnGroupInviteEnabled.mockResolvedValue(false)

    const logger = createLogger()
    const sqlStore = { enabled: false, recordCommandLog: vi.fn() }
    const sendMessage = vi.fn().mockResolvedValue(undefined)
    const groupMetadata = vi.fn().mockResolvedValue({
      participants: [{ id: 'user@s.whatsapp.net' }, { id: 'bot@s.whatsapp.net', admin: 'admin' }],
    })
    const groupParticipantsUpdate = vi.fn().mockResolvedValue([])
    const sock = {
      user: { id: 'bot@s.whatsapp.net' },
      sendMessage,
      groupMetadata,
      groupParticipantsUpdate,
      groupInviteCode: vi.fn().mockResolvedValue('SELF123'),
    }

    const { createCommandProcessor } = await import('../src/core/command-runtime/processor.ts')
    const processor = createCommandProcessor({ logger, sqlStore: sqlStore as never })

    await processor.process(
      sock as never,
      createMessage('https://mmg.whatsapp.net/v/t62.15575-24/arquivo.enc?ccb=11-4', {
        chatId: 'grupo@g.us',
        participant: 'user@s.whatsapp.net',
      }) as never
    )

    expect(groupParticipantsUpdate).not.toHaveBeenCalled()
  })

  it('ignora stickerMessage com link interno do WhatsApp', async () => {
    mockGroupFeatureStore.isAntilinkEnabled.mockResolvedValue(true)
    mockGroupFeatureStore.getAntilinkAllowedDomains.mockResolvedValue([])
    mockGroupFeatureStore.isAntilinkAllowOwnGroupInviteEnabled.mockResolvedValue(false)

    const logger = createLogger()
    const sqlStore = { enabled: false, recordCommandLog: vi.fn() }
    const sendMessage = vi.fn().mockResolvedValue(undefined)
    const groupMetadata = vi.fn().mockResolvedValue({
      participants: [{ id: 'user@s.whatsapp.net' }, { id: 'bot@s.whatsapp.net', admin: 'admin' }],
    })
    const groupParticipantsUpdate = vi.fn().mockResolvedValue([])
    const sock = {
      user: { id: 'bot@s.whatsapp.net' },
      sendMessage,
      groupMetadata,
      groupParticipantsUpdate,
      groupInviteCode: vi.fn().mockResolvedValue('SELF123'),
    }

    const { createCommandProcessor } = await import('../src/core/command-runtime/processor.ts')
    const processor = createCommandProcessor({ logger, sqlStore: sqlStore as never })

    await processor.process(
      sock as never,
      createStickerMessage('https://mmg.whatsapp.net/v/t62.15575-24/arquivo.enc?ccb=11-4', {
        chatId: 'grupo@g.us',
        participant: 'user@s.whatsapp.net',
      }) as never
    )

    expect(groupParticipantsUpdate).not.toHaveBeenCalled()
  })

  it('remove quando mensagem tem link interno do WhatsApp e link externo junto', async () => {
    mockGroupFeatureStore.isAntilinkEnabled.mockResolvedValue(true)
    mockGroupFeatureStore.getAntilinkAllowedDomains.mockResolvedValue([])
    mockGroupFeatureStore.isAntilinkAllowOwnGroupInviteEnabled.mockResolvedValue(false)

    const logger = createLogger()
    const sqlStore = { enabled: false, recordCommandLog: vi.fn() }
    const sendMessage = vi.fn().mockResolvedValue(undefined)
    const groupMetadata = vi.fn().mockResolvedValue({
      participants: [{ id: 'user@s.whatsapp.net' }, { id: 'bot@s.whatsapp.net', admin: 'admin' }],
    })
    const groupParticipantsUpdate = vi.fn().mockResolvedValue([])
    const sock = {
      user: { id: 'bot@s.whatsapp.net' },
      sendMessage,
      groupMetadata,
      groupParticipantsUpdate,
      groupInviteCode: vi.fn().mockResolvedValue('SELF123'),
    }

    const { createCommandProcessor } = await import('../src/core/command-runtime/processor.ts')
    const processor = createCommandProcessor({ logger, sqlStore: sqlStore as never })

    await processor.process(
      sock as never,
      createMessage('https://mmg.whatsapp.net/v/t62.15575-24/arquivo.enc?ccb=11-4 e https://externo.com', {
        chatId: 'grupo@g.us',
        participant: 'user@s.whatsapp.net',
      }) as never
    )

    expect(groupParticipantsUpdate).toHaveBeenCalledWith('grupo@g.us', ['user@s.whatsapp.net'], 'remove')
  })

  it('permite convite do proprio grupo quando invite on', async () => {
    mockGroupFeatureStore.isAntilinkEnabled.mockResolvedValue(true)
    mockGroupFeatureStore.getAntilinkAllowedDomains.mockResolvedValue([])
    mockGroupFeatureStore.isAntilinkAllowOwnGroupInviteEnabled.mockResolvedValue(true)

    const logger = createLogger()
    const sqlStore = { enabled: false, recordCommandLog: vi.fn() }
    const sendMessage = vi.fn().mockResolvedValue(undefined)
    const groupMetadata = vi.fn().mockResolvedValue({
      participants: [{ id: 'user@s.whatsapp.net' }, { id: 'bot@s.whatsapp.net', admin: 'admin' }],
    })
    const groupParticipantsUpdate = vi.fn().mockResolvedValue([])
    const groupInviteCode = vi.fn().mockResolvedValue('SELF123')

    const sock = {
      user: { id: 'bot@s.whatsapp.net' },
      sendMessage,
      groupMetadata,
      groupParticipantsUpdate,
      groupInviteCode,
    }

    const { createCommandProcessor } = await import('../src/core/command-runtime/processor.ts')
    const processor = createCommandProcessor({ logger, sqlStore: sqlStore as never })

    await processor.process(
      sock as never,
      createMessage('entrem: https://chat.whatsapp.com/SELF123', { chatId: 'grupo@g.us' }) as never
    )

    expect(groupInviteCode).toHaveBeenCalledWith('grupo@g.us')
    expect(groupParticipantsUpdate).not.toHaveBeenCalled()
  })

  it('remove quando invite on mas codigo e de outro grupo', async () => {
    mockGroupFeatureStore.isAntilinkEnabled.mockResolvedValue(true)
    mockGroupFeatureStore.getAntilinkAllowedDomains.mockResolvedValue([])
    mockGroupFeatureStore.isAntilinkAllowOwnGroupInviteEnabled.mockResolvedValue(true)

    const logger = createLogger()
    const sqlStore = { enabled: false, recordCommandLog: vi.fn() }
    const sendMessage = vi.fn().mockResolvedValue(undefined)
    const groupMetadata = vi.fn().mockResolvedValue({
      participants: [{ id: 'user@s.whatsapp.net' }, { id: 'bot@s.whatsapp.net', admin: 'admin' }],
    })
    const groupParticipantsUpdate = vi.fn().mockResolvedValue([])

    const sock = {
      user: { id: 'bot@s.whatsapp.net' },
      sendMessage,
      groupMetadata,
      groupParticipantsUpdate,
      groupInviteCode: vi.fn().mockResolvedValue('SELF123'),
    }

    const { createCommandProcessor } = await import('../src/core/command-runtime/processor.ts')
    const processor = createCommandProcessor({ logger, sqlStore: sqlStore as never })

    await processor.process(
      sock as never,
      createMessage('entrem: https://chat.whatsapp.com/OTHER999', { chatId: 'grupo@g.us' }) as never
    )

    expect(groupParticipantsUpdate).toHaveBeenCalledWith('grupo@g.us', ['user@s.whatsapp.net'], 'remove')
  })

  it('apaga no maximo as ultimas 5 mensagens do usuario apos remocao', async () => {
    mockGroupFeatureStore.isAntilinkEnabled.mockResolvedValue(true)
    mockGroupFeatureStore.getAntilinkAllowedDomains.mockResolvedValue([])
    mockGroupFeatureStore.isAntilinkAllowOwnGroupInviteEnabled.mockResolvedValue(false)

    const logger = createLogger()
    const sqlStore = { enabled: false, recordCommandLog: vi.fn() }
    const sendMessage = vi.fn().mockResolvedValue(undefined)
    const groupMetadata = vi.fn().mockResolvedValue({
      participants: [{ id: 'user@s.whatsapp.net' }, { id: 'bot@s.whatsapp.net', admin: 'admin' }],
    })
    const groupParticipantsUpdate = vi.fn().mockResolvedValue([])
    const sock = {
      user: { id: 'bot@s.whatsapp.net' },
      sendMessage,
      groupMetadata,
      groupParticipantsUpdate,
      groupInviteCode: vi.fn().mockResolvedValue('SELF123'),
    }

    const { createCommandProcessor } = await import('../src/core/command-runtime/processor.ts')
    const processor = createCommandProcessor({ logger, sqlStore: sqlStore as never })

    for (let index = 1; index <= 6; index += 1) {
      await processor.process(
        sock as never,
        {
          ...createMessage(`msg ${index}`, { chatId: 'grupo@g.us', participant: 'user@s.whatsapp.net' }),
          key: {
            ...createMessage('x', { chatId: 'grupo@g.us', participant: 'user@s.whatsapp.net' }).key,
            id: `msg-${index}`,
          },
        } as never
      )
    }

    await processor.process(
      sock as never,
      {
        ...createMessage('link https://dominio-bloqueado.com', { chatId: 'grupo@g.us', participant: 'user@s.whatsapp.net' }),
        key: {
          ...createMessage('x', { chatId: 'grupo@g.us', participant: 'user@s.whatsapp.net' }).key,
          id: 'msg-7',
        },
      } as never
    )

    const deletes = sendMessage.mock.calls.filter((call) => call[1] && typeof call[1] === 'object' && 'delete' in call[1])
    expect(deletes).toHaveLength(5)
  })

  it('revalida delete com segunda tentativa quando a primeira falha', async () => {
    mockGroupFeatureStore.isAntilinkEnabled.mockResolvedValue(true)
    mockGroupFeatureStore.getAntilinkAllowedDomains.mockResolvedValue([])
    mockGroupFeatureStore.isAntilinkAllowOwnGroupInviteEnabled.mockResolvedValue(false)

    const logger = createLogger()
    const sqlStore = { enabled: false, recordCommandLog: vi.fn() }
    const sendMessage = vi
      .fn()
      .mockRejectedValueOnce(new Error('delete-fail-once'))
      .mockResolvedValue(undefined)
      .mockResolvedValue(undefined)
    const groupMetadata = vi.fn().mockResolvedValue({
      participants: [{ id: 'user@s.whatsapp.net' }, { id: 'bot@s.whatsapp.net', admin: 'admin' }],
    })
    const groupParticipantsUpdate = vi.fn().mockResolvedValue([])
    const sock = {
      user: { id: 'bot@s.whatsapp.net' },
      sendMessage,
      groupMetadata,
      groupParticipantsUpdate,
      groupInviteCode: vi.fn().mockResolvedValue('SELF123'),
    }

    const { createCommandProcessor } = await import('../src/core/command-runtime/processor.ts')
    const processor = createCommandProcessor({ logger, sqlStore: sqlStore as never })

    await processor.process(
      sock as never,
      createMessage('link https://dominio-bloqueado.com', { chatId: 'grupo@g.us', participant: 'user@s.whatsapp.net' }) as never
    )

    const deleteCalls = sendMessage.mock.calls.filter((call) => call[1] && typeof call[1] === 'object' && 'delete' in call[1])
    expect(deleteCalls).toHaveLength(2)
    expect(sendMessage).toHaveBeenLastCalledWith(
      'grupo@g.us',
      { text: '🚫 Tester removido por enviar link (antilink ativo).\n🧹 Mensagens apagadas: 1/1.' }
    )
  })
})
