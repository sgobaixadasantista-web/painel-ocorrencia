#!/usr/bin/env python3
"""Gera o SQL da tipificação (Natureza > Tipo > Subtipo) e um FORMULÁRIO POR SUBTIPO a partir da base de classificação.

Uso:  python tools/gerar_tipificacao.py [classificacao.json] [saida.sql]
Padrão: supabase/dados/classificacao-ocorrencia.json  ->  supabase/atualizar_tipificacao.sql
        (também regrava js/tipificacao-demo.js e supabase/dados/tipificacao-ids.json)

A base de classificação (148 combinações, 86 subtipos) é a lista oficial. Cada subtipo vira um formulário
com os campos do formulário de origem: seções, opções, obrigatoriedade e regras "aparece se".

Regras do SQL gerado (pode rodar de novo quando a base mudar, sem apagar nada):
  * os IDs da tipificação são estáveis: ficam em supabase/dados/tipificacao-ids.json. Combinação que já existia
    mantém o ID (registros antigos continuam apontando para ela); combinação nova ganha o próximo número.
  * combinação que saiu da base NÃO é apagada: fica inativa (ativo = false).
  * os formulários gerados (código CL_...) são sobrescritos a cada geração: ajuste a base, não o Table Editor.
  * os formulários antigos (COMPOSICAO, VIA, ...) não são tocados; continuam abrindo os registros antigos.

Formato de cada campo em formularios.campos (lido pelo painel e por validar_dados_formulario, migration 015):
  { chave, rotulo, tipo, obrigatorio, grupo, ajuda?, opcoes?, max?, padrao?, exibir_se?, nao_antes_de? }
  tipo: texto, textarea, numero, decimal, km, hora, data_hora, duracao, select, sim_nao
  exibir_se: { "campo": <chave>, "valor": <opção> }  ou  { "campo": <chave>, "preenchido": true }
  nao_antes_de: <chave de um campo data_hora>  (ex.: horários que não podem ser anteriores à emergência)
"""
import json, os, re, sys, unicodedata

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ENTRADA = sys.argv[1] if len(sys.argv) > 1 else os.path.join(RAIZ, 'supabase/dados/classificacao-ocorrencia.json')
SAIDA = sys.argv[2] if len(sys.argv) > 2 else os.path.join(RAIZ, 'supabase/atualizar_tipificacao.sql')
IDS = os.path.join(RAIZ, 'supabase/dados/tipificacao-ids.json')
DEMO = os.path.join(RAIZ, 'js/tipificacao-demo.js')
ID_ANTIGO_MAX = 156   # última combinação da planilha antiga

NATUREZA = {'CRIMINAL': 'criminal', 'MECANICA': 'mecanica', 'SOCIAL': 'social', 'NATURAL': 'natural'}
UFS = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO']
MALHAS = ['RUMO MALHA PAULISTA', 'RUMO MALHA NORTE']

def norm(s):
    s = unicodedata.normalize('NFD', str(s or ''))
    return ''.join(c for c in s if unicodedata.category(c) != 'Mn').strip().upper()

def slug(s): return re.sub(r'[^A-Z0-9]+', '_', norm(s)).strip('_').lower()

def campo(chave, rotulo, tipo, obrigatorio=False, grupo='Local da ocorrência', **extra):
    c = {'chave': chave, 'rotulo': rotulo, 'tipo': tipo, 'obrigatorio': obrigatorio, 'grupo': grupo}
    c.update({k: v for k, v in extra.items() if v not in (None, '', [])})
    return c

# Cabeçalho comum a todos os formulários. As chaves (km, sb, trecho, cidade, uf) são as mesmas que a análise de IA já lê.
CABECALHO = [
    campo('malha', 'Empresa (malha)', 'select', True, opcoes=MALHAS),
    # Na tela, trecho > SB > km vêm da malha ferroviária (tabela malha_pontos, migration 016) e o km preenche cidade e UF.
    campo('trecho', 'Trecho', 'texto', False, max=20),
    campo('sb', 'Pátio / seção de bloqueio (SB)', 'texto', False, max=10),
    campo('km', 'Quilômetro (km)', 'km', True, ajuda='Formato 115+500. Escolha na lista da sigla.'),
    campo('cidade', 'Cidade', 'texto', False, ajuda='Preenchida pelo km escolhido.', max=80),
    campo('uf', 'UF', 'select', False, opcoes=UFS),
]
# Campos da base que já têm chave conhecida pelo painel e pela IA
CHAVE_CONHECIDA = {'COMPOSICAO': 'composicao', 'VAGOES': 'vagoes', 'LOCOMOTIVA LIDER': 'locomotiva', 'EMPRESA': 'empresa', 'THP': 'thp_total'}
SO_TEXTO = {'RG', 'CPF'}   # vieram como "number" na origem, mas têm pontos, traços e letras
EMERGENCIA = 'HORARIO DA EMERGENCIA'

