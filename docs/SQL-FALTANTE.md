# SQL que falta no repositório

Levantamento de 09/11/2026. Comparamos três fontes:
- o código (`js/`, `gestao-postos.html`);
- as migrações do repositório (`supabase/migrations/`, só 001 a 003);
- o banco de produção `fnqvmuvpensjofiucuty`: uma consulta só de leitura com a chave pública e o esquema de tabelas exportado do painel do Supabase.

## Resumo

| Situação | Itens |
|---|---|
| **Problema: a triagem da central não funciona em produção** | A migração 004 não foi aplicada. Faltam colunas em `eventos` e `ocorrencias` e, muito provavelmente, a função `triar_evento` (detalhes na seção 1) |
| Existem em produção, sem SQL no repositório (usadas pelo painel) | `tipificacao`, `formularios`, `aux_siglas`, `aux_trechos`, `veiculos`, `veiculos_checklist`, `veiculo_turno`, `efetivo_turno`, `colaboradores`, `equipes_postos`, `equipes_escalas`, `tipos_posto`, view `rastreamento_painel` |
| Existem em produção, sem SQL e **não usadas pelo painel** (são do app CCS360 das equipes) | `rastreamento_dispositivos`, `rastreamento_posicoes`, `rastreamento_atual`, `rastreamento_alertas`, `abastecimentos`, `checklist_itens_catalogo`, `checklist_avaliacoes`, `checklist_evidencias`, `checklist_alertas`, `checklist_alertas_auditoria`, `equipes_turnos`, `equipes_confirmacoes`, `equipes_substituicoes`, `equipes_alertas`, `equipes_auditoria`, `ccs360_sync_inbox_v2`, `ccs360_aberturas_turno_v2`, `aux_funcoes`, `auditoria` |
| Não existem em lugar nenhum | `agentes_ia` e `minutas_bo` (005 nunca aplicada; a função de IA atual usa OpenAI e não as lê) |
| Arquivos citados no README e ausentes | `004_tipificacao.sql` (reescrita, veja a seção 1), `005_agentes_ia.sql`, `supabase/dados/*`, `supabase/atualizar_tipificacao.sql`, `supabase/atualizar_agentes_ia.sql` |
| **Ainda sem visibilidade** | O esquema exportado só traz tabelas. Faltam funções, views, triggers, enums, grants, políticas de acesso (RLS) e buckets (seção "Como recuperar o resto") |

## 1. Tipificação e triagem: 004 não aplicada em produção

Comparação entre o que o painel espera e o que existe em produção:

| Objeto | O painel espera | Produção |
|---|---|---|
| `tipificacao` | `id`, `natureza` (enum `public.natureza`), `tipo`, `subtipo`, `formulario`, `ativo` | Existe, mas `natureza` é `text`, não enum |
| `formularios` | `codigo`, `nome`, `descricao`, `campos jsonb`, `ativo`; o README cita versão e autor | Existe, sem colunas de versão nem autor |
| `aux_siglas` | `sigla`, `trecho_codigo`, `ordem`, `ativo` | Existe, com FK para `aux_trechos` |
| `eventos.tipificacao_id`, `eventos.triagem_dados` | lidas em `data.js:49` | **Não existem** |
| `ocorrencias.natureza`, `.tipificacao_id`, `.dados` | lidas em `data.js:59` | **Não existem** |
| `triar_evento(p_evento_id, p_tipificacao_id, p_dados, p_forma, p_fato_em, p_analise_mesa, p_observacao)` | chamada em `data.js:158` | Quase certamente não existe: a função precisaria gravar nas colunas acima |

**Efeito:** na triagem, a central recebe erro de função inexistente, e a tipificação nunca é gravada.
As tabelas `tipificacao` e `formularios` parecem ter sido criadas à parte, e não pela 004. Também não dá para saber se
elas têm as 156 combinações e os 9 formulários: para quem não está logado, as consultas voltam vazias.
Para conferir, é preciso estar logado no SQL Editor:

