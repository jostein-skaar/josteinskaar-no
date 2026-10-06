# josteinskaar-no
Homepage for josteinskaar.no

## Innhold

Alt innhold ligger i [resume.yml](resume.yml), skrevet i
[YAMLResume](https://yamlresume.dev)-format. Samme fil kan senere brukes til å
lage CV (PDF/Word) med `npx yamlresume build resume.yml`.

```sh
npm ci
npm run build   # validerer resume.yml og skriver dist/index.html
```

Push til `main` bygger siden og publiserer `dist/` til `www`-branchen
(GitHub Pages).
