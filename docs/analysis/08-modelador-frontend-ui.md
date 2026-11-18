# 08 — Modelador ER: camada frontend (`apps/web`) — análise somente-leitura

> Escopo: responder às 8 perguntas de planejamento da view **Diagrama** (canvas ER com React Flow)
> a partir do código real do repositório. **Nenhum arquivo além deste relatório foi modificado**;
> não foi executado `install`, `build`, `git` de escrita ou qualquer teste.
> Referência do plano: `docs/analysis/04-proposta-modelo-er.md` (Fases 7/8/9) e
> `docs/analysis/05-avaliacao-madbuilder-html.md`.
> Suposições estão marcadas como **SUPOSIÇÃO**.

---

## 1. Estrutura de `apps/web/src`: rotas, views, componentes e encaixe do "Diagrama"

### 1.1 Inventário (arquivo → linhas)

| Área | Caminho | Linhas |
|---|---|---|
| Rotas/raiz | `apps/web/src/App.tsx` | 43 |
| Bootstrap | `apps/web/src/main.tsx` (16) · `apps/web/src/app/queryClient.ts` (16) | — |
| Páginas | `apps/web/src/pages/WorkspacePage.tsx` (212) · `ViewerPage.tsx` (137) · `GalleryPage.tsx` (147) · `LoginPage.tsx` (92) · `AuditPage.tsx` (126) | — |
| Componentes | `apps/web/src/components/` → `SemanticTree.tsx` (141) · `MetadataEditor.tsx` (252) · `StatusBar.tsx` (60) · `SuggestionPanel.tsx` (632) · `UpdateWizard.tsx` (467) · `NewProjectDialog.tsx` (167) · `JsonTransfer.tsx` (90) · `ViewerDetail.tsx` (110) · `SemanticBadge.tsx` (21) · `FileImportButton.tsx` (84) | — |
| Guards/auth | `apps/web/src/auth/RequireSession.tsx` (20) · `RequireProject.tsx` (37) · `RequireAdmin.tsx` (24) · `session.ts` (12) | — |
| Estado/dados | `apps/web/src/lib/selection.ts` (108) · `lib/coverage.ts` (66) · `lib/semantic-status.ts` (28) · `projects/queries.ts` (21) · `agent/queries.ts` (78) · `api/*` (client/projects/auth/events/types) | — |
| Testes | `apps/web/src/test/{preload.ts,setup.ts,render.tsx,fixtures.ts,fetch.ts}` + 14 `*.test.ts(x)` | — |

### 1.2 Rotas hoje (`apps/web/src/App.tsx:14-31`)

```
/login                       → LoginPage            (App.tsx:17)
<RequireSession>             → (App.tsx:18)
  /                          → GalleryPage          (App.tsx:19)
  /viewer/:id                → ViewerPage           (App.tsx:20)
  /project/:id <RequireProject> → WorkspacePage     (App.tsx:21-23)
  <RequireAdmin> /audit      → AuditPage            (App.tsx:24-26)
*                            → Navigate to /        (App.tsx:28)
```

`RequireProject` (`apps/web/src/auth/RequireProject.tsx:5-37`) já busca o projeto
(`useProject`) e só renderiza `<Outlet/>` com dado carregado — qualquer rota filha
de `/project/:id` nasce com o modelo em cache.

### 1.3 Layout do workspace (de onde o canvas sairia)

`apps/web/src/pages/WorkspacePage.tsx`:

- `selection` em `useState` — **linha 27**.
- `<header>` escuro com ações (Novo projeto / Atualizar modelo / Sugestões IA / Somente leitura / JSON) — **linhas 63-146**.
- `<aside class="w-80">` = **árvore** — **linhas 149-155** (`SemanticTree` na 151).
- `<main>` = **editor + barra** — **linhas 157-175**: `MetadataEditor` (161-166) + `StatusBar` (168).
- Diálogos: `NewProjectDialog` (178-186), `UpdateWizard` (188-197), `SuggestionPanel` (199-209, recebe `selection` na 202).

