import http from 'node:http'

import { createApp } from './create-app'
import { loadEnv } from './load-env'
import { startTelegramBot } from './telegram-bot'

loadEnv()

const port = Number(process.env.PORT || 3000)
const app = createApp()

const server = http.createServer(app)

server.listen(port, () => {
  console.log(`Server listening on http://localhost:${port}`)
})

startTelegramBot().catch(error => {
  console.error('Telegram bot failed to start')
  console.error(error)
  process.exitCode = 1
})
