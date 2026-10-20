/* Painel da Central — DNA Rumo.
   Ordem da tela (padrão DNA Rumo): Topbar > título > Abas > Filtros > Indicadores > Tabela > Ações. */
(function () {
  'use strict';
  var D = window.PainelData, C = window.PAINEL_CONFIG || {}, A = window.PAINEL_ASSETS || {};
  var LOGO_ESCURO = A.logoEscuro || 'assets/logo-fundo-escuro.png';
  var LOGO_CLARO = A.logoClaro || 'assets/logo-fundo-claro.png';
  var ATENCAO_H = C.PRAZO_ATENCAO_H || 4, CRITICO_H = C.PRAZO_CRITICO_H || 24;

  var TRIAGEM = [['criminal', 'Criminal'], ['mecanico', 'Mecânico'], ['social', 'Social'], ['natural', 'Natural']];
  var FORMAS = [['solicitacao', 'Solicitação'], ['flagrante', 'Flagrante'], ['denuncia', 'Denúncia']];
  var NATUREZAS = [['criminal', 'Criminal'], ['mecanica', 'Mecânica'], ['social', 'Social'], ['natural', 'Natural']];
  var NI = 'NÃO INFORMADO';
  var ROT_DADOS = { empresa: 'Empresa', prefixo: 'Prefixo', composicao: 'Composição', vagoes: 'Vagão(ões)', locomotiva: 'Locomotiva', km: 'Km', tipo: 'Tipo', subtipo: 'Subtipo', ativo_afetado: 'Ativo ou material afetado', fato_constatado: 'Fato constatado' };
  var ROT_REL = { nr_performance: 'Nº Performance', mes: 'Mês', data: 'Data', hora: 'Hora', cidade: 'Cidade', uf: 'UF', trecho: 'Trecho', sb: 'SB', km: 'KM', composicao: 'Composição', empresa: 'Empresa', maquinista: 'Maquinista', re: 'RE', coordenadas: 'Coordenadas', natureza: 'Natureza', tipo: 'Tipo', autoria: 'Autoria', hora_inicio: 'Hora início', hora_final: 'Hora final', thp_total: 'THP total' };
  var CLASSES = [['prevencao', 'Prevenção'], ['natural', 'Natural'], ['mecanica', 'Mecânica'], ['social', 'Social'], ['criminal', 'Criminal']];
  var PERIODOS = [['todos', 'Todo o período'], ['hoje', 'Hoje'], ['7d', 'Últimos 7 dias'], ['30d', 'Últimos 30 dias']];
  var INFO = {
    aguardando: { what: 'Eventos registrados pela equipe de campo que ainda não passaram pela triagem.', rule: 'Status "Aguardando".', source: 'Tabela de eventos', period: 'Fila atual' },
    foraPrazo: { what: 'Eventos aguardando triagem há mais tempo que o prazo de atenção.', rule: 'Tempo desde o registro maior que ' + ATENCAO_H + ' h. Valor de referência, a validar com a Rumo.', source: 'Tabela de eventos', period: 'Fila atual' },
    concluidosHoje: { what: 'Eventos que terminaram a triagem hoje, criminais ou não.', rule: 'Data de conclusão igual à data de hoje (horário de Brasília).', source: 'Tabela de eventos', period: 'Hoje' },
    tempoMedio: { what: 'Tempo médio entre o registro do evento e a conclusão da triagem.', rule: 'Média de (conclusão menos registro) dos eventos concluídos.', source: 'Tabela de eventos', period: 'Últimos 30 dias' },
    agClass: { what: 'Ocorrências criadas pela triagem que ainda não receberam análise.', rule: 'Status "Ag. classificação".', source: 'Tabela de ocorrências', period: 'Fila atual' },
    emAndamento: { what: 'Ocorrências com ao menos uma análise registrada e ainda não concluídas.', rule: 'Status "Em andamento".', source: 'Tabela de ocorrências', period: 'Fila atual' },
    concluidasHoje: { what: 'Ocorrências concluídas pela inteligência hoje.', rule: 'Data de conclusão igual à data de hoje (horário de Brasília).', source: 'Tabela de ocorrências', period: 'Hoje' },
    agClassI: { what: 'Ocorrências criadas pela triagem da central que ainda esperam a classificação.', rule: 'Status "Ag. classificação". O contexto mostra a ocorrência aberta mais antiga.', source: 'Tabela de ocorrências', period: 'Fila atual' },
    semBoletim: { what: 'Ocorrências abertas em que ainda não se respondeu se existe boletim de ocorrência.', rule: 'Ocorrência não concluída com resposta de boletim em branco. A resposta é obrigatória para classificar.', source: 'Tabela de ocorrências', period: 'Fila atual' },
    tempoConclusao: { what: 'Tempo médio entre a criação da ocorrência e a conclusão.', rule: 'Média de (conclusão menos criação) das ocorrências concluídas.', source: 'Tabela de ocorrências', period: 'Últimos 30 dias' },
    porTipo: { what: 'Quantidade de ocorrências criadas por tipo, até os 8 mais frequentes.', rule: 'Contagem por tipo de ocorrência. A barra laranja é o tipo mais frequente.', source: 'Tabela de ocorrências', period: 'Últimos 30 dias' },
    porClass: { what: 'Quantidade de ocorrências classificadas por categoria.', rule: 'Contagem por classificação, considerando a data em que foi classificada.', source: 'Tabela de ocorrências', period: 'Últimos 30 dias' }
  };

  var S = {
    tela: 'carregando', usuario: null, visao: 'central', aba: 'eventos', iaBusy: false, pick: null, mantem: false, status: '', busca: '', periodo: 'todos', pagina: 1, porPagina: 10,
    dados: { linhas: [], total: 0 }, kpi: null, carregando: true, erro: '', atualizadoEm: null, sync: 'syncing', tempoReal: false,
    tipif: { linhas: [], formularios: {}, porId: {} }, sel: null, det: null, detErro: '', ocupado: false, userPop: false, tok: 0, foco: null, unsub: null, timers: []
  };

  /* ---------- Utilidades ---------- */
  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function p2(n) { return (n < 10 ? '0' : '') + n; }
  function fmtData(ms) { if (!ms) return '—'; var d = new Date(ms); return p2(d.getDate()) + '/' + p2(d.getMonth() + 1) + '/' + d.getFullYear() + ' ' + p2(d.getHours()) + ':' + p2(d.getMinutes()); }
  function fmtDur(seg) { seg = Math.max(0, Math.floor(seg)); var m = Math.floor(seg / 60), h = Math.floor(m / 60), d = Math.floor(h / 24); if (d >= 1) return d + ' d ' + (h % 24) + ' h'; if (h >= 1) return h + ' h ' + p2(m % 60) + ' min'; return m + ' min'; }
  function lbl(lista, k) { for (var i = 0; i < lista.length; i++) if (lista[i][0] === k) return lista[i][1]; return ''; }
  function decorrido(x) { return x.status === 'concluido' ? x.segundos : Math.floor((Date.now() - x.criadoEm) / 1000); }
  function paraInputLocal(ms) { var d = new Date(ms); return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()) + 'T' + p2(d.getHours()) + ':' + p2(d.getMinutes()); }
  function badge(t, tom) { return '<span class="r-badge"><span class="r-dot r-dot-' + tom + '" aria-hidden="true"></span>' + esc(t) + '</span>'; }
  function tomEvento(e) {
    if (e.status === 'concluido') return { t: 'Concluído', c: 'success' };
    var h = decorrido(e) / 3600;
    if (h >= CRITICO_H) return { t: 'Aguardando · atrasado', c: 'danger' };
    if (h >= ATENCAO_H) return { t: 'Aguardando · atenção', c: 'warning' };
    return { t: 'Aguardando', c: 'info' };
  }
  function tomOc(o) {
    if (o.status === 'concluido') return { t: 'Concluída', c: 'success' };
    if (o.status === 'em_andamento') return { t: 'Em andamento', c: 'info' };
    return { t: 'Ag. classificação', c: 'warning' };
  }
  function tempoTxt(x) { return (x.status === 'concluido' ? 'em ' : '') + fmtDur(decorrido(x)); }
  function indexarTipif(t) { var p = {}; t.linhas.forEach(function (l) { p[l.id] = l; }); return { linhas: t.linhas, formularios: t.formularios, porId: p }; }
  function carregarTipif() { return D.tipificacao().then(function (t) { S.tipif = indexarTipif(t); }); }
  function tipifTxt(nat, tipo, sub) { return [lbl(NATUREZAS, nat).toUpperCase(), tipo, sub].filter(Boolean).join(' › '); }
  function camposDe(id) { var l = S.tipif.porId[id], f = l && S.tipif.formularios[l.formulario]; return f ? f.campos : []; }
  function valorDado(c, v) { return c.tipo === 'sim_nao' ? (v === 'sim' ? 'Sim' : 'Não') : v; }
  // Dados que a central preencheu no formulário da combinação (rótulos vêm do próprio formulário)
  function dadosHtml(tipificacaoId, dados) {
    var cs = camposDe(tipificacaoId), rot = {}; cs.forEach(function (c) { rot[c.chave] = c; });
    var ks = Object.keys(dados || {}); if (!ks.length) return '';
    var ordem = cs.map(function (c) { return c.chave; }).filter(function (k) { return ks.indexOf(k) >= 0; });
    return '<div><h3 class="sec-t">Dados do formulário</h3><dl class="kv">' + ordem.map(function (k) { return '<dt>' + esc(rot[k].rotulo) + '</dt><dd>' + esc(valorDado(rot[k], dados[k])) + '</dd>'; }).join('') + '</dl></div>';
  }
  function podeTriar() { return S.visao === 'central' && S.usuario && (S.usuario.perfil === 'central' || S.usuario.perfil === 'admin'); }
  function ehIntel() { return S.visao === 'inteligencia'; }
  function ehCampo() { return S.visao === 'campo'; }
  function podeIntel() { return ehIntel() && S.usuario && (S.usuario.perfil === 'inteligencia' || S.usuario.perfil === 'admin'); }
  function lerVisao() { try { return localStorage.getItem('visao'); } catch (e) { return null; } }
  function visaoHtml() {
    if (!S.usuario || S.usuario.perfil !== 'admin') return '';
    return '<div role="group" aria-label="Visão do painel"><span class="r-label">Visão do painel</span><div class="opcoes" style="margin-top:6px">' +
      [['central', 'Central'], ['inteligencia', 'Inteligência'], ['campo', 'Campo']].map(function (v) { return '<button type="button" class="r-chip" data-act="visao" data-v="' + v[0] + '" aria-pressed="' + (S.visao === v[0]) + '">' + v[1] + '</button>'; }).join('') + '</div></div>';
  }

  /* ---------- Tema ---------- */
  function temaInicial() { try { var t = localStorage.getItem('tema'); if (t) return t; } catch (e) {} return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'; }
  function aplicarTema(t) { document.documentElement.setAttribute('data-theme', t); S.tema = t; try { localStorage.setItem('tema', t); } catch (e) {} }

  /* ---------- Avisos (Toast) e confirmação (Modal) ---------- */
  function toast(tom, titulo, msg) {
    var icones = { success: 'sucesso', danger: 'erro', info: 'info', warning: 'alerta' };
    var el = document.createElement('div'); el.className = 'r-toast r-toast-' + tom; el.setAttribute('role', tom === 'danger' ? 'alert' : 'status');
    el.innerHTML = ico(icones[tom]) + '<div class="r-toast-body"><b>' + esc(titulo) + '</b>' + (msg ? '<span>' + esc(msg) + '</span>' : '') + '</div>' +
      '<button type="button" class="r-iconbtn" aria-label="Fechar aviso">' + ico('fechar') + '</button>';
    el.querySelector('button').onclick = function () { el.remove(); };
    $('toasts').appendChild(el); setTimeout(function () { el.remove(); }, tom === 'danger' ? 9000 : 5000);
  }
  function confirmar(o) {
    return new Promise(function (res) {
      var root = $('modal-root'), anterior = document.activeElement;
      root.innerHTML = '<div class="r-scrim fx"><div class="r-modal" role="alertdialog" aria-modal="true" aria-labelledby="md-t" aria-describedby="md-d">' +
        '<div class="r-modal-head">' + ico(o.icone || 'alerta') + '<span id="md-t">' + esc(o.titulo) + '</span></div>' +
        '<div class="r-modal-body" id="md-d"><p style="margin:0">' + esc(o.texto) + '</p></div>' +
        '<div class="r-modal-foot"><button type="button" class="r-btn r-btn-outline" data-m="nao">Voltar</button>' +
        '<button type="button" class="r-btn r-btn-primary" data-m="sim">' + esc(o.rotulo) + '</button></div></div></div>';
      function fim(v) { root.innerHTML = ''; S.modalFim = null; if (anterior && anterior.focus) anterior.focus(); res(v); }
      S.modalFim = fim;
      root.querySelector('[data-m=nao]').onclick = function () { fim(false); };
      root.querySelector('[data-m=sim]').onclick = function () { fim(true); };
      root.querySelector('[data-m=nao]').focus();
    });
  }

  /* ---------- Estruturas de tela ---------- */
  function topbarHtml() {
    var u = S.usuario;
    var acoes = S.tela === 'painel' ? (
      '<button type="button" data-act="veiculo-turno" aria-label="Veículo no Turno" title="Veículo no Turno" style="font-weight:700;font-size:12px">VEÍCULO</button>' +
      '<button type="button" data-act="efetivo-turno" aria-label="Efetivo no Turno" title="Efetivo no Turno" style="font-weight:700;font-size:12px">EFETIVO</button>' +
      '<button type="button" data-act="mapa-gps" aria-label="Rastreamento GPS" title="Mapa das equipes" style="font-weight:700;font-size:12px">GPS</button>' +
      '<button type="button" data-act="atualizar" aria-label="Atualizar agora" title="Atualizar agora">' + ico('atualizar') + '</button>' +
      '<button type="button" data-act="tema" aria-label="Alternar tema claro e escuro" title="Alternar tema">' + ico('ajustes') + '</button>' +
      '<button type="button" data-act="usuario" aria-label="Conta de ' + esc(u ? u.nome : '') + '" aria-expanded="' + S.userPop + '" title="Conta">' + ico('usuario') + '</button>' +
      (S.userPop && u ? '<div class="userpop" role="dialog" aria-label="Conta"><div><b>' + esc(u.nome) + '</b><small>' + esc(lbl([['campo', 'Equipe de campo'], ['central', 'Central de atendimento'], ['inteligencia', 'Inteligência'], ['admin', 'Administrador']], u.perfil) || u.perfil || '') + '</small></div>' +
        (D.modo === 'demo' ? '<small>Modo demonstração: nada é gravado de verdade.</small><label class="r-check" style="min-height:32px;font-size:13px"><input type="checkbox" data-act="demo-offline"' + (S.demoOff ? ' checked' : '') + '>Simular sem sinal</label>' : '<small>' + esc(u.email || '') + '</small>') +
        visaoHtml() + '<button type="button" class="r-btn r-btn-outline r-btn-sm" data-act="sair">Sair</button></div>' : '')
    ) : (S.tela === 'proibido' ? '<button type="button" data-act="tema" aria-label="Alternar tema claro e escuro" title="Alternar tema">' + ico('ajustes') + '</button>' : '<button type="button" data-act="tema" aria-label="Alternar tema claro e escuro" title="Alternar tema">' + ico('ajustes') + '</button>');
    return '<header class="r-topbar"><div class="r-topbar-brand"><img class="r-topbar-logo" src="' + LOGO_ESCURO + '" alt="Rumo"></div>' +
      '<div class="r-topbar-title">Security Rumo</div><div class="r-topbar-actions">' + acoes + '</div></header>';
  }
  function estado(tipo, titulo, msg, acao) {
    var ic = { empty: 'documento', error: 'erro', offline: 'offline', forbidden: 'bloqueado' }[tipo];
    return '<div class="r-state r-state-' + tipo + '" role="' + (tipo === 'error' ? 'alert' : 'status') + '">' +
      (tipo === 'loading' ? '<div class="r-spin" aria-hidden="true"></div>' : ico(ic)) +
      '<div class="r-state-title">' + esc(titulo) + '</div><div>' + esc(msg) + '</div>' + (acao || '') + '</div>';
  }
  function renderApp() {
    var app = $('app');
    if (S.tela === 'carregando') { app.innerHTML = topbarHtml() + '<div class="r-sect">' + estado('loading', 'Carregando', 'Abrindo o painel.') + '</div>'; return; }
    if (S.tela === 'erroInicial') { app.innerHTML = topbarHtml() + '<div class="r-sect">' + estado('error', 'Não foi possível abrir o painel', S.erro, '<button type="button" class="r-btn r-btn-primary" data-act="reiniciar">Tentar de novo</button>') + '</div>'; return; }
    if (S.tela === 'login') {
      app.innerHTML = topbarHtml() + '<div class="login"><form class="r-card" id="f-login" novalidate><img src="' + LOGO_CLARO + '" alt="Rumo"><div><h1>Entrar no painel</h1><p>Use o e-mail e a senha cadastrados para a central.</p></div>' +
        '<div class="r-field"><label class="r-label" for="lg-email">E-mail<span class="r-req" aria-hidden="true">*</span></label><input class="r-input" id="lg-email" type="email" autocomplete="username" required></div>' +
        '<div class="r-field"><label class="r-label" for="lg-senha">Senha<span class="r-req" aria-hidden="true">*</span></label><input class="r-input" id="lg-senha" type="password" autocomplete="current-password" required></div>' +
        '<div class="r-err" id="lg-err" role="alert" hidden></div><button type="submit" class="r-btn r-btn-primary" id="lg-btn">Entrar</button></form></div>';
      return;
    }
    if (S.tela === 'proibido') {
      app.innerHTML = topbarHtml() + '<div class="r-sect page">' + estado('forbidden', 'Sem permissão para os painéis',
        S.usuario && S.usuario.perfil ? 'Seu perfil (' + S.usuario.perfil + ') não acessa esta tela. Solicite acesso ao gestor da área.' : 'Seu acesso está inativo ou ainda sem perfil. Solicite liberação ao gestor da área.',
        '<button type="button" class="r-btn r-btn-outline" data-act="sair">Sair</button>') + '</div>';
      return;
    }
    // painel
    if (ehCampo()) {
      document.title = 'Meus registros';
      app.innerHTML = '<div id="topbar"></div><main class="page campo" id="campo-root"></main>'; $('topbar').outerHTML = topbarHtml();
      window.PainelCampo.montar($('campo-root')); return;
    }
    document.title = ehIntel() ? 'Painel da Inteligência' : 'Painel da Central';
    app.innerHTML = '<div id="topbar"></div><main class="page"><h1 class="r-page-h1">' + (ehIntel() ? 'Painel da Inteligência' : 'Painel da Central') + '</h1><div class="r-page-sub" id="sub"></div>' +
      '<nav class="r-tabs" id="tabs" role="tablist" aria-label="Fila"></nav><section class="r-sect">' +
      '<div class="r-filters" role="search"><label class="r-search">' + ico('buscar') + '<input type="search" id="busca" placeholder="Buscar por número, local ou descrição" aria-label="Buscar por número, local ou descrição"></label>' +
      '<span id="chips" style="display:contents"></span><select id="periodo" class="r-input" aria-label="Período">' +
      PERIODOS.map(function (p) { return '<option value="' + p[0] + '">' + p[1] + '</option>'; }).join('') + '</select></div>' +
      '<div class="r-kpis" id="kpis"></div><div id="graficos"></div><div id="tabela"></div><div id="pager"></div>' +
      '<div class="acoes"><button type="button" class="r-btn r-btn-outline" data-act="exportar">' + ico('baixar') + 'Exportar CSV</button></div></section></main>';
    $('topbar').outerHTML = topbarHtml(); $('busca').value = S.busca; $('periodo').value = S.periodo;
    renderSub(); renderTabs(); renderChips(); renderKpis(); renderGraficos(); renderTabela(); renderPager();
  }
  function renderTopbar() { var t = document.querySelector('.r-topbar'); if (t) t.outerHTML = topbarHtml(); }

  function renderSub() {
    var el = $('sub'); if (!el) return;
    var st = S.sync, rot = { synced: 'Sincronizado', syncing: 'Sincronizando…', offline: 'Offline' }[st], icn = { synced: 'sucesso', syncing: 'atualizar', offline: 'offline' }[st];
    el.innerHTML = '<span class="r-sync r-sync-' + st + '" role="status">' + ico(icn) + rot + '</span>' +
      '<span>' + (S.atualizadoEm ? 'Atualizado às ' + p2(new Date(S.atualizadoEm).getHours()) + ':' + p2(new Date(S.atualizadoEm).getMinutes()) : 'Aguardando primeira atualização') + (S.tempoReal ? ' · tempo real ativo' : '') + '</span>' +
      (D.modo === 'demo' ? '<span class="demo-tag">Modo demonstração · dados fictícios</span>' : '');
  }
  function renderTabs() {
    var el = $('tabs'); if (!el) return;
    if (ehIntel()) { el.hidden = true; el.innerHTML = ''; return; }
    el.hidden = false;
    el.innerHTML = [['eventos', 'EVENTOS'], ['ocorrencias', 'OCORRÊNCIAS']].map(function (t) {
      return '<button type="button" class="r-tab" role="tab" data-act="aba" data-v="' + t[0] + '" aria-selected="' + (S.aba === t[0]) + '">' + t[1] + '</button>';
    }).join('');
  }
  function renderChips() {
    var el = $('chips'); if (!el) return; var k = S.kpi || {};
    var defs = S.aba === 'eventos'
      ? [['', 'Todos'], ['aguardando', 'Aguardando', k.aguardando], ['concluido', 'Concluídos']]
      : [['', 'Todas'], ['ag_classificacao', 'Ag. classificação', k.agClassificacao], ['em_andamento', 'Em andamento', k.emAndamento], ['concluido', 'Concluídas']];
    el.innerHTML = defs.map(function (d) {
      return '<button type="button" class="r-chip" data-act="chip" data-v="' + d[0] + '" aria-pressed="' + (S.status === d[0]) + '">' + esc(d[1]) + (d[2] ? '<span class="r-chip-count">' + d[2] + '</span>' : '') + '</button>';
    }).join('');
  }
  function kpiHtml(chave, rotulo, valor, ctx, icone, azul) {
    return '<article class="r-kpi' + (azul ? ' r-kpi-blue' : '') + '"><div class="r-kpi-head">' + ico(icone) + '<span class="r-kpi-label">' + esc(rotulo) + '</span>' +
      '<button type="button" class="r-info" data-act="info" data-k="' + chave + '" aria-label="Como ' + esc(rotulo) + ' é calculado" aria-expanded="false">' + ico('info') + '</button></div>' +
      '<div class="r-kpi-value">' + valor + '</div><div class="r-kpi-ctx">' + esc(ctx) + '</div></article>';
  }
  function renderKpis() {
    var el = $('kpis'); if (!el) return; var k = S.kpi, v = function (x) { return k ? String(x).replace(/\B(?=(\d{3})+(?!\d))/g, '.') : '–'; };
    if (ehIntel()) {
      el.innerHTML = kpiHtml('agClassI', 'Ag. classificação', v(k && k.agClassificacao), k && k.maisAntigaSeg != null ? 'Mais antiga aberta: ' + fmtDur(k.maisAntigaSeg) : (k ? 'Nenhuma na fila' : 'Carregando'), 'alerta', false) +
        kpiHtml('semBoletim', 'Sem resposta de boletim', v(k && k.semBoletim), 'Responda antes de classificar', 'documento', false) +
        kpiHtml('emAndamento', 'Em andamento', v(k && k.emAndamento), 'Com análise ou classificação', 'checklist', true) +
        kpiHtml('concluidasHoje', 'Concluídas hoje', v(k && k.concluidasHoje), 'Encerradas pela inteligência', 'sucesso', true) +
        kpiHtml('tempoConclusao', 'Tempo médio até concluir', k ? (k.tempoMedioSeg != null ? esc(fmtDur(k.tempoMedioSeg)) : '—') : '–', 'Concluídas nos últimos 30 dias', 'indicadores', true);
      return;
    }
    if (S.aba === 'eventos') {
      el.innerHTML = kpiHtml('aguardando', 'Aguardando triagem', v(k && k.aguardando), k && k.maisAntigoSeg != null ? 'Mais antigo: ' + fmtDur(k.maisAntigoSeg) : (k ? 'Nenhum evento na fila' : 'Carregando'), 'relogio', false) +
        kpiHtml('foraPrazo', 'Fora do prazo', v(k && k.foraPrazo), 'Sem triagem há mais de ' + ATENCAO_H + ' h', 'alerta', false) +
        kpiHtml('concluidosHoje', 'Concluídos hoje', v(k && k.concluidosHoje), 'Triagens encerradas hoje', 'sucesso', true) +
        kpiHtml('tempoMedio', 'Tempo médio de atendimento', k ? (k.tempoMedioSeg != null ? esc(fmtDur(k.tempoMedioSeg)) : '—') : '–', 'Concluídos nos últimos 30 dias', 'indicadores', true);
    } else {
      el.innerHTML = kpiHtml('agClass', 'Ag. classificação', v(k && k.agClassificacao), 'Sem análise ainda', 'alerta', false) +
        kpiHtml('emAndamento', 'Em andamento', v(k && k.emAndamento), 'Com análise registrada', 'checklist', false) +
        kpiHtml('concluidasHoje', 'Concluídas hoje', v(k && k.concluidasHoje), 'Encerradas pela inteligência', 'sucesso', true);
    }
  }

  /* ---------- Gráficos (inteligência) ---------- */
  function barrasHtml(titulo, chave, dados, rotulo) {
    var max = dados.reduce(function (m, x) { return Math.max(m, x.total); }, 0) || 1;
    return '<section class="r-chart"><div class="r-chart-head"><span class="r-chart-title">' + esc(titulo) + '</span>' +
      '<button type="button" class="r-info" data-act="info" data-k="' + chave + '" aria-label="Como ' + esc(titulo) + ' é calculado" aria-expanded="false">' + ico('info') + '</button></div>' +
      (dados.length ? dados.map(function (x, i) {
        var nome = rotulo ? rotulo(x.nome) : x.nome;
        return '<div class="r-bar"><span title="' + esc(nome) + '">' + esc(nome) + '</span><div class="r-bar-track"><div class="r-bar-fill' + (i === 0 ? ' r-hl' : '') + '" style="width:' + Math.max(3, Math.round(x.total / max * 100)) + '%"></div></div><span class="r-bar-val">' + x.total + '</span></div>';
      }).join('') : '<p class="r-hint">Sem dados nos últimos 30 dias.</p>') + '</section>';
  }
  function renderGraficos() {
    var el = $('graficos'); if (!el) return;
    if (!ehIntel() || !S.kpi || !S.kpi.porTipo) { el.innerHTML = ''; return; }
    el.innerHTML = '<div class="r-2col">' + barrasHtml('Ocorrências por tipo · 30 dias', 'porTipo', S.kpi.porTipo) +
      barrasHtml('Classificadas por categoria · 30 dias', 'porClass', S.kpi.porClassificacao, function (k) { return lbl(CLASSES, k) || k; }) + '</div>';
  }

  /* ---------- Tabela ---------- */
  function vazioTxt() { return (S.busca || S.status || S.periodo !== 'todos') ? 'Nenhum registro com estes filtros. Ajuste a busca, o período ou o status.' : (S.aba === 'eventos' ? 'Quando a equipe de campo registrar um evento, ele aparece aqui.' : 'Quando a central encaminhar um caso criminal, a ocorrência aparece aqui.'); }
  function renderTabela() {
    var el = $('tabela'); if (!el) return;
    if (S.carregando && !S.dados.linhas.length) { el.innerHTML = estado('loading', 'Carregando dados', 'Buscando registros atualizados.'); return; }
    if (S.erro && !S.dados.linhas.length) { el.innerHTML = estado(S.sync === 'offline' ? 'offline' : 'error', S.sync === 'offline' ? 'Você está offline' : 'Não foi possível carregar', S.erro, '<button type="button" class="r-btn r-btn-primary" data-act="atualizar">Tentar de novo</button>'); return; }
    if (!S.dados.linhas.length) { el.innerHTML = estado('empty', 'Nenhum registro encontrado', vazioTxt()); return; }
    var ev = S.aba === 'eventos', cab, linhas;
    if (ev) {
      cab = ['Número', 'Registrado em', 'Local', 'Descrição', 'Registrado por', 'Tempo', 'Status'];
      linhas = S.dados.linhas.map(function (e) {
        var t = tomEvento(e);
        return '<tr data-id="' + esc(e.id) + '"><td class="nowrapnum">' + esc(e.numero) + '</td><td>' + fmtData(e.criadoEm) + '</td><td>' + esc(e.local) + '</td><td><span class="clip">' + esc(e.descricao) + '</span></td><td>' + esc(e.criadoPorNome || '—') +
          '</td><td class="tempo">' + esc(tempoTxt(e)) + '</td><td>' + badge(t.t, t.c) + '</td><td class="r-actions"><button type="button" class="r-iconbtn" data-act="abrir" data-id="' + esc(e.id) + '" aria-label="Visualizar evento ' + esc(e.numero) + '" title="Visualizar">' + ico('visualizar') + '</button></td></tr>';
      });
    } else {
      cab = ['Número', 'Evento', 'Fato em', 'Local', 'Tipo', 'Tempo', 'Status', 'Classificação'];
      linhas = S.dados.linhas.map(function (o) {
        var t = tomOc(o);
        return '<tr data-id="' + esc(o.id) + '"><td class="nowrapnum">' + esc(o.numero) + '</td><td>' + esc(o.eventoNumero || '—') + '</td><td>' + fmtData(o.fatoEm) + '</td><td>' + esc(o.local) + '</td><td><span class="clip">' + esc(o.tipo + (o.subtipo ? ' · ' + o.subtipo : '')) +
          '</span></td><td class="tempo">' + esc(tempoTxt(o)) + '</td><td>' + badge(t.t, t.c) + '</td><td>' + (o.classificacao ? badge(lbl(CLASSES, o.classificacao), 'neutral') : '<span style="color:var(--rumo-muted)">Ag. classificação</span>') +
          '</td><td class="r-actions"><button type="button" class="r-iconbtn" data-act="abrir" data-id="' + esc(o.id) + '" aria-label="Visualizar ocorrência ' + esc(o.numero) + '" title="Visualizar">' + ico('visualizar') + '</button></td></tr>';
      });
    }
    if (ehIntel()) {
      cab = ['Número', 'Tipo', 'Local', 'Fato em', 'Tempo', 'Status', 'Boletim', 'Classificação'];
      linhas = S.dados.linhas.map(function (o) {
        var t = tomOc(o), bo = o.boletimExiste == null ? '<span style="color:var(--rumo-muted)">Pendente</span>' : (o.boletimExiste ? 'Sim' + (o.boletimNumero ? ' · ' + esc(o.boletimNumero) : '') : 'Não');
        return '<tr data-id="' + esc(o.id) + '"><td class="nowrapnum">' + esc(o.numero) + '</td><td><span class="clip">' + esc(o.tipo + (o.subtipo ? ' · ' + o.subtipo : '')) + '</span></td><td>' + esc(o.local) + '</td><td>' + fmtData(o.fatoEm) +
          '</td><td class="tempo">' + esc(tempoTxt(o)) + '</td><td>' + badge(t.t, t.c) + '</td><td>' + bo + '</td><td>' + (o.classificacao ? badge(lbl(CLASSES, o.classificacao), 'neutral') : '<span style="color:var(--rumo-muted)">Pendente</span>') +
          '</td><td class="r-actions"><button type="button" class="r-iconbtn" data-act="abrir" data-id="' + esc(o.id) + '" aria-label="Visualizar ocorrência ' + esc(o.numero) + '" title="Visualizar">' + ico('visualizar') + '</button></td></tr>';
      });
    }
    el.innerHTML = '<div class="r-table-wrap"><table class="r-table"><caption class="r-sr">' + (ev ? 'Fila de eventos' : 'Fila de ocorrências') + '</caption><thead><tr>' +
      cab.map(function (c) { return '<th scope="col">' + c + '</th>'; }).join('') + '<th scope="col" class="r-actions"><span class="r-sr">Ações</span></th></tr></thead><tbody>' + linhas.join('') + '</tbody></table></div>';
  }
  function renderPager() {
    var el = $('pager'); if (!el) return; var t = S.dados.total, pg = Math.max(1, Math.ceil(t / S.porPagina)), cur = S.pagina;
    if (!t) { el.innerHTML = ''; return; }
    var a = Math.max(1, cur - 1), z = Math.min(pg, a + 2), nums = ''; a = Math.max(1, z - 2);
    for (var i = a; i <= z; i++) nums += '<button type="button" class="r-page" data-act="pagina" data-v="' + i + '"' + (i === cur ? ' aria-current="page"' : '') + '>' + i + '</button>';
    el.innerHTML = '<nav class="r-pager" aria-label="Paginação"><span>' + ((cur - 1) * S.porPagina + 1) + '–' + Math.min(t, cur * S.porPagina) + ' de ' + t.toLocaleString('pt-BR') + ' registros</span><div class="r-pager-btns">' +
      '<button type="button" class="r-page" data-act="pagina" data-v="' + (cur - 1) + '"' + (cur === 1 ? ' disabled' : '') + ' aria-label="Página anterior">' + ico('avancar', 'r-flip') + '</button>' + nums +
      '<button type="button" class="r-page" data-act="pagina" data-v="' + (cur + 1) + '"' + (cur === pg ? ' disabled' : '') + ' aria-label="Próxima página">' + ico('avancar') + '</button></div></nav>';
  }

  /* ---------- Carregamento ---------- */
  function filtro() { return { status: S.status, busca: S.busca, periodo: S.periodo, pagina: S.pagina, porPagina: S.porPagina }; }
  function carregar(op) {
    op = op || {}; var tok = ++S.tok;
    if (!op.silencioso) { S.carregando = true; S.erro = ''; renderTabela(); }
    S.sync = 'syncing'; renderSub();
    var aba = S.aba, f = filtro();
    var req = aba === 'eventos' ? Promise.all([D.listarEventos(f), D.kpisEventos(ATENCAO_H)]) : Promise.all([D.listarOcorrencias(f), ehIntel() ? D.resumoInteligencia() : D.kpisOcorrencias()]);
    return req.then(function (r) {
      if (tok !== S.tok) return;
      var maxP = Math.max(1, Math.ceil(r[0].total / S.porPagina));
      if (S.pagina > maxP) { S.pagina = maxP; return carregar({ silencioso: true }); }
      S.dados = r[0]; S.kpi = r[1]; S.carregando = false; S.erro = ''; S.atualizadoEm = Date.now(); S.sync = 'synced';
      renderSub(); renderChips(); renderKpis(); renderGraficos(); renderTabela(); renderPager();
    }).catch(function (e) {
      if (tok !== S.tok) return;
      S.carregando = false; S.erro = e.message || 'Não foi possível carregar.'; S.sync = (navigator.onLine === false || /conex/i.test(S.erro)) ? 'offline' : 'synced';
      renderSub(); renderTabela();
      if (op.silencioso) toast('warning', 'Não foi possível atualizar', 'A lista mostrada pode estar desatualizada.');
    });
  }
  var _deb = null;
  function carregarDepois(ms) { clearTimeout(_deb); _deb = setTimeout(function () { carregar({ silencioso: true }); }, ms || 400); }

  /* ---------- Painel lateral (Drawer) ---------- */
  function stepsHtml(rotulos, atual) {
    return '<ol class="r-steps" aria-label="Etapas do fluxo">' + rotulos.map(function (r, i) {
      var cls = i < atual ? ' r-step-done' : (i === atual ? ' r-step-current' : '');
      return '<li class="r-step' + cls + '"' + (i === atual ? ' aria-current="step"' : '') + '><span class="r-step-n">' + (i < atual ? ico('sucesso') : (i + 1)) + '</span>' + esc(r) + '</li>' +
        (i < rotulos.length - 1 ? '<li class="r-step-sep" aria-hidden="true"></li>' : '');
    }).join('') + '</ol>';
  }
  function fotosHtml(urls) {
    if (!urls || !urls.length) return '<p class="txt" style="color:var(--rumo-muted)">Sem fotos neste registro.</p>';
    return '<div class="r-thumbs">' + urls.map(function (u, i) { return '<div class="r-thumb"><a href="' + esc(u) + '" target="_blank" rel="noopener"><img src="' + esc(u) + '" alt="Foto ' + (i + 1) + ' do registro" loading="lazy"></a></div>'; }).join('') + '</div>';
  }
  function drawer(titulo, icone, corpo, rodape) {
    var b0 = document.querySelector('#drawer-root .r-drawer-body'), rol = (S.mantem && b0) ? b0.scrollTop : 0;
    $('drawer-root').innerHTML = '<div class="r-drawer-scrim fx" data-act="scrim"><aside class="r-drawer" role="dialog" aria-modal="true" aria-labelledby="dr-t">' +
      '<div class="r-drawer-head">' + ico(icone) + '<span id="dr-t">' + esc(titulo) + '</span><button type="button" class="r-iconbtn" data-act="fechar" aria-label="Fechar painel">' + ico('fechar') + '</button></div>' +
      '<div class="r-drawer-body">' + corpo + '</div>' + (rodape ? '<div class="r-drawer-foot">' + rodape + '</div>' : '') + '</aside></div>';
    if (rol) { var b1 = document.querySelector('#drawer-root .r-drawer-body'); if (b1) b1.scrollTop = rol; }
  }
  function abrir(id) {
    S.foco = document.activeElement; S.sel = { tipo: S.aba, id: id }; S.det = null; S.detErro = ''; S.mantem = false;
    drawer(S.aba === 'eventos' ? 'Evento' : 'Ocorrência', S.aba === 'eventos' ? 'checklist' : 'seguranca', estado('loading', 'Carregando', 'Abrindo o registro.'), '');
    var btn = document.querySelector('#drawer-root [data-act=fechar]'); if (btn) btn.focus();
    carregarDetalhe();
  }
  function carregarDetalhe() {
    var s = S.sel; if (!s) return Promise.resolve();
    var p = s.tipo === 'eventos' ? D.detalheEvento(s.id) : D.detalheOcorrencia(s.id);
    return p.then(function (d) { if (!S.sel || S.sel.id !== s.id) return; S.det = d; renderDetalhe(); })
      .catch(function (e) { if (!S.sel || S.sel.id !== s.id) return; S.detErro = e.message; drawer('Registro', 'alerta', estado('error', 'Não foi possível abrir', e.message), '<button type="button" class="r-btn r-btn-outline" data-act="fechar">Fechar</button>'); });
  }
  function fechar() {
    S.sel = null; S.det = null; $('drawer-root').innerHTML = '';
    if (S.foco && document.contains(S.foco) && S.foco.focus) S.foco.focus();
  }
  function renderDetalhe() { if (!S.det) return; if (S.sel.tipo === 'eventos') renderEvento(S.det); else renderOcorrencia(S.det); }

  function renderEvento(d) {
    var e = d.evento, t = tomEvento(e), crim = e.triagemCategoria === 'criminal', abertoPodeTriar = e.status === 'aguardando' && podeTriar();
    var atual = e.status === 'concluido' ? 4 : 1;
    var corpo = stepsHtml(['Registro', 'Triagem', e.status === 'aguardando' ? 'Destino' : (crim ? 'Ocorrência' : 'Resolução'), 'Concluído'], atual) +
      '<div class="linha-status">' + badge(t.t, t.c) + '<span class="tempo" style="color:var(--rumo-muted)">' + esc(tempoTxt(e)) + '</span></div>' +
      '<dl class="kv"><dt>Registrado em</dt><dd>' + fmtData(e.criadoEm) + '</dd><dt>Registrado por</dt><dd>' + esc(e.criadoPorNome || '—') + '</dd><dt>Local</dt><dd>' + esc(e.local) + '</dd>' +
      (e.latitude != null ? '<dt>GPS</dt><dd><a href="https://www.google.com/maps?q=' + e.latitude + ',' + e.longitude + '" target="_blank" rel="noopener">' + e.latitude.toFixed(5) + ', ' + e.longitude.toFixed(5) + ' · abrir no mapa</a></dd>' : '') +
      (e.status === 'concluido' ? '<dt>Triagem</dt><dd>' + esc(lbl(TRIAGEM, e.triagemCategoria)) + ' · ' + fmtData(e.triagemEm || e.concluidoEm) + '</dd>' : '') +
      (e.tipificacaoId ? '<dt>Tipificação</dt><dd>' + esc(tipifTxt(e.tipifNatureza, e.tipifTipo, e.tipifSubtipo)) + '</dd>' : '') + '</dl>' +
      '<div><h3 class="sec-t">Descrição</h3><p class="txt">' + esc(e.descricao) + '</p></div>' +
      '<div><h3 class="sec-t">Fotos</h3>' + fotosHtml(d.fotos) + '</div>';
    if (e.status === 'concluido' && e.triagemDados) corpo += dadosHtml(e.tipificacaoId, e.triagemDados);
    if (e.status === 'concluido' && e.triagemObservacao) corpo += '<div><h3 class="sec-t">Observação da triagem</h3><p class="txt">' + esc(e.triagemObservacao) + '</p></div>';
    if (e.ocorrenciaId) corpo += '<div><button type="button" class="r-btn r-btn-outline" data-act="abrir-oc" data-id="' + esc(e.ocorrenciaId) + '">' + ico('seguranca') + 'Abrir a ocorrência deste evento</button></div>';
    var rodape = '';
    if (abertoPodeTriar) { corpo += triagemForm(e); rodape = '<button type="button" class="r-btn r-btn-outline" data-act="fechar">Cancelar</button><button type="button" class="r-btn r-btn-primary" id="btn-triar" data-act="triar">Concluir triagem</button>'; }
    else if (e.status === 'aguardando') corpo += '<p class="aviso">Seu perfil não faz triagem. A central de atendimento é quem decide o destino deste evento.</p>';
    drawer('Evento ' + e.numero, 'checklist', corpo, rodape);
    var b = document.querySelector('#drawer-root [data-act=fechar]'); if (b) b.focus();
    if (abertoPodeTriar) syncTriagem();
  }
  /* ----- Triagem: Natureza > Tipo > Subtipo abre o formulário da combinação ----- */
  function triagemForm(e) {
    var req = '<span class="r-req" aria-hidden="true">*</span>';
    return '<form id="f-tri" class="bloco" novalidate onsubmit="return false"><h3 class="sec-t">Triagem</h3>' +
      '<fieldset><legend class="r-label">Natureza' + req + '</legend><div class="opcoes">' +
      NATUREZAS.map(function (n) { return '<label class="r-check"><input type="radio" name="nat" value="' + n[0] + '">' + n[1] + '</label>'; }).join('') + '</div><div class="r-err" id="er-nat" hidden></div></fieldset>' +
      '<div class="r-field"><label class="r-label" for="tri-tipo">Tipo' + req + '</label><select class="r-input" id="tri-tipo" disabled><option value="">Escolha a natureza primeiro</option></select><div class="r-err" id="er-tipo" hidden></div></div>' +
      '<div class="r-field"><label class="r-label" for="tri-sub">Subtipo' + req + '</label><select class="r-input" id="tri-sub" disabled><option value="">Escolha o tipo primeiro</option></select><div class="r-err" id="er-sub" hidden></div></div>' +
      '<div id="tri-dyn" class="bloco"></div>' +
      '<div id="tri-crim" class="bloco" hidden><p class="aviso">Natureza criminal vira uma ocorrência para a inteligência e o evento é concluído automaticamente.</p>' +
      '<div class="r-field"><label class="r-label" for="tri-forma">Forma de conhecimento</label><select class="r-input" id="tri-forma"><option value="">Não informada</option>' + FORMAS.map(function (f) { return '<option value="' + f[0] + '">' + f[1] + '</option>'; }).join('') + '</select></div>' +
      '<div class="r-field"><label class="r-label" for="tri-fato">Data e hora do fato' + req + '</label><input class="r-input" id="tri-fato" type="datetime-local" value="' + paraInputLocal(e.criadoEm) + '"><div class="r-err" id="er-fato" hidden></div></div>' +
      '<div class="r-field"><label class="r-label" for="tri-mesa">Análise da mesa de operações</label><textarea class="r-input" id="tri-mesa" maxlength="4000"></textarea></div></div>' +
      '<div id="tri-fim" class="bloco" hidden><div class="r-field"><label class="r-label" for="tri-obs">Observação do encerramento' + req + '</label><textarea class="r-input" id="tri-obs" maxlength="4000"></textarea>' +
      '<span class="r-hint">Diga o que foi feito para resolver o evento.</span><div class="r-err" id="er-obs" hidden></div></div></div></form>';
  }
  function triNatureza() { var r = document.querySelector('#f-tri input[name=nat]:checked'); return r ? r.value : ''; }
  function triLinha() { var n = triNatureza(), t = $('tri-tipo').value, st = $('tri-sub').value; for (var i = 0; i < S.tipif.linhas.length; i++) { var l = S.tipif.linhas[i]; if (l.natureza === n && l.tipo === t && l.subtipo === st) return l; } return null; }
  function opcoesSel(lista, vazio) { return '<option value="">' + vazio + '</option>' + lista.map(function (x) { return '<option>' + esc(x) + '</option>'; }).join(''); }
  function unicos(arr) { var v = {}, o = []; arr.forEach(function (x) { if (!v[x]) { v[x] = 1; o.push(x); } }); return o; }
  function syncTriagem() {
    var f = $('f-tri'); if (!f) return; var nat = triNatureza(), crim = nat === 'criminal', btn = $('btn-triar');
    $('tri-crim').hidden = !nat || !crim; $('tri-fim').hidden = !nat || crim;
    btn.textContent = !nat ? 'Concluir triagem' : (crim ? 'Encaminhar à inteligência' : 'Finalizar evento');
  }
  function aoEscolherNatureza() {
    var nat = triNatureza(), tipos = unicos(S.tipif.linhas.filter(function (l) { return l.natureza === nat; }).map(function (l) { return l.tipo; }));
    var t = $('tri-tipo'), st = $('tri-sub'); t.disabled = !tipos.length; t.innerHTML = opcoesSel(tipos, 'Selecione o tipo (' + tipos.length + ')');
    st.disabled = true; st.innerHTML = '<option value="">Escolha o tipo primeiro</option>'; $('tri-dyn').innerHTML = ''; syncTriagem();
    ['er-nat', 'er-tipo', 'er-sub'].forEach(function (i) { erroCampo(i, ''); });
  }
  function aoEscolherTipo() {
    var nat = triNatureza(), tipo = $('tri-tipo').value, subs = unicos(S.tipif.linhas.filter(function (l) { return l.natureza === nat && l.tipo === tipo; }).map(function (l) { return l.subtipo; })), st = $('tri-sub');
    st.disabled = !subs.length; st.innerHTML = opcoesSel(subs, tipo ? 'Selecione o subtipo (' + subs.length + ')' : 'Escolha o tipo primeiro'); $('tri-dyn').innerHTML = '';
    if (subs.length === 1) { st.value = subs[0]; aoEscolherSubtipo(); }
  }
  /* ----- Formulário de referência da combinação (definido na tabela "formularios") ----- */
  function campoRef(c) {
    var id = 'f-' + c.chave, req = c.obrigatorio ? '<span class="r-req" aria-hidden="true">*</span>' : '', at = ' id="' + id + '" data-k="' + esc(c.chave) + '" data-t="' + esc(c.tipo) + '"', ctrl;
    if (c.tipo === 'textarea') ctrl = '<textarea class="r-input"' + at + ' maxlength="' + (c.max || 2000) + '"></textarea>';
    else if (c.tipo === 'select') ctrl = '<select class="r-input"' + at + '><option value="">Selecione</option>' + (c.opcoes || []).map(function (o) { return '<option>' + esc(o) + '</option>'; }).join('') + '</select>';
    else if (c.tipo === 'sim_nao') ctrl = '<select class="r-input"' + at + '><option value="">Selecione</option><option value="sim">Sim</option><option value="nao">Não</option></select>';
    else if (c.tipo === 'hora') ctrl = '<input class="r-input"' + at + ' type="time">';
    else if (c.tipo === 'numero') ctrl = '<input class="r-input"' + at + ' type="text" inputmode="numeric" maxlength="9" autocomplete="off">';
    else if (c.tipo === 'km') ctrl = '<input class="r-input"' + at + ' type="text" placeholder="115+500" maxlength="9" autocomplete="off">';
    else ctrl = '<input class="r-input"' + at + ' type="text" maxlength="' + (c.max || 200) + '" autocomplete="off">';
    return '<div class="r-field"><label class="r-label" for="' + id + '">' + esc(c.rotulo) + req + '</label>' + ctrl + (c.ajuda ? '<span class="r-hint">' + esc(c.ajuda) + '</span>' : '') + '<div class="r-err" id="er-' + id + '" hidden></div></div>';
  }
  function aoEscolherSubtipo() {
    var l = triLinha(), box = $('tri-dyn'); if (!l) { box.innerHTML = ''; return; }
    var fm = S.tipif.formularios[l.formulario]; if (!fm) { box.innerHTML = '<p class="aviso">Esta combinação não tem formulário ativo.</p>'; return; }
    var grupos = {}, ordem = []; fm.campos.forEach(function (c) { var g = c.grupo || 'Principal'; if (!grupos[g]) { grupos[g] = []; ordem.push(g); } grupos[g].push(c); });
    var obrig = fm.campos.filter(function (c) { return c.obrigatorio; });
    // campos obrigatórios e o grupo "Principal" ficam sempre à vista; os demais grupos abrem sob demanda
    var h = '<div class="ref-form"><div class="ref-cab"><b>' + esc(fm.nome) + '</b><span class="r-hint">' + esc(tipifTxt(l.natureza, l.tipo, l.subtipo)) + '</span></div>';
    ordem.forEach(function (g) {
      var cs = grupos[g], aberto = g === 'Principal' || cs.some(function (c) { return c.obrigatorio; });
      var corpo = cs.map(campoRef).join('');
      h += aberto ? '<div class="ref-grupo">' + (g !== 'Principal' ? '<h4 class="sec-t">' + esc(g) + '</h4>' : '') + corpo + '</div>'
        : '<details class="ref-grupo" data-g="' + esc(g) + '"><summary>' + esc(g) + ' <span class="r-hint">(' + cs.length + ' campos, opcionais)</span></summary>' + corpo + '</details>';
    });
    box.innerHTML = h + '</div>';
  }
  function validarCampoRef(c, t) {
    var r = c.rotulo; if (!t) return c.obrigatorio ? 'Preencha o campo: ' + r + '.' : '';
    if (c.tipo === 'numero' && !/^\d{1,9}$/.test(t)) return r + ': informe só números.';
    if (c.tipo === 'km' && !/^\d{1,4}\+\d{3}$/.test(t)) return r + ': use o formato 115+500.';
    if (c.tipo === 'hora' && !/^([01]\d|2[0-3]):[0-5]\d$/.test(t)) return r + ': use o formato HH:MM.';
    if (c.tipo === 'select' && (c.opcoes || []).indexOf(t) < 0) return r + ': escolha uma das opções da lista.';
    if ((c.tipo === 'texto' || c.tipo === 'textarea') && t.length > (c.max || (c.tipo === 'texto' ? 200 : 2000))) return r + ': texto longo demais.';
    return '';
  }
  function coletarForm(l) {
    var fm = S.tipif.formularios[l.formulario], dados = {}, bad = false;
    fm.campos.forEach(function (c) {
      var el = $('f-' + c.chave), v = el ? String(el.value || '').trim() : '', m = validarCampoRef(c, v);
      erroCampo('er-f-' + c.chave, m, 'f-' + c.chave);
      if (m) { bad = true; var d = el && el.closest('details'); if (d) d.open = true; } else if (v) dados[c.chave] = v;
    });
    return { dados: dados, bad: bad };
  }
  function erroCampo(id, msg, campo) { var el = $(id); if (el) { el.textContent = msg || ''; el.hidden = !msg; el.innerHTML = msg ? ico('alerta') + esc(msg) : ''; } var c = $(campo); if (c) c.setAttribute('aria-invalid', msg ? 'true' : 'false'); }

  async function acaoTriar() {
    if (S.ocupado || !S.det) return; var e = S.det.evento, f = $('f-tri'); if (!f) return; var btn = $('btn-triar');
    ['er-nat', 'er-tipo', 'er-sub', 'er-fato', 'er-obs'].forEach(function (i) { erroCampo(i, ''); });
    var nat = triNatureza(), bad = false;
    if (!nat) { erroCampo('er-nat', 'Escolha a natureza.'); return; }
    if (!$('tri-tipo').value) { erroCampo('er-tipo', 'Escolha o tipo.', 'tri-tipo'); bad = true; }
    else if (!$('tri-sub').value) { erroCampo('er-sub', 'Escolha o subtipo.', 'tri-sub'); bad = true; }
    if (bad) return;
    var l = triLinha(); if (!l) { erroCampo('er-sub', 'Escolha uma combinação da lista.', 'tri-sub'); return; }
    var col = coletarForm(l), crim = nat === 'criminal', args, texto, rotulo;
    if (crim && !$('tri-fato').value) { erroCampo('er-fato', 'Informe a data e a hora do fato.', 'tri-fato'); bad = true; }
    if (!crim && !$('tri-obs').value.trim()) { erroCampo('er-obs', 'Descreva o que foi feito para encerrar o evento.', 'tri-obs'); bad = true; }
    if (col.bad || bad) { toast('warning', 'Confira o formulário', 'Há campos para corrigir.'); return; }
    var tipif = tipifTxt(l.natureza, l.tipo, l.subtipo);
    if (crim) { args = { eventoId: e.id, tipificacaoId: l.id, dados: col.dados, forma: $('tri-forma').value, fatoEm: new Date($('tri-fato').value).getTime(), analiseMesa: $('tri-mesa').value };
      texto = 'O evento ' + e.numero + ' será concluído e uma ocorrência (' + tipif + ') será criada para a inteligência. Não dá para desfazer.'; rotulo = 'Encaminhar'; }
    else { args = { eventoId: e.id, tipificacaoId: l.id, dados: col.dados, observacao: $('tri-obs').value.trim() };
      texto = 'O evento ' + e.numero + ' será finalizado como ' + tipif + ', sem ocorrência. Não dá para desfazer.'; rotulo = 'Finalizar'; }
    var sim = await confirmar({ titulo: crim ? 'Encaminhar à inteligência?' : 'Finalizar o evento?', texto: texto, rotulo: rotulo });
    if (!sim) return;
    S.ocupado = true; btn.disabled = true; btn.textContent = 'Salvando…';
    try {
      await D.triar(args);
      toast('success', crim ? 'Ocorrência criada' : 'Evento finalizado', 'O evento ' + e.numero + ' foi concluído.');
      fechar(); carregar({ silencioso: true });
    } catch (err) {
      toast('danger', 'Não foi possível salvar', err.message);
      if (/ja_concluido|já passou/i.test(err.message + (err.codigo || ''))) { carregarDetalhe(); carregar({ silencioso: true }); }
      btn.disabled = false; syncTriagem();
    }
    S.ocupado = false;
  }

  function renderOcorrencia(d) {
    var o = d.ocorrencia, t = tomOc(o), idx = o.status === 'concluido' ? 5 : o.classificacao ? 4 : (o.boletimExiste != null) ? 3 : (d.analises.length > 0 ? 2 : 1);
    var corpo = stepsHtml(['Criada', 'Análise', 'Boletim', 'Classificação', 'Concluída'], idx) +
      '<div class="linha-status">' + badge(t.t, t.c) + '<span class="tempo" style="color:var(--rumo-muted)">' + esc(tempoTxt(o)) + '</span></div>' +
      '<dl class="kv"><dt>Evento de origem</dt><dd>' + (ehIntel() ? esc(o.eventoNumero || '—') : '<button type="button" class="r-btn r-btn-ghost r-btn-sm" style="min-height:24px;padding:0" data-act="abrir-ev" data-id="' + esc(o.eventoId) + '">' + esc(o.eventoNumero || 'Abrir evento') + '</button>') + '</dd>' +
      '<dt>Tipificação</dt><dd>' + esc(o.natureza ? tipifTxt(o.natureza, o.tipo, o.subtipo) : o.tipo + (o.subtipo ? ' › ' + o.subtipo : '')) + '</dd><dt>Local</dt><dd>' + esc(o.local) + '</dd>' +
      (o.latitude != null ? '<dt>GPS</dt><dd><a href="https://www.google.com/maps?q=' + o.latitude + ',' + o.longitude + '" target="_blank" rel="noopener">' + o.latitude.toFixed(5) + ', ' + o.longitude.toFixed(5) + ' · abrir no mapa</a></dd>' : '') +
      '<dt>Fato em</dt><dd>' + fmtData(o.fatoEm) + '</dd>' +
      '<dt>Conhecimento</dt><dd>' + esc(lbl(FORMAS, o.forma) || 'Não informado') + '</dd><dt>Aberta por</dt><dd>' + esc(o.criadoPorNome || '—') + '</dd>' +
      '<dt>Boletim</dt><dd>' + (o.boletimExiste == null ? 'Não informado' : (o.boletimExiste ? 'Sim' + (o.boletimNumero ? ' · nº ' + esc(o.boletimNumero) : '') : 'Não')) + '</dd>' +
      '<dt>Classificação</dt><dd>' + (o.classificacao ? badge(lbl(CLASSES, o.classificacao), 'neutral') : (ehIntel() ? 'Pendente' : 'Ag. classificação (feita pela inteligência)')) + '</dd></dl>' +
      '<div><h3 class="sec-t">Descrição</h3><p class="txt">' + esc(o.descricao) + '</p></div>' +
      dadosHtml(o.tipificacaoId, o.dados) +
      '<div><h3 class="sec-t">Fotos</h3>' + fotosHtml(d.fotos) + '</div>' +
      '<div><h3 class="sec-t">Análise da mesa de operações</h3><p class="txt">' + esc(o.analiseMesa || 'Sem análise da mesa.') + '</p></div>' +
      '<div><h3 class="sec-t">Análises da ocorrência</h3>' + (d.analises.length ? '<ul class="analises">' + d.analises.map(function (a) { return '<li><small>' + fmtData(a.em) + ' · ' + esc(a.autor) + '</small>' + esc(a.texto) + '</li>'; }).join('') + '</ul>' : '<p class="txt" style="color:var(--rumo-muted)">Nenhuma análise registrada ainda.</p>') + '</div>';
    var rodape = '';
    if (o.status !== 'concluido') {
      corpo += '<div class="r-field"><label class="r-label" for="an-texto">Nova análise</label><textarea class="r-input" id="an-texto" maxlength="4000"></textarea><div class="r-err" id="er-an" hidden></div></div>';
      rodape = '<button type="button" class="r-btn r-btn-outline" data-act="fechar">Fechar</button><button type="button" class="r-btn r-btn-primary" id="btn-analise" data-act="analise">Adicionar análise</button>';
    }
    if (podeIntel()) corpo += iaHtml(d) + boletimHtml(o) + classHtml(o);
    S.pick = null;
    drawer('Ocorrência ' + o.numero, 'seguranca', corpo, rodape);
    var b = document.querySelector('#drawer-root [data-act=fechar]'); if (b && !S.mantem) b.focus();
  }
  async function acaoAnalise() {
    if (S.ocupado || !S.det) return; var o = S.det.ocorrencia, txt = $('an-texto').value.trim(), btn = $('btn-analise');
    if (!txt) { erroCampo('er-an', 'Escreva a análise antes de adicionar.', 'an-texto'); return; }
    erroCampo('er-an', ''); S.ocupado = true; btn.disabled = true; btn.textContent = 'Salvando…';
    try {
      await D.adicionarAnalise({ ocorrenciaId: o.id, texto: txt });
      toast('success', 'Análise adicionada', 'Ocorrência ' + o.numero + '.');
      await carregarDetalhe(); carregar({ silencioso: true });
    } catch (err) { toast('danger', 'Não foi possível salvar', err.message); btn.disabled = false; btn.textContent = 'Adicionar análise'; }
    S.ocupado = false;
  }

  /* ---------- Inteligência: IA, boletim, classificação e conclusão ---------- */
  function kvDados(obj, rot) {
    return Object.keys(rot).map(function (k) { var v = obj && obj[k] != null ? obj[k] : NI; return '<dt>' + esc(rot[k]) + '</dt><dd' + (v === NI ? ' style="color:var(--rumo-muted)"' : '') + '>' + esc(v) + '</dd>'; }).join('');
  }
  function iaHtml(d) {
    var o = d.ocorrencia, ult = d.ia && d.ia[0], r = ult && ult.resultado;
    var h = '<div class="bloco"><h3 class="sec-t">Análise por IA · OpenAI</h3>';
    if (o.status !== 'concluido') {
      h += '<div class="linha-status"><button type="button" class="r-btn r-btn-outline r-btn-sm" id="btn-ia" data-act="ia"' + (S.iaBusy ? ' disabled' : '') + '>' + ico('checklist') + (S.iaBusy ? 'Analisando…' : (r ? 'Analisar de novo' : 'Analisar com IA')) + '</button>' +
        '<span class="r-hint" id="ia-st">' + (S.iaBusy ? 'A OpenAI está analisando a ocorrência. Aguarde.' : '') + '</span></div><div class="r-err" id="er-ia" hidden></div>';
    }
    if (!r) return h + '<p class="txt" style="color:var(--rumo-muted)">Nenhuma análise por IA ainda. A OpenAI avalia a qualidade do registro, sugere tipificação e minuta. Você revisa antes de usar.</p></div>';
    if (!r.agente1) {
      h += '<div class="r-card ia-card"><p class="aviso">Análise gerada por OpenAI em ' + fmtData(ult.em) + (ult.modelo ? ' (' + esc(ult.modelo) + ')' : '') + '. Revise os fatos antes de utilizar as sugestões.</p>';
      var titulos = { qualidade: 'Qualidade do registro', viabilidade: 'Viabilidade do boletim', tipificacao: 'Tipificação sugerida', minuta: 'Minuta sugerida', naoInformado: 'Informações não localizadas' };
      Object.keys(titulos).forEach(function (k) {
        var valor = r[k]; if (valor == null) return;
        var txt = typeof valor === 'string' ? valor : JSON.stringify(valor, null, 2);
        h += '<details class="ia-etapa" open><summary>' + titulos[k] + '</summary><pre style="white-space:pre-wrap;overflow-wrap:anywhere;font:inherit;margin:8px 0">' + esc(txt) + '</pre></details>';
      });
      return h + '</div></div>';
    }
    var a1 = r.agente1, a2 = r.agente2 || {}, a3 = r.agente3 || {}, nota = Math.max(0, Math.min(10, Number(a1.qualidade && a1.qualidade.nota) || 0)), viavel = a1.viabilidade && a1.viabilidade.status === 'VIÁVEL PARA BO';
    var v = r.versoes || {}, ver = (v.agentes ? 'Agentes v' + [v.agentes['1'], v.agentes['2'], v.agentes['3']].join(' / v') : '') + (v.minuta ? ' · minuta ' + v.minuta.numero + ' v' + v.minuta.versao : '');
    h += '<div class="r-card ia-card"><p class="aviso">Gerado por IA em ' + fmtData(ult.em) + (ult.modelo ? ' (' + esc(ult.modelo) + ')' : '') + '. ' + (r.simulacao ? '<b>Simulação do modo demonstração, sem IA real.</b> ' : '') +
      'Confira cada fato no registro antes de usar. O que faltou no registro aparece como ' + NI + ' ou fica fora do texto.</p>';
    // Agente 1
    h += '<details class="ia-etapa" open><summary>1. Qualidade do registro e viabilidade de BO</summary><dl class="kv"><dt>Qualidade</dt><dd><b>Nota ' + nota + ' de 10</b><div class="r-progress" role="img" aria-label="Nota ' + nota + ' de 10"><div style="width:' + (nota * 10) + '%"></div></div>' + esc(a1.qualidade && a1.qualidade.justificativa) + '</dd>' +
      '<dt>Boletim</dt><dd>' + badge(viavel ? 'Viável para BO' : 'Sem BO aplicável', viavel ? 'info' : 'neutral') + ' ' + esc(a1.viabilidade && a1.viabilidade.justificativa) + '</dd></dl>' +
      '<h4 class="sec-t" style="margin-top:12px">Dados extraídos para o boletim</h4><dl class="kv">' + kvDados(a1.dados, ROT_DADOS) + '</dl></details>';
    // Agente 2
    h += '<details class="ia-etapa" open><summary>2. Tipificação penal e minuta</summary>' +
      (a2.tipificacao ? '<dl class="kv"><dt>Tipificação</dt><dd><b>' + esc(a2.tipificacao.artigo) + '</b> · uso interno, não vai para o boletim<br>' + esc(a2.tipificacao.fundamento) + '</dd>' +
        '<dt>Minuta</dt><dd>' + (a2.minuta ? '<b>Minuta ' + a2.minuta.numero + ' — ' + esc(a2.minuta.nome) + '</b><br>' + esc(a2.minuta.justificativa) : '<b>' + esc(a2.mensagem || 'MINUTA NÃO APLICÁVEL') + '</b>') + '</dd></dl>' : '') +
      (a2.encerrado && a2.mensagem && !a2.tipificacao ? '<p class="txt"><b>' + esc(a2.mensagem) + '</b></p>' : '') + '</details>';
    // Agente 3
    h += '<div class="ia-etapa-fixa"><h4 class="sec-t">3. Parecer para a Delegacia Digital</h4>';
    if (a3.encerrado || !a3.parecer) h += '<p class="txt"><b>' + esc(a3.mensagem || 'SEM PARECER — Ocorrência não elegível para geração de BO.') + '</b></p>';
    else {
      var ok = a3.status === 'DENTRO DO LIMITE';
      h += '<div class="r-field"><label class="r-label" for="ia-minuta">Texto pronto para copiar e colar</label><textarea class="r-input" id="ia-minuta" readonly rows="9">' + esc(a3.parecer) + '</textarea>' +
        '<span class="r-hint">' + badge(a3.status, ok ? 'success' : 'warning') + ' ' + Number(a3.caracteres).toLocaleString('pt-BR') + ' de 1.200 caracteres (contados pelo sistema)</span>' +
        '<div><button type="button" class="r-btn r-btn-outline r-btn-sm" data-act="copiar-minuta">' + ico('documento') + 'Copiar parecer</button></div></div>' +
        ((a3.camposNaoLocalizados && a3.camposNaoLocalizados.length) ? '<p class="txt"><b>Campos não localizados no registro</b> (ficaram fora do texto): ' + a3.camposNaoLocalizados.map(esc).join(', ') + '.</p>' : '<p class="txt">Campos não localizados no registro: nenhum.</p>');
    }
    h += '</div>';
    if (r.verificacoes && r.verificacoes.length) h += '<details class="ia-etapa"' + (r.verificacoes.some(function (x) { return !x.ok; }) ? ' open' : '') + '><summary>Verificações do sistema (' + r.verificacoes.filter(function (x) { return x.ok; }).length + ' de ' + r.verificacoes.length + ' ok)</summary><ul class="ver-lista">' +
      r.verificacoes.map(function (x) { return '<li class="' + (x.ok ? 'ver-ok' : 'ver-ruim') + '">' + ico(x.ok ? 'sucesso' : 'erro') + '<span>' + esc(x.regra) + (x.ok ? '' : ' — ' + esc(x.detalhe || 'conferir')) + '</span></li>'; }).join('') + '</ul></details>';
    // Relatório estatístico (Seção 4 do agente 1): separado do boletim
    h += '<details class="ia-etapa"><summary>Relatório estatístico padronizado <span class="r-hint">(não usar no boletim)</span></summary><p class="r-hint">Contém dados pessoais (primeiro nome e RE do maquinista). Serve só à coleta estatística da Rumo.</p><dl class="kv">' + kvDados(a1.relatorio, ROT_REL) + '</dl></details>';
    return h + (ver ? '<span class="r-hint">' + esc(ver) + '</span>' : '') + '</div></div>';
  }
  function boletimHtml(o) {
    var h = '<div class="bloco"><h3 class="sec-t">Boletim de ocorrência</h3>';
    if (o.status === 'concluido' || o.classificacao) {
      return h + '<p class="txt">' + (o.boletimExiste == null ? 'Não informado.' : (o.boletimExiste ? 'Há boletim registrado' + (o.boletimNumero ? ': nº ' + esc(o.boletimNumero) : '') + '.' : 'Não há boletim registrado.')) + '</p></div>';
    }
    var v = o.boletimExiste == null ? '' : (o.boletimExiste ? 'sim' : 'nao');
    return h + '<div class="r-field"><label class="r-label" for="bo-existe">Existe um boletim de ocorrência registrado?<span class="r-req" aria-hidden="true">*</span></label>' +
      '<select class="r-input" id="bo-existe"><option value="">Selecione</option><option value="sim"' + (v === 'sim' ? ' selected' : '') + '>Sim</option><option value="nao"' + (v === 'nao' ? ' selected' : '') + '>Não</option></select></div>' +
      '<div class="r-field" id="fd-bo-num"' + (v === 'sim' ? '' : ' hidden') + '><label class="r-label" for="bo-num">Número do boletim<span class="r-req" aria-hidden="true">*</span></label><input class="r-input" id="bo-num" type="text" maxlength="60" value="' + esc(o.boletimNumero) + '"></div>' +
      '<div class="r-err" id="er-bo" hidden></div><div><button type="button" class="r-btn r-btn-outline r-btn-sm" id="btn-bo" data-act="boletim">' + (v ? 'Atualizar resposta' : 'Salvar resposta') + '</button></div></div>';
  }
  function classHtml(o) {
    var h = '<div class="bloco"><h3 class="sec-t">Classificação</h3>';
    if (o.classificacao) {
      h += '<div class="linha-status">' + badge(lbl(CLASSES, o.classificacao), 'neutral') + '<span class="r-hint">em ' + fmtData(o.classificadoEm) + '. Não pode ser alterada.</span></div>';
      if (o.status !== 'concluido') h += '<div><button type="button" class="r-btn r-btn-primary" id="btn-concluir" data-act="concluir">Concluir ocorrência</button></div><p class="r-hint">Concluir encerra a ocorrência. A regra de encerramento ainda precisa ser validada com a Rumo.</p>';
      return h + '</div>';
    }
    if (o.status === 'concluido') return h + '<p class="txt">Concluída sem classificação.</p></div>';
    if (o.boletimExiste == null) return h + '<p class="aviso">Responda sobre o boletim antes de classificar.</p></div>';
    return h + '<div class="opcoes" role="group" aria-label="Categorias da classificação">' + CLASSES.map(function (c) { return '<button type="button" class="r-chip" data-act="pick" data-v="' + c[0] + '" aria-pressed="false">' + c[1] + '</button>'; }).join('') + '</div>' +
      '<div class="r-err" id="er-cls" hidden></div><div><button type="button" class="r-btn r-btn-primary" id="btn-classificar" data-act="classificar" disabled>Classificar ocorrência</button></div></div>';
  }
  function recarregarDetalhe() { S.mantem = true; return carregarDetalhe().then(function () { S.mantem = false; }); }
  async function acaoIA() {
    if (S.iaBusy || !S.det) return; var o = S.det.ocorrencia, btn = $('btn-ia'); S.iaBusy = true;
    if (btn) { btn.disabled = true; btn.innerHTML = ico('checklist') + 'Analisando…'; } var st = $('ia-st'); if (st) st.textContent = 'Pode levar até 30 segundos.'; erroCampo('er-ia', '');
    try { await D.analisarIA({ ocorrenciaId: o.id }); toast('success', 'Análise por IA pronta', 'Revise o resultado antes de usar a minuta.'); S.iaBusy = false; await recarregarDetalhe(); carregar({ silencioso: true }); }
    catch (err) { S.iaBusy = false; if ($('btn-ia')) { $('btn-ia').disabled = false; $('btn-ia').innerHTML = ico('checklist') + 'Tentar de novo'; } if ($('ia-st')) $('ia-st').textContent = ''; erroCampo('er-ia', err.message); toast('danger', 'A IA não concluiu', err.message); }
  }
  async function acaoBoletim() {
    if (S.ocupado || !S.det) return; var o = S.det.ocorrencia, ex = $('bo-existe').value, num = $('bo-num').value.trim(); erroCampo('er-bo', '');
    if (!ex) { erroCampo('er-bo', 'Escolha Sim ou Não.', 'bo-existe'); return; }
    if (ex === 'sim' && !num) { erroCampo('er-bo', 'Informe o número do boletim.', 'bo-num'); return; }
    S.ocupado = true; $('btn-bo').disabled = true;
    try { await D.responderBoletim({ ocorrenciaId: o.id, existe: ex === 'sim', numero: num }); toast('success', 'Resposta do boletim salva', 'Ocorrência ' + o.numero + '.'); await recarregarDetalhe(); carregar({ silencioso: true }); }
    catch (err) { toast('danger', 'Não foi possível salvar', err.message); var b = $('btn-bo'); if (b) b.disabled = false; }
    S.ocupado = false;
  }
  function pickClasse(v) {
    S.pick = v; document.querySelectorAll('.opcoes [data-act=pick]').forEach(function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-v') === v ? 'true' : 'false'); });
    var b = $('btn-classificar'); if (b) { b.disabled = false; b.textContent = 'Classificar como ' + lbl(CLASSES, v); }
  }
  async function acaoClassificar() {
    if (S.ocupado || !S.det || !S.pick) return; var o = S.det.ocorrencia, k = S.pick;
    var sim = await confirmar({ titulo: 'Classificar como ' + lbl(CLASSES, k) + '?', texto: 'A ocorrência ' + o.numero + ' será classificada como ' + lbl(CLASSES, k).toLowerCase() + '. A classificação não pode ser alterada depois.', rotulo: 'Classificar' });
    if (!sim) return; S.ocupado = true; var b = $('btn-classificar'); if (b) b.disabled = true;
    try { await D.classificar({ ocorrenciaId: o.id, classificacao: k }); toast('success', 'Ocorrência classificada', lbl(CLASSES, k) + ' · ' + o.numero + '.'); await recarregarDetalhe(); carregar({ silencioso: true }); }
    catch (err) { toast('danger', 'Não foi possível classificar', err.message); if (b) b.disabled = false; }
    S.ocupado = false;
  }
  async function acaoConcluir() {
    if (S.ocupado || !S.det) return; var o = S.det.ocorrencia;
    var sim = await confirmar({ titulo: 'Concluir a ocorrência?', texto: 'A ocorrência ' + o.numero + ' será encerrada e não receberá novas análises. Não dá para desfazer.', rotulo: 'Concluir' });
    if (!sim) return; S.ocupado = true;
    try { await D.concluir({ ocorrenciaId: o.id }); toast('success', 'Ocorrência concluída', o.numero + '.'); fechar(); carregar({ silencioso: true }); }
    catch (err) { toast('danger', 'Não foi possível concluir', err.message); }
    S.ocupado = false;
  }
  function copiarMinuta() {
    var ta = $('ia-minuta'); if (!ta) return; var txt = ta.value;
    function ok() { toast('success', 'Parecer copiado', 'Confira os dados antes de registrar o boletim.'); }
    function plano() { ta.focus(); ta.select(); try { document.execCommand('copy') ? ok() : toast('warning', 'Copie manualmente', 'Selecione o texto da minuta e use Ctrl+C.'); } catch (e) { toast('warning', 'Copie manualmente', 'Selecione o texto da minuta e use Ctrl+C.'); } }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(ok, plano); else plano();
  }
  function trocarVisao(v) {
    if (!S.usuario || S.usuario.perfil !== 'admin' || S.visao === v) return;
    S.visao = v; try { localStorage.setItem('visao', v); } catch (e) {}
    S.aba = ehIntel() ? 'ocorrencias' : 'eventos'; S.status = ''; S.busca = ''; S.periodo = 'todos'; S.pagina = 1; S.dados = { linhas: [], total: 0 }; S.kpi = null; S.userPop = false; S.carregando = true;
    fechar(); pararTudo();
    if (ehCampo()) { renderApp(); return; }
    renderApp(); carregar(); ligarPainel();
    if (!S.tipif.linhas.length) carregarTipif().catch(function () {});
  }

  /* ---------- Info (explicação do indicador) ---------- */
  function fecharInfo() { var p = $('pop-info'); if (p) p.remove(); document.querySelectorAll('.r-info[aria-expanded=true]').forEach(function (b) { b.setAttribute('aria-expanded', 'false'); }); }
  function abrirInfo(btn) {
    var aberto = btn.getAttribute('aria-expanded') === 'true'; fecharInfo(); if (aberto) return;
    var i = INFO[btn.getAttribute('data-k')]; if (!i) return; btn.setAttribute('aria-expanded', 'true');
    var p = document.createElement('div'); p.id = 'pop-info'; p.className = 'r-pop pop-fixed'; p.setAttribute('role', 'dialog');
    p.innerHTML = '<dl><dt>O que é</dt><dd>' + esc(i.what) + '</dd><dt>Como é calculado</dt><dd>' + esc(i.rule) + '</dd><dt>Origem</dt><dd>' + esc(i.source) + '</dd><dt>Período</dt><dd>' + esc(i.period) + '</dd></dl>';
    document.body.appendChild(p); var r = btn.getBoundingClientRect();
    p.style.left = Math.max(8, Math.min(r.right - 260, window.innerWidth - 268)) + 'px'; p.style.top = (r.bottom + 6) + 'px';
  }

  /* ---------- Exportação ---------- */
  async function exportar() {
    var btn = document.querySelector('[data-act=exportar]'); btn.disabled = true;
    try {
      var todos = [], pg = 1, total = 0;
      do {
        var f = filtro(); f.pagina = pg; f.porPagina = 500;
        var r = S.aba === 'eventos' ? await D.listarEventos(f) : await D.listarOcorrencias(f);
        todos = todos.concat(r.linhas); total = r.total; pg++;
      } while (todos.length < total && pg <= 20);
      var cel = function (v) { v = v == null ? '' : String(v); return /[;"\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
      var ev = S.aba === 'eventos', cab, rows;
      if (ev) { cab = ['Número', 'Registrado em', 'Local', 'Descrição', 'Registrado por', 'Tempo', 'Status', 'Triagem', 'Tipificação']; rows = todos.map(function (e) { return [e.numero, fmtData(e.criadoEm), e.local, e.descricao, e.criadoPorNome, tempoTxt(e), tomEvento(e).t, lbl(TRIAGEM, e.triagemCategoria), e.tipificacaoId ? tipifTxt(e.tipifNatureza, e.tipifTipo, e.tipifSubtipo) : '']; }); }
      else { cab = ['Número', 'Evento', 'Fato em', 'Local', 'Natureza', 'Tipo', 'Subtipo', 'Tempo', 'Status', 'Boletim', 'Classificação']; rows = todos.map(function (o) { return [o.numero, o.eventoNumero, fmtData(o.fatoEm), o.local, lbl(NATUREZAS, o.natureza), o.tipo, o.subtipo, tempoTxt(o), tomOc(o).t, o.boletimExiste == null ? 'Pendente' : (o.boletimExiste ? 'Sim' + (o.boletimNumero ? ' ' + o.boletimNumero : '') : 'Não'), lbl(CLASSES, o.classificacao)]; }); }
      var csv = '\ufeff' + [cab].concat(rows).map(function (l) { return l.map(cel).join(';'); }).join('\r\n');
      var url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })), a = document.createElement('a'), d = new Date();
      a.href = url; a.download = (ev ? 'eventos-' : 'ocorrencias-') + d.getFullYear() + p2(d.getMonth() + 1) + p2(d.getDate()) + '.csv'; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 2000); toast('success', 'Exportação pronta', todos.length + ' registros em CSV.');
    } catch (e) { toast('danger', 'Não foi possível exportar', e.message); }
    btn.disabled = false;
  }

  /* ---------- Eventos de interface ---------- */
  document.addEventListener('click', function (ev) {
    var t = ev.target.closest('[data-act]');
    if (!ev.target.closest('.r-info') && !ev.target.closest('#pop-info')) fecharInfo();
    if (S.userPop && !ev.target.closest('.userpop') && !(t && t.getAttribute('data-act') === 'usuario')) { S.userPop = false; renderTopbar(); }
    if (!t) { var tr = ev.target.closest('tr[data-id]'); if (tr && S.tela === 'painel') abrir(tr.getAttribute('data-id')); return; }
    var a = t.getAttribute('data-act'), v = t.getAttribute('data-v');
    if (a === 'veiculo-turno') { if (window.SecurityVeiculos) window.SecurityVeiculos.show(); }
    else if (a === 'efetivo-turno') { if (window.SecurityEfetivo) window.SecurityEfetivo.show(); }
    else if (a === 'mapa-gps') { if (window.SecurityTrackingMap) window.SecurityTrackingMap.show(); }
    else if (a === 'scrim') { if (ev.target === t) fechar(); }
    else if (a === 'fechar') fechar();
    else if (a === 'abrir') { ev.stopPropagation(); abrir(t.getAttribute('data-id')); }
    else if (a === 'aba') { if (S.aba !== v) { S.aba = v; S.status = ''; S.pagina = 1; S.dados = { linhas: [], total: 0 }; S.kpi = null; renderTabs(); renderChips(); renderKpis(); carregar(); } }
    else if (a === 'chip') { S.status = v; S.pagina = 1; renderChips(); carregar(); }
    else if (a === 'pagina') { var n = parseInt(v, 10); if (n >= 1) { S.pagina = n; carregar(); window.scrollTo({ top: 0 }); } }
    else if (a === 'atualizar') { if (ehCampo()) window.PainelCampo.atualizar(); else carregar({ silencioso: !S.erro }); }
    else if (a === 'demo-offline') { S.demoOff = t.checked; D.simularOffline(S.demoOff); window.dispatchEvent(new Event(S.demoOff ? 'offline' : 'online')); if (!S.demoOff && !ehCampo()) carregar({ silencioso: true }); }
    else if (a === 'tema') { aplicarTema(S.tema === 'dark' ? 'light' : 'dark'); }
    else if (a === 'usuario') { S.userPop = !S.userPop; renderTopbar(); }
    else if (a === 'sair') sair();
    else if (a === 'reiniciar') iniciar();
    else if (a === 'exportar') exportar();
    else if (a === 'info') abrirInfo(t);
    else if (a === 'triar') acaoTriar();
    else if (a === 'analise') acaoAnalise();
    else if (a === 'ia') acaoIA();
    else if (a === 'boletim') acaoBoletim();
    else if (a === 'pick') pickClasse(v);
    else if (a === 'classificar') acaoClassificar();
    else if (a === 'concluir') acaoConcluir();
    else if (a === 'copiar-minuta') copiarMinuta();
    else if (a === 'visao') trocarVisao(v);
    else if (a === 'abrir-oc') { fechar(); S.aba = 'ocorrencias'; S.status = ''; S.pagina = 1; S.dados = { linhas: [], total: 0 }; S.kpi = null; renderTabs(); renderChips(); renderKpis(); carregar(); abrirDireto(t.getAttribute('data-id')); }
    else if (a === 'abrir-ev') { fechar(); S.aba = 'eventos'; S.status = ''; S.pagina = 1; S.dados = { linhas: [], total: 0 }; S.kpi = null; renderTabs(); renderChips(); renderKpis(); carregar(); abrirDireto(t.getAttribute('data-id')); }
  });
  function abrirDireto(id) { S.foco = null; S.sel = { tipo: S.aba, id: id }; S.det = null; drawer(S.aba === 'eventos' ? 'Evento' : 'Ocorrência', 'checklist', estado('loading', 'Carregando', 'Abrindo o registro.'), ''); carregarDetalhe(); }
  document.addEventListener('change', function (ev) {
    var t = ev.target;
    if (t.id === 'periodo') { S.periodo = t.value; S.pagina = 1; carregar(); }
    else if (t.name === 'nat') aoEscolherNatureza();
    else if (t.id === 'tri-tipo') aoEscolherTipo();
    else if (t.id === 'tri-sub') aoEscolherSubtipo();
    else if (t.id === 'bo-existe') { var f = $('fd-bo-num'); if (f) f.hidden = t.value !== 'sim'; }
  });
  document.addEventListener('focusout', function (ev) {
    var t = ev.target; if (!t || t.getAttribute('data-t') !== 'km') return;
    var m = String(t.value).trim().match(/^(\d{1,4})[.,](\d{3})$/); if (m) t.value = m[1] + '+' + m[2];
  });
  var _busca = null;
  document.addEventListener('input', function (ev) {
    if (ev.target.id === 'busca') { clearTimeout(_busca); var v = ev.target.value; _busca = setTimeout(function () { S.busca = v.trim(); S.pagina = 1; carregar({ silencioso: true }); }, 350); }
  });
  document.addEventListener('submit', function (ev) {
    if (ev.target.id === 'f-login') {
      ev.preventDefault(); var em = $('lg-email').value.trim(), sn = $('lg-senha').value, er = $('lg-err'), b = $('lg-btn');
      if (!em || !sn) { er.hidden = false; er.innerHTML = ico('alerta') + 'Informe o e-mail e a senha.'; return; }
      er.hidden = true; b.disabled = true; b.textContent = 'Entrando…';
      D.entrar(em, sn).then(function (r) { entrou(r.usuario); }).catch(function (e) { er.hidden = false; er.innerHTML = ico('alerta') + esc(e.message); b.disabled = false; b.textContent = 'Entrar'; });
    }
  });
  document.addEventListener('keydown', function (ev) {
    if (ev.key !== 'Escape') return;
    if (S.modalFim) { S.modalFim(false); return; }
    if ($('pop-info')) { fecharInfo(); return; }
    if (S.userPop) { S.userPop = false; renderTopbar(); return; }
    if (S.sel) fechar();
  });
  window.addEventListener('online', function () { S.sync = 'syncing'; renderSub(); carregar({ silencioso: true }); });
  window.addEventListener('offline', function () { S.sync = 'offline'; renderSub(); });

  /* ---------- Ciclo de vida ---------- */
  function pararTudo() { if (S.unsub) { S.unsub(); S.unsub = null; } S.timers.forEach(clearInterval); S.timers = []; if (window.PainelCampo) window.PainelCampo.parar(); }
  function ligarPainel() {
    pararTudo();
    S.unsub = D.assinar(function () { carregarDepois(500); }, function (ok) { S.tempoReal = ok; renderSub(); });
    S.timers.push(setInterval(function () { if (!document.hidden && S.tela === 'painel') carregar({ silencioso: true }); }, (C.ATUALIZAR_A_CADA_SEG || 60) * 1000));
    S.timers.push(setInterval(function () { if (S.tela === 'painel' && !document.hidden) { renderTabela(); } }, 60000));
  }
  function entrou(u) {
    S.usuario = u; var p = u.perfil;
    if (['campo', 'central', 'inteligencia', 'admin'].indexOf(p) < 0) { S.tela = 'proibido'; renderApp(); return; }
    var salva = lerVisao();
    S.visao = p === 'admin' ? (['central', 'inteligencia', 'campo'].indexOf(salva) >= 0 ? salva : 'central') : p;
    S.aba = ehIntel() ? 'ocorrencias' : 'eventos'; S.status = ''; S.busca = ''; S.periodo = 'todos'; S.pagina = 1; S.dados = { linhas: [], total: 0 }; S.kpi = null; S.carregando = true;
    S.tela = 'painel'; pararTudo();
    if (ehCampo()) { renderApp(); return; }
    renderApp(); carregar();
    carregarTipif().catch(function () { toast('warning', 'Tipificação indisponível', 'A triagem precisa da lista de natureza, tipo e subtipo. Atualize a página.'); });
    ligarPainel();
  }
  function sair() { pararTudo(); fechar(); S.userPop = false; D.sair().catch(function () {}).then(function () { S.usuario = null; S.dados = { linhas: [], total: 0 }; S.kpi = null; S.tela = 'login'; renderApp(); }); }
  function iniciar() {
    S.tela = 'carregando'; renderApp();
    D.iniciar().then(function (r) { if (!r.logado) { S.tela = 'login'; renderApp(); return; } entrou(r.usuario); })
      .catch(function (e) { S.tela = 'erroInicial'; S.erro = e.message; renderApp(); });
  }
  window.PainelUI = { esc: esc, fmtData: fmtData, fmtDur: fmtDur, badge: badge, estado: estado, toast: toast, confirmar: confirmar };
  aplicarTema(temaInicial());
  iniciar();
  // Abertura sem internet: só quando o painel é servido com manifest (projeto publicado), não na demonstração em arquivo único.
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol) && document.querySelector('link[rel=manifest]')) {
    window.addEventListener('load', function () { navigator.serviceWorker.register('sw.js').catch(function () { /* sem service worker: segue online */ }); });
  }
})();
