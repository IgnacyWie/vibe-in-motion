type TelegramFetch = typeof fetch

type TelegramBotCommand = {
  command: string
  description: string
}

type TelegramApiResponse<TResult> = {
  ok: boolean
  result: TResult
  description?: string
}

type TelegramUser = {
  id: number
  username?: string
}

type TelegramPhotoSize = {
  file_id: string
  file_unique_id: string
  width: number
  height: number
  file_size?: number
}

type TelegramMessage = {
  caption?: string
  photo?: TelegramPhotoSize[]
  text?: string
  chat?: {
    id: number
  }
  from?: TelegramUser
}

type TelegramFile = {
  file_id: string
  file_unique_id: string
  file_path?: string
  file_size?: number
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
  photoFileIds: string[]
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

type SetMyCommandsOptions = {
  commands: TelegramBotCommand[]
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

  async function setMyCommands({ commands }: SetMyCommandsOptions) {
    return callTelegramApi<boolean>('setMyCommands', {
      commands
    })
  }

  async function getMe() {
    return callTelegramApi<TelegramUser>('getMe', {})
  }

  async function getFile(fileId: string) {
    return callTelegramApi<TelegramFile>('getFile', {
      file_id: fileId
    })
  }

  async function downloadFile(filePath: string) {
    const response = await fetchImpl(`${baseUrl}/file/bot${token}/${filePath}`)

    if (!response.ok) {
      throw new Error(`Telegram file download failed with status ${response.status}`)
    }

    return Buffer.from(await response.arrayBuffer())
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
    downloadFile,
    getFile,
    getMe,
    getUpdates,
    setMyCommands,
    sendMessage
  }
}

export function getIncomingMessage(update: TelegramUpdate): ParsedIncomingMessage | null {
  const message = update?.message
  const text = message?.text || message?.caption

  if (!message || typeof text !== 'string' || !message.chat?.id) {
    return null
  }

  return {
    updateId: update.update_id,
    chatId: message.chat.id,
    fromId: message.from?.id,
    fromUsername: message.from?.username,
    photoFileIds: getLargestPhotoFileIds(message.photo),
    text
  }
}

function getLargestPhotoFileIds(photoSizes: TelegramPhotoSize[] | undefined) {
  if (!photoSizes || photoSizes.length === 0) {
    return []
  }

  return [
    [...photoSizes].sort((a, b) => {
      const aSize = a.file_size || a.width * a.height
      const bSize = b.file_size || b.width * b.height

      return bSize - aSize
    })[0].file_id
  ]
}
