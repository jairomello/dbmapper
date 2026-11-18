# Design — v2-phase5-mcp

## Context

A API é Hono com guarda global `app.use('/api/*', requireSession)` (`apps/api/src/app.ts`); o middleware de sessão seta `c.set('user', ...)` e `requireRole` faz o gating de papel; erros saem sempre no envelope `ApiError(status, code, message)`. A Fase 4 adicionou rotas de agente (`/api/projects/:id/agent/*`), a tabela `events` e o provider fake. O `apps/mcp` existe como stub desde a Fase 0 (package.json e `typecheck` no root já o incluem).

Referências de reuso (doc 02 §5.3 e §9): schema `api_keys` do azyboard (simplificado single-tenant), `opencode.json.example` (nunca o `opencode.json` real — azyboard cometeu chave em claro; pegadinha conhecida), `skills/azyboard/SKILL.md` (92 linhas) e `scripts/check-mcp-catalog.ts`.

Fato decisivo: **não exist endpoint de escrita por item** — a UI salva via `PUT` do modelo inteiro. O tool `set_description` precisa de um endpoint estreito, e ele vira requisito do `project-api`.

## Goals / Non-Goals

**Goals:** chave por usuário agindo como dono na superfície MCP; servidor stdio com os 9 tools; escrita por item auditada com fonte `mcp`; catálogo verificável; skill + config exemplo; ponta-a-ponta com opencode real.

**Non-goals:** transporte HTTP `/mcp` (Fase 6), UI de chaves, escopo por tool, rotação automática, MCP resources/prompts, multi-tenant.

## Decisions

### 1. Schema — `api_keys` (tabela única, aditiva)

```ts
api_keys: id, owner_id (FK users), name, key_hash (unique, SHA-256 hex),
  key_prefix (ex.: 'dbmp_1a2b3c4d', exibição), project_scope (text, nullable — SEM FK,
  scope de projeto apagado vira 403 seguro), expires_at (nullable), revoked_at (nullable),
  created_at, last_used_at (nullable)
  // index: (owner_id)
```

- Chave: `dbmp_` + 40 hex (`crypto.randomBytes(20).toString('hex')`); hash SHA-256 da string completa; **plaintext retornado só no POST**.
- Revogação = `revoked_at` (lookup por hash já rejeita na hora); expiração comparada em `expires_at`.
- Escopo é **por projeto** (único escopo da fase); papel vem sempre do dono.

### 2. Middleware de credencial (modificação do fluxo de sessão)

Novo `requireCredential(auth, persistence)` substituindo o `requireSession` global:

