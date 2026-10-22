# Painel de Ocorrências — Security Rumo

Três painéis no padrão visual **DNA Rumo**, com **Supabase** como banco, login e armazenamento de fotos:

| Painel | Quem usa | O que faz |
|---|---|---|
| **Campo** | equipe de campo (celular) | Registra o evento em 4 etapas (local com GPS opcional, relato, fotos, revisão), **mesmo sem sinal**: o registro fica salvo no aparelho e é enviado sozinho quando a conexão volta. Acompanha o andamento dos próprios registros |
| **Central** | central de atendimento | Fila de eventos do campo, triagem (criminal vira ocorrência; mecânico, social ou natural é finalizado), análises, exportação |
| **Inteligência** | inteligência (investigação) | Fila de ocorrências, análise por IA, boletim de ocorrência, classificação (Prevenção, Natural, Mecânica, Social, Criminal), conclusão, gráficos |

Cada pessoa abre o painel do seu perfil. O perfil **admin** vê os três e troca pelo menu da conta (ícone de pessoa na topbar).

## Estrutura

```text
index.html                          entrada dos painéis
css/                                tokens, rumo, app, design-system, navigation,
                                    photo-gallery e modules
js/                                 app, data, campo, fila, config, navigation,
                                    photo-gallery, rastreamento, efetivo,
                                    veiculos, frota, colaboradores e dados de demonstração
assets/                             ícones, fontes e imagens
sw.js                               service worker de cache v3
manifest.webmanifest                metadados do PWA
supabase/migrations/
  001_painel_ocorrencias.sql       esquema e fluxo inicial
  002_inteligencia.sql             complemento de inteligência
  003_campo.sql                    complemento de campo/offline
  006_fotos_leitura.sql            correção de leitura de evidências
supabase/functions/analisar-ocorrencia/
  index.ts                          integração Supabase
  handler.ts                        validação, análise OpenAI e persistência
  handler_test.ts                   testes Deno
supabase/config.toml                configuração da Edge Function
tools/testar-cache.js               verificação do precache
docs/BANCO-PENDENTE.md              lacunas do SQL em relação ao código
```

**Pendente:** `004_tipificacao.sql`, `005_agentes_ia.sql`, `supabase/dados/` e `supabase/atualizar_*.sql` não foram localizados no repositório auditado. Não deduzir seu conteúdo nem afirmar instalação integral sem os arquivos originais. Consulte `docs/BANCO-PENDENTE.md`.

## Como colocar no ar

> **Atenção:** as migrações 001–003 não criam todos os objetos usados pelos módulos atuais. Esta versão **não é uma instalação completa do zero**; é necessário reconciliar o banco de destino com `docs/BANCO-PENDENTE.md` antes de ativar os módulos dependentes.

1. Crie ou selecione um projeto Supabase para validação, sem sobrescrever dados existentes.
2. Em ambiente **novo de teste**, aplique somente os arquivos SQL existentes, na ordem: `001_painel_ocorrencias.sql`, `002_inteligencia.sql`, `003_campo.sql`. Não tente executar 004 ou 005 ausentes.
3. Confira as dependências pendentes no banco de destino. Só depois aplique `006_fotos_leitura.sql`, que restringe o bucket privado `evidencias`; revise se objetos antigos seguem a pasta `<auth.uid()>/...`.
4. Configure usuários e perfis conforme os mecanismos de autenticação e RLS da instância. Não publique acessos sem testar a autorização.
5. Preencha em `js/config.js` somente URL e chave **anon/publishable** do Supabase. Nunca inclua segredos da IA no navegador.
6. Publique os arquivos estáticos em HTTPS. Antes, execute `node tools/testar-cache.js` e `node --check sw.js`. O service worker usa cache `v3`.
7. **IA (opcional):** configure no ambiente da Edge Function `OPENAI_API_KEY`; opcionalmente `OPENAI_MODEL` (padrão `gpt-4o-mini`) e `ALLOWED_ORIGIN` com a origem HTTPS exata do painel. Apenas em desenvolvimento o valor padrão de `ALLOWED_ORIGIN` é `*`. A função chama `https://api.openai.com/v1/chat/completions` e interpreta `choices[0].message.content`. Publique com `supabase functions deploy analisar-ocorrencia`. O token Bearer é validado no handler por `perfil_atual`, conforme `supabase/config.toml`.
8. Execute `deno test supabase/functions/analisar-ocorrencia/handler_test.ts` onde o Deno estiver instalado. Depois valide o fluxo com contas reais autorizadas.

**Não foi feita implantação nem migração automática por estas instruções.** O modo demonstração não confirma o funcionamento do banco real.

## Painel de campo: como funciona sem sinal

1. A pessoa preenche as 4 etapas. Ao enviar, o registro (texto, horário, GPS e **fotos já reduzidas**) é gravado **primeiro no aparelho**.
2. Se há conexão, ele segue para o servidor na hora. Se não há, aparece em "Meus registros" como **"Neste aparelho · Aguardando envio"** e o status da topbar mostra "Offline · N aguardando envio".
3. Quando a conexão volta (ou ao abrir o aplicativo de novo), o envio acontece sozinho, na ordem. O registro só sai do aparelho quando o servidor confirma.
4. O **horário que vale é o do registro no campo**, não o do envio, então o cronômetro da central conta desde que o campo viu o fato. Relógio do aparelho errado (futuro, ou mais de 30 dias atrás) é ignorado e fica anotado no histórico.
5. Reenviar nunca duplica: cada registro tem um identificador próprio e o banco devolve o que já existe.
6. Erro que não é falta de sinal (por exemplo, texto inválido) **não fica reenviando**: o cartão mostra "Não enviado" com o motivo, e a pessoa escolhe *Tentar agora* ou *Descartar*.

