// Render entrypoint: one public HTTP listener and the Job Manager behind it.

const express = require('express')
const http = require('http')
const path = require('path')

const publicPort = Number(process.env.PORT || 10000)

process.env.PORT = '3001'
process.env.RUN_JOB_MANAGER = 'false'
const jobManagerApp = require('./src/server/index.js')

jobManagerApp.listen(3001, '127.0.0.1', () => {
  console.log('[Job Manager] Listening on http://127.0.0.1:3001')
})

const app = express()

function proxyApi(req, res) {
  const forwardedPath = req.url.startsWith('/api')
    ? (req.url.slice(4) || '/')
    : req.url

  const proxy = http.request({
    hostname: '127.0.0.1',
    port: 3001,
    path: forwardedPath,
    method: req.method,
    headers: Object.assign({}, req.headers, {
      host: '127.0.0.1:3001',
      connection: 'close',
    }),
  }, upstream => {
    res.statusCode = upstream.statusCode || 200

    Object.entries(upstream.headers).forEach(([name, value]) => {
      if (value !== undefined) res.setHeader(name, value)
    })

    upstream.pipe(res)
  })

  proxy.on('error', err => {
    if (!res.headersSent) {
      res.status(502).json({
        error: 'Backend unavailable',
        details: err.message,
      })
    }
  })

  req.pipe(proxy)
}

app.use((req, res, next) => {
  if (req.url.startsWith('/api') || req.url.startsWith('/health')) {
    return proxyApi(req, res)
  }
  next()
})

app.use(express.static(path.join(process.cwd(), 'ui', 'dist')))

app.get('/{*splat}', (req, res) => {
  res.sendFile(path.join(process.cwd(), 'ui', 'dist', 'index.html'))
})

app.listen(publicPort, '0.0.0.0', () => {
  console.log('[Render] Public server listening on 0.0.0.0:' + publicPort)
})
