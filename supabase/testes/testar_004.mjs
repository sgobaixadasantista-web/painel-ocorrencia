// Testa a 004 num Postgres real (PGlite, roda em memória) com as peças do Supabase simuladas (auth, storage, papéis).
// Dois cenários: banco novo (001 a 004) e banco como o de produção (tipificacao, formularios e siglas já criados à parte).
// Uso, numa pasta fora do projeto:
//   npm i @electric-sql/pglite@0.2.17
//   node <projeto>/supabase/testes/testar_004.mjs <projeto>/supabase/migrations
import { PGlite } from '@electric-sql/pglite';
import fs from 'fs';
const MIG = process.argv[2];
const ler = n => fs.readFileSync(`${MIG}/${n}`, 'utf8');
const STUB = `
create role anon nologin; create role authenticated nologin;
create schema auth; create schema storage;
create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}');
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth to anon, authenticated; grant execute on function auth.uid() to anon, authenticated;
create table storage.buckets (id text primary key, name text, public boolean);
create table storage.objects (id uuid default gen_random_uuid(), bucket_id text, name text);
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[] language sql as $$ select string_to_array(name, '/') $$;
`;
// tabelas como estão em produção (export do painel do Supabase), antes da 004
const PROD = `
create table public.formularios (codigo text primary key, nome text not null, descricao text not null default '', campos jsonb not null default '[]', ativo boolean not null default true);
create table public.tipificacao (id integer primary key, natureza text not null, tipo text not null, subtipo text not null, formulario text not null references public.formularios(codigo), ativo boolean not null default true);
create table public.aux_trechos (codigo text primary key, ordem integer not null default 0, ativo boolean not null default true);
create table public.aux_siglas (trecho_codigo text not null references public.aux_trechos(codigo), sigla text not null, ordem integer not null default 0, ativo boolean not null default true, primary key (trecho_codigo, sigla));
grant select on public.formularios, public.tipificacao, public.aux_trechos, public.aux_siglas to anon, authenticated;
insert into public.formularios values ('BASICO', 'Básico (ajustado em produção)', '', '[{"chave":"km","rotulo":"Km","tipo":"km","obrigatorio":true}]', true);
insert into public.tipificacao values (1, 'criminal', 'ABERTURA', 'VAGÃO', 'BASICO', true);
insert into public.aux_trechos values ('TRECHO 1', 1, true); insert into public.aux_siglas values ('TRECHO 1', 'ZPT', 1, true);
`;
let ok = 0, falhas = 0;
function conf(nome, cond, extra = '') { if (cond) { ok++; } else { falhas++; console.log('  FALHOU:', nome, extra); } }

async function como(db, uid, role, sql, params = []) {
  await db.exec('begin');
  try {
    await db.query(`select set_config('request.jwt.claim.sub', $1, true)`, [uid || '']);
    await db.exec(`set local role ${role}`);
    const r = await db.query(sql, params);
    await db.exec('commit'); return { rows: r.rows };
  } catch (e) { await db.exec('rollback'); return { erro: e.message, hint: e.hint || '' }; }
}

