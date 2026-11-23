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


## Padrão de navegação v1.0 (22/10/2026)

**Modelo oficial proposto:** sidebar recolhível no desktop e gaveta no mobile, com barra superior permanente. Eliminar botões de módulo amontoados na topbar na migração.

### Hierarquia
- **Operações:** Visão geral, Ocorrências, Monitoramento GPS.
- **Gestão:** Efetivo no Turno, Veículo no Turno, Frota e Checklists.
- **Cadastros:** Colaboradores, Postos e Escalas (só administrador) e futuros cadastros mestres.
- **Conta:** Perfil, seleção de visão (se administrador), Sair.

### Contrato visual e de comportamento
- Desktop >= 1024 px: sidebar fixa e sempre expandida, de 240 px; conteúdo usa a largura restante. (O modo recolhido de 64 px foi previsto, mas hoje está desligado.)
- Mobile < 1024 px: sidebar em gaveta com backdrop, fechada por padrão; fecha ao navegar, no Escape ou no backdrop.
- Topbar: logomarca/nome, controle do menu, atualização, tema e perfil; nenhuma lista de módulos na barra.
- Item selecionado destacado por fundo azul profundo e barra laranja, com `aria-current="page"`.
- Breadcrumb `Visão / Módulo`; título principal por tela; ações específicas alinhadas à direita do título.
- Módulos de lista: filtros > indicadores > tabela paginada; galerias e edições usam modal interno.
- Menus obedecem perfil, mas RLS e permissões do backend permanecem obrigatórios.
- Alvos clicáveis >= 40 px e foco visível; navegação por teclado e labels acessíveis.
- URLs/rotas deverão preservar a tela selecionada ao atualizar; esta regra exige migração funcional antes de declarar implementação completa.

### Estratégia de migração
1. Criar shell reutilizável sem modificar dados ou fluxos dos módulos.
2. Envolver Central/Inteligência com navegação persistente.
3. Converter módulos atualmente abertos como overlays para views do shell; manter galerias como modais.
4. Adaptar Campo separadamente para uso operacional mobile.
5. Testar cada perfil, desktop/mobile, roteamento, volta/refresh e deploy antes de remover menus legados.

**Estado atual (10/11/2026):** a sidebar e a topbar permanente já estão em uso na Central (`js/navigation.js`, `css/navigation.css`). Os módulos abrem como painéis ao lado da sidebar, não como views com rota: atualizar a página volta para Eventos, e o breadcrumb ainda não existe.

## Como criar um módulo do painel

Todo módulo novo abre **dentro do painel**, ao lado do menu lateral e abaixo da barra superior, nunca como página HTML separada. Exemplo completo: **Postos e Escalas** (`js/postos.js`).

### 1. Arquivo do módulo: `js/<modulo>.js`
- Envolva tudo numa função `(function(){ ... })();` e exponha só o que o menu usa: `window.SecurityXxx = { show, close };`.
- `show()` cria o painel uma única vez (se já existir, não faz nada): `<div id="xxx-overlay" class="ccs-modulo">` contendo `<div class="ccs-modulo-painel">`.
- Dentro do painel, nesta ordem:
  - `<header class="ccs-module-topbar">` com `.ccs-module-brand` (SECURITY CCS + nome do módulo) e `.ccs-module-actions`, incluindo o botão de fechar com `id="xxx-close"`. No uso normal, a barra global do painel fica por cima dela; ela existe para manter o padrão dos demais módulos.
  - `.ccs-modulo-intro`: título `h2` e explicação curta.
  - Linha de mensagem com `role="status"` (`.ccs-modulo-msg`, com `.is-erro` ou `.is-ok`).
  - Conteúdo em cartões `.ccs-modulo-card`: formulários em `.ccs-modulo-grid` (cada campo dentro de um `label`), botões em `.ccs-modulo-botoes` (`.is-primario` na ação principal) e tabelas dentro de `.ccs-modulo-scroll`.
- Supabase: crie o cliente com a URL e a chave **anon** de `window.PAINEL_CONFIG`, como em `js/postos.js`. Sem configuração, mostre a mensagem e não quebre a tela.
- Acesso: confira a sessão e o perfil (`perfis`) **antes** de mostrar o conteúdo. Sem permissão, mantenha o conteúdo com `hidden` e mostre só a mensagem. Isso vale só para a interface: quem protege os dados é a RLS ou a função do banco.
- Texto vindo do banco entra com `textContent` ou passando por `esc()`, nunca como HTML direto.

### 2. Estilos
- Use as classes `.ccs-modulo-*` de `css/navigation.css`. Elas já posicionam o painel ao lado da sidebar, ocupam a tela toda no celular (< 1024 px) e trazem cartões, formulários, tabelas e foco visível.
- Crie CSS próprio só para o que for específico do módulo, sempre com o prefixo `#xxx-overlay`, para não afetar outras telas.

### 3. Registro no menu: `js/navigation.js`
- `overlays`: `'id-do-menu': 'xxx-overlay'`.
- `closeIds`: `'xxx-overlay': 'xxx-close'` (o menu clica nesse botão para fechar um módulo ao abrir outro).
- `openers`: `'id-do-menu': ['SecurityXxx', 'show']`.
- `items()`: inclua `{ id: 'id-do-menu', name: 'Nome no menu' }` no grupo certo (Operações, Gestão ou Cadastros). Para restringir por perfil, siga `podeGerirPostos()`, que lê o perfil confirmado pelo servidor em `localStorage['painel-perfil-confirmado']`.

### 4. Carregamento e funcionamento offline
- `index.html`: adicione `<script src="js/<modulo>.js"></script>` antes de `js/navigation.js`.
- `sw.js`: inclua `'js/<modulo>.js'` em `ARQUIVOS` e **suba `VERSAO`** (ex.: `v7` → `v8`). Sem isso, os aparelhos continuam com a versão antiga em cache.

### 5. Página antiga (se o módulo substituir uma)
- Não apague o HTML antigo: troque o conteúdo por um redirecionamento para `index.html`, como foi feito com `gestao-postos.html`, para não quebrar links e favoritos.

### 6. Testes antes de publicar
- Abrir pelo menu, trocar para outro módulo e voltar: só um painel aberto e o item certo marcado no menu.
- Perfil sem permissão: item escondido no menu e, se o módulo for aberto, só a mensagem aparece.
- Celular (375 px): sem rolagem horizontal da página e menu em gaveta.
- Modo demonstração (sem Supabase): a tela mostra a mensagem de configuração, sem erro no console.
- Com login real: carregar, salvar e editar, e conferir que a RLS recusa um perfil sem permissão.
- Depois do deploy: abrir o painel já instalado e confirmar que o módulo novo aparece (cache atualizado).
