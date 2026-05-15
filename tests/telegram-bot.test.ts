import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { createCommandQueue } from '../src/command-queue'
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

  await waitForMessages(sentMessages, 2)

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

  await waitForMessages(sentMessages, 2)

  assert.equal(sentMessages.length, 2)
  assert.equal(sentMessages[0].chatId, 12345)
  assert.equal(sentMessages[0].text, 'Processing...')
  assert.match(sentMessages[1].text, /No active workspace/)
})

test('handleUpdate acknowledges rollback commands', async () => {
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
      update_id: 104,
      message: {
        text: '/rollback',
        chat: { id: 12345 },
        from: { id: 999, username: 'ignacy' }
      }
    },
    telegramClient,
    logger: { log() {}, error() {} },
    workspaceStore
  })

  await waitForMessages(sentMessages, 2)

  assert.equal(sentMessages.length, 2)
  assert.equal(sentMessages[0].chatId, 12345)
  assert.equal(sentMessages[0].text, 'Processing...')
  assert.match(sentMessages[1].text, /No active workspace/)
})

test('handleUpdate queues long-running commands behind active work', async () => {
  process.env.ALLOWED_TELEGRAM_CHAT_IDS = '12345'

  const commandQueue = createCommandQueue()
  const sentMessages: Array<{ chatId: number; text: string }> = []
  const telegramClient = {
    sendMessage: async (payload: { chatId: number; text: string }) => {
      sentMessages.push(payload)
    }
  }
  const workspaceStore = createWorkspaceStore(openDatabase(':memory:'))

  commandQueue.enqueue('busy', async () => {
    await new Promise(() => {})
  })

  await handleUpdate({
    commandQueue,
    update: {
      update_id: 105,
      message: {
        text: '/codex add queue support',
        chat: { id: 12345 },
        from: { id: 999, username: 'ignacy' }
      }
    },
    telegramClient,
    logger: { log() {}, error() {} },
    workspaceStore
  })

  assert.equal(sentMessages.length, 1)
  assert.equal(sentMessages[0].chatId, 12345)
  assert.equal(sentMessages[0].text, 'Queued. Position: 1.')
})

test('handleUpdate does not queue commands behind active work in another workspace', async () => {
  process.env.ALLOWED_TELEGRAM_CHAT_IDS = '12345'
  const developerRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'vibe-developer-'))
  const workspaceA = path.join(developerRoot, 'workspace-a')
  const workspaceB = path.join(developerRoot, 'workspace-b')
  fs.mkdirSync(workspaceA)
  fs.mkdirSync(workspaceB)
  process.env.DEVELOPER_ROOT = developerRoot

  const commandQueue = createCommandQueue()
  const sentMessages: Array<{ chatId: number; text: string }> = []
  const telegramClient = {
    sendMessage: async (payload: { chatId: number; text: string }) => {
      sentMessages.push(payload)
    }
  }
  const workspaceStore = createWorkspaceStore(openDatabase(':memory:'))
  workspaceStore.upsertWorkspace('a', 'workspace-a')
  workspaceStore.upsertWorkspace('b', 'workspace-b')
  workspaceStore.setActiveWorkspace(12345, 'b')

  commandQueue.enqueue('busy-a', async () => {
    await new Promise(() => {})
  }, {
    queueKey: workspaceA
  })

  await handleUpdate({
    commandQueue,
    update: {
      update_id: 106,
      message: {
        text: '/run pwd',
        chat: { id: 12345 },
        from: { id: 999, username: 'ignacy' }
      }
    },
    telegramClient,
    logger: { log() {}, error() {} },
    workspaceStore
  })

  assert.equal(sentMessages[0].chatId, 12345)
  assert.equal(sentMessages[0].text, 'Processing...')
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

async function waitForMessages(
  sentMessages: Array<{ chatId: number; text: string }>,
  expectedCount: number
) {
  for (let attempt = 0; attempt < 10; attempt++) {
    if (sentMessages.length >= expectedCount) {
      return
    }

    await new Promise(resolve => setImmediate(resolve))
  }
}
