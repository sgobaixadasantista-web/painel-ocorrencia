-- =====================================================================
-- Painel de Ocorrências — esquema do Supabase
-- Fluxo: Campo registra evento -> Central faz a triagem
--        (criminal vira ocorrência; mecânico/social/natural é finalizado)
--        -> Inteligência analisa, informa boletim e classifica.
--
-- Como aplicar: Supabase > SQL Editor > colar este arquivo > Run.
-- Regras importantes:
--   * O navegador NUNCA grava direto nas tabelas. Toda escrita passa pelas
--     funções (RPC) abaixo, que checam o perfil da pessoa e as regras do fluxo.
--   * O acesso é por perfil (tabela perfis): campo, central, inteligencia, admin.
--   * A chave "anon" do Supabase pode ir no navegador; a "service_role" NUNCA.
-- =====================================================================

-- ---------- Tipos ----------
create type public.perfil_acesso            as enum ('campo','central','inteligencia','admin');
create type public.evento_status            as enum ('aguardando','concluido');
create type public.triagem_categoria        as enum ('criminal','mecanico','social','natural');
create type public.ocorrencia_status        as enum ('ag_classificacao','em_andamento','concluido');
create type public.forma_conhecimento       as enum ('solicitacao','flagrante','denuncia');
create type public.classificacao_ocorrencia as enum ('prevencao','natural','mecanica','social','criminal');

-- ---------- Perfis (ligados ao login do Supabase Auth) ----------
create table public.perfis (
  id         uuid primary key references auth.users(id) on delete cascade,
  nome       text not null default '',
  email      text,
  perfil     public.perfil_acesso not null default 'campo',
  ativo      boolean not null default true,
  criado_em  timestamptz not null default now()
);

-- Toda pessoa que cria conta entra como "campo". Quem administra muda o perfil na tabela.
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.perfis (id, nome, email)
  values (new.id, coalesce(new.raw_user_meta_data->>'nome', ''), new.email)
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- Funções de apoio ----------
create function public.perfil_atual() returns public.perfil_acesso
language sql stable security definer set search_path = public as $$
  select perfil from public.perfis where id = auth.uid() and ativo
$$;

create function public.exige_perfil(variadic p_perfis public.perfil_acesso[]) returns void
language plpgsql stable security definer set search_path = public as $$
declare v public.perfil_acesso := public.perfil_atual();
begin
  if v is null or not (v = any (p_perfis)) then
    raise exception 'sem_permissao' using errcode = '42501', hint = 'Seu perfil não pode executar esta ação.';
  end if;
end $$;

-- ---------- Numeração por ano (sem repetir, mesmo com várias pessoas ao mesmo tempo) ----------
create table public.contadores (
  tipo   text not null,
  ano    int  not null,
  ultimo int  not null default 0,
  primary key (tipo, ano)
);

create function public.proximo_numero(p_tipo text, p_ano int) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  insert into public.contadores (tipo, ano, ultimo) values (p_tipo, p_ano, 1)
  on conflict (tipo, ano) do update set ultimo = public.contadores.ultimo + 1
  returning ultimo into n;
  return n;
end $$;

-- ---------- Cadastros: tipos e subtipos de ocorrência ----------
create table public.tipos_ocorrencia (
  nome  text primary key,
  ativo boolean not null default true
);
create table public.subtipos_ocorrencia (
  tipo  text not null references public.tipos_ocorrencia(nome) on update cascade,
  nome  text not null,
  ativo boolean not null default true,
  primary key (tipo, nome)
);

insert into public.tipos_ocorrencia (nome) values
  ('ABERTURA'),('ACIDENTE'),('APREENSÃO'),('ATAQUE A FUNCIONÁRIOS E COLABORADORES'),
  ('ATAQUE ÀS EQUIPES DE SEGURANÇA'),('CABOS'),('DANO'),('PREVENÇÃO');
insert into public.subtipos_ocorrencia (tipo, nome) values
  ('APREENSÃO','CARGA/GRÃOS'),('APREENSÃO','COMBUSTÍVEL'),('APREENSÃO','MATERIAL LOGÍSTICO'),
  ('APREENSÃO','PEÇAS DA COMPOSIÇÃO'),('APREENSÃO','MATERIAL DE FIXAÇÃO DE TRILHO'),('APREENSÃO','DOCUMENTOS');

