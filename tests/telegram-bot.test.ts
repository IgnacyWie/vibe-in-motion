import assert from 'node:assert/strict'
import test from 'node:test'

import { getIncomingMessage } from '../src/integrations/telegram'
import { openDatabase } from '../src/storage/database'
import { createWorkspaceStore } from '../src/storage/workspace-store'
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

test('handleUpdate acknowledges long-running commands before sending the result', async () => {
  process.env.ALLOWED_TELEGRAM_CHAT_IDS = '12345'

  const sentMessages: Array<{ chatId: number; text: string }> = []
  const telegramClient = {
    sendMessage: async (payload: { chatId: number; text: string }) => {
      sentMessages.push(payload)
    }
  }
  const workspaceStore = createWorkspaceStore(openDatabase(':memory:'))

  await handleUpdate({
    update: {
      update_id: 101,
      message: {
        text: '/codex add a help command',
        chat: { id: 12345 },
        from: { id: 999, username: 'ignacy' }
      }
    },
    telegramClient,
    logger: { log() {}, error() {} },
    workspaceStore
  })

  assert.equal(sentMessages.length, 2)
  assert.equal(sentMessages[0].chatId, 12345)
  assert.equal(sentMessages[0].text, 'Processing...')
  assert.match(sentMessages[1].text, /No active workspace/)
})

test('handleUpdate rejects chats outside the allowlist', async () => {
  process.env.ALLOWED_TELEGRAM_CHAT_IDS = '12345'

  const sentMessages: Array<{ chatId: number; text: string }> = []
  const telegramClient = {
    sendMessage: async (payload: { chatId: number; text: string }) => {
      sentMessages.push(payload)
    }
  }
  const workspaceStore = createWorkspaceStore(openDatabase(':memory:'))

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
    logger: { log() {}, error() {} },
    workspaceStore
  })

  assert.equal(sentMessages.length, 1)
  assert.match(sentMessages[0].text, /This chat is not allowed\./)
  assert.match(sentMessages[0].text, /99999/)
})
