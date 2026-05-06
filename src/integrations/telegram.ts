type TelegramFetch = typeof fetch

type TelegramApiResponse<TResult> = {
  ok: boolean
  result: TResult
  description?: string
}

type TelegramUser = {
  id: number
  username?: string
}

type TelegramMessage = {
  text?: string
  chat?: {
    id: number
  }
  from?: TelegramUser
}

export type TelegramUpdate = {
  update_id: number
  message?: TelegramMessage
}

export type ParsedIncomingMessage = {
  updateId: number
  chatId: number
  fromId?: number
  fromUsername?: string
  text: string
}

type GetUpdatesOptions = {
  offset?: number
  timeout?: number
}

type SendMessageOptions = {
  chatId: number
  text: string
}

type CreateTelegramClientOptions = {
  token?: string
  baseUrl?: string
  fetchImpl?: TelegramFetch
}

export function createTelegramClient({
  token = process.env.TELEGRAM_BOT_TOKEN,
  baseUrl = 'https://api.telegram.org',
  fetchImpl = fetch
}: CreateTelegramClientOptions = {}) {
  if (!token) {
    throw new Error('Missing TELEGRAM_BOT_TOKEN')
  }

  async function getUpdates({ offset, timeout = 30 }: GetUpdatesOptions = {}) {
    return callTelegramApi<TelegramUpdate[]>('getUpdates', {
      offset,
      timeout,
      allowed_updates: ['message']
    })
  }

  async function sendMessage({ chatId, text }: SendMessageOptions) {
    return callTelegramApi('sendMessage', {
      chat_id: chatId,
      text
    })
  }

  async function getMe() {
    return callTelegramApi<TelegramUser>('getMe', {})
  }

  async function callTelegramApi<TResult>(method: string, payload: object): Promise<TResult> {
    const response = await fetchImpl(`${baseUrl}/bot${token}/${method}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json; charset=utf-8'
      },
      body: JSON.stringify(payload)
    })

    if (!response.ok) {
      throw new Error(`Telegram API request failed with status ${response.status}`)
    }

    const data = (await response.json()) as TelegramApiResponse<TResult>

    if (!data.ok) {
      throw new Error(data.description || `Telegram API method ${method} failed`)
    }

    return data.result
  }

  return {
    getMe,
    getUpdates,
    sendMessage
  }
}

export function getIncomingMessage(update: TelegramUpdate): ParsedIncomingMessage | null {
  const message = update?.message

  if (!message || typeof message.text !== 'string' || !message.chat?.id) {
    return null
  }

  return {
    updateId: update.update_id,
    chatId: message.chat.id,
    fromId: message.from?.id,
    fromUsername: message.from?.username,
    text: message.text
  }
}
