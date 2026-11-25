# Tasks

## 1. Feedback do pan

- [x] 1.1 Toolbar usa `panMode` em `aria-pressed` e no destaque visual de **Selecionar**/**Mover** — verificação: teste confirma troca com Ctrl e retorno ao soltar.
- [x] 1.2 Cursores `grab`/`grabbing` via `data-pan-mode`/`data-panning` no pane e nos cards — verificação: inspeção no navegador e CSS.
- [x] 1.3 Detecção das duas teclas Ctrl em captura + fallback por `event.ctrlKey` no ponteiro — verificação: teste com `ControlLeft`/`ControlRight` e Playwright.

## 2. Validate

- [x] 2.1 `bun run check` e `bun run test:e2e` — verificação: exit 0.
- [x] 2.2 `openspec validate v2-canvas-pan-feedback --strict` — verificação: exit 0.

## 3. Archive

- [x] 3.1 Arquivar o change — verificação: spec `diagram-canvas` promovida.
