# Tasks

## 1. Canvas

- [x] 1.1 `onPaneClick` no `DiagramCanvas` devolve a seleção para `{ type: 'database' }` — verificação: teste de componente clica no pane e o card perde `data-active`.
- [x] 1.2 `WorkspacePage` fecha a ficha ao selecionar a raiz (`selectItem`) — verificação: seleção de tabela abre, clique no vazio fecha.
- [x] 1.3 Cabeçalho do `TableNode` vira a área de arraste (`diagram-drag-handle`, cursor grab/grabbing), botões seguem `nodrag` — verificação: teste/Playwright move o card pelo cabeçalho e clicar no nome continua selecionando.

## 2. Validate

- [x] 2.1 `bun run check` e `bun run test:e2e` — verificação: exit 0.
- [x] 2.2 `openspec validate v2-canvas-deselect --strict` — verificação: exit 0.

## 3. Archive

- [x] 3.1 Arquivar o change — verificação: specs promovidas e change fora da lista ativa.