**Instalar no celular:** abra o endereço no navegador e use "Adicionar à tela inicial". O aplicativo passa a abrir mesmo sem internet (com os registros já carregados e a fila do aparelho).

**Limites a conhecer:** a fila fica no aparelho e no navegador usado; limpar os dados do navegador apaga o que ainda não foi enviado. Em navegador sem armazenamento local (alguns modos anônimos), o painel avisa para não fechar a página. O app só envia enquanto está aberto (não há envio em segundo plano com a tela bloqueada).

## Tipificação e formulários

O frontend consulta `tipificacao`, `formularios` e `triar_evento` (ver `js/data.js`), mas as migrações presentes 001–003 não incluem esses objetos. Os arquivos 004 e os dados iniciais são **pendentes**. O código de demonstração não substitui o esquema de produção. **Não executar a triagem em uma instância nova** até recuperar e validar o SQL original.

## Como a IA funciona — implementação atual

**Provedor: OpenAI.** A Edge Function `analisar-ocorrencia` usa **uma única chamada** ao endpoint Chat Completions, com modelo configurável por `OPENAI_MODEL` (padrão `gpt-4o-mini`) e segredo `OPENAI_API_KEY`.

O handler confere a sessão e o perfil via `perfil_atual` (somente `inteligencia` ou `admin`), consulta `v_fila_ocorrencias` pelas permissões do solicitante, monta o registro com limites de caracteres, trata o conteúdo do relato como dado e não como instrução, extrai/valida a resposta JSON e envia a análise pela RPC `salvar_analise_ia`. A minuta é limitada a 1.200 caracteres e a nota é normalizada para 0–10. É necessário revisar a análise antes de uso oficial.

**Pendente:** a arquitetura documentada anteriormente de três agentes encadeados, minutas fixas de cadastro e dez verificações não está implementada no handler atual. Não implementá-la sem recuperar `005_agentes_ia.sql` e confirmar os objetos `agentes_ia` e `minutas_bo`.

## Segurança (leia antes de publicar)

- A chave pública do Supabase pode ficar no navegador; `service_role` e `OPENAI_API_KEY` não.
- RLS e autorização por perfil precisam ser validadas no ambiente real. A Edge Function valida o token pelo cliente Supabase vinculado ao usuário e `perfil_atual`.
- Para o bucket `evidencias`, a migração `006_fotos_leitura.sql` permite leitura completa para `central`, `inteligencia` e `admin`, e somente da pasta do próprio UID para `campo`. As URLs assinadas são geradas em `js/data.js`; `js/photo-gallery.js` apenas as apresenta.
- A Edge Function restringe `Access-Control-Allow-Origin` via `ALLOWED_ORIGIN`; configure a origem exata de produção.
- Tipificação, formulários, agentes e minutas exigem as migrações faltantes para verificar suas regras efetivas.

## Suposições a validar com a Rumo

As regras a seguir precisam de validação jurídica e operacional; algumas dependem das migrações pendentes. As principais:

- **Textos fixos das minutas** afirmam fatos (escolta informou, patrulhamento, preservação do material) que o registro pode não conter. A recuperação das minutas cadastradas está pendente.
- **Cobertura:** não há minuta para roubo, ataques, incêndio criminoso, receptação nem dano em instalações de via; esses casos terminam em "SEM PARECER".
- **Natureza x classificação:** a natureza da triagem e a classificação da inteligência são tratadas como campos separados.
- **Formulários:** os 9 formulários e os campos obrigatórios são proposta nossa, a partir dos dados que os agentes pedem.
- **Prazos do cronômetro:** atenção após 4 h, atrasado após 24 h (`PRAZO_ATENCAO_H` e `PRAZO_CRITICO_H`, em `js/config.js`).
- **Encerramento da ocorrência:** a Rumo não mostrou como se conclui. Aqui a inteligência conclui depois de classificar.
- **Classificar tira a ocorrência da fila "Ag. classificação"** (passa a "Em andamento"), mesmo sem análise. No Rumo - SLA o status só mudava com a análise.
- **Tipos e subtipos:** vieram do que foi visto no Rumo - SLA; só APREENSÃO tem subtipos. Edite `tipos_ocorrencia` e `subtipos_ocorrencia` no *Table Editor*.
- **Fuso:** "hoje" e a numeração por ano usam `America/Sao_Paulo`.

## O que foi testado

Os arquivos 001–003 e os caminhos de uso de SQL foram inspecionados no repositório. A existência das referências estáticas do `index.html` e dos recursos adicionais no cache foi conferida por leitura do repositório. Foi incluído `tools/testar-cache.js` para repetir a checagem no clone e `handler_test.ts` com casos de extração de JSON, formato inválido, status inesperado, nota normalizada e limites de caracteres.

**Ainda não executado nesta revisão:** `deno test` (Deno não instalado no ambiente disponível), testes autenticados de RLS/Storage, integração com a API OpenAI, testes visuais de navegador, migrações reais e implantação. Consulte os resultados de checks da entrega; não considerar esses fluxos aprovados sem execução.

## Próximos passos naturais

Teste de campo com 2 ou 3 pessoas em área sem sinal; avisos (e-mail ou WhatsApp) quando um evento passa do prazo; e envio em segundo plano no Android (hoje o envio acontece com o aplicativo aberto).
