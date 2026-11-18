# Proposal

## Why

O DBMapper não tem nenhuma representação visual do modelo — tabelas e
relacionamentos só existem como árvore e texto. O backlog §10.1 da proposta v2
pedia pesquisa de biblioteca; os docs `04`/`05`/`06` de `docs/analysis/`
concluíram a análise (React Flow) e a Fase 7 entrega o canvas ER **somente de
visualização** com layout persistido — base para edição (Fase 8) e zonas (Fase 9).

## What Changes

- View **Diagrama** no workspace: toggle no `<main>` (Editor ↔ Diagrama) com
  canvas React Flow renderizando cards de tabela (colunas, PK/FK) e arestas
  crow's-foot das relationships existentes; árvore, StatusBar e header intactos.
- **Seleção sincronizada** árvore↔canvas usando o `Selection` atual; o editor
  permanece acessível como painel inferior no modo diagrama.
- **Busca no canvas** destacando correspondências (sem remover nós).
- **Layout persistido**: tabela nova `diagram_layouts` (posições indexadas por
  **nome** de tabela — ids regeneram a cada PUT —, viewport e zoom, zona
  `Principal`), endpoints `GET/PUT /api/projects/:id/diagram` e evento de
  auditoria `diagram.layout_saved`.
- Dependência nova `@xyflow/react` em `apps/web` (+ `bun.lock` commitado).
- Delta na spec `audit-log` (cobertura do evento) e entrada da família `diagram.`
  no filtro da tela de auditoria.

## Capabilities

### New Capabilities

- `diagram-canvas`: visualização do modelo como canvas ER no workspace —
  renderização, sincronização de seleção, destaque de busca, comportamento
  somente-leitura e aplicação do layout salvo.
- `diagram-layout`: persistência do layout do diagrama — endpoints dedicados,
  indexação por nome de tabela, papéis, evento de auditoria e garantia de que o
  layout fica fora do export v1.

### Modified Capabilities

- `audit-log`: a enumeração de cobertura da requirement "Mutations emit events"
  passa a incluir o save do layout do diagrama (`diagram.layout_saved`).

## Impact

- **Backend**: `apps/api/src/db/schema.ts` + migração; `persistence/ports.ts` +
  `persistence/sqlite/adapter.ts` (método novo — fronteira de persistência);
  `routes/projects.ts` (rota nova); `validation.ts` (zod do layout);
  `tests/audit-coverage.test.ts` (caso novo) e testes de rota.
- **Frontend**: `apps/web` — `WorkspacePage.tsx` (toggle + painel do editor),
  componentes novos `DiagramCanvas`/painel de busca, cliente `api/`,
  `AuditPage.tsx` (família `diagram.`); dep nova + lock.
- **Contrato**: export v1 (`packages/domain`) **inalterado** — guarda de
  `export.test.ts` preservada; API key/MCP **não** passam a enxergar o layout.
- **Fora do escopo**: edição estrutural (Fase 8), zonas/abas (Fase 9), export
  PNG/SVG, diagrama no viewer, layout via MCP/API key.
