// Convert Prover.toml → inputs.json so the browser demo can load it as a
// plain fetch() asset. The Noir InputMap accepts strings for Field / u* / u8,
// which is exactly the shape @iarna/toml produces for the workshop Prover.toml
// (every scalar is already quoted).

import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import toml from '@iarna/toml';

const [, , inPath, outPath] = process.argv;
if (!inPath || !outPath) {
  console.error('usage: node toml-to-json.mjs <Prover.toml> <inputs.json>');
  process.exit(1);
}

const parsed = toml.parse(await readFile(resolve(inPath), 'utf8'));
await writeFile(resolve(outPath), JSON.stringify(parsed));
console.log(`wrote ${outPath}`);
