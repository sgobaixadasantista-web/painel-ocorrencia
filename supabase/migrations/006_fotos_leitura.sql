-- Restringe a leitura de evidências: perfis de atendimento e inteligência podem
-- consultar todo o bucket; campo só consulta a própria pasta (UID autenticado).
-- Mantém os arquivos e a política de envio originais; execução idempotente.
drop policy if exists evidencias_leitura on storage.objects;

create policy evidencias_leitura on storage.objects
for select to authenticated
using (
  bucket_id = 'evidencias'
  and (
    public.perfil_atual() in ('central', 'inteligencia', 'admin')
    or (
      public.perfil_atual() = 'campo'
      and (storage.foldername(name))[1] = auth.uid()::text
    )
  )
);
