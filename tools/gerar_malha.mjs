// Gera supabase/dados/malha_pontos.csv (carga da tabela public.malha_pontos, migration 016) a partir da malha
// ferroviária do app de campo e das malhas municipais do IBGE: cada marco de km ganha cidade, UF e código IBGE.
//
// Uso (na raiz do painel):
//   node tools/gerar_malha.mjs <malha_ferroviaria.json do app de campo> <pasta com os arquivos do IBGE>
//
// A pasta do IBGE precisa ter, para cada UF por onde a malha passa (hoje: SP PR SC RS MS MT GO MG):
//   malha_<UF>.json  https://servicodados.ibge.gov.br/api/v3/malhas/estados/<UF>?formato=application/vnd.geo+json&qualidade=intermediaria&intrarregiao=municipio
//   mun_<UF>.json    https://servicodados.ibge.gov.br/api/v1/localidades/estados/<UF>/municipios
//
// Marco que cai fora de todo município (beira de rio, porto, erro de GPS) fica com o município do contorno mais próximo
// e é listado no fim. Marco a mais de 5 km de qualquer município fica sem cidade.
import fs from 'node:fs';
import path from 'node:path';

const [, , arqMalha, pastaIbge] = process.argv;
if (!arqMalha || !pastaIbge) { console.error('Uso: node tools/gerar_malha.mjs <malha_ferroviaria.json> <pasta_ibge>'); process.exit(1); }
const raiz = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const saida = path.join(raiz, 'supabase', 'dados', 'malha_pontos.csv');

// ---------- municípios ----------
const municipios = [];   // { cod, nome, uf, aneis: [[[lon,lat],...]], bbox }
for (const arq of fs.readdirSync(pastaIbge).filter(f => /^malha_[A-Z]{2}\.json$/.test(f))) {
  const uf = arq.slice(6, 8);
  const nomes = new Map(JSON.parse(fs.readFileSync(path.join(pastaIbge, `mun_${uf}.json`), 'utf8')).map(m => [String(m.id), m.nome]));
  for (const f of JSON.parse(fs.readFileSync(path.join(pastaIbge, arq), 'utf8')).features) {
    const cod = String(f.properties.codarea), g = f.geometry;
    const poligonos = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
    const aneis = poligonos.flat();   // anéis externos e buracos: o teste par/ímpar resolve os dois
    let bb = [180, 90, -180, -90];
    for (const a of aneis) for (const [x, y] of a) bb = [Math.min(bb[0], x), Math.min(bb[1], y), Math.max(bb[2], x), Math.max(bb[3], y)];
    if (!nomes.has(cod)) throw new Error(`Município ${cod} sem nome em mun_${uf}.json`);
    municipios.push({ cod, nome: nomes.get(cod), uf, aneis, bbox: bb });
  }
}
if (!municipios.length) throw new Error('Nenhum arquivo malha_<UF>.json na pasta do IBGE');

function dentro(lon, lat, m) {
  if (lon < m.bbox[0] || lon > m.bbox[2] || lat < m.bbox[1] || lat > m.bbox[3]) return false;
  let ok = false;
  for (const a of m.aneis) for (let i = 0, j = a.length - 1; i < a.length; j = i++) {
    const [xi, yi] = a[i], [xj, yj] = a[j];
    if ((yi > lat) !== (yj > lat) && lon < (xj - xi) * (lat - yi) / (yj - yi) + xi) ok = !ok;
  }
  return ok;
}
// distância aproximada (m) do ponto ao contorno do município
function distancia(lon, lat, m) {
  const kx = 111320 * Math.cos(lat * Math.PI / 180), ky = 110540; let melhor = Infinity;
  for (const a of m.aneis) for (let i = 1; i < a.length; i++) {
    const ax = (a[i - 1][0] - lon) * kx, ay = (a[i - 1][1] - lat) * ky, bx = (a[i][0] - lon) * kx, by = (a[i][1] - lat) * ky;
    const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy, t = l2 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / l2)) : 0;
    melhor = Math.min(melhor, Math.hypot(ax + t * dx, ay + t * dy));
  }
  return melhor;
}

// ---------- malha ----------
const malha = JSON.parse(fs.readFileSync(arqMalha, 'utf8'));
const km = m => Math.floor(m / 1000) + '+' + String(m % 1000).padStart(3, '0');
const csv = (v) => /[",\n]/.test(String(v)) ? '"' + String(v).replace(/"/g, '""') + '"' : String(v);
const linhas = ['trecho,sigla,km_metros,km_texto,lat,lon,cidade,uf,codigo_ibge'];
let ultimo = null, aproximados = [], semCidade = [], total = 0;
const porMun = new Map();
for (const [trecho, siglas] of malha.trechos) for (const [sigla, pontos] of siglas) for (const [m, la, lo] of pontos) {
  const lat = la / 1e6, lon = lo / 1e6;
  let mun = ultimo && dentro(lon, lat, ultimo) ? ultimo : municipios.find(x => dentro(lon, lat, x));
  if (!mun) {
    let d = Infinity;
    for (const x of municipios) {
      if (lon < x.bbox[0] - 0.1 || lon > x.bbox[2] + 0.1 || lat < x.bbox[1] - 0.1 || lat > x.bbox[3] + 0.1) continue;
      const dd = distancia(lon, lat, x); if (dd < d) { d = dd; mun = x; }
    }
    if (d > 5000) { mun = null; semCidade.push(`${trecho} > ${sigla} > ${km(m)}`); }
    else aproximados.push(`${trecho} > ${sigla} > ${km(m)} (${Math.round(d)} m de ${mun.nome}/${mun.uf})`);
  }
  if (mun) ultimo = mun;
  linhas.push([trecho, sigla, m, km(m), lat.toFixed(6), lon.toFixed(6), mun ? mun.nome : '', mun ? mun.uf : '', mun ? mun.cod : ''].map(csv).join(','));
  if (mun) porMun.set(mun.uf, (porMun.get(mun.uf) || 0) + 1);
  total++;
}
fs.mkdirSync(path.dirname(saida), { recursive: true });
fs.writeFileSync(saida, linhas.join('\n') + '\n');
// amostra para o MODO DEMONSTRAÇÃO do painel (Baixada Santista): [trecho, sigla, km_metros, cidade, uf]
const DEMO = new Set(['TRECHO 0', 'TRECHO FIPS', 'TRECHO MRS']);
const demo = linhas.slice(1).map(l => l.split(',')).filter(c => DEMO.has(c[0])).map(c => [c[0], c[1], Number(c[2]), c[6], c[7]]);
fs.writeFileSync(path.join(raiz, 'js', 'malha-demo.js'), '/* GERADO por tools/gerar_malha.mjs. Usado só no modo demonstração (no modo normal vem da tabela malha_pontos). */\nwindow.MALHA_DEMO = ' + JSON.stringify(demo) + ';\n');
console.log(`${total} marcos -> ${saida} (${(fs.statSync(saida).size / 1048576).toFixed(1)} MB)`);
console.log('por UF:', Object.fromEntries([...porMun].sort()));
console.log(`fora de município (ficaram com o mais próximo, até 5 km): ${aproximados.length}`); aproximados.slice(0, 15).forEach(x => console.log('  ' + x));
console.log(`sem cidade (mais de 5 km): ${semCidade.length}`); semCidade.slice(0, 15).forEach(x => console.log('  ' + x));
