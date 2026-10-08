// Bygger siden fra JEDB-eksporten i data/: leser zip-en i minnet, validerer cv.json,
// genererer index.html og lager nedskalerte WebP-kopier av bildene (originalene kopieres til dist/).
import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import Ajv2020 from 'ajv/dist/2020.js'
import { unzipSync, strFromU8 } from 'fflate'
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
const PROJECTS_INTRO = 'Her er noen utvalgte prosjekter jeg har kost meg med de siste årene.'
const WORK_INTRO = ''
// Profillenker (GitHub, LinkedIn osv.) åpnes i ny fane.
const NEW_TAB = 'target="_blank" rel="noopener"'
const MONTHS_NO = ['jan.', 'feb.', 'mars', 'april', 'mai', 'juni', 'juli', 'aug.', 'sep.', 'okt.', 'nov.', 'des.']

const fail = (message) => {
  console.error(`Feil: ${message}`)
  process.exit(1)
}

// Eksporten er input som ikke skal redigeres for hånd: ny zip fra JEDB erstatter den gamle.
const files = await readdir(DATA).catch(() => [])
const zips = files.filter((file) => /^jedb-.*\.zip$/.test(file))
if (zips.length !== 1) fail(`forventet nøyaktig én jedb-*.zip i ${DATA}/, fant ${zips.length}`)
const zip = unzipSync(new Uint8Array(await readFile(`${DATA}/${zips[0]}`)))

const entry = (path) => zip[path] ?? fail(`${path} mangler i ${zips[0]}`)

// Ved rene tekstendringer holder det å laste ned jedb-josteinskaar.no.json fra JEDB og legge den i data/.
// Navnet må være nøyaktig det, så "jedb-josteinskaar.no (1).json" fra nettleseren stopper bygget i stedet
// for å bli oversett. Den løse filen brukes bare hvis exportedAt er nyere enn cv.json i zip-en.
const JSON_NAME = `jedb-${EXPORTED_FOR}.json`
const misnamed = files.filter((file) => /^jedb-.*\.json$/i.test(file) && file !== JSON_NAME)
if (misnamed.length) fail(`${misnamed.join(', ')} i ${DATA}/ har feil navn, filen skal hete ${JSON_NAME}`)
const jsons = files.filter((file) => file === JSON_NAME)

const parse = (text, name) => {
  try {
    return JSON.parse(text)
  } catch (error) {
    fail(`${name} er ikke gyldig JSON: ${error.message}`)
  }
}
const zipped = parse(strFromU8(entry('cv.json')), `cv.json i ${zips[0]}`)
const loose = jsons.length ? parse(await readFile(`${DATA}/${jsons[0]}`, 'utf8'), `${DATA}/${jsons[0]}`) : null
const cv = loose?.exportedAt > zipped.exportedAt ? loose : zipped
const source = cv === loose ? `${DATA}/${jsons[0]}` : zips[0]
if (cv.schemaVersion !== SCHEMA_VERSION) {
  fail(`cv.json har schemaVersion ${cv.schemaVersion}, bygget kjenner bare ${SCHEMA_VERSION}`)
}
// Begge eksportene er gyldige mot skjemaet, så uten denne sjekken ville en eksport for
// fjaas.no bygget feil side i stillhet.
for (const [name, data] of [[zips[0], zipped], ...(loose ? [[`${DATA}/${jsons[0]}`, loose]] : [])]) {
  if (data.exportedFor !== EXPORTED_FOR) fail(`${name} er eksportert for ${data.exportedFor}, ikke ${EXPORTED_FOR}`)
}
const validate = new Ajv2020({ strict: false }).compile(JSON.parse(strFromU8(entry('cv.schema.json'))))
if (!validate(cv)) fail(`cv.json følger ikke cv.schema.json:\n${JSON.stringify(validate.errors, null, 2)}`)

const section = (name) => cv.items.filter((item) => item.section === name)
const profile = section('profile')[0] ?? fail('ingen profile i eksporten')
const work = section('work')
// Jobbprosjekter før fritidsprosjekter. Eksporten er allerede nyest først innenfor hver seksjon.
const projects = [...section('projects-work'), ...section('projects-fun')]

// Bildene finnes bare i zip-en. Et nytt item eller bilde krever en ny zip-eksport.
for (const item of cv.items) {
  for (const img of item.images ?? []) {
    if (!zip[img.src]) fail(`${img.src} (${item.slug}) mangler i ${zips[0]}, eksporter en ny zip fra JEDB`)
  }
}

// Profilbildet er det første bildet på profile-itemet.
const photo = profile.images?.[0] ?? fail(`profile (${profile.slug}) har ingen bilder, profilbildet må ligge i ${zips[0]}`)

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
${projects.length ? `
      <section>
        <h2>Prosjekter</h2>${intro(PROJECTS_INTRO)}${projects.map(project).join('')}
      </section>` : ''}${work.length ? `
      <section>
        <h2>Erfaring</h2>${intro(WORK_INTRO)}${work.map(job).join('')}
      </section>` : ''}
    </main>
    <footer class="muted">Generert fra <abbr tabindex="0" data-tip="Jostein's Everything Database">JEDB</abbr> · ${new Date().getFullYear()}</footer>
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
    await writeFile(out, zip[src])
  }),
)

// Bildene blir aldri forstørret: er originalen smalere enn bredden, beholdes originalbredden.
await Promise.all(
  [...thumbs].flatMap(([src, widths]) =>
    widths.map(async (width) => {
      const out = `${OUT}/${thumb(src, width)}`
      await mkdir(out.slice(0, out.lastIndexOf('/')), { recursive: true })
      await sharp(zip[src])
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
  `Skrev ${OUT}/index.html (${projects.length} prosjekter, ${work.length} jobber, ${thumbs.size} bilder nedskalert, fra ${source})`,
)