```sql
select (select count(*) from public.tipificacao) as combinacoes, (select count(*) from public.formularios) as formularios;
select proname from pg_proc where pronamespace = 'public'::regnamespace and proname like 'triar_evento%';
```

### Correção: `supabase/migrations/004_tipificacao.sql` (reescrita)

A 004 foi reescrita e pode rodar em produção sem apagar nada. Ela:
- cria `formularios`, `tipificacao`, `aux_trechos` e `aux_siglas` só se não existirem. Mantém `natureza` em texto, como em produção, com `check` dos 4 valores e uma combinação única por natureza, tipo e subtipo;
- acrescenta as colunas que faltam em `eventos` e `ocorrencias`;
- cria `triar_evento`, que valida o formulário no banco com as mesmas regras da tela. A natureza criminal cria a ocorrência; a mecânica, a social e a natural finalizam o evento. A função também cadastra o tipo em `tipos_ocorrencia`, que é obrigatório para a ocorrência;
- tira do navegador as triagens antigas (`triar_evento_criminal`, `finalizar_evento`), que gravavam sem tipificação;
- recria `v_fila_eventos` e `v_fila_ocorrencias` com as colunas novas no fim. A de ocorrências também passa a trazer o GPS do evento;
- deixa as quatro tabelas só para leitura de quem está logado e ativo, e revoga o acesso de `anon`;
- insere os 9 formulários e as 156 combinações de `js/tipificacao-demo.js` só onde ainda não existirem.

Ela foi testada com `supabase/testes/testar_004.mjs`: 65 verificações num Postgres em memória, em dois cenários, um banco novo e um banco como o de produção.
O teste não cobre o Supabase de verdade.

**Antes de rodar em produção:**
1. Rode as duas consultas acima. Se `triar_evento` já existir com outros parâmetros, ela continua lá, e a 004 cria a versão nova ao lado.
2. Confira que não há combinação repetida. Se houver, a criação do índice único falha e nada é aplicado:
   `select natureza, tipo, subtipo, count(*) from public.tipificacao group by 1,2,3 having count(*) > 1;`
3. As views são recriadas (`drop` + `create`). Se a versão de produção tiver colunas a mais, criadas fora do repositório, elas somem. Vale ver antes com
   `select pg_get_viewdef('public.v_fila_eventos');`.
4. `aux_siglas` não recebe dados: as siglas de produção ficam como estão.

## 2. Agentes de IA e minutas (README: `005_agentes_ia.sql`): ausentes também em produção

| Objeto | Colunas (de `tools/gerar_agentes.py`) |
|---|---|
| `agentes_ia` | `ordem`, `codigo` (`qualidade`, `tipificacao`, `redator`), `cargo`, `objetivo`, `habilidade` |
| `minutas_bo` | `numero`, `nome`, `tipo`, `aplicar_quando`, `texto`, `versao` |

Essas tabelas só fazem sentido se a função de IA voltar a ser a cadeia de 3 agentes descrita no README. Hoje
`handler.ts` chama a OpenAI (`gpt-4o-mini`) numa chamada só. Os textos das minutas estão em `js/minutas-demo.js`. Os
textos dos agentes não estão no repositório.

## 3. Módulos operacionais: conferência código × produção

Em geral, as colunas que o código usa existem em produção. Há algumas diferenças:

