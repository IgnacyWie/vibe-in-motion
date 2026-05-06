import { isAllowedTelegramChat } from './integrations/auth'
import { executePrompt } from './integrations/executor'
import {
  createTelegramClient,
  getIncomingMessage,
  type ParsedIncomingMessage,
  type TelegramUpdate
} from './integrations/telegram'

type Logger = Pick<Console, 'log' | 'error'>
type TelegramClient = ReturnType<typeof createTelegramClient>

type StartTelegramBotOptions = {
  telegramClient?: TelegramClient
  logger?: Logger
}

type HandleUpdateOptions = {
  update: TelegramUpdate
  telegramClient: Pick<TelegramClient, 'sendMessage'>
  logger?: Logger
}

export async function startTelegramBot({
  telegramClient = createTelegramClient(),
  logger = console
}: StartTelegramBotOptions = {}) {
  const bot = await telegramClient.getMe()
  logger.log(`Telegram bot connected as @${bot.username || bot.id}`)

  let offset = 0
  const pollIntervalMs = Number(process.env.TELEGRAM_POLL_INTERVAL_MS || 1000)

  while (true) {
    try {
      const updates = await telegramClient.getUpdates({ offset, timeout: 30 })

      for (const update of updates) {
        offset = update.update_id + 1
        await handleUpdate({ update, telegramClient, logger })
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
  logger = console
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

  const sender = formatSender(message)
  const result = await executePrompt({
    channel: 'telegram',
    from: sender,
    chatId: message.chatId,
    prompt: message.text
  })

  await telegramClient.sendMessage({
    chatId: message.chatId,
    text: result.reply
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
