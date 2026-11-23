// Teste da 018 (catálogo de artigos penais da IA) e do supabase/atualizar_artigos.sql gerado,
// num Postgres em memória (PGlite), partindo das migrations 001 a 003.
// Uso, numa pasta fora do projeto: npm i @electric-sql/pglite@0.2.17
//   node <projeto>/supabase/testes/testar_018.mjs <projeto>/supabase
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

let falhas = 0, oks = 0;
const conf = (nome, ok, extra = '') => { if (ok) oks++; else { falhas++; console.log('FALHA ' + nome + ' -> ' + extra); } };

// carga antes da 018: para com aviso
let erro = '';
try { await db.exec(ler('atualizar_artigos.sql')); } catch (e) { erro = e.message; }
conf('carga sem a 018 para com aviso', /018_artigos_penais/.test(erro), erro);

for (const m of ['001_painel_ocorrencias.sql', '002_inteligencia.sql', '003_campo.sql']) await db.exec(ler('migrations/' + m));
await db.exec(ler('migrations/018_artigos_penais.sql'));
await db.exec(ler('migrations/018_artigos_penais.sql'));   // roda de novo sem erro
await db.exec(ler('atualizar_artigos.sql'));
await db.exec(ler('atualizar_artigos.sql'));                // e a carga também

const um = async (q, p = []) => (await db.query(q, p)).rows[0];
const base = JSON.parse(ler('dados/artigos-penais.json')).artigos;
conf('todos os artigos da base carregados e ativos', (await um(`select count(*)::int n from public.artigos_penais where ativo`)).n === base.length);
conf('furto com a pena da Lei 15.397/2026', /1 \(um\) a 6 \(seis\)/.test((await um(`select pena from public.artigos_penais where codigo = 'CP_155'`)).pena));
conf('tráfico é da Lei de Drogas, não do Código Penal', /11\.343/.test((await um(`select lei from public.artigos_penais where codigo = 'L11343_33'`)).lei));
conf('todo artigo tem caput', (await um(`select count(*)::int n from public.artigos_penais where length(caput) < 10`)).n === 0);

// leitura por perfil
const uid = { int: '00000000-0000-4000-8000-000000000001', campo: '00000000-0000-4000-8000-000000000002', cen: '00000000-0000-4000-8000-000000000003' };
await db.exec(`insert into auth.users (id, email) values ('${uid.int}', 'i@x'), ('${uid.campo}', 'c@x'), ('${uid.cen}', 'ce@x');`);
await db.exec(`update public.perfis set perfil = 'inteligencia', ativo = true where id = '${uid.int}';
               update public.perfis set perfil = 'campo', ativo = true where id = '${uid.campo}';
               update public.perfis set perfil = 'central', ativo = true where id = '${uid.cen}';`);
const como = async (papel, sub, sql) => {
  await db.exec(`set role ${papel}; select set_config('request.jwt.claim.sub', '${sub || ''}', false);`);
  try { return await db.query(sql); } finally { await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`); }
};
const conta = async (papel, sub) => { try { return (await como(papel, sub, `select count(*)::int n from public.artigos_penais`)).rows[0].n; } catch (e) { return 'erro'; } };
conf('inteligência lê o catálogo', (await conta('authenticated', uid.int)) === base.length);
conf('campo não lê', (await conta('authenticated', uid.campo)) === 0);
conf('central não lê', (await conta('authenticated', uid.cen)) === 0);
conf('anon não tem acesso', (await conta('anon', null)) === 'erro');
let gravou = true;
try { await como('authenticated', uid.int, `update public.artigos_penais set titulo = 'x' where codigo = 'CP_155'`); } catch { gravou = false; }
conf('ninguém grava pelo navegador', !gravou);

// artigo que sai da base fica inativo, sem apagar
await db.exec(`insert into public.artigos_penais (codigo, titulo, artigo, lei, caput) values ('CP_999', 'Teste', 'Art. 999', 'Código Penal', 'Texto de teste do artigo')`);
await db.exec(ler('atualizar_artigos.sql'));
const r = await um(`select ativo from public.artigos_penais where codigo = 'CP_999'`);
conf('artigo fora da base fica inativo (não é apagado)', r && r.ativo === false, JSON.stringify(r));

console.log(`${oks} ok, ${falhas} falha(s)`);
process.exit(falhas ? 1 : 0);
