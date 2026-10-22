-- Testes de autorização em banco local com migrações 001, 002, 003 e 006.
-- Executar somente em banco descartável. Falhas usam RAISE EXCEPTION.
-- Seleciona quatro identidades de teste existentes: configure os UUIDs abaixo
-- pela variável psql, sem criar usuários nem inventar dados de produção.
\set ON_ERROR_STOP on
\if :{?uid_campo}
\else
\echo 'Defina uid_campo, uid_central, uid_inteligencia, uid_admin e uid_inativo (UUID de perfis locais).'
\quit 2
\endif
begin;
create temporary table teste_ids (perfil text primary key, uid uuid);
insert into teste_ids values
 ('campo', :'uid_campo'::uuid),('central', :'uid_central'::uuid),
 ('inteligencia', :'uid_inteligencia'::uuid),('admin', :'uid_admin'::uuid),
 ('inativo', :'uid_inativo'::uuid);
do $$
declare x record; atual text; total bigint; alheios bigint;
begin
 for x in select * from teste_ids loop
   perform set_config('request.jwt.claim.sub',x.uid::text,true);
   execute 'set local role authenticated';
   select public.perfil_atual()::text into atual;
   execute 'reset role';
   if x.perfil='inativo' and atual is not null then raise exception 'perfil inativo autenticado'; end if;
   if x.perfil<>'inativo' and atual is distinct from x.perfil then raise exception 'perfil esperado %, obtido %',x.perfil,atual; end if;
 end loop;
end $$;
-- Testar leituras sob role authenticated sem alterar as tabelas.
\set uid_campo :uid_campo
set local role authenticated;
select set_config('request.jwt.claim.sub',:'uid_campo',true);
do $$
begin
 if exists(select 1 from public.eventos where criado_por is distinct from auth.uid()) then
   raise exception 'campo leu evento de outro usuario';
 end if;
 if exists(select 1 from storage.objects where bucket_id='evidencias'
   and (storage.foldername(name))[1] is distinct from auth.uid()::text) then
   raise exception 'campo leu foto de outro usuario';
 end if;
 if exists(select 1 from public.historico) then raise exception 'campo leu historico'; end if;
 if exists(select 1 from public.ocorrencia_ia) then raise exception 'campo leu analises IA'; end if;
end $$;
reset role;
-- Conferência estrutural de política de escrita direta (INSERT/UPDATE/DELETE).
-- Não executa escrita: as funções RPC são a via autorizada.
do $$
declare tbl text; cmd text;
begin
 foreach tbl in array array['eventos','evento_fotos','ocorrencias','historico','ocorrencia_ia','perfis'] loop
   foreach cmd in array array['INSERT','UPDATE','DELETE'] loop
     if tbl = 'perfis' and cmd='UPDATE' then continue; end if;
     if exists(select 1 from pg_policies p where p.schemaname='public' and p.tablename=tbl
       and (p.cmd=cmd or p.cmd='ALL') and p.qual='true') then
       raise exception 'Politica incondicional: %.%',tbl,cmd;
     end if;
   end loop;
 end loop;
end $$;
-- Admin precisa de policy de UPDATE; usuários comuns não podem elevar o perfil.
do $$
begin
 if not exists(select 1 from pg_policies where schemaname='public' and tablename='perfis'
 and cmd='UPDATE' and policyname='perfis_admin_atualiza'
 and qual ilike '%perfil_atual%' and with_check ilike '%perfil_atual%') then
 raise exception 'Policy admin de perfis ausente';
 end if;
end $$;
rollback;
\echo 'OK: verificações RLS locais concluídas (leituras e análise estrutural).'
