# Design

## Context

Ver `proposal.md` — Why. Estado atual:

- `TableNode` renderiza `header + ul de colunas + rodapé de chaves` dentro de um
  card `w-full overflow-hidden`, sem altura explícita.
- O nó recebe `width: 260` e `height: estimatedTableHeight(table)` (só
  cabeçalho + colunas) — o rodapé fica fora da conta e é cortado.
- `node.handles` é pré-calculado por coluna (fallback sem DOM); as arestas usam
  esse bound até a medição.
- O documento de layout (`positions` por zona) aceita só `x`/`y` (`strict`).

## Goals / Non-Goals

**Goals:**

- Nada de conteúdo cortado; card com tamanho padrão correto e rolagem quando
  menor.
- Redimensionar por alças, com mínimo, persistido por zona.
- Accordion das seções de chaves, acessível.

**Non-Goals:**

- Undo/redo de resize (a fila da Fase 8 cobre mutações de modelo, não layout).
- Persistir estado do accordion entre sessões.
- Ajuste fino de colunas individuais.

## Decisions

**D1 — Altura estimada passa a incluir o rodapé.** `estimatedTableHeight` soma
`FOOTER_HEADER + linhas * FOOTER_ROW` (pais + filhos), garantindo que o card
padrão comporte tudo. Os algoritmos de organização usam a mesma altura, então o
espaçamento cresce de forma consistente.

**D2 — Card em coluna flex com corpo rolável.**
`TableNode` vira `flex h-full flex-col`; `header` e `footer` são `shrink-0`; a
`ul` de colunas é `min-h-0 flex-1 overflow-y-auto`. O nó recebe
`style={{ width, height }}` para o React Flow reservar a caixa.

**D3 — Tamanho opcional em `DiagramPosition`.** `width?`/`height?` no zod
(`min/max`), nos tipos do web e no adapter (JSON passthrough). Default: 260 ×
`estimatedTableHeight`. Sem migração. Alternativa: mapa `sizes` separado —
descartada porque quebraria a atomicidade e a leitura por tabela do documento.

**D4 — `NodeResizer` do React Flow para as alças.** Renderizado só com
`active && canEdit`; `minWidth=180`, `minHeight=100`. `onResizeEnd` informa
`width/height` ao canvas, que grava em `positions` e usa o mesmo debounce de
save do arrasto. Alternativa: alças custom — descartada por reimplementar
pointer events e teclado.

**D5 — Mudanças de dimensão no `onNodesChange`.** O canvas passa a tratar
`change.type === 'dimensions'` (arredondando), mantendo `positions` como fonte
da verdade; sem isso o nó "voltaria" ao tamanho antigo no próximo render.

**D6 — Handles continuam pré-calculados, com re-medição no scroll/resize.**
Manter `handles` garante arestas no primeiro render (e nos testes em happy-dom,
que não medem DOM). Ao rolar o corpo ou terminar um resize, o `TableNode` chama
`useUpdateNodeInternals` para o React Flow reler a posição real dos handles e
reancorar as arestas. Alternativa: remover `handles` — testado e descartado:
sem medição no ambiente de teste as arestas somem.

**D7 — Accordion por card em estado local.** `useState` no `TableNode` para cada
seção (`aria-expanded`, `aria-controls`), sem persistência. O rodapé só ocupa
altura quando expandido; o corpo ganha o espaço.

## Risks / Trade-offs

- [Re-medição a cada scroll pode custar caro com 100+ cards] → só o card rolado
  chama `updateNodeInternals`, com throttle por `requestAnimationFrame`.
- [Resize reduzido esconde handles de colunas fora da rolagem, e arestas para
  elas apontam para um ponto fora do card] → comportamento esperado ao esconder
  conteúdo; ao rolar até a coluna a aresta volta a ancorar.
- [Altura estimada maior encolhe a área útil do grid/estrela] → aceitável;
  organização continua sem sobreposição (testes cobrem).
- [Alças do `NodeResizer` em happy-dom] → teste de componente verifica presença
  via classe/handle do React Flow e o callback de persistência é coberto por
  chamada direta.

## Migration Plan

- **Backend**: nenhuma migração de banco; só validação zod (campo opcional).
  Rollback = reverter a validação (layouts com tamanho passam a ser rejeitados).
- **Frontend**: sem dependência nova; layouts antigos seguem válidos.
- **Gate**: `bun run check` + `bun run test:e2e` verdes; `openspec validate
  v2-diagram-card-resize --strict` = 0.
