# Banco pendente — auditoria do repositório

Auditoria em 22/10/2026. Os únicos arquivos de migração confirmados no repositório são `001_painel_ocorrencias.sql`, `002_inteligencia.sql` e `003_campo.sql`. A busca remota por branches retornou apenas `main`; a busca de commits pelo termo `tipificacao` não localizou versões recuperáveis. **Não foi possível executar `git log --all --stat` em um clone local** nesta execução. Não recriar esquemas sem migrações confiáveis.

## Objetos referenciados sem DDL nas migrações 001–003

| Objeto | Referência no código | Colunas ou parâmetros esperados | Lacuna |
|---|---|---|---|
| `tipificacao` | `js/data.js:113` | `id, natureza, tipo, subtipo, formulario, ativo` | Tabela, policies e dados da tipificação |
| `formularios` | `js/data.js:114` | `codigo, nome, descricao, campos, ativo` | Tabela, policies e dados dos formulários |
| `triar_evento` (RPC) | `js/data.js:157` | `p_evento_id, p_tipificacao_id, p_dados, p_forma` (ver demais argumentos na chamada completa) | Função e autorização |
| `veiculos` | `js/frota.js:39,50,71` | `id, placa, prefixo_frota, empresa, tipo, marca, modelo, cor, status` (ver payload da tela) | Tabela, RLS e relação com checklists |
| `veiculos_checklist` | `js/frota.js:54,71` | `veiculo_id, data_checklist, odometro_km, status_checklist, validade_checklist, criado_em` e caminhos `foto_*_path` | Tabela, RLS e bucket `veiculos-checklist-fotos` |
| `veiculo_turno` | `js/veiculos.js:36` | `equipe, placa, odometro_km, turno_chave, registrado_em, foto_placa_path, foto_odometro_path` | Tabela/view, permissões e bucket `veiculo-turno-fotos` |
| `colaboradores` | `js/colaboradores.js:10–12` | `id, matricula, nome_completo, empresa, contato, funcao, trecho_atuacao, equipe_posto, supervisor_responsavel, turno_habitual, status, selfie_path` | Tabela, RLS e bucket `colaboradores-selfies` |
| `efetivo_turno` | `js/efetivo.js:25` | `equipe, matricula, nome, turno_chave, registrado_em, foto_path` | Tabela/view, permissões e bucket `efetivo-selfies` |
| `rastreamento_painel` | `js/rastreamento.js:48` | `dispositivo_id, equipe, turno_ativo, latitude, longitude, coletado_em, recebido_em, bateria_percentual, carregando, precisao_m, modo, status_conexao` | View/tabela e políticas de leitura |
| `agentes_ia` | `README.md` (não localizado acesso direto em JS atual) | **Não dedutível com segurança** | DDL e seed da arquitetura legada de 3 agentes |
| `minutas_bo` | `README.md` e `js/minutas-demo.js` (dados de demonstração) | **Não dedutível com segurança** | DDL e seed das minutas |

As linhas indicadas se referem ao estado do repositório auditado e devem ser revisadas caso os arquivos sejam alterados. O objeto `evidencias` já é criado em `001_painel_ocorrencias.sql`, mas sua policy de leitura ampla exige a migração corretiva `006_fotos_leitura.sql`.

## Arquivos ausentes ou não verificados

- `supabase/migrations/004_tipificacao.sql` — ausente.
- `supabase/migrations/005_agentes_ia.sql` — ausente.
- `supabase/dados/` e `supabase/atualizar_*.sql` — referências do README que não devem ser tratadas como entrega existente.
- Não executar as funcionalidades que dependem dos objetos acima em uma instalação nova sem obter o DDL original e validar o estado real da instância Supabase.

## Evidências e leitura

`js/data.js:167` grava evidências na pasta do usuário; `js/data.js:214–215` gera URLs assinadas. `js/campo.js` usa a camada de dados; `js/photo-gallery.js` só exibe URLs recebidas. O campo poderá obter novas URLs **dos próprios objetos** após aplicar a policy 006, desde que os caminhos existentes sigam o padrão `<auth.uid()>/<arquivo>`. Objetos históricos fora desse padrão exigem auditoria.
