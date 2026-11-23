-- =====================================================================
-- Tipificação e triagem única — complemento do esquema (rode DEPOIS da 001, 002 e 003)
--   * Natureza > Tipo > Subtipo (tabela tipificacao) e o formulário que cada combinação abre (tabela formularios)
--   * Siglas de seção de bloqueio por trecho (aux_trechos, aux_siglas), usadas no campo "SB" do formulário
--   * Eventos e ocorrências passam a guardar a tipificação e os dados do formulário
--   * triar_evento: ÚNICA porta da triagem. Valida o formulário no banco; criminal cria a ocorrência,
--     mecânica, social e natural finalizam o evento com observação.
--
-- Pode rodar num banco que já tenha parte disto (como o de produção, onde tipificacao, formularios,
-- aux_trechos e aux_siglas foram criados à parte): nada existente é apagado nem sobrescrito.
--   * tabelas: "create table if not exists"; colunas: "add column if not exists"
--   * dados iniciais (9 formulários, 156 combinações): "on conflict do nothing", não sobrescreve ajustes
--   * as visões v_fila_eventos e v_fila_ocorrencias são recriadas com as colunas novas no fim
-- Tudo roda numa transação: se algo falhar, nada fica pela metade.
-- =====================================================================
begin;

-- ---------- Formulários e tipificação ----------
create table if not exists public.formularios (
  codigo    text primary key,
  nome      text not null,
  descricao text not null default '',
  campos    jsonb not null default '[]'::jsonb,
  ativo     boolean not null default true
);

create table if not exists public.tipificacao (
  id         integer primary key,                       -- ID da planilha da Rumo
  natureza   text not null,
  tipo       text not null,
  subtipo    text not null,
  formulario text not null references public.formularios(codigo) on update cascade,
  ativo      boolean not null default true
);

-- natureza em texto (como já está em produção), restrita aos 4 valores
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'tipificacao_natureza_ck' and conrelid = 'public.tipificacao'::regclass) then
    alter table public.tipificacao add constraint tipificacao_natureza_ck
      check (natureza in ('criminal','mecanica','social','natural'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'formularios_campos_ck' and conrelid = 'public.formularios'::regclass) then
    alter table public.formularios add constraint formularios_campos_ck check (jsonb_typeof(campos) = 'array');
  end if;
end $$;
create unique index if not exists tipificacao_combinacao_uq on public.tipificacao (natureza, tipo, subtipo);

-- ---------- Trechos e siglas de seção de bloqueio (SB) ----------
create table if not exists public.aux_trechos (
  codigo text primary key,
  ordem  integer not null default 0,
  ativo  boolean not null default true
);
create table if not exists public.aux_siglas (
  trecho_codigo text not null references public.aux_trechos(codigo) on update cascade,
  sigla         text not null,
  ordem         integer not null default 0,
  ativo         boolean not null default true,
  primary key (trecho_codigo, sigla)
);

-- ---------- Acesso: só leitura, só para quem está logado e ativo ----------
-- Quem edita estes cadastros é o admin, pelo Table Editor do Supabase (não pelo navegador).
alter table public.formularios enable row level security;
alter table public.tipificacao enable row level security;
alter table public.aux_trechos enable row level security;
alter table public.aux_siglas  enable row level security;

do $$
declare t text;
begin
  foreach t in array array['formularios','tipificacao','aux_trechos','aux_siglas'] loop
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and policyname = t || '_leitura') then
      execute format('create policy %I on public.%I for select to authenticated using (public.perfil_atual() is not null)', t || '_leitura', t);
    end if;
  end loop;
end $$;

revoke all on public.formularios, public.tipificacao, public.aux_trechos, public.aux_siglas from anon, authenticated;
grant select on public.formularios, public.tipificacao, public.aux_trechos, public.aux_siglas to authenticated;

-- ---------- Colunas novas: tipificação e dados do formulário ----------
alter table public.eventos
  add column if not exists tipificacao_id integer references public.tipificacao(id),
  add column if not exists triagem_dados  jsonb;

alter table public.ocorrencias
  add column if not exists natureza       text,
  add column if not exists tipificacao_id integer references public.tipificacao(id),
  add column if not exists dados          jsonb not null default '{}'::jsonb;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'ocorrencias_natureza_ck' and conrelid = 'public.ocorrencias'::regclass) then
    alter table public.ocorrencias add constraint ocorrencias_natureza_ck
      check (natureza is null or natureza in ('criminal','mecanica','social','natural'));
  end if;
end $$;

-- ---------- Validação dos dados do formulário (mesmas regras da tela) ----------
-- Recebe a lista de campos do formulário e o que a central preencheu; devolve só os campos preenchidos, sem espaços sobrando.
-- Campo que não existe no formulário, obrigatório vazio ou formato errado: erro com a explicação no "hint".
create or replace function public.validar_dados_formulario(p_campos jsonb, p_dados jsonb)
returns jsonb
language plpgsql immutable set search_path = public as $$
declare
  c jsonb; k text; t text; r text; tp text; mx int; saida jsonb := '{}'::jsonb;
begin
  p_dados := coalesce(p_dados, '{}'::jsonb);
  if jsonb_typeof(p_dados) <> 'object' or length(p_dados::text) > 20000 then
    raise exception 'dados_invalidos' using errcode = '22023', hint = 'Os dados do formulário estão inválidos. Confira os campos.';
  end if;
  for k in select jsonb_object_keys(p_dados) loop
    if not exists (select 1 from jsonb_array_elements(p_campos) x where x->>'chave' = k) then
      raise exception 'dados_invalidos' using errcode = '22023', hint = 'Campo que não existe neste formulário: ' || left(k, 40);
    end if;
  end loop;
  for c in select x from jsonb_array_elements(p_campos) x loop
    k := c->>'chave'; r := coalesce(c->>'rotulo', k); tp := c->>'tipo';
    t := case when p_dados->k is null or jsonb_typeof(p_dados->k) = 'null' then ''
              when jsonb_typeof(p_dados->k) = 'string' then btrim(p_dados->>k)
              else btrim((p_dados->k)::text) end;
    if t = '' then
      if coalesce((c->>'obrigatorio')::boolean, false) then
        raise exception 'dados_incompletos' using errcode = '22023', hint = 'Preencha o campo: ' || r || '.';
      end if;
      continue;
    end if;
    mx := coalesce((c->>'max')::int, case when tp = 'textarea' then 2000 else 200 end);
    if tp = 'numero' and t !~ '^\d{1,9}$' then
      raise exception 'dados_invalidos' using errcode = '22023', hint = r || ': informe só números.';
    elsif tp = 'km' and t !~ '^\d{1,4}\+\d{3}$' then
      raise exception 'dados_invalidos' using errcode = '22023', hint = r || ': use o formato 115+500.';
    elsif tp = 'hora' and t !~ '^([01]\d|2[0-3]):[0-5]\d$' then
      raise exception 'dados_invalidos' using errcode = '22023', hint = r || ': use o formato HH:MM.';
    elsif tp = 'sim_nao' and t not in ('sim','nao') then
      raise exception 'dados_invalidos' using errcode = '22023', hint = r || ': escolha Sim ou Não.';
    elsif tp = 'select' and not coalesce(c->'opcoes', '[]'::jsonb) ? t then
      raise exception 'dados_invalidos' using errcode = '22023', hint = r || ': escolha uma das opções da lista.';
    elsif tp in ('texto','textarea') and length(t) > mx then
      raise exception 'dados_invalidos' using errcode = '22023', hint = r || ': texto longo demais.';
    end if;
    saida := saida || jsonb_build_object(k, t);
  end loop;
  return saida;
