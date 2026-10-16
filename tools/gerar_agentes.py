#!/usr/bin/env python3
"""Gera o SQL dos agentes de IA e das minutas a partir da configuração exportada do Rumo - SLA.

Uso:  python3 tools/gerar_agentes.py [agentes-rumo.json] [saida.sql]
Padrão: supabase/dados/agentes-rumo.json  ->  supabase/atualizar_agentes_ia.sql

Entrada: JSON com 3 itens {ordem, cargo, objetivo, habilidade} (ou a página HTML salva da tela PowerDesk.IA QA,
se o pacote beautifulsoup4 estiver instalado). O agente 2 traz a biblioteca de minutas dentro da "habilidade":
este script separa a biblioteca (vai para a tabela minutas_bo) e deixa no agente só a parte de instruções.
O SQL gerado só cria o que ainda não existe: agente ou minuta já cadastrado (e talvez ajustado por você) NÃO é sobrescrito.
"""
import json, re, sys, os
RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ENTRADA = sys.argv[1] if len(sys.argv) > 1 else os.path.join(RAIZ, 'supabase/dados/agentes-rumo.json')
SAIDA = sys.argv[2] if len(sys.argv) > 2 else os.path.join(RAIZ, 'supabase/atualizar_agentes_ia.sql')
CODIGOS = {1: 'qualidade', 2: 'tipificacao', 3: 'redator'}
MARCA = 'As minutas disponíveis são as seguintes:'

def ler(caminho):
    if caminho.lower().endswith('.json'):
        return json.load(open(caminho, encoding='utf-8'))
    from bs4 import BeautifulSoup
    soup = BeautifulSoup(open(caminho, encoding='utf-8', errors='replace').read(), 'html.parser')
    linhas = soup.find('table').find_all('tr')[1:]
    r = []
    for l in linhas:
        c = [x.get_text('\n', strip=True) for x in l.find_all('td')]
        r.append({'ordem': int(c[4]), 'cargo': c[1], 'objetivo': c[2], 'habilidade': c[3]})
    return r

def dq(tag, texto):
    assert ('$' + tag + '$') not in texto
    return '$' + tag + '$' + texto + '$' + tag + '$'

def main():
    ag = sorted(ler(ENTRADA), key=lambda x: x['ordem'])
    assert [a['ordem'] for a in ag] == [1, 2, 3], 'esperados 3 agentes, ordens 1, 2 e 3'
    minutas = []
    a2 = ag[1]
    i = a2['habilidade'].index(MARCA) + len(MARCA)
    intro, lib = a2['habilidade'][:i].strip(), a2['habilidade'][i:]
    padrao = re.compile(r'MINUTA (\d+) — (.+?)\s*Tipo:\s*(\w+)\s*Aplicar quando:\s*(.+?)\s*TEXTO:\s*(.+?)(?=\s*MINUTA \d+ —|\Z)', re.S)
    for m in padrao.finditer(lib):
        minutas.append((int(m.group(1)), m.group(2).strip(), m.group(3).strip(), re.sub(r'\s+', ' ', m.group(4)).strip(), re.sub(r'\s+', ' ', m.group(5)).strip()))
    assert len(minutas) == lib.count('MINUTA ') - lib.count('MINUTA NÃO') or len(minutas) >= 1, 'nenhuma minuta encontrada'
    a2 = dict(a2, habilidade=intro)
    ag[1] = a2
    out = ['-- GERADO por tools/gerar_agentes.py a partir de supabase/dados/agentes-rumo.json (%d agentes, %d minutas). Não edite à mão.' % (len(ag), len(minutas)), '']
    out.append('insert into public.agentes_ia (ordem, codigo, cargo, objetivo, habilidade) values')
    out.append(',\n'.join('  (%d, %s, %s, %s, %s)' % (a['ordem'], "'" + CODIGOS[a['ordem']] + "'", dq('ag', a['cargo']), dq('ag', a['objetivo']), dq('ag', a['habilidade'])) for a in ag))
    out.append('on conflict (ordem) do nothing;\n')
    out.append('insert into public.minutas_bo (numero, nome, tipo, aplicar_quando, texto) values')
    out.append(',\n'.join('  (%d, %s, %s, %s, %s)' % (n, dq('mn', nome), dq('mn', tipo), dq('mn', quando), dq('mn', texto)) for n, nome, tipo, quando, texto in minutas))
    out.append('on conflict (numero) do nothing;')
    open(SAIDA, 'w', encoding='utf-8').write('\n'.join(out) + '\n')
    demo = [{'numero': n, 'nome': nome, 'tipo': tipo, 'aplicar_quando': quando, 'texto': texto, 'versao': 1} for n, nome, tipo, quando, texto in minutas]
    open(os.path.join(RAIZ, 'js/minutas-demo.js'), 'w', encoding='utf-8').write('/* GERADO por tools/gerar_agentes.py. Usado só no modo demonstração. */\nwindow.MINUTAS_DEMO = ' + json.dumps(demo, ensure_ascii=False, separators=(',', ':')) + ';\n')
    print('%d agentes e %d minutas -> %s' % (len(ag), len(minutas), SAIDA))
    for n, nome, tipo, quando, texto in minutas: print('  minuta %d | %s | %s | %d caracteres' % (n, nome, tipo, len(texto)))

main()
