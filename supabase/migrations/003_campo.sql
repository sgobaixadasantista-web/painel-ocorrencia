-- =====================================================================
-- Painel de Campo — complemento do esquema (rode DEPOIS da 001 e da 002)
--   * registro que funciona sem sinal: guarda o horário real em que o campo registrou
--     e não duplica se o aparelho reenviar o mesmo registro
--   * GPS opcional do registro
--   * contas novas passam a nascer INATIVAS até alguém liberar (campo agora grava eventos)
-- =====================================================================

-- ---------- Contas novas só funcionam depois de liberadas ----------
-- Antes da 003, conta nova era "campo" e ativa. Agora o campo registra eventos,
-- então quem cria conta não pode entrar sozinho: o administrador libera com
--   update public.perfis set perfil = '...', ativo = true where email = '...';
alter table public.perfis alter column ativo set default false;

-- ---------- Colunas novas em eventos ----------
alter table public.eventos
  add column client_id uuid,
  add column latitude  numeric(9,6),
  add column longitude numeric(9,6),
  add constraint eventos_latitude_ck  check (latitude  is null or latitude  between -90  and 90),
  add constraint eventos_longitude_ck check (longitude is null or longitude between -180 and 180),
  add constraint eventos_gps_par_ck   check ((latitude is null) = (longitude is null));

-- Mesmo aparelho reenviando o mesmo registro (queda de sinal no meio) não cria evento duplicado.
create unique index eventos_client_id_uq on public.eventos (criado_por, client_id) where client_id is not null;

-- ---------- registrar_evento (nova versão) ----------
drop function public.registrar_evento(text, text, text[]);

create function public.registrar_evento(
  p_local text, p_descricao text, p_fotos text[] default '{}',
  p_client_id uuid default null, p_registrado_em timestamptz default null,
  p_latitude numeric default null, p_longitude numeric default null)
returns public.eventos
language plpgsql security definer set search_path = public as $$
declare
  ev public.eventos; f text; uid uuid := auth.uid();
  ts timestamptz := now(); ajustado boolean := false; qtd int := coalesce(array_length(p_fotos, 1), 0);
begin
  perform public.exige_perfil('campo','central','admin');

  -- reenvio do mesmo registro: devolve o que já existe
  if p_client_id is not null then
    select * into ev from public.eventos where criado_por = uid and client_id = p_client_id;
    if found then return ev; end if;
  end if;

  if coalesce(btrim(p_local), '') = '' or coalesce(btrim(p_descricao), '') = '' then
    raise exception 'dados_incompletos' using errcode = '22023', hint = 'Informe o local e o que aconteceu.';
  end if;
  if length(p_local) > 120 or length(p_descricao) > 4000 then
    raise exception 'dados_incompletos' using errcode = '22023', hint = 'Texto longo demais. Resuma o local e a descrição.';
  end if;
  if qtd > 6 then
    raise exception 'fotos_demais' using errcode = '22023', hint = 'Envie no máximo 6 fotos por registro.';
  end if;
  -- cada foto precisa estar na pasta da própria pessoa (não dá para anexar foto de outra)
  foreach f in array coalesce(p_fotos, '{}') loop
    if f is null or length(f) > 200 or left(f, length(uid::text) + 1) <> uid::text || '/' then
      raise exception 'foto_invalida' using errcode = '22023', hint = 'Foto fora da sua pasta de envio.';
    end if;
  end loop;
  if (p_latitude is null) <> (p_longitude is null)
     or p_latitude not between -90 and 90 or p_longitude not between -180 and 180 then
    raise exception 'gps_invalido' using errcode = '22023', hint = 'Localização GPS inválida.';
  end if;

  -- Horário em que o campo registrou (vale para registro feito sem sinal).
  -- Futuro ou mais de 30 dias atrás indica relógio errado: usa o horário do servidor.
  if p_registrado_em is not null then
    if p_registrado_em > now() + interval '5 minutes' or p_registrado_em < now() - interval '30 days' then
      ajustado := true;
    else
      ts := least(p_registrado_em, now());
    end if;
  end if;

  insert into public.eventos (local, descricao, criado_em, criado_por, client_id, latitude, longitude)
  values (btrim(p_local), btrim(p_descricao), ts, uid, p_client_id, p_latitude, p_longitude)
  returning * into ev;

  foreach f in array coalesce(p_fotos, '{}') loop
    insert into public.evento_fotos (evento_id, storage_path) values (ev.id, f);
  end loop;

  perform public.registrar_historico('evento', ev.id, 'registrado',
    jsonb_build_object('fotos', qtd, 'enviado_depois', ts < now() - interval '1 minute', 'relogio_ajustado', ajustado));
  return ev;
exception when unique_violation then
  -- dois reenvios ao mesmo tempo: o segundo devolve o evento criado pelo primeiro
  select * into ev from public.eventos where criado_por = uid and client_id = p_client_id;
  if found then return ev; end if;
  raise;
end $$;

revoke all on function public.registrar_evento(text, text, text[], uuid, timestamptz, numeric, numeric) from public, anon, authenticated;
grant execute on function public.registrar_evento(text, text, text[], uuid, timestamptz, numeric, numeric) to authenticated;

-- ---------- Visão de eventos: acrescenta o GPS (colunas novas no fim) ----------
create or replace view public.v_fila_eventos with (security_invoker = true) as
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
  e.latitude, e.longitude
from public.eventos e
left join public.perfis p on p.id = e.criado_por;

grant select on public.v_fila_eventos to authenticated;
