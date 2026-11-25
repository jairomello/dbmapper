# Tasks

## 1. Roda e zoom

- [x] 1.1 `wheelActionFor` mapeia roda → pan vertical, Shift → pan horizontal, Ctrl → zoom (Ctrl vence Shift) — verificação: testes unitários.
- [x] 1.2 `DiagramCanvas` aplica pan/zoom no viewport, zoom em torno do cursor com clamp `0.05`–`2`, e desliga o zoom por roda do React Flow — verificação: testes de componente para pan e zoom.
- [x] 1.3 Roda sobre conteúdo rolável do card não move o canvas — verificação: teste manual com lista de colunas longa.

## 2. Docs

- [x] 2.1 Atualizar `README.md` com a nova semântica da roda — verificação: seção de atalhos do canvas.

## 3. Validate

- [x] 3.1 `bun run check` e `bun run test:e2e` — verificação: exit 0.
- [x] 3.2 `openspec validate v2-canvas-wheel-invert --strict` — verificação: exit 0.

## 4. Archive

- [x] 4.1 Arquivar o change — verificação: spec `diagram-canvas` atualizada.
