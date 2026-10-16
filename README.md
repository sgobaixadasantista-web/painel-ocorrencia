# Painel de Ocorrências — Security Rumo

Três painéis no padrão visual **DNA Rumo**, com **Supabase** como banco, login e armazenamento de fotos:

| Painel | Quem usa | O que faz |
|---|---|---|
| **Campo** | equipe de campo (celular) | Registra o evento em 4 etapas (local com GPS opcional, relato, fotos, revisão), **mesmo sem sinal**: o registro fica salvo no aparelho e é enviado sozinho quando a conexão volta. Acompanha o andamento dos próprios registros |
| **Central** | central de atendimento | Fila de eventos do campo, triagem (criminal vira ocorrência; mecânico, social ou natural é finalizado), análises, exportação |
| **Inteligência** | inteligência (investigação) | Fila de ocorrências, análise por IA, boletim de ocorrência, classificação (Prevenção, Natural, Mecânica, Social, Criminal), conclusão, gráficos |

Cada pessoa abre o painel do seu perfil. O perfil **admin** vê os três e troca pelo menu da conta (ícone de pessoa na topbar).

## Estrutura

```
index.html                      página (a mesma para os três painéis)
css/ tokens.css rumo.css app.css   DNA Rumo (tokens e componentes oficiais) + ajustes de layout
js/config.js                    URL e chave do Supabase, prazos de SLA     <- você edita este
js/data.js                      acesso aos dados (Supabase ou demonstração)
js/app.js                       telas e ações da central e da inteligência
js/campo.js                     painel de campo (registro em etapas, fotos, GPS, sincronização)
js/fila.js                      fila offline do aparelho (IndexedDB)
sw.js manifest.webmanifest      app instalável e abertura sem internet
assets/                         fontes Inter, logos e ícones ferroviários do DNA Rumo
supabase/migrations/
  001_painel_ocorrencias.sql    tabelas, regras de acesso por perfil, funções do fluxo, fotos
  002_inteligencia.sql          análises de IA, indicadores e gráficos da inteligência
  003_campo.sql                 registro sem sinal (horário real, sem duplicar), GPS, contas novas inativas
  004_tipificacao.sql           natureza > tipo > subtipo (156 combinações), formulários por combinação, triagem única
  005_agentes_ia.sql            3 agentes de IA e 7 minutas do Rumo - SLA, editáveis só por admin
supabase/dados/                 planilha de tipificação e configuração dos agentes (fonte dos dados iniciais)
supabase/atualizar_*.sql        reaplicam a planilha e os agentes sem apagar o que você ajustou
tools/                          gerar_tipificacao.py e gerar_agentes.py (geram os SQL e os dados da demonstração)
js/tipificacao-demo.js minutas-demo.js   dados só do modo demonstração (no modo normal vêm do banco)supabase/functions/analisar-ocorrencia/   função segura que chama a IA (a chave fica só no servidor)
supabase/seed_demo.sql          eventos de exemplo (opcional, só para teste)
```

## Como colocar no ar

1. **Crie um projeto** em supabase.com.
2. **Rode o banco:** *SQL Editor* > cole `001_painel_ocorrencias.sql` > *Run*; depois `002_inteligencia.sql`, `003_campo.sql`, `004_tipificacao.sql` e `005_agentes_ia.sql`. Cada um **uma vez só**, nessa ordem.
3. **Crie as pessoas:** *Authentication > Users > Add user* (e-mail e senha). Toda conta nova nasce **inativa**: não abre painel nenhum até você liberar.
4. **Libere cada pessoa e dê o perfil**, no *SQL Editor*:
   ```sql
   update public.perfis set perfil = 'campo',        ativo = true, nome = 'Nome' where email = 'campo@empresa.com';
   update public.perfis set perfil = 'central',      ativo = true, nome = 'Nome' where email = 'central@empresa.com';
   update public.perfis set perfil = 'inteligencia', ativo = true, nome = 'Nome' where email = 'inteligencia@empresa.com';
   update public.perfis set perfil = 'admin',        ativo = true, nome = 'Nome' where email = 'voce@empresa.com';
   ```
   Perfis: `campo`, `central`, `inteligencia`, `admin`. Para desativar alguém: `update public.perfis set ativo = false where email = '...'`.
