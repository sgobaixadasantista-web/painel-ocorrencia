-- Catálogo auxiliar para o seletor de função dos colaboradores.
-- Aproveita valores já registrados, sem criar funções fictícias.
create table if not exists public.aux_funcoes (
  nome text primary key check (length(btrim(nome)) > 0),
  ordem integer not null default 0,
  ativo boolean not null default true
);
alter table public.aux_funcoes enable row level security;
drop policy if exists aux_funcoes_leitura on public.aux_funcoes;
create policy aux_funcoes_leitura on public.aux_funcoes
for select to authenticated using (public.perfil_atual() is not null);
drop policy if exists aux_funcoes_admin on public.aux_funcoes;
create policy aux_funcoes_admin on public.aux_funcoes
for all to authenticated
using (public.perfil_atual() = 'admin')
with check (public.perfil_atual() = 'admin');
revoke all on public.aux_funcoes from anon, authenticated;
grant select, insert, update, delete on public.aux_funcoes to authenticated;
insert into public.aux_funcoes (nome)
select distinct btrim(funcao)
from public.colaboradores
where nullif(btrim(funcao), '') is not null
on conflict (nome) do nothing;
