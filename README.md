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

- **Rene tekstendringer:** last ned `jedb-josteinskaar.no.json` fra JEDB og legg den i `data/`,
  så den erstatter den gamle. Filen må hete nøyaktig dette (ikke `... (1).json`).
- **Nye eller endrede bilder:** samme, men bildene må hentes innen en time etter eksporten:
  `node scripts/fetch-images.mjs data/jedb-josteinskaar.no.json data`. Scriptet laster ned bilder som
  mangler, hopper over de som finnes, og fjerner de midlertidige lenkene fra JSON-en. Commit så
  JSON-en og de nye bildene.

```sh
npm ci
npm run build   # skriver dist/
npm run dev     # bygger på nytt ved endringer og serverer dist/
```

Push til `main` bygger siden og publiserer `dist/` til `www`-branchen
(GitHub Pages).
