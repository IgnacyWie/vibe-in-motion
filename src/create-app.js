function createApp() {
  return async function app(req, res) {
    if (req.method === 'GET' && req.url === '/health') {
      return sendJson(res, 200, { ok: true })
    }

    return sendJson(res, 404, { error: 'Not found' })
  }
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { 'content-type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(payload))
}

module.exports = {
  createApp
}
