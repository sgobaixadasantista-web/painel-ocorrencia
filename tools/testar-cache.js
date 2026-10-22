// Confere que o service worker mantém todos os recursos locais do HTML.
const fs = require('node:fs');
const path = require('node:path');
const raiz = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(raiz, 'index.html'), 'utf8');
const sw = fs.readFileSync(path.join(raiz, 'sw.js'), 'utf8');
const lista = sw.match(/var ARQUIVOS\s*=\s*(\[[\s\S]*?\]);/);
if (!lista) throw new Error('Lista ARQUIVOS não encontrada no sw.js.');
const arquivos = JSON.parse(lista[1]);
const recursos = [...html.matchAll(/<(?:link|script)\b[^>]*?\b(?:href|src)="([^"]+)"/g)]
  .map((r) => r[1]).filter((r) => !/^https?:\/\//.test(r));
const faltando = [...new Set(recursos)].filter((r) => !arquivos.includes(r));
const inexistentes = arquivos.filter((r) => r !== './' && !fs.existsSync(path.join(raiz, r)));
const duplicados = arquivos.filter((r, i) => arquivos.indexOf(r) !== i);
if (faltando.length || inexistentes.length || duplicados.length) {
  console.error(JSON.stringify({ faltando, inexistentes, duplicados }, null, 2));
  process.exit(1);
}
console.log('OK: ' + recursos.length + ' referências HTML cobertas; ' + arquivos.length + ' entradas do cache existem.');
