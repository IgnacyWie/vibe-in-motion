const test = require('node:test')
const assert = require('node:assert/strict')
const { Readable, Writable } = require('node:stream')

const { createApp } = require('../src/create-app')

test('GET /health returns ok', async () => {
  const response = await invokeApp({
    method: 'GET',
    url: '/health'
  })

  assert.equal(response.statusCode, 200)
  assert.deepEqual(JSON.parse(response.body), { ok: true })
})

test('unknown route returns 404', async () => {
  const response = await invokeApp({
    method: 'GET',
    url: '/missing'
  })

  assert.equal(response.statusCode, 404)
  assert.deepEqual(JSON.parse(response.body), { error: 'Not found' })
})

async function invokeApp({ method, url, body = '' }) {
  const app = createApp()
  const req = new Readable({
    read() {
      this.push(body)
      this.push(null)
    }
  })

  req.method = method
  req.url = url

  const chunks = []
  const res = new Writable({
    write(chunk, encoding, callback) {
      chunks.push(Buffer.from(chunk))
      callback()
    }
  })

  res.statusCode = 200
  res.headers = {}
  res.writeHead = (statusCode, headers) => {
    res.statusCode = statusCode
    res.headers = headers
    return res
  }
  res.end = chunk => {
    if (chunk) {
      chunks.push(Buffer.from(chunk))
    }

    res.body = Buffer.concat(chunks).toString('utf8')
    res.finished = true
    res.emit('finish')
  }

  await app(req, res)

  if (!res.finished) {
    await new Promise(resolve => res.once('finish', resolve))
  }

  return {
    statusCode: res.statusCode,
    headers: res.headers,
    body: res.body || ''
  }
}
