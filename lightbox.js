// Viser galleribilder i en lightbox. Lukkes med ESC, X-knappen eller klikk utenfor bildet.
// Har prosjektet flere bilder, blar man med piltaster, sveip eller pilknappene.
// Uten JavaScript åpner lenken bare bildet direkte.
const dialog = document.createElement('dialog')
dialog.className = 'lightbox'
dialog.innerHTML = `
  <button type="button" class="close" aria-label="Lukk"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg></button>
  <button type="button" class="nav prev" aria-label="Forrige bilde"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15.5 5l-7 7 7 7" /></svg></button>
  <button type="button" class="nav next" aria-label="Neste bilde"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8.5 5l7 7-7 7" /></svg></button>
  <figure>
    <img alt="" />
    <figcaption><span class="text"></span> <span class="count"></span></figcaption>
  </figure>`
document.body.append(dialog)

const img = dialog.querySelector('img')
const text = dialog.querySelector('.text')
const count = dialog.querySelector('.count')
const caption = dialog.querySelector('figcaption')
const prev = dialog.querySelector('.prev')
const next = dialog.querySelector('.next')

let links = []
let index = 0

// Ingen rundgang: pilen forsvinner på første og siste bilde, så man ser at man er ferdig.
const show = (i) => {
  if (i < 0 || i >= links.length) return
  index = i
  const link = links[index]
  img.src = link.href
  img.alt = link.querySelector('img')?.alt ?? ''
  text.textContent = link.closest('figure')?.querySelector('figcaption')?.textContent ?? ''
  count.textContent = links.length > 1 ? `${index + 1} / ${links.length}` : ''
  caption.hidden = !text.textContent && !count.textContent
  prev.disabled = index === 0
  next.disabled = index === links.length - 1
  // Last naboene i forkant, så blaing føles umiddelbar.
  for (const n of [links[index - 1], links[index + 1]]) if (n) new Image().src = n.href
}

document.addEventListener('click', (e) => {
  const link = e.target.closest('.gallery a')
  if (!link || e.ctrlKey || e.metaKey || e.shiftKey) return
  e.preventDefault()
  links = [...link.closest('.gallery').querySelectorAll('a')]
  dialog.classList.toggle('multiple', links.length > 1)
  show(links.indexOf(link))
  dialog.showModal()
})

dialog.addEventListener('click', (e) => {
  if (e.target.closest('.prev')) return show(index - 1)
  if (e.target.closest('.next')) return show(index + 1)
  // Klikk på bakgrunnen, ikke på selve bildet eller teksten, lukker.
  if (e.target === dialog || e.target.closest('.close') || e.target.tagName === 'FIGURE') dialog.close()
})

// Lytter på hele dokumentet: når en pilknapp deaktiveres på første/siste bilde,
// mister den fokus, og tastetrykk havner ikke lenger i dialogen.
document.addEventListener('keydown', (e) => {
  if (!dialog.open || links.length < 2) return
  if (e.key === 'ArrowLeft') show(index - 1)
  if (e.key === 'ArrowRight') show(index + 1)
})

// Sveip: vannrett bevegelse på minst 40 px som er tydelig mer vannrett enn loddrett.
let startX = 0
let startY = 0
dialog.addEventListener('touchstart', (e) => {
  startX = e.touches[0].clientX
  startY = e.touches[0].clientY
}, { passive: true })
dialog.addEventListener('touchend', (e) => {
  if (links.length < 2) return
  const dx = e.changedTouches[0].clientX - startX
  const dy = e.changedTouches[0].clientY - startY
  if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.5) show(dx < 0 ? index + 1 : index - 1)
})

dialog.addEventListener('close', () => img.removeAttribute('src'))
