// Lokal utvikling: bygger ved endringer, serverer dist/ og laster nettleseren på nytt.
import { spawn } from 'node:child_process'
import { watch } from 'node:fs'
import { readdir, readFile, stat } from 'node:fs/promises'
import { createServer } from 'node:http'
import { extname, join, normalize } from 'node:path'

const OUT = 'dist'
const PORT = Number(process.env.PORT) || 3000
const WATCH = ['data', 'static', 'scripts/build.mjs']

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

const run = (command, args, options = {}) =>
  new Promise((resolve) => {
    spawn(command, args, { stdio: 'inherit', ...options }).on('exit', resolve)
  })

// Øyeblikksbilde av data/ (changedAt for eksporten, størrelse og tidspunkt for øvrige filer).
// Brukes til å se om noe faktisk er endret, siden filhendelser kommer flere ganger og også fra hentingen av bilder.
const signature = async () => {
  const files = await readdir('data', { recursive: true })
  const stats = await Promise.all(
    files.map(async (file) => {
      const path = join('data', file)
      const info = await stat(path).catch(() => null)
      if (!info?.isFile()) return ''
      // Eksporten identifiseres med changedAt: samme verdi betyr samme innhold, selv om filen er lagret på nytt
      // eller fått fjernet de midlertidige bildelenkene.
      if (file.endsWith('.json')) {
        const changedAt = await readFile(path, 'utf8').then((text) => JSON.parse(text).changedAt).catch(() => null)
        if (changedAt) return `${file}:${changedAt}`
      }
      return `${file}:${info.size}:${info.mtimeMs}`
    }),
  )
  return stats.join(',')
}

// Råteksten til eksportfilene, for å se at en ny fil er lagt inn selv om changedAt er lik.
const exportsText = async () => {
  const files = (await readdir('data')).filter((file) => file.endsWith('.json'))
  return (await Promise.all(files.map((file) => readFile(join('data', file), 'utf8').catch(() => '')))).join('')
}

const fetchImages = () => run('npm run --silent fetch-images', [], { shell: true })

let lastSignature = ''
let lastExports = ''

// Henter manglende bilder fra eksporten før bygging. Feiler det (utløpte lenker), bygges siden likevel.
const build = async () => {
  if ((await fetchImages()) !== 0) {
    console.error('Kunne ikke hente bilder, bygger uten.')
  }
  lastSignature = await signature()
  lastExports = await exportsText()
  return run(process.execPath, ['scripts/build.mjs'])
}

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
    } else if (pendingData) {
      pendingData = false
      dataChanged()
    }
  }, 100)
}

// Endringer i data/ gir bare nytt bygg hvis innholdet er annerledes enn da forrige bygg startet.
let dataTimer
let pendingData = false
const dataChanged = () => {
  clearTimeout(dataTimer)
  dataTimer = setTimeout(async () => {
    if (running) {
      pendingData = true
      return
    }
    if ((await signature()) !== lastSignature) return rebuild()
    if ((await exportsText()) === lastExports) return
    // Ny fil med samme changedAt: ingenting å bygge, men midlertidige bildelenker fjernes likevel.
    running = true
    console.log('Ny eksportfil har samme changedAt som den forrige, ingen endringer, ignorert.')
    await fetchImages()
    lastExports = await exportsText()
    running = false
    if (pending) {
      pending = false
      rebuild()
    }
  }, 100)
}

await build()
for (const path of WATCH) watch(path, { recursive: true }, path === 'data' ? dataChanged : rebuild)

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
