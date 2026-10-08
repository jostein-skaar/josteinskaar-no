# josteinskaar-no
Homepage for josteinskaar.no

## Innhold

Siden bygges fra en eksport fra JEDB i `data/`:

- `data/jedb-josteinskaar.no.zip` inneholder `cv.json`, `cv.schema.json` og bildene.
  Det skal ligge nøyaktig én `jedb-*.zip` i `data/`.
- `data/jedb-josteinskaar.no.json` er valgfri og brukes bare hvis den er nyere
  enn `cv.json` i zip-en.

Eksporten må være gjort for `josteinskaar.no`. Profilbildet er første bilde på
`profile`-itemet og må ligge i zip-en.

### Rutine

- **Ny zip:** last ned zip-en fra JEDB og legg den i `data/`, så den erstatter den gamle.
  Nye items og nye bilder krever alltid en ny zip.
- **Rene tekstendringer:** last ned `jedb-josteinskaar.no.json` fra JEDB og legg den i `data/`,
  så den erstatter den gamle. Filen må hete nøyaktig dette (ikke `... (1).json`).

```sh
npm ci
npm run build   # validerer eksporten og skriver dist/
npm run dev     # bygger på nytt ved endringer og serverer dist/
```

Push til `main` bygger siden og publiserer `dist/` til `www`-branchen
(GitHub Pages).
