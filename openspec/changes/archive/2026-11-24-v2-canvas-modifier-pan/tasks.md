# Tasks

## 1. Canvas

- [x] 1.1 Rastrear Ctrl no `DiagramCanvas` (keydown/keyup/blur/visibilitychange) e derivar `panMode` — verificação: teste de componente confirma que segurar Ctrl remove `draggable` dos cards e soltar devolve.
- [x] 1.2 Aplicar `panMode` em `panOnDrag`, `nodesDraggable`, `nodesConnectable` e no cursor do canvas — verificação: teste/Playwright arrasta sobre card com Ctrl e o canvas move sem gravar posição.
- [x] 1.3 Mapear a roda com modificadores em `diagram/wheelPan.ts` e interceptar no wrapper com `passive: false` — verificação: testes unitários do mapeamento e teste de componente confirma viewport deslocado com zoom intacto.

## 2. Docs

- [x] 2.1 Documentar os atalhos no `README.md` — verificação: seção do canvas lista Ctrl/Shift.

## 3. Validate

- [x] 3.1 `bun run check` e `bun run test:e2e` — verificação: exit 0.
- [x] 3.2 `openspec validate v2-canvas-modifier-pan --strict` — verificação: exit 0.

## 4. Archive

- [x] 4.1 Arquivar o change — verificação: spec `diagram-canvas` promovida e change fora da lista ativa.
