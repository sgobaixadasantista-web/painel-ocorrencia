#!/usr/bin/env python3
"""Gera o SQL da tipificação (Natureza > Tipo > Subtipo) e dos formulários a partir da planilha da Rumo.

Uso:  python3 tools/gerar_tipificacao.py [planilha.xlsx] [saida.sql]
Padrão: supabase/dados/tipificacao-ocorrencia.xlsx  ->  supabase/atualizar_tipificacao.sql

O SQL gerado é um "upsert": pode ser rodado de novo quando a planilha mudar, sem apagar o que já existe.
Combinação que sair da planilha NÃO é apagada: fica inativa (ativo = false), para não quebrar registros antigos.
Quem decide qual formulário cada combinação abre é a função formulario_da() abaixo e a lista FORMULARIOS.
"""
import json, sys, os, warnings
warnings.filterwarnings('ignore')
import openpyxl

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ENTRADA = sys.argv[1] if len(sys.argv) > 1 else os.path.join(RAIZ, 'supabase/dados/tipificacao-ocorrencia.xlsx')
SAIDA = sys.argv[2] if len(sys.argv) > 2 else os.path.join(RAIZ, 'supabase/atualizar_tipificacao.sql')

NATUREZA = {'CRIMINAL': 'criminal', 'MECÂNICA': 'mecanica', 'SOCIAL': 'social', 'NATURAL': 'natural'}
UFS = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO']

def campo(chave, rotulo, tipo, obrigatorio=False, ajuda='', opcoes=None, max=None, grupo='Principal'):
    c = {'chave': chave, 'rotulo': rotulo, 'tipo': tipo, 'obrigatorio': obrigatorio, 'grupo': grupo}
    if ajuda: c['ajuda'] = ajuda
    if opcoes: c['opcoes'] = opcoes
    if max: c['max'] = max
    return c

KM = campo('km', 'Quilômetro (km)', 'km', True, 'Formato 115+500, sempre com sinal de mais.')
ATIVO = campo('ativo_afetado', 'Ativo ou material afetado', 'texto', False, 'O que foi cortado, subtraído, aberto, danificado ou localizado.', max=200)
EMPRESA = campo('empresa', 'Empresa da composição', 'select', False, opcoes=['RUMO', 'VLI', 'MRS', 'BRADO', 'OUTRA'], grupo='Composição')
PREFIXO = campo('prefixo', 'Prefixo da composição', 'texto', False, 'Exemplo: T55. Não use código de seção (SB, ZPT...).', max=20, grupo='Composição')
COMPOSICAO = campo('composicao', 'Número da composição', 'texto', False, max=20, grupo='Composição')
VAGOES = campo('vagoes', 'Vagão(ões) envolvido(s)', 'texto', False, 'Números separados por vírgula.', max=200, grupo='Composição')
LOCOMOTIVA = campo('locomotiva', 'Locomotiva envolvida', 'texto', False, max=40, grupo='Composição')
SB = campo('sb', 'Seção de bloqueio (SB)', 'texto', False, 'Somente a sigla da seção. Exemplo: ZPT.', max=10, grupo='Local')
TRECHO = campo('trecho', 'Trecho', 'select', False, opcoes=['TRECHO 1', 'TRECHO 2', 'TRECHO 3', 'TRECHO 4', 'TRECHO 5', 'TRECHO 6'], grupo='Local')
CIDADE = campo('cidade', 'Cidade', 'texto', False, max=80, grupo='Local')
UF = campo('uf', 'UF', 'select', False, opcoes=UFS, grupo='Local')
AUTORIA = campo('autoria', 'Autoria', 'select', False, 'Marque CONHECIDA só quando o autor foi identificado, detido ou qualificado.', ['DESCONHECIDA', 'CONHECIDA'], grupo='Estatística')
H_INI = campo('hora_inicio', 'Hora de início da ocorrência', 'hora', False, 'HH:MM', grupo='Estatística')
H_FIM = campo('hora_final', 'Hora de liberação para a circulação', 'hora', False, 'HH:MM', grupo='Estatística')
MAQ = campo('maquinista', 'Maquinista (primeiro nome)', 'texto', False, 'Usado só no relatório estatístico. Nunca entra no boletim.', max=40, grupo='Estatística')
RE = campo('re_maquinista', 'RE do maquinista', 'texto', False, 'Usado só no relatório estatístico. Nunca entra no boletim.', max=20, grupo='Estatística')
LOCAL_EXTRA = [SB, TRECHO, CIDADE, UF]
ESTAT = [AUTORIA, H_INI, H_FIM]

