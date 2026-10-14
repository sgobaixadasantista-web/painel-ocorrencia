// Função do Supabase: analisar-ocorrencia
// Deploy:   supabase functions deploy analisar-ocorrencia
// Segredos: supabase secrets set OPENAI_API_KEY=sk-proj-...   (opcional: OPENAI_MODEL=...)
// O Supabase injeta SUPABASE_URL e SUPABASE_ANON_KEY automaticamente.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { handle } from './handler.ts';

Deno.serve((req: Request) =>
  handle(req, {
    env: (nome) => Deno.env.get(nome),
    fetch,
    criarCliente: (url, chaveAnon, token) =>
      createClient(url, chaveAnon, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false } }),
  })
);