end $$;

-- ---------- Triagem única ----------
create or replace function public.triar_evento(
  p_evento_id uuid, p_tipificacao_id integer, p_dados jsonb default '{}'::jsonb,
  p_forma public.forma_conhecimento default null, p_fato_em timestamptz default null,
  p_analise_mesa text default null, p_observacao text default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  ev public.eventos; oc public.ocorrencias; tp public.tipificacao; fm public.formularios; dados jsonb;
  categoria public.triagem_categoria;
begin
  perform public.exige_perfil('central','admin');

  select * into ev from public.eventos where id = p_evento_id for update;
  if not found then raise exception 'evento_nao_encontrado' using errcode = 'P0002'; end if;
  if ev.status <> 'aguardando' then
    raise exception 'evento_ja_concluido' using errcode = '55000', hint = 'Este evento já passou pela triagem.';
  end if;

  select * into tp from public.tipificacao where id = p_tipificacao_id and ativo;
  if not found then
    raise exception 'tipificacao_invalida' using errcode = '22023', hint = 'Escolha natureza, tipo e subtipo da lista.';
  end if;
  select * into fm from public.formularios where codigo = tp.formulario and ativo;
  if not found then
    raise exception 'tipificacao_invalida' using errcode = '22023', hint = 'Esta combinação não tem formulário ativo. Avise o administrador.';
  end if;

  dados := public.validar_dados_formulario(fm.campos, p_dados);

  if tp.natureza = 'criminal' then
    if p_fato_em is null then
      raise exception 'dados_incompletos' using errcode = '22023', hint = 'Informe a data e a hora do fato.';
    end if;
    if p_fato_em > now() + interval '5 minutes' then
      raise exception 'dados_invalidos' using errcode = '22023', hint = 'A data e a hora do fato não podem estar no futuro.';
    end if;
    if length(coalesce(p_analise_mesa, '')) > 4000 then
      raise exception 'dados_invalidos' using errcode = '22023', hint = 'A análise de mesa está longa demais.';
    end if;

    -- ocorrencias.tipo aponta para tipos_ocorrencia: garante que o tipo da planilha exista lá
    insert into public.tipos_ocorrencia (nome) values (tp.tipo) on conflict (nome) do nothing;

    insert into public.ocorrencias (evento_id, local, descricao, tipo, subtipo, forma_conhecimento, fato_em, analise_mesa,
                                    criado_por, natureza, tipificacao_id, dados)
    values (ev.id, ev.local, ev.descricao, tp.tipo, tp.subtipo, p_forma, p_fato_em,
            nullif(btrim(coalesce(p_analise_mesa, '')), ''), auth.uid(), tp.natureza, tp.id, dados)
    returning * into oc;

    update public.eventos
       set status = 'concluido', concluido_em = now(), ocorrencia_id = oc.id,
           triagem_categoria = 'criminal', triagem_por = auth.uid(), triagem_em = now(),
           tipificacao_id = tp.id, triagem_dados = dados
     where id = ev.id;

    perform public.registrar_historico('evento', ev.id, 'triagem_criminal', jsonb_build_object('ocorrencia_id', oc.id, 'tipificacao_id', tp.id));
    perform public.registrar_historico('ocorrencia', oc.id, 'criada', jsonb_build_object('evento_id', ev.id, 'tipo', tp.tipo, 'subtipo', tp.subtipo));
    return jsonb_build_object('ocorrencia_id', oc.id);
  end if;

  -- mecânica, social ou natural: finaliza o evento com observação, sem ocorrência
  if coalesce(btrim(p_observacao), '') = '' then
    raise exception 'dados_incompletos' using errcode = '22023', hint = 'Descreva o que foi feito para encerrar o evento.';
  end if;
  if length(p_observacao) > 4000 then
    raise exception 'dados_invalidos' using errcode = '22023', hint = 'A observação está longa demais.';
  end if;
  categoria := case tp.natureza when 'mecanica' then 'mecanico' else tp.natureza end::public.triagem_categoria;

  update public.eventos
     set status = 'concluido', concluido_em = now(), triagem_categoria = categoria,
         triagem_observacao = btrim(p_observacao), triagem_por = auth.uid(), triagem_em = now(),
         tipificacao_id = tp.id, triagem_dados = dados
   where id = ev.id;

  perform public.registrar_historico('evento', ev.id, 'finalizado', jsonb_build_object('categoria', categoria, 'tipificacao_id', tp.id));
  return jsonb_build_object('ocorrencia_id', null);
end $$;

revoke all on function public.validar_dados_formulario(jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.triar_evento(uuid, integer, jsonb, public.forma_conhecimento, timestamptz, text, text) from public, anon, authenticated;
grant execute on function public.triar_evento(uuid, integer, jsonb, public.forma_conhecimento, timestamptz, text, text) to authenticated;

-- As triagens antigas (da 001) gravavam sem tipificação e sem formulário: deixam de ser chamáveis pelo navegador.
do $$
begin
  if to_regprocedure('public.triar_evento_criminal(uuid, text, text, public.forma_conhecimento, timestamptz, text)') is not null then
    revoke execute on function public.triar_evento_criminal(uuid, text, text, public.forma_conhecimento, timestamptz, text) from public, anon, authenticated;
  end if;
  if to_regprocedure('public.finalizar_evento(uuid, public.triagem_categoria, text)') is not null then
    revoke execute on function public.finalizar_evento(uuid, public.triagem_categoria, text) from public, anon, authenticated;
  end if;
end $$;

-- ---------- Visões do painel: colunas da tipificação no fim ----------
-- Recriadas (e não "create or replace") para funcionar mesmo que a versão do banco seja diferente da do repositório.
drop view if exists public.v_fila_eventos;
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
       else -extract(epoch from e.concluido_em) end as chave_ordem,
  e.latitude, e.longitude,
  e.tipificacao_id, e.triagem_dados,
  t.natureza as tipif_natureza, t.tipo as tipif_tipo, t.subtipo as tipif_subtipo
from public.eventos e
left join public.perfis p on p.id = e.criado_por
left join public.tipificacao t on t.id = e.tipificacao_id;

drop view if exists public.v_fila_ocorrencias;
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
       else extract(epoch from o.criado_em) end as chave_ordem,
  (select count(*) from public.ocorrencia_ia i where i.ocorrencia_id = o.id)::int as qtd_ia,
  o.natureza, o.tipificacao_id, o.dados,
  e.latitude, e.longitude
from public.ocorrencias o
join public.eventos e on e.id = o.evento_id
left join public.perfis p on p.id = o.criado_por;

revoke all on public.v_fila_eventos, public.v_fila_ocorrencias from anon, authenticated;
grant select on public.v_fila_eventos, public.v_fila_ocorrencias to authenticated;

-- =====================================================================
-- DADOS INICIAIS (gerados de js/tipificacao-demo.js, mesma origem que tools/gerar_tipificacao.py)
-- Só entram se ainda não existirem: formulários e combinações já cadastrados não são alterados.
-- =====================================================================
insert into public.formularios (codigo, nome, descricao, campos) values
  ('COMPOSICAO', 'Ocorrência em composição', 'Cortes, subtrações, aberturas e danos em vagões, locomotivas e equipamentos da composição.', '[{"chave":"km","rotulo":"Quilômetro (km)","tipo":"km","obrigatorio":true,"grupo":"Principal","ajuda":"Formato 115+500, sempre com sinal de mais."},{"chave":"ativo_afetado","rotulo":"Ativo ou material afetado","tipo":"texto","obrigatorio":false,"grupo":"Principal","ajuda":"O que foi cortado, subtraído, aberto, danificado ou localizado.","max":200},{"chave":"empresa","rotulo":"Empresa da composição","tipo":"select","obrigatorio":false,"grupo":"Composição","opcoes":["RUMO","VLI","MRS","BRADO","OUTRA"]},{"chave":"prefixo","rotulo":"Prefixo da composição","tipo":"texto","obrigatorio":false,"grupo":"Composição","ajuda":"Exemplo: T55. Não use código de seção (SB, ZPT...).","max":20},{"chave":"composicao","rotulo":"Locomotiva líder","tipo":"texto","obrigatorio":false,"grupo":"Composição","max":20},{"chave":"vagoes","rotulo":"Vagão(ões) envolvido(s)","tipo":"texto","obrigatorio":false,"grupo":"Composição","ajuda":"Números separados por vírgula.","max":200},{"chave":"locomotiva","rotulo":"Locomotiva envolvida","tipo":"texto","obrigatorio":false,"grupo":"Composição","max":40},{"chave":"sb","rotulo":"Sigla (SB)","tipo":"texto","obrigatorio":false,"grupo":"Local","ajuda":"Somente a sigla da seção. Exemplo: ZPT.","max":10},{"chave":"trecho","rotulo":"Trecho","tipo":"select","obrigatorio":false,"grupo":"Local","opcoes":["TRECHO 0","TRECHO 1","TRECHO 2","TRECHO 3","TRECHO 4","TRECHO 5","TRECHO 6"]},{"chave":"cidade","rotulo":"Cidade","tipo":"texto","obrigatorio":false,"grupo":"Local","max":80},{"chave":"uf","rotulo":"UF","tipo":"select","obrigatorio":false,"grupo":"Local","opcoes":["AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"]},{"chave":"autoria","rotulo":"Autoria","tipo":"select","obrigatorio":false,"grupo":"Estatística","ajuda":"Marque CONHECIDA só quando o autor foi identificado, detido ou qualificado.","opcoes":["DESCONHECIDA","CONHECIDA"]},{"chave":"hora_inicio","rotulo":"Hora de início da ocorrência","tipo":"hora","obrigatorio":false,"grupo":"Estatística","ajuda":"HH:MM"},{"chave":"hora_final","rotulo":"Hora de liberação para a circulação","tipo":"hora","obrigatorio":false,"grupo":"Estatística","ajuda":"HH:MM"},{"chave":"maquinista","rotulo":"Maquinista (primeiro nome)","tipo":"texto","obrigatorio":false,"grupo":"Estatística","ajuda":"Usado só no relatório estatístico. Nunca entra no boletim.","max":40},{"chave":"re_maquinista","rotulo":"RE do maquinista","tipo":"texto","obrigatorio":false,"grupo":"Estatística","ajuda":"Usado só no relatório estatístico. Nunca entra no boletim.","max":20}]'::jsonb),
  ('VIA', 'Ocorrência na via e em equipamentos de via', 'Sinalização, detectores, AMV, trilhos, dormentes, postes e instalações.', '[{"chave":"km","rotulo":"Quilômetro (km)","tipo":"km","obrigatorio":true,"grupo":"Principal","ajuda":"Formato 115+500, sempre com sinal de mais."},{"chave":"ativo_afetado","rotulo":"Ativo ou material afetado","tipo":"texto","obrigatorio":false,"grupo":"Principal","ajuda":"O que foi cortado, subtraído, aberto, danificado ou localizado.","max":200},{"chave":"sb","rotulo":"Sigla (SB)","tipo":"texto","obrigatorio":false,"grupo":"Local","ajuda":"Somente a sigla da seção. Exemplo: ZPT.","max":10},{"chave":"trecho","rotulo":"Trecho","tipo":"select","obrigatorio":false,"grupo":"Local","opcoes":["TRECHO 0","TRECHO 1","TRECHO 2","TRECHO 3","TRECHO 4","TRECHO 5","TRECHO 6"]},{"chave":"cidade","rotulo":"Cidade","tipo":"texto","obrigatorio":false,"grupo":"Local","max":80},{"chave":"uf","rotulo":"UF","tipo":"select","obrigatorio":false,"grupo":"Local","opcoes":["AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"]},{"chave":"autoria","rotulo":"Autoria","tipo":"select","obrigatorio":false,"grupo":"Estatística","ajuda":"Marque CONHECIDA só quando o autor foi identificado, detido ou qualificado.","opcoes":["DESCONHECIDA","CONHECIDA"]},{"chave":"hora_inicio","rotulo":"Hora de início da ocorrência","tipo":"hora","obrigatorio":false,"grupo":"Estatística","ajuda":"HH:MM"},{"chave":"hora_final","rotulo":"Hora de liberação para a circulação","tipo":"hora","obrigatorio":false,"grupo":"Estatística","ajuda":"HH:MM"}]'::jsonb),
  ('APREENSAO', 'Material localizado ou apreendido', 'Material encontrado na faixa de domínio ou apreendido.', '[{"chave":"km","rotulo":"Quilômetro (km)","tipo":"km","obrigatorio":true,"grupo":"Principal","ajuda":"Formato 115+500, sempre com sinal de mais."},{"chave":"material_localizado","rotulo":"Material localizado ou apreendido","tipo":"texto","obrigatorio":true,"grupo":"Principal","ajuda":"Exemplo: combustível, cabos, trilho.","max":200},{"chave":"recipientes","rotulo":"Quantidade (número de recipientes)","tipo":"numero","obrigatorio":false,"grupo":"Principal","ajuda":"Informe só o número de galões, sacas, bombonas ou caixas. NÃO informe peso, volume ou litros: o material não foi periciado."},{"chave":"tipo_recipiente","rotulo":"Tipo de recipiente","tipo":"select","obrigatorio":false,"grupo":"Principal","opcoes":["GALÕES","SACAS","BOMBONAS","CAIXAS","UNIDADES"]},{"chave":"quem_apreendeu","rotulo":"Quem apreendeu","tipo":"texto","obrigatorio":false,"grupo":"Principal","ajuda":"Equipe ou órgão (não informe nomes de pessoas).","max":120},{"chave":"sb","rotulo":"Sigla (SB)","tipo":"texto","obrigatorio":false,"grupo":"Local","ajuda":"Somente a sigla da seção. Exemplo: ZPT.","max":10},{"chave":"trecho","rotulo":"Trecho","tipo":"select","obrigatorio":false,"grupo":"Local","opcoes":["TRECHO 0","TRECHO 1","TRECHO 2","TRECHO 3","TRECHO 4","TRECHO 5","TRECHO 6"]},{"chave":"cidade","rotulo":"Cidade","tipo":"texto","obrigatorio":false,"grupo":"Local","max":80},{"chave":"uf","rotulo":"UF","tipo":"select","obrigatorio":false,"grupo":"Local","opcoes":["AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"]},{"chave":"autoria","rotulo":"Autoria","tipo":"select","obrigatorio":false,"grupo":"Estatística","ajuda":"Marque CONHECIDA só quando o autor foi identificado, detido ou qualificado.","opcoes":["DESCONHECIDA","CONHECIDA"]},{"chave":"hora_inicio","rotulo":"Hora de início da ocorrência","tipo":"hora","obrigatorio":false,"grupo":"Estatística","ajuda":"HH:MM"}]'::jsonb),
  ('PESSOAS', 'Ataque ou agressão a pessoas', 'Ataques às equipes de segurança e a funcionários e colaboradores.', '[{"chave":"km","rotulo":"Quilômetro (km)","tipo":"km","obrigatorio":true,"grupo":"Principal","ajuda":"Formato 115+500, sempre com sinal de mais."},{"chave":"vitimas","rotulo":"Número de vítimas","tipo":"numero","obrigatorio":false,"grupo":"Principal"},{"chave":"lesao","rotulo":"Gravidade","tipo":"select","obrigatorio":false,"grupo":"Principal","opcoes":["SEM LESÃO","LESÃO LEVE","LESÃO GRAVE","ÓBITO"]},{"chave":"atendimento_medico","rotulo":"Houve atendimento médico?","tipo":"sim_nao","obrigatorio":false,"grupo":"Principal"},{"chave":"sb","rotulo":"Sigla (SB)","tipo":"texto","obrigatorio":false,"grupo":"Local","ajuda":"Somente a sigla da seção. Exemplo: ZPT.","max":10},{"chave":"trecho","rotulo":"Trecho","tipo":"select","obrigatorio":false,"grupo":"Local","opcoes":["TRECHO 0","TRECHO 1","TRECHO 2","TRECHO 3","TRECHO 4","TRECHO 5","TRECHO 6"]},{"chave":"cidade","rotulo":"Cidade","tipo":"texto","obrigatorio":false,"grupo":"Local","max":80},{"chave":"uf","rotulo":"UF","tipo":"select","obrigatorio":false,"grupo":"Local","opcoes":["AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"]},{"chave":"autoria","rotulo":"Autoria","tipo":"select","obrigatorio":false,"grupo":"Estatística","ajuda":"Marque CONHECIDA só quando o autor foi identificado, detido ou qualificado.","opcoes":["DESCONHECIDA","CONHECIDA"]},{"chave":"hora_inicio","rotulo":"Hora de início da ocorrência","tipo":"hora","obrigatorio":false,"grupo":"Estatística","ajuda":"HH:MM"}]'::jsonb),
  ('ACIDENTE', 'Acidente', 'Atropelamento, descarrilamento, abalroamento, acidente de trabalho e disparo acidental.', '[{"chave":"km","rotulo":"Quilômetro (km)","tipo":"km","obrigatorio":true,"grupo":"Principal","ajuda":"Formato 115+500, sempre com sinal de mais."},{"chave":"empresa","rotulo":"Empresa da composição","tipo":"select","obrigatorio":false,"grupo":"Composição","opcoes":["RUMO","VLI","MRS","BRADO","OUTRA"]},{"chave":"prefixo","rotulo":"Prefixo da composição","tipo":"texto","obrigatorio":false,"grupo":"Composição","ajuda":"Exemplo: T55. Não use código de seção (SB, ZPT...).","max":20},{"chave":"composicao","rotulo":"Locomotiva líder","tipo":"texto","obrigatorio":false,"grupo":"Composição","max":20},{"chave":"vitimas","rotulo":"Número de vítimas","tipo":"numero","obrigatorio":false,"grupo":"Principal"},{"chave":"obito","rotulo":"Houve óbito?","tipo":"sim_nao","obrigatorio":false,"grupo":"Principal"},{"chave":"sb","rotulo":"Sigla (SB)","tipo":"texto","obrigatorio":false,"grupo":"Local","ajuda":"Somente a sigla da seção. Exemplo: ZPT.","max":10},{"chave":"trecho","rotulo":"Trecho","tipo":"select","obrigatorio":false,"grupo":"Local","opcoes":["TRECHO 0","TRECHO 1","TRECHO 2","TRECHO 3","TRECHO 4","TRECHO 5","TRECHO 6"]},{"chave":"cidade","rotulo":"Cidade","tipo":"texto","obrigatorio":false,"grupo":"Local","max":80},{"chave":"uf","rotulo":"UF","tipo":"select","obrigatorio":false,"grupo":"Local","opcoes":["AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"]},{"chave":"hora_inicio","rotulo":"Hora de início da ocorrência","tipo":"hora","obrigatorio":false,"grupo":"Estatística","ajuda":"HH:MM"},{"chave":"hora_final","rotulo":"Hora de liberação para a circulação","tipo":"hora","obrigatorio":false,"grupo":"Estatística","ajuda":"HH:MM"}]'::jsonb),
  ('OBSTRUCAO', 'Obstrução de via', 'Materiais, veículos ou desastre natural obstruindo a via.', '[{"chave":"km","rotulo":"Quilômetro (km)","tipo":"km","obrigatorio":true,"grupo":"Principal","ajuda":"Formato 115+500, sempre com sinal de mais."},{"chave":"causa","rotulo":"Causa da obstrução","tipo":"texto","obrigatorio":false,"grupo":"Principal","max":200},{"chave":"sb","rotulo":"Sigla (SB)","tipo":"texto","obrigatorio":false,"grupo":"Local","ajuda":"Somente a sigla da seção. Exemplo: ZPT.","max":10},{"chave":"trecho","rotulo":"Trecho","tipo":"select","obrigatorio":false,"grupo":"Local","opcoes":["TRECHO 0","TRECHO 1","TRECHO 2","TRECHO 3","TRECHO 4","TRECHO 5","TRECHO 6"]},{"chave":"cidade","rotulo":"Cidade","tipo":"texto","obrigatorio":false,"grupo":"Local","max":80},{"chave":"uf","rotulo":"UF","tipo":"select","obrigatorio":false,"grupo":"Local","opcoes":["AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"]},{"chave":"hora_inicio","rotulo":"Hora de início da ocorrência","tipo":"hora","obrigatorio":false,"grupo":"Estatística","ajuda":"HH:MM"},{"chave":"hora_final","rotulo":"Hora de liberação para a circulação","tipo":"hora","obrigatorio":false,"grupo":"Estatística","ajuda":"HH:MM"}]'::jsonb),
  ('MANUTENCAO', 'Manutenção', 'Intervenções de manutenção mecânica, de via, de instalações ou perda de sinal.', '[{"chave":"km","rotulo":"Quilômetro (km)","tipo":"km","obrigatorio":true,"grupo":"Principal","ajuda":"Formato 115+500, sempre com sinal de mais."},{"chave":"ativo_afetado","rotulo":"Ativo ou material afetado","tipo":"texto","obrigatorio":false,"grupo":"Principal","ajuda":"O que foi cortado, subtraído, aberto, danificado ou localizado.","max":200},{"chave":"empresa","rotulo":"Empresa da composição","tipo":"select","obrigatorio":false,"grupo":"Composição","opcoes":["RUMO","VLI","MRS","BRADO","OUTRA"]},{"chave":"prefixo","rotulo":"Prefixo da composição","tipo":"texto","obrigatorio":false,"grupo":"Composição","ajuda":"Exemplo: T55. Não use código de seção (SB, ZPT...).","max":20},{"chave":"composicao","rotulo":"Locomotiva líder","tipo":"texto","obrigatorio":false,"grupo":"Composição","max":20},{"chave":"sb","rotulo":"Sigla (SB)","tipo":"texto","obrigatorio":false,"grupo":"Local","ajuda":"Somente a sigla da seção. Exemplo: ZPT.","max":10},{"chave":"trecho","rotulo":"Trecho","tipo":"select","obrigatorio":false,"grupo":"Local","opcoes":["TRECHO 0","TRECHO 1","TRECHO 2","TRECHO 3","TRECHO 4","TRECHO 5","TRECHO 6"]},{"chave":"cidade","rotulo":"Cidade","tipo":"texto","obrigatorio":false,"grupo":"Local","max":80},{"chave":"uf","rotulo":"UF","tipo":"select","obrigatorio":false,"grupo":"Local","opcoes":["AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"]},{"chave":"hora_inicio","rotulo":"Hora de início da ocorrência","tipo":"hora","obrigatorio":false,"grupo":"Estatística","ajuda":"HH:MM"},{"chave":"hora_final","rotulo":"Hora de liberação para a circulação","tipo":"hora","obrigatorio":false,"grupo":"Estatística","ajuda":"HH:MM"}]'::jsonb),
  ('PREVENCAO', 'Prevenção', 'Indivíduos, animais ou cadáver na via.', '[{"chave":"km","rotulo":"Quilômetro (km)","tipo":"km","obrigatorio":true,"grupo":"Principal","ajuda":"Formato 115+500, sempre com sinal de mais."},{"chave":"quantidade","rotulo":"Quantidade de pessoas ou animais","tipo":"numero","obrigatorio":false,"grupo":"Principal"},{"chave":"acao_adotada","rotulo":"Ação adotada","tipo":"textarea","obrigatorio":false,"grupo":"Principal","max":1000},{"chave":"autoridade_acionada","rotulo":"Autoridade acionada?","tipo":"sim_nao","obrigatorio":false,"grupo":"Principal"},{"chave":"sb","rotulo":"Sigla (SB)","tipo":"texto","obrigatorio":false,"grupo":"Local","ajuda":"Somente a sigla da seção. Exemplo: ZPT.","max":10},{"chave":"trecho","rotulo":"Trecho","tipo":"select","obrigatorio":false,"grupo":"Local","opcoes":["TRECHO 0","TRECHO 1","TRECHO 2","TRECHO 3","TRECHO 4","TRECHO 5","TRECHO 6"]},{"chave":"cidade","rotulo":"Cidade","tipo":"texto","obrigatorio":false,"grupo":"Local","max":80},{"chave":"uf","rotulo":"UF","tipo":"select","obrigatorio":false,"grupo":"Local","opcoes":["AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"]},{"chave":"hora_inicio","rotulo":"Hora de início da ocorrência","tipo":"hora","obrigatorio":false,"grupo":"Estatística","ajuda":"HH:MM"}]'::jsonb),
  ('BASICO', 'Formulário básico', 'Para combinações sem campos específicos.', '[{"chave":"km","rotulo":"Quilômetro (km)","tipo":"km","obrigatorio":true,"grupo":"Principal","ajuda":"Formato 115+500, sempre com sinal de mais."},{"chave":"ativo_afetado","rotulo":"Ativo ou material afetado","tipo":"texto","obrigatorio":false,"grupo":"Principal","ajuda":"O que foi cortado, subtraído, aberto, danificado ou localizado.","max":200},{"chave":"sb","rotulo":"Sigla (SB)","tipo":"texto","obrigatorio":false,"grupo":"Local","ajuda":"Somente a sigla da seção. Exemplo: ZPT.","max":10},{"chave":"trecho","rotulo":"Trecho","tipo":"select","obrigatorio":false,"grupo":"Local","opcoes":["TRECHO 0","TRECHO 1","TRECHO 2","TRECHO 3","TRECHO 4","TRECHO 5","TRECHO 6"]},{"chave":"cidade","rotulo":"Cidade","tipo":"texto","obrigatorio":false,"grupo":"Local","max":80},{"chave":"uf","rotulo":"UF","tipo":"select","obrigatorio":false,"grupo":"Local","opcoes":["AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"]}]'::jsonb)
on conflict (codigo) do nothing;

-- 156 combinações (natureza, tipo, subtipo, formulário)
insert into public.tipificacao (id, natureza, tipo, subtipo, formulario) values
  (1, 'criminal', 'ABERTURA', 'VAGÃO', 'COMPOSICAO'),
  (2, 'criminal', 'ABERTURA', 'BICA/TREMONHA', 'COMPOSICAO'),
  (3, 'criminal', 'ABERTURA', 'ESCOTILHA', 'COMPOSICAO'),
  (4, 'criminal', 'ABERTURA', 'CONTAINER', 'COMPOSICAO'),
  (5, 'criminal', 'ABERTURA', 'VAGÃO TANQUE', 'COMPOSICAO'),
  (6, 'criminal', 'DESENGATE', 'VAGÃO', 'COMPOSICAO'),
  (7, 'criminal', 'INCÊNDIO', 'VAGÃO', 'COMPOSICAO'),
  (8, 'criminal', 'INCÊNDIO', 'VIA', 'VIA'),
  (9, 'criminal', 'INCÊNDIO', 'COMPOSIÇÃO', 'COMPOSICAO'),
  (10, 'criminal', 'INCÊNDIO', 'EQUIPAMENTOS', 'VIA'),
  (11, 'criminal', 'INCÊNDIO', 'INSTALAÇÕES', 'VIA'),
  (12, 'criminal', 'FURTO', 'COMBUSTÍVEL', 'COMPOSICAO'),
  (13, 'criminal', 'FURTO', 'CARGA/GRÃOS', 'COMPOSICAO'),
  (14, 'criminal', 'FURTO', 'CABOS', 'COMPOSICAO'),
  (15, 'criminal', 'FURTO', 'PEÇAS DA COMPOSIÇÃO', 'COMPOSICAO'),
  (16, 'criminal', 'FURTO', 'MATERIAL LOGÍSTICO', 'BASICO'),
  (17, 'criminal', 'FURTO', 'HOT BOX', 'COMPOSICAO'),
  (18, 'criminal', 'FURTO', 'EQUIPAMENTO DE SINALIZAÇÃO', 'VIA'),
  (19, 'criminal', 'FURTO', 'POSTE DE MONITORAMENTO', 'VIA'),
  (20, 'criminal', 'FURTO', 'AMV', 'VIA'),
  (21, 'criminal', 'FURTO', 'DDC (DETECTOR DE DESCARRILAMENTO)', 'VIA'),
  (22, 'criminal', 'FURTO', 'DTQ (DETECTOR DE TRILHO QUEBRADO)', 'VIA'),
  (23, 'criminal', 'FURTO', 'DQB (DETECTOR DE QUEDA DE BARREIRA)', 'VIA'),
  (24, 'criminal', 'FURTO', 'MATERIAL DE FIXAÇÃO DE TRILHO', 'VIA'),
  (25, 'criminal', 'FURTO', 'DORMENTES', 'VIA'),
  (26, 'criminal', 'FURTO', 'TRILHO', 'VIA'),
  (27, 'criminal', 'FURTO', 'ENGRAXADEIRA', 'COMPOSICAO'),
  (28, 'criminal', 'FURTO', 'EQUIPAMENTO DA EQUIPE DE SEGURANÇA', 'BASICO'),
  (29, 'criminal', 'FURTO', 'HOUSE', 'VIA'),
  (30, 'criminal', 'ROUBO', 'COMBUSTÍVEL', 'COMPOSICAO'),
  (31, 'criminal', 'ROUBO', 'CARGA/GRÃOS', 'COMPOSICAO'),
  (32, 'criminal', 'ROUBO', 'CABOS', 'COMPOSICAO'),
  (33, 'criminal', 'ROUBO', 'PEÇAS DA COMPOSIÇÃO', 'COMPOSICAO'),
  (34, 'criminal', 'ROUBO', 'HOT BOX', 'COMPOSICAO'),
  (35, 'criminal', 'ROUBO', 'EQUIPAMENTO DE SINALIZAÇÃO', 'VIA'),
  (36, 'criminal', 'ROUBO', 'POSTE DE MONITORAMENTO', 'VIA'),
  (37, 'criminal', 'ROUBO', 'AMV', 'VIA'),
  (38, 'criminal', 'ROUBO', 'DTQ (DETECTOR DE TRILHO QUEBRADO)', 'VIA'),
  (39, 'criminal', 'ROUBO', 'DDC (DETECTOR DE DESCARRILAMENTO)', 'VIA'),
  (40, 'criminal', 'ROUBO', 'DQB (DETECTOR DE QUEDA DE BARREIRA)', 'VIA'),
  (41, 'criminal', 'ROUBO', 'MATERIAL DE FIXAÇÃO DE TRILHO', 'VIA'),
  (42, 'criminal', 'ROUBO', 'DORMENTES', 'VIA'),
  (43, 'criminal', 'ROUBO', 'ENGRAXADEIRA', 'COMPOSICAO'),
  (44, 'criminal', 'ROUBO', 'MATERIAL LOGÍSTICO', 'BASICO'),
  (45, 'criminal', 'ROUBO', 'TRILHO', 'VIA'),
  (46, 'criminal', 'ROUBO', 'EQUIPAMENTO DA EQUIPE DE SEGURANÇA', 'BASICO'),
  (47, 'criminal', 'ROUBO', 'HOUSE', 'VIA'),
  (48, 'criminal', 'RECEPTAÇÃO', 'COMBUSTÍVEL', 'COMPOSICAO'),
  (49, 'criminal', 'RECEPTAÇÃO', 'CARGA/GRÃOS', 'COMPOSICAO'),
  (50, 'criminal', 'RECEPTAÇÃO', 'CABOS', 'COMPOSICAO'),
  (51, 'criminal', 'RECEPTAÇÃO', 'PEÇAS DA COMPOSIÇÃO', 'COMPOSICAO'),
  (52, 'criminal', 'RECEPTAÇÃO', 'EQUIPAMENTO DE SINALIZAÇÃO', 'VIA'),
  (53, 'criminal', 'RECEPTAÇÃO', 'MATERIAL DE FIXAÇÃO DE TRILHO', 'VIA'),
  (54, 'criminal', 'RECEPTAÇÃO', 'DORMENTES', 'VIA'),
  (55, 'criminal', 'RECEPTAÇÃO', 'EQUIPAMENTO DA EQUIPE DE SEGURANÇA', 'BASICO'),
  (56, 'criminal', 'RECEPTAÇÃO', 'TRILHO', 'VIA'),
  (57, 'criminal', 'RECEPTAÇÃO', 'MATERIAL LOGÍSTICO', 'BASICO'),
  (58, 'criminal', 'OBSTRUÇÃO DE VIA', 'MATERIAIS VARIADOS', 'OBSTRUCAO'),
  (59, 'criminal', 'OBSTRUÇÃO DE VIA', 'DESASTRE NATURAL', 'OBSTRUCAO'),
  (60, 'criminal', 'OBSTRUÇÃO DE VIA', 'VEÍCULOS', 'OBSTRUCAO'),
  (61, 'criminal', 'APREENSÃO', 'CARGA/GRÃOS', 'APREENSAO'),
  (62, 'criminal', 'APREENSÃO', 'COMBUSTÍVEL', 'APREENSAO'),
  (63, 'criminal', 'APREENSÃO', 'MATERIAL LOGÍSTICO', 'APREENSAO'),
  (64, 'criminal', 'APREENSÃO', 'PEÇAS DA COMPOSIÇÃO', 'APREENSAO'),
  (65, 'criminal', 'APREENSÃO', 'MATERIAL DE FIXAÇÃO DE TRILHO', 'APREENSAO'),
  (66, 'criminal', 'APREENSÃO', 'DORMENTES', 'APREENSAO'),
  (67, 'criminal', 'APREENSÃO', 'TRILHO', 'APREENSAO'),
  (68, 'criminal', 'APREENSÃO', 'ENTORPECENTES/ILÍCITOS', 'APREENSAO'),
  (69, 'criminal', 'APREENSÃO', 'MATERIAL PREPARATÓRIO PARA FURTO', 'APREENSAO'),
  (70, 'criminal', 'DANO', 'CORTE DE MANGUEIRA', 'COMPOSICAO'),
  (71, 'criminal', 'DANO', 'CORTE DE CABOS', 'COMPOSICAO'),
  (72, 'criminal', 'DANO', 'DEPREDAÇÃO', 'BASICO'),
  (73, 'criminal', 'DANO', 'COMPOSIÇÃO', 'COMPOSICAO'),
  (74, 'criminal', 'DANO', 'INSTALAÇÕES', 'VIA'),
  (75, 'criminal', 'DANO', 'TORNEIRA FECHADA', 'COMPOSICAO'),
  (76, 'criminal', 'DANO', 'HOT BOX', 'COMPOSICAO'),
  (77, 'criminal', 'DANO', 'EQUIPAMENTO DE SINALIZAÇÃO', 'VIA'),
  (78, 'criminal', 'DANO', 'POSTE DE MONITORAMENTO', 'VIA'),
  (79, 'criminal', 'DANO', 'AMV', 'VIA'),
  (80, 'criminal', 'DANO', 'DTQ (DETECTOR DE TRILHO QUEBRADO)', 'VIA'),
  (81, 'criminal', 'DANO', 'DDC (DETECTOR DE DESCARRILAMENTO)', 'VIA'),
  (82, 'criminal', 'DANO', 'DQB (DETECTOR DE QUEDA DE BARREIRA)', 'VIA'),
  (83, 'criminal', 'DANO', 'MATERIAL DE FIXAÇÃO DE TRILHO', 'VIA'),
  (84, 'criminal', 'DANO', 'DORMENTES', 'VIA'),
  (85, 'criminal', 'DANO', 'ENGRAXADEIRA', 'COMPOSICAO'),
  (86, 'criminal', 'DANO', 'TRILHO', 'VIA'),
  (87, 'criminal', 'DANO', 'FREIO MANUAL APLICADO', 'COMPOSICAO'),
  (88, 'criminal', 'DANO', 'HOUSE', 'VIA'),
  (89, 'criminal', 'DANO', 'MATERIAL LOGÍSTICO', 'BASICO'),
  (90, 'criminal', 'ATAQUE ÀS EQUIPES DE SEGURANÇA', 'ROUBO DE ARMAMENTO', 'PESSOAS'),
  (91, 'criminal', 'ATAQUE ÀS EQUIPES DE SEGURANÇA', 'LATROCÍNIO', 'PESSOAS'),
  (92, 'criminal', 'ATAQUE ÀS EQUIPES DE SEGURANÇA', 'HOMICÍDIO', 'PESSOAS'),
  (93, 'criminal', 'ATAQUE ÀS EQUIPES DE SEGURANÇA', 'AGRESSÃO', 'PESSOAS'),
  (94, 'criminal', 'ATAQUE ÀS EQUIPES DE SEGURANÇA', 'AMEAÇA', 'PESSOAS'),
  (95, 'criminal', 'ATAQUE ÀS EQUIPES DE SEGURANÇA', 'CONSTRANGIMENTO ILEGAL', 'PESSOAS'),
  (96, 'criminal', 'ATAQUE ÀS EQUIPES DE SEGURANÇA', 'DIFAMAÇÃO/INJÚRIA', 'PESSOAS'),
  (97, 'criminal', 'ATAQUES A FUNCIONÁRIOS E COLABORADORES', 'LATROCÍNIO', 'PESSOAS'),
  (98, 'criminal', 'ATAQUES A FUNCIONÁRIOS E COLABORADORES', 'HOMICÍDIO', 'PESSOAS'),
  (99, 'criminal', 'ATAQUES A FUNCIONÁRIOS E COLABORADORES', 'AGRESSÃO', 'PESSOAS'),
  (100, 'criminal', 'ATAQUES A FUNCIONÁRIOS E COLABORADORES', 'AMEAÇA', 'PESSOAS'),
  (101, 'criminal', 'ATAQUES A FUNCIONÁRIOS E COLABORADORES', 'CONSTRANGIMENTO ILEGAL', 'PESSOAS'),
  (102, 'criminal', 'ATAQUES A FUNCIONÁRIOS E COLABORADORES', 'DIFAMAÇÃO/INJÚRIA', 'PESSOAS'),
  (103, 'criminal', 'ATAQUES A FUNCIONÁRIOS E COLABORADORES', 'ASSÉDIO MORAL', 'PESSOAS'),
  (104, 'criminal', 'ATAQUES A FUNCIONÁRIOS E COLABORADORES', 'ASSÉDIO SEXUAL', 'PESSOAS'),
  (105, 'mecanica', 'ABERTURA', 'VAGÃO', 'COMPOSICAO'),
  (106, 'mecanica', 'ABERTURA', 'BICA/TREMONHA', 'COMPOSICAO'),
  (107, 'mecanica', 'ABERTURA', 'ESCOTILHA', 'COMPOSICAO'),
  (108, 'mecanica', 'ABERTURA', 'CONTAINER', 'COMPOSICAO'),
  (109, 'mecanica', 'ABERTURA', 'VAGÃO TANQUE', 'COMPOSICAO'),
  (110, 'mecanica', 'DESENGATE', 'VAGÃO', 'COMPOSICAO'),
  (111, 'mecanica', 'INCÊNDIO', 'VAGÃO', 'COMPOSICAO'),
  (112, 'mecanica', 'INCÊNDIO', 'VIA', 'VIA'),
  (113, 'mecanica', 'INCÊNDIO', 'COMPOSIÇÃO', 'COMPOSICAO'),
  (114, 'mecanica', 'INCÊNDIO', 'EQUIPAMENTOS', 'VIA'),
  (115, 'mecanica', 'INCÊNDIO', 'INSTALAÇÕES', 'VIA'),
  (116, 'mecanica', 'ACIDENTE', 'ATROPELAMENTO', 'ACIDENTE'),
  (117, 'mecanica', 'ACIDENTE', 'DESCARRILAMENTO', 'ACIDENTE'),
  (118, 'mecanica', 'ACIDENTE', 'TRÂNSITO', 'ACIDENTE'),
  (119, 'mecanica', 'ACIDENTE', 'ABALROAMENTO', 'ACIDENTE'),
  (120, 'mecanica', 'ACIDENTE', 'TRABALHO', 'ACIDENTE'),
  (121, 'mecanica', 'MANUTENÇÃO', 'MECÂNICA', 'MANUTENCAO'),
  (122, 'mecanica', 'MANUTENÇÃO', 'PERDA DE SINAL/COMUNICAÇÃO', 'MANUTENCAO'),
  (123, 'mecanica', 'MANUTENÇÃO', 'VIA', 'MANUTENCAO'),
  (124, 'mecanica', 'MANUTENÇÃO', 'INSTALAÇÕES', 'MANUTENCAO'),
  (125, 'natural', 'INCÊNDIO', 'VAGÃO', 'COMPOSICAO'),
  (126, 'natural', 'INCÊNDIO', 'VIA', 'VIA'),
  (127, 'natural', 'INCÊNDIO', 'COMPOSIÇÃO', 'COMPOSICAO'),
  (128, 'natural', 'INCÊNDIO', 'EQUIPAMENTOS', 'VIA'),
  (129, 'natural', 'INCÊNDIO', 'INSTALAÇÕES', 'VIA'),
  (130, 'natural', 'OBSTRUÇÃO DE VIA', 'MATERIAIS VARIADOS', 'OBSTRUCAO'),
  (131, 'natural', 'OBSTRUÇÃO DE VIA', 'DESASTRE NATURAL', 'OBSTRUCAO'),
  (132, 'natural', 'OBSTRUÇÃO DE VIA', 'VEÍCULOS', 'OBSTRUCAO'),
  (133, 'social', 'DESENGATE', 'VAGÃO', 'COMPOSICAO'),
  (134, 'social', 'ACIDENTE', 'ATROPELAMENTO', 'ACIDENTE'),
  (135, 'social', 'ACIDENTE', 'DESCARRILAMENTO', 'ACIDENTE'),
  (136, 'social', 'ACIDENTE', 'TRÂNSITO', 'ACIDENTE'),
  (137, 'social', 'ACIDENTE', 'ABALROAMENTO', 'ACIDENTE'),
  (138, 'social', 'ACIDENTE', 'TRABALHO', 'ACIDENTE'),
  (139, 'social', 'DISPARO ACIDENTAL', 'ARMA DE FOGO', 'ACIDENTE'),
  (140, 'social', 'DISPARO ACIDENTAL', 'ARMAMENTO NÃO LETAL', 'ACIDENTE'),
  (141, 'social', 'OBSTRUÇÃO DE VIA', 'MATERIAIS VARIADOS', 'OBSTRUCAO'),
  (142, 'social', 'OBSTRUÇÃO DE VIA', 'DESASTRE NATURAL', 'OBSTRUCAO'),
  (143, 'social', 'OBSTRUÇÃO DE VIA', 'VEÍCULOS', 'OBSTRUCAO'),
  (144, 'social', 'APREENSÃO', 'CARGA/GRÃOS', 'APREENSAO'),
  (145, 'social', 'APREENSÃO', 'COMBUSTÍVEL', 'APREENSAO'),
  (146, 'social', 'APREENSÃO', 'MATERIAL LOGÍSTICO', 'APREENSAO'),
  (147, 'social', 'APREENSÃO', 'PEÇAS DA COMPOSIÇÃO', 'APREENSAO'),
  (148, 'social', 'APREENSÃO', 'MATERIAL DE FIXAÇÃO DE TRILHO', 'APREENSAO'),
  (149, 'social', 'APREENSÃO', 'DORMENTES', 'APREENSAO'),
  (150, 'social', 'APREENSÃO', 'TRILHO', 'APREENSAO'),
  (151, 'social', 'APREENSÃO', 'ENTORPECENTES/ILÍCITOS', 'APREENSAO'),
  (152, 'social', 'APREENSÃO', 'MATERIAL PREPARATÓRIO PARA FURTO', 'APREENSAO'),
  (153, 'social', 'PREVENÇÃO', 'INDIVÍDUO NA VIA', 'PREVENCAO'),
  (154, 'social', 'PREVENÇÃO', 'INDIVÍDUO EMBARCADO', 'PREVENCAO'),
  (155, 'social', 'PREVENÇÃO', 'CADÁVER NA VIA', 'PREVENCAO'),
  (156, 'social', 'PREVENÇÃO', 'ANIMAIS NA VIA', 'PREVENCAO')
on conflict do nothing;  -- nem o mesmo ID, nem a mesma combinação com outro ID

-- tipos criminais da planilha também em tipos_ocorrencia (ocorrencias.tipo aponta para lá)
insert into public.tipos_ocorrencia (nome)
select distinct tipo from public.tipificacao where natureza = 'criminal'
on conflict (nome) do nothing;

commit;
