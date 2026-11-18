# 09 — Revisão do plano vs. implementação (síntese)

> Base: `07-modelador-backend-contratos.md` (627 linhas, com probes reais de
> execução) e `08-modelador-frontend-ui.md` (332 linhas). Objetivo: adaptar o
> plano (docs 04–06) ao código real **antes** de abrir os changes OpenSpec.
> Resultado: plano viável; as 6 decisões seguem de pé; 14 adaptações de escopo,
> 6 delas registradas como decisão (§3).

## 1. Adaptações que entram nos changes

| # | Incompatibilidade (evidência) | Adaptação no plano | Change |
|---|---|---|---|
| A1 | Export v1 está em `packages/domain`, não `packages/contracts` (`domain/src/index.ts:44-103`) | Corrigir referência do plano; tocar em `domain` só se o contrato mudar (não muda) | docs |
| A2 | IDs de tabela/coluna/relationship **regeneram a cada PUT** (probe: `estáveis? false`; `adapter.ts:370,402,428,460`) | Layout indexado **só por nome** (já era o doc 04) — agora é obrigatório, não preferência; `diagram_layouts` sem FK para `tables.id` | 7 |
| A3 | Auto-criar coluna FK **não cai no backend**: `markColumnAsForeignKey` é no-op p/ coluna inexistente (`sql-parser/parser.ts:158-161`); zod aceita `local_columns` fantasma | **Cliente compõe** coluna nova + relationship no mesmo `PUT` (atómico hoje — provado por probe). Sem mudança de backend | 8 |
| A4 | Chave `diagram` dentro do PUT do modelo é **descartada em silêncio** pelo zod (não-strict) | Endpoint próprio `GET/PUT /api/projects/:id/diagram` (já previsto — confirmado como obrigatório) | 7 |
| A5 | Fronteira de persistência (`check-persistence-boundaries.ts:6,9-12`) proíbe drizzle em `routes/` e `services/` | Tabela nova exige 4 camadas: `db/schema.ts` + migração + `ports.ts` + `adapter.ts`; rota só orquestra | 7 |
| A6 | `audit-log/spec.md:10` **enumera** as mutações; teste tabela-driven é array declarativo (`audit-coverage.test.ts:133-297`); `AuditPage.tsx:8-16` tem `ACTION_FAMILIES` hardcoded | Delta `MODIFIED` na spec + caso novo no array + família `diagram.` na UI | 7 |
| A7 | API key fixa em 4 rotas, travada por teste (`credential.test.ts:49` `toHaveLength(4)`) | Layout **não** exposto a MCP/API key nesta fase (Non-goal; decisão §3) | 7 |
| A8 | Export v1 congelado por teste (`export.test.ts:61-137`) | Layout jamais entra no export — **guarda a preservar** (o plano já dizia) | 7 |
| A9 | Não existe capability `diagram`; v2 só entra via change | Capability nova `diagram-canvas` + `diagram-layout` (+ `diagram-editing`, `diagram-zones`) | 7/8/9 |
| A10 | Canvas vai exibir ordem de colunas diferente do DBViewer legado (position vs PK+alfabético) | Canvas segue a ordem do modelo (`position`); registrar como decisão (§3) | 7 |
| A11 | Change antigo `sort-columns-by-pk-alphabetical` (5/9, 28/06) com delta em `specs/dbviewr/` (typo) — validate avisa que archive recusaria | **Reportar ao Jairo; não mexer** (não bloqueia o diagrama; bloqueia só o archive dele) | — |
| A12 | GETs hoje não têm `requireRole` (qualquer autenticado lê) | `GET /diagram` sem `requireRole` (mesmo padrão); `PUT /diagram` com `requireRole('MEMBER')` | 7 |
| F-a | `Selection` é unitário (`lib/selection.ts:3-6`) — não representa highlight múltiplo | Busca usa estado paralelo `Set<string>`; `Selection` não muda | 7 |
| F-b | Toggle esconde o `MetadataEditor`; spec `semantic-editor` exige que o editor abra na seleção da árvore | Modo diagrama mantém o editor como **painel recolhível embaixo do canvas** (abre na seleção) | 7 |
| F-c | `StatusBar` e header têm testids do e2e (`smoke.ts:114-152`) | Toggle não derruba StatusBar/header/árvore | 7 |
| F-d | Viewer proíbe qualquer não-GET (`project-viewer`, `smoke.ts:211-221`) | Diagrama **fora** do viewer nesta fase (Non-goal) | 7 |
| F-e | Não existe busca no workspace (só no viewer, que filtra/removendo) | Busca do canvas é nova: destaca **sem remover** nós | 7 |
| F-f | happy-dom não simula gesto de pointer-drag | Teste de componente via handlers; arrasto real coberto por e2e (playwright) | 7 |
| F-g | `docker/Dockerfile.web:23` usa `--frozen-lockfile` | `bun install` + commit do `bun.lock` é task explícita da Fase 7 | 7 |
| F-h | Criação estrutural não tem precedente na UI (só wizard com plano do servidor) | Fase 8 reusa `PUT` completo com `requireRole('MEMBER')`; popovers montam o payload | 8 |
| F-i | `DatabaseModel` não tem zonas; não há "encaixe" no contrato v1 | Zonas ficam **fora** do export v1, dentro do documento de layout (mesma PUT do diagrama — sem rota/evento novo) | 9 |

## 2. Confirmações (o plano já acertou)

- **Layout por nome** (doc 04 §3.2) — agora é requisito duro (A2).
- **Endpoint próprio** (doc 04 §3.2) — confirmado impossível enxergar no PUT (A4).
- **Layout fora do export v1** — guarda com teste que existe (A8).
- **Auto-save com indicador, sem botão** (decisão 5) — alinhado ao PUT dedicado.
- **React Flow** — `vite.config.ts` sem alias/overrides, `@xyflow/react` entra como
  dep normal (`08:§7`); a regra "sem bundler" do AGENTS.md é escopada para `legacy/`
  (`AGENTS.md:242-245`).
- **Opção A (toggle no workspace)** — `08:§1.4`: rota própria perderia o
  `selection` que é `useState` da página.

## 3. Decisões que tomei (revisar; mudam algo → me avise)

1. **Auto-FK no cliente** (A3): o diálogo do canvas monta coluna + relationship
   num único payload de `PUT` — zero backend novo na Fase 8.
2. **Editor como painel inferior** no modo diagrama (F-b) — satisfaz
   `semantic-editor` sem mexer na spec.
3. **GET sem requireRole / PUT MEMBER** (A12) — segue o padrão dos GETs atuais.
4. **API key/MCP fora** do layout (A7) — superfície de 4 rotas fica intacta.
5. **Ordem de exibição = `position`** do modelo (A10) — não replicar o
   viewer legado.
6. **Contagem sem teto**: breadcrumb mostra `N tabelas` (sem limite 500 do
   referência — não faz sentido para nós).

## 4. Riscos abertos

- **A11** (change antigo) precisa de decisão sua antes do próximo archive.
- Teste de arrasto em happy-dom é fraco (F-f) → e2e é o gate real.
- Fase 9 cria delta em capability que só existirá após o archive da Fase 7
  (validação hoje dá INFO; ordem 7→8→9 garante o archive).
