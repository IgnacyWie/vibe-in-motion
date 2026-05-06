function isAllowedTelegramChat(chatId) {
  const allowlist = getTelegramChatAllowlist()

  if (allowlist.length === 0) {
    return true
  }

  return allowlist.includes(normalizeValue(chatId))
}

function getTelegramChatAllowlist() {
  const rawValue = process.env.ALLOWED_TELEGRAM_CHAT_IDS || ''

  return rawValue
    .split(',')
    .map(entry => normalizeValue(entry))
    .filter(Boolean)
}

function normalizeValue(value) {
  return String(value || '').trim()
}

module.exports = {
  getTelegramChatAllowlist,
  isAllowedTelegramChat,
  normalizeValue
}