### 1.4 Onde a view "Diagrama" encaixa — as duas opções

**Opção A (recomendada): toggle dentro do `WorkspacePage`** — trocar o conteúdo de `<main>`
(linhas 157-175) por "Editor ↔ Diagrama", mantendo `<aside>` (árvore) sempre visível.

- Encaixe exato: novo estado `const [view, setView] = useState<'editor'|'diagrama'>('editor')`
  ao lado da linha 27; condicionar o bloco 160-167 (`MetadataEditor`) e montar
  `<DiagramCanvas database={...} selection={selection} onSelect={setSelection} />` no lugar.
- `StatusBar` (168) **fica** — é referenciado pelo e2e (`e2e/smoke.ts:125` e `:152`).
- A árvore (151) continua recebendo `onSelect={setSelection}` → a sincronização
  árvore↔canvas é trivial: mesmo `selection`/`setSelection` no mesmo componente.
- Custo: o `SuggestionPanel` (200-208) e o `UpdateWizard` continuam funcionando sem mudança.

**Opção B: rota própria `/project/:id/diagram`** — exigiria nova `<Route index>`/filha em
`App.tsx:21-23` e **duplicar ou transportar o `selection`** que hoje vive em `useState` da
`WorkspacePage` (linha 27): a página inteira seria recriada, perdendo seleção, estado dos
diálogos e scroll. Para funcionar, seria preciso mover `selection` para contexto/URL
(não existe — ver §2) ou renderizar a rota como `Outlet` dentro do workspace.
- Vantagem: deep-link (`?view=diagrama`), histórico do navegador.
- **SUPOSIÇÃO**: sem `useSearchParams` em lugar nenhum do app (grep: 0 ocorrências),
  a opção B hoje não tem nenhuma infra de estado compartilhado entre rotas além do
  cache do React Query.

**Recomendação:** Opção A na Fase 7 (menor diff, seleção já compartilhada), deixando o
`view` na URL via `useSearchParams` se deep-link virar requisito (mudança pequena e local
em `WorkspacePage.tsx`).

---

## 2. Estado/seleção da árvore hoje e como o canvas sincronizaria

### 2.1 Como funciona hoje

- **Não há Context, store (zustand/jotai/redux) nem `useSearchParams`** — grep em
  `apps/web/src` não retorna nenhuma ocorrência de `createContext|useContext|zustand|jotai|redux|useSearchParams`.
- **Seleção = `useState` local na página**: `WorkspacePage.tsx:27`
  (`useState<Selection>({ type: 'database' })`), passado por props para
  `SemanticTree` (151), `MetadataEditor` (163) e `SuggestionPanel` (202).
  `ViewerPage.tsx:40` tem uma cópia idêntica e independente.
- **Tipo da seleção** (`apps/web/src/lib/selection.ts:3-6`):
  ```ts
  export type Selection =
    | { type: 'database' }
    | { type: 'table'; table: string }
    | { type: 'column'; table: string; column: string }
  ```
  Helpers: `selectionKey` (17-21), `resolveSelection` (23-39, filtra `status !== 'REMOVED'`),
  `selectionBreadcrumb` (41-45), `applyDraft` (66-108, imutável via `structuredClone`).
- **A árvore emite seleção** via `onSelect` (`SemanticTree.tsx:9`, linhas 64/97/121) e
  destaca com `data-active` (66, 99, 123) — comparador `isActive` em `SemanticTree.tsx:12-20`.
- **Estado de servidor = React Query 5**: `useProject`/`projectQueryKey`
  (`apps/web/src/projects/queries.ts:54-71`, `staleTime: 10s` em
  `apps/web/src/app/queryClient.ts:96`), mutação de save em
  `WorkspacePage.tsx:35-44` (`projectsApi.save` → `PUT /api/projects/:id` →
  `setQueryData` + `invalidateQueries`).
- Estado local extra na árvore: colapso por tabela (`SemanticTree.tsx:24`).

### 2.2 Como o canvas sincronizaria

