import { montarRegistro, extrairJson, validarResultado, handle } from './handler.ts';

function igual(atual: unknown, esperado: unknown, mensagem: string) {
  if (JSON.stringify(atual) !== JSON.stringify(esperado)) throw new Error(mensagem);
}
function falha(fn: () => unknown, mensagem: string) {
  let houveFalha = false;
  try { fn(); } catch { houveFalha = true; }
  if (!houveFalha) throw new Error(mensagem);
}
function exemplo() {
  return {
    qualidade: { nota: 8, justificativa: 'Descrição suficiente' },
    viabilidade: { status: 'VIÁVEL PARA BO', justificativa: 'Conforme relato' },
    tipificacao: { artigo: 'NÃO APLICÁVEL', fundamento: '' },
    minuta: 'Registro disponível.',
    naoInformado: [],
  };
}

Deno.test('extrairJson interpreta JSON dentro de bloco de código', () => {
  igual(extrairJson('```json\n{"ok":true}\n```'), { ok: true }, 'JSON não extraído');
});

Deno.test('extrairJson rejeita JSON inválido', () => {
  falha(() => extrairJson('{invalido}'), 'JSON inválido deveria ser rejeitado');
  falha(() => extrairJson('sem objeto'), 'Ausência de JSON deveria ser rejeitada');
});

Deno.test('validarResultado rejeita viabilidade inesperada', () => {
  falha(() => validarResultado({ ...exemplo(), viabilidade: { status: 'EM DÚVIDA' } }), 'Status inesperado aceito');
});

Deno.test('validarResultado limita notas à faixa 0–10', () => {
  igual(validarResultado({ ...exemplo(), qualidade: { nota: 17 } }).qualidade.nota, 10, 'Nota máxima');
  igual(validarResultado({ ...exemplo(), qualidade: { nota: -5 } }).qualidade.nota, 0, 'Nota mínima');
  falha(() => validarResultado({ ...exemplo(), qualidade: { nota: 'indefinido' } }), 'Nota não numérica aceita');
});

Deno.test('validarResultado limita a minuta a 1.200 caracteres', () => {
  const resultado = validarResultado({ ...exemplo(), minuta: 'X'.repeat(1500) });
  igual(resultado.minuta.length, 1200, 'Minuta acima do limite');
});

Deno.test('montarRegistro limita descrição, análise e histórico', () => {
  const registro = montarRegistro(
    { tipo: 'Criminal', descricao: 'D'.repeat(5000), analise_mesa: 'M'.repeat(2500) },
    Array.from({ length: 14 }, () => ({ texto: 'A'.repeat(1400) })),
  );
  const dados = JSON.parse(registro.replace(/^<registro>\n/, '').replace(/\n<\/registro>$/, ''));
  igual(dados.descricao.length, 4000, 'Descrição acima do limite');
  igual(dados.analise_mesa.length, 2000, 'Análise acima do limite');
  igual(dados.analises.length, 10, 'Histórico acima do limite');
  igual(dados.analises[0].length, 1000, 'Texto de análise acima do limite');
});

