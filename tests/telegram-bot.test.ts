import assert from 'node:assert/strict'
import test from 'node:test'

import { getIncomingMessage } from '../src/integrations/telegram'
import { handleUpdate } from '../src/telegram-bot'

test('getIncomingMessage extracts a text message update', () => {
  const message = getIncomingMessage({
    update_id: 100,
    message: {
      text: 'Ship it',
      chat: { id: 12345 },
      from: { id: 999, username: 'ignacy' }
    }
  })

  assert.deepEqual(message, {
    updateId: 100,
    chatId: 12345,
    fromId: 999,
    fromUsername: 'ignacy',
    text: 'Ship it'
  })
})

test('handleUpdate replies with the closed-loop message for allowed chats', async () => {
  process.env.ALLOWED_TELEGRAM_CHAT_IDS = '12345'

  const sentMessages: Array<{ chatId: number; text: string }> = []
  const telegramClient = {
    sendMessage: async (payload: { chatId: number; text: string }) => {
      sentMessages.push(payload)
    }
  }

  await handleUpdate({
    update: {
      update_id: 101,
      message: {
        text: 'Make the hero bigger',
        chat: { id: 12345 },
        from: { id: 999, username: 'ignacy' }
      }
    },
    telegramClient,
    logger: { log() {}, error() {} }
  })

  assert.equal(sentMessages.length, 1)
  assert.equal(sentMessages[0].chatId, 12345)
  assert.match(sentMessages[0].text, /Closed loop acknowledged\./)
  assert.match(sentMessages[0].text, /Make the hero bigger/)
})

test('handleUpdate rejects chats outside the allowlist', async () => {
  process.env.ALLOWED_TELEGRAM_CHAT_IDS = '12345'

  const sentMessages: Array<{ chatId: number; text: string }> = []
  const telegramClient = {
    sendMessage: async (payload: { chatId: number; text: string }) => {
      sentMessages.push(payload)
    }
  }

  await handleUpdate({
    update: {
      update_id: 102,
      message: {
        text: 'Deploy',
        chat: { id: 99999 },
        from: { id: 999, username: 'ignacy' }
      }
    },
    telegramClient,
    logger: { log() {}, error() {} }
  })

  assert.equal(sentMessages.length, 1)
  assert.match(sentMessages[0].text, /This chat is not allowed\./)
  assert.match(sentMessages[0].text, /99999/)
})
