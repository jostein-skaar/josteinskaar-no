// Henter YAMLResume-skjemaet og legger til `images` på prosjekter, slik at
// editoren validerer og autofullfører resume.yml. Kjør etter oppgradering av YAMLResume.
import { writeFile } from 'node:fs/promises'

const SOURCE = 'https://yamlresume.dev/schema.json'
const OUT = 'resume.schema.json'

const schema = await (await fetch(SOURCE)).json()

const image = {
  anyOf: [
    { type: 'string', description: 'Sti relativ til static/, eller full URL.' },
    {
      type: 'object',
      properties: {
        src: { type: 'string', description: 'Sti relativ til static/, eller full URL.' },
        alt: { type: 'string', description: 'Beskrivelse for skjermlesere.' },
        caption: { type: 'string', description: 'Bildetekst som vises under bildet.' },
      },
      required: ['src'],
      additionalProperties: false,
    },
  ],
}

const projects = schema.properties.content.properties.projects.anyOf.find((s) => s.type === 'array')
projects.items.properties.images = {
  type: 'array',
  title: 'Images',
  description: 'Bilder som vises med prosjektet på josteinskaar.no. Ignoreres av YAMLResume.',
  items: image,
}

delete schema.$id
await writeFile(OUT, `${JSON.stringify(schema, null, 2)}\n`)
console.log(`Skrev ${OUT} fra ${SOURCE}`)
