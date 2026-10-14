-- =====================================================================
-- Painel da Inteligência — complemento do esquema (rode DEPOIS da 001)
--   * guarda as análises geradas pela IA (só inteligência e admin leem)
--   * indicadores e gráficos do painel da inteligência
--   * a visão de ocorrências passa a informar quantas análises de IA existem
-- As ações de boletim, classificação e conclusão já vêm da 001
-- (responder_boletim, classificar_ocorrencia, concluir_ocorrencia).
-- =====================================================================

-- ---------- Análises de IA ----------
create table public.ocorrencia_ia (
  id            uuid primary key default gen_random_uuid(),
  ocorrencia_id uuid not null references public.ocorrencias(id) on delete cascade,
  resultado     jsonb not null,
  modelo        text not null default '',
  criado_por    uuid references public.perfis(id),
  criado_em     timestamptz not null default now()
);
create index ocorrencia_ia_oc_idx on public.ocorrencia_ia (ocorrencia_id, criado_em desc);

alter table public.ocorrencia_ia enable row level security;
create policy ocorrencia_ia_leitura on public.ocorrencia_ia for select to authenticated
  using (public.perfil_atual() in ('inteligencia','admin'));
revoke all on public.ocorrencia_ia from anon, authenticated;
grant select on public.ocorrencia_ia to authenticated;

-- Quem grava a análise é a função do Supabase "analisar-ocorrencia", usando o login de quem pediu.
-- Aqui o banco confere perfil, formato e frequência (uma análise a cada 15 s por ocorrência).
create function public.salvar_analise_ia(p_ocorrencia_id uuid, p_resultado jsonb, p_modelo text default '')
returns public.ocorrencia_ia
language plpgsql security definer set search_path = public as $$
declare oc public.ocorrencias; ia public.ocorrencia_ia;
begin
  perform public.exige_perfil('inteligencia','admin');
  select * into oc from public.ocorrencias where id = p_ocorrencia_id;
  if not found then raise exception 'ocorrencia_nao_encontrada' using errcode = 'P0002'; end if;
  if oc.status = 'concluido' then
    raise exception 'ocorrencia_concluida' using errcode = '55000', hint = 'Ocorrência concluída não recebe novas análises.';
  end if;
  if p_resultado is null or jsonb_typeof(p_resultado) <> 'object'
     or not (p_resultado ? 'qualidade' and p_resultado ? 'viabilidade' and p_resultado ? 'tipificacao')
     or length(p_resultado::text) > 20000 then
    raise exception 'resultado_invalido' using errcode = '22023', hint = 'A resposta da IA veio em formato inesperado.';
  end if;
  if exists (select 1 from public.ocorrencia_ia where ocorrencia_id = oc.id and criado_em > now() - interval '15 seconds') then
    raise exception 'ia_recente' using errcode = '55000', hint = 'Aguarde alguns segundos antes de analisar de novo.';
  end if;
  insert into public.ocorrencia_ia (ocorrencia_id, resultado, modelo, criado_por)
  values (oc.id, p_resultado, left(coalesce(p_modelo, ''), 80), auth.uid()) returning * into ia;
  perform public.registrar_historico('ocorrencia', oc.id, 'ia_analisada', jsonb_build_object('modelo', left(coalesce(p_modelo, ''), 80)));
  return ia;
end $$;

-- ---------- Classificar já tira a ocorrência da fila "Ag. classificação" ----------
-- (na 001 o status só mudava com a primeira análise; assim uma ocorrência classificada sem análise ficava com o status errado)
create or replace function public.classificar_ocorrencia(p_ocorrencia_id uuid, p_classificacao public.classificacao_ocorrencia)
returns public.ocorrencias
language plpgsql security definer set search_path = public as $$
declare oc public.ocorrencias;
begin
  perform public.exige_perfil('inteligencia','admin');
  select * into oc from public.ocorrencias where id = p_ocorrencia_id for update;
  if not found then raise exception 'ocorrencia_nao_encontrada' using errcode = 'P0002'; end if;
  if oc.classificacao is not null then
    raise exception 'ja_classificada' using errcode = '55000', hint = 'A classificação não pode ser alterada.';
  end if;
  if oc.status = 'concluido' then
    raise exception 'ocorrencia_concluida' using errcode = '55000', hint = 'Ocorrência concluída não pode ser classificada.';
  end if;
  if oc.boletim_existe is null then
    raise exception 'responda_boletim' using errcode = '55000', hint = 'Responda sobre o boletim antes de classificar.';
  end if;
  update public.ocorrencias
     set classificacao = p_classificacao, classificado_por = auth.uid(), classificado_em = now(),
         status = case when status = 'ag_classificacao' then 'em_andamento'::public.ocorrencia_status else status end
   where id = oc.id returning * into oc;
  perform public.registrar_historico('ocorrencia', oc.id, 'classificada', jsonb_build_object('classificacao', p_classificacao));
  return oc;
