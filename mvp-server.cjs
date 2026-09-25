const http = require('http')
const fs = require('fs')
const path = require('path')

const root = path.join(process.cwd(), 'ui', 'dist')
const port = Number(process.env.PORT || 10000)
const runnerUrl = process.env.AUTOMATION_RUNNER_URL || ''

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
}

function safeFile(requestUrl) {
  const urlPath = decodeURIComponent(new URL(requestUrl, 'http://localhost').pathname)
  const normalized = path.normalize(urlPath).replace(/^([/\\])+/, '')
  const candidate = path.join(root, normalized)

  if (!candidate.startsWith(root)) return null
  if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate
  return path.join(root, 'index.html')
}

function proxyApi(req, res) {
  if (!runnerUrl) {
    res.writeHead(503, { 'Content-Type': 'application/json; charset=utf-8' })
    res.end(JSON.stringify({
      error: 'Automation runner is not configured',
    }))
    return
  }

  const target = new URL(req.url || '/', runnerUrl)
  const proxy = http.request(target, {
    method: req.method,
    headers: {
      ...req.headers,
      host: target.host,
      connection: 'close',
    },
  }, upstream => {
    res.statusCode = upstream.statusCode || 502
    Object.entries(upstream.headers).forEach(([name, value]) => {
      if (value !== undefined) res.setHeader(name, value)
    })
    upstream.pipe(res)
  })

  proxy.on('error', err => {
    if (!res.headersSent) {
      res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' })
      res.end(JSON.stringify({
        error: 'Automation runner unavailable',
        details: err.message,
      }))
    }
  })

  req.pipe(proxy)
}

const server = http.createServer((req, res) => {
  if (req.url && req.url.startsWith('/api')) {
    return proxyApi({
      ...req,
      url: req.url.slice(4) || '/',
    }, res)
  }

  if (req.url && req.url.startsWith('/health')) {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
    res.end(JSON.stringify({
      status: 'ok',
      mode: runnerUrl ? 'frontend-with-automation-runner' : 'frontend-only-mvp',
    }))
    return
  }

  const file = safeFile(req.url || '/')

  if (!file || !fs.existsSync(file)) {
    res.writeHead(404)
    res.end('Not found')
    return
  }

  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(500)
      res.end('Internal error')
      return
    }

    res.writeHead(200, {
      'Content-Type': mime[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': file.endsWith('index.html') ? 'no-cache' : 'public, max-age=31536000, immutable',
    })
    res.end(data)
  })
})

server.listen(port, '0.0.0.0', () => {
  console.log('[MVP] Web host listening on 0.0.0.0:' + port)
})
