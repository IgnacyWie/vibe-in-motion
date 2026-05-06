export function isAllowedTelegramChat(chatId: string | number) {
  const allowlist = getTelegramChatAllowlist()

  if (allowlist.length === 0) {
    return true
  }

  return allowlist.includes(normalizeValue(chatId))
}

export function getTelegramChatAllowlist() {
  const rawValue = process.env.ALLOWED_TELEGRAM_CHAT_IDS || ''

  return rawValue
    .split(',')
    .map(entry => normalizeValue(entry))
    .filter(Boolean)
}

export function normalizeValue(value: string | number | null | undefined) {
  return String(value || '').trim()
}