-- ---------- Eventos (registro da equipe de campo) ----------
create table public.eventos (
  id                 uuid primary key default gen_random_uuid(),
  ano                int  not null,
  numero             int  not null,
  local              text not null check (length(btrim(local)) > 0),
  descricao          text not null check (length(btrim(descricao)) > 0),
  status             public.evento_status not null default 'aguardando',
  criado_em          timestamptz not null default now(),
  criado_por         uuid references public.perfis(id),
  concluido_em       timestamptz,
  triagem_categoria  public.triagem_categoria,
  triagem_observacao text,
  triagem_por        uuid references public.perfis(id),
  triagem_em         timestamptz,
  ocorrencia_id      uuid,
  unique (ano, numero),
  check ((status = 'concluido') = (concluido_em is not null))
);
create index eventos_status_criado_idx on public.eventos (status, criado_em);

create table public.evento_fotos (
  id           uuid primary key default gen_random_uuid(),
  evento_id    uuid not null references public.eventos(id) on delete cascade,
  storage_path text not null,
  criado_em    timestamptz not null default now()
);
create index evento_fotos_evento_idx on public.evento_fotos (evento_id);

-- ---------- Ocorrências (casos criminais encaminhados à inteligência) ----------
create table public.ocorrencias (
  id                 uuid primary key default gen_random_uuid(),
  ano                int  not null,
  numero             int  not null,
  evento_id          uuid not null unique references public.eventos(id),
  local              text not null,
  descricao          text not null,
  tipo               text not null references public.tipos_ocorrencia(nome) on update cascade,
  subtipo            text,
  forma_conhecimento public.forma_conhecimento,
  fato_em            timestamptz not null,
  analise_mesa       text,
  status             public.ocorrencia_status not null default 'ag_classificacao',
  boletim_existe     boolean,
  boletim_numero     text,
  classificacao      public.classificacao_ocorrencia,
  classificado_por   uuid references public.perfis(id),
  classificado_em    timestamptz,
  criado_em          timestamptz not null default now(),
  criado_por         uuid references public.perfis(id),
  concluido_em       timestamptz,
  unique (ano, numero),
  check ((status = 'concluido') = (concluido_em is not null)),
  check (boletim_existe is distinct from true or coalesce(btrim(boletim_numero), '') <> '')
);
create index ocorrencias_status_criado_idx on public.ocorrencias (status, criado_em);

alter table public.eventos
  add constraint eventos_ocorrencia_fk foreign key (ocorrencia_id) references public.ocorrencias(id);

create table public.ocorrencia_analises (
  id            uuid primary key default gen_random_uuid(),
  ocorrencia_id uuid not null references public.ocorrencias(id) on delete cascade,
  texto         text not null check (length(btrim(texto)) > 0),
  criado_por    uuid references public.perfis(id),
  criado_em     timestamptz not null default now()
);
create index ocorrencia_analises_oc_idx on public.ocorrencia_analises (ocorrencia_id, criado_em);

-- ---------- Histórico de auditoria ----------
create table public.historico (
  id          bigint generated always as identity primary key,
  entidade    text not null,
  entidade_id uuid not null,
  acao        text not null,
  detalhes    jsonb not null default '{}'::jsonb,
  por         uuid,
  em          timestamptz not null default now()
);
create index historico_entidade_idx on public.historico (entidade, entidade_id, em);

create function public.registrar_historico(p_entidade text, p_id uuid, p_acao text, p_detalhes jsonb default '{}')
returns void language sql security definer set search_path = public as $$
  insert into public.historico (entidade, entidade_id, acao, detalhes, por)
  values (p_entidade, p_id, p_acao, coalesce(p_detalhes, '{}'::jsonb), auth.uid())
$$;

-- ---------- Numeração automática ----------
create function public.eventos_numerar() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.ano    := extract(year from new.criado_em at time zone 'America/Sao_Paulo')::int;
  new.numero := public.proximo_numero('evento', new.ano);
  return new;
end $$;
create trigger eventos_numerar before insert on public.eventos
  for each row execute function public.eventos_numerar();

