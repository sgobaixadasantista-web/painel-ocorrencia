-- 018 — Catálogo de artigos penais da IA da mesa de investigação (rode DEPOIS da 001 e ANTES do
--       supabase/atualizar_artigos.sql gerado por tools/gerar_artigos.py).
--
-- A função analisar-ocorrencia manda à IA só os artigos ativos deste catálogo, com o caput oficial, e recusa
-- qualquer artigo fora dele. A base é a planilha artigos_rumo (revisada com o texto do Planalto); a carga fica em
-- supabase/dados/artigos-penais.json. Para mudar: edite a planilha ou o JSON, gere o SQL de novo e rode a carga.
--
-- Leitura: só inteligência e admin (quem usa a análise por IA). Ninguém grava pelo navegador.
-- Banco: o mesmo do app de campo (numeração única: 001 a 018 nos dois repositórios). Pode rodar de novo sem erro.

do $$ begin
  if to_regprocedure('public.perfil_atual()') is null then
    raise exception 'Rode antes a migration 001_painel_ocorrencias.sql (não existe public.perfil_atual).';
  end if;
end $$;

create table if not exists public.artigos_penais (
  codigo        text primary key check (codigo ~ '^[A-Z0-9]+_[0-9A-Z-]+$'),
  ordem         int  not null default 0,
  titulo        text not null check (length(titulo) between 3 and 160),
  artigo        text not null check (length(artigo) between 4 and 40),
  lei           text not null check (length(lei) between 3 and 120),
  caput         text not null check (length(caput) between 10 and 2000),
  pena          text not null default '' check (length(pena) <= 600),
  fonte         text not null default '',
  observacao    text not null default '',
  ativo         boolean not null default true,
  atualizado_em timestamptz not null default now()
);

alter table public.artigos_penais enable row level security;

drop policy if exists artigos_penais_leitura on public.artigos_penais;
create policy artigos_penais_leitura on public.artigos_penais for select to authenticated
  using (public.perfil_atual() in ('inteligencia', 'admin'));

revoke all on public.artigos_penais from public, anon, authenticated;
grant select on public.artigos_penais to authenticated;