- **Árvore → canvas:** o `DiagramCanvas` recebe `selection` como prop (mesmo fluxo do
  `MetadataEditor`); ao virar `{type:'table'}` o node correspondente ganha classe/borda
  ativa e o canvas centraliza (`fitView`/`centerOnNode` via ref do React Flow —
  **SUPOSIÇÃO**: exige `useReactFlow()` dentro do wrapper e um `useEffect` sobre `selection`).
- **Canvas → árvore:** `onNodeClick` chama `setSelection({ type: 'table', table: id })`;
  clique numa linha do card chama `setSelection({ type: 'column', ... })` — a árvore já
  re-renderiza com `data-active` e o `MetadataEditor` já abre (não há nada a mudar).
- **Restrição:** `Selection` é **unitário** (um item por vez). Não representa
  "nó selecionado + coluna destacada" nem conjunto de tabelas de um resultado de busca —
  ver §8(b).

---

## 3. Design system / padrões Tailwind

- **Tailwind 4 (CSS-first), sem `tailwind.config`**: tokens em
  `apps/web/src/index.css:1-11`:
  ```css
  @import "tailwindcss";
  @theme {
    --color-accent: #6d5dfc;  --color-ink: #0f172a;
    --color-bg: #f1f5f9;      --color-surface: #ffffff;
    --radius-sm: 6px; --radius-md: 10px; --radius-lg: 16px;
  }
  ```
  Vite plugin em `apps/web/vite.config.ts:8` (`plugins: [react(), tailwindcss()]`).
- **Sem biblioteca de componentes e sem componentes base compartilhados**: não existe
  `Button`/`Input`/`Modal` genérico — as classes são coladas inline e repetidas
  (ex.: botão de header `rounded-sm border border-slate-600 px-3 py-1.5 text-xs font-medium
  text-slate-200 hover:bg-slate-800` em `WorkspacePage.tsx:66, 81, 89, 98, 117, 139`).
  Botão primário: `rounded-sm bg-accent px-4 py-2 text-sm font-semibold text-white
  hover:bg-indigo-600 disabled:opacity-60` (`MetadataEditor.tsx:230`).
- **Superfícies:** fundo `bg-bg`, painel `bg-white` com `border-slate-200`
  (`WorkspacePage.tsx:149`), header escuro `bg-ink` + `text-white` (63).
- **Badges/chips:** `rounded-full bg-indigo-50 px-2 py-1 text-xs text-indigo-700`
  (`MetadataEditor.tsx:175`), status `SemanticBadge.tsx`.
- **Acessibilidade/teste:** `data-testid` em tudo o que o e2e encosta
  (`table-row-*`, `column-row-*`, `database-row`, `coverage-*`, `agent-pending-badge`),
  `aria-label` em PT-BR, `role="status"|"alert"` para feedback (`MetadataEditor.tsx:210, 215`),
  `role="dialog"` nos painéis.
- **Formatação/lint:** Biome com `indentWidth: 2`, `lineWidth: 120`, aspas simples,
  `semicolons: asNeeded` (`biome.json:36-41`) — **`docs/` é ignorado pelo Biome**
  (`biome.json:24`), então este relatório não passa por lint.
- **Implicações para o canvas:** os tokens `--color-accent/ink/bg` e a escala `slate/indigo`
  estão disponíveis nos nodes customizados; o CSS próprio do React Flow precisa ser importado
  uma vez (ex.: `import '@xyflow/react/dist/style.css'` no componente) — **SUPOSIÇÃO**:
  entra no pipeline de CSS do Vite sem config extra, e suas classes internas não passam pelo
  Tailwind (só as utilitárias que você escrever nos cards).

---

## 4. Como testes de componente são escritos (exemplos concretos)

### 4.1 Infraestrutura

- Runner: **`bun test`** na raiz, com `bunfig.toml:1-3`:
  `pathIgnorePatterns = ["legacy/**"]` e **`preload = ["./apps/web/src/test/preload.ts"]`**
  (preload global para toda a suíte, incluindo API).