create function public.ocorrencias_numerar() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.ano    := extract(year from new.criado_em at time zone 'America/Sao_Paulo')::int;
  new.numero := public.proximo_numero('ocorrencia', new.ano);
  return new;
end $$;
create trigger ocorrencias_numerar before insert on public.ocorrencias
  for each row execute function public.ocorrencias_numerar();

-- =====================================================================
-- ACESSO (RLS): leitura por perfil; NENHUMA escrita direta pelo navegador
-- =====================================================================
alter table public.perfis               enable row level security;
alter table public.contadores           enable row level security;
alter table public.tipos_ocorrencia     enable row level security;
alter table public.subtipos_ocorrencia  enable row level security;
alter table public.eventos              enable row level security;
alter table public.evento_fotos         enable row level security;
alter table public.ocorrencias          enable row level security;
alter table public.ocorrencia_analises  enable row level security;
alter table public.historico            enable row level security;

create policy perfis_leitura on public.perfis for select to authenticated
  using (id = auth.uid() or public.perfil_atual() in ('central','inteligencia','admin'));
create policy perfis_admin_atualiza on public.perfis for update to authenticated
  using (public.perfil_atual() = 'admin') with check (public.perfil_atual() = 'admin');

create policy tipos_leitura on public.tipos_ocorrencia for select to authenticated
  using (public.perfil_atual() is not null);
create policy subtipos_leitura on public.subtipos_ocorrencia for select to authenticated
  using (public.perfil_atual() is not null);

-- Campo enxerga só o que registrou; central, inteligência e admin enxergam tudo.
create policy eventos_leitura on public.eventos for select to authenticated
  using (public.perfil_atual() in ('central','inteligencia','admin')
         or (public.perfil_atual() = 'campo' and criado_por = auth.uid()));
create policy evento_fotos_leitura on public.evento_fotos for select to authenticated
  using (exists (select 1 from public.eventos e where e.id = evento_id));

create policy ocorrencias_leitura on public.ocorrencias for select to authenticated
  using (public.perfil_atual() in ('central','inteligencia','admin'));
create policy analises_leitura on public.ocorrencia_analises for select to authenticated
  using (public.perfil_atual() in ('central','inteligencia','admin'));

create policy historico_leitura on public.historico for select to authenticated
  using (public.perfil_atual() in ('inteligencia','admin'));

-- Permissões de tabela: só leitura para quem está logado; nada para anônimos.
revoke all on all tables in schema public from anon, authenticated;
grant usage on schema public to authenticated;
grant select on public.perfis, public.tipos_ocorrencia, public.subtipos_ocorrencia,
                public.eventos, public.evento_fotos, public.ocorrencias,
                public.ocorrencia_analises, public.historico to authenticated;
grant update (nome, perfil, ativo) on public.perfis to authenticated;  -- limitado pela policy (só admin)

-- =====================================================================
-- VISÕES para o painel (respeitam o acesso de quem consulta)
-- =====================================================================
create view public.v_fila_eventos with (security_invoker = true) as
select
  e.id, e.ano, e.numero,
  lpad(e.numero::text, 4, '0') || ' / ' || e.ano as numero_formatado,
  e.local, e.descricao, e.status, e.criado_em, e.concluido_em,
  e.criado_por, p.nome as criado_por_nome,
  e.triagem_categoria, e.triagem_observacao, e.triagem_em, e.ocorrencia_id,
  extract(epoch from (coalesce(e.concluido_em, now()) - e.criado_em))::bigint as segundos,
  (select count(*) from public.evento_fotos f where f.evento_id = e.id)::int as qtd_fotos,
  case when e.status = 'aguardando' then 0 else 1 end as grupo,
  case when e.status = 'aguardando' then extract(epoch from e.criado_em)
       else -extract(epoch from e.concluido_em) end as chave_ordem
from public.eventos e
left join public.perfis p on p.id = e.criado_por;

create view public.v_fila_ocorrencias with (security_invoker = true) as
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
       else extract(epoch from o.criado_em) end as chave_ordem
from public.ocorrencias o
join public.eventos e on e.id = o.evento_id
left join public.perfis p on p.id = o.criado_por;

grant select on public.v_fila_eventos, public.v_fila_ocorrencias to authenticated;

