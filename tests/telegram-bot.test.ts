import assert from 'node:assert/strict'
import test from 'node:test'

import { TELEGRAM_BOT_COMMANDS } from '../src/command-router'
import { createTelegramClient, getIncomingMessage } from '../src/integrations/telegram'
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

test('handleUpdate acknowledges suggested underscored long-running commands', async () => {
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
      update_id: 103,
      message: {
        text: '/codex_ship ship a change',
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

test('createTelegramClient registers Telegram commands', async () => {
  const calls: Array<{ url: string; body: string }> = []
  const telegramClient = createTelegramClient({
    token: 'test-token',
    fetchImpl: async (url, init) => {
      calls.push({
        url: String(url),
        body: String(init?.body || '')
      })

      return {
        ok: true,
        async json() {
          return {
            ok: true,
            result: true
          }
        }
      } as Response
    }
  })

  const result = await telegramClient.setMyCommands({
    commands: TELEGRAM_BOT_COMMANDS
  })

  assert.equal(result, true)
  assert.equal(calls.length, 1)
  assert.equal(calls[0].url, 'https://api.telegram.org/bottest-token/setMyCommands')
  assert.deepEqual(JSON.parse(calls[0].body), {
    commands: TELEGRAM_BOT_COMMANDS
  })
})
