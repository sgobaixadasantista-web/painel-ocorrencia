# Integração visual — DNA Rumo

A implementação usa a especificação de `DNA-Rumo.zip`, especialmente
`project/tokens.json`, `components/Button/README.md` e `components/bundle.css`.
A biblioteca original de componentes tem classes `r-*` já presentes no projeto;
não foi copiada novamente para evitar conflito de CSS.

## Ordem de estilos

`tokens.css` → `rumo.css` → `app.css` → `design-system.css` →
`navigation.css` → `photo-gallery.css` → `modules.css` →
**`dna-rumo-integration.css`**.

A última folha contém apenas normalização visual de componentes existentes:
formulários, botões, tabelas, cards, modais, navegação e layouts móveis.
Não foram modificados seletores JavaScript, eventos, Supabase ou a estrutura dos formulários.

## Hierarquia de ações

- **Primária:** laranja `--rumo-orange`, texto `--rumo-on-orange`.
- **Secundária:** `--rumo-accent` com texto `--rumo-on-accent`.
- **Neutra:** superfície e contorno.
- **Destrutiva:** `--status-danger` com `--rumo-on-danger`.
- Controles gerais 44px; compactos de tabelas 36px.

## Conferência visual necessária antes da produção

- [ ] Campo: etapa local, relato, fotos e revisão; envio online e offline.
- [ ] Central: lista de eventos, filtros, triagem e formulários.
- [ ] Inteligência: ocorrências, parecer, classificação e modais.
- [ ] GPS: filtros, tabela e modal Leaflet.
- [ ] Efetivo e Veículo no Turno: tabelas, paginação, fotos e atualização.
- [ ] Frota e Colaboradores: formulários, listagens, galeria e ações de exclusão.
- [ ] Desktop, celular, navegação expandida/recolhida e tema escuro.
- [ ] Contraste, foco no teclado, abas e ausência de recortes horizontais.

`sw.js` usa cache `v4` para evitar manter CSS antigo instalado.

**Status:** alterações CSS integradas ao HTML e cache. Testes visuais reais
em navegador e deploy de produção não foram executados.
