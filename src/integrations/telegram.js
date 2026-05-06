function createTelegramClient({
  token = process.env.TELEGRAM_BOT_TOKEN,
  baseUrl = 'https://api.telegram.org',
  fetchImpl = fetch
} = {}) {
  if (!token) {
    throw new Error('Missing TELEGRAM_BOT_TOKEN')
  }

  async function getUpdates({ offset, timeout = 30 } = {}) {
    return callTelegramApi('getUpdates', {
      offset,
      timeout,
      allowed_updates: ['message']
    })
  }

  async function sendMessage({ chatId, text }) {
    return callTelegramApi('sendMessage', {
      chat_id: chatId,
      text
    })
  }

  async function getMe() {
    return callTelegramApi('getMe', {})
  }

  async function callTelegramApi(method, payload) {
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

    const data = await response.json()

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

function getIncomingMessage(update) {
  const message = update && update.message

  if (!message || typeof message.text !== 'string') {
    return null
  }

  return {
    updateId: update.update_id,
    chatId: message.chat && message.chat.id,
    fromId: message.from && message.from.id,
    fromUsername: message.from && message.from.username,
    text: message.text
  }
}

module.exports = {
  createTelegramClient,
  getIncomingMessage
}