const ID = '12345678-1234-4234-8234-123456789abc';
const SEGREDO = 'chave-falsa-nao-exibir';
function cenario(opcoes: {
  perfil?: string; estado?: string; metodo?: string; autorizacao?: boolean;
  chave?: boolean; id?: string; origem?: string; http?: number;
  respostaIA?: string; erroSalvar?: string; abortar?: boolean;
} = {}) {
  const chamadas: Array<{ nome: string; argumentos?: unknown }> = [];
  const valores: Record<string, string> = {
    SUPABASE_URL: 'https://exemplo.supabase.co',
    SUPABASE_ANON_KEY: 'anon-de-teste',
    OPENAI_API_KEY: SEGREDO,
    ...(opcoes.origem ? { ALLOWED_ORIGIN: opcoes.origem } : {}),
  };
  if (opcoes.chave === false) delete valores.OPENAI_API_KEY;
  const cliente = {
    rpc: async (nome: string, argumentos?: unknown) => {
      chamadas.push({ nome, argumentos });
      if (nome === 'perfil_atual') return { data: opcoes.perfil ?? 'inteligencia', error: null };
      if (nome === 'salvar_analise_ia') return opcoes.erroSalvar
        ? { error: { message: opcoes.erroSalvar }, data: null }
        : { data: { id: ID, criado_em: '2026-10-22T12:00:00Z' }, error: null };
      throw new Error('RPC inesperada');
    },
    from: (tabela: string) => ({
      select: (_: string) => ({
        eq: (_campo: string, _id: string) => ({
          maybeSingle: async () => ({ data: { id: ID, tipo: 'CABOS', status: opcoes.estado ?? 'ag_classificacao', descricao: 'Registro de teste' }, error: null }),
          order: async () => ({ data: [], error: null }),
        }),
      }),
    }),
  };
  // A consulta de análises usa order() após eq(); a cadeia é intencionalmente simulada.
  const dependencias = {
    env: (nome: string) => valores[nome],
    criarCliente: (_url: string, _anon: string, _token: string) => cliente,
    fetch: async (_url: string, init?: RequestInit) => {
      chamadas.push({ nome: 'openai', argumentos: { metodo: init?.method, url: _url } });
      if (opcoes.abortar) throw new DOMException('Teste de prazo excedido', 'AbortError');
      if (opcoes.http) return new Response('falha', { status: opcoes.http });
      return new Response(JSON.stringify({ choices: [{ message: {
        content: opcoes.respostaIA ?? JSON.stringify(exemplo()),
      } }] }), { status: 200 });
    },
  };
  const req = new Request('https://painel.exemplo.test/analisar', {
    method: opcoes.metodo ?? 'POST',
    headers: opcoes.autorizacao === false ? {} : { Authorization: 'Bearer token-de-teste' },
    ...(opcoes.metodo === 'OPTIONS' || opcoes.metodo === 'GET' ? {} : {
      body: JSON.stringify({ ocorrencia_id: opcoes.id ?? ID }),
      headers: {
        ...(opcoes.autorizacao === false ? {} : { Authorization: 'Bearer token-de-teste' }),
        'Content-Type': 'application/json',
      },
    }),
  });
  return { req, dependencias, chamadas };
}
async function verificar(opcoes: Parameters<typeof cenario>[0], status: number, codigo?: string) {
  const { req, dependencias, chamadas } = cenario(opcoes);
  const resposta = await handle(req, dependencias);
  igual(resposta.status, status, 'Código HTTP inesperado');
  const texto = await resposta.text();
  if (texto.includes(SEGREDO)) throw new Error('Segredo da IA exposto na resposta');
  const corpo = JSON.parse(texto);
  if (codigo) igual(corpo.codigo, codigo, 'Código de erro inesperado');
  return { resposta, corpo, chamadas };
}
Deno.test('handle OPTIONS respeita origem configurada e padrão de desenvolvimento', async () => {
  for (const [origem, esperado] of [['https://painel.exemplo.test', 'https://painel.exemplo.test'], [undefined, '*']] as const) {
    const { req, dependencias } = cenario({ metodo: 'OPTIONS', origem });
    const resposta = await handle(req, dependencias);
    igual(resposta.status, 200, 'OPTIONS');
    igual(resposta.headers.get('access-control-allow-origin'), esperado, 'Origem CORS');
    if (!resposta.headers.get('access-control-allow-headers')) throw new Error('Faltam cabeçalhos CORS');
  }
});
Deno.test('handle rejeita método diferente de POST', async () => {
  await verificar({ metodo: 'GET' }, 405, 'metodo');
});
Deno.test('handle exige login e segredo configurado', async () => {
  await verificar({ autorizacao: false }, 401, 'sem_login');
  await verificar({ chave: false }, 500, 'sem_chave_ia');
});
Deno.test('handle valida o UUID da ocorrência', async () => {
  await verificar({ id: 'invalido' }, 400, 'id');
});
Deno.test('handle bloqueia campo e central', async () => {
  for (const perfil of ['campo', 'central']) {
    const r = await verificar({ perfil }, 403, 'sem_permissao');
    if (r.chamadas.some(c => c.nome === 'openai')) throw new Error('IA acionada sem autorização');
  }
});
Deno.test('handle aceita inteligência e administrador', async () => {
  for (const perfil of ['inteligencia', 'admin']) {
    const r = await verificar({ perfil }, 200);
    if (!r.chamadas.some(c => c.nome === 'salvar_analise_ia')) throw new Error('Análise não salva');
  }
});
Deno.test('handle impede análise de ocorrência concluída', async () => {
  await verificar({ estado: 'concluido' }, 409, 'ocorrencia_concluida');
});
Deno.test('handle traduz limitação HTTP 429 da OpenAI', async () => {
  const r = await verificar({ http: 429 }, 502, 'ia_http_429');
  if (!r.corpo.erro.includes('muitas chamadas')) throw new Error('Mensagem de excesso ausente');
});
Deno.test('handle trata AbortError como timeout', async () => {
  await verificar({ abortar: true }, 504, 'ia_rede');
});
Deno.test('handle rejeita resultado inesperado da IA', async () => {
  await verificar({ respostaIA: '{"qualidade":{}}' }, 502, 'ia_formato');
});
Deno.test('handle converte ia_recente da persistência em 429', async () => {
  await verificar({ erroSalvar: 'ia_recente' }, 429, 'ia_recente');
});
Deno.test('handle salva análise pelo RPC e devolve sucesso', async () => {
  const r = await verificar({}, 200);
  igual(r.corpo.ok, true, 'Não confirmou sucesso');
  const rpc = r.chamadas.find(c => c.nome === 'salvar_analise_ia');
  if (!rpc) throw new Error('RPC salvar_analise_ia não chamada');
  igual((rpc.argumentos as { p_ocorrencia_id: string }).p_ocorrencia_id, ID, 'Identificador da persistência');
});
