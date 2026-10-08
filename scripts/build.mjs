// Bygger siden fra JEDB-eksporten i data/: leser jedb-josteinskaar.no.json, genererer index.html og
// lager nedskalerte WebP-kopier av bildene (originalene kopieres til dist/). Bildene ligger som
// filer i data/images/ (hentes med scripts/fetch-images.mjs).
import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { marked } from 'marked'
import sharp from 'sharp'

const DATA = 'data'
const STATIC = 'static'
const OUT = 'dist'
const SCHEMA_VERSION = 1
const EXPORTED_FOR = 'josteinskaar.no'
const SITE_URL = 'https://www.josteinskaar.no'
// Galleriet og profilbildet viser nedskalerte kopier. Lenkene (og lightboxen)
// peker fortsatt på originalen, så den lastes først når man klikker.
const THUMBS = 'thumbs'
const THUMB_WIDTHS = [480, 960]
const PHOTO_WIDTH = 240
// Tekster som bare gjelder nettsiden og ikke finnes i eksporten.
const HOBBY_INTRO = 'Her er noen utvalgte prosjekter jeg har kost meg med de siste årene.'
const WORK_INTRO = ''
// Profillenker (GitHub, LinkedIn osv.) åpnes i ny fane.
const NEW_TAB = 'target="_blank" rel="noopener"'
const MONTHS_NO = ['jan.', 'feb.', 'mars', 'april', 'mai', 'juni', 'juli', 'aug.', 'sep.', 'okt.', 'nov.', 'des.']

const fail = (message) => {
  console.error(`Feil: ${message}`)
  process.exit(1)
}

// Eksporten er input som ikke skal redigeres for hånd: ny JSON fra JEDB erstatter den gamle.
// Navnet må være nøyaktig jedb-josteinskaar.no.json, så "jedb-josteinskaar.no (1).json" fra
// nettleseren stopper bygget i stedet for å bli oversett.
const JSON_NAME = `jedb-${EXPORTED_FOR}.json`
const files = await readdir(DATA).catch(() => [])
const misnamed = files.filter((file) => /^jedb-.*\.json$/i.test(file) && file !== JSON_NAME)
if (misnamed.length) fail(`${misnamed.join(', ')} i ${DATA}/ har feil navn, filen skal hete ${JSON_NAME}`)
if (!files.includes(JSON_NAME)) fail(`${DATA}/${JSON_NAME} finnes ikke, last ned eksporten fra JEDB og legg den i ${DATA}/`)

const source = `${DATA}/${JSON_NAME}`
let cv
try {
  cv = JSON.parse(await readFile(source, 'utf8'))
} catch (error) {
  fail(`${source} er ikke gyldig JSON: ${error.message}`)
}
if (cv.schemaVersion !== SCHEMA_VERSION) {
  fail(`${source} har schemaVersion ${cv.schemaVersion}, bygget kjenner bare ${SCHEMA_VERSION}`)
}
// Uten denne sjekken ville en eksport for fjaas.no bygget feil side i stillhet.
if (cv.exportedFor !== EXPORTED_FOR) fail(`${source} er eksportert for ${cv.exportedFor}, ikke ${EXPORTED_FOR}`)

const section = (name) => cv.items.filter((item) => item.section === name)
const profile = section('profile')[0] ?? fail('ingen profile i eksporten')
const work = section('work')
// Jobbprosjekter og hobbyprosjekter vises i hver sin seksjon, i rekkefølgen fra eksporten.
const workProjects = section('projects-work')
const hobbyProjects = section('projects-fun')

// Bildene ligger som filer i data/<src>. Et nytt item eller bilde krever at fetch-images.mjs er kjørt.
const missingImage = (src, what) =>
  fail(`${what} ${src} mangler i ${DATA}/, kjør scripts/fetch-images.mjs (node scripts/fetch-images.mjs ${source} ${DATA})`)
for (const item of cv.items) {
  for (const img of item.images ?? []) {
    if (!(await stat(join(DATA, img.src)).catch(() => null))) missingImage(img.src, `bildet (${item.slug})`)
  }
}

// Profilbildet er det første bildet på profile-itemet.
const photo = profile.images?.[0] ?? fail(`profile (${profile.slug}) har ingen bilder, profilbildet må ligge i ${DATA}/`)

