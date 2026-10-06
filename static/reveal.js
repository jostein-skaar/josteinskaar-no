// Kortene glir inn når de kommer til syne. Klassen `reveal` settes i <head> bare når
// nettleseren støtter det og brukeren ikke har bedt om redusert bevegelse.
if (document.documentElement.classList.contains('reveal')) {
  const cards = [...document.querySelectorAll('.card')]

  const show = (card, delay) => {
    card.style.transitionDelay = `${delay}ms`
    card.classList.add('in')
    observer.unobserve(card)
  }

  const observer = new IntersectionObserver(
    (entries) => {
      // Kort som dukker opp samtidig, kommer litt etter hverandre.
      const visible = entries.filter((e) => e.isIntersecting).map((e) => e.target)
      visible.forEach((card, i) => show(card, i * 90))
      // Kort man har hoppet forbi (End-tasten, gjenopprettet scroll) ligger over skjermen
      // og vises med en gang, uten animasjon.
      if (visible.length) {
        for (const card of cards) {
          if (!card.classList.contains('in') && card.getBoundingClientRect().bottom < 0) {
            card.style.transition = 'none'
            show(card, 0)
          }
        }
      }
    },
    { rootMargin: '0px 0px -8% 0px' },
  )
  for (const card of cards) observer.observe(card)
}
