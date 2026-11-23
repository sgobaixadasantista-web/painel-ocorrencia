#!/usr/bin/env python3
"""Gera o SQL de carga do catálogo de artigos penais da IA (tabela artigos_penais, migration 018).

Uso:  python tools/gerar_artigos.py [artigos.xlsx | artigos-penais.json] [saida.sql]
Padrão: supabase/dados/artigos-penais.json  ->  supabase/atualizar_artigos.sql

Com uma planilha (.xlsx, aba "Artigos", no formato da planilha revisada artigos_rumo_revisado.xlsx), o script
também regrava supabase/dados/artigos-penais.json, que é a fonte versionada. Colunas da aba Artigos:
  Código | Título | Artigo | Lei | Caput (texto oficial) | Pena (texto oficial) | Ativo | Observação para o jurídico | Fonte

Regras do SQL gerado (pode rodar de novo, sem apagar nada):
  * artigo que já existe é atualizado pelo código; artigo novo é inserido;
  * artigo que saiu da base NÃO é apagado: fica inativo (ativo = false) e a IA deixa de vê-lo.
"""
import json, os, re, sys

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
JSON_PADRAO = os.path.join(RAIZ, 'supabase/dados/artigos-penais.json')
ENTRADA = sys.argv[1] if len(sys.argv) > 1 else JSON_PADRAO
SAIDA = sys.argv[2] if len(sys.argv) > 2 else os.path.join(RAIZ, 'supabase/atualizar_artigos.sql')
CODIGO = re.compile(r'^[A-Z0-9]+_[0-9A-Z-]+$')


def ler_planilha(caminho):
    import openpyxl  # só é preciso para ler a planilha
    ws = openpyxl.load_workbook(caminho, data_only=True)['Artigos']
    linhas = list(ws.iter_rows(values_only=True))
    cab = [str(c or '').strip().lower() for c in linhas[0]]
    def col(nome):
        for i, c in enumerate(cab):
            if c.startswith(nome): return i
        sys.exit('A aba Artigos não tem a coluna "%s".' % nome)
    idx = {k: col(k) for k in ('código', 'título', 'artigo', 'lei', 'caput', 'pena', 'ativo', 'observação', 'fonte')}
    out = []
    for n, r in enumerate(linhas[1:], 1):
        if not any(r): continue
        v = lambda k: str(r[idx[k]] or '').strip()
        out.append({'codigo': v('código').upper(), 'ordem': n, 'titulo': v('título'), 'artigo': v('artigo'), 'lei': v('lei'),
                    'caput': v('caput'), 'pena': v('pena'), 'fonte': v('fonte'), 'observacao': v('observação'),
                    'ativo': v('ativo').upper() not in ('NÃO', 'NAO', 'N', 'FALSE', '0')})
    return out


def sql_texto(s):
    return "'" + str(s).replace("'", "''") + "'"


def main():
    if ENTRADA.lower().endswith('.xlsx'):
        artigos = ler_planilha(ENTRADA)
        json.dump({'fonte': 'Planalto (planalto.gov.br); base: ' + os.path.basename(ENTRADA), 'artigos': artigos},
                  open(JSON_PADRAO, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    else:
        artigos = json.load(open(ENTRADA, encoding='utf-8'))['artigos']

    vistos = set()
    for a in artigos:
        c = a['codigo']
        if not CODIGO.match(c): sys.exit('Código inválido: %r (use LETRAS_NÚMERO, ex.: CP_155)' % c)
        if c in vistos: sys.exit('Código repetido: ' + c)
        vistos.add(c)
        for k in ('titulo', 'artigo', 'lei', 'caput'):
            if not str(a.get(k) or '').strip(): sys.exit('%s sem %s' % (c, k))
        if len(a['caput']) > 2000: sys.exit(c + ': caput longo demais (máximo 2000 caracteres)')

    ativos = [a for a in artigos if a.get('ativo', True)]
    out = ['-- GERADO por tools/gerar_artigos.py a partir de supabase/dados/artigos-penais.json',
           '-- (%d artigos, %d ativos). Não edite à mão. Precisa da migration 018.' % (len(artigos), len(ativos)), '',
           'do $$ begin',
           "  if to_regclass('public.artigos_penais') is null then",
           "    raise exception 'Rode antes a migration 018_artigos_penais.sql.';",
           '  end if;',
           'end $$;', '',
           'begin;',
           'insert into public.artigos_penais (codigo, ordem, titulo, artigo, lei, caput, pena, fonte, observacao, ativo) values']
    out.append(',\n'.join('  (%s, %d, %s, %s, %s, %s, %s, %s, %s, %s)' % (
        sql_texto(a['codigo']), int(a.get('ordem') or 0), sql_texto(a['titulo']), sql_texto(a['artigo']), sql_texto(a['lei']),
        sql_texto(a['caput']), sql_texto(a.get('pena') or ''), sql_texto(a.get('fonte') or ''), sql_texto(a.get('observacao') or ''),
        'true' if a.get('ativo', True) else 'false') for a in artigos))
    out.append('on conflict (codigo) do update set ordem = excluded.ordem, titulo = excluded.titulo, artigo = excluded.artigo,')
    out.append('  lei = excluded.lei, caput = excluded.caput, pena = excluded.pena, fonte = excluded.fonte,')
    out.append('  observacao = excluded.observacao, ativo = excluded.ativo, atualizado_em = now();')
    out.append('')
    out.append('-- artigo que saiu da base fica inativo (não é apagado)')
    out.append('update public.artigos_penais set ativo = false, atualizado_em = now()')
    out.append(' where ativo and codigo not in (%s);' % ', '.join(sql_texto(a['codigo']) for a in artigos))
    out.append('commit;')
    open(SAIDA, 'w', encoding='utf-8', newline='\n').write('\n'.join(out) + '\n')
    print('%d artigos (%d ativos) -> %s' % (len(artigos), len(ativos), SAIDA))


main()
