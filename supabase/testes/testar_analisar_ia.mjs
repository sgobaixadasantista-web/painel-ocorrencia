// Teste da função analisar-ocorrencia (handler.ts) com o Supabase e a OpenAI simulados.
// Confere o catálogo de artigos (migration 018): a IA só vê e só pode escolher artigos do catálogo.
// Uso, numa pasta fora do projeto: npm i esbuild@0.24.0
//   node <projeto>/supabase/testes/testar_analisar_ia.mjs <projeto>/supabase
import * as esbuild from 'esbuild';
import fs from 'fs';
const [, , raiz] = process.argv;
const r = await esbuild.build({ entryPoints: [`${raiz}/functions/analisar-ocorrencia/handler.ts`], bundle: true, write: false, format: 'esm', platform: 'node' });
const h = await import('data:text/javascript,' + encodeURIComponent(r.outputFiles[0].text));
const catalogoBase = JSON.parse(fs.readFileSync(`${raiz}/dados/artigos-penais.json`, 'utf8')).artigos;

let ok = 0, f = 0; const conf = (n, c, x) => { if (c) ok++; else { f++; console.log('FALHA', n, JSON.stringify(x)?.slice(0, 400)); } };
const ID = '11111111-1111-4111-8111-111111111111';
const OC = { id: ID, status: 'em_andamento', tipo: 'FURTO', subtipo: 'CABOS', local: 'Trecho 1, km 10+000', descricao: 'Equipe localizou cabos cortados e levados.', analise_mesa: '' };

// Supabase simulado: perfil, ocorrência, análises, catálogo (ou erro de tabela inexistente) e salvar_analise_ia
function cliente(cfg) {
  const q = (tabela) => {
    const api = { _t: tabela, select() { return api; }, eq() { return api; }, order() { return api; }, maybeSingle() { return api; },
      then(res, rej) {
        let v;
        if (tabela === 'v_fila_ocorrencias') v = { data: OC, error: null };
        else if (tabela === 'ocorrencia_analises') v = { data: [], error: null };
        else if (tabela === 'artigos_penais') v = cfg.semTabela ? { data: null, error: { message: 'relation "public.artigos_penais" does not exist' } } : { data: cfg.catalogo, error: null };
        return Promise.resolve(v).then(res, rej);
      } };
    return api;
  };
  return {
    from: q,
    rpc: async (fn, args) => {
      if (fn === 'perfil_atual') return { data: cfg.perfil || 'inteligencia', error: null };
      if (fn === 'salvar_analise_ia') { cfg.salvo = args.p_resultado; return { data: { id: 'x', criado_em: 'agora' }, error: null }; }
      return { data: null, error: { message: 'rpc desconhecida' } };
    },
  };
}
async function chamar(cfg, respostaIA) {
  const deps = {
    env: (k) => ({ SUPABASE_URL: 'http://x', SUPABASE_ANON_KEY: 'anon', OPENAI_API_KEY: 'sk-teste' })[k],
    criarCliente: () => cliente(cfg),
    fetch: async (_url, init) => {
      cfg.pedido = JSON.parse(init.body);
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(respostaIA) } }] }), { status: 200 });
    },
  };
  const res = await h.handle(new Request('http://x', { method: 'POST', headers: { Authorization: 'Bearer tok' }, body: JSON.stringify({ ocorrencia_id: ID }) }), deps);
  return { s: res.status, b: await res.json(), cfg };
}
const resposta = (tipificacao) => ({ qualidade: { nota: 7, justificativa: 'ok' }, viabilidade: { status: 'VIÁVEL PARA BO', justificativa: 'ok' },
  tipificacao, minuta: 'Na qualidade de representante da equipe de segurança da empresa...', naoInformado: ['km'] });

