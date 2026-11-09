// Guards the split of main.js into feature modules (see app.js).
import test from 'node:test'; import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
const read = name => readFileSync(new URL('../' + name, import.meta.url), 'utf8');
const modules = readdirSync(new URL('..', import.meta.url)).filter(name => name.endsWith('.js') && name !== 'sw.js');

test('app köprüsü: modüllerin app.<ad> ile kullandığı her ad main.js de tanımlı', () => {
  const block = read('main.js').match(/Object\.defineProperties\(app, \{([\s\S]*?)\n\}\);/)[1];
  const defined = new Set([...block.matchAll(/^\s+([\w$]+): \{/gm)].map(match => match[1]));
  for (const name of modules) for (const [, used] of read(name).matchAll(/(?<![\w./'])app\.([A-Za-z_$][\w$]*)/g))
    if (used !== 'js') assert.ok(defined.has(used), `${name}: app.${used} main.js köprüsünde yok`); // "app.js" in comments is not a use
});

test('çevrimdışı önbellek: her modül sw.js listesinde', () => {
  const shell = read('sw.js');
  for (const name of modules) assert.ok(shell.includes(`'./${name}'`), `${name} sw.js SHELL listesinde yok`);
});