def parse_regra(r):
    if not r or r == 'Sempre exibido': return ('sempre', None, None)
    m = re.match(r'^Exibido (se|porque) (.+?) = (.+)$', r)
    if m: return (m.group(1), m.group(2), m.group(3))
    sys.exit('Regra não reconhecida: %r' % r)

def formulario_do_subtipo(sub, campos_base):
    campos = [dict(c) for c in CABECALHO]
    usadas = {c['chave'] for c in campos}
    chave_de = {}
    ordenados = sorted(campos_base, key=lambda f: (f.get('sourceOrder') is None, f.get('sourceOrder') or 0))
    for f in ordenados:   # 1ª passada: chaves únicas dentro do formulário
        base = CHAVE_CONHECIDA.get(norm(f['name'])) or slug(f['name']) or 'campo'
        k, i = base, 2
        while k in usadas: k, i = '%s_%d' % (base, i), i + 1
        usadas.add(k); chave_de[norm(f['name'])] = k
    por_nome = {norm(f['name']): f for f in ordenados}
    aliases = {norm(sub['name']), norm(sub.get('sourceOption'))} - {''}
    k_emerg = chave_de.get(EMERGENCIA)
    for f in ordenados:
        n = norm(f['name'])
        tipo = {'select': 'select', 'textarea': 'textarea', 'datetime': 'data_hora', 'duration': 'duracao',
                'number': 'texto' if n in SO_TEXTO else 'decimal'}.get(f['type'], 'texto')
        c = campo(chave_de[n], f['name'], tipo, bool(f.get('required')), f.get('section') or 'INFORMAÇÕES')
        if n == 'EMPRESA' and tipo == 'select': c['rotulo'] = 'Empresa da composição'
        if tipo == 'select':
            if not f['options']: sys.exit('Lista sem opções: %s > %s' % (sub['name'], f['name']))
            c['opcoes'] = f['options']
            if re.match(r'^TIPO D', n):
                own = next((o for o in f['options'] if norm(o) in aliases), None)
                if own: c['padrao'] = own
        if tipo == 'texto': c['max'] = 200
        if tipo == 'duracao': c['ajuda'] = 'Duração em horas e minutos. Exemplo: 01:52.'
        if tipo == 'data_hora' and k_emerg and c['chave'] != k_emerg and norm(c['grupo']) == 'HORARIO': c['nao_antes_de'] = k_emerg
        kind, ctrl, val = parse_regra(f.get('rule'))
        if kind != 'sempre':
            cf = por_nome.get(norm(ctrl))
            if norm(val) == 'QUALQUER':
                if cf: c['exibir_se'] = {'campo': chave_de[norm(ctrl)], 'preenchido': True}
            elif cf and (cf['type'] != 'select' or any(norm(o) == norm(val) for o in cf['options'])):
                opc = next((o for o in cf['options'] if norm(o) == norm(val)), val) if cf['type'] == 'select' else val
                c['exibir_se'] = {'campo': chave_de[norm(ctrl)], 'valor': opc}
            elif kind == 'porque' and norm(val) == norm(sub['name']):
                pass   # "aparece porque o subtipo é X" e o subtipo É X: sempre visível
            else:
                sys.exit('Regra que nunca se cumpre em %s > %s: %s (rode o teste de fluxo)' % (sub['name'], f['name'], f['rule']))
        campos.append(c)
    return campos

def sql_texto(s): return "'" + str(s).replace("'", "''") + "'"

