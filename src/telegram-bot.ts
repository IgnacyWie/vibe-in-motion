import { isAllowedTelegramChat } from './integrations/auth'
import { createCommandRouter, TELEGRAM_BOT_COMMANDS } from './command-router'
import {
  createTelegramClient,
  getIncomingMessage,
  type ParsedIncomingMessage,
  type TelegramUpdate
} from './integrations/telegram'
import { openDatabase } from './storage/database'
import { createWorkspaceStore, type WorkspaceStore } from './storage/workspace-store'

type Logger = Pick<Console, 'log' | 'error'>
type TelegramClient = ReturnType<typeof createTelegramClient>

type StartTelegramBotOptions = {
  telegramClient?: TelegramClient
  logger?: Logger
  workspaceStore?: WorkspaceStore
}

type HandleUpdateOptions = {
  update: TelegramUpdate
  telegramClient: Pick<TelegramClient, 'sendMessage'>
  logger?: Logger
  workspaceStore: WorkspaceStore
}

export async function startTelegramBot({
  telegramClient = createTelegramClient(),
  logger = console,
  workspaceStore = createWorkspaceStore(openDatabase())
}: StartTelegramBotOptions = {}) {
  const bot = await telegramClient.getMe()
  await telegramClient.setMyCommands({
    commands: TELEGRAM_BOT_COMMANDS
  })
  logger.log(`Telegram bot connected as @${bot.username || bot.id}`)

  let offset = 0
  const pollIntervalMs = Number(process.env.TELEGRAM_POLL_INTERVAL_MS || 1000)

  while (true) {
    try {
      const updates = await telegramClient.getUpdates({ offset, timeout: 30 })

      for (const update of updates) {
        offset = update.update_id + 1
        await handleUpdate({ update, telegramClient, logger, workspaceStore })
      }
    } catch (error) {
      logger.error('Telegram polling failed')
      logger.error(error)
      await sleep(pollIntervalMs)
    }
  }
}

export async function handleUpdate({
  update,
  telegramClient,
  logger = console,
  workspaceStore
}: HandleUpdateOptions) {
  const message = getIncomingMessage(update)

  if (!message) {
    return
  }

  if (!isAllowedTelegramChat(message.chatId)) {
    await telegramClient.sendMessage({
      chatId: message.chatId,
      text: [
        'This chat is not allowed.',
        `Chat ID: ${message.chatId}`,
        'Add it to ALLOWED_TELEGRAM_CHAT_IDS in your .env to allow this conversation.'
      ].join('\n')
    })
    return
  }

  const router = createCommandRouter({
    workspaceStore,
    notifyChat: async (targetChatId, text) => {
      await telegramClient.sendMessage({
        chatId: Number(targetChatId),
        text
      })
    }
  })
  if (requiresImmediateAcknowledgement(message.text)) {
    await telegramClient.sendMessage({
      chatId: message.chatId,
      text: 'Processing...'
    })
  }

  const reply = await router.handleCommand({
    chatId: message.chatId,
    text: message.text
  })

  await telegramClient.sendMessage({
    chatId: message.chatId,
    text: reply
  })

  logger.log(`Processed Telegram update ${message.updateId} for chat ${message.chatId}`)
}

export function formatSender(message: ParsedIncomingMessage) {
  if (message.fromUsername) {
    return `@${message.fromUsername}`
  }

  return String(message.fromId || 'unknown')
}

function sleep(durationMs: number) {
  return new Promise(resolve => {
    setTimeout(resolve, durationMs)
  })
}

function requiresImmediateAcknowledgement(text: string) {
  const command = text.trim().split(/\s+/)[0]

  return (
    command === '/codex' ||
    command === '/c' ||
    command === '/codex-ship' ||
    command === '/codex_ship' ||
    command === '/cs' ||
    command === '/rollback' ||
    command === '/rb' ||
    command === '/run' ||
    command === '/r'
  )
}
