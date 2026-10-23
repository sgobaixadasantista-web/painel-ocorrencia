/* Painel de Campo — DNA Rumo, pensado primeiro para o celular.
   Registro em etapas (Local, Relato, Fotos, Revisar), GPS opcional e fila offline:
   o registro é salvo no aparelho primeiro e só sai da fila quando o servidor confirma. */
(function () {
  'use strict';
  var D = window.PainelData, F = window.PainelFila, C = null, ouvintes = false;
  var PASSOS = ['Local', 'Relato', 'Fotos', 'Revisar'], MAX_FOTOS = 6;

  function U() { return window.PainelUI; }
  function esc(s) { return U().esc(s); }
  function $(id) { return document.getElementById(id); }
  function online() { return navigator.onLine !== false && !(D.offline && D.offline()); }
  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    var b = new Uint8Array(16); (window.crypto || {}).getRandomValues ? crypto.getRandomValues(b) : b.forEach(function (_, i) { b[i] = Math.floor(Math.random() * 256); });
    b[6] = (b[6] & 15) | 64; b[8] = (b[8] & 63) | 128; var h = Array.from(b, function (x) { return ('0' + x.toString(16)).slice(-2); }).join('');
    return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' + h.slice(16, 20) + '-' + h.slice(20);
  }
  function ha(ms) {
    var m = Math.floor((Date.now() - ms) / 60000);
    if (m < 1) return 'agora'; if (m < 60) return 'há ' + m + ' min'; var h = Math.floor(m / 60); if (h < 24) return 'há ' + h + ' h'; return 'há ' + Math.floor(h / 24) + ' d';
  }
  function lsGet(k, padrao) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : padrao; } catch (e) { return padrao; } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* sem armazenamento: segue sem rascunho */ } }
  function lsDel(k) { try { localStorage.removeItem(k); } catch (e) {} }
  function agoraLocal(ms) { var d = new Date(ms || Date.now()), p = function (n) { return (n < 10 ? '0' : '') + n; }; return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + 'T' + p(d.getHours()) + ':' + p(d.getMinutes()); }
  function chaveRasc() { return 'campo-rascunho-' + (C && C.uid || 'x'); }
  function chaveCache() { return 'campo-cache-' + (C && C.uid || 'x'); }
  function chaveLocais() { return 'campo-locais-' + (C && C.uid || 'x'); }
  function novoRasc() { return { trecho: '', sigla: '', local: '', descricao: '', quando: agoraLocal(), lat: null, lon: null, acc: null }; }

  /* ---------- Montagem ---------- */
  function montar(raiz) {
    parar();
    C = { raiz: raiz, uid: null, linhas: [], total: 0, pagina: 1, carregando: true, erroLista: '', cacheEm: null, fila: [], sync: null, novoPedido: false, numeros: {},
      catalogo: null, catalogoAviso: '', sheet: null, passo: 0, rasc: novoRasc(), fotos: [], gpsBusy: false, lendoFoto: 0, det: null, resultado: null, erroPasso: {}, timers: [], unsub: null, rascRecuperado: false };
    raiz.innerHTML = '<div id="ca-main"></div><div id="ca-sheet"></div>';
    raiz.addEventListener('click', aoClicar); raiz.addEventListener('input', aoDigitar); raiz.addEventListener('change', aoMudar);
    render(); carregarCatalogo();
    if (!ouvintes) {
      ouvintes = true;
      window.addEventListener('online', function () { if (C) { render(); sincronizar(); carregarLista({ silencioso: true }); } });
      window.addEventListener('offline', function () { if (C) render(); });
      document.addEventListener('visibilitychange', function () { if (C && !document.hidden) { sincronizar(); } });
      document.addEventListener('keydown', function (e) { if (C && e.key === 'Escape' && !$('modal-root').innerHTML) { if (C.sheet) fecharSheet(); } });
    }
    var eu = C;
    Promise.resolve(D.usuarioId()).then(function (id) {
      if (C !== eu) return; C.uid = id || 'anonimo';
      return F.iniciar();
    }).then(function () {
      if (C !== eu) return;
      return F.listar(C.uid).then(function (l) {
        return Promise.all(l.filter(function (i) { return i.estado === 'enviando'; }).map(function (i) { return F.atualizar(i.clientId, { estado: 'pendente' }); }));
      });
    }).then(function () { return C === eu ? F.listar(C.uid) : []; }).then(function (l) {
      if (C !== eu) return; C.fila = l; carregarCache(); render(); carregarLista(); sincronizar();
      C.timers.push(setInterval(function () { if (C && !document.hidden) { if (C.fila.some(function (i) { return i.estado === 'pendente'; })) sincronizar(); render(); } }, 30000));
      C.unsub = D.assinar(function () { carregarLista({ silencioso: true }); }, function () {});
    });
  }
  function parar() {
    if (!C) return;
    C.timers.forEach(clearInterval); if (C.unsub) C.unsub(); soltarFotos(); if (C.raiz) { C.raiz.removeEventListener('click', aoClicar); C.raiz.removeEventListener('input', aoDigitar); C.raiz.removeEventListener('change', aoMudar); }
    C = null;
  }
  function atualizar() { if (!C) return; sincronizar(); carregarLista(); }

  /* ---------- Dados ---------- */
  function carregarCache() {
    var c = lsGet(chaveCache(), null);
    if (c && c.linhas && !C.linhas.length) { C.linhas = c.linhas; C.total = c.total || c.linhas.length; C.cacheEm = c.em; }
  }
  function carregarLista(op) {
    op = op || {}; if (!C) return Promise.resolve(); var eu = C;
    if (!op.silencioso) { C.carregando = !C.linhas.length; render(); }
    return D.listarEventos({ status: '', busca: '', periodo: 'todos', pagina: 1, porPagina: 20 * C.pagina, somenteMeus: true }).then(function (r) {
      if (C !== eu) return; C.linhas = r.linhas; C.total = r.total; C.carregando = false; C.erroLista = ''; C.cacheEm = null; C.atualizadoEm = Date.now();
      lsSet(chaveCache(), { em: Date.now(), total: r.total, linhas: r.linhas.slice(0, 20) }); render();
    }).catch(function (e) {
      if (C !== eu) return; C.carregando = false;
      if (e.rede || !online()) { carregarCache(); C.erroLista = ''; } else C.erroLista = e.message;
      render();
    });
  }
  function recarregarFila() { return F.listar(C.uid).then(function (l) { if (C) { C.fila = l; render(); } }); }

  /* ---------- Sincronização ---------- */
  function sincronizar() {
    if (!C) return Promise.resolve();
    if (C.sync) { C.novoPedido = true; return C.sync; }
    var eu = C;
    C.sync = (function loop() {
      eu.novoPedido = false;
      return rodada(eu).then(function () { return (eu.novoPedido && C === eu) ? loop() : null; });
    })().then(function () { if (C === eu) { C.sync = null; render(); } }, function () { if (C === eu) { C.sync = null; render(); } });
    render(); return C.sync;
  }
  function rodada(eu) {
    return F.listar(eu.uid).then(function (todos) {
      var fila = todos.filter(function (i) { return i.estado === 'pendente'; }), enviou = false, p = Promise.resolve();
      fila.forEach(function (item) {
        p = p.then(function (parou) {
          if (parou || C !== eu) return true;
          if (!online()) return true;
          return F.atualizar(item.clientId, { estado: 'enviando', tentativas: (item.tentativas || 0) + 1 }).then(recarregarFila).then(function () { return D.registrarEvento(item); })
            .then(function (r) { enviou = true; eu.numeros[item.clientId] = r.numero; return F.remover(item.clientId).then(function () { return false; }); })
            .catch(function (e) {
              if (e && e.rede) return F.atualizar(item.clientId, { estado: 'pendente' }).then(function () { return true; });
              return F.atualizar(item.clientId, { estado: 'erro', erro: (e && e.message) || 'Não foi possível enviar.' }).then(function () { return false; });
            }).then(function (parar) { return recarregarFila().then(function () { return parar; }); });
        });
      });
      return p.then(function () { if (enviou && C === eu) carregarLista({ silencioso: true }); });
    });
  }

  /* ---------- Telas: lista ---------- */
  function syncPill() {
    var pend = C.fila.filter(function (i) { return i.estado !== 'erro'; }).length, erros = C.fila.filter(function (i) { return i.estado === 'erro'; }).length, st, rot, ic, det = '';
    if (C.sync || C.fila.some(function (i) { return i.estado === 'enviando'; })) { st = 'syncing'; rot = 'Enviando…'; ic = 'atualizar'; }
    else if (!online()) { st = 'offline'; rot = 'Offline'; ic = 'offline'; if (pend + erros) det = (pend + erros) + ' aguardando envio'; }
    else if (pend + erros) { st = 'pending'; rot = 'Envio pendente'; ic = 'enviar'; det = (pend + erros) + (pend + erros === 1 ? ' registro' : ' registros'); }
    else { st = 'synced'; rot = 'Sincronizado'; ic = 'sucesso'; }
    return '<span class="r-sync r-sync-' + st + '" role="status">' + ico(ic) + rot + (det ? '<span style="font-weight:400;color:var(--rumo-muted)">· ' + det + '</span>' : '') + '</span>';
  }
  function resultadoTxt(e) {
    if (e.status !== 'concluido') return 'Aguardando triagem da central';
    if (e.triagemCategoria === 'criminal') return 'Encaminhado à inteligência';
    var c = { mecanico: 'Mecânico', social: 'Social', natural: 'Natural' }[e.triagemCategoria];
    return 'Resolvido pela central' + (c ? ' · ' + c : '');
  }
  function cardEvento(e) {
    var conc = e.status === 'concluido';
    return '<article class="r-card ca-card" data-ca="abrir" data-id="' + esc(e.id) + '" tabindex="0" role="button" aria-label="Abrir registro ' + esc(e.numero) + '">' +
      '<div class="ca-head"><b class="nowrapnum">' + esc(e.numero) + '</b>' + U().badge(conc ? 'Concluído' : 'Aguardando triagem', conc ? 'success' : 'info') + '</div>' +
      '<div class="ca-local">' + esc(e.local) + '</div><p class="ca-desc">' + esc(e.descricao) + '</p>' +
      '<div class="ca-meta"><span>' + esc(resultadoTxt(e)) + '</span><span>' + ha(e.criadoEm) + (e.qtdFotos ? ' · ' + e.qtdFotos + (e.qtdFotos === 1 ? ' foto' : ' fotos') : '') + (e.latitude != null ? ' · GPS' : '') + '</span></div></article>';
  }
  function cardPendente(i) {
    var tom = i.estado === 'erro' ? 'danger' : (i.estado === 'enviando' ? 'info' : 'warning'), rot = i.estado === 'erro' ? 'Não enviado' : (i.estado === 'enviando' ? 'Enviando…' : 'Aguardando envio');
    return '<article class="r-card ca-card ca-pend" aria-label="Registro ainda não enviado"><div class="ca-head"><b>Neste aparelho</b>' + U().badge(rot, tom) + '</div>' +
      '<div class="ca-local">' + esc(i.local) + '</div><p class="ca-desc">' + esc(i.descricao) + '</p>' +
      '<div class="ca-meta"><span>Registrado ' + ha(i.registradoEm) + (i.fotos && i.fotos.length ? ' · ' + i.fotos.length + (i.fotos.length === 1 ? ' foto' : ' fotos') : '') + '</span></div>' +
      (i.estado === 'erro' ? '<div class="r-err" role="alert">' + ico('alerta') + esc(i.erro || 'Não foi possível enviar.') + '</div>' : '') +
      (i.estado === 'enviando' ? '' : '<div class="ca-acoes"><button type="button" class="r-btn r-btn-outline r-btn-sm" data-ca="tentar" data-id="' + esc(i.clientId) + '">Tentar agora</button>' +
        '<button type="button" class="r-btn r-btn-ghost r-btn-sm" data-ca="descartar" data-id="' + esc(i.clientId) + '">Descartar</button></div>') + '</article>';
  }
  function render() {
    if (!C || !$('ca-main')) return;
    var ui = U(), h = '<h1 class="r-page-h1">Meus registros</h1><div class="r-page-sub">' + syncPill() +
      '<span>' + (C.cacheEm ? 'Dados de ' + ui.fmtData(C.cacheEm) : (C.atualizadoEm ? 'Atualizado ' + ha(C.atualizadoEm) : '')) + '</span>' + (D.modo === 'demo' ? '<span class="demo-tag">Modo demonstração · dados fictícios</span>' : '') + '</div><section class="r-sect">';
    if (!online()) h += '<p class="aviso" role="status"><b>Você está offline.</b> Os registros serão enviados quando a conexão voltar. O que você registrar agora fica salvo neste aparelho.</p>';
    else if (C.cacheEm) h += '<p class="aviso" role="status">Mostrando os últimos dados salvos. Puxe para atualizar quando a conexão voltar.</p>';
    if (!F.persistente) h += '<p class="aviso" role="alert"><b>Atenção:</b> este navegador não guarda registros no aparelho. Não feche a página enquanto houver registros sem enviar.</p>';
    var pend = C.fila.map(cardPendente).join(''), lista = C.linhas.map(cardEvento).join('');
    if (C.carregando && !C.linhas.length && !C.fila.length) h += ui.estado('loading', 'Carregando', 'Buscando seus registros.');
    else if (C.erroLista && !C.linhas.length && !C.fila.length) h += ui.estado('error', 'Não foi possível carregar', C.erroLista, '<button type="button" class="r-btn r-btn-primary" data-ca="atualizar">Tentar de novo</button>');
    else if (!C.linhas.length && !C.fila.length) h += ui.estado('empty', 'Nenhum registro ainda', 'Toque em "Novo registro" para avisar a central sobre uma ocorrência.');
    else {
      h += '<div class="ca-lista">' + pend + lista + '</div>';
      if (C.linhas.length < C.total) h += '<div class="ca-mais"><button type="button" class="r-btn r-btn-outline" data-ca="mais">Carregar mais (' + (C.total - C.linhas.length) + ')</button></div>';
    }
    h += '</section><div class="r-bottom-bar ca-bar"><button type="button" class="r-btn r-btn-primary" data-ca="novo">' + ico('adicionar') + 'Novo registro</button></div>';
    var foco = document.activeElement && document.activeElement.getAttribute && document.activeElement.getAttribute('data-ca') === 'novo';
    $('ca-main').innerHTML = h; if (foco) { var b = C.raiz.querySelector('[data-ca=novo]'); if (b) b.focus(); }
  }

  /* ---------- Painel de etapas (novo registro) ---------- */
  function abrirNovo() {
    var r = lsGet(chaveRasc(), null); C.rasc = novoRasc(); C.rascRecuperado = false;
    if (r && (r.local || r.descricao)) { C.rasc.local = r.local || ''; C.rasc.trecho = r.trecho || ''; C.rasc.sigla = r.sigla || ''; C.rasc.descricao = r.descricao || ''; C.rasc.lat = r.lat == null ? null : r.lat; C.rasc.lon = r.lon == null ? null : r.lon; C.rasc.acc = r.acc; C.rascRecuperado = true; }
    soltarFotos(); C.fotos = []; C.passo = 0; C.erroPasso = {}; C.sheet = 'novo'; C.resultado = null; renderSheet(); if (!C.catalogo) carregarCatalogo();
  }
  function salvarRasc() { var r = C.rasc; if (!r.local && !r.descricao) { lsDel(chaveRasc()); return; } lsSet(chaveRasc(), { local: r.local, trecho: r.trecho, sigla: r.sigla, descricao: r.descricao, lat: r.lat, lon: r.lon, acc: r.acc }); }
  function soltarFotos() { if (C && C.fotos) C.fotos.forEach(function (f) { try { URL.revokeObjectURL(f.url); } catch (e) {} }); }
  function err(id) { return C.erroPasso[id] ? '<div class="r-err" id="er-' + id + '" role="alert">' + ico('alerta') + esc(C.erroPasso[id]) + '</div>' : ''; }
  function stepsHtml() {
    return '<ol class="r-steps ca-steps" aria-label="Etapas do registro">' + PASSOS.map(function (r, i) {
      var cls = i < C.passo ? ' r-step-done' : (i === C.passo ? ' r-step-current' : '');
      return '<li class="r-step' + cls + '"' + (i === C.passo ? ' aria-current="step"' : '') + '><span class="r-step-n">' + (i < C.passo ? ico('sucesso') : (i + 1)) + '</span>' + r + '</li>' + (i < PASSOS.length - 1 ? '<li class="r-step-sep" aria-hidden="true"></li>' : '');
    }).join('') + '</ol>';
  }
  // Siglas por trecho, conforme planilha SIGLAS(2).xlsx (aba siglas).
  var SIGLAS_POR_TRECHO = {"TRECHO 0":"ZPG,ZZV,ZGM,ZPT,ZGP,ZWU,ZDC,ZXW,ZSM,ZEZ,ZDR","TRECHO 1":"ZEV,ZRB,ZEJ,ZMS,ZEM,ZYQ,ZWI,ZLU,ZKW,ZWW,ZKE,ZGA,ZPS,ZCX,ZER,ZDI,ZDY,ZXP,ZFY,ZYU,ZST,ZXI,ZIC,ZVK,ZDS,ZQB,ZJY,ZVN,ZCP,ZAB,ZHN,ZMY,ZGZ,ZMK,ZXY,ZAL,ZYF,ZBT,ZSS,ZGO,ZVB,ZIE,ZBX,ZWO,ZCQ,ZJM,ZLJ,ZMI,ZXR,ZCN,ZJZ,ZUT,ZEX,ZCO,ZAW,ZBC,ZRJ,ZVY","TRECHO 2":"ZNG,ZBV,ZHO,ZSU,ZAC,ZSW,ZTT,ZLI,ZCD,ZSQ,ZWX,ZRX,ZRO,ZRQ,ZQX,ZOX,ZIQ,ZVI,ZFR,ZSK,ZXH,ZTI,ZOI,ZBL,ZOP,ZZQ,ZZZ,ZPB,ZSB,ZRC,ZBI,ZBM,ZNO","TRECHO 3":"ZAR,ZTO,ZDZ,ZMA,ZDG,ZTN,ZLQ,ZTQ,ZCZ,ZZF,ZSD,ZJP,ZJC,ZXB,ZPN,ZAX,ZSL,ZRI,ZGT,ZXE,ZBH,ZPL,ZBD,ZCJ,ZBR,ZCA","TRECHO 3.1":"ZCV,ZCT,ZUC,ZCG,ZEH,ZSP,ZRU,ZGB,ZMO,ZVU,ZEB,ZRZ,ZEC,ZKY,ZZM,ZVP,ZCF,ZGI,ZMR,ZFN,ZFP,ZRL,ZED,ZJA,ZUR,ZUE,ZTF,ZSF,ZRW,TPO","TRECHO MRS":"ICB,ISN,IBA,IUF,IPG,S33,IAA,S29","TRECHO FIPS":"PSN,PMC,PST,PCX,PCZ"};
  function passoLocal() {
    var r = C.rasc, rec = lsGet(chaveLocais(), []), catalogo = C.catalogo || SIGLAS_POR_TRECHO;
    return (C.rascRecuperado ? '<p class="aviso">Rascunho recuperado. <button type="button" class="r-btn r-btn-ghost r-btn-sm" style="min-height:24px;padding:0" data-ca="rasc-limpar">Começar do zero</button></p>' : '') +
      '<div class="r-field"><label class="r-label" for="ca-trecho">Trecho<span class="r-req">*</span></label><select class="r-input" id="ca-trecho"><option value="">Selecione o trecho</option>' + Object.keys(catalogo).map(function (t) { return '<option value="' + esc(t) + '"' + (r.trecho === t ? ' selected' : '') + '>' + esc(t) + '</option>'; }).join('') + '</select></div>' +
      '<div class="r-field"><label class="r-label" for="ca-sigla">Sigla<span class="r-req">*</span></label><select class="r-input" id="ca-sigla"' + (!r.trecho ? ' disabled' : '') + '><option value="">Selecione a sigla</option>' + (Array.isArray(catalogo[r.trecho]) ? catalogo[r.trecho] : (catalogo[r.trecho] || '').split(',').filter(Boolean)).map(function (s) { return '<option value="' + esc(s) + '"' + (r.sigla === s ? ' selected' : '') + '>' + esc(s) + '</option>'; }).join('') + '</select></div>' +
      (C.catalogoAviso ? '<p class="r-hint" role="status">' + esc(C.catalogoAviso) + '</p>' : '') +
      '<div class="r-field"><label class="r-label" for="ca-local">Local<span class="r-req" aria-hidden="true">*</span></label><input class="r-input" id="ca-local" maxlength="120" autocomplete="off" enterkeyhint="next" value="' + esc(r.local) + '"' + (C.erroPasso.local ? ' aria-invalid="true"' : '') + '>' +
      '<span class="r-hint">Trecho, quilômetro ou estação. Exemplo: Trecho 0, km 89+900</span>' + err('local') + '</div>' +
      (rec.length ? '<div><span class="r-label">Locais recentes</span><div class="opcoes" style="margin-top:6px">' + rec.map(function (l) { return '<button type="button" class="r-chip" data-ca="local-rec" data-v="' + esc(l) + '">' + esc(l) + '</button>'; }).join('') + '</div></div>' : '') +
      '<div class="bloco"><button type="button" class="r-btn r-btn-outline" data-ca="gps"' + (C.gpsBusy ? ' disabled' : '') + '>' + ico('local') + (C.gpsBusy ? 'Buscando localização…' : (r.lat != null ? 'Atualizar localização' : 'Usar minha localização')) + '</button>' +
      (r.lat != null ? '<p class="r-hint" id="ca-gps">GPS anexado: ' + r.lat.toFixed(5) + ', ' + r.lon.toFixed(5) + (r.acc ? ' (± ' + r.acc + ' m)' : '') + ' · <button type="button" class="r-btn r-btn-ghost r-btn-sm" style="min-height:24px;padding:0" data-ca="gps-limpar">Remover</button></p>' : '<p class="r-hint">Opcional. Ajuda a central a achar o ponto exato.</p>') + '</div>';
  }
  function passoRelato() {
    var r = C.rasc;
    return '<div class="r-field"><label class="r-label" for="ca-desc">O que aconteceu<span class="r-req" aria-hidden="true">*</span></label><textarea class="r-input" id="ca-desc" maxlength="4000" rows="6"' + (C.erroPasso.desc ? ' aria-invalid="true"' : '') + '>' + esc(r.descricao) + '</textarea>' +
      '<span class="r-hint">Diga o que viu, o que foi afetado e se há pessoas no local. Quanto mais claro, mais rápido a central decide.</span>' + err('desc') + '</div>' +
      '<div class="r-field"><label class="r-label" for="ca-quando">Quando aconteceu<span class="r-req" aria-hidden="true">*</span></label><input class="r-input" id="ca-quando" type="datetime-local" value="' + esc(r.quando) + '"' + (C.erroPasso.quando ? ' aria-invalid="true"' : '') + '>' +
      '<span class="r-hint">Se você viu agora, deixe como está.</span>' + err('quando') + '</div>';
  }
  function thumbs(grande) {
    if (!C.fotos.length) return '';
    return '<div class="r-thumbs">' + C.fotos.map(function (f) {
      return '<div class="r-thumb"><img src="' + esc(f.url) + '" alt="Foto ' + esc(f.nome) + '">' + (grande ? '<button type="button" class="r-thumb-x" data-ca="rm-foto" data-id="' + esc(f.id) + '" aria-label="Remover foto ' + esc(f.nome) + '">' + ico('fechar') + '</button><span class="r-thumb-name">' + f.kb + ' KB</span>' : '') + '</div>';
    }).join('') + '</div>';
  }
  function passoFotos() {
    var cheio = C.fotos.length >= MAX_FOTOS;
    return '<div class="r-field"><span class="r-label">Fotos <span style="font-weight:400;color:var(--rumo-muted)">(' + C.fotos.length + ' de ' + MAX_FOTOS + ')</span></span>' +
      '<div class="ca-foto-btns"><button type="button" class="r-btn r-btn-outline" data-ca="cam"' + (cheio || C.lendoFoto ? ' disabled' : '') + '>' + ico('camera') + 'Tirar foto</button>' +
      '<button type="button" class="r-btn r-btn-outline" data-ca="gal"' + (cheio || C.lendoFoto ? ' disabled' : '') + '>' + ico('imagem') + 'Da galeria</button></div>' +
      '<input type="file" id="ca-cam" accept="image/*" capture="environment" hidden><input type="file" id="ca-gal" accept="image/*" multiple hidden>' +
      '<span class="r-hint">' + (C.lendoFoto ? 'Preparando foto…' : 'Mostre o dano e o local de longe e de perto. As fotos são reduzidas para enviar rápido.') + '</span></div>' + thumbs(true) +
      (!C.fotos.length ? '<p class="aviso">Sem fotos. Você pode enviar assim, mas fotos ajudam a central e a inteligência.</p>' : '');
  }
  function passoRevisar() {
    var r = C.rasc, ui = U(), q = new Date(r.quando).getTime();
    return '<div class="r-card ca-resumo"><dl class="kv"><dt>Local</dt><dd>' + esc(r.local) + '</dd><dt>Quando</dt><dd>' + ui.fmtData(q) + '</dd>' +
      '<dt>GPS</dt><dd>' + (r.lat != null ? r.lat.toFixed(5) + ', ' + r.lon.toFixed(5) : 'Não anexado') + '</dd></dl><h3 class="sec-t" style="margin-top:12px">O que aconteceu</h3><p class="txt">' + esc(r.descricao) + '</p>' +
      '<h3 class="sec-t" style="margin-top:12px">Fotos</h3>' + (C.fotos.length ? thumbs(false) : '<p class="txt" style="color:var(--rumo-muted)">Sem fotos.</p>') + '</div>' +
      '<p class="aviso">' + (online() ? 'Ao enviar, o registro fica salvo neste aparelho e segue para a central.' : '<b>Você está offline.</b> O registro será salvo neste aparelho e enviado sozinho quando a conexão voltar.') + '</p>';
  }
  function cabSheet(titulo) {
    return '<div class="r-drawer-head">' + ico('checklist') + '<span id="ca-st">' + esc(titulo) + '</span><button type="button" class="r-iconbtn" data-ca="fechar-sheet" aria-label="Fechar">' + ico('fechar') + '</button></div>';
  }
  function renderSheet() {
    var el = $('ca-sheet'); if (!el || !C) return;
    if (!C.sheet) { el.innerHTML = ''; return; }
    var ui = U(), corpo, barra = '';
    if (C.sheet === 'novo') {
      corpo = stepsHtml() + '<div class="ca-body">' + [passoLocal, passoRelato, passoFotos, passoRevisar][C.passo]() + '</div>';
      barra = '<div class="r-bottom-bar"><button type="button" class="r-btn r-btn-outline" data-ca="volt"' + (C.passo === 0 ? ' disabled' : '') + '>Voltar</button><button type="button" class="r-btn r-btn-primary" data-ca="prox"' + (C.lendoFoto ? ' disabled' : '') + '>' + (C.passo === PASSOS.length - 1 ? 'Enviar registro' : 'Avançar') + '</button></div>';
      el.innerHTML = '<div class="ca-sheet" role="dialog" aria-modal="true" aria-labelledby="ca-st">' + cabSheet('Novo registro') + corpo + barra + '</div>';
    } else if (C.sheet === 'resultado') {
      var r = C.resultado || { estado: 'enviando' }, conteudo;
      if (r.estado === 'enviando') conteudo = ui.estado('loading', 'Enviando', 'Salvando o registro e enviando para a central.');
      else if (r.estado === 'enviado') conteudo = '<div class="ca-final">' + ico('sucesso', 'ca-ok') + '<h2>Registro enviado</h2><p>Número <b>' + esc(r.numero) + '</b>. A central já pode ver o que você registrou.</p></div>';
      else if (r.estado === 'salvo') conteudo = '<div class="ca-final">' + ico('offline', 'ca-warn') + '<h2>Salvo no aparelho</h2><p>Sem conexão agora. O registro será enviado sozinho quando o sinal voltar. Você pode acompanhar em "Meus registros".</p></div>';
      else conteudo = '<div class="ca-final">' + ico('erro', 'ca-bad') + '<h2>Não foi possível enviar</h2><p>' + esc(r.msg || 'Tente de novo.') + '</p><p>O registro continua salvo neste aparelho, em "Meus registros".</p></div>';
      var fim = r.estado !== 'enviando';
      el.innerHTML = '<div class="ca-sheet" role="dialog" aria-modal="true" aria-labelledby="ca-st">' + cabSheet('Novo registro') + '<div class="ca-body">' + conteudo + '</div>' +
        (fim ? '<div class="r-bottom-bar"><button type="button" class="r-btn r-btn-outline" data-ca="fechar-sheet">Ver meus registros</button><button type="button" class="r-btn r-btn-primary" data-ca="novo">Novo registro</button></div>' : '') + '</div>';
    } else if (C.sheet === 'detalhe') {
      var d = C.det;
      if (!d) { el.innerHTML = '<div class="ca-sheet" role="dialog" aria-modal="true" aria-labelledby="ca-st">' + cabSheet('Registro') + '<div class="ca-body">' + ui.estado('loading', 'Carregando', 'Abrindo o registro.') + '</div></div>'; return; }
      if (d.erro) { el.innerHTML = '<div class="ca-sheet" role="dialog" aria-modal="true" aria-labelledby="ca-st">' + cabSheet('Registro') + '<div class="ca-body">' + ui.estado(d.rede ? 'offline' : 'error', d.rede ? 'Você está offline' : 'Não foi possível abrir', d.erro) + '</div><div class="r-bottom-bar"><button type="button" class="r-btn r-btn-outline" data-ca="fechar-sheet">Fechar</button></div></div>'; return; }
      var e = d.evento, conc = e.status === 'concluido';
      var passos = ['Registrado', 'Triagem', 'Concluído'];
      var st = '<ol class="r-steps ca-steps" aria-label="Andamento">' + passos.map(function (p, i) { var at = conc ? 3 : 1, cls = i < at ? ' r-step-done' : (i === at ? ' r-step-current' : ''); return '<li class="r-step' + cls + '"><span class="r-step-n">' + (i < at ? ico('sucesso') : (i + 1)) + '</span>' + p + '</li>' + (i < 2 ? '<li class="r-step-sep" aria-hidden="true"></li>' : ''); }).join('') + '</ol>';
      el.innerHTML = '<div class="ca-sheet" role="dialog" aria-modal="true" aria-labelledby="ca-st">' + cabSheet('Registro ' + e.numero) + st + '<div class="ca-body"><div class="linha-status">' + ui.badge(conc ? 'Concluído' : 'Aguardando triagem', conc ? 'success' : 'info') + '<span class="r-hint">' + esc(resultadoTxt(e)) + '</span></div>' +
        '<dl class="kv"><dt>Local</dt><dd>' + esc(e.local) + '</dd><dt>Registrado</dt><dd>' + ui.fmtData(e.criadoEm) + '</dd>' + (e.latitude != null ? '<dt>GPS</dt><dd>' + e.latitude.toFixed(5) + ', ' + e.longitude.toFixed(5) + '</dd>' : '') + '</dl>' +
        '<div><h3 class="sec-t">O que aconteceu</h3><p class="txt">' + esc(e.descricao) + '</p></div>' +
        '<div><h3 class="sec-t">Fotos</h3>' + (d.fotos && d.fotos.length ? '<div class="r-thumbs">' + d.fotos.map(function (u, i) { return '<div class="r-thumb"><a href="' + esc(u) + '" target="_blank" rel="noopener"><img src="' + esc(u) + '" alt="Foto ' + (i + 1) + '" loading="lazy"></a></div>'; }).join('') + '</div>' : '<p class="txt" style="color:var(--rumo-muted)">Sem fotos neste registro.</p>') + '</div></div>' +
        '<div class="r-bottom-bar"><button type="button" class="r-btn r-btn-outline" data-ca="fechar-sheet">Fechar</button></div></div>';
    }
    var primeiro = el.querySelector('input:not([hidden]):not([type=file]), textarea'); if (primeiro && C.sheet === 'novo' && C.passo !== 2 && !C.naoFocar) primeiro.focus();
  }
  function fecharSheet() {
    if (!C || !C.sheet) return;
    var tem = C.sheet === 'novo' && C.fotos.length;
    var fim = function () { soltarFotos(); C.fotos = []; C.sheet = null; C.det = null; renderSheet(); render(); };
    if (tem) U().confirmar({ titulo: 'Fechar o registro?', texto: 'As fotos escolhidas serão descartadas. O texto fica salvo como rascunho.', rotulo: 'Fechar', icone: 'alerta' }).then(function (s) { if (s) fim(); });
    else fim();
  }

  /* ---------- Fotos e GPS ---------- */
  function reduzir(arquivo) {
    return new Promise(function (res, rej) {
      var img = new Image(), url = URL.createObjectURL(arquivo);
      img.onload = function () {
        var max = 1600, sc = Math.min(1, max / Math.max(img.width, img.height)), cv = document.createElement('canvas');
        cv.width = Math.max(1, Math.round(img.width * sc)); cv.height = Math.max(1, Math.round(img.height * sc));
        cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
        cv.toBlob(function (b) { URL.revokeObjectURL(url); b ? res(b) : rej(new Error('falha')); }, 'image/jpeg', 0.8);
      };
      img.onerror = function () { URL.revokeObjectURL(url); rej(new Error('leitura')); };
      img.src = url;
    });
  }
  async function adicionarFotos(lista) {
    var arq = Array.prototype.slice.call(lista || []).slice(0, MAX_FOTOS - C.fotos.length), eu = C; if (!arq.length) return;
    C.lendoFoto = arq.length; C.naoFocar = true; renderSheet();
    for (var i = 0; i < arq.length; i++) {
      try { var b = await reduzir(arq[i]); if (C !== eu) return; C.fotos.push({ id: uuid(), blob: b, url: URL.createObjectURL(b), nome: (arq[i].name || 'foto').slice(0, 30), kb: Math.max(1, Math.round(b.size / 1024)) }); }
      catch (e) { U().toast('warning', 'Foto não lida', 'Não foi possível usar "' + (arq[i].name || 'foto') + '". Tente outra.'); }
      C.lendoFoto = Math.max(0, C.lendoFoto - 1);
    }
    C.lendoFoto = 0; renderSheet(); C.naoFocar = false;
  }
  function pegarGps() {
    if (!navigator.geolocation) { U().toast('warning', 'GPS indisponível', 'Este aparelho não informa a localização. Digite o local.'); return; }
    var eu = C; C.gpsBusy = true; C.naoFocar = true; renderSheet();
    navigator.geolocation.getCurrentPosition(function (p) {
      if (C !== eu) return; C.gpsBusy = false; C.rasc.lat = Math.round(p.coords.latitude * 1e6) / 1e6; C.rasc.lon = Math.round(p.coords.longitude * 1e6) / 1e6; C.rasc.acc = Math.round(p.coords.accuracy || 0) || null; salvarRasc(); renderSheet(); C.naoFocar = false;
    }, function (e) {
      if (C !== eu) return; C.gpsBusy = false; renderSheet(); C.naoFocar = false;
      U().toast('warning', 'Sem localização', e && e.code === 1 ? 'Permissão negada. Libere a localização nas configurações do navegador ou digite o local.' : (e && e.code === 3 ? 'Demorou demais para achar o GPS. Tente de novo ao ar livre.' : 'Não foi possível obter a localização. Digite o local.'));
    }, { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 });
  }

  /* ---------- Validação e envio ---------- */
  function validar(passo) {
    var r = C.rasc; C.erroPasso = {};
    if (passo === 0 && r.local.trim().length < 3) C.erroPasso.local = 'Informe o local (pelo menos 3 letras).';
    if (passo === 1) {
      if (r.descricao.trim().length < 10) C.erroPasso.desc = 'Descreva o que aconteceu (pelo menos 10 letras).';
      var t = new Date(r.quando).getTime();
      if (!r.quando || isNaN(t)) C.erroPasso.quando = 'Informe quando aconteceu.';
      else if (t > Date.now() + 5 * 60000) C.erroPasso.quando = 'O horário não pode estar no futuro.';
      else if (t < Date.now() - 30 * 864e5) C.erroPasso.quando = 'Mais de 30 dias atrás. Peça à central para lançar este registro.';
    }
    return !Object.keys(C.erroPasso).length;
  }
  async function enviar() {
    var r = C.rasc, eu = C, item = { clientId: uuid(), usuarioId: C.uid, local: r.local.trim(), descricao: r.descricao.trim(), lat: r.lat, lon: r.lon, registradoEm: new Date(r.quando).getTime(),
      fotos: C.fotos.map(function (f) { return f.blob; }), estado: 'pendente', tentativas: 0, criadoEm: Date.now(), erro: '' };
    try { await F.adicionar(item); } catch (e) { U().toast('danger', 'Não foi possível salvar no aparelho', 'Libere espaço no aparelho e tente de novo.'); return; }
    var rec = lsGet(chaveLocais(), []).filter(function (l) { return l !== item.local; }); rec.unshift(item.local); lsSet(chaveLocais(), rec.slice(0, 5));
    lsDel(chaveRasc()); soltarFotos(); C.fotos = []; C.rasc = novoRasc(); C.sheet = 'resultado'; C.resultado = { estado: 'enviando' }; renderSheet();
    await recarregarFila(); await sincronizar();
    if (C !== eu) return;
    var ainda = (await F.listar(C.uid)).filter(function (i) { return i.clientId === item.clientId; })[0];
    C.resultado = !ainda ? { estado: 'enviado', numero: C.numeros[item.clientId] || '' } : (ainda.estado === 'erro' ? { estado: 'erro', msg: ainda.erro } : { estado: 'salvo' });
    C.fila = await F.listar(C.uid); if (C.sheet === 'resultado') renderSheet(); render();
  }
  function abrirDetalhe(id) {
    C.sheet = 'detalhe'; C.det = null; renderSheet();
    var eu = C; D.detalheEvento(id).then(function (d) { if (C !== eu) return; C.det = d; renderSheet(); })
      .catch(function (e) { if (C !== eu) return; C.det = { erro: e.message, rede: !!e.rede }; renderSheet(); });
  }

  /* ---------- Eventos ---------- */
  function aoDigitar(e) {
    if (!C || C.sheet !== 'novo') return; var t = e.target;
    if (t.id === 'ca-local') C.rasc.local = t.value; else if (t.id === 'ca-desc') C.rasc.descricao = t.value; else if (t.id === 'ca-quando') C.rasc.quando = t.value; else return;
    var k = { 'ca-local': 'local', 'ca-desc': 'desc', 'ca-quando': 'quando' }[t.id];
    if (C.erroPasso[k]) { delete C.erroPasso[k]; t.removeAttribute('aria-invalid'); var er = $('er-' + k); if (er) er.remove(); }
    clearTimeout(C.tSalvar); C.tSalvar = setTimeout(function () { if (C) salvarRasc(); }, 400);
  }
  function aoMudar(e) { var id = e.target.id; if (id === 'ca-trecho' || id === 'ca-sigla') { if (id === 'ca-trecho') { C.rasc.trecho = e.target.value; C.rasc.sigla = ''; } else C.rasc.sigla = e.target.value; if (C.rasc.trecho && C.rasc.sigla) C.rasc.local = C.rasc.trecho + ' - ' + C.rasc.sigla; salvarRasc(); renderSheet(); return; } if (id === 'ca-cam' || id === 'ca-gal') { adicionarFotos(e.target.files); e.target.value = ''; } }
  function aoClicar(e) {
    var t = e.target.closest('[data-ca]'); if (!t || !C) return; var a = t.getAttribute('data-ca'), id = t.getAttribute('data-id'), v = t.getAttribute('data-v');
    if (a === 'novo') abrirNovo();
    else if (a === 'abrir') abrirDetalhe(id);
    else if (a === 'fechar-sheet') fecharSheet();
    else if (a === 'mais') { C.pagina++; carregarLista(); }
    else if (a === 'atualizar') atualizar();
    else if (a === 'prox') {
      if (!validar(C.passo)) { renderSheet(); return; }
      if (C.passo < PASSOS.length - 1) { C.passo++; C.erroPasso = {}; renderSheet(); var b = C.raiz.querySelector('.ca-body'); if (b) b.scrollTop = 0; } else { t.disabled = true; enviar(); }
    }
    else if (a === 'volt') { if (C.passo > 0) { C.passo--; C.erroPasso = {}; renderSheet(); } }
    else if (a === 'gps') pegarGps();
    else if (a === 'gps-limpar') { C.rasc.lat = C.rasc.lon = C.rasc.acc = null; salvarRasc(); renderSheet(); }
    else if (a === 'local-rec') { C.rasc.local = v; salvarRasc(); renderSheet(); }
    else if (a === 'rasc-limpar') { lsDel(chaveRasc()); C.rasc = novoRasc(); C.rascRecuperado = false; renderSheet(); }
    else if (a === 'cam') { var c1 = $('ca-cam'); if (c1) c1.click(); }
    else if (a === 'gal') { var c2 = $('ca-gal'); if (c2) c2.click(); }
    else if (a === 'rm-foto') { C.fotos = C.fotos.filter(function (f) { if (f.id === id) { try { URL.revokeObjectURL(f.url); } catch (x) {} return false; } return true; }); C.naoFocar = true; renderSheet(); C.naoFocar = false; }
    else if (a === 'tentar') { F.atualizar(id, { estado: 'pendente', erro: '' }).then(recarregarFila).then(function () { if (!online()) U().toast('info', 'Sem conexão', 'Vamos enviar assim que a conexão voltar.'); sincronizar(); }); }
    else if (a === 'descartar') {
      U().confirmar({ titulo: 'Descartar o registro?', texto: 'Este registro ainda não foi enviado para a central. Se descartar, ele será apagado deste aparelho.', rotulo: 'Descartar', icone: 'alerta' })
        .then(function (s) { if (s) F.remover(id).then(recarregarFila); });
    }
  }

  window.PainelCampo = { montar: montar, parar: parar, atualizar: atualizar };
})();
