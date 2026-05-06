const http = require('node:http')

const { createApp } = require('./create-app')
const { loadEnv } = require('./load-env')
const { startTelegramBot } = require('./telegram-bot')

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