- `apps/web/package.json:10` → `"test": "bun test --preload ./src/test/preload.ts src"`.
- `apps/web/src/test/preload.ts:1-43` — registra **happy-dom**
  (`GlobalRegistrator`), preserva globals nativos (`fetch`, `crypto`, …) e seta
  `IS_REACT_ACT_ENVIRONMENT = true`.
- `apps/web/src/test/setup.ts:1` — re-exporta `render, screen, fireEvent, waitFor, within, cleanup`
  de `@testing-library/react` (não há `@testing-library/user-event`).
- `apps/web/src/test/render.tsx:16-36` — `renderWithClient(ui)` e
  `renderApp(initialEntries)` (QueryClient de teste com `retry:false, gcTime:0` + `MemoryRouter` + `AppRoutes`).
- `apps/web/src/test/fixtures.ts:4-103` — `sampleDatabase()` (2 tabelas, 1 FK), `sampleProject()`, `sampleUser`.
- `apps/web/src/test/fetch.ts:29-39` — `installFetch(handler)` substitui `globalThis.fetch`
  e devolve restore; `jsonResponse`/`errorResponse` fabricam `Response`.

### 4.2 Padrão 1 — componente isolado com harness de estado

`apps/web/src/components/SemanticTree.test.tsx` (76 linhas):

- Harness local `TreeHarness` com `useState` (linhas 8-21) reproduzindo o contrato
  `selection/onSelect` do componente real.
- `afterEach(cleanup)` (24-26); assertions com `screen.getByTestId` + `within` (29-40);
  interação com `fireEvent.click` (46, 57, 71); contrato de evento verificado por array
  (`expect(selections).toEqual([{ type: 'column', ... }])`, linha 73) e por atributo
  (`data-active`, linha 74).

### 4.3 Padrão 2 — página inteira com rotas e fetch mockado

`apps/web/src/pages/WorkspacePage.test.tsx` (159 linhas):

- `stubProject()` (15-27) instala `installFetch` respondendo `/api/auth/me` e
  `/api/projects/projeto-1`; restore acumulado em `restoreCallbacks` (8-13).
- `renderApp(['/project/projeto-1'])` (32) → asserts por testid
  (`table-row-cliente`, 34-36); seleção + editor (40-51); mutação PUT devolvendo o modelo
  atualizado e invalidação de query (53-78); fluxo de navegação para o viewer (80-97);
  estado vazio/404 (145-158).

### 4.4 Padrão 3 — contrato de "somente GET" (importante para o diagrama)

`apps/web/src/pages/ViewerPage.test.tsx:125-133` — instala fetch que **registra métodos**
e só permite `GET` ao carregar, buscar e selecionar.

**Para o canvas:** os testes novos seguiriam o padrão 1 (nós/arestas a partir de
`sampleDatabase()`, `fireEvent.click` no node, `onNodesChange` disparado manualmente).
**SUPOSIÇÃO:** happy-dom não simula pointer-drag real; `apps/web/node_modules/happy-dom/lib/resize-observer/ResizeObserver.js`
e `lib/intersection-observer/` existem, mas o arrasto do React Flow (pointer capture,
`getBoundingClientRect` com tamanho 0) provavelmente precisará de stubs — testar a lógica
de persistência pelo handler `onNodesChange`/`onNodeDragStop` em vez do gesto físico.

---

## 5. O que `e2e/smoke.ts` cobre e como um e2e novo entraria

Arquivo único: `e2e/smoke.ts` (232 linhas), roda por `package.json:23`
(`"test:e2e": "bun run e2e/smoke.ts"`), **fora de `bun run check`** (`AGENTS.md`, seção
"Web UI (v2 — Fase 3)": *"`bun run test:e2e` stays out of `bun run check`"*).

Fluxo coberto hoje (linhas):

