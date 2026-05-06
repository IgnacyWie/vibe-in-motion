import assert from 'node:assert/strict'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { Readable, Writable } from 'node:stream'
import test from 'node:test'

import { createApp } from '../src/create-app'

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

type InvokeAppOptions = {
  method: string
  url: string
  body?: string
}

type MockResponse = Writable & {
  statusCode: number
  headers: Record<string, string>
  body?: string
  writeHead: (statusCode: number, headers: Record<string, string>) => MockResponse
  end: (chunk?: string | Buffer) => MockResponse
}

async function invokeApp({ method, url, body = '' }: InvokeAppOptions) {
  const app = createApp()
  const req = new Readable({
    read() {
      this.push(body)
      this.push(null)
    }
  }) as IncomingMessage

  req.method = method
  req.url = url

  const chunks: Buffer[] = []
  const res = new Writable({
    write(chunk, _encoding, callback) {
      chunks.push(Buffer.from(chunk))
      callback()
    }
  }) as MockResponse

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
    res.emit('finish')
    return res
  }

  await app(req, res as unknown as ServerResponse)

  return {
    statusCode: res.statusCode,
    headers: res.headers,
    body: res.body || ''
  }
}