-- Indicadores do painel da central
create function public.kpis_central(p_atencao_horas int default 4)
returns table (aguardando int, fora_prazo int, concluidos_hoje int, tempo_medio_segundos bigint, mais_antigo_segundos bigint)
language sql stable security invoker set search_path = public as $$
  select
    (count(*) filter (where status = 'aguardando'))::int,
    (count(*) filter (where status = 'aguardando' and now() - criado_em > make_interval(hours => p_atencao_horas)))::int,
    (count(*) filter (where status = 'concluido'
        and (concluido_em at time zone 'America/Sao_Paulo')::date = (now() at time zone 'America/Sao_Paulo')::date))::int,
    (avg(extract(epoch from (concluido_em - criado_em)))
        filter (where status = 'concluido' and concluido_em > now() - interval '30 days'))::bigint,
    (max(extract(epoch from (now() - criado_em))) filter (where status = 'aguardando'))::bigint
  from public.eventos
$$;

-- =====================================================================
-- AÇÕES DO FLUXO (únicas portas de escrita)
-- =====================================================================

-- Campo (ou central) registra um evento. p_fotos = caminhos já enviados ao Storage.
create function public.registrar_evento(p_local text, p_descricao text, p_fotos text[] default '{}')
returns public.eventos
language plpgsql security definer set search_path = public as $$
declare ev public.eventos; f text;
begin
  perform public.exige_perfil('campo','central','admin');
  if coalesce(btrim(p_local), '') = '' or coalesce(btrim(p_descricao), '') = '' then
    raise exception 'dados_incompletos' using errcode = '22023', hint = 'Informe o local e o que aconteceu.';
  end if;
  insert into public.eventos (local, descricao, criado_por)
  values (btrim(p_local), btrim(p_descricao), auth.uid()) returning * into ev;
  foreach f in array coalesce(p_fotos, '{}') loop
    insert into public.evento_fotos (evento_id, storage_path) values (ev.id, f);
  end loop;
  perform public.registrar_historico('evento', ev.id, 'registrado', jsonb_build_object('fotos', coalesce(array_length(p_fotos, 1), 0)));
  return ev;
end $$;

-- Central: triagem CRIMINAL -> cria a ocorrência e conclui o evento, na mesma transação.
create function public.triar_evento_criminal(
  p_evento_id uuid, p_tipo text, p_subtipo text, p_forma public.forma_conhecimento,
  p_fato_em timestamptz, p_analise_mesa text default null)
returns public.ocorrencias
language plpgsql security definer set search_path = public as $$
declare ev public.eventos; oc public.ocorrencias; tem_subtipos boolean;
begin
  perform public.exige_perfil('central','admin');
  select * into ev from public.eventos where id = p_evento_id for update;
  if not found then raise exception 'evento_nao_encontrado' using errcode = 'P0002'; end if;
  if ev.status <> 'aguardando' then
    raise exception 'evento_ja_concluido' using errcode = '55000', hint = 'Este evento já passou pela triagem.';
  end if;
  if not exists (select 1 from public.tipos_ocorrencia where nome = p_tipo and ativo) then
    raise exception 'tipo_invalido' using errcode = '22023', hint = 'Escolha um tipo de ocorrência da lista.';
  end if;
  select exists (select 1 from public.subtipos_ocorrencia where tipo = p_tipo and ativo) into tem_subtipos;
  if tem_subtipos and not exists (select 1 from public.subtipos_ocorrencia where tipo = p_tipo and nome = p_subtipo and ativo) then
    raise exception 'subtipo_invalido' using errcode = '22023', hint = 'Escolha o subtipo da ocorrência.';
  end if;
  if p_fato_em is null then
    raise exception 'dados_incompletos' using errcode = '22023', hint = 'Informe a data e a hora do fato.';
  end if;

  insert into public.ocorrencias (evento_id, local, descricao, tipo, subtipo, forma_conhecimento, fato_em, analise_mesa, criado_por)
  values (ev.id, ev.local, ev.descricao, p_tipo, case when tem_subtipos then p_subtipo end, p_forma, p_fato_em,
          nullif(btrim(coalesce(p_analise_mesa, '')), ''), auth.uid())
  returning * into oc;

  update public.eventos
     set status = 'concluido', concluido_em = now(), ocorrencia_id = oc.id,
         triagem_categoria = 'criminal', triagem_por = auth.uid(), triagem_em = now()
   where id = ev.id;

  perform public.registrar_historico('evento', ev.id, 'triagem_criminal', jsonb_build_object('ocorrencia_id', oc.id));
  perform public.registrar_historico('ocorrencia', oc.id, 'criada', jsonb_build_object('evento_id', ev.id, 'tipo', p_tipo));
  return oc;
