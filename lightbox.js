// Viser galleribilder i en lightbox. Lukkes med ESC, X-knappen eller klikk utenfor bildet.
// Uten JavaScript åpner lenken bare bildet direkte.
const dialog = document.createElement('dialog')
dialog.className = 'lightbox'
dialog.innerHTML = `
  <button type="button" class="close" aria-label="Lukk">&times;</button>
  <figure>
    <img alt="" />
    <figcaption></figcaption>
  </figure>`
document.body.append(dialog)

const img = dialog.querySelector('img')
const caption = dialog.querySelector('figcaption')

document.addEventListener('click', (e) => {
  const link = e.target.closest('.gallery a')
  if (!link || e.ctrlKey || e.metaKey || e.shiftKey) return
  e.preventDefault()
  const thumb = link.querySelector('img')
  img.src = link.href
  img.alt = thumb?.alt ?? ''
  caption.textContent = link.closest('figure')?.querySelector('figcaption')?.textContent ?? ''
  caption.hidden = !caption.textContent
  dialog.showModal()
})

// Klikk på bakgrunnen, ikke på selve bildet eller teksten, lukker.
dialog.addEventListener('click', (e) => {
  if (e.target === dialog || e.target.closest('.close') || e.target.tagName === 'FIGURE') dialog.close()
})

dialog.addEventListener('close', () => img.removeAttribute('src'))
