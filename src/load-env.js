const fs = require('node:fs')
const path = require('node:path')

function loadEnv(filePath = path.join(process.cwd(), '.env')) {
  if (!fs.existsSync(filePath)) {
    return
  }

  const fileContents = fs.readFileSync(filePath, 'utf8')
  const lines = fileContents.split(/\r?\n/)

  for (const line of lines) {
    const trimmedLine = line.trim()

    if (!trimmedLine || trimmedLine.startsWith('#')) {
      continue
    }

    const separatorIndex = trimmedLine.indexOf('=')

    if (separatorIndex === -1) {
      continue
    }

    const key = trimmedLine.slice(0, separatorIndex).trim()
    const rawValue = trimmedLine.slice(separatorIndex + 1).trim()

    if (!key || process.env[key] !== undefined) {
      continue
    }

    process.env[key] = stripWrappingQuotes(rawValue)
  }
}

function stripWrappingQuotes(value) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1)
  }

  return value
}

module.exports = {
  loadEnv
}