1. Sobe seed + API + web em portas isoladas (3310/5373) e DB SQLite temporário — **70-89**.
2. Login como admin — **105-109**.
3. Cria projeto importando `legacy/example.sql` — **111-117** (testid `table-row-users`, 116).
4. Seleciona coluna, edita descrição, **Salvar**, aprova revisão — **118-123**.
5. Lê cobertura no `coverage-reviewed` antes/depois — **125, 152-155**.
6. Agente fake: geração `scope=project` e `scope=table` + aplicar sugestão — **127-170**.
7. Export JSON e valida persistência — **172-194**.
8. Viewer read-only: navega, **exige zero controles de mutação** (211-216) e
   **zero requisições não-GET** (196-221) — monitora `page.on('request')`.
9. Log final + teardown — **223-231**.

**Como entraria um e2e novo do diagrama** (duas rotas possíveis, sem conflito):

- **(i) Estender `smoke.ts`** com um bloco após a etapa 4 (ex.: alternar para "Diagrama",
  verificar nodes/arestas, arrastar, esperar a `PUT`/`GET` do layout). Desvantagem: o smoke
  já é longo e o arrasto aumenta flakiness; o script é *one-shot* (nada de test framework).
- **(ii) Novo arquivo `e2e/diagram.ts` + script** `"test:e2e:diagram": "bun run e2e/diagram.ts"`
  em `package.json` (linha 23 ao lado), reaproveitando o mesmo scaffolding de
  `smoke.ts:7-89` (env, `runOnce`, `waitForOk`, spawn API/web, chromium).
  Playwright é `devDependency` da raiz (`package.json:28`, `^1.65.1`) e o chromium já está
  instalado (`~/.cache/ms-playwright/chromium-1255` — verificado). O dev server do Vite
  resolve a dependência nova em runtime, sem build prévio.
- **SUPOSIÇÃO:** o e2e de arrasto deve preferir `page.mouse.move/down/up` sobre coordenadas
  do node (React Flow usa pointer events) e asserts por `data-testid`/`data-nodeid`.

---

## 6. Existe código/deps de canvas/gráfico/arrasto hoje?

**Não — nenhum.** Evidências:

- `bun.lock` (86 KB): zero ocorrências de `@xyflow`, `reactflow`, `d3`, `konva`, `gojs`,
  `cytoscape`, `panzoom`, `jsplumb`.
- `apps/web/src`: zero `<svg`, `<canvas`, `draggable`, `onMouseDown`, `pointerdown`,
  `contextmenu`, `wheel` (grep vazio).
- `apps/web/node_modules` e raiz: **`@xyflow` não está instalado**.
- `legacy/` (v1): também sem `<svg>/<canvas>/drag` — o v1 é HTML+Materialize estático.
- Únicos "vizinhos gráficos": barra de progresso em `div`s (`StatusBar.tsx:51-56`),
  chips/badges, e o diff de relacionamentos do `UpdateWizard.tsx:323-379`.
- **Dados de relacionamento já existem e são suficientes para as arestas:**
  `packages/domain/src/index.ts:50-91` (`RelationshipModel` com `local_columns`,
  `referenced_columns`, `constraint_name`; `TableModel.relationships.parents/children`).
  Hoje só `lib/coverage.ts:43` e o `UpdateWizard` os consomem — **nenhum componente renderiza
  o painel "Filha de/Mãe de"** mencionado na spec `semantic-editor` (grep por
  `parents|children` em `MetadataEditor.tsx`/`ViewerDetail.tsx`: 0 hits).
- Layout persistido: **não existe** (nenhuma tabela `diagram_layouts`, nenhum campo de posição
  em `DatabaseModel`, `packages/domain/src/index.ts:85-91`).

---

## 7. Como novas dependências entram — `@xyflow/react` viável sem mudança de build?

**Sim, é viável sem mudança de configuração de build** (a única escrita necessária fora do
código é `apps/web/package.json` + `bun.lock`, via `bun install` — proibido nesta análise):

- **Workspaces:** raiz `package.json:4-7` (`apps/*`, `packages/*`); membro do web é
  `apps/web/package.json`, cujo bloco `dependencies` é **linhas 12-18**
  (`@dbmapper/contracts`, `@dbmapper/domain`, `@tanstack/react-query ^5.107.1`,
  `react ^18.3.0`, `react-dom ^18.3.0`, `react-router-dom ^7.18.5`).
  `@xyflow/react` entra como dependência normal **desse arquivo** (é lib de runtime, não devDep).
