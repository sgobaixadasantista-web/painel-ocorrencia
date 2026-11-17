-- =====================================================================
-- 009 — Formulários da classificação de ocorrência (um por subtipo) — rode DEPOIS da 004 e ANTES do
--       supabase/atualizar_tipificacao.sql gerado pela base nova (tools/gerar_tipificacao.py).
--   * campos condicionais: "exibir_se" { campo, valor } ou { campo, preenchido: true }
--       - campo escondido não é obrigatório e NÃO pode vir preenchido (ninguém salva resposta que a tela não mostrou)
--   * tipos novos: data_hora (AAAA-MM-DDTHH:MM), duracao (hh:mm, ex. 01:52; horas podem passar de 24),
--                  decimal (até 3 casas, vírgula ou ponto)
--   * "nao_antes_de": horário que não pode ser anterior a outro (ex.: chegada da equipe x emergência)
--   * "padrao": valor sugerido pela tela (não muda nada aqui; só documentado)
-- Formulários antigos (sem esses atributos) continuam validando exatamente como na 004.
-- Pode rodar de novo sem erro.
-- =====================================================================

-- Trava: sem a 004 esta migration criaria a função sozinha.
-- (a natureza pode ser texto com check, como em produção, ou enum: os dois servem)
do $$ begin
  if to_regclass('public.formularios') is null or to_regclass('public.tipificacao') is null then
    raise exception 'Rode antes a migration 004_tipificacao.sql (não existem as tabelas formularios e tipificacao).';
  end if;
end $$;

create or replace function public.validar_dados_formulario(p_campos jsonb, p_dados jsonb)
returns jsonb
language plpgsql stable set search_path = public as $$   -- stable (não immutable): usa to_timestamp
declare
  c jsonb; k text; t text; r text; tp text; mx int; cond jsonb; ctrl text; mudou boolean; novo boolean; volta int := 0;
  saida jsonb := '{}'::jsonb; valores jsonb := '{}'::jsonb; visivel jsonb := '{}'::jsonb; ts timestamptz; ts_ref timestamptz;
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

  -- valores limpos (mesma leitura da 004) e visibilidade
  for c in select x from jsonb_array_elements(p_campos) x loop
    k := c->>'chave';
    t := case when p_dados->k is null or jsonb_typeof(p_dados->k) = 'null' then ''
              when jsonb_typeof(p_dados->k) = 'string' then btrim(p_dados->>k)
              else btrim((p_dados->k)::text) end;
    if t <> '' then valores := valores || jsonb_build_object(k, t); end if;
    visivel := visivel || jsonb_build_object(k, true);
  end loop;
  -- ponto fixo: um campo só aparece se o campo que o controla também aparece
  loop
    mudou := false; volta := volta + 1;
    for c in select x from jsonb_array_elements(p_campos) x loop
      cond := c->'exibir_se'; if cond is null or jsonb_typeof(cond) <> 'object' then continue; end if;
      k := c->>'chave'; ctrl := cond->>'campo';
      novo := coalesce((visivel->>ctrl)::boolean, false) and (
                case when coalesce((cond->>'preenchido')::boolean, false) then valores ? ctrl
                     else coalesce(valores->>ctrl = cond->>'valor', false) end);
      if novo is distinct from (visivel->>k)::boolean then visivel := visivel || jsonb_build_object(k, novo); mudou := true; end if;
    end loop;
    exit when not mudou or volta > 50;
  end loop;

  for c in select x from jsonb_array_elements(p_campos) x loop
    k := c->>'chave'; r := coalesce(c->>'rotulo', k); tp := c->>'tipo';
    t := coalesce(valores->>k, '');
    if not (visivel->>k)::boolean then
      if t <> '' then
        raise exception 'dados_invalidos' using errcode = '22023', hint = r || ': este campo não se aplica com as respostas dadas.';
      end if;
      continue;
    end if;
    if t = '' then
      if coalesce((c->>'obrigatorio')::boolean, false) then
        raise exception 'dados_incompletos' using errcode = '22023', hint = 'Preencha o campo: ' || r || '.';
      end if;
      continue;
    end if;
    mx := coalesce((c->>'max')::int, case when tp = 'textarea' then 2000 else 200 end);
    if tp = 'numero' and t !~ '^\d{1,9}$' then
      raise exception 'dados_invalidos' using errcode = '22023', hint = r || ': informe só números.';
    elsif tp = 'decimal' and t !~ '^\d{1,9}([.,]\d{1,3})?$' then
      raise exception 'dados_invalidos' using errcode = '22023', hint = r || ': informe um número (até 3 casas decimais).';
    elsif tp = 'km' and t !~ '^\d{1,4}\+\d{3}$' then
      raise exception 'dados_invalidos' using errcode = '22023', hint = r || ': use o formato 115+500.';
    elsif tp = 'hora' and t !~ '^([01]\d|2[0-3]):[0-5]\d$' then
      raise exception 'dados_invalidos' using errcode = '22023', hint = r || ': use o formato HH:MM.';
    elsif tp = 'duracao' and t !~ '^\d{1,3}:[0-5]\d$' then
      raise exception 'dados_invalidos' using errcode = '22023', hint = r || ': use horas e minutos, ex. 01:52.';
    elsif tp = 'data_hora' then
      if t !~ '^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d$' then
        raise exception 'dados_invalidos' using errcode = '22023', hint = r || ': informe data e hora.';
      end if;
      begin ts := to_timestamp(t, 'YYYY-MM-DD"T"HH24:MI');
        if to_char(ts, 'YYYY-MM-DD"T"HH24:MI') <> t then raise exception 'x'; end if;
      exception when others then
        raise exception 'dados_invalidos' using errcode = '22023', hint = r || ': data inexistente.';
      end;
    elsif tp = 'sim_nao' and t not in ('sim','nao') then
      raise exception 'dados_invalidos' using errcode = '22023', hint = r || ': escolha Sim ou Não.';
    elsif tp = 'select' and not coalesce(c->'opcoes', '[]'::jsonb) ? t then
      raise exception 'dados_invalidos' using errcode = '22023', hint = r || ': escolha uma das opções da lista.';
    elsif tp in ('texto','textarea') and length(t) > mx then
      raise exception 'dados_invalidos' using errcode = '22023', hint = r || ': texto longo demais.';
    end if;
    saida := saida || jsonb_build_object(k, t);
  end loop;

  -- ordem dos horários: "nao_antes_de" compara com outro campo data_hora já validado
  for c in select x from jsonb_array_elements(p_campos) x loop
    k := c->>'chave'; ctrl := c->>'nao_antes_de';
    if ctrl is null or not (saida ? k) or not (saida ? ctrl) then continue; end if;
    ts := to_timestamp(saida->>k, 'YYYY-MM-DD"T"HH24:MI'); ts_ref := to_timestamp(saida->>ctrl, 'YYYY-MM-DD"T"HH24:MI');
    if ts < ts_ref then
      raise exception 'dados_invalidos' using errcode = '22023',
        hint = coalesce(c->>'rotulo', k) || ': não pode ser anterior a ' || coalesce((select x->>'rotulo' from jsonb_array_elements(p_campos) x where x->>'chave' = ctrl limit 1), ctrl) || '.';
    end if;
  end loop;
  return saida;
end $$;

revoke all on function public.validar_dados_formulario(jsonb, jsonb) from public, anon, authenticated;