| Tabela | Observação |
|---|---|
| `veiculos` | OK. Produção tem colunas que a tela não usa: `ano_modelo`, `foto_veiculo_path`, `observacoes`, `cadastrado_por`, `atualizado_em`. `cadastrado_por` não é preenchido pelo painel; só seria preenchido por trigger ou `default auth.uid()`, o que não dá para ver no export |
| `veiculos_checklist` | OK. `validade_checklist` tem default `data_checklist + 15`, como o código supõe. A FK para `veiculos` não tem `cascade`, então a exclusão com histórico é barrada pelo banco. O app CCS360 grava avaliações por item em `checklist_avaliacoes` e `checklist_evidencias`, mas o painel não mostra esses dados |
| `veiculo_turno`, `efetivo_turno` | OK. Ambas são gravadas pelo app das equipes (`usuario_id` obrigatório) |
| `colaboradores` | OK. `cadastrado_por` e `data_admissao` não são preenchidos pela tela. `matricula` **não é única**: dá para cadastrar a mesma matrícula duas vezes |
| `equipes_postos` | OK. Tem `auth_user_id`, que liga o posto à conta; a tela diz que esse vínculo é feito à parte |
| `equipes_escalas` | OK. O CHECK de `efetivo_esperado` só exige > 0, enquanto a tela limita a 100 |
| `rastreamento_painel` | Não aparece no export, então é uma **view**, provavelmente sobre `rastreamento_atual` + `rastreamento_dispositivos`. `status_conexao` é calculado nela |

### Buckets de armazenamento usados pelo painel
| Bucket | Usado por | Caminho |
|---|---|---|
| `evidencias` | campo (001) | por pessoa |
| `veiculos-checklist-fotos` | frota | `<veiculo_id>/<uuid>-<posição>.<ext>` |
| `veiculo-turno-fotos` | veículo no turno | gravado pelo app das equipes |
| `efetivo-selfies` | efetivo no turno | gravado pelo app das equipes |
| `colaboradores-selfies` | colaboradores | `<uuid>-<nome do arquivo>` |

## Pontos de atenção

1. **Triagem quebrada em produção** (seção 1). A correção é a nova `004_tipificacao.sql`, que ainda precisa ser aplicada.
2. **Regras de acesso não versionadas.** Frota, colaboradores e postos gravam direto nas tabelas. A proteção depende de políticas RLS que só existem no banco. Confira quem pode `insert`, `update` e `delete`: o menu mostra esses módulos para `central` e `admin`, e `gestao-postos.html` diz que só o admin pode cadastrar.
3. **Permissão para `anon`.** `tipificacao`, `formularios`, `veiculo_turno`, `efetivo_turno`, `equipes_postos`, `equipes_escalas`, `tipos_posto` e `rastreamento_painel` aceitam `select` sem login. As consultas vieram vazias, então a RLS está barrando as linhas. Mesmo assim, isso foge do padrão da 001 (`revoke ... from anon`).
4. **Duas tabelas de auditoria.** `historico` (001) e `auditoria` (de origem desconhecida, provavelmente gravada por trigger genérico). Vale decidir qual é a oficial.
5. **Função de IA sem verificação de JWT na borda** (`verify_jwt = false`). O `handler.ts` confere o login por conta própria.
6. **Selfies de colaboradores** usam o nome original do arquivo no caminho e não ficam numa pasta por pessoa.

## Como recuperar o resto (funções, views, RLS, buckets)

O export de tabelas não traz isso. Há duas opções.

**A. Supabase CLI** (precisa da senha do banco, em *Project Settings > Database*):

```bash
supabase link --project-ref fnqvmuvpensjofiucuty
```

```bash
supabase db dump --schema public -f supabase/migrations/000_producao_public.sql
```

**B. Sem CLI.** No SQL Editor, rode as consultas abaixo e exporte o resultado:

```sql
-- funções
select p.proname, pg_get_functiondef(p.oid) from pg_proc p where p.pronamespace = 'public'::regnamespace order by 1;
-- views
select viewname, definition from pg_views where schemaname = 'public' order by 1;
-- políticas de acesso (tabelas e storage)
select schemaname, tablename, policyname, cmd, roles, qual, with_check from pg_policies where schemaname in ('public','storage') order by 1,2,3;
-- triggers
select event_object_table, trigger_name, action_timing, event_manipulation, action_statement from information_schema.triggers where trigger_schema = 'public' order by 1,2;
-- buckets
select id, public, file_size_limit, allowed_mime_types from storage.buckets order by 1;
```