1. Header `Authorization: Bearer *** → caminho Bearer:
   - path **dentro** de `KEY_ENABLED` (constante exportada: `GET /api/projects/:id`, `GET /api/projects/:id/export`, `/api/projects/:id/agent/*`, `PATCH /api/projects/:id/items/...`) → lookup por hash, checa revogado/expirado (401 `INVALID_API_KEY`), seta `user` = dono + `credential = 'api_key'` + registro da key em contexto, atualiza `last_used_at`, e aplica escopo de projeto extraindo o id do path por regex (fora do escopo → 403 sempre, exista o projeto ou não → não vaza existência).
   - path **fora** de `KEY_ENABLED` → cai no fluxo de sessão normal (sem cookie → 401) — satisfaz "session-only routes reject key".
2. Sem Bearer → fluxo de sessão de hoje (inclui o pass-through do login).
3. Identidade vem só do servidor: argumentos de corpo/query (`actorUserId`, `userId`…) são ignorados por construção (o middleware seta `user`; handlers não leem identidade do payload).

`KEY_ENABLED` vira fonte única testada: um teste de unidade lista os paths esperados — adicionar rota nova na superfície exige mexer na constante (falha o teste).

### 3. Endpoint de descrição por item

`PATCH /api/projects/:id/items/:itemType/:itemId/description` (zod: `{ description: string }`, itemType enum, comprimento máx.) → repositório `setItemDescription` no port `Persistence`:

- valida pertencimento (item existe **e** pertence ao projeto → senão 404);
- `description_source` = `credential === 'api_key' ? 'mcp' : 'human'`;
- mudança real de valor → `reviewed = false` (reabre aprovação); valor idêntico → `reviewed` intacto;
- evento `item.description_written` na **mesma transação** (ator, item, origem);
- MEMBER+ (o `requireRole` existente cobre; VIEWER 403).

Fica em `routes/items.ts` (registrada no `app.ts`) para não engordar `projects.ts`; regras de persistência em `persistence/sqlite` (o script de boundaries já exige ports nessa camada).

### 4. Servidor MCP (`apps/mcp`) — quatro módulos

```
apps/mcp/src/
  catalog.ts   # TOOL_CATALOG: fonte única { name, description, inputSchema,
               #   docSection, dispatch { method, path } } — guard e docs leem daqui
  api.ts       # ApiClient: fetch + env (DBMAPPER_API_KEY/URL/PROJECT_ID),
               #   envelope → ApiError { status, code, message }, sem eco de corpo cru
  handlers.ts  # um handler por tool: args → chamada API → conteúdo de resultado
  index.ts     # SDK McpServer + StdioServerTransport; registro a partir do catálogo;
               #   env ausente → handler que responde MCP_CONFIG_ERROR (servidor sobe mesmo assim)
```

- Dep nova: `@modelcontextprotocol/sdk` (só em `apps/mcp`).
- **Leitura** (`overview`, `list_missing`, `get_table/get_column`): adapter busca `GET /api/projects/:id` (modelo completo) e filtra localmente — modelos do v2 são modestos; endpoint dedicado é otimização futura. `get_export` usa o endpoint v1 existente. Contagem de cobertura do overview é derivada do modelo com regras simples (documentado no TOOLS doc; o badge exato continua sendo da UI/`coverage-stats`).
- **`projectId`**: argumento opcional quando `DBMAPPER_PROJECT_ID` está setado (padrão `withOptionalProjectId` do azyboard); sem arg e sem env → erro de validação local.
- **Escrita**: `set_description` → endpoint do item; ciclo de sugestões → rotas do agente já existentes (CAS 409 vira `isError` com o code do envelope).
- **Anti-forja**: `inputSchema` rejeita chaves de identidade (`actorUserId`, `userId`, `apiKeyId`, `projectId` exceto onde declarado) — validado **antes** de qualquer fetch e verificado pela guarda.

### 5. Guarda de catálogo

`scripts/check-mcp-catalog.ts` (roda com Bun, importa `TOOL_CATALOG`):

1. todo tool tem âncora `##` com o nome em `docs/TOOLS-DBMAPPER.md`;
2. todo tool tem `dispatch` (método + path) e schema estruturalmente válido (sem dep de validação — checagem estrutural própria);
3. nenhum `inputSchema` aceita chave de identidade proibida;
4. `opencode.json.example` não contém literal `dbmp_[0-9a-f]{16,}`;
5. sai 0 na árvore saudável, sai ≠0 nomeando o ofensor.

Root `package.json`: `"test:mcp-catalog": "bun run scripts/check-mcp-catalog.ts"` **inserido na cadeia `check`**. Teste de unidade do validador com catálogos sintéticos ruins (o cenário "documentado ausente → falha" é testado assim).

### 6. Skill e config exemplo

- `skills/dbmapper/SKILL.md` adaptada da azyboard: fluxo obrigatório (descobrir projeto → `list_missing_descriptions` → analisar codebase local → `set_description` → reportar), regras de segurança (chave só em env; nunca paralelizar chamadas MCP; warning "não revisado"; `reviewed` é exclusivamente humano), erros por `code`/`retryable`, referências ao TOOLS doc.
- `opencode.json.example`: entrada local stdio (`bun run apps/mcp/src/index.ts` + `environment` com `{env:DBMAPPER_*}`) e entrada remota desabilitada (modelo do azyboard); `.gitignore` ganha `/opencode.json`.

### 7. Ponta-a-ponta (execução minha, grupo 12)

API local no work dir (provider fake, DB temporário) → criar usuário MEMBER + chave via API → `opencode.json` local (gitignored) → `opencode run` pedindo *list missing + set_description* → conferir no SQLite: `description` gravada, `description_source='mcp'`, `reviewed=false`, evento presente. Evidência no relato; config local é descartada.

## Risks / Trade-offs

- **Superfície Bearer por regex de path** — frágil se alguém adicionar rota nova sem atualizar `KEY_ENABLED`; mitigado pelo teste que fixa a lista.
- **Modelo completo por leitura** — O(n) por call; aceitável hoje; otimizar com endpoints dedicados se o modelo crescer.
- **`last_used_at` a cada request** — write por request em SQLite single-writer; irrelevante na escala atual (throttle depois se preciso).
- **Overview com contagem própria** pode divergir em detalhe do `coverage-stats` (FKs) — documentado como informativo.
- **SDK em versão nova** — pin explícito no package.json; testes de contrato do adaptador protegem contra mudança de API.

## Migration Plan

1. Adicionar `api_keys` em `apps/api/src/db/schema.ts` → `bun run db:generate` → migração `0004` (aditiva: 1 tabela + índices; sem backfill).
2. `bun run db:migrate` em DB novo e em dev existente — código antigo continua funcionando (aditiva).
3. Deploy: migrar antes de subir a nova build (ordem já usada nas fases anteriores).
4. Rollback: parar a app e `DROP TABLE api_keys;` — nada fora da feature de chaves é afetado; sessões continuam válidas.
5. Docs: `.env.example` (vars do cliente MCP, comentadas), README (fluxo de chave + conexão), AGENTS.md (seção aditiva), `.gitignore` (`/opencode.json`).
