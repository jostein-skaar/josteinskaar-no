// Leser resume.yml, validerer mot YAMLResume-skjemaet og skriver dist/.
import { existsSync } from 'node:fs'
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { ResumeSchema } from '@yamlresume/core'
import { marked } from 'marked'
import { parse } from 'yaml'

const SRC = 'resume.yml'
const STATIC = 'static'
const OUT = 'dist'

const resume = parse(await readFile(SRC, 'utf8'))

const result = ResumeSchema.safeParse(resume)
if (!result.success) {
  console.error(`${SRC} er ikke gyldig YAMLResume:`)
  for (const issue of result.error.issues) {
    console.error(`  - ${issue.path.join('.')}: ${issue.message}`)
  }
  process.exit(1)
}

const { basics, profiles = [], projects = [], work = [] } = resume.content

// `images` er vår egen utvidelse av prosjektene. YAMLResume ignorerer feltet.
// Hvert bilde er enten en sti (relativ til static/) eller { src, alt, caption }.
const images = (p) =>
  (p.images ?? []).map((img) => (typeof img === 'string' ? { src: img } : img))

const missing = projects.flatMap((p) =>
  images(p)
    .filter((img) => !/^https?:\/\//.test(img.src) && !existsSync(`${STATIC}/${img.src}`))
    .map((img) => `  - ${p.name}: fant ikke ${STATIC}/${img.src}`),
)
if (missing.length) {
  console.error(`Bilder mangler:\n${missing.join('\n')}`)
  process.exit(1)
}

const esc = (s = '') =>
  String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)
// Profillenker (GitHub, LinkedIn osv.) og YAMLResume-lenken åpnes i ny fane.
const NEW_TAB = 'target="_blank" rel="noopener"'
const md = (s = '') => marked.parse(String(s))

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const MONTHS_NO = ['jan.', 'feb.', 'mars', 'april', 'mai', 'juni', 'juli', 'aug.', 'sep.', 'okt.', 'nov.', 'des.']
const date = (s) => {
  const [a, b] = String(s).split(' ')
  const i = MONTHS.indexOf(a)
  return b && i >= 0 ? `${MONTHS_NO[i]} ${b}` : String(s)
}
const range = (start, end) =>
  String(start) === String(end) ? date(start) : `${date(start)} – ${end ? date(end) : 'nå'}`

const tags = (keywords = []) =>
  keywords.length
    ? `<ul class="tags">${keywords.map((k) => `<li>${esc(k)}</li>`).join('')}</ul>`
    : ''

const gallery = (list) =>
  list.length
    ? `<div class="gallery${list.length === 1 ? ' single' : ''}">${list
        .map(
          (img) => `
          <figure>
            <a href="${esc(img.src)}"><img src="${esc(img.src)}" alt="${esc(img.alt)}" loading="lazy" /></a>
            ${img.caption ? `<figcaption>${esc(img.caption)}</figcaption>` : ''}
          </figure>`,
        )
        .join('')}
        </div>`
    : ''

const project = (p) => `
      <article class="card">
        <header>
          <h3>${p.url ? `<a href="${esc(p.url)}">${esc(p.name)}</a>` : esc(p.name)}</h3>
          <time>${esc(range(p.startDate, p.endDate))}</time>
        </header>
        ${p.description ? `<p class="lead">${esc(p.description)}</p>` : ''}
        ${gallery(images(p))}
        <div class="body">${md(p.summary)}</div>
        ${tags(p.keywords)}
      </article>`

const job = (w) => `
      <article class="card">
        <header>
          <h3>${w.url ? `<a href="${esc(w.url)}">${esc(w.name)}</a>` : esc(w.name)}</h3>
          <time>${esc(range(w.startDate, w.endDate))}</time>
        </header>
        <p class="lead">${esc(w.position)}</p>
        <div class="body">${md(w.summary)}</div>
        ${tags(w.keywords)}
      </article>`

const links = [
  ...(basics.email ? [`<a href="mailto:${esc(basics.email)}">E-post</a>`] : []),
  ...profiles.filter((p) => p.url).map((p) => `<a ${NEW_TAB} href="${esc(p.url)}">${esc(p.network)}</a>`),
]

const html = `<!doctype html>
<html lang="nb">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${esc(basics.name)}</title>
    <meta name="description" content="${esc(basics.headline)}" />
    <link rel="icon" type="image/png" sizes="32x32" href="icons/josteinskaar-no-icon-32.png" />
    <link rel="icon" type="image/png" sizes="192x192" href="icons/josteinskaar-no-icon-192.png" />
    <link rel="apple-touch-icon" sizes="180x180" href="icons/josteinskaar-no-icon-180.png" />
    <link rel="manifest" href="site.webmanifest" />
    <link rel="stylesheet" href="style.css" />
    <script src="lightbox.js" defer></script>
  </head>
  <body>
    <main>
      <header class="hero">
        <h1>${esc(basics.name)}</h1>
        ${basics.headline ? `<p class="headline">${esc(basics.headline)}</p>` : ''}
        ${basics.summary ? `<div class="body">${md(basics.summary)}</div>` : ''}
        ${links.length ? `<nav class="links">${links.join('')}</nav>` : ''}
      </header>
${projects.length ? `
      <section>
        <h2>Prosjekter</h2>${projects.map(project).join('')}
      </section>` : ''}${work.length ? `
      <section>
        <h2>Erfaring</h2>${work.map(job).join('')}
      </section>` : ''}
    </main>
    <footer class="muted">Generert fra <a ${NEW_TAB} href="https://yamlresume.dev">YAMLResume</a> · ${new Date().getFullYear()}</footer>
  </body>
</html>
`

await rm(OUT, { recursive: true, force: true })
await mkdir(OUT, { recursive: true })
await cp(STATIC, OUT, { recursive: true })
await writeFile(`${OUT}/index.html`, html)

// /favicon.ico for klienter som ikke leser <link rel="icon">. ICO-formatet kan
// pakke inn en PNG direkte: 6 byte header + 16 byte katalogoppføring + PNG.
const png = await readFile(`${STATIC}/icons/josteinskaar-no-icon-32.png`)
const ico = Buffer.alloc(22)
ico.writeUInt16LE(1, 2) // type: ikon
ico.writeUInt16LE(1, 4) // antall bilder
ico.writeUInt8(32, 6) // bredde
ico.writeUInt8(32, 7) // høyde
ico.writeUInt16LE(1, 10) // fargeplan
ico.writeUInt16LE(32, 12) // bit per piksel
ico.writeUInt32LE(png.length, 14)
ico.writeUInt32LE(22, 18) // offset til PNG-data
await writeFile(`${OUT}/favicon.ico`, Buffer.concat([ico, png]))
console.log(`Skrev ${OUT}/index.html (${projects.length} prosjekter, ${work.length} jobber)`)