// "8. oktober 2026 16:20", i norsk tid uansett hvor bygget kjører.
const exportedAt = new Date(cv.exportedAt)
if (Number.isNaN(exportedAt.getTime())) fail(`${source} mangler gyldig exportedAt`)
const oslo = (options) => exportedAt.toLocaleString('nb-NO', { timeZone: 'Europe/Oslo', ...options })
const updated = `Sist oppdatert: ${oslo({ day: 'numeric', month: 'long', year: 'numeric' })} ${oslo({ hour: '2-digit', minute: '2-digit', hour12: false })}`

const esc = (s = '') => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)
const md = (s = '') => marked.parse(String(s))
const intro = (text) => (text ? `\n        <div class="body section-intro">${md(text)}</div>` : '')

// Stien til en nedskalert kopi, f.eks. images/fjaas/pulumi.jpg → thumbs/images/fjaas/pulumi-480.webp.
const thumb = (src, width) => `${THUMBS}/${src.replace(/\.[^./]+$/, '')}-${width}.webp`
const thumbs = new Map() // src → bredder som trengs

const srcset = (img, widths, sizes) => {
  thumbs.set(img.src, [...new Set([...(thumbs.get(img.src) ?? []), ...widths])])
  return `src="${esc(thumb(img.src, widths[0]))}" srcset="${widths
    .map((w) => `${esc(thumb(img.src, w))} ${w}w`)
    .join(', ')}" sizes="${sizes}"`
}

// "2026-10" → "okt. 2026", "2024" → "2024". Tom `to` betyr pågående.
const date = (s) => {
  const [year, month] = String(s).split('-')
  return month ? `${MONTHS_NO[Number(month) - 1]} ${year}` : year
}
const range = (from, to) => {
  if (!from) return ''
  return from === to ? date(from) : `${date(from)} – ${to ? date(to) : 'nå'}`
}

const tags = (list = []) =>
  list.length ? `<ul class="tags">${list.map((tag) => `<li>${esc(tag)}</li>`).join('')}</ul>` : ''

const gallery = (list = []) =>
  list.length
    ? `<div class="gallery${list.length === 1 ? ' single' : ''}">${list
        .map(
          (img) => `
          <figure>
            <a href="${esc(img.src)}"><img ${srcset(img, THUMB_WIDTHS, list.length === 1 ? '(max-width: 44rem) 100vw, 42rem' : '(max-width: 30rem) 100vw, 14rem')} alt="${esc(img.alt)}" loading="lazy" /></a>
            ${img.caption ? `<figcaption>${esc(img.caption)}</figcaption>` : ''}
          </figure>`,
        )
        .join('')}
        </div>`
    : ''

// GitHub og eventuelle ekstra lenker vises under teksten. Hovedlenken ligger på tittelen.
const itemLinks = (item) => {
  const list = [
    ...(item.github ? [{ label: 'GitHub', url: item.github }] : []),
    ...(item.links ?? []),
  ]
  return list.length
    ? `<nav class="links">${list.map((link) => `<a ${NEW_TAB} href="${esc(link.url)}">${esc(link.label)}</a>`).join('')}</nav>`
    : ''
}

const heading = (name, url) => `<h3>${url ? `<a href="${esc(url)}">${esc(name)}</a>` : esc(name)}</h3>`

const project = (p) => `
      <article class="card">
        <header>
          ${heading(p.title, p.url)}
          <time>${esc(range(p.from, p.to))}</time>
        </header>
        ${p.description ? `<p class="lead">${esc(p.description)}</p>` : ''}
        ${gallery(p.images)}
        <div class="body">${md(p.summary)}</div>
        ${itemLinks(p)}
        ${tags(p.tags)}
      </article>`

const job = (w) => {
  const lead = w.roles?.length ? w.roles.join(' · ') : w.organization ? w.title : ''
  return `
      <article class="card">
        <header>
          ${heading(w.organization || w.title, w.url)}
          <time>${esc(range(w.from, w.to))}</time>
        </header>
        ${lead ? `<p class="lead">${esc(lead)}</p>` : ''}
        <div class="body">${md(w.summary)}</div>
        ${itemLinks(w)}
        ${tags(w.tags)}
      </article>`
}