- **Sem restrições:** não há `overrides`, `resolutions`, `.npmrc`, `pnpm`/`yarn` no repo
  (grep vazio); `apps/web/vite.config.ts` (14 linhas) só define `plugins: [react(), tailwindcss()]`
  e proxy `/api`,`/health` — **sem `alias`, `optimizeDeps`, `resolve` ou limitações de CSS**.
  `apps/web/tsconfig.json` e `tsconfig.base.json:4-10` (`strict`, `moduleResolution: bundler`,
  `skipLibCheck: true`) comportam os types do React Flow — **SUPOSIÇÃO**: typecheck limpo;
  confirmar na hora do `bun run --cwd apps/web typecheck`.
- **Tailwind 4 via `@tailwindcss/vite` (`vite.config.ts:1,8`):** o CSS do React Flow é
  importado como CSS comum (não passa pelo Tailwind) — **SUPOSIÇÃO**: nenhuma mudança de
  plugin necessária; se fosse necessário, seria só um import de arquivo.
- **Ponto de atenção (deploy):** `docker/Dockerfile.web:23` roda
  `RUN bun install --frozen-lockfile` e **copia cada `package.json` de workspace
  individualmente (linhas 8-15)** — ou seja, o `bun.lock` atualizado precisa ser commitado
  junto, senão o build de produção quebra. Nenhum novo workspace é necessário.
- **Gate de qualidade:** `bun run check` (raiz `package.json:20`) roda `typecheck` de todos
  os workspaces + `biome lint` + `bun test` — código novo precisa passar nos três.
- **SUPOSIÇÃO:** peer deps do `@xyflow/react` (v12: `react >=17`, `react-dom >=17`) batem com
  React 18.3; conferir no `bun install` da implementação.

---

## 8. Incompatibilidades concretas entre o plano (`04-proposta-modelo-er.md`) e o frontend atual

