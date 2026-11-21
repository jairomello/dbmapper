# Design

## Context

Ver `proposal.md` — Why. Medições no modelo real (Axiis, projeto
`269faa34-…`):

- 108 tabelas, 203 FKs; alturas de card entre 95 e 2 671 px (média 342).
- Níveis BFS a partir do hub `contrato_profissional` (grau 27): `1, 27, 45, 24,
  5, 1`.
- `layoutStar` atual usa `levelBoundingRadius` (meia-diagonal do **maior** card)
  e `radiusByCircumference = (2*extent + gap) / (2*sin(π/count))`; com
  `extent ≈ 1341` e 45 cards, o primeiro anel já fica em ~19 500 px —
  resultado salvo: 43 610 × 44 444 px.
- `DiagramCanvas` fixa `minZoom={0.2}` e `MiniMap` padrão (200×150).

## Goals / Non-Goals

**Goals:**

- Layout estrela compacto (mesma ordem de grandeza de um grid empacotado), sem
  sobreposição e determinístico.
- Grade adaptativa por quantidade de tabelas.
- Enquadrar modelos de ~6 000 px e manter o minimapa útil.

**Non-Goals:**

- Simulação de forças, roteamento de arestas, agrupamento por clusters.
- Migrar automaticamente layouts já salvos (o usuário reaplica a organização).
- Alterar o formato do documento de layout.

## Decisions

**D1 — Anéis discretos (células) em vez de raio contínuo.** `layoutStar` passa a
montar uma grade de células (largura `260 + gapX`, altura da linha = maior card
da linha) e ordenar as células pela distância de Chebyshev até a célula central;
o hub ocupa o centro e as demais tabelas são atribuídas em ordem de BFS (nível 1,
2, …) às células mais próximas livres. Alternativa: corrigir o raio do anel
circular — descartada porque com card de 2 671 px qualquer anel exige raio
gigante para não sobrepor vizinhos; a célula elimina o problema por construção.

**D2 — Determinismo preservado.** A ordem de atribuição é
`níveis BFS (nome como desempate) → células ordenadas por (anel, linha, coluna)`.
Entrada embaralhada produz o mesmo resultado, mantendo o teste atual de
determinismo.

**D3 — Isoladas em faixa lateral.** Tabelas fora do componente do hub seguem em
uma coluna à direita do grid, empilhadas com o gap vertical (comportamento já
especificado na Fase 11).

**D4 — Grade adaptativa.** `layoutGrid` ganha `adaptiveColumns(count)` =
`ceil(sqrt(count))`; o botão `Em grade` passa a usá-la. O default de
`layoutGrid` continua 3 colunas para não mudar chamadas existentes/testes de
posicionamento inicial.

**D5 — Zoom e minimapa.** `minZoom` de `0.2` → `0.05` (4×) e `maxZoom` mantido em
2; `fitView` já respeita o `minZoom` do fluxo. `MiniMap` cresce para 240×180,
com `nodeStrokeWidth` e `nodeColor` que destacam seleção/busca (mutação
mínima no tema). Alternativa: trocar o minimapa por overview próprio —
descartada pelo custo e por não ser necessária para o problema atual.

**D6 — Dados existentes intactos.** Nenhuma migração: o layout salvo continua
válido; quem quiser o novo arranjo aplica `Organizar → Em estrela`.

## Risks / Trade-offs

- [Linhas com um card muito alto desperdiçam espaço vertical] → aceitável: o
  grid já reserva a altura da linha; o resultado continua ~10× menor que hoje.
- [Distância de Chebyshev gera "anéis" quadrados, não círculos] → é o efeito
  desejado para leitura em grade; o hub permanece no centro geométrico
  aproximado.
- [`minZoom` muito baixo deixa o texto ilegível] → o minimapa e o "Ajustar à
  tela" cobrem a navegação; zoom manual continua disponível.
- [Layouts antigos continuam enormes] → o usuário reaplica a organização; não
  reescrevemos posições salvas sem ação explícita.

## Migration Plan

- Mudança **só de frontend**: sem tabela, migração, rota ou dependência nova.
  Deploy = build normal; rollback = reverter UI (documento de layout segue
  compatível).
- Gate: `bun run check` + `bun run test:e2e` verdes; `openspec validate
  v2-diagram-compact-layout --strict` = 0.
