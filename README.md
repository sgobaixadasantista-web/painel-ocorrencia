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
supabase/functions/analisar-ocorrencia/   função segura que chama a IA (a chave fica só no servidor)
supabase/seed_demo.sql          eventos de exemplo (opcional, só para teste)
```

## Como colocar no ar

1. **Crie um projeto** em supabase.com.
2. **Rode o banco:** *SQL Editor* > cole `001_painel_ocorrencias.sql` > *Run*; depois `002_inteligencia.sql`; depois `003_campo.sql`. Cada um **uma vez só**, nessa ordem.
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
   supabase secrets set OPENAI_API_KEY=sk-proj-...
   supabase functions deploy analisar-ocorrencia
   ```
   Opcional: `supabase secrets set OPENAI_MODEL=<modelo>` (o padrão é `gpt-4o-mini`). Sem a chave, o botão da IA mostra "a análise por IA ainda não foi configurada" e o resto do painel funciona normalmente. A chave é obtida na plataforma da OpenAI e deve ficar somente nos segredos do Supabase.
   A configuração em `supabase/config.toml` desativa a verificação JWT automática do gateway para essa função, necessária para permitir o preflight CORS do navegador. A própria função valida o token da sessão e o perfil `inteligencia`/`admin` antes de processar a solicitação. Faça o deploy a partir da raiz do projeto para aplicar essa configuração.
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

## Como a IA funciona

A inteligência clica em **Analisar com IA** em uma ocorrência. A função do Supabase confere o login e o perfil (só `inteligencia` e `admin`), lê o registro com as regras de acesso da própria pessoa, pede a análise à IA e grava o resultado. A IA devolve:

- **nota de qualidade do registro** (0 a 10) e justificativa;
- **viabilidade de boletim** (viável ou sem BO aplicável);
- **tipificação** (artigo do Código Penal, *uso interno*);
- **minuta do boletim** (até 1.200 caracteres) e a lista do que não foi encontrado no registro.

Proteções: a IA só pode usar o que está escrito no registro (o que faltar vira `NÃO INFORMADO`), o texto do registro é tratado como dado e não como instrução, a resposta é validada antes de gravar, e há no máximo uma análise a cada 15 segundos por ocorrência. **O texto da IA é uma sugestão: quem registra o boletim precisa conferir cada fato.**

## Segurança (leia antes de publicar)

- A chave **anon** pode ficar no navegador; a **service_role** e a chave da IA **nunca**. A chave da IA fica nos segredos da função.
- O navegador **não grava direto nas tabelas**: toda escrita passa por funções do banco que conferem perfil e regras (por exemplo, não dá para fazer a triagem do mesmo evento duas vezes, nem alterar uma classificação).
- Em *Authentication > Providers > Email*, **desligue "Allow new users to sign up"** se o cadastro deve ser só por convite.
- **Contas novas nascem inativas.** Como o campo agora grava eventos, ninguém entra só por criar conta.
- Fotos em bucket **privado**, por links temporários de 1 hora; cada pessoa só envia para a própria pasta e o banco recusa foto de outra pessoa. Campo vê só os eventos que registrou. Análises de IA só são lidas por inteligência e admin; o histórico de auditoria também.

## Suposições a validar com a Rumo

- **Prazos do cronômetro:** atenção após 4 h, atrasado após 24 h (`PRAZO_ATENCAO_H` e `PRAZO_CRITICO_H`, em `js/config.js`).
- **Encerramento da ocorrência:** a Rumo não mostrou como se conclui. Aqui a inteligência conclui depois de classificar.
- **Classificar tira a ocorrência da fila "Ag. classificação"** (passa a "Em andamento"), mesmo sem análise. No Rumo - SLA o status só mudava com a análise.
- **Tipos e subtipos:** vieram do que foi visto no Rumo - SLA; só APREENSÃO tem subtipos. Edite `tipos_ocorrencia` e `subtipos_ocorrencia` no *Table Editor*.
- **Fuso:** "hoje" e a numeração por ano usam `America/Sao_Paulo`.

## O que foi testado

- **Banco (Postgres real, com as peças do Supabase simuladas):** permissões por perfil, leitura restrita, bloqueio de escrita direta, regras do fluxo, numeração, fotos, análises de IA, indicadores.
- **Função da IA, contra o banco real:** perfil sem permissão não gasta chamadas, chave só no servidor, respostas ruins da IA não gravam nada, limite de frequência, registro com instruções maliciosas tratado como dado. A chamada à API da OpenAI foi simulada.
- **Painéis (navegador, modo demonstração):** os três fluxos completos, filtros, exportação, tema escuro, celular. No campo: GPS, fotos reduzidas, rascunho, fila offline com recarga da página no meio, reenvio sem duplicar, erro de validação e abertura sem internet (service worker).
- **Camada do Supabase (cliente simulado):** consultas, funções, fotos assinadas, tempo real, login, mensagens de erro e roteamento por perfil.

**Ainda não testado contra serviços reais:** o projeto Supabase de verdade (e-mail do login, tempo real ao vivo, upload de fotos), a **chamada real à API da OpenAI** e **aparelhos reais** (câmera, GPS e instalação no celular foram simulados no navegador). Antes de liberar para a equipe, configure a chave, teste com a conta de um colega e analise uma ocorrência de teste.

## Próximos passos naturais

Teste de campo com 2 ou 3 pessoas em área sem sinal; avisos (e-mail ou WhatsApp) quando um evento passa do prazo; e envio em segundo plano no Android (hoje o envio acontece com o aplicativo aberto).
