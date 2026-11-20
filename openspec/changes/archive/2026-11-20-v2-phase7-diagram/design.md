# Design

## Context

Fase 7 do modelador visual (ver `docs/analysis/04`–`09`; revisão vs. código em
`07-modelador-backend-contratos.md` e `08-modelador-frontend-ui.md`). Restrições
do código real que moldam a abordagem:

- Ids de tabela/coluna/relationship **regeneram a cada PUT** do modelo
  (`apps/api/src/persistence/sqlite/adapter.ts:370,402,428,460` — provado por
  probe) → layout só pode ser indexado por **nome**.
- `projectDocumentSchema` não é `.strict()` (`apps/api/src/validation.ts:64-66`):
  chave extra é descartada em silêncio → layout **não** vive no PUT do modelo.
- Fronteira de persistência (`scripts/check-persistence-boundaries.ts:6-12`)
  proíbe `drizzle-orm` em `routes/` e `services/` → tabela nova exige
  `db/schema.ts` + migração + `ports.ts` + `adapter.ts`.
- `audit-log/spec.md:10` enumera as mutações cobertas; cobertura de teste é um
  array declarativo (`apps/api/src/tests/audit-coverage.test.ts:133-297`).
- `semantic-editor` exige que o editor abra na seleção da árvore;
  `WorkspacePage.tsx:27` guarda o `Selection` em `useState` (sem contexto/store).
- `e2e/smoke.ts:114-152` depende de testids do header/StatusBar; `Dockerfile.web:23`
  usa `--frozen-lockfile`.

## Goals / Non-Goals

**Goals:**

- Canvas ER somente de visualização dentro do workspace, com seleção
  sincronizada e busca com destaque.
- Layout persistido (posições por nome, viewport, zoom) com endpoint próprio,
  papéis e auditoria.
- Zero mudança no contrato export v1 e na superfície de API key.

**Non-Goals:**

- Edição estrutural (Fase 8), zonas/abas e export de imagem (Fase 9).
- Diagrama no viewer (`project-viewer` proíbe não-GET) e via MCP/API key.
- Estabilizar ids internos do modelo.

## Decisions

**D1 — React Flow (`@xyflow/react`) como renderer.** Nodes DOM/SVG
customizáveis, handles, minimapa, zoom/pan e edge routing nativos. Alternativas:
jsPlumb+panzoom (stack do referência — dívida técnica, ver doc 05 §1), SVG
próprio (muito trabalho). Entra como dependência normal do `apps/web`
(`vite.config.ts` não exige mudança de build); `bun.lock` é commitado por causa
do `--frozen-lockfile` do Docker.

**D2 — Tabela `diagram_layouts` + endpoints dedicados.**
`diagram_layouts(project_id, zone_name, positions_json, viewport_x, viewport_y,
zoom, updated_at, updated_by)` com `UNIQUE(project_id, zone_name)` e
`zone_name='Principal'` desde já (Fase 9 reusa). `positions_json` =
`{ "<nome da tabela>": {x, y} }`. Camadas: schema → migração →
`ports.ts` (método `getDiagramLayout`/`putDiagramLayout`) → `adapter.ts` → rota.
Alternativa descartada: enfiar no PUT do modelo (zod descarta a chave, poluiria
`project.saved` na auditoria).

**D3 — Papéis e superfície.** `GET /diagram` sem `requireRole` (padrão dos GETs
atuais, `projects.ts:49,76`); `PUT /diagram` com `requireRole('MEMBER')`.
Superfície de API key permanece nas 4 rotas atuais (`credential.ts:26-33`) — o
teste `toHaveLength(4)` não muda.

**D4 — Auditoria.** `PUT /diagram` grava `diagram.layout_saved` na mesma
transação do upsert (padrão `insertEventRow`, `adapter.ts:184-196`); delta
`MODIFIED` em `audit-log`; caso novo no array de `audit-coverage.test.ts`;
família `diagram.` em `AuditPage.tsx:8-16`.

**D5 — Toggle no `WorkspacePage` (Opção A do doc 08 §1.4).** Novo estado
`view: 'editor' | 'diagrama'` ao lado de `selection` (linha 27); condiciona o
bloco do `<main>` (157-175); `aside`, header e `StatusBar` (168) intactos.
No modo diagrama o `MetadataEditor` vira **painel inferior recolhível** que abre
na seleção — é o que mantém `semantic-editor` satisfeita sem mexer na spec.
Rota própria descartada: perderia o `selection` (é `useState` da página).

**D6 — Seleção e busca.** `Selection` continua unitário (`lib/selection.ts:3-6`);
destaque de busca é estado paralelo `Set<string>` dentro do componente do
canvas. Canvas → árvore emite `onSelect` (mesmo `setSelection`); árvore →
canvas usa `fitView`/center no node ativo.

**D7 — Posição inicial determinística.** Tabelas sem entrada no layout recebem
posição em grade (ordem do modelo) calculada no cliente; ao arrastar, PUT
debounced com indicador `Salvando...`/`Salvo às: HH:MM` (padrão do doc 05 §2).

**D8 — Ordem de exibição = `position` do modelo** (decisão 3 do doc 09 §3) — o
canvas não replica a ordenação PK+alfabética do viewer legado.

**D9 — VIEWER.** Drag desabilitado no cliente (nó não arrastável); PUT já
retorna 403 pela `requireRole`. Teste de rota cobre o 403.

## Risks / Trade-offs

- [Arrasto real não testável em happy-dom (`08:§8 k`)] → testes de componente
  cobrem handlers e persistência; o gesto é coberto pelo e2e Playwright.
- [Esquecer o caso no array declarativo de `audit-coverage`] → task explícita
  com verificação (`bun test apps/api/src/tests/audit-coverage.test.ts`).
- [`bun.lock` divergente quebra o build Docker] → task de setup commita lock e
  roda `bun run check` antes de seguir.
- [Painel do editor disputa altura com o canvas] → recolhível, aberto por
  padrão na primeira seleção; StatusBar permanece visível (e2e).
- [Layout acumula entradas órfãs (rename/remove)] → GET filtra por nomes
  existentes; poda opcional pode vir depois (não é requisito).

## Open Questions

_Nenhum — todas as decisões que afetariam specs, abordagem ou tasks estão
fechadas em D1–D9 (revisáveis por Jairo antes da implementação)._

## Migration Plan

1. **Dependência**: `bun add @xyflow/react` em `apps/web` + commit do `bun.lock`
   (o `Dockerfile.web` usa `--frozen-lockfile`); rollback = remover a dep e
   reverter o lock.
2. **Banco**: `bun run db:generate` cria a migração `000N_*` aditiva (tabela
   nova `diagram_layouts` — o teste `migration.test.ts:34-41` usa `toContain`,
   então tabela nova não quebra; nenhuma coluna existente é alterada).
   Deploy normal (`db:migrate` no boot); rollback = drop da tabela (perde só
   posições, não há dado de modelo).
3. **Código**: entra inteiro via change (rota + port + adapter + componentes);
   nenhum comportamento existente muda — o toggle é opt-in do usuário.
4. **Gate**: `bun run check` + `bun run test:e2e` verdes antes do commit de
   encerramento; sem mudança de contrato para consumidores externos.
