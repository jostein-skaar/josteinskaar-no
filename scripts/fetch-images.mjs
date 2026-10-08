// Downloads the images of a JEDB export that are missing locally, then removes the temporary links
// from the JSON so the committed file does not change on every export.
// Usage: node scripts/fetch-images.mjs <export.json> <folder>   (Node 20+, no dependencies)
// An image is saved at <folder>/<src>, e.g. data/images/pulumi/pulumi.jpg.
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const [file, folder] = process.argv.slice(2);
if (!file || !folder) {
	console.error('Usage: node scripts/fetch-images.mjs <export.json> <folder>');
	process.exit(1);
}

const cv = JSON.parse(await readFile(file, 'utf8'));
const images = cv.items.flatMap((item) => item.images);
const problems = [];
let downloaded = 0;

for (const image of images) {
	const target = join(folder, image.src);
	const existing = await stat(target).catch(() => null);
	// File names are never reused for another picture, so the same name and size means the same file.
	if (existing && (image.size === undefined || existing.size === image.size)) continue;
	if (!image.url) {
		problems.push(`${image.src}: no link in the export`);
		continue;
	}
	const response = await fetch(image.url).catch((error) => ({ ok: false, status: error.message }));
	if (!response.ok) {
		problems.push(`${image.src}: ${response.status} (expired link? export again from JEDB)`);
		continue;
	}
	await mkdir(dirname(target), { recursive: true });
	await writeFile(target, Buffer.from(await response.arrayBuffer()));
	downloaded++;
}

if (problems.length) {
	// Keep the links in the file, so running it again can still fetch what is missing.
	console.error(problems.join('\n'));
	process.exit(1);
}

for (const image of images) delete image.url;
delete cv.urlsExpireAt;
await writeFile(file, JSON.stringify(cv, null, 2) + '\n');
console.log(`${images.length} images in the export, ${downloaded} downloaded, links removed from ${file}`);