end $$;

-- Central: triagem NÃO criminal -> finaliza o evento com observação.
create function public.finalizar_evento(p_evento_id uuid, p_categoria public.triagem_categoria, p_observacao text)
returns public.eventos
language plpgsql security definer set search_path = public as $$
declare ev public.eventos;
begin
  perform public.exige_perfil('central','admin');
  if p_categoria = 'criminal' then
    raise exception 'use_triagem_criminal' using errcode = '22023', hint = 'Caso criminal deve ser encaminhado à inteligência.';
  end if;
  if coalesce(btrim(p_observacao), '') = '' then
    raise exception 'dados_incompletos' using errcode = '22023', hint = 'Descreva o que foi feito para encerrar o evento.';
  end if;
  select * into ev from public.eventos where id = p_evento_id for update;
  if not found then raise exception 'evento_nao_encontrado' using errcode = 'P0002'; end if;
  if ev.status <> 'aguardando' then
    raise exception 'evento_ja_concluido' using errcode = '55000', hint = 'Este evento já passou pela triagem.';
  end if;
  update public.eventos
     set status = 'concluido', concluido_em = now(), triagem_categoria = p_categoria,
         triagem_observacao = btrim(p_observacao), triagem_por = auth.uid(), triagem_em = now()
   where id = ev.id returning * into ev;
  perform public.registrar_historico('evento', ev.id, 'finalizado', jsonb_build_object('categoria', p_categoria));
  return ev;
end $$;

-- Central ou inteligência: nova análise. A primeira análise leva a ocorrência a "em andamento".
create function public.adicionar_analise(p_ocorrencia_id uuid, p_texto text)
returns public.ocorrencia_analises
language plpgsql security definer set search_path = public as $$
declare oc public.ocorrencias; an public.ocorrencia_analises;
begin
  perform public.exige_perfil('central','inteligencia','admin');
  if coalesce(btrim(p_texto), '') = '' then
    raise exception 'dados_incompletos' using errcode = '22023', hint = 'Escreva a análise antes de adicionar.';
  end if;
  select * into oc from public.ocorrencias where id = p_ocorrencia_id for update;
  if not found then raise exception 'ocorrencia_nao_encontrada' using errcode = 'P0002'; end if;
  if oc.status = 'concluido' then
    raise exception 'ocorrencia_concluida' using errcode = '55000', hint = 'Ocorrência concluída não recebe novas análises.';
  end if;
  insert into public.ocorrencia_analises (ocorrencia_id, texto, criado_por)
  values (oc.id, btrim(p_texto), auth.uid()) returning * into an;
  if oc.status = 'ag_classificacao' then
    update public.ocorrencias set status = 'em_andamento' where id = oc.id;
  end if;
  perform public.registrar_historico('ocorrencia', oc.id, 'analise_adicionada', '{}');
  return an;
end $$;

-- Inteligência: boletim, classificação e conclusão (usados no painel da inteligência).
create function public.responder_boletim(p_ocorrencia_id uuid, p_existe boolean, p_numero text default null)
returns public.ocorrencias
language plpgsql security definer set search_path = public as $$
declare oc public.ocorrencias;
begin
  perform public.exige_perfil('inteligencia','admin');
  if p_existe is null then raise exception 'dados_incompletos' using errcode = '22023', hint = 'Responda Sim ou Não.'; end if;
  if p_existe and coalesce(btrim(p_numero), '') = '' then
    raise exception 'dados_incompletos' using errcode = '22023', hint = 'Informe o número do boletim.';
  end if;
  update public.ocorrencias
     set boletim_existe = p_existe, boletim_numero = case when p_existe then btrim(p_numero) end
   where id = p_ocorrencia_id and status <> 'concluido' returning * into oc;
  if not found then raise exception 'ocorrencia_nao_encontrada' using errcode = 'P0002'; end if;
  perform public.registrar_historico('ocorrencia', oc.id, 'boletim_respondido', jsonb_build_object('existe', p_existe));
  return oc;