FORMULARIOS = [
    ('COMPOSICAO', 'Ocorrência em composição', 'Cortes, subtrações, aberturas e danos em vagões, locomotivas e equipamentos da composição.',
     [KM, ATIVO, EMPRESA, PREFIXO, COMPOSICAO, VAGOES, LOCOMOTIVA] + LOCAL_EXTRA + ESTAT + [MAQ, RE]),
    ('VIA', 'Ocorrência na via e em equipamentos de via', 'Sinalização, detectores, AMV, trilhos, dormentes, postes e instalações.',
     [KM, ATIVO] + LOCAL_EXTRA + ESTAT),
    ('APREENSAO', 'Material localizado ou apreendido', 'Material encontrado na faixa de domínio ou apreendido.',
     [KM,
      campo('material_localizado', 'Material localizado ou apreendido', 'texto', True, 'Exemplo: combustível, cabos, trilho.', max=200),
      campo('recipientes', 'Quantidade (número de recipientes)', 'numero', False, 'Informe só o número de galões, sacas, bombonas ou caixas. NÃO informe peso, volume ou litros: o material não foi periciado.'),
      campo('tipo_recipiente', 'Tipo de recipiente', 'select', False, opcoes=['GALÕES', 'SACAS', 'BOMBONAS', 'CAIXAS', 'UNIDADES']),
      campo('quem_apreendeu', 'Quem apreendeu', 'texto', False, 'Equipe ou órgão (não informe nomes de pessoas).', max=120)] + LOCAL_EXTRA + [AUTORIA, H_INI]),
    ('PESSOAS', 'Ataque ou agressão a pessoas', 'Ataques às equipes de segurança e a funcionários e colaboradores.',
     [KM, campo('vitimas', 'Número de vítimas', 'numero', False),
      campo('lesao', 'Gravidade', 'select', False, opcoes=['SEM LESÃO', 'LESÃO LEVE', 'LESÃO GRAVE', 'ÓBITO']),
      campo('atendimento_medico', 'Houve atendimento médico?', 'sim_nao', False)] + LOCAL_EXTRA + [AUTORIA, H_INI]),
    ('ACIDENTE', 'Acidente', 'Atropelamento, descarrilamento, abalroamento, acidente de trabalho e disparo acidental.',
     [KM, EMPRESA, PREFIXO, COMPOSICAO, campo('vitimas', 'Número de vítimas', 'numero', False), campo('obito', 'Houve óbito?', 'sim_nao', False)] + LOCAL_EXTRA + [H_INI, H_FIM]),
    ('OBSTRUCAO', 'Obstrução de via', 'Materiais, veículos ou desastre natural obstruindo a via.',
     [KM, campo('causa', 'Causa da obstrução', 'texto', False, max=200)] + LOCAL_EXTRA + [H_INI, H_FIM]),
    ('MANUTENCAO', 'Manutenção', 'Intervenções de manutenção mecânica, de via, de instalações ou perda de sinal.',
     [KM, ATIVO, EMPRESA, PREFIXO, COMPOSICAO] + LOCAL_EXTRA + [H_INI, H_FIM]),
    ('PREVENCAO', 'Prevenção', 'Indivíduos, animais ou cadáver na via.',
     [KM, campo('quantidade', 'Quantidade de pessoas ou animais', 'numero', False),
      campo('acao_adotada', 'Ação adotada', 'textarea', False, max=1000),
      campo('autoridade_acionada', 'Autoridade acionada?', 'sim_nao', False)] + LOCAL_EXTRA + [H_INI]),
    ('BASICO', 'Formulário básico', 'Para combinações sem campos específicos.', [KM, ATIVO] + LOCAL_EXTRA),
]

COMPOSICAO_SUB = {'COMBUSTÍVEL', 'CARGA/GRÃOS', 'CABOS', 'PEÇAS DA COMPOSIÇÃO', 'HOT BOX', 'ENGRAXADEIRA', 'CORTE DE MANGUEIRA', 'CORTE DE CABOS',
                  'TORNEIRA FECHADA', 'FREIO MANUAL APLICADO', 'COMPOSIÇÃO'}
VIA_SUB = {'EQUIPAMENTO DE SINALIZAÇÃO', 'POSTE DE MONITORAMENTO', 'AMV', 'DDC (DETECTOR DE DESCARRILAMENTO)', 'DTQ (DETECTOR DE TRILHO QUEBRADO)',
           'DQB (DETECTOR DE QUEDA DE BARREIRA)', 'MATERIAL DE FIXAÇÃO DE TRILHO', 'DORMENTES', 'TRILHO', 'HOUSE', 'INSTALAÇÕES'}

