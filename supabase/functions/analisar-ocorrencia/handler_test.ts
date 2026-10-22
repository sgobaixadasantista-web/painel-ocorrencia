import { montarRegistro, extrairJson, validarResultado } from './handler.ts';

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
