/* Configuração do painel.
   - Sem SUPABASE_URL e SUPABASE_ANON_KEY o painel abre em MODO DEMONSTRAÇÃO (dados fictícios, nada é gravado).
   - A chave "anon" é pública por desenho: quem protege os dados são as regras (RLS) do arquivo supabase/migrations.
   - NUNCA coloque a chave "service_role" aqui. */
window.PAINEL_CONFIG = {
  SUPABASE_URL: 'https://fnqvmuvpensjofiucuty.supabase.co',        // exemplo: https://abcdefgh.supabase.co
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZucXZtdXZwZW5zam9maXVjdXR5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE1NTM2ODQsImV4cCI6MjEwNzEyOTY4NH0.dENyG5OkSjy6UoJznfaIvxujjo_IMs9-fO9aeawihi8',   // Supabase > Project Settings > API > anon public
  BUCKET: 'evidencias',    // bucket privado criado pela migração
  PRAZO_ATENCAO_H: 4,      // acima disso o evento fica em "atenção" (valor de referência, a validar com a Rumo)
  PRAZO_CRITICO_H: 24,     // acima disso o evento fica "atrasado" (valor de referência, a validar com a Rumo)
  ATUALIZAR_A_CADA_SEG: 60 // atualização automática de segurança, além do tempo real
};
