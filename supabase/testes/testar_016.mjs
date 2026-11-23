// Teste da 016 (malha ferroviária: trecho > sigla > km com cidade e UF) num Postgres em memória (PGlite).
// Uso, numa pasta fora do projeto: npm i @electric-sql/pglite@0.2.17
//   node <projeto>/supabase/testes/testar_016.mjs <projeto>/supabase
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
for (const m of ['001_painel_ocorrencias.sql', '002_inteligencia.sql', '003_campo.sql', '004_tipificacao.sql', '016_malha_pontos.sql', '016_malha_pontos.sql'])
  await db.exec(ler('migrations/' + m));   // a 016 roda duas vezes sem erro

let falhas = 0;
const conf = (nome, ok, extra = '') => { console.log((ok ? 'ok   ' : 'FALHA') + ' ' + nome + (ok ? '' : ' -> ' + extra)); if (!ok) falhas++; };

// carga: o CSV inteiro, como o Table Editor faria
const linhas = ler('dados/malha_pontos.csv').trim().split('\n');
const cab = linhas.shift();
conf('cabeçalho do CSV bate com a tabela', cab === 'trecho,sigla,km_metros,km_texto,lat,lon,cidade,uf,codigo_ibge', cab);
const q = s => s === '' ? 'null' : "'" + s.replace(/'/g, "''") + "'";
for (let i = 0; i < linhas.length; i += 5000) {
  const vals = linhas.slice(i, i + 5000).map(l => { const c = l.split(','); return `(${q(c[0])},${q(c[1])},${c[2]},${q(c[3])},${c[4]},${c[5]},${q(c[6])},${q(c[7])},${q(c[8])})`; });
  await db.exec('insert into public.malha_pontos values ' + vals.join(',') + ';');
}
const n = (await db.query('select count(*)::int n, count(cidade)::int c from public.malha_pontos')).rows[0];
conf(`todos os marcos carregados com cidade (${n.n})`, n.n === linhas.length && n.c === n.n, JSON.stringify(n));
try { await db.exec(`insert into public.malha_pontos values ('X','Y',1,'1+0',0,0,null,null,null)`); conf('km_texto fora do formato é recusado', false, 'aceitou'); }
catch { conf('km_texto fora do formato é recusado', true); }

// leitura: só perfil ativo
const U = 'c0000000-0000-4000-8000-000000000001', I = 'c0000000-0000-4000-8000-000000000002';
await db.exec(`insert into auth.users (id, email) values ('${U}','central@x.com'), ('${I}','inativo@x.com');
  insert into public.perfis (id, nome, email, perfil, ativo) values ('${U}','Central','central@x.com','central', true), ('${I}','Inativo','inativo@x.com','central', false)
  on conflict (id) do update set perfil = excluded.perfil, ativo = excluded.ativo;`);
async function como(uid, sql) {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${uid}', false);`);
  try { return (await db.query(sql)).rows; } finally { await db.exec('reset role'); }
}
const sig = await como(U, `select trecho, sigla, km_min, km_max, cidades from public.v_malha_siglas where trecho = 'TRECHO 0' and sigla = 'ZZV'`);
conf('central lê a sigla com faixa de km e cidades', sig.length === 1 && /Cubatão\/SP/.test(sig[0].cidades), JSON.stringify(sig));
const kms = await como(U, `select km_texto, cidade, uf from public.malha_pontos where trecho = 'TRECHO 0' and sigla = 'ZPG' order by km_metros limit 3`);
conf('central lê os km da sigla com cidade e UF', kms.length === 3 && kms[0].cidade === 'Cubatão' && kms[0].uf === 'SP', JSON.stringify(kms));
const nada = await como(I, 'select count(*)::int n from public.malha_pontos');
conf('perfil inativo não lê nada', nada[0].n === 0, JSON.stringify(nada));
try { await como(U, `insert into public.malha_pontos values ('X','Y',1,'0+001',0,0,null,null,null)`); conf('ninguém grava pelo navegador', false, 'gravou'); }
catch { conf('ninguém grava pelo navegador', true); }

console.log(falhas ? `\n${falhas} falha(s)` : '\nTudo certo.');
process.exit(falhas ? 1 : 0);
