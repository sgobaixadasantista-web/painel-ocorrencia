/* Camada de dados do Painel da Central.
   Duas implementações com a MESMA interface:
   - Supabase (quando config.js tem URL e chave anon)
   - Demonstração (dados fictícios em memória, com as mesmas regras do fluxo)
   O restante do painel não sabe qual está em uso. */
(function () {
  'use strict';
  var C = window.PAINEL_CONFIG || {};
  var MODO_DEMO = !(C.SUPABASE_URL && C.SUPABASE_ANON_KEY);

  /* ---------- Mensagens de erro em linguagem de operação ---------- */
  var MSG = {
    sem_permissao: 'Seu perfil não pode executar esta ação.',
    evento_ja_concluido: 'Este evento já passou pela triagem. Atualize a lista.',
    evento_nao_encontrado: 'Evento não encontrado. Atualize a lista.',
    ocorrencia_nao_encontrada: 'Ocorrência não encontrada. Atualize a lista.',
    ocorrencia_concluida: 'Ocorrência concluída não recebe novas análises.',
    tipo_invalido: 'Escolha um tipo de ocorrência da lista.',
    subtipo_invalido: 'Escolha o subtipo da ocorrência.',
    dados_incompletos: 'Preencha os campos obrigatórios.',
    use_triagem_criminal: 'Caso criminal deve ser encaminhado à inteligência.',
    responda_boletim: 'Responda sobre o boletim antes de classificar.',
    classifique_antes: 'Classifique a ocorrência antes de concluir.',
    ja_classificada: 'A classificação não pode ser alterada.',
    ia_recente: 'Aguarde alguns segundos antes de analisar de novo.',
    resultado_invalido: 'A resposta da IA veio em formato inesperado.',
    fotos_demais: 'Envie no máximo 6 fotos por registro.',
    foto_invalida: 'Foto fora da sua pasta de envio.',
    gps_invalido: 'Localização GPS inválida.'
  };
  function erro(e) {
    var m = (e && (e.hint || MSG[e.message] || e.message)) || 'Não foi possível concluir. Tente de novo.';
    var rede = /Failed to fetch|NetworkError|Load failed|network request failed/i.test(m);
    if (rede) m = 'Sem conexão com o servidor. Verifique a internet e tente de novo.';
    var x = new Error(m); x.codigo = e && (e.code || e.message); x.rede = rede; return x;
  }
  function ms(v) { return v ? new Date(v).getTime() : null; }

  /* ---------- Normalização (nomes do banco -> nomes do painel) ---------- */
  function evento(r) {
    return { id: r.id, numero: r.numero_formatado, local: r.local, descricao: r.descricao, status: r.status,
      criadoEm: ms(r.criado_em), concluidoEm: ms(r.concluido_em), segundos: Number(r.segundos || 0),
      criadoPorNome: r.criado_por_nome || '', triagemCategoria: r.triagem_categoria || null,
      triagemObservacao: r.triagem_observacao || '', triagemEm: ms(r.triagem_em),
      ocorrenciaId: r.ocorrencia_id || null, qtdFotos: r.qtd_fotos || 0,
      latitude: r.latitude == null ? null : Number(r.latitude), longitude: r.longitude == null ? null : Number(r.longitude) };
  }
  function ocorrencia(r) {
    return { id: r.id, numero: r.numero_formatado, eventoId: r.evento_id, eventoNumero: r.evento_numero_formatado,
      local: r.local, descricao: r.descricao, tipo: r.tipo, subtipo: r.subtipo || '', forma: r.forma_conhecimento || null,
      fatoEm: ms(r.fato_em), analiseMesa: r.analise_mesa || '', status: r.status, boletimExiste: r.boletim_existe,
      boletimNumero: r.boletim_numero || '', classificacao: r.classificacao || null, classificadoEm: ms(r.classificado_em),
      criadoEm: ms(r.criado_em), concluidoEm: ms(r.concluido_em), segundos: Number(r.segundos || 0),
      qtdAnalises: r.qtd_analises || 0, qtdIa: r.qtd_ia || 0, criadoPorNome: r.criado_por_nome || '' };
  }
  function limparBusca(s) { return String(s || '').replace(/[,()%*\\"']/g, ' ').trim(); }
  function inicioPeriodo(p) {
    var d = new Date(); d.setHours(0, 0, 0, 0);
    if (p === 'hoje') return d;
    if (p === '7d') { d.setDate(d.getDate() - 6); return d; }
    if (p === '30d') { d.setDate(d.getDate() - 29); return d; }
    return null;
  }

  /* ====================================================================
     SUPABASE
     ==================================================================== */
  function criarSupabase() {
    var sb = null, carregando = null;
    function lib() {
      if (sb) return Promise.resolve(sb);
      if (carregando) return carregando;
      carregando = new Promise(function (res, rej) {
        function pronto() { sb = window.supabase.createClient(C.SUPABASE_URL, C.SUPABASE_ANON_KEY, { auth: { persistSession: true, autoRefreshToken: true } }); res(sb); }
        if (window.supabase && window.supabase.createClient) return pronto();
        var s = document.createElement('script');
        s.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.js';
        s.onload = pronto; s.onerror = function () { rej(new Error('Não foi possível carregar a biblioteca do Supabase.')); };
        document.head.appendChild(s);
      });
      return carregando;
    }
    function ok(r) { if (r.error) throw erro(r.error); return r.data; }
    var api = {
      modo: 'supabase',
      async iniciar() {
        var c = await lib(); var s = ok(await c.auth.getSession());
        if (!s.session) return { logado: false };
        return api.perfil(s.session.user);
      },
      async perfil(user) {
        var c = await lib();
        var r = await c.from('perfis').select('nome,perfil,ativo,email').eq('id', user.id).maybeSingle();
        var p = ok(r);
        if (!p || !p.ativo) return { logado: true, usuario: { nome: (p && p.nome) || user.email, email: user.email, perfil: null } };
        return { logado: true, usuario: { nome: p.nome || user.email, email: user.email, perfil: p.perfil } };
      },
      async entrar(email, senha) {
        var c = await lib(); var r = await c.auth.signInWithPassword({ email: email, password: senha });
        if (r.error) { var e = new Error(/Invalid login/i.test(r.error.message) ? 'E-mail ou senha incorretos.' : r.error.message); throw e; }
        return api.perfil(r.data.user);
      },
      async sair() { var c = await lib(); await c.auth.signOut(); },
      async tipos() {
        var c = await lib();
        var t = ok(await c.from('tipos_ocorrencia').select('nome').eq('ativo', true).order('nome'));
        var s = ok(await c.from('subtipos_ocorrencia').select('tipo,nome').eq('ativo', true).order('nome'));
        var sub = {}; s.forEach(function (x) { (sub[x.tipo] = sub[x.tipo] || []).push(x.nome); });
        return { tipos: t.map(function (x) { return x.nome; }), subtipos: sub };
      },
      async listarEventos(f) { return listar('v_fila_eventos', f, evento, ['local', 'descricao', 'numero_formatado', 'criado_por_nome']); },
      async listarOcorrencias(f) { return listar('v_fila_ocorrencias', f, ocorrencia, ['local', 'descricao', 'numero_formatado', 'tipo', 'subtipo', 'evento_numero_formatado']); },
      async detalheEvento(id) {
        var c = await lib();
        var e = ok(await c.from('v_fila_eventos').select('*').eq('id', id).maybeSingle());
        if (!e) throw erro({ message: 'evento_nao_encontrado' });
        return { evento: evento(e), fotos: await fotos(c, id) };
      },
      async detalheOcorrencia(id) {
        var c = await lib();
        var o = ok(await c.from('v_fila_ocorrencias').select('*').eq('id', id).maybeSingle());
        if (!o) throw erro({ message: 'ocorrencia_nao_encontrada' });
        var an = ok(await c.from('ocorrencia_analises').select('texto,criado_em,criado_por').eq('ocorrencia_id', id).order('criado_em'));
        // Análises de IA: só inteligência e admin enxergam (as regras do banco devolvem lista vazia para os demais).
        var ia = ok(await c.from('ocorrencia_ia').select('resultado,modelo,criado_em,criado_por').eq('ocorrencia_id', id).order('criado_em', { ascending: false }).limit(5));
        var ids = Array.from(new Set(an.map(function (x) { return x.criado_por; }).concat(ia.map(function (x) { return x.criado_por; })).filter(Boolean)));
        var nomes = {};
        if (ids.length) ok(await c.from('perfis').select('id,nome').in('id', ids)).forEach(function (p) { nomes[p.id] = p.nome; });
        return { ocorrencia: ocorrencia(o), analises: an.map(function (x) { return { texto: x.texto, em: ms(x.criado_em), autor: nomes[x.criado_por] || 'Usuário' }; }),
          ia: ia.map(function (x) { return { em: ms(x.criado_em), autor: nomes[x.criado_por] || 'Usuário', modelo: x.modelo || '', resultado: x.resultado }; }),
          fotos: await fotos(c, o.evento_id) };
      },
      async kpisEventos(prazoH) {
        var c = await lib(); var r = ok(await c.rpc('kpis_central', { p_atencao_horas: prazoH }));
        var k = (Array.isArray(r) ? r[0] : r) || {};
        return { aguardando: k.aguardando || 0, foraPrazo: k.fora_prazo || 0, concluidosHoje: k.concluidos_hoje || 0,
          tempoMedioSeg: k.tempo_medio_segundos == null ? null : Number(k.tempo_medio_segundos),
          maisAntigoSeg: k.mais_antigo_segundos == null ? null : Number(k.mais_antigo_segundos) };
      },
      async kpisOcorrencias() {
        var c = await lib(), hoje = inicioPeriodo('hoje').toISOString();
        function cont(q) { return q.then(function (r) { if (r.error) throw erro(r.error); return r.count || 0; }); }
        var base = function () { return c.from('v_fila_ocorrencias').select('id', { count: 'exact', head: true }); };
        var r = await Promise.all([cont(base().eq('status', 'ag_classificacao')), cont(base().eq('status', 'em_andamento')), cont(base().eq('status', 'concluido').gte('concluido_em', hoje))]);
        return { agClassificacao: r[0], emAndamento: r[1], concluidasHoje: r[2] };
      },
      async triarCriminal(a) {
        var c = await lib();
        ok(await c.rpc('triar_evento_criminal', { p_evento_id: a.eventoId, p_tipo: a.tipo, p_subtipo: a.subtipo || null,
          p_forma: a.forma || null, p_fato_em: new Date(a.fatoEm).toISOString(), p_analise_mesa: a.analiseMesa || null }));
      },
      async finalizar(a) { var c = await lib(); ok(await c.rpc('finalizar_evento', { p_evento_id: a.eventoId, p_categoria: a.categoria, p_observacao: a.observacao })); },
      async adicionarAnalise(a) { var c = await lib(); ok(await c.rpc('adicionar_analise', { p_ocorrencia_id: a.ocorrenciaId, p_texto: a.texto })); },
      async usuarioId() { var c = await lib(); var r = ok(await c.auth.getSession()); return r.session ? r.session.user.id : null; },
      offline: function () { return false; },
      simularOffline: function () {},
      // Registro do campo. Idempotente: o mesmo clientId nunca cria dois eventos, mesmo que o envio seja repetido.
      async registrarEvento(a) {
        var c = await lib(), uid = await api.usuarioId(), bucket = C.BUCKET || 'evidencias', caminhos = [];
        for (var i = 0; i < (a.fotos || []).length; i++) {
          var caminho = uid + '/' + a.clientId + '-' + (i + 1) + '.jpg';
          var up = await c.storage.from(bucket).upload(caminho, a.fotos[i], { contentType: 'image/jpeg', upsert: false });
          // foto que já subiu em uma tentativa anterior não é erro
          if (up.error && !/already exists|duplicate|409/i.test(String(up.error.message || '') + String(up.error.statusCode || ''))) throw erro(up.error);
          caminhos.push(caminho);
        }
        var r = ok(await c.rpc('registrar_evento', { p_local: a.local, p_descricao: a.descricao, p_fotos: caminhos, p_client_id: a.clientId,
          p_registrado_em: new Date(a.registradoEm).toISOString(), p_latitude: a.lat == null ? null : a.lat, p_longitude: a.lon == null ? null : a.lon }));
        return { id: r.id, numero: ('000' + r.numero).slice(-4) + ' / ' + r.ano };
      },
      async resumoInteligencia() {
        var c = await lib(); var r = ok(await c.rpc('resumo_inteligencia', { p_dias: 30 })) || {};
        function num(x) { return x == null ? null : Number(x); }
        return { agClassificacao: r.ag_classificacao || 0, emAndamento: r.em_andamento || 0, semBoletim: r.sem_boletim || 0, concluidasHoje: r.concluidas_hoje || 0,
          tempoMedioSeg: num(r.tempo_medio_segundos), maisAntigaSeg: num(r.mais_antiga_segundos),
          porTipo: (r.por_tipo || []).map(function (x) { return { nome: x.nome, total: x.total }; }),
          porClassificacao: (r.por_classificacao || []).map(function (x) { return { nome: x.nome, total: x.total }; }) };
      },
      async responderBoletim(a) { var c = await lib(); ok(await c.rpc('responder_boletim', { p_ocorrencia_id: a.ocorrenciaId, p_existe: a.existe, p_numero: a.numero || null })); },
      async classificar(a) { var c = await lib(); ok(await c.rpc('classificar_ocorrencia', { p_ocorrencia_id: a.ocorrenciaId, p_classificacao: a.classificacao })); },
      async concluir(a) { var c = await lib(); ok(await c.rpc('concluir_ocorrencia', { p_ocorrencia_id: a.ocorrenciaId })); },
      async analisarIA(a) {
        var c = await lib(); var r = await c.functions.invoke('analisar-ocorrencia', { body: { ocorrencia_id: a.ocorrenciaId } });
        if (r.error) {
          var msg = 'A análise por IA não respondeu. Tente de novo.';
          try { var j = await r.error.context.json(); if (j && j.erro) msg = j.erro; } catch (e) { /* usa a mensagem padrão */ }
          throw erro({ hint: msg });
        }
        return r.data;
      },
      assinar(cb, estado) {
        var canal = null, vivo = true;
        lib().then(function (c) {
          if (!vivo) return;
          canal = c.channel('painel-central')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'eventos' }, function () { cb('eventos'); })
            .on('postgres_changes', { event: '*', schema: 'public', table: 'ocorrencias' }, function () { cb('ocorrencias'); })
            .subscribe(function (st) { if (estado) estado(st === 'SUBSCRIBED'); });
        }).catch(function () { if (estado) estado(false); });
        return function () { vivo = false; if (canal && sb) sb.removeChannel(canal); };
      }
    };
    async function fotos(c, eventoId) {
      var r = ok(await c.from('evento_fotos').select('storage_path').eq('evento_id', eventoId).order('criado_em'));
      if (!r.length) return [];
      var s = ok(await c.storage.from(C.BUCKET || 'evidencias').createSignedUrls(r.map(function (x) { return x.storage_path; }), 3600));
      return s.filter(function (x) { return x.signedUrl; }).map(function (x) { return x.signedUrl; });
    }
    async function listar(vista, f, mapa, camposBusca) {
      var c = await lib(), de = (f.pagina - 1) * f.porPagina;
      var q = c.from(vista).select('*', { count: 'exact' });
      if (f.somenteMeus) { var sess = ok(await c.auth.getSession()); if (sess.session) q = q.eq('criado_por', sess.session.user.id); }
      if (f.status) q = q.eq('status', f.status);
      var b = limparBusca(f.busca);
      if (b) q = q.or(camposBusca.map(function (k) { return k + '.ilike.%' + b + '%'; }).join(','));
      var ini = inicioPeriodo(f.periodo); if (ini) q = q.gte('criado_em', ini.toISOString());
      q = q.order('grupo', { ascending: true }).order('chave_ordem', { ascending: true }).range(de, de + f.porPagina - 1);
      var r = await q; if (r.error) throw erro(r.error);
      return { linhas: (r.data || []).map(mapa), total: r.count || 0 };
    }
    return api;
  }

  /* ====================================================================
     DEMONSTRAÇÃO (dados fictícios em memória, mesmas regras do banco)
     ==================================================================== */
  function criarDemo() {
    var H = 3600000, M = 60000, agora = Date.now();
    var seq = { evento: {}, ocorrencia: {} };
    var TIPOS = ['ABERTURA', 'ACIDENTE', 'APREENSÃO', 'ATAQUE A FUNCIONÁRIOS E COLABORADORES', 'ATAQUE ÀS EQUIPES DE SEGURANÇA', 'CABOS', 'DANO', 'PREVENÇÃO'];
    var SUB = { 'APREENSÃO': ['CARGA/GRÃOS', 'COMBUSTÍVEL', 'MATERIAL LOGÍSTICO', 'PEÇAS DA COMPOSIÇÃO', 'MATERIAL DE FIXAÇÃO DE TRILHO', 'DOCUMENTOS'] };
    var usuario = { nome: 'Operador (demonstração)', email: 'demo@exemplo.com', perfil: 'admin' };
    var eventos = [], ocorrencias = [], analises = [], atraso = 180;
    function num(tipo, ts) { var a = new Date(ts).getFullYear(); seq[tipo][a] = (seq[tipo][a] || 0) + 1; return { ano: a, n: seq[tipo][a], txt: ('000' + seq[tipo][a]).slice(-4) + ' / ' + a }; }
    function foto(t, cor) { return 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="320" height="320"><rect width="320" height="320" fill="' + cor + '"/><text x="160" y="170" font-family="Arial" font-size="18" fill="#fff" text-anchor="middle">' + t + '</text></svg>'); }
    function novoEvento(local, desc, atras, por, nf) {
      var t = agora - atras, nm = num('evento', t);
      var e = { id: 'ev' + (eventos.length + 1), numero: nm.txt, local: local, descricao: desc, status: 'aguardando', criadoEm: t, concluidoEm: null,
        criadoPorNome: por, triagemCategoria: null, triagemObservacao: '', triagemEm: null, ocorrenciaId: null, nFotos: nf || 0 };
      eventos.push(e); return e;
    }
    var simOff = false, clientes = {};
    function concluir(e, quando) { e.status = 'concluido'; e.concluidoEm = agora - quando; e.triagemEm = e.concluidoEm; }
    function novaOcorrencia(e, o) {
      var t = e.concluidoEm || agora, nm = num('ocorrencia', t);
      var x = Object.assign({ id: 'oc' + (ocorrencias.length + 1), numero: nm.txt, eventoId: e.id, eventoNumero: e.numero, local: e.local, descricao: e.descricao,
        subtipo: '', forma: null, fatoEm: e.criadoEm, analiseMesa: '', status: 'ag_classificacao', boletimExiste: null, boletimNumero: '',
        classificacao: null, classificadoEm: null, criadoEm: t, concluidoEm: null, criadoPorNome: usuario.nome }, o);
      ocorrencias.push(x); e.ocorrenciaId = x.id; return x;
    }
    // semente
    var e1 = novoEvento('Trecho 0, km 89+900', 'Cabos cortados entre dois vagões de uma composição parada. Porta do armário elétrico da locomotiva aberta. Sem pessoas no local.', 9 * H + 12 * M, 'Marcos Lima', 3);
    novoEvento('Pátio de Paratinga', 'Material de fixação de trilho encontrado na faixa de domínio, próximo à linha 2.', 3 * H + 50 * M, 'Paula Reis', 2);
    var e3 = novoEvento('Passagem em nível, km 14+841', 'Cancela quebrada por veículo. Condutor deixou o local. Sem feridos.', 35 * M, usuario.nome, 1); e3.latitude = -23.9608; e3.longitude = -46.3336;
    novoEvento('ZLI-Limeira, km 103+200', 'Pessoas na via férrea próximo ao cruzamento, retiradas pela equipe de segurança.', 1 * H + 40 * M, 'Paula Reis', 0);
    novoEvento('Santos, km 14+000', 'Vazamento de óleo na via, aproximadamente 2 m².', 30 * H + 5 * M, 'Marcos Lima', 2);
    novoEvento('ZKE-Canguera, km 78+900', 'Alarme de intrusão disparado no abrigo de equipamentos.', 14 * M, usuario.nome, 0);
    var e7 = novoEvento('ZWU-Acaraú', 'Furto de cabos de sinalização. Equipe de segurança acionada.', 31 * H, 'Marcos Lima', 2); concluir(e7, 29 * H);
    e7.triagemCategoria = 'criminal';
    var o1 = novaOcorrencia(e7, { tipo: 'CABOS', forma: 'flagrante', fatoEm: agora - 31 * H, analiseMesa: 'Equipe de segurança acionada. Local isolado.', status: 'em_andamento', criadoEm: agora - 29 * H });
    analises.push({ ocorrenciaId: o1.id, texto: 'Local isolado, sem testemunhas. Registro de imagens solicitado.', em: agora - 28 * H, autor: 'Operador Central' });
    var e8 = novoEvento('TGR-Agrenco', 'Desgaste excessivo na roda de um vagão.', 50 * H, 'Paula Reis', 1); concluir(e8, 47 * H);
    e8.triagemCategoria = 'mecanico'; e8.triagemObservacao = 'Vagão encaminhado para a manutenção da oficina.';
    var e9 = novoEvento('Trecho 0', 'Apreensão de material de fixação de trilho.', 75 * H, 'Marcos Lima', 1); concluir(e9, 70 * H); e9.triagemCategoria = 'criminal';
    var o2 = novaOcorrencia(e9, { tipo: 'APREENSÃO', subtipo: 'MATERIAL DE FIXAÇÃO DE TRILHO', forma: 'solicitacao', fatoEm: agora - 75 * H, status: 'concluido',
      boletimExiste: false, classificacao: 'prevencao', classificadoEm: agora - 60 * H, concluidoEm: agora - 59 * H, criadoEm: agora - 70 * H });
    analises.push({ ocorrenciaId: o2.id, texto: 'Material recolhido e entregue à equipe de manutenção.', em: agora - 69 * H, autor: 'Operador Central' });
    var e10 = novoEvento('ZPT-Paratinga', 'Dano em cancela de passagem.', 6 * H, usuario.nome, 0); concluir(e10, 5 * H); e10.triagemCategoria = 'criminal';
    novaOcorrencia(e10, { tipo: 'DANO', forma: 'solicitacao', fatoEm: agora - 6 * H, criadoEm: agora - 5 * H });
    var e11 = novoEvento('Trecho 3', 'Árvore caída sobre a via após temporal.', 26 * H, 'Marcos Lima', 1); concluir(e11, 24 * H);
    e11.triagemCategoria = 'natural'; e11.triagemObservacao = 'Árvore removida pela equipe de via permanente.';
    var e12 = novoEvento('ZVP-Votuporanga', 'Conflito com morador na faixa de domínio.', 20 * H, 'Paula Reis', 0); concluir(e12, 19 * H);
    e12.triagemCategoria = 'social'; e12.triagemObservacao = 'Morador orientado; ocorrência registrada no livro da equipe.';
    var e13 = novoEvento('ZJP-Jacauna', 'Hot box detectado em vagão, trem retido.', 12 * H, 'Marcos Lima', 1); concluir(e13, 11 * H);
    e13.triagemCategoria = 'mecanico'; e13.triagemObservacao = 'Vagão retirado da composição.';

    // mais casos para a visão da inteligência (cada um nasce de um evento criminal)
    function caso(local, desc, regH, tipo, sub, forma, o) {
      var e = novoEvento(local, desc, regH * H, 'Marcos Lima', 1); concluir(e, (regH - 0.5) * H); e.triagemCategoria = 'criminal';
      var x = novaOcorrencia(e, Object.assign({ tipo: tipo, subtipo: sub || '', forma: forma, fatoEm: agora - regH * H, criadoEm: agora - (regH - 0.5) * H }, o || {})); return x;
    }
    caso('ZJP-Jacauna, km 51+200', 'Cabos de sinalização subtraídos em trecho de 30 m. Sem testemunhas.', 2, 'CABOS', '', 'flagrante');
    var c5 = caso('Passagem em nível, km 22+100', 'Colisão de caminhão com composição vazia. Condutor ferido levado ao pronto-socorro. Sem vazamentos.', 8, 'ACIDENTE', '', 'solicitacao', { status: 'em_andamento', boletimExiste: true, boletimNumero: 'BO 457/2026', analiseMesa: 'SAMU acionado, via interditada por 40 min.' });
    analises.push({ ocorrenciaId: c5.id, texto: 'Boletim registrado pelo condutor. Aguardando laudo da perícia.', em: agora - 6 * H, autor: 'Operador Central' });
    caso('ZSD-Santa Adélia', 'Ataque a equipe de segurança com pedras durante ronda. Dois vigilantes com escoriações.', 20, 'ATAQUE ÀS EQUIPES DE SEGURANÇA', '', 'flagrante');
    var c8 = caso('Trecho 3, km 120+000', 'Porta de abrigo de equipamentos arrombada. Itens não conferidos.', 120, 'ABERTURA', '', 'denuncia', { status: 'concluido', boletimExiste: false, classificacao: 'social', classificadoEm: agora - 100 * H, concluidoEm: agora - 99 * H });
    analises.push({ ocorrenciaId: c8.id, texto: 'Nada subtraído. Fechadura trocada.', em: agora - 110 * H, autor: 'Operador Central' });
    caso('ZMA-Matão, km 42', 'Furto de cabos de energia do desvio ferroviário.', 200, 'CABOS', '', 'flagrante', { status: 'concluido', boletimExiste: true, boletimNumero: 'BO 311/2026', classificacao: 'criminal', classificadoEm: agora - 180 * H, concluidoEm: agora - 175 * H });
    caso('Santos, km 14+000', 'Combustível retirado de tanque de locomotiva parada no pátio.', 280, 'APREENSÃO', 'COMBUSTÍVEL', 'flagrante', { status: 'concluido', boletimExiste: true, boletimNumero: 'BO 288/2026', classificacao: 'criminal', classificadoEm: agora - 260 * H, concluidoEm: agora - 255 * H });
    caso('ZVP-Votuporanga', 'Cancela danificada por veículo de terceiros.', 330, 'DANO', '', 'solicitacao', { status: 'concluido', boletimExiste: false, classificacao: 'mecanica', classificadoEm: agora - 300 * H, concluidoEm: agora - 290 * H });
    caso('Trecho 0', 'Apreensão de material de fixação de trilho com sucateiro.', 400, 'APREENSÃO', 'MATERIAL DE FIXAÇÃO DE TRILHO', 'solicitacao', { status: 'concluido', boletimExiste: true, boletimNumero: 'BO 244/2026', classificacao: 'criminal', classificadoEm: agora - 380 * H, concluidoEm: agora - 370 * H });
    var iaLista = [];

    function lat(v) { return new Promise(function (r) { setTimeout(function () { r(v); }, atraso); }); }
    function segs(x) { return Math.floor(((x.concluidoEm || Date.now()) - x.criadoEm) / 1000); }
    function ev(e) { return Object.assign({}, e, { segundos: segs(e), qtdFotos: e.nFotos }); }
    function oc(o) { return Object.assign({}, o, { segundos: segs(o), qtdAnalises: analises.filter(function (a) { return a.ocorrenciaId === o.id; }).length, qtdIa: iaLista.filter(function (i) { return i.ocorrenciaId === o.id; }).length }); }
    function filtrar(lista, f, campos, grupoConcl) {
      var ini = inicioPeriodo(f.periodo), b = limparBusca(f.busca).toLowerCase();
      var r = lista.filter(function (x) {
        if (f.status && x.status !== f.status) return false;
        if (ini && x.criadoEm < ini.getTime()) return false;
        if (b && !campos.some(function (k) { return String(x[k] || '').toLowerCase().indexOf(b) >= 0; })) return false;
        return true;
      });
      r.sort(function (a, c) {
        var ga = a.status === grupoConcl ? 1 : 0, gc = c.status === grupoConcl ? 1 : 0;
        if (ga !== gc) return ga - gc;
        return ga ? (c.concluidoEm - a.concluidoEm) : (a.criadoEm - c.criadoEm);
      });
      return r;
    }
    function pagina(r, f, mapa) { var i = (f.pagina - 1) * f.porPagina; return { linhas: r.slice(i, i + f.porPagina).map(mapa), total: r.length }; }
    function falha(cod) { var e = new Error(cod); throw erro(e); }
    // Simulação simples só para mostrar a tela. NÃO é IA e não deve ser usada como orientação jurídica.
    function simularIA(o, an) {
      var t = [o.descricao, o.analiseMesa].concat(an.map(function (x) { return x.texto; })).join(' '), falta = [];
      if (!/km\s*\d|\d+\+\d+/i.test(o.local + ' ' + t)) falta.push('km');
      if (!/composi[cç][aã]o|vag[aã]o|locomotiva/i.test(t)) falta.push('composição ou vagão');
      if (!/matr[ií]cula|\bRE\s?\d|nome/i.test(t)) falta.push('identificação das pessoas');
      var nota = Math.max(1, Math.min(10, 4 + Math.floor(t.length / 70) - falta.length * 1)), semBo = ['PREVENÇÃO', 'ABERTURA', 'ACIDENTE'].indexOf(o.tipo) >= 0;
      var art = { CABOS: 'Art. 155, caput (furto)', DANO: 'Art. 163 (dano)', 'APREENSÃO': 'Art. 155 ou Art. 180, conforme a origem do material', 'ATAQUE ÀS EQUIPES DE SEGURANÇA': 'Art. 129 (lesão corporal)' }[o.tipo] || 'NÃO APLICÁVEL';
      var minuta = semBo ? '' : 'Na qualidade de representante da equipe de segurança da empresa RUMO, venho comunicar ' + o.tipo.toLowerCase() + (o.subtipo ? ' (' + o.subtipo.toLowerCase() + ')' : '') + ' ocorrido em ' + o.local + '. ' + o.descricao + ' Km: ' + (falta.indexOf('km') >= 0 ? '[NÃO INFORMADO]' : 'conforme o local') + '. Composição: ' + (falta.indexOf('composição ou vagão') >= 0 ? '[NÃO INFORMADO]' : 'conforme o registro') + '. Solicito o registro do boletim para as providências cabíveis.';
      return { qualidade: { nota: nota, justificativa: falta.length ? 'Faltam no registro: ' + falta.join(', ') + '.' : 'Registro com local, fato e identificação suficientes.' },
        viabilidade: { status: semBo ? 'SEM BO APLICÁVEL' : 'VIÁVEL PARA BO', justificativa: semBo ? 'O tipo registrado não configura fato que exija boletim.' : 'Há fato material descrito no registro.' },
        tipificacao: { artigo: semBo ? 'NÃO APLICÁVEL' : art, fundamento: 'Simulação do modo demonstração, sem IA real. Não use como orientação jurídica.' },
        minuta: minuta.slice(0, 1200), naoInformado: falta };
    }

    var api = {
      modo: 'demo',
      iniciar: function () { return lat({ logado: true, usuario: usuario }); },
      entrar: function () { return lat({ logado: true, usuario: usuario }); },
      sair: function () { return lat(); },
      tipos: function () { return lat({ tipos: TIPOS.slice(), subtipos: JSON.parse(JSON.stringify(SUB)) }); },
      listarEventos: function (f) { var base = f.somenteMeus ? eventos.filter(function (e) { return e.criadoPorNome === usuario.nome; }) : eventos; return lat(pagina(filtrar(base, f, ['local', 'descricao', 'numero', 'criadoPorNome'], 'concluido'), f, ev)); },
      listarOcorrencias: function (f) { return lat(pagina(filtrar(ocorrencias, f, ['local', 'descricao', 'numero', 'tipo', 'subtipo', 'eventoNumero'], 'concluido'), f, oc)); },
      detalheEvento: function (id) {
        var e = eventos.filter(function (x) { return x.id === id; })[0]; if (!e) falha('evento_nao_encontrado');
        var cores = ['#164A6B', '#0B2942', '#667085'];
        return lat({ evento: ev(e), fotos: e.fotosUrls || Array.from({ length: e.nFotos }, function (_, i) { return foto('Foto ' + (i + 1) + ' (demonstração)', cores[i % 3]); }) });
      },
      detalheOcorrencia: function (id) {
        var o = ocorrencias.filter(function (x) { return x.id === id; })[0]; if (!o) falha('ocorrencia_nao_encontrada');
        var e = eventos.filter(function (x) { return x.id === o.eventoId; })[0], cores = ['#164A6B', '#0B2942', '#667085'];
        return lat({ ocorrencia: oc(o), analises: analises.filter(function (a) { return a.ocorrenciaId === id; }),
          ia: iaLista.filter(function (i) { return i.ocorrenciaId === id; }).sort(function (a, b) { return b.em - a.em; }),
          fotos: Array.from({ length: e ? e.nFotos : 0 }, function (_, i) { return foto('Foto ' + (i + 1) + ' (demonstração)', cores[i % 3]); }) });
      },
      kpisEventos: function (prazoH) {
        var ag = eventos.filter(function (e) { return e.status === 'aguardando'; }), hoje = inicioPeriodo('hoje').getTime();
        var conc = eventos.filter(function (e) { return e.status === 'concluido' && e.concluidoEm > Date.now() - 30 * 24 * H; });
        var med = conc.length ? Math.round(conc.reduce(function (s, e) { return s + (e.concluidoEm - e.criadoEm); }, 0) / conc.length / 1000) : null;
        return lat({ aguardando: ag.length, foraPrazo: ag.filter(function (e) { return Date.now() - e.criadoEm > prazoH * H; }).length,
          concluidosHoje: eventos.filter(function (e) { return e.status === 'concluido' && e.concluidoEm >= hoje; }).length, tempoMedioSeg: med,
          maisAntigoSeg: ag.length ? Math.floor((Date.now() - Math.min.apply(null, ag.map(function (e) { return e.criadoEm; }))) / 1000) : null });
      },
      kpisOcorrencias: function () {
        var hoje = inicioPeriodo('hoje').getTime();
        return lat({ agClassificacao: ocorrencias.filter(function (o) { return o.status === 'ag_classificacao'; }).length,
          emAndamento: ocorrencias.filter(function (o) { return o.status === 'em_andamento'; }).length,
          concluidasHoje: ocorrencias.filter(function (o) { return o.status === 'concluido' && o.concluidoEm >= hoje; }).length });
      },
      triarCriminal: function (a) {
        var e = eventos.filter(function (x) { return x.id === a.eventoId; })[0]; if (!e) falha('evento_nao_encontrado');
        if (e.status !== 'aguardando') falha('evento_ja_concluido');
        if (TIPOS.indexOf(a.tipo) < 0) falha('tipo_invalido');
        var subs = SUB[a.tipo];
        if (subs && subs.indexOf(a.subtipo) < 0) falha('subtipo_invalido');
        if (!a.fatoEm) falha('dados_incompletos');
        var agoraT = Date.now(); e.status = 'concluido'; e.concluidoEm = agoraT; e.triagemEm = agoraT; e.triagemCategoria = 'criminal';
        var nm = num('ocorrencia', agoraT);
        var o = { id: 'oc' + (ocorrencias.length + 1), numero: nm.txt, eventoId: e.id, eventoNumero: e.numero, local: e.local, descricao: e.descricao, tipo: a.tipo,
          subtipo: subs ? a.subtipo : '', forma: a.forma || null, fatoEm: a.fatoEm, analiseMesa: (a.analiseMesa || '').trim(), status: 'ag_classificacao',
          boletimExiste: null, boletimNumero: '', classificacao: null, classificadoEm: null, criadoEm: agoraT, concluidoEm: null, criadoPorNome: usuario.nome };
        ocorrencias.push(o); e.ocorrenciaId = o.id; return lat();
      },
      finalizar: function (a) {
        var e = eventos.filter(function (x) { return x.id === a.eventoId; })[0]; if (!e) falha('evento_nao_encontrado');
        if (a.categoria === 'criminal') falha('use_triagem_criminal');
        if (!String(a.observacao || '').trim()) falha('dados_incompletos');
        if (e.status !== 'aguardando') falha('evento_ja_concluido');
        e.status = 'concluido'; e.concluidoEm = Date.now(); e.triagemEm = e.concluidoEm; e.triagemCategoria = a.categoria; e.triagemObservacao = a.observacao.trim();
        return lat();
      },
      adicionarAnalise: function (a) {
        var o = ocorrencias.filter(function (x) { return x.id === a.ocorrenciaId; })[0]; if (!o) falha('ocorrencia_nao_encontrada');
        if (o.status === 'concluido') falha('ocorrencia_concluida');
        if (!String(a.texto || '').trim()) falha('dados_incompletos');
        analises.push({ ocorrenciaId: o.id, texto: a.texto.trim(), em: Date.now(), autor: usuario.nome });
        if (o.status === 'ag_classificacao') o.status = 'em_andamento';
        return lat();
      },
      usuarioId: function () { return 'demo-usuario'; },
      offline: function () { return simOff; },
      simularOffline: function (v) { simOff = !!v; },
      registrarEvento: function (a) {
        if (clientes[a.clientId]) return lat({ id: clientes[a.clientId].id, numero: clientes[a.clientId].numero });
        if (!String(a.local || '').trim() || !String(a.descricao || '').trim()) falha('dados_incompletos');
        if ((a.fotos || []).length > 6) falha('fotos_demais');
        var t = a.registradoEm || Date.now(); if (t > Date.now() + 5 * M || t < Date.now() - 30 * 24 * H) t = Date.now();
        var nm = num('evento', t), e = { id: 'ev' + (eventos.length + 1), numero: nm.txt, local: a.local.trim(), descricao: a.descricao.trim(), status: 'aguardando', criadoEm: Math.min(t, Date.now()),
          concluidoEm: null, criadoPorNome: usuario.nome, triagemCategoria: null, triagemObservacao: '', triagemEm: null, ocorrenciaId: null, nFotos: (a.fotos || []).length,
          latitude: a.lat == null ? null : a.lat, longitude: a.lon == null ? null : a.lon,
          fotosUrls: (a.fotos || []).map(function (b) { return typeof URL !== 'undefined' && URL.createObjectURL ? URL.createObjectURL(b) : ''; }).filter(Boolean) };
        eventos.push(e); clientes[a.clientId] = { id: e.id, numero: e.numero };
        return new Promise(function (r) { setTimeout(function () { r({ id: e.id, numero: e.numero }); }, 700); });
      },
      resumoInteligencia: function () {
        var hoje = inicioPeriodo('hoje').getTime(), lim = Date.now() - 30 * 24 * H, abertas = ocorrencias.filter(function (o) { return o.status !== 'concluido'; });
        var conc = ocorrencias.filter(function (o) { return o.status === 'concluido' && o.concluidoEm > lim; }), tipos = {}, cls = {};
        ocorrencias.filter(function (o) { return o.criadoEm > lim; }).forEach(function (o) { tipos[o.tipo] = (tipos[o.tipo] || 0) + 1; });
        ocorrencias.filter(function (o) { return o.classificacao && o.classificadoEm > lim; }).forEach(function (o) { cls[o.classificacao] = (cls[o.classificacao] || 0) + 1; });
        function lista(m) { return Object.keys(m).map(function (k) { return { nome: k, total: m[k] }; }).sort(function (a, b) { return b.total - a.total || (a.nome < b.nome ? -1 : 1); }); }
        return lat({ agClassificacao: ocorrencias.filter(function (o) { return o.status === 'ag_classificacao'; }).length, emAndamento: ocorrencias.filter(function (o) { return o.status === 'em_andamento'; }).length,
          semBoletim: abertas.filter(function (o) { return o.boletimExiste == null; }).length,
          concluidasHoje: ocorrencias.filter(function (o) { return o.status === 'concluido' && o.concluidoEm >= hoje; }).length,
          tempoMedioSeg: conc.length ? Math.round(conc.reduce(function (s, o) { return s + (o.concluidoEm - o.criadoEm); }, 0) / conc.length / 1000) : null,
          maisAntigaSeg: abertas.length ? Math.floor((Date.now() - Math.min.apply(null, abertas.map(function (o) { return o.criadoEm; }))) / 1000) : null,
          porTipo: lista(tipos).slice(0, 8), porClassificacao: lista(cls) });
      },
      responderBoletim: function (a) {
        var o = ocorrencias.filter(function (x) { return x.id === a.ocorrenciaId; })[0]; if (!o || o.status === 'concluido') falha('ocorrencia_nao_encontrada');
        if (a.existe == null) falha('dados_incompletos');
        if (a.existe && !String(a.numero || '').trim()) falha('dados_incompletos');
        o.boletimExiste = !!a.existe; o.boletimNumero = a.existe ? a.numero.trim() : ''; return lat();
      },
      classificar: function (a) {
        var o = ocorrencias.filter(function (x) { return x.id === a.ocorrenciaId; })[0]; if (!o) falha('ocorrencia_nao_encontrada');
        if (o.classificacao) falha('ja_classificada');
        if (o.status === 'concluido') falha('ocorrencia_concluida');
        if (o.boletimExiste == null) falha('responda_boletim');
        o.classificacao = a.classificacao; o.classificadoEm = Date.now(); if (o.status === 'ag_classificacao') o.status = 'em_andamento'; return lat();
      },
      concluir: function (a) {
        var o = ocorrencias.filter(function (x) { return x.id === a.ocorrenciaId; })[0]; if (!o) falha('ocorrencia_nao_encontrada');
        if (!o.classificacao) falha('classifique_antes');
        if (o.status === 'concluido') falha('ocorrencia_concluida');
        o.status = 'concluido'; o.concluidoEm = Date.now(); return lat();
      },
      analisarIA: function (a) {
        var o = ocorrencias.filter(function (x) { return x.id === a.ocorrenciaId; })[0]; if (!o) falha('ocorrencia_nao_encontrada');
        if (o.status === 'concluido') falha('ocorrencia_concluida');
        var ult = iaLista.filter(function (i) { return i.ocorrenciaId === o.id; }).sort(function (x, y) { return y.em - x.em; })[0];
        if (ult && Date.now() - ult.em < 15000) falha('ia_recente');
        var res = simularIA(o, analises.filter(function (x) { return x.ocorrenciaId === o.id; })), reg = { ocorrenciaId: o.id, em: Date.now(), autor: usuario.nome, modelo: 'simulação', resultado: res };
        return new Promise(function (r) { setTimeout(function () { iaLista.push(reg); r({ ok: true, ia: reg }); }, 1400); });
      },
      assinar: function (cb, estado) { if (estado) setTimeout(function () { estado(true); }, 300); return function () {}; }
    };
    // Toda chamada devolve uma promessa (erros de validação viram rejeições), igual ao adaptador do Supabase.
    Object.keys(api).forEach(function (k) {
      var f = api[k]; if (typeof f !== 'function' || k === 'assinar' || k === 'offline' || k === 'simularOffline' || k === 'usuarioId') return;
      api[k] = function () {
        if (simOff && ['usuarioId', 'offline', 'simularOffline', 'iniciar', 'sair'].indexOf(k) < 0) return Promise.reject(erro(new Error('Failed to fetch')));
        try { return Promise.resolve(f.apply(null, arguments)); } catch (e) { return Promise.reject(e); }
      };
    });
    return api;
  }

  window.PainelData = MODO_DEMO ? criarDemo() : criarSupabase();
  window.PainelData.erro = erro;
})();