let x;
// 1) com catálogo, código válido
x = await chamar({ catalogo: catalogoBase }, resposta({ codigo: 'CP_155', fundamento: 'Subtração de cabos.' }));
const sis = x.cfg.pedido.messages[0].content;
conf('prompt traz o catálogo inteiro', sis.includes('<catalogo>') && catalogoBase.every((a) => sis.includes(a.codigo + ' | ')), sis.slice(-300));
conf('prompt traz o caput oficial', sis.includes('Subtrair, para si ou para outrem, coisa alheia móvel'));
conf('prompt proíbe artigo fora da lista', /Nunca cite artigo fora da lista/.test(sis));
conf('código válido vira artigo do catálogo', x.s === 200 && x.cfg.salvo.tipificacao.codigo === 'CP_155' && x.cfg.salvo.tipificacao.artigo === 'Art. 155 do Código Penal — Furto', x.cfg.salvo);
conf('artigo aparece antes do código (ordem da tela)', Object.keys(x.cfg.salvo.tipificacao).join() === 'artigo,codigo,fundamento', x.cfg.salvo.tipificacao);

// 2) lei especial: rótulo com o nome da lei
x = await chamar({ catalogo: catalogoBase }, resposta({ codigo: 'l11343 33', fundamento: 'Droga apreendida.' }));
conf('código normalizado e rótulo da lei especial', x.cfg.salvo.tipificacao.codigo === 'L11343_33' && /^Art\. 33 da Lei nº 11\.343\/2006/.test(x.cfg.salvo.tipificacao.artigo), x.cfg.salvo.tipificacao);

// 3) NÃO APLICÁVEL (com ou sem acento)
x = await chamar({ catalogo: catalogoBase }, resposta({ codigo: 'NÃO_APLICÁVEL', fundamento: 'Fatos insuficientes.' }));
conf('NÃO APLICÁVEL aceito', x.cfg.salvo.tipificacao.artigo === 'NÃO APLICÁVEL' && x.cfg.salvo.tipificacao.codigo === 'NAO_APLICAVEL', x.cfg.salvo.tipificacao);

// 4) artigo fora do catálogo: grava, mas pede revisão manual e não usa o artigo inventado
x = await chamar({ catalogo: catalogoBase }, resposta({ codigo: 'CP_161', fundamento: 'Esbulho.' }));
conf('fora do catálogo: revisar manualmente', x.s === 200 && x.cfg.salvo.tipificacao.artigo === 'REVISAR MANUALMENTE' && x.cfg.salvo.tipificacao.codigo === '' && /não está no catálogo/.test(x.cfg.salvo.tipificacao.fundamento), x.cfg.salvo.tipificacao);
x = await chamar({ catalogo: catalogoBase }, resposta({ artigo: 'Art. 155 do Código Penal', fundamento: 'sem código' }));
conf('sem código (só texto livre): revisar manualmente', x.cfg.salvo.tipificacao.artigo === 'REVISAR MANUALMENTE', x.cfg.salvo.tipificacao);

// 5) artigo inativo não aparece no prompt nem é aceito
const semFurto = catalogoBase.filter((a) => a.codigo !== 'CP_155');
x = await chamar({ catalogo: semFurto }, resposta({ codigo: 'CP_155', fundamento: '...' }));
conf('artigo inativo fora do prompt e recusado', !x.cfg.pedido.messages[0].content.includes('CP_155 | ') && x.cfg.salvo.tipificacao.artigo === 'REVISAR MANUALMENTE', x.cfg.salvo.tipificacao);

// 6) sem a tabela (018 não aplicada): comportamento anterior, texto livre
x = await chamar({ semTabela: true }, resposta({ artigo: 'Art. 155 do Código Penal', fundamento: 'Subtração.' }));
conf('sem catálogo: prompt antigo, sem <catalogo>', !x.cfg.pedido.messages[0].content.includes('<catalogo>'));
conf('sem catálogo: artigo livre mantido', x.s === 200 && x.cfg.salvo.tipificacao.artigo === 'Art. 155 do Código Penal' && !('codigo' in x.cfg.salvo.tipificacao), x.cfg.salvo.tipificacao);

// 7) perfil sem permissão não chega à IA
x = await chamar({ catalogo: catalogoBase, perfil: 'campo' }, resposta({ codigo: 'CP_155' }));
conf('campo: 403 e nenhuma chamada à IA', x.s === 403 && !x.cfg.pedido, x.b);

console.log(`${ok} ok, ${f} falha(s)`);
process.exit(f ? 1 : 0);
