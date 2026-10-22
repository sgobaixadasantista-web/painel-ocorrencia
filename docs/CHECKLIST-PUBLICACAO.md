# Checklist de publicação — Security CCS

Aplicar primeiro em homologação e registrar a validação de cada etapa.

- [ ] Conferir migrações 001, 002, 003 e 006 no banco de destino.
- [ ] Verificar **docs/BANCO-PENDENTE.md**: as migrações 004 e 005 não foram recuperadas. Não publicar funcionalidades dependentes sem DDL confirmado.
- [ ] Verificar RLS e permissões de leitura e escrita usando identidades de teste.
- [ ] Conferir usuários do Supabase Auth, perfis e situação ativo/inativo.
- [ ] Configurar a URL e a chave pública em `js/config.js`; nunca incluir segredos.
- [ ] Configurar `OPENAI_API_KEY` e `OPENAI_MODEL` na Edge Function.
- [ ] Definir `ALLOWED_ORIGIN` exatamente como a origem HTTPS da aplicação.
- [ ] Fazer deploy da Edge Function `analisar-ocorrencia`.
- [ ] Desligar cadastro aberto em Supabase Auth, se a política da operação exigir contas por convite.
- [ ] Executar `node tools/testar-cache.js`, `deno check` e `deno test` e conferir GitHub Actions.
- [ ] Testar o aplicativo com contas reais de homologação: campo, central, inteligência, admin e inativo.
- [ ] Testar URLs assinadas: campo acessa fotos próprias e recebe bloqueio nas fotos de terceiros.
- [ ] Confirmar o deploy estático, revalidar PWA/cache v3 e registrar o commit publicado.

**Não aplicar migrações nem alterar políticas em produção somente com base nesta lista.** A conferência do schema real e a aprovação operacional vêm antes.
