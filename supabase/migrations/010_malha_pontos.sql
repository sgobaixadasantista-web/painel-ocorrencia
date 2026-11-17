-- =====================================================================
-- 010 — Malha ferroviária para o preenchimento do local na triagem
--   Trecho > Sigla (SB) > km  →  cidade e UF preenchidas sozinhas.
--   * public.malha_pontos: um marco por linha (a cada ~150 m), com cidade, UF e código IBGE
--     calculados pelos contornos municipais do IBGE (tools/gerar_malha.mjs).
--   * v_malha_siglas: uma linha por trecho + sigla (faixa de km e cidades), para os seletores.
--   * leitura só para quem está logado com perfil ativo; ninguém grava pelo navegador.
-- Depois desta migration, carregue os dados: Table Editor > malha_pontos > Insert > Import data from CSV
-- (arquivo supabase/dados/malha_pontos.csv). Para recarregar, esvazie antes: truncate public.malha_pontos;
-- Pode rodar de novo sem erro.
-- =====================================================================

create table if not exists public.malha_pontos (
  trecho      text    not null,
  sigla       text    not null,
  km_metros   integer not null check (km_metros >= 0),
  km_texto    text    not null check (km_texto ~ '^\d{1,4}\+\d{3}$'),
  lat         numeric(9,6) not null,
  lon         numeric(9,6) not null,
  cidade      text,
  uf          text check (uf is null or uf ~ '^[A-Z]{2}$'),
  codigo_ibge text,
  primary key (trecho, sigla, km_metros)
);
comment on table public.malha_pontos is 'Marcos da malha ferroviária (trecho > sigla > km) com cidade e UF. Gerada por tools/gerar_malha.mjs.';

alter table public.malha_pontos enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'malha_pontos' and policyname = 'malha_pontos_leitura') then
    create policy malha_pontos_leitura on public.malha_pontos for select to authenticated using (public.perfil_atual() is not null);
  end if;
end $$;
revoke all on public.malha_pontos from anon, authenticated;
grant select on public.malha_pontos to authenticated;

create or replace view public.v_malha_siglas with (security_invoker = true) as
select trecho, sigla,
       min(km_metros) as km_min, max(km_metros) as km_max, count(*)::int as marcos,
       string_agg(distinct cidade || '/' || uf, ', ') as cidades
  from public.malha_pontos
 group by trecho, sigla;
revoke all on public.v_malha_siglas from anon, authenticated;
grant select on public.v_malha_siglas to authenticated;
