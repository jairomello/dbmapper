# Design

## Context

Ver `proposal.md` — Why. Premissas verificadas no código atual:

- O canvas da Fase 7 já usa React Flow com `Controls`, `MiniMap`, `Background`,
  busca e save com debounce (`DiagramCanvas.tsx`), arestas `crowsfoot`
  (`CrowFootEdge.tsx`, geometria em `diagram/crowfoot.ts`) e seleção única em
  `lib/selection.ts`.
- `nodesConnectable={false}` e `elementsSelectable={false}` hoje: criar
  relacionamento e selecionar já dependem da Fase 8, que também define a fila de
  comandos e o undo/redo.
- O layout é gravado por `PUT /api/projects/:id/diagram` (Fase 7) e, na Fase 9,
  passa a carregar zonas por `zone_name`; qualquer organização automática deve
  usar esse mesmo caminho.
- A11y: `prefers-reduced-motion` não é tratado em nenhum lugar do app ainda.

## Goals / Non-Goals

**Goals:**

- Tornar o diagrama legível por relacionamento: destaque, direção e peso das
  arestas.
- Dar ferramentas explícitas de navegação e organização sem aumentar a
  dependência de bibliotecas externas.
- Manter o autosave, a auditoria e o contrato v1 como estão.

**Non-Goals:**

- `d3-force`/simulação física, roteamento ortogonal manual, redimensionamento de
  card, fullscreen, atalhos de teclado.
- Alterar a geometria do pé de galinha ou a notação de cardinalidade.
- Persistir o modo de ferramenta (`Selecionar`/`Mover`) entre sessões.

## Decisions

**D1 — Toolbar no próprio canvas, com estado local de ferramenta.**
`Selecionar` (default) habilita `nodesDraggable` e clique; `Mover` seta
`panOnDrag` sem seleção e desabilita `nodesDraggable` para não arrastar card por
engano. Zoom e fit reaproveitam `useReactFlow` (`zoomIn`, `zoomOut`,
`fitView`); criar tabela/relacionamento e exportar delegam aos componentes das
Fases 8 e 9. Alternativa: nova barra no header do workspace — descartada: a
ferramenta é do canvas e precisa ficar perto dos controles de zoom.

**D2 — Ênfase calculada uma vez por seleção.**
`createDiagramEdges(database, { selectedTable })` marca cada aresta com
`emphasis: 'outgoing' | 'incoming' | 'none'`; a comparação é por nome de tabela
(ids regeneram). `CrowFootEdge` só consome o `data.emphasis`: cor, dash e
espessura vêm de tokens CSS. Alternativa: prop-drilling por nó — descartada por
re-renderizar todos os cards a cada seleção; o `useMemo` por seleção resolve.

**D3 — Direção por cor + padrão + animação, sempre redundante.**
`outgoing` (esta tabela tem a FK) = `--diagram-edge-out` (ex.: âmbar) com
tracejado curto; `incoming` (outras apontam para esta) = `--diagram-edge-in`
(ex.: azul) com tracejado longo. A animação usa `stroke-dashoffset` com
`animation-direction` derivada de `source → target` (FK → PK); com
`prefers-reduced-motion: reduce` a classe de animação não é aplicada. A cor
sozinha nunca carrega o significado.

**D4 — Espessura por token.**
`--diagram-edge-width: 2px` e `--diagramedge-strong-width: 3px` (nomes finais no
CSS), aplicados via `style` da aresta; as marcas de cardinalidade usam escala
1,4× e o traço do pé de galinha acompanha a espessura. Alternativa: SVG
`stroke-width` fixo — descartada por impedir ajuste fino por tema/zoom.

**D5 — Algoritmos puros em `apps/web/src/diagram/auto-layout.ts`.**
`layoutGrid(tables, { originX, originY, columns })` reaproveita a grade atual, e
`layoutStar(tables, relationships)` monta: hub = maior grau (desempate
alfabético), BFS por anéis com raio calculado pela altura máxima do card no
anel, isoladas em faixa lateral depois do último anel. Não sobreposição é
garantida por um "empurrão" determinístico (posições ordenadas + gap mínimo).
Sem dependência nova; alternativa `d3-force` descartada por resultado
não-determinístico e peso de bundle.

**D6 — Aplicação da organização usa o save existente.**
Ao escolher um algoritmo, o canvas calcula as posições, chama o mesmo
`saveMutation` da Fase 7 com `{ positions, viewport, zoom }` e em seguida
`fitView`. Um único PUT → um `diagram.layout_saved`. O algoritmo atua apenas
sobre as tabelas da zona ativa (Fase 9). Alternativa: aplicar localmente e
deixar o debounce salvar — descartado: duas aplicações seguidas perderiam a
primeira posição.

**D7 — Performance com 100+ tabelas.**
A ênfase é aplicada por classe CSS e não por re-render de card; `useMemo` por
`selectedTable`; a animação usa apenas `stroke-dashoffset` (propriedade
composta na GPU). Teste de fumaça com o modelo real de 108 tabelas no e2e.

## Risks / Trade-offs

- [Animação em 203 arestas ao mesmo tempo] → só arestas incidentes à seleção
  animam (dezenas no pior caso) e o modo reduzido desliga a animação.
- [Auto-layout "estrela" com hubs múltiplos fica confuso] → desempate
  determinístico e faixa lateral para isoladas; o usuário pode aplicar `Em
  grade` de volta (uma escrita cada).
- [Cores sem contraste no tema claro] → tokens definidos no `:root` e padrões de
  traço distintos; teste visual manual no e2e.
- [Conflito com a Fase 8 no `useReactFlow`/fila de comandos] → a Fase 11 só mexe
  em layout, nunca no modelo; a fila da Fase 8 continua dona das mutações de
  modelo.

## Migration Plan

- Mudança **só de frontend**: sem tabela, rota, migração ou dependência nova.
  Deploy = build normal; rollback = reverter UI (o documento de layout continua
  válido, pois só muda o conjunto de posições).
- Depende dos archives das Fases 7 (canvas), 8 (toolbar/edição) e 9 (zonas e
  export) — a ordem 7→8→9→10→11 do roadmap garante isso.
- Gate: `bun run check` + `bun run test:e2e` verdes; `openspec validate
  v2-phase11-canvas-ux --strict` = 0.