end $$;

-- ---------- Visão de ocorrências: acrescenta a contagem de análises de IA (coluna nova no fim) ----------
create or replace view public.v_fila_ocorrencias with (security_invoker = true) as
select
  o.id, o.ano, o.numero,
  lpad(o.numero::text, 4, '0') || ' / ' || o.ano as numero_formatado,
  o.evento_id, lpad(e.numero::text, 4, '0') || ' / ' || e.ano as evento_numero_formatado,
  o.local, o.descricao, o.tipo, o.subtipo, o.forma_conhecimento, o.fato_em, o.analise_mesa,
  o.status, o.boletim_existe, o.boletim_numero, o.classificacao, o.classificado_em,
  o.criado_em, o.concluido_em, o.criado_por, p.nome as criado_por_nome,
  extract(epoch from (coalesce(o.concluido_em, now()) - o.criado_em))::bigint as segundos,
  (select count(*) from public.ocorrencia_analises a where a.ocorrencia_id = o.id)::int as qtd_analises,
  case when o.status = 'concluido' then 1 else 0 end as grupo,
  case when o.status = 'concluido' then -extract(epoch from o.concluido_em)
       else extract(epoch from o.criado_em) end as chave_ordem,
  (select count(*) from public.ocorrencia_ia i where i.ocorrencia_id = o.id)::int as qtd_ia
from public.ocorrencias o
join public.eventos e on e.id = o.evento_id
left join public.perfis p on p.id = o.criado_por;

-- ---------- Indicadores e gráficos do painel da inteligência ----------
create function public.resumo_inteligencia(p_dias int default 30)
returns jsonb
language sql stable security invoker set search_path = public as $$
  select jsonb_build_object(
    'ag_classificacao', (select count(*) from public.ocorrencias where status = 'ag_classificacao'),
    'em_andamento',     (select count(*) from public.ocorrencias where status = 'em_andamento'),
    'sem_boletim',      (select count(*) from public.ocorrencias where status <> 'concluido' and boletim_existe is null),
    'concluidas_hoje',  (select count(*) from public.ocorrencias
                          where status = 'concluido'
                            and (concluido_em at time zone 'America/Sao_Paulo')::date = (now() at time zone 'America/Sao_Paulo')::date),
    'tempo_medio_segundos', (select (avg(extract(epoch from (concluido_em - criado_em))))::bigint from public.ocorrencias
                              where status = 'concluido' and concluido_em > now() - make_interval(days => p_dias)),
    'mais_antiga_segundos', (select (max(extract(epoch from (now() - criado_em))))::bigint from public.ocorrencias where status <> 'concluido'),
    'por_tipo', coalesce((
        select jsonb_agg(jsonb_build_object('nome', tipo, 'total', n) order by n desc, tipo)
        from (select tipo, count(*)::int n from public.ocorrencias
               where criado_em > now() - make_interval(days => p_dias)
               group by tipo order by n desc, tipo limit 8) t), '[]'::jsonb),
    'por_classificacao', coalesce((
        select jsonb_agg(jsonb_build_object('nome', classificacao, 'total', n) order by n desc, classificacao::text)
        from (select classificacao, count(*)::int n from public.ocorrencias
               where classificacao is not null and classificado_em > now() - make_interval(days => p_dias)
               group by classificacao) c), '[]'::jsonb)
  )
$$;

-- ---------- Quem pode chamar o quê ----------
revoke all on function public.salvar_analise_ia(uuid, jsonb, text), public.resumo_inteligencia(int) from public, anon, authenticated;
grant execute on function public.salvar_analise_ia(uuid, jsonb, text), public.resumo_inteligencia(int) to authenticated;
grant select on public.v_fila_ocorrencias to authenticated;