def main():
    D = json.load(open(ENTRADA, encoding='utf-8'))
    nat = {n['id']: NATUREZA[norm(n['name'])] for n in D['natures']}
    tipos = {t['id']: t for t in D['types']}
    campos = {}
    for f in D['fields']: campos.setdefault(f['subtype'], []).append(f)
    ids = json.load(open(IDS, encoding='utf-8')) if os.path.exists(IDS) else {}
    id_por_norm = {norm(k): v for k, v in ids.items()}
    proximo = max(ids.values(), default=0) + 1

    formularios, linhas, vistos = [], [], set()
    for s in D['subtypes']:
        t = tipos[s['parent']]
        cod = ('CL_' + slug(t['name']) + '__' + slug(s['name'])).upper()
        formularios.append((cod, '%s › %s' % (t['name'], s['name']),
                            'Classificação de ocorrência (formulário de origem %s).' % (s.get('sourceFormId') or '—'),
                            formulario_do_subtipo(s, campos.get(s['id'], []))))
        for nid in t['natureIds']:
            chave = ' | '.join([nat[nid], t['name'], s['name']])
            if norm(chave) in vistos: sys.exit('Combinação repetida: ' + chave)
            vistos.add(norm(chave))
            i = id_por_norm.get(norm(chave))
            if i is None:
                i = proximo; proximo += 1; ids[chave] = i; id_por_norm[norm(chave)] = i
            linhas.append((i, nat[nid], t['name'], s['name'], cod))
    linhas.sort()
    if len({f[0] for f in formularios}) != len(formularios): sys.exit('Código de formulário repetido')

    out = ['-- GERADO por tools/gerar_tipificacao.py a partir de supabase/dados/classificacao-ocorrencia.json',
           '-- (%d combinações, %d formulários). Não edite à mão. Precisa das migrations 004 e 015.' % (len(linhas), len(formularios)), '',
           'do $$ begin',
           "  if to_regclass('public.tipificacao') is null or to_regclass('public.formularios') is null then",
           "    raise exception 'Rode antes as migrations 004_tipificacao.sql e 015_formularios_condicionais.sql.';",
           '  end if;',
           "  if not exists (select 1 from pg_proc where proname = 'validar_dados_formulario' and prosrc like '%exibir_se%') then",
           "    raise exception 'Rode antes a migration 015_formularios_condicionais.sql.';",
           '  end if;',
           'end $$;', '']
    out.append('insert into public.formularios (codigo, nome, descricao, campos) values')
    out.append(',\n'.join('  (%s, %s, %s, %s::jsonb)' % (sql_texto(c), sql_texto(n), sql_texto(d), sql_texto(json.dumps(cs, ensure_ascii=False))) for c, n, d, cs in formularios))
    out.append('on conflict (codigo) do update set nome = excluded.nome, descricao = excluded.descricao, campos = excluded.campos, ativo = true;\n')
    out.append('insert into public.tipificacao (id, natureza, tipo, subtipo, formulario) values')
    # natureza sem conversão explícita: serve tanto para a coluna enum (004 deste repositório) quanto para texto (produção)
    out.append(',\n'.join('  (%d, %s, %s, %s, %s)' % (i, sql_texto(n), sql_texto(t), sql_texto(s), sql_texto(f)) for i, n, t, s, f in linhas))
    out.append('on conflict (id) do update set natureza = excluded.natureza, tipo = excluded.tipo, subtipo = excluded.subtipo, formulario = excluded.formulario, ativo = true;')
    out.append('-- combinações que saíram da base ficam inativas (registros antigos continuam abrindo)')
    out.append('update public.tipificacao set ativo = false where id <> all (array[%s]);' % ','.join(str(l[0]) for l in linhas))
    open(SAIDA, 'w', encoding='utf-8', newline='\n').write('\n'.join(out) + '\n')
    with open(IDS, 'w', encoding='utf-8', newline='\n') as fh:
        json.dump(dict(sorted(ids.items(), key=lambda kv: kv[1])), fh, ensure_ascii=False, indent=1); fh.write('\n')
    demo = {'linhas': [list(l) for l in linhas],
            'formularios': {c: {'codigo': c, 'nome': n, 'descricao': d, 'campos': cs} for c, n, d, cs in formularios}}
    open(DEMO, 'w', encoding='utf-8', newline='\n').write('/* GERADO por tools/gerar_tipificacao.py. Usado só no modo demonstração. */\nwindow.TIPIFICACAO_DEMO = '
                                                         + json.dumps(demo, ensure_ascii=False, separators=(',', ':')) + ';\n')
    novos = sum(1 for l in linhas if l[0] > ID_ANTIGO_MAX)
    print('%d combinações (%d com ID antigo, %d novas), %d formulários -> %s' % (len(linhas), len(linhas) - novos, novos, len(formularios), SAIDA))

main()