async function cenario(nome, comProd) {
  console.log(`\n== ${nome}`);
  const db = new PGlite();
  await db.exec(STUB);
  for (const f of ['001_painel_ocorrencias.sql', '002_inteligencia.sql', '003_campo.sql']) await db.exec(ler(f));
  if (comProd) await db.exec(PROD);
  await db.exec(ler('004_tipificacao.sql'));
  await db.exec(ler('004_tipificacao.sql'));   // rodar de novo não pode quebrar nem duplicar
  conf('004 roda duas vezes', true);

  const n = (await db.query('select count(*)::int n from public.tipificacao')).rows[0].n;
  const nf = (await db.query('select count(*)::int n from public.formularios')).rows[0].n;
  if (comProd) {
    // combinação 1 já existia com o formulário BASICO ajustado: não pode ser sobrescrita
    const t1 = (await db.query('select formulario from public.tipificacao where id = 1')).rows[0];
    const fb = (await db.query("select nome from public.formularios where codigo = 'BASICO'")).rows[0];
    conf('não sobrescreve combinação existente', t1.formulario === 'BASICO');
    conf('não sobrescreve formulário existente', fb.nome === 'Básico (ajustado em produção)');
    conf('sigla existente preservada', (await db.query('select count(*)::int n from public.aux_siglas')).rows[0].n === 1);
  }
  conf('156 combinações', n === 156, n); conf('9 formulários', nf === 9, nf);

  // pessoas
  const U = { campo: '11111111-1111-4111-8111-111111111111', central: '22222222-2222-4222-8222-222222222222', intel: '33333333-3333-4333-8333-333333333333' };
  for (const [p, id] of Object.entries(U)) {
    await db.query('insert into auth.users (id, email) values ($1, $2)', [id, p + '@x.com']);
    await db.query('update public.perfis set ativo = true, perfil = $2 where id = $1', [id, p === 'intel' ? 'inteligencia' : p]);
  }
  const novoEvento = async () => (await como(db, U.campo, 'authenticated', `select (public.registrar_evento('Trecho 1, km 10+000', 'teste', '{}', null, null, -23.5, -46.6)).id`)).rows[0].id;
  const triar = (uid, args) => como(db, uid, 'authenticated',
    'select public.triar_evento($1, $2, $3::jsonb, $4, $5, $6, $7) r',
    [args.ev, args.tp, JSON.stringify(args.dados || {}), args.forma || null, args.fato || null, args.mesa || null, args.obs || null]);

  // combinação criminal do formulário COMPOSICAO e uma mecânica
  const crim = (await db.query("select t.id, t.tipo from public.tipificacao t where natureza = 'criminal' and formulario = 'COMPOSICAO' and id <> 1 order by id limit 1")).rows[0];
  const mec = (await db.query("select id from public.tipificacao where natureza = 'mecanica' order by id limit 1")).rows[0];
  const apr = (await db.query("select id from public.tipificacao where formulario = 'APREENSAO' order by id limit 1")).rows[0];

  // leitura
  conf('anon não lê tipificacao', !!(await como(db, '', 'anon', 'select * from public.tipificacao')).erro);
  conf('logado ativo lê tipificacao', (await como(db, U.campo, 'authenticated', 'select count(*)::int n from public.tipificacao')).rows?.[0].n === 156);
  await db.query("insert into auth.users (id, email) values ('44444444-4444-4444-8444-444444444444', 'novo@x.com')");
  conf('conta inativa não lê tipificacao', (await como(db, '44444444-4444-4444-8444-444444444444', 'authenticated', 'select count(*)::int n from public.tipificacao')).rows?.[0].n === 0);

  // permissões
  let ev = await novoEvento();
  let r = await triar(U.campo, { ev, tp: crim.id, dados: { km: '115+500' }, fato: new Date().toISOString() });
  conf('campo não faz triagem', r.erro === 'sem_permissao', JSON.stringify(r));
  r = await como(db, U.central, 'authenticated', "select public.triar_evento_criminal($1, 'ABERTURA', 'VAGÃO', null, now(), null)", [ev]);
  conf('triagem antiga bloqueada', /permission denied/.test(r.erro || ''), JSON.stringify(r));

  // validações do formulário
  const casos = [
    [{ }, 'dados_incompletos', /Quilômetro/],
    [{ km: '115,500' }, 'dados_invalidos', /115\+500/],
    [{ km: '115+500', inventado: 'x' }, 'dados_invalidos', /não existe/],
    [{ km: '115+500', empresa: 'XYZ' }, 'dados_invalidos', /opções/],
    [{ km: '115+500', hora_inicio: '25:00' }, 'dados_invalidos', /HH:MM/],
    [{ km: '115+500', prefixo: 'x'.repeat(21) }, 'dados_invalidos', /longo/],
  ];
  for (const [dados, cod, re] of casos) {
    r = await triar(U.central, { ev, tp: crim.id, dados, fato: new Date().toISOString() });
    conf('validação ' + JSON.stringify(dados).slice(0, 40), r.erro === cod && re.test(r.hint), JSON.stringify(r));
  }
  r = await triar(U.central, { ev, tp: apr.id, dados: { km: '1+000', recipientes: '2,5', material_localizado: 'cabos' }, fato: new Date().toISOString() });
  conf('número só com dígitos', r.erro === 'dados_invalidos', JSON.stringify(r));
  r = await triar(U.central, { ev, tp: crim.id, dados: { km: '115+500' } });
  conf('criminal exige fato_em', r.erro === 'dados_incompletos', JSON.stringify(r));
  r = await triar(U.central, { ev, tp: 99999, dados: {} });
  conf('combinação inexistente', r.erro === 'tipificacao_invalida', JSON.stringify(r));

  // triagem criminal válida
  r = await triar(U.central, { ev, tp: crim.id, dados: { km: ' 115+500 ', empresa: 'RUMO', hora_inicio: '' }, forma: 'flagrante', fato: new Date(Date.now() - 3600e3).toISOString(), mesa: 'análise' });
  const ocId = r.rows?.[0]?.r?.ocorrencia_id;
  conf('criminal cria ocorrência', !!ocId, JSON.stringify(r));
  const oc = (await como(db, U.intel, 'authenticated', 'select * from public.v_fila_ocorrencias where id = $1', [ocId])).rows?.[0];
  conf('ocorrência com tipificação', oc && oc.natureza === 'criminal' && oc.tipificacao_id === crim.id && oc.tipo === crim.tipo, JSON.stringify(oc));
  conf('dados limpos (sem espaços nem vazios)', oc && JSON.stringify(oc.dados) === JSON.stringify({ km: '115+500', empresa: 'RUMO' }), JSON.stringify(oc?.dados));
  conf('GPS do evento na ocorrência', oc && Number(oc.latitude) === -23.5);
  conf('tipo entrou em tipos_ocorrencia', (await db.query('select 1 from public.tipos_ocorrencia where nome = $1', [crim.tipo])).rows.length === 1);
  const ve = (await como(db, U.central, 'authenticated', 'select * from public.v_fila_eventos where id = $1', [ev])).rows?.[0];
  conf('evento concluído com tipificação na visão', ve && ve.status === 'concluido' && ve.tipif_natureza === 'criminal' && ve.triagem_dados?.km === '115+500' && ve.ocorrencia_id === ocId, JSON.stringify(ve));
  r = await triar(U.central, { ev, tp: crim.id, dados: { km: '1+000' }, fato: new Date().toISOString() });
  conf('não tria duas vezes', r.erro === 'evento_ja_concluido', JSON.stringify(r));
  conf('campo continua vendo o próprio evento', (await como(db, U.campo, 'authenticated', 'select tipif_tipo from public.v_fila_eventos where id = $1', [ev])).rows?.[0]?.tipif_tipo === crim.tipo);

  // fluxo da inteligência continua funcionando sobre a ocorrência nova
  r = await como(db, U.intel, 'authenticated', "select public.responder_boletim($1, false), public.classificar_ocorrencia($1, 'criminal'), public.concluir_ocorrencia($1)", [ocId]);
  conf('boletim, classificação e conclusão', !r.erro, JSON.stringify(r));

  // não criminal
  ev = await novoEvento();
  r = await triar(U.central, { ev, tp: mec.id, dados: { km: '2+000' } });
  conf('mecânica exige observação', r.erro === 'dados_incompletos', JSON.stringify(r));
  r = await triar(U.central, { ev, tp: mec.id, dados: { km: '2+000' }, obs: 'Equipe de manutenção acionada.' });
  conf('mecânica finaliza sem ocorrência', r.rows?.[0]?.r?.ocorrencia_id === null, JSON.stringify(r));
  const e2 = (await db.query('select triagem_categoria, tipificacao_id from public.eventos where id = $1', [ev])).rows[0];
  conf('categoria mecanico', e2.triagem_categoria === 'mecanico' && e2.tipificacao_id === mec.id, JSON.stringify(e2));

  // combinação desativada
  ev = await novoEvento();
  await db.query('update public.tipificacao set ativo = false where id = $1', [mec.id]);
  r = await triar(U.central, { ev, tp: mec.id, dados: { km: '2+000' }, obs: 'x' });
  conf('combinação inativa recusada', r.erro === 'tipificacao_invalida', JSON.stringify(r));

  // KPIs e resumo continuam respondendo
  r = await como(db, U.intel, 'authenticated', 'select public.resumo_inteligencia(30) r');
  conf('resumo_inteligencia', !r.erro, JSON.stringify(r));
  await db.close();
}

await cenario('Banco novo (001 a 004)', false);
await cenario('Banco como produção (tabelas já criadas à parte)', true);
console.log(`\n${ok} verificações ok, ${falhas} falharam`);
process.exit(falhas ? 1 : 0);
