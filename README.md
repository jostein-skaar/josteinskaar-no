# josteinskaar-no
Homepage for josteinskaar.no

## Innhold

Siden bygges fra en eksport fra JEDB i `data/`:

- `data/jedb-josteinskaar.no.json` er eksporten (tekst og metadata). Filen må hete nøyaktig dette.
- `data/images/<slug>/<fil>` er bildene. De ligger i repoet fordi bygget i GitHub Actions
  ikke har tilgang til JEDB. Eksporten har bare midlertidige lenker (60 minutter) til bildene.

Eksporten må være gjort for `josteinskaar.no`. Profilbildet er første bilde på
`profile`-itemet.

### Rutine

Last ned `jedb-josteinskaar.no.json` fra JEDB og legg den i `data/` med nøyaktig dette navnet (ikke
`... (1).json`), slik at den erstatter den gamle eksporten. Kjør så:

```sh
npm run update
```

Kommandoen henter bilder fra eksporten og bygger siden. Bildefilene må hentes innen lenkene utløper,
vanligvis innen en time. Eksporten fra JEDB må fortsatt lastes ned manuelt; `update` henter ikke selve
innholdsdataene. Hvis nedlasting feiler, beholdes lenkene i JSON-en slik at du kan prøve igjen før de
utløper. Etter en vellykket kjøring fjernes de midlertidige lenkene fra JSON-en. Commit så JSON-en og de
nye bildene.

```sh
npm ci
npm run build   # skriver dist/
npm run dev     # bygger på nytt ved endringer og serverer dist/
```

Push til `main` bygger siden og publiserer `dist/` til `www`-branchen
(GitHub Pages).
