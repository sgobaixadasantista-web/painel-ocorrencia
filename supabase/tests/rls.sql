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
create temporary table rls_referencia as
select
 (select count(*) from storage.objects where bucket_id='evidencias') as arquivos,
 (select count(*) from public.historico) as historicos,
 (select count(*) from public.ocorrencia_ia) as analises_ia;
grant select on rls_referencia to authenticated;
do $
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
-- Central, inteligência e admin devem enxergar todas as pastas de evidências.
-- Usar números totais somente no banco descartável de testes.
\set uid_central :uid_central
select set_config('request.jwt.claim.sub',:'uid_central',true);
set local role authenticated;
do $$
begin
 if (select count(*) from storage.objects where bucket_id='evidencias') <>
    (select arquivos from rls_referencia) then
    raise exception 'Central não leu todas as evidências';
 end if;
 if exists(select 1 from public.historico) then
   raise exception 'central nao deveria ler historico';
 end if;
 if exists(select 1 from public.ocorrencia_ia) then
   raise exception 'central nao deveria ler IA';
 end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub',:'uid_inteligencia',true);
set local role authenticated;
do $$ begin
 if public.perfil_atual()::text <> 'inteligencia' then raise exception 'inteligencia sem perfil'; end if;
 if (select count(*) from storage.objects where bucket_id='evidencias')<>(select arquivos from rls_referencia) then raise exception 'Inteligência sem acesso total às evidências'; end if;
 if (select count(*) from public.historico)<>(select historicos from rls_referencia) then raise exception 'Inteligência sem acesso total ao histórico'; end if;
 if (select count(*) from public.ocorrencia_ia)<>(select analises_ia from rls_referencia) then raise exception 'Inteligência sem acesso total à IA'; end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub',:'uid_admin',true);
set local role authenticated;
do $$ begin
 if public.perfil_atual()::text <> 'admin' then raise exception 'admin sem perfil'; end if;
 if (select count(*) from storage.objects where bucket_id='evidencias')<>(select arquivos from rls_referencia) then raise exception 'Admin sem acesso total às evidências'; end if;
 if (select count(*) from public.historico)<>(select historicos from rls_referencia) then raise exception 'Admin sem acesso total ao histórico'; end if;
 if (select count(*) from public.ocorrencia_ia)<>(select analises_ia from rls_referencia) then raise exception 'Admin sem acesso total à IA'; end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub',:'uid_inativo',true);
set local role authenticated;
do $$
begin
 if public.perfil_atual() is not null then raise exception 'perfil inativo ativo'; end if;
 if exists(select 1 from public.eventos) then raise exception 'inativo leu eventos'; end if;
 if exists(select 1 from storage.objects where bucket_id='evidencias') then raise exception 'inativo leu evidencias'; end if;
end $$;
reset role;
-- Privilégios diretos são compartilhados pelo papel SQL authenticated,
-- independentemente do perfil de negócio. Não devem permitir gravação direta.
do $$
declare tabela text; operacao text;
begin
 foreach tabela in array array['eventos','evento_fotos','ocorrencias',
   'ocorrencia_analises','historico','ocorrencia_ia','contadores'] loop
   foreach operacao in array array['INSERT','UPDATE','DELETE'] loop
     if has_table_privilege('authenticated','public.'||tabela,operacao) then
       raise exception 'Gravação direta concedida: %.%',tabela,operacao;
     end if;
   end loop;
 end loop;
end $$;

-- Teste efetivo da tentativa de autopromoção: se houver linha de perfil de
-- campo na base local, UPDATE deve afetar zero linhas. ROLLBACK desfaz tudo.
select set_config('request.jwt.claim.sub',:'uid_campo',true);
set local role authenticated;
do $$
declare linhas integer;
begin
 update public.perfis set perfil='admin' where id=auth.uid();
 get diagnostics linhas = row_count;
 if linhas <> 0 then raise exception 'Campo conseguiu promover próprio perfil'; end if;
end $$;
reset role;
-- Um administrador ativo deve conseguir usar a política de UPDATE.
select set_config('request.jwt.claim.sub',:'uid_admin',true);
set local role authenticated;
do $$
declare linhas integer;
begin
 update public.perfis set nome=nome where id=auth.uid();
 get diagnostics linhas = row_count;
 if linhas <> 1 then raise exception 'Admin não conseguiu atualizar próprio perfil'; end if;
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
