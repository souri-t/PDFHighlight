import { cpSync, mkdirSync } from 'node:fs';

const output = new URL('../public/pdfjs/', import.meta.url);
mkdirSync(output, { recursive: true });
for (const folder of ['cmaps', 'standard_fonts']) {
  cpSync(new URL(`../node_modules/pdfjs-dist/${folder}/`, import.meta.url),
    new URL(`${folder}/`, output), { recursive: true });
}