5. **Configure o painel:** em `js/config.js`, preencha `SUPABASE_URL` e `SUPABASE_ANON_KEY` (Supabase > *Project Settings > API*, chave **anon public**).
6. **Publique a pasta** em hospedagem de arquivos estáticos (Netlify, Vercel, GitHub Pages, servidor interno), com **HTTPS** (obrigatório para o GPS, a câmera e a abertura sem internet).
7. **Ligue a IA (opcional, só para a inteligência).** Com a [Supabase CLI](https://supabase.com/docs/guides/cli) instalada e ligada ao projeto (`supabase link`):
   ```
   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
   supabase functions deploy analisar-ocorrencia
   ```
   Opcional: `supabase secrets set ANTHROPIC_MODEL=<modelo>` (o padrão é `claude-sonnet-5-5`). Sem isso, o botão da IA mostra "a análise por IA ainda não foi configurada" e o resto do painel funciona normalmente.
8. **(Opcional)** `supabase/seed_demo.sql` cria eventos de exemplo em ambiente de teste.

Sem preencher o passo 5, o painel abre em **modo demonstração**: dados fictícios, IA simulada, nada gravado. Na demonstração, o menu da conta tem **"Simular sem sinal"**, para ver a fila offline do campo funcionando.

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

Na triagem, a central escolhe **Natureza ➜ Tipo ➜ Subtipo** (156 combinações, vindas da planilha da Rumo) e cada combinação **abre o formulário de referência** com os campos daquele caso.

- **9 formulários:** composição, via, apreensão, pessoas, acidente, obstrução, manutenção, prevenção e básico. Cada combinação aponta para um deles (tabela `tipificacao`, coluna `formulario`).
- **Campos obrigatórios:** só o km (e, na apreensão, o material localizado). O resto é opcional e fica recolhido por grupo (composição, local, estatística).
- **Formato dos campos:** km sempre como `115+500` (a tela converte `115,500`), horas como `HH:MM`, quantidade de material **só como número de recipientes**, sem peso nem litros.
- **Natureza criminal** cria a ocorrência para a inteligência; **mecânica, social e natural** são finalizadas pela central, com observação. Nos dois casos ficam gravados a tipificação e os dados do formulário.
- **Para ajustar:** *Table Editor* > `formularios` (campos, em JSON) e `tipificacao` (qual formulário cada combinação abre). Cada mudança nos campos sobe a versão e registra quem mudou. Se a planilha da Rumo mudar, gere o SQL de novo com `python3 tools/gerar_tipificacao.py planilha.xlsx` e rode `supabase/atualizar_tipificacao.sql`: combinações que saírem da planilha ficam inativas, sem quebrar registros antigos.
- A triagem passa por **uma única função do banco** (`triar_evento`), que valida o formulário. Não existe caminho para pular os campos obrigatórios.

## Como a IA funciona (3 agentes em cadeia)

A inteligência clica em **Analisar com IA** na ocorrência. A função do Supabase confere login e perfil (só `inteligencia` e `admin`), lê o registro com as regras de acesso da pessoa e roda os 3 agentes do Rumo - SLA:

| Ordem | Agente | O que entrega |
|---|---|---|
| 1 | Analista de Qualidade de Registros | Dados extraídos para o boletim, nota de 0 a 10, viabilidade de BO e relatório estatístico padronizado |
| 2 | Especialista em Tipificação Penal | Artigo do Código Penal (uso interno) e o **número** da minuta aplicável |
| 3 | Redator Técnico de BO | Parecer final de até 1.200 caracteres, pronto para a Delegacia Digital |

**Os textos dos agentes e das minutas são os do Rumo - SLA, sem alteração.** Só o formato de saída da IA foi adaptado (JSON), para o sistema conseguir ler. Ficam nas tabelas `agentes_ia` e `minutas_bo`: só o admin edita, e cada análise guarda a versão usada.

O que os textos só **pediam** à IA, o sistema **confere por código**:
- só as seções 1 a 3 do agente 1 seguem adiante; o relatório estatístico (com o nome do maquinista) nunca chega ao redator;
- a IA escolhe o número da minuta; **o texto aprovado vem do cadastro** e nunca é reescrito por ela;
- se o agente 1 diz "SEM BO APLICÁVEL", os agentes 2 e 3 nem rodam e nenhuma chamada de IA é gasta;
- o parecer passa por 10 verificações feitas pelo sistema: até 1.200 caracteres (contados por código), sem colchetes, abertura e encerramento exatos, bloco de modus operandi intacto, sem termos proibidos, siglas, datas e horários, pessoas, peso e volume;
- se uma verificação falha, o redator tenta de novo uma vez; se continuar falhando, o texto é gravado com **"ATENÇÃO: REVISAR MANUALMENTE"** e as falhas à vista;
- o relatório estatístico tem o formato normalizado (km `120,570` vira `120+570`, valor fora do padrão vira `NÃO INFORMADO`).

**O texto da IA é uma sugestão: quem registra o boletim confere cada fato.** Além disso: o texto do registro é tratado como dado, não como instrução; a resposta é validada antes de gravar; há no máximo uma análise a cada 15 segundos por ocorrência. As perguntas que dependem do jurídico e da operação estão em um documento à parte (veja a lista de perguntas entregue junto).

## Segurança (leia antes de publicar)

- A chave **anon** pode ficar no navegador; a **service_role** e a chave da IA **nunca**. A chave da IA fica nos segredos da função.
- O navegador **não grava direto nas tabelas**: toda escrita passa por funções do banco que conferem perfil e regras (por exemplo, não dá para fazer a triagem do mesmo evento duas vezes, nem alterar uma classificação).
- Em *Authentication > Providers > Email*, **desligue "Allow new users to sign up"** se o cadastro deve ser só por convite.
- **Tipificação, formulários, agentes e minutas** só o admin edita. A IA nunca grava direto: passa pela função do banco, que confere perfil, formato e frequência.
- **Contas novas nascem inativas.** Como o campo agora grava eventos, ninguém entra só por criar conta.
- Fotos em bucket **privado**, por links temporários de 1 hora; cada pessoa só envia para a própria pasta e o banco recusa foto de outra pessoa. Campo vê só os eventos que registrou. Análises de IA só são lidas por inteligência e admin; o histórico de auditoria também.

## Suposições a validar com a Rumo

As perguntas completas, com o que o sistema faz hoje em cada caso, estão na lista de perguntas ao jurídico e à operação. As principais:

- **Textos fixos das minutas** afirmam fatos (escolta informou, patrulhamento, preservação do material) que o registro pode não conter. O sistema usa o texto aprovado sem alterar.
- **Cobertura:** não há minuta para roubo, ataques, incêndio criminoso, receptação nem dano em instalações de via; esses casos terminam em "SEM PARECER".
- **Natureza x classificação:** a natureza da triagem e a classificação da inteligência são tratadas como campos separados.
- **Formulários:** os 9 formulários e os campos obrigatórios são proposta nossa, a partir dos dados que os agentes pedem.
- **Prazos do cronômetro:** atenção após 4 h, atrasado após 24 h (`PRAZO_ATENCAO_H` e `PRAZO_CRITICO_H`, em `js/config.js`).
- **Encerramento da ocorrência:** a Rumo não mostrou como se conclui. Aqui a inteligência conclui depois de classificar.
- **Classificar tira a ocorrência da fila "Ag. classificação"** (passa a "Em andamento"), mesmo sem análise. No Rumo - SLA o status só mudava com a análise.
- **Tipos e subtipos:** vieram do que foi visto no Rumo - SLA; só APREENSÃO tem subtipos. Edite `tipos_ocorrencia` e `subtipos_ocorrencia` no *Table Editor*.
- **Fuso:** "hoje" e a numeração por ano usam `America/Sao_Paulo`.

## O que foi testado

- **Banco (Postgres real, com as peças do Supabase simuladas):** permissões por perfil, leitura restrita, bloqueio de escrita direta, triagem com validação dos formulários, 156 combinações, agentes e minutas (texto idêntico ao do Rumo - SLA), numeração, fotos, indicadores.
- **Cadeia dos 3 agentes, contra o banco real (72 verificações):** ordem e entradas de cada agente, relatório estatístico que não segue adiante, texto da minuta vindo do cadastro, encerramentos, nova tentativa e "revisar manualmente", as 7 minutas preenchidas passando nas 10 verificações, erros típicos barrados. A chamada à API da Anthropic foi simulada.
- **Painéis (navegador, modo demonstração):** os três fluxos completos, filtros, exportação, tema escuro, celular. No campo: GPS, fotos reduzidas, rascunho, fila offline com recarga da página no meio, reenvio sem duplicar, erro de validação e abertura sem internet (service worker).
- **Camada do Supabase (cliente simulado):** consultas, funções, fotos assinadas, tempo real, login, mensagens de erro e roteamento por perfil.

**Ainda não testado contra serviços reais:** o projeto Supabase de verdade (e-mail do login, tempo real ao vivo, upload de fotos), a **chamada real à IA** e **aparelhos reais** (câmera, GPS e instalação no celular foram simulados no navegador). Antes de liberar para a equipe, teste com a conta de um colega e analise uma ocorrência de teste.

## Próximos passos naturais

Teste de campo com 2 ou 3 pessoas em área sem sinal; avisos (e-mail ou WhatsApp) quando um evento passa do prazo; e envio em segundo plano no Android (hoje o envio acontece com o aplicativo aberto).
