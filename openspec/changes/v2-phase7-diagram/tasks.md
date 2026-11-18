# Tasks

## 1. Setup: dependência e migração

- [ ] 1.1 Adicionar `@xyflow/react` em `apps/web/package.json` e rodar `bun install` commitando o `bun.lock` — verificação: `bun run typecheck` passa com um import de teste do pacote e `git diff --stat` mostra só `package.json` + `bun.lock`.
- [ ] 1.2 Criar a tabela `diagram_layouts` em `apps/api/src/db/schema.ts`, gerar a migração com `bun run db:generate` e aplicar em DB temporário — verificação: `bun test apps/api/src/tests/migration.test.ts` verde e `PRAGMA table_info('diagram_layouts')` lista as colunas (positions_json, viewport_x, viewport_y, zoom, zone_name).

## 2. Backend: port, adapter e rota do layout

- [ ] 2.1 Métodos `getDiagramLayout`/`putDiagramLayout` em `apps/api/src/persistence/ports.ts` com implementação em `persistence/sqlite/adapter.ts` (upsert por `project_id + zone_name`; no GET, descartar nomes de tabela ausentes do modelo) — verificação: teste novo do adapter cobre roundtrip, upsert idempotente e filtro de nomes órfãos (`bun test apps/api/src`).
- [ ] 2.2 Rota `GET/PUT /api/projects/:id/diagram` em `routes/projects.ts` com zod próprio em `validation.ts` e `requireRole('MEMBER')` apenas no PUT — verificação: teste novo de rota cobre 200 no roundtrip, 404 com envelope para projeto inexistente e 403 para VIEWER no PUT.
- [ ] 2.3 Gravar `diagram.layout_saved` na mesma transação do upsert (padrão `insertEventRow`) — verificação: teste novo afirma a linha em `events` com actor e project na escrita com sucesso e nenhuma linha quando a escrita falha.

## 3. Auditoria: spec, teste e UI

- [ ] 3.1 Adicionar o caso `diagram.layout_saved` ao array de `apps/api/src/tests/audit-coverage.test.ts` — verificação: `bun test apps/api/src/tests/audit-coverage.test.ts` verde com o caso novo contabilizado.
- [ ] 3.2 Estender `ACTION_FAMILIES` em `apps/web/src/pages/AuditPage.tsx` com `diagram.` — verificação: teste de componente do AuditPage afirma que a família `diagram.` aparece no filtro e filtra o evento (bun test em apps/web).

## 4. Frontend: canvas e toggle

- [ ] 4.1 Componente `DiagramCanvas` com React Flow: cards por tabela não-`REMOVED` (nome, colunas em ordem do modelo, marcas PK/FK), arestas crow's-foot por relationship, minimapa/zoom/grid e placement automático em grade para tabelas sem layout — verificação: teste de componente (fixture) afirma 2 cards, 1 aresta e posições atribuídas.
- [ ] 4.2 Toggle `Editor`/`Diagrama` no `WorkspacePage` (estado ao lado de `selection`) com `MetadataEditor` como painel inferior recolhível no modo diagrama; árvore, header e `StatusBar` permanecem — verificação: teste da página cobre a troca de view, a permanência do StatusBar e o editor abrindo na seleção; `bun run test:e2e` (smoke) continua verde.
- [ ] 4.3 Sincronização de seleção nos dois sentidos (clique no card → `onSelect` → árvore/editor; seleção na árvore → destaque e scroll do card) — verificação: teste de componente cobre os dois sentidos.
- [ ] 4.4 Documentar a view Diagrama no `README.md` (seção nova, seguindo o padrão das existentes) — verificação: o comando/fluxo descrito no README bate com o implementado.

## 5. Busca e persistência de layout no cliente

- [ ] 5.1 Campo de busca no modo diagrama com destaque via estado `Set<string>` (nó algum é removido ou escondido) — verificação: teste cobre correspondência destacada e não-correspondência visível.
- [ ] 5.2 Cliente do layout em `apps/web` (GET ao abrir, PUT com debounce e indicador `Salvando...`/`Salvo às: HH:MM`, restauração de posições/viewport/zoom, ignorar entradas órfãs) — verificação: teste cobre restauração após reabrir, PUT disparado após drag e entrada órfã ignorada sem erro.
- [ ] 5.3 VIEWER com drag desabilitado e zero requisições de layout — verificação: teste afirma nenhuma chamada de PUT em interação de VIEWER.

## 6. E2e do diagrama

- [ ] 6.1 E2e Playwright do fluxo completo: login → abrir projeto → alternar para Diagrama → arrastar card → recarregar → posição e zoom preservados — verificação: `bun run test:e2e` verde com o novo cenário (script estendido ou `e2e/diagram.ts` + entrada no `package.json`).

## 7. Validate

- [ ] 7.1 `bun run check` (typecheck, lint, persistence boundaries, mcp catalog, testes) e `bun run test:e2e` — verificação: exit 0 nos dois.
- [ ] 7.2 `openspec validate v2-phase7-diagram --strict` — verificação: exit 0.

## 8. Archive

- [ ] 8.1 `openspec archive v2-phase7-diagram --yes` após o ok do Jairo, marcar o checkbox no tasks arquivado e commitar `openspec/changes` + `openspec/specs` promovidos — verificação: `openspec list` não mostra mais o change e `openspec/specs/diagram-*` existem.