def formulario_da(tipo, subtipo):
    if tipo == 'APREENSÃO': return 'APREENSAO'
    if tipo in ('ATAQUE ÀS EQUIPES DE SEGURANÇA', 'ATAQUES A FUNCIONÁRIOS E COLABORADORES'): return 'PESSOAS'
    if tipo in ('ACIDENTE', 'DISPARO ACIDENTAL'): return 'ACIDENTE'
    if tipo == 'OBSTRUÇÃO DE VIA': return 'OBSTRUCAO'
    if tipo == 'MANUTENÇÃO': return 'MANUTENCAO'
    if tipo == 'PREVENÇÃO': return 'PREVENCAO'
    if tipo in ('ABERTURA', 'DESENGATE'): return 'COMPOSICAO'
    if tipo == 'INCÊNDIO': return 'COMPOSICAO' if subtipo in ('VAGÃO', 'COMPOSIÇÃO') else 'VIA'
    if subtipo in COMPOSICAO_SUB: return 'COMPOSICAO'
    if subtipo in VIA_SUB: return 'VIA'
    return 'BASICO'

def sql_texto(s): return "'" + str(s).replace("'", "''") + "'"

def main():
    wb = openpyxl.load_workbook(ENTRADA, data_only=True)
    linhas = [r for r in wb['TBL_Tipificacao'].iter_rows(min_row=2, values_only=True) if r[0] is not None]
    for r in linhas:
        if r[1] not in NATUREZA: sys.exit('Natureza desconhecida na planilha: %r (id %s)' % (r[1], r[0]))
        if not (r[2] and r[3]): sys.exit('Tipo ou subtipo vazio (id %s)' % r[0])
    ids = [r[0] for r in linhas]
    if len(ids) != len(set(ids)): sys.exit('ID repetido na planilha')
    out = ['-- GERADO por tools/gerar_tipificacao.py a partir de supabase/dados/tipificacao-ocorrencia.xlsx (%d combinações). Não edite à mão.' % len(linhas), '']
    out.append('insert into public.formularios (codigo, nome, descricao, campos) values')
    out.append(',\n'.join('  (%s, %s, %s, %s::jsonb)' % (sql_texto(c), sql_texto(n), sql_texto(d), sql_texto(json.dumps(cs, ensure_ascii=False))) for c, n, d, cs in FORMULARIOS))
    out.append('on conflict (codigo) do nothing;  -- formulário já existente (talvez ajustado por você) não é sobrescrito\n')
    out.append('insert into public.tipificacao (id, natureza, tipo, subtipo, formulario) values')
    out.append(',\n'.join('  (%d, %s, %s, %s, %s)' % (r[0], sql_texto(NATUREZA[r[1]]) + '::public.natureza', sql_texto(r[2]), sql_texto(r[3]), sql_texto(formulario_da(r[2], r[3]))) for r in linhas))
    out.append('on conflict (id) do update set natureza = excluded.natureza, tipo = excluded.tipo, subtipo = excluded.subtipo, ativo = true;')
    out.append('-- combinações que saíram da planilha ficam inativas (registros antigos continuam abrindo)')
    out.append('update public.tipificacao set ativo = false where id <> all (array[%s]);' % ','.join(str(i) for i in ids))
    open(SAIDA, 'w', encoding='utf-8').write('\n'.join(out) + '\n')
    # dados para o MODO DEMONSTRAÇÃO do painel (no modo normal o painel lê isto do banco)
    demo = {'linhas': [[r[0], NATUREZA[r[1]], r[2], r[3], formulario_da(r[2], r[3])] for r in linhas],
            'formularios': {c: {'codigo': c, 'nome': n, 'descricao': d, 'campos': cs} for c, n, d, cs in FORMULARIOS}}
    open(os.path.join(RAIZ, 'js/tipificacao-demo.js'), 'w', encoding='utf-8').write('/* GERADO por tools/gerar_tipificacao.py. Usado só no modo demonstração. */\nwindow.TIPIFICACAO_DEMO = ' + json.dumps(demo, ensure_ascii=False, separators=(',', ':')) + ';\n')
    por = {}
    for r in linhas: por.setdefault(formulario_da(r[2], r[3]), 0); por[formulario_da(r[2], r[3])] += 1
    print('%d combinações -> %s' % (len(linhas), SAIDA)); print('por formulário:', por)

main()
