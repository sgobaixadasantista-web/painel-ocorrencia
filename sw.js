/* Service worker do painel: deixa o aplicativo abrir sem internet.
   Só guarda arquivos DESTE site (tela, estilos, fontes). Nada do Supabase passa por aqui:
   os dados dos registros ficam no banco e na fila do aparelho (IndexedDB), não neste cache.
   Para forçar atualização do aplicativo em todos os aparelhos, troque o número em VERSAO. */
var VERSAO = 'v3';
var CACHE = 'security-rumo-' + VERSAO;
var ARQUIVOS = [
  "./",
  "index.html",
  "manifest.webmanifest",
  "assets/icon-192.png",
  "css/tokens.css",
  "css/rumo.css",
  "css/app.css",
  "css/design-system.css",
  "css/navigation.css",
  "css/photo-gallery.css",
  "css/modules.css",
  "js/config.js",
  "js/icons.js",
  "js/tipificacao-demo.js",
  "js/minutas-demo.js",
  "js/data.js",
  "js/fila.js",
  "js/campo.js",
  "js/app.js",
  "js/photo-gallery.js",
  "js/rastreamento.js",
  "js/efetivo.js",
  "js/veiculos.js",
  "js/frota.js",
  "js/colaboradores.js",
  "js/navigation.js",
  "assets/icons/rumo-icones.json",
  "assets/logo-fundo-claro.png",
  "assets/logo-fundo-escuro.png",
  "assets/icon-512.png",
  "assets/fonts/Inter-400.woff2",
  "assets/fonts/Inter-600.woff2",
  "assets/fonts/Inter-700.woff2",
  "assets/fonts/Inter-800.woff2"
];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(ARQUIVOS); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (ks) { return Promise.all(ks.filter(function (k) { return k.indexOf('security-rumo-') === 0 && k !== CACHE; }).map(function (k) { return caches.delete(k); })); }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (e) {
  var req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;       // Supabase e outros sites: direto na rede
  var rede = function () { return fetch(req).then(function (r) { if (r && r.ok) { var c = r.clone(); caches.open(CACHE).then(function (ch) { ch.put(req, c); }); } return r; }); };
  var doCache = function () { return caches.match(req, { ignoreSearch: true }); };
  if (req.mode === 'navigate' || /\/js\/config\.js$/.test(url.pathname)) {
    // página e configuração: sempre a versão mais nova quando há internet; do cache quando não há
    e.respondWith(rede().catch(function () { return doCache().then(function (r) { return r || caches.match('index.html'); }); }));
    return;
  }
  // demais arquivos: responde na hora pelo cache e atualiza em segundo plano
  e.respondWith(doCache().then(function (r) { var q = rede().catch(function () { return r; }); return r || q; }));
});