end $$;

create function public.classificar_ocorrencia(p_ocorrencia_id uuid, p_classificacao public.classificacao_ocorrencia)
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
  if oc.boletim_existe is null then
    raise exception 'responda_boletim' using errcode = '55000', hint = 'Responda sobre o boletim antes de classificar.';
  end if;
  update public.ocorrencias
     set classificacao = p_classificacao, classificado_por = auth.uid(), classificado_em = now()
   where id = oc.id returning * into oc;
  perform public.registrar_historico('ocorrencia', oc.id, 'classificada', jsonb_build_object('classificacao', p_classificacao));
  return oc;
end $$;

create function public.concluir_ocorrencia(p_ocorrencia_id uuid)
returns public.ocorrencias
language plpgsql security definer set search_path = public as $$
declare oc public.ocorrencias;
begin
  perform public.exige_perfil('inteligencia','admin');
  select * into oc from public.ocorrencias where id = p_ocorrencia_id for update;
  if not found then raise exception 'ocorrencia_nao_encontrada' using errcode = 'P0002'; end if;
  if oc.classificacao is null then
    raise exception 'classifique_antes' using errcode = '55000', hint = 'Classifique a ocorrência antes de concluir.';
  end if;
  update public.ocorrencias set status = 'concluido', concluido_em = now()
   where id = oc.id and status <> 'concluido' returning * into oc;
  if not found then raise exception 'ocorrencia_concluida' using errcode = '55000'; end if;
  perform public.registrar_historico('ocorrencia', oc.id, 'concluida', '{}');
  return oc;
end $$;

-- Quem pode chamar o quê: só pessoas logadas; as funções de apoio ficam fechadas.
revoke all on function
  public.registrar_evento(text, text, text[]),
  public.triar_evento_criminal(uuid, text, text, public.forma_conhecimento, timestamptz, text),
  public.finalizar_evento(uuid, public.triagem_categoria, text),
  public.adicionar_analise(uuid, text),
  public.responder_boletim(uuid, boolean, text),
  public.classificar_ocorrencia(uuid, public.classificacao_ocorrencia),
  public.concluir_ocorrencia(uuid),
  public.kpis_central(int),
  public.perfil_atual(),
  public.exige_perfil(public.perfil_acesso[]),
  public.proximo_numero(text, int),
  public.registrar_historico(text, uuid, text, jsonb)
from public, anon, authenticated;

grant execute on function
  public.registrar_evento(text, text, text[]),
  public.triar_evento_criminal(uuid, text, text, public.forma_conhecimento, timestamptz, text),
  public.finalizar_evento(uuid, public.triagem_categoria, text),
  public.adicionar_analise(uuid, text),
  public.responder_boletim(uuid, boolean, text),
  public.classificar_ocorrencia(uuid, public.classificacao_ocorrencia),
  public.concluir_ocorrencia(uuid),
  public.kpis_central(int)
to authenticated;
-- perfil_atual() precisa ser executável pelas policies de quem está logado:
grant execute on function public.perfil_atual() to authenticated;

-- =====================================================================
-- FOTOS (Storage): bucket privado "evidencias"
-- Caminho do arquivo: <id da pessoa>/<nome>.jpg  (a pessoa só envia para a própria pasta)
-- =====================================================================
insert into storage.buckets (id, name, public) values ('evidencias', 'evidencias', false)
on conflict (id) do nothing;

create policy evidencias_leitura on storage.objects for select to authenticated
  using (bucket_id = 'evidencias' and public.perfil_atual() is not null);

create policy evidencias_envio on storage.objects for insert to authenticated
  with check (bucket_id = 'evidencias'
              and public.perfil_atual() in ('campo','central','admin')
              and (storage.foldername(name))[1] = auth.uid()::text);

-- =====================================================================
-- TEMPO REAL: o painel da central recebe novos eventos sem recarregar
-- =====================================================================
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'eventos') then
      alter publication supabase_realtime add table public.eventos;
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'ocorrencias') then
      alter publication supabase_realtime add table public.ocorrencias;
    end if;
  end if;
end $$;
