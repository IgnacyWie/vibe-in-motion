import type { IncomingMessage, ServerResponse } from 'node:http'

export function createApp() {
  return async function app(req: IncomingMessage, res: ServerResponse) {
    if (req.method === 'GET' && req.url === '/health') {
      return sendJson(res, 200, { ok: true })
    }

    return sendJson(res, 404, { error: 'Not found' })
  }
}

function sendJson(res: ServerResponse, statusCode: number, payload: unknown) {
  res.writeHead(statusCode, { 'content-type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(payload))
}
