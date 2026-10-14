-- =====================================================================
-- DADOS DE EXEMPLO (opcional) — rode só em ambiente de teste.
-- Cria 6 eventos aguardando triagem e 2 já concluídos, para o painel não abrir vazio.
-- Não cria ocorrências: elas nascem quando a central faz a triagem criminal.
-- Para apagar depois: delete from public.eventos where descricao like '[EXEMPLO]%';
-- =====================================================================
insert into public.eventos (local, descricao, criado_em) values
  ('Trecho 0, km 89+900',          '[EXEMPLO] Cabos cortados entre dois vagões de uma composição parada. Sem pessoas no local.', now() - interval '9 hours 12 minutes'),
  ('Pátio de Paratinga',           '[EXEMPLO] Material de fixação de trilho encontrado na faixa de domínio, próximo à linha 2.',   now() - interval '3 hours 50 minutes'),
  ('Passagem em nível, km 14+841', '[EXEMPLO] Cancela quebrada por veículo. Condutor deixou o local. Sem feridos.',                now() - interval '35 minutes'),
  ('ZLI-Limeira, km 103+200',      '[EXEMPLO] Pessoas na via férrea próximo ao cruzamento, retiradas pela equipe de segurança.',   now() - interval '1 hour 40 minutes'),
  ('Santos, km 14+000',            '[EXEMPLO] Vazamento de óleo na via, aproximadamente 2 m².',                                    now() - interval '30 hours'),
  ('ZKE-Canguera, km 78+900',      '[EXEMPLO] Alarme de intrusão disparado no abrigo de equipamentos.',                            now() - interval '14 minutes');

insert into public.eventos (local, descricao, criado_em, status, concluido_em, triagem_categoria, triagem_observacao, triagem_em) values
  ('TGR-Agrenco', '[EXEMPLO] Desgaste excessivo na roda de um vagão.', now() - interval '50 hours', 'concluido', now() - interval '47 hours', 'mecanico', 'Vagão encaminhado para a manutenção da oficina.', now() - interval '47 hours'),
  ('Trecho 3',    '[EXEMPLO] Árvore caída sobre a via após temporal.',  now() - interval '26 hours', 'concluido', now() - interval '24 hours', 'natural',  'Árvore removida pela equipe de via permanente.',   now() - interval '24 hours');
