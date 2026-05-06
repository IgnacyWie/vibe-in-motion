import assert from 'node:assert/strict'
import test from 'node:test'

import { isAllowedTelegramChat } from '../src/integrations/auth'

test('telegram allowlist allows all chats when unset', () => {
  delete process.env.ALLOWED_TELEGRAM_CHAT_IDS

  assert.equal(isAllowedTelegramChat(12345), true)
})

test('telegram allowlist only allows configured chats', () => {
  process.env.ALLOWED_TELEGRAM_CHAT_IDS = '12345,67890'

  assert.equal(isAllowedTelegramChat(12345), true)
  assert.equal(isAllowedTelegramChat('67890'), true)
  assert.equal(isAllowedTelegramChat(22222), false)
})