// Overskriften under navnet er rollene. Teksten på siden er description (Markdown); summary er skrevet i tredjeperson (til CV) og vises ikke.
const headline = (profile.roles ?? []).join(' · ')

const profileLinks = [
  ...(profile.github ? [{ label: 'GitHub', url: profile.github }] : []),
  ...(profile.links ?? []),
]

const html = `<!doctype html>
<html lang="nb">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${esc(profile.title)}</title>
    <meta name="description" content="${esc(headline)}" />
    <meta property="og:title" content="${esc(profile.title)}" />
    <meta property="og:description" content="${esc(headline)}" />
    <meta property="og:image" content="${esc(new URL(photo.src, `${SITE_URL}/`).href)}" />
    <link rel="icon" type="image/png" sizes="32x32" href="icons/josteinskaar-no-icon-32.png" />
    <link rel="icon" type="image/png" sizes="192x192" href="icons/josteinskaar-no-icon-192.png" />
    <link rel="apple-touch-icon" sizes="180x180" href="icons/josteinskaar-no-icon-180.png" />
    <link rel="manifest" href="site.webmanifest" />
    <link rel="stylesheet" href="style.css" />
    <script src="lightbox.js" defer></script>
    <script>
      if ('IntersectionObserver' in window && !matchMedia('(prefers-reduced-motion: reduce)').matches)
        document.documentElement.classList.add('reveal')
    </script>
    <script src="reveal.js" defer></script>
  </head>
  <body>
    <main>
      <header class="hero">
        <div class="intro">
          <img class="photo" ${srcset(photo, [PHOTO_WIDTH], '7.5rem')} alt="${esc(photo.alt || profile.title)}" />
          <div>
            <h1>${esc(profile.title)}</h1>
            ${headline ? `<p class="headline">${esc(headline)}</p>` : ''}
          </div>
        </div>
        ${profile.description ? `<div class="body">${md(profile.description)}</div>` : ''}
        ${profileLinks.length ? `<nav class="links">${profileLinks.map((link) => `<a ${NEW_TAB} href="${esc(link.url)}">${esc(link.label)}</a>`).join('')}</nav>` : ''}
      </header>
${workProjects.length ? `
      <section>
        ${workProjects.map(project).join('')}
      </section>` : ''}${hobbyProjects.length ? `
      <section>
        <h2>Egne prosjekter</h2>${intro(HOBBY_INTRO)}${hobbyProjects.map(project).join('')}
      </section>` : ''}${work.length ? `
      <section>
        <h2>Erfaring</h2>${intro(WORK_INTRO)}${work.map(job).join('')}
      </section>` : ''}
    </main>
    <footer class="muted">Generert fra <abbr tabindex="0" data-tip="Jostein's Everything Database">JEDB</abbr> · ${updated}</footer>
  </body>
</html>
`

await rm(OUT, { recursive: true, force: true })
await mkdir(OUT, { recursive: true })
await cp(STATIC, OUT, { recursive: true })
await writeFile(`${OUT}/index.html`, html)

// Originalene skrives til dist/ fordi lightboxen lenker til dem.
const originals = new Set(cv.items.flatMap((item) => (item.images ?? []).map((img) => img.src)))
await Promise.all(
  [...originals].map(async (src) => {
    const out = `${OUT}/${src}`
    await mkdir(out.slice(0, out.lastIndexOf('/')), { recursive: true })
    await writeFile(out, await readFile(join(DATA, src)))
  }),
)

// Bildene blir aldri forstørret: er originalen smalere enn bredden, beholdes originalbredden.
await Promise.all(
  [...thumbs].flatMap(([src, widths]) =>
    widths.map(async (width) => {
      const out = `${OUT}/${thumb(src, width)}`
      await mkdir(out.slice(0, out.lastIndexOf('/')), { recursive: true })
      await sharp(await readFile(join(DATA, src)))
        .resize({ width, withoutEnlargement: true })
        .webp({ quality: 75 })
        .toFile(out)
    }),
  ),
)

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
console.log(
  `Skrev ${OUT}/index.html (${workProjects.length} kundeprosjekter, ${hobbyProjects.length} egne prosjekter, ${work.length} jobber, ${thumbs.size} bilder nedskalert, fra ${source})`,
)
