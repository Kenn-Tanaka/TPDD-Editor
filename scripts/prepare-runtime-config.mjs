import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const defaults = JSON.parse(await readFile(resolve(root, 'config/defaults.json'), 'utf8'));
const runtime = JSON.parse(await readFile(resolve(root, 'config/runtime.json'), 'utf8'));

if (runtime.configVersion !== defaults.configVersion) {
  throw new Error(`config/runtime.json の configVersion は ${defaults.configVersion} である必要があります。`);
}
if (runtime.overrides === null || Array.isArray(runtime.overrides) || typeof runtime.overrides !== 'object') {
  throw new Error('config/runtime.json の overrides はオブジェクトである必要があります。');
}
const unknown = Object.keys(runtime.overrides).filter((key) => !(key in defaults));
if (unknown.length > 0) {
  throw new Error(`config/runtime.json に未知の項目があります: ${unknown.join(', ')}`);
}
if ('configVersion' in runtime.overrides) {
  throw new Error('configVersion は overrides で変更できません。');
}

const output = { ...defaults, ...runtime.overrides };
const target = resolve(root, 'public/tpdd-config.json');
await mkdir(dirname(target), { recursive: true });
await writeFile(target, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
console.log(`runtime config: ${target}`);
