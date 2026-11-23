// Teste da 015 (formulários condicionais da classificação) e do supabase/atualizar_tipificacao.sql gerado,
// num Postgres em memória (PGlite), partindo das migrations 001 a 004 (natureza em texto, como em produção).
// Uso, numa pasta fora do projeto: npm i @electric-sql/pglite@0.2.17
//   node <projeto>/supabase/testes/testar_015.mjs <projeto>/supabase
import { PGlite } from '@electric-sql/pglite';
import fs from 'fs';
const [, , raiz] = process.argv;
const ler = n => fs.readFileSync(`${raiz}/${n}`, 'utf8');
const db = new PGlite();
await db.exec(`create role anon nologin; create role authenticated nologin;
create schema auth; create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}');
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth to anon, authenticated; grant execute on function auth.uid() to anon, authenticated;
create schema storage; create table storage.buckets (id text primary key, name text, public boolean);
create table storage.objects (id uuid default gen_random_uuid(), bucket_id text, name text); alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[] language sql as $$ select string_to_array(name, '/') $$;`);
for (const m of ['001_painel_ocorrencias.sql', '002_inteligencia.sql', '003_campo.sql', '004_tipificacao.sql']) await db.exec(ler('migrations/' + m));
await db.exec(ler('migrations/015_formularios_condicionais.sql'));
await db.exec(ler('migrations/015_formularios_condicionais.sql'));   // roda de novo sem erro
await db.exec(ler('atualizar_tipificacao.sql'));
await db.exec(ler('atualizar_tipificacao.sql'));                     // e o carregamento também

let falhas = 0;
const conf = (nome, ok, extra = '') => { console.log((ok ? 'ok   ' : 'FALHA') + ' ' + nome + (ok ? '' : ' -> ' + extra)); if (!ok) falhas++; };
const um = async (q, p = []) => (await db.query(q, p)).rows[0];
async function validar(codigo, dados) {
  try { const r = await um(`select public.validar_dados_formulario((select campos from public.formularios where codigo = $1), $2::jsonb) as r`, [codigo, JSON.stringify(dados)]); return { ok: true, r: r.r }; }
  catch (e) { return { ok: false, erro: e.message, dica: e.hint || '' }; }
}

// ---------- carga ----------
const at = await um(`select count(*)::int n from public.tipificacao where ativo`);
conf('148 combinações ativas', at.n === 148, at.n);
const fm = await um(`select count(*)::int n from public.formularios where codigo like 'CL\\_%'`);
conf('86 formulários gerados', fm.n === 86, fm.n);
const sem = await um(`select count(*)::int n from public.tipificacao t where t.ativo and not exists (select 1 from public.formularios f where f.codigo = t.formulario and f.ativo)`);
conf('toda combinação ativa abre um formulário ativo', sem.n === 0, sem.n);
const id13 = await um(`select natureza::text, tipo, subtipo, formulario, ativo from public.tipificacao where id = 13`);
conf('ID antigo mantido (13 = CRIMINAL > FURTO > CARGA/GRÃOS, agora no formulário novo)', id13.tipo === 'FURTO' && id13.subtipo === 'CARGA/GRÃOS' && id13.formulario === 'CL_FURTO__CARGA_GRAOS' && id13.ativo, JSON.stringify(id13));
const inat = await um(`select count(*)::int n from public.tipificacao where not ativo`);
conf('combinações que saíram da base ficam inativas (66)', inat.n === 66, inat.n);
const antigo = await um(`select count(*)::int n from public.formularios where codigo in ('COMPOSICAO','VIA','BASICO')`);
conf('formulários antigos continuam existindo', antigo.n === 3, antigo.n);