| # | Plano | Realidade no código | Impacto |
|---|---|---|---|
| **a** | "arrasto persiste layout via API" (`04:158`) | **Não existe endpoint de layout.** O único save é `PUT /api/projects/:id` (`apps/api/src/routes/projects.ts:55-73`), que exige `projectDocumentSchema` **com o modelo inteiro** (`apps/api/src/validation.ts:64-66`), faz `replaceModel` e grava evento `project.saved`. Não dá para persistir só posição sem reenviar o modelo e poluir a auditoria. | **Bloqueante:** exige `GET/PUT /api/projects/:id/diagram` + migration `diagram_layouts` + cliente em `apps/web/src/api/projects.ts` — nada disso existe. |
| **b** | sync seleção + busca com highlight (`04:158`) | `Selection` é **unitário** (`lib/selection.ts:3-6`): um item por vez, sem seleção múltipla nem "tabelas destacadas por busca". | Highlight de N resultados não é representável em `Selection` — precisa de estado extra (ex.: `Set<string>` de `matches`) paralelo à seleção. |
| **c** | toggle "Árvore/Editor ↔ Diagrama" (`04:148`) | O `<main>` do workspace é `MetadataEditor` (`WorkspacePage.tsx:161-166`), único lugar de editar descrição/termos/aprovar. Trocar por canvas **esconde o editor**, e a spec `semantic-editor` exige: *"The editor MUST open when the user selects the database root, a table, ou a column"* (`openspec/specs/semantic-editor/spec.md`, Requirement "Selection of an item"). | **Conflito de spec:** ou mantém split (editor lateral/painel inferior no modo diagrama) ou a seleção vinda do canvas não abre editor → viola a spec existente. |
| **d** | esconder/mostrar painéis no toggle | `StatusBar` (`WorkspacePage.tsx:168`) tem testids consumidos pelo e2e (`e2e/smoke.ts:125,152`) e o botão `workspace-viewer-link` está no header (114-122). | O toggle não pode derrubar `StatusBar` nem o header; qualquer rearranjo quebra o smoke. |
| **e** | rota própria `/project/:id/diagram` (`04:150`) | `selection` é `useState` da `WorkspacePage:27`; não há contexto, store nem `useSearchParams` em todo `apps/web`. | Rota própria **perde seleção e estado dos diálogos** ao navegar; exige lift de estado (novo contexto) — mais diff que a Opção A. |
| **f** | "arrasto persistindo layout" no viewer/spec | Spec `project-viewer` + `e2e/smoke.ts:211-221` proíbem **qualquer controle de mutação e qualquer não-GET** no `/viewer/:id`. | Se o diagrama entrar no viewer, o arrasto deve ser desativado (nó não arrastável + sem chamada de layout) — caso contrário o smoke falha. |
| **g** | "busca lateral com highlight" | Só existe busca no **viewer** (`ViewerPage.tsx:104-115`), que **filtra removendo tabelas do modelo** (`filterDatabase`, `ViewerPage.tsx:11-26`); no workspace não há busca alguma e não há utilitário de highlight. | Reuso parcial: a lógica de match pode ser extraída para `lib/`, mas "não remover do canvas, só destacar" é comportamento novo. |
| **h** | menu de contexto, undo/redo, atalhos (`04:145,159`) | Nenhum `onContextMenu`, atalho global ou fila de comandos existe no app; não há histórico de estado além do React Query cache. | Tudo é código novo; **não há padrão a copiar** — definir no design do change. |
| **i** | Fase 8: criar/excluir tabela, coluna e relacionamento pelo canvas | O editor atual **só descreve/termos/aprova** (`MetadataEditor.tsx:105-134`); o único fluxo estrutural é o `UpdateWizard`, que consome **plano do servidor** (`AGENTS.md`: "renders the server preview plan only"). | Criação estrutural via `PUT` exige `requireMember` e modelo completo; a UI de criação não tem precedente. Cardinalidade/flags `NN/UQ/AI` **não existem** no contrato v1 (`packages/domain/src/index.ts:59-91`) — já sinalizado no plano (`04:136-139`). |
| **j** | Fase 9: abas/zonas | `DatabaseModel` (`packages/domain/src/index.ts:85-91`) não tem zonas; export v1 é `ProjectDocument { database }` (93-95). | Zona precisa viver **fora** do contrato v1 (como o plano já prevê em `04:108`) — nenhum campo para "encaixar" hoje. |
| **k** | testes do canvas | Ambiente é **happy-dom** (via `bunfig.toml:3`), sem user-event nem simulação de pointer-drag real; `ResizeObserver`/`IntersectionObserver` existem no happy-dom. | Testar arrasto por handlers, não por gesto; **SUPOSIÇÃO**: possível stub de `pointer capture`/tamanho de viewport. |
| **l** | dep `@xyflow/react` | `docker/Dockerfile.web:23` usa `--frozen-lockfile`; `bun.lock` está no repo. | Requer `bun install` + commit do lock (fora do escopo desta análise). |
| **m** | "v2 code only through OpenSpec changes" | `openspec/config.yaml` (context) e `AGENTS.md` ("do not start v2 code outside that flow"). | O diagrama precisa de um change `v2-phase7-diagram` com specs (cenários exatamente com `#### Scenario:` — regra em `openspec/config.yaml:rules.specs`) **antes** do código. |

### Síntese de viabilidade

- **Fase 7 (só visual + layout) é viável com diff concentrado:** novo
  `apps/web/src/components/DiagramCanvas.tsx` + toggle em `WorkspacePage.tsx:157-175` +
  endpoint novo de layout (backend) + dep nova (sem mudança de build). Os pontos que
  **exigem decisão antes de codar** são: (c) onde o editor fica no modo diagrama,
  (a) o novo endpoint e o evento de auditoria, (b) modelo de seleção/busca e
  (f) comportamento no viewer.
- **Fase 8/9 tocam contrato v1, spec `semantic-editor` e spec `audit-log`** — não são só
  "mais um componente".
