// Lokal utvikling: bygger ved endringer, serverer dist/ og laster nettleseren på nytt.
import { spawn } from 'node:child_process'
import { watch } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { extname, join, normalize } from 'node:path'

const OUT = 'dist'
const PORT = Number(process.env.PORT) || 3000
const WATCH = ['resume.yml', 'static', 'scripts/build.mjs']

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
}

const RELOAD = `<script>new EventSource('/__reload').onmessage = () => location.reload()</script>`

const clients = new Set()

const build = () =>
  new Promise((resolve) => {
    spawn(process.execPath, ['scripts/build.mjs'], { stdio: 'inherit' }).on('exit', resolve)
  })

// Bare ett bygg om gangen: bygget sletter og fyller dist/, så to samtidige bygg
// kolliderer. Endringer underveis gir ett nytt bygg når det pågående er ferdig.
let timer
let running = false
let pending = false
const rebuild = () => {
  clearTimeout(timer)
  timer = setTimeout(async () => {
    if (running) {
      pending = true
      return
    }
    running = true
    const code = await build()
    running = false
    if (code === 0) {
      for (const res of clients) res.write('data: reload\n\n')
    }
    if (pending) {
      pending = false
      rebuild()
    }
  }, 100)
}

await build()
for (const path of WATCH) watch(path, { recursive: true }, rebuild)

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost')

  if (url.pathname === '/__reload') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' })
    clients.add(res)
    req.on('close', () => clients.delete(res))
    return
  }

  let path = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\]|\.\.)+/, '')
  if (!path || path.endsWith('/') || path.endsWith('\\')) path += 'index.html'

  try {
    let body = await readFile(join(OUT, path))
    const ext = extname(path)
    if (ext === '.html') body = String(body).replace('</body>', `${RELOAD}</body>`)
    res.writeHead(200, { 'Content-Type': TYPES[ext] ?? 'application/octet-stream' })
    res.end(body)
  } catch {
    res.writeHead(404).end('Ikke funnet')
  }
}).listen(PORT, () => console.log(`Kjører på http://localhost:${PORT}`))