// ---------- validação ----------
const F = 'CL_FURTO__CARGA_GRAOS';
const base = { malha: 'RUMO MALHA PAULISTA', km: '115+500', empresa: 'RUMO', composicao: 'C1', locomotiva: '7012', produto: 'SOJA', gerou_alarme_rx: 'NÃO' };
let r = await validar(F, base);
conf('formulário completo sem alarme passa', r.ok, r.dica);
r = await validar(F, { ...base, malha: '' });
conf('malha é obrigatória', !r.ok && /Empresa \(malha\)/.test(r.dica), r.dica);
r = await validar(F, { ...base, gerou_alarme_rx: 'SIM' });
conf('com alarme = SIM, os campos do alarme passam a ser obrigatórios', !r.ok && /GEOLOCALIZA/.test(r.dica), r.dica);
r = await validar(F, { ...base, geolocalizacao_do_alarme: 'X' });
conf('campo escondido não pode vir preenchido', !r.ok && /não se aplica/.test(r.dica), r.dica);
const alarme = { geolocalizacao_do_alarme: 'G', horario: '10:00', sb_2: 'ZZV', km_2: '1', tipo_descricao_do_alarme: 'T', locomotiva_estava_ligada_desligada: 'LIGADA', posicao_da_locomotiva_vandalizada: 'P', blindagem_da_locomotiva: 'SIM' };
r = await validar(F, { ...base, gerou_alarme_rx: 'SIM', ...alarme });
conf('com alarme = SIM e campos preenchidos passa', r.ok, r.dica);
r = await validar(F, { ...base, quantidade: '1,5' });
conf('decimal aceita vírgula', r.ok, r.dica);
r = await validar(F, { ...base, quantidade: '1,5555' });
conf('decimal recusa mais de 3 casas', !r.ok, JSON.stringify(r));
r = await validar(F, { ...base, horario_da_emergencia: '2026-02-30T10:00' });
conf('data inexistente é recusada', !r.ok && /inexistente/.test(r.dica), r.dica);
r = await validar(F, { ...base, horario_da_emergencia: '2026-11-11T11:25', horario_de_chegada_da_equipe_de_seguranca: '2026-11-11T10:00' });
conf('horário antes da emergência é recusado', !r.ok && /anterior/.test(r.dica), r.dica);
r = await validar(F, { ...base, horario_da_emergencia: '2026-11-11T11:25', horario_de_liberacao_para_a_circulacao: '2026-11-11T13:17', thp_total: '01:52' });
conf('horários em ordem e THP 01:52 passam', r.ok && r.r.thp_total === '01:52', r.dica);
r = await validar(F, { ...base, thp_total: '25:05' });
conf('THP acima de 24 h passa', r.ok, r.dica);
r = await validar(F, { ...base, thp_total: '1:75' });
conf('THP com minutos inválidos é recusado', !r.ok, JSON.stringify(r));
// "aparece se o tipo for preenchido" (MANUTENÇÃO > VIA vem com TIPO DE MANUTENÇÃO pré-preenchido pela tela)
const mv = await um(`select campos from public.formularios where codigo = 'CL_MANUTENCAO__VIA'`);
const tipoMan = mv.campos.find(c => c.chave === 'tipo_de_manutencao');
conf('TIPO DE MANUTENÇÃO tem valor padrão para VIA', tipoMan && tipoMan.padrao === 'PERDA DE SINAL/COMUNICAÇÃO E VIA', JSON.stringify(tipoMan));
const vMan = { malha: 'RUMO MALHA NORTE', km: '10+000', composicao: 'C9' };
r = await validar('CL_MANUTENCAO__VIA', { ...vMan, tipo_de_manutencao: tipoMan.padrao });
conf('"preenchido": com o tipo preenchido a composição é aceita', r.ok, r.dica);
const semTipo = mv.campos.map(c => c.chave === 'tipo_de_manutencao' ? { ...c, obrigatorio: false } : c);
try { await um(`select public.validar_dados_formulario($1::jsonb, $2::jsonb)`, [JSON.stringify(semTipo), JSON.stringify(vMan)]); conf('"preenchido": sem o tipo a composição não se aplica', false, 'passou'); }
catch (e) { conf('"preenchido": sem o tipo a composição não se aplica', /COMPOSI.*não se aplica/.test(e.hint || ''), e.hint); }
// formulário antigo sem atributos novos continua igual
r = await validar('COMPOSICAO', { km: '115+500' });
conf('formulário antigo continua validando', r.ok, r.dica);
r = await validar('COMPOSICAO', {});
conf('formulário antigo continua exigindo km', !r.ok && /Quilômetro/.test(r.dica), r.dica);

// ---------- triagem de ponta a ponta ----------
const U = 'c0000000-0000-4000-8000-000000000001';
await db.exec(`insert into auth.users (id, email) values ('${U}','central@x.com');
  insert into public.perfis (id, nome, email, perfil, ativo) values ('${U}','Central','central@x.com','central', true) on conflict (id) do update set perfil = 'central', ativo = true;
  insert into public.eventos (id, ano, numero, local, descricao, criado_por) values ('e0000000-0000-4000-8000-000000000001', 2026, 1, 'ZZV', 'Furto de carga', '${U}');`);
await db.exec(`select set_config('request.jwt.claim.sub', '${U}', false)`);
try {
  const t = await um(`select public.triar_evento('e0000000-0000-4000-8000-000000000001', 13, $1::jsonb, null, now(), 'análise', null) as r`, [JSON.stringify({ ...base, gerou_alarme_rx: 'SIM', ...alarme })]);
  const oc = await um(`select tipo, subtipo, dados from public.ocorrencias where id = ($1::jsonb->>'ocorrencia_id')::uuid`, [JSON.stringify(t.r)]);
  conf('triagem criminal cria a ocorrência com os dados do formulário', oc && oc.subtipo === 'CARGA/GRÃOS' && oc.dados.blindagem_da_locomotiva === 'SIM' && oc.dados.malha === 'RUMO MALHA PAULISTA', JSON.stringify(oc));
} catch (e) { conf('triagem criminal cria a ocorrência', false, e.message + ' ' + (e.hint || '')); }

console.log(falhas ? `\n${falhas} falha(s)` : '\nTudo certo.');
process.exit(falhas ? 1 : 0);
