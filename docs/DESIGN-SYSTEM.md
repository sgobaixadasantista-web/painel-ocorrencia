# Security CCS — Design System v1.0.0

## Objetivo
Fonte única de estilos e componentes para o Painel de Ocorrências (Central, Inteligência, Campo, Frota, Veículos, Efetivo e GPS). Crescer por **composição de componentes**, sem copiar CSS por tela.

## Arquivos e prioridade
1. `css/tokens.css` — tokens legados DNA Rumo (compatibilidade).
2. `css/rumo.css` — componentes legados `r-*`.
3. `css/app.css` — exceções temporárias do projeto.
4. **`css/design-system.css`** — tokens semânticos e API nova `ccs-*`.

A ordem deve ser preservada no `index.html`. Não copiar a folha de estilo de uma tela para outra. Preferir componentes `ccs-*` em novas funcionalidades; migrar as existentes gradualmente.

## Identidade visual
- Azul principal `#0B2942`, azul hover `#164A6B`
- Laranja destaque `#F58220` (ações principais e foco)
- Tipografia Inter, já disponibilizada em `css/tokens.css`
- Espaçamento baseado em 4, 8, 12, 16, 24 px
- Bordas de 8/12/16 px; controles com altura mínima de 40 px
- Suporte a tema escuro via variáveis `--rumo-*` já existentes

## Componentes
| Tipo | Classes | Uso |
|---|---|---|
| Estrutura | `ccs-page`, `ccs-page-header`, `ccs-page-title`, `ccs-page-description` | Páginas |
| Layout | `ccs-grid`, `ccs-stack`, `ccs-inline` | Agrupamento |
| Cards | `ccs-card`, `ccs-card-title`, `ccs-kpi-label`, `ccs-kpi-value` | KPIs |
| Botões | `ccs-btn`, `ccs-btn--accent`, `ccs-btn--outline`, `ccs-btn--danger`, `ccs-btn--sm` | Ações |
| Formulários | `ccs-field`, `ccs-input`, `ccs-select`, `ccs-textarea` | Entrada |
| Filtros | `ccs-toolbar` | Busca e filtros |
| Tabela | `ccs-table-wrap`, `ccs-table`, `ccs-actions` | Dados tabulares |
| Estados | `ccs-badge`, `ccs-badge--success/warning/danger`, `ccs-empty` | Situações |
| Modal | `ccs-modal-backdrop`, `ccs-modal`, `ccs-modal-header` | Diálogos e galerias |

## Exemplo de tabela
```html
<section class="ccs-page">
  <div class="ccs-page-header"><h1 class="ccs-page-title">Equipes</h1></div>
  <div class="ccs-toolbar"><label class="ccs-field">Pesquisar
    <input class="ccs-input" type="search">
  </label></div>
  <div class="ccs-table-wrap"><table class="ccs-table">
    <thead><tr><th scope="col">Equipe</th><th scope="col">Status</th></tr></thead>
    <tbody><tr><td>Equipe A</td><td><span class="ccs-badge ccs-badge--success">Online</span></td></tr></tbody>
  </table></div>
</section>
```

## Regras de evolução
- **Tabelas:** cabeçalho azul, 13 px, bordas discretas, ações na última coluna; preservar rolagem horizontal.
- **Datas visíveis:** `dd/mm/aaaa`; se o horário for operacionalmente relevante, `dd/mm/aaaa HH:mm`. Gravar no banco em formato nativo.
- **Fotos:** abrir galeria em modal com miniaturas; nunca depender de nova aba.
- **Acessibilidade:** foco visível, labels, áreas clicáveis suficientes, estados de carregamento e vazio.
- **Segurança:** o Design System não substitui autenticação/RLS; esconder um botão não autoriza uma operação.
- **Responsividade:** cards refluem, filtros quebram linhas, tabelas rolam horizontalmente.
- **Migração:** não remover classes legadas antes de migrar todos os módulos que as utilizam.
- **Versionamento:** mudanças incompatíveis exigem nova versão major; componentes novos, minor; correções, patch.
