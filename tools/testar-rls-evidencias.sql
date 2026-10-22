-- Teste de regressão SOMENTE LEITURA para a policy storage.evidencias_leitura.
-- Executar em projeto de teste ou sessão autorizada de auditoria.
-- Não imprime IDs nem dados dos objetos; substitui JWT na transação e desfaz ao sair.
-- Antes da migração 006, arquivos_alheios_visiveis pode ser > 0 (FALHA).
-- Depois da migração 006, o esperado para campo é 0.
begin read only;

select set_config(
  'request.jwt.claim.sub',
  coalesce(
    (select id::text from public.perfis where perfil = 'campo' and ativo = true limit 1),
    '00000000-0000-4000-8000-000000000001'
  ),
  true
);
set local role authenticated;

select
  public.perfil_atual()::text as perfil_testado,
  (select count(*) from storage.objects
   where bucket_id = 'evidencias'
     and (storage.foldername(name))[1] = auth.uid()::text) as proprios_visiveis,
  (select count(*) from storage.objects
   where bucket_id = 'evidencias'
     and (storage.foldername(name))[1] is distinct from auth.uid()::text) as alheios_visiveis;

rollback;
