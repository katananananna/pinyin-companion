// Copies the release files into dist/pinyin-companion/, ready to drop into
// <vault>/.obsidian/plugins/. Run after `npm run build`.
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const manifest = JSON.parse(readFileSync('manifest.json', 'utf8'));
const files = ['main.js', 'manifest.json', 'styles.css', 'THIRD_PARTY_NOTICES.md'];
const missing = files.filter((file) => !existsSync(file));
if (missing.length > 0) {
	console.error(`Missing ${missing.join(', ')}. Run "npm run build" first.`);
	process.exit(1);
}
const outDir = join('dist', manifest.id);
rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });
for (const file of files) copyFileSync(file, join(outDir, file));
console.log(`Packaged ${manifest.name} ${manifest.version} into ${outDir}/`);
