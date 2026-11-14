# Análise do Azy Board — arquitetura e mapa de reaproveitamento para o dbmapper v2

> **Escopo:** leitura somente-leitura da codebase em `/mnt/shared/projetos/azyboard/` (checkout de 14/11/2026).
> **Todos os caminhos abaixo são relativos à raiz desse repositório**, salvo indicação em absoluto (`/mnt/shared/...`).
> Nada aqui foi executado nem alterado; fatos vêm da leitura dos arquivos citados.

---

## 1. Stack e arquitetura do monorepo

**Runtime e build:** Bun como runtime único (workspaces `apps/*` e `packages/*` declarados em `package.json` raiz; lockfile `bun.lock`, `.bun-version`). A API usa `serve()` nativo do Bun (`apps/api/src/index.ts`), que hospeda HTTP **e** WebSocket no mesmo listener. Linguagem TypeScript strict; lint/formatação com Biome (`biome.json`); gestão de mudanças com OpenSpec 2.0 (`openspec/`, devDep `@fission-ai/openspec`).

### Apps

| App | Papel | Stack principal | Entry |
|---|---|---|---|
| `apps/api` | API REST + endpoint MCP remoto + WS + worker do agente | Hono 4 (`hono/cookie`, `hono/cors`), Drizzle ORM, `bun:sqlite`, `pg`, `jose`, `bcryptjs`, `zod`, SDK `openai`, `ioredis`, OTel, Sentry | `apps/api/src/index.ts` (`startServer()`), rotas em `apps/api/src/routes/` |
| `apps/web` | Frontend Kanban + gaveta do agente | React 18, Vite 5, TanStack Query 5, Radix UI, Tailwind, react-router 6, i18next, TipTap, dnd-kit | `apps/web/src/` (features em `src/features/board`, gaveta em `src/components/AzyAgentDrawer.tsx`) |
| `apps/mcp` | Adaptador **stdio** do servidor MCP (client local, ex.: opencode) | `@modelcontextprotocol/sdk` + fetch HTTP para a API | `apps/mcp/mcp-server.ts` (entrypoint nomeado) e `apps/mcp/src/index.ts` (`startStdioServer()`) |

### Packages (camada compartilhada pura)

| Package | Conteúdo verificado | Caminho |
|---|---|---|
| `@azy-board/domain` | Tipos de domínio (enums `GlobalGroup`, `MemberRole`, `ItemType`, `TaskStatus`, progresso, exportação) | `packages/domain/src/index.ts`, `progress.ts`, `export.ts` |
| `@azy-board/api-contracts` | Contratos HTTP: `JwtPayload`, `RequestContext`, `ApiErrorPayload`, `AuthProvider` | `packages/api-contracts/src/index.ts` |
| `@azy-board/realtime-contracts` | Versão de protocolo do WS, tipos de evento, limites de replay/heartbeat | `packages/realtime-contracts/src/index.ts` |
| `@azy-board/assistant-contracts` | `Governance` + `DEFAULT_GOVERNANCE`/limites do agente, telas/snapshot do assistente | `packages/assistant-contracts/src/index.ts`, `assistantLimits.ts` |
| `@azy-board/ui-contracts` | Catálogo de ícones/cores/temas usados por API e web | `packages/ui-contracts/` |
| `@azy-board/tool-registry` | **Catálogo puro** de tools: definições, `inputSchema`, `routing` (domain/scope/operation/risk), policies, validação/coerção | `registry.ts` (728 l.), `fields.ts`, `policies.ts`, `validation.ts` (445 l.), `coercion.ts`, `duration.ts`, `limits.ts` |
| `@azy-board/tool-execution` | **Execução**: dispatcher `executeSharedTool` + adaptadores HTTP (`toolGetBoard`, `toolUpdateItem`, …) | `packages/tool-execution/src/registry.ts` (268 l.), `http-adapter.ts` (1089 l.) |
| `@azy-board/mcp-protocol` | Núcleo do servidor MCP (transporte-independente) | `packages/mcp-protocol/src/index.ts` (204 l.) |
| `@azy-board/types` | Re-export agregador dos contratos | `packages/types/src/index.ts` |

**Padrão estrutural importante:** dependências dos packages apontam sempre *para baixo* (app → aplicação compartilhada → catálogo), sem ciclos — isso é **verificado automaticamente** por `scripts/check-api-boundary.ts` (ver §8).

**Pipeline de qualidade** (scripts do `package.json` raiz): `bun run check` = `typecheck` + `lint` + `check:persistence` + `check:api-boundary` + `bun test --isolate` + `build`. Testes E2E em `e2e/` (Playwright: `regression.ts`, `visual.ts`, `journeys.ts`, `harness.ts`).

---

## 2. Camada de dados — ORM, migrações e os dois dialetos

### 2.1 Perfis de instalação (a chave de tudo)

`apps/api/src/db/installProfile.ts` resolve `AZYBOARD_INSTALL_PROFILE`:

| Perfil | Banco | Serviços | Runner |
|---|---|---|---|
| `SIMPLE` (default) | SQLite (`./dev.db`, ou `:memory:` quando `NODE_ENV=test`) | nenhum (zero-dependência) | `bun run db:migrate` → `apps/api/src/db/migrate.ts` |
| `ADVANCED` | PostgreSQL (`DATABASE_URL` obrigatório) | Redis/Valkey (`REDIS_URL` obrigatório) para coordenação | `bun run db:migrate:pg` → `apps/api/src/db/postgres/migrate.ts` |

A escolha é **permanente por instalação**: `apps/api/src/db/index.ts` lança `ADVANCED_DATABASE_ADAPTER_NOT_READY` se o perfil não for `SIMPLE`, e preflights de marcador (`apps/api/src/db/installationMarkers.ts`, `apps/api/src/db/sqlite/installationMarkers.ts`) impedem trocar de volume/perfil silenciosamente. Em `SIMPLE` há `PRAGMA journal_mode = WAL` e `foreign_keys = ON`.

### 2.2 Schema e migrações

- **Schema SQLite (fonte primária):** `apps/api/src/db/schema.ts` — 1247 linhas, ~60 tabelas (`sqliteTable` de `drizzle-orm/sqlite-core`), com FKs compostas `(tenant_id, id)`, índices únicos e `check`s.
- **Schema PostgreSQL (espelho):** `apps/api/src/db/postgres/schema.ts` — 886 linhas, `pgTable`; IDs continuam `TEXT` (UUIDs da aplicação) e timestamps `TEXT` UTC ISO para preservar contrato. A paridade entre os dois schemas é testada em `apps/api/src/db/postgres/parity.test.ts`.
- **Geração:** `drizzle-kit` com dois configs — `apps/api/drizzle.config.ts` (dialect `sqlite`, out `./src/db/migrations`) e `apps/api/drizzle.config.pg.ts` (dialect `postgresql`, out `./src/db/postgres/migrations`). Script `bun run db:generate`.
- **Migrações SQLite:** 58 arquivos `*.sql` em `apps/api/src/db/migrations/` (`0000_unified-item-model.sql` … `0057_export_mappings.sql` + `meta/`), aplicados pelo migrator do Drizzle com `foreign_keys = OFF` no início e `PRAGMA foreign_key_check` obrigatório antes de religar (verificação de integridade embutida em `apps/api/src/db/migrate.ts`).
- **Migrações PostgreSQL:** 34 arquivos `*.sql` em `apps/api/src/db/postgres/migrations/`, runner próprio em `apps/api/src/db/postgres/migrate.ts` — SQL bruto, ordenação lexical, uma transação por arquivo, histórico na tabela `schema_migrations`. A API **não** aplica migração no startup.

### 2.3 Composition root e ports (o padrão a copiar)

- **Interface dialect-independente:** `apps/api/src/persistence/ports.ts` (802 linhas) — `PersistencePorts` com operações por domínio (`identity`, `apiKeys`, `agent`, `idempotency`, `domainEvents`, `analytics`, …). Toda operação recebe `PersistenceContext = { tenantId, actorUserId, actorKind }` explícito (`apps/api/src/persistence/context.ts`).
- **Implementações:** `apps/api/src/db/sqlite/adapter.ts` (3480 l., Drizzle + `bun:sqlite`) e `apps/api/src/db/postgres/adapter.ts` (5301 l., `pg` Pool + SQL bruto). Não existe fallback silencioso: erro em `ADVANCED` é fatal.
- **Composition root:** `apps/api/src/persistence/runtime.ts` — carrega com `require()` **apenas** o dialect escolhido (importar rotas no perfil ADVANCED nunca abre SQLite), exporta `persistence`, `bootstrapRuntime()` (valida marcadores + coordenação antes de aceitar tráfego) e `closeRuntime()`.
- **Testes de migração/integridade:** `bun run test:migrations` (`apps/api/src/db/migration.test.ts`, `integrity.test.ts`, `timestamp.test.ts`).

> **Leitura para o dbmapper:** o dbmapper é "bun+react+sqlite". O padrão mínimo reaproveitável é *ports + composition root + adapter SQLite*, mantendo a possibilidade de plugar outro dialeto depois — sem necessidade de replicar o schema PG espelho desde o início.

---

## 3. Autenticação — mecanismo exato

**Resumo: cookie de sessão `session` HttpOnly contendo JWT HS256 (biblioteca `jose`) + senha com bcrypt custo 12; API Key Bearer `azb_...` hasheada com SHA-256 para agentes.**

| Aspecto | Detalhe | Caminho |
|---|---|---|
| Emissão de senha | `bcrypt.hash(password, 12)` / `bcrypt.compare` | `apps/api/src/services/auth.ts` (`hashPassword`, `verifyPassword`) |
| Token | `SignJWT`/`jwtVerify` HS256 com segredo `JWT_SECRET` (obrigatório em produção; default de dev `azy-board-dev-secret-change-in-production`) | `apps/api/src/services/auth.ts` (`signJwt`, `verifyJwt`) |
| Payload | `JwtPayload { sub, tenantId, email, role, globalGroup?, rmb?, authTime, iat, exp }` | `packages/api-contracts/src/index.ts` |
| Cookie | nome `SESSION_COOKIE = 'session'`, `httpOnly`, `sameSite: 'Strict'`, `secure` em produção; TTL padrão 24h (`SESSION_TTL`), "lembrar-me" 30d (`SESSION_REMEMBER_TTL`), limite absoluto 180d (`SESSION_MAX_TTL`); renovação deslizante em 50% do TTL e expiração absoluta por `authTime` | `apps/api/src/services/auth.ts` (`sessionCookieOptions`, `resolveSessionState`) |
| Rotas de login | `POST /api/auth/login`, `GET /api/auth/me`, `POST /api/auth/logout`, `GET /api/auth/providers` | `apps/api/src/routes/auth.ts` |
| OAuth integrado | Microsoft/Google com `state` + PKCE; envelope do fluxo assinado em HMAC-SHA256 no cookie `oauth_flow` (10 min); **nunca cria conta** — só vincula identidade externa | `apps/api/src/routes/auth.ts`, `apps/api/src/services/oauth.ts`, `apps/api/src/services/authConfig.ts` |
| Rate limiting | throttle por IP e por identidade antes de verificar a senha, com `Retry-After` e tabela `login_attempts` | `apps/api/src/services/loginThrottle.ts`, tabela em `apps/api/src/db/schema.ts` (l.106) |
| Middleware | `authMiddleware` (aceita JWT de cookie **ou** `Authorization: Bearer <api key>` — a chave é hasheada em SHA-256 e comparada com `api_keys.key_hash`); injeta `RequestContext` em `c.set('ctx')` | `apps/api/src/middleware/auth.ts` |
| RBAC por rota | `requireRole('ADMIN'\|'MEMBER'\|'VIEWER')` e `requireGlobalGroup('MANAGER'\|'ADMIN'\|'ROOT')` | `apps/api/src/middleware/auth.ts`; autorização por projeto em `apps/api/src/services/projectAuthorization.ts` |
| API Keys | prefixo `azb_` + 32 bytes aleatórios; hash SHA-256 armazenado; escopos `project_scope`/`permission_scope`, `expires_at`, `revoked_at`, `last_used_at` | geração em `apps/api/src/services/auth.ts` (`generateApiKey`), tabela `api_keys` em `apps/api/src/db/schema.ts` (l.123), rotas em `apps/api/src/routes/apiKeys.ts` |

Envelope de erro padronizado (usado por REST, MCP e agente): `{ error: { code, message, retryable, details } }` com sanitização de `password/secret/token/stack/sql` — `apps/api/src/middleware/errorResponse.ts`. As rotas `/api` aplicam ainda `agentResponseMiddleware`, que envolve respostas em `{ data, meta }` quando o cliente envia `Accept: application/vnd.azyboard.agent+json` (`apps/api/src/middleware/agentResponse.ts`).

---

## 4. Multi-usuário / RBAC / tenant

| Conceito | Como é modelado | Caminho |
|---|---|---|
| Tenant | tabela `tenants (id, name, slug)`; **toda** tabela de negócio carrega `tenant_id` com FK | `apps/api/src/db/schema.ts` (l.33) |
| Usuário | `users.tenant_id` FK + `password_hash` + `global_group` enum `TEAM_MEMBER/MANAGER/ADMIN/ROOT` + identidade externa opcional (`external_idp`, `external_subject`) | `apps/api/src/db/schema.ts` (l.44) |
| Identidade global | e-mail é único **globalmente** por índice `uniqueIndex(... on lower(email))`; a identidade é resolvida por e-mail canônico e o tenant vem do usuário encontrado | `apps/api/src/db/schema.ts` (l.72), `apps/api/src/routes/auth.ts` (l.90) |
| Hierarquia global | `GLOBAL_GROUP_LEVEL` (TEAM_MEMBER=1 … ROOT=4) com `hasGlobalGroup()` | `apps/api/src/services/auth.ts` (l.6–20) |
| Acesso a projeto | `memberships (tenant_id, project_id, user_id, role enum ADMIN/MEMBER/VIEWER)`, única por `(tenant, projeto, usuário)`; lookup **sempre** filtrando tenant + projeto (anti-IDOR por design) | `apps/api/src/db/schema.ts` (l.469), `apps/api/src/services/projectAuthorization.ts` |
| Contexto por requisição | `RequestContext { userId, tenantId, email, globalGroup }` injetado pelo middleware — handlers nunca confiam em valor do corpo | `packages/api-contracts/src/index.ts`, `apps/api/src/middleware/auth.ts` |
| Escopo de tools (MCP/agente) | cada tool tem policy `{ globalGroup mínimo, localRole opcional }` | `packages/tool-registry/src/policies.ts` |
| Garantia estrutural | FKs compostas `(tenant_id, id)` em tabelas filhas + índices únicos por tenant | `apps/api/src/db/schema.ts` (ex.: `memberships`, `users_tenant_id_id_unique`) |

> O dbmapper v2 (multi-usuário, provavelmente single-tenant) pode **simplificar** removendo `tenants`, mantendo o restante do desenho: `globalGroup` → papel único de usuário, `memberships` → papéis por projeto/recurso.

---

## 5. Servidor MCP (`apps/mcp`) e como o opencode conecta

### 5.1 Dois transportes, um mesmo núcleo

| Transporte | Entry | Autenticação | Caminho |
|---|---|---|---|
| **stdio** (client local) | `StdioServerTransport` do SDK | env `EASYBOARD_API_KEY` + `EASYBOARD_URL` (+ opcional `AZYBOARD_PROJECT_ID`); o adaptador faz `fetch` para a API REST com `Authorization: Bearer azb_...` | `apps/mcp/src/index.ts` (`makeApiCall`, `startStdioServer`); entrypoint nomeado `apps/mcp/mcp-server.ts` |
| **Streamable HTTP** (remoto, hospedado na API) | rota **`/mcp`** (fora de `/api`, porque o corpo é JSON-RPC) | `authMiddleware` por requisição — mesma API Key do REST; Owner/tenant/grupo/escopos resolvidos **no servidor** | `apps/api/src/routes/mcp.ts`, montagem em `apps/api/src/index.ts` (l.117) |

O transporte HTTP é **stateless com resposta JSON** (`sessionIdGenerator: undefined`, `enableJsonResponse: true`) — sem afinidade de sessão, escala horizontal sem sticky session; pode ser desligado com `AZYBOARD_MCP_HTTP_ENABLED=false` (`apps/api/src/routes/mcp.ts`, `isMcpHttpEnabled`).

Núcleo comum: `packages/mcp-protocol/src/index.ts`
- `createMcpServer(apiCall, options)` — handlers `ListTools`/`CallTool` do SDK;
- `handleMcpHttpRequest(request, apiCall, options)` — transporte Streamable HTTP;
- `parseApiResponse(res)` — converte o envelope REST/erro normalizado em resultado da tool (ou `ApiError` com `code/retryable/details`);
- **Defesa anti-forja:** `FORBIDDEN_ARGUMENT_KEYS = { tenantId, globalGroup, source, actorUserId, ownerId, apiKeyId, permissionScope, projectScope }` — argumentos com essas chaves são rejeitados (`MCP_IDENTITY_ARGUMENT_FORBIDDEN`);
- `withOptionalProjectId` — com `defaultProjectId`, o campo `projectId` vira opcional no schema.

### 5.2 Registro e execução de tools

| Camada | Papel | Caminho |
|---|---|---|
| Definição | `ToolDefinition { name, description, inputSchema, policy, namespace, routing, responseSchema }` + classificação `domain/scope/operation/risk` | `packages/tool-registry/src/registry.ts` |
| Catálogo de nomes/campos | `SHARED_TOOL_NAMES`, `toolFields`, `requiredFieldsFor`, `isRegisteredTool` | `packages/tool-registry/src/fields.ts` |
| Policies por tool | `MCP_TOOL_POLICIES` (read/write/admin) + `hasMcpPolicy()` | `packages/tool-registry/src/policies.ts` |
| Validação/coerção | `validateToolArguments`, `coerceArgumentsBySchema`, normalização de duração/limites | `packages/tool-registry/src/validation.ts`, `coercion.ts`, `duration.ts`, `limits.ts` |
| Execução | `executeSharedTool(name, args, { api, context, authorize })` + resolvers de entidade (`resolveProjectId` aceita UUID **ou** nome exato) | `packages/tool-execution/src/registry.ts` |
| Adaptador HTTP | ~100 funções `toolXxx` mapeando cada tool para chamadas REST | `packages/tool-execution/src/http-adapter.ts` |
| No agente | o mesmo catálogo é reaproveitado (`getSharedToolDefinitions`, `sanitizeToolOutput`) | `apps/api/src/services/assistantTools.ts` (re-export) |

### 5.3 Conexão do opencode (e de outros clients)

`opencode.json` na raiz configura três servidores:
- **`azy-board` (remote):** `"type": "remote"`, `url: .../mcp`, headers `Authorization: Bearer azb_...` e **`X-Azyboard-Project-Id`** (cabeçalho de contexto de sessão lido em `apps/api/src/routes/mcp.ts`, constante `MCP_PROJECT_HEADER`), `timeout: 30000`;
- **`azy-board-local` (local):** `"command": ["bun","run",".../apps/mcp/mcp-server.ts"]` com env `EASYBOARD_API_KEY`, `EASYBOARD_URL`, `AZYBOARD_PROJECT_ID` (hoje desabilitado);
- **`azy-board-prod` (remote):** mesmo formato para produção.

> ⚠️ O `opencode.json` commitado contém **API Keys reais em claro** e caminhos absolutos de outra máquina (`/home/jairo/Projetos/azyboard/...`). No dbmapper, usar `opencode.json.example` (que usa `{env:EASYBOARD_API_KEY}`) como modelo e nunca commitar segredos.

Complementos do client:
- **Skill oficial:** `skills/azyboard/SKILL.md` (+ `commands/` — `start.md`, `plan.md`, `complete.md`, `review.md`, `status.md`, `setup-mcp.md`… —, `references/mcp-setup.md`, `references/mcp-operations.md`, `scripts/connect-mcp.sh`). Regras centrais: nunca paralelizar chamadas MCP, descobrir o projeto antes de mutar, payloads JSON estritos, tratamento de erros por `retryable`.
- **Documentação de tools:** `docs/TOOLS-AZY-AGENT.md` — catálogo completo agrupado por domínio.
- **Verificação automática:** `bun run test:mcp-catalog` → `scripts/check-mcp-catalog.ts` confere que *todo* tool registrado está documentado, tem dispatcher no executor, tem `routing`/`policy` e campos obrigatórios coerentes.

---

## 6. Agente embutido (Azy Agent)

### 6.1 Onde vive o código

| Módulo | Papel | Caminho |
|---|---|---|
| Harness (loop + aprovação) | `AssistantHarness` (l.226), system prompt `AZY_AGENT_SYSTEM_PROMPT` (l.45), `approvalPreview`, `canonicalArguments`, `operationHash`, `approve`/`reject`/`executeApproved` | `apps/api/src/services/assistantHarness.ts` (836 l.) |
| Executor de run | orquestra provider + tools + governança, revalida população da prévia | `apps/api/src/services/assistantRunExecutor.ts` (233 l.) |
| Worker/fila | consome a job queue, claim com lease/heartbeat/fencing, abort cooperativo | `apps/api/src/services/agentWorker.ts`, `agentJobQueue.ts` |
| Rotas HTTP | conversas, mensagens, SSE de eventos, aprovação, ajuste, cancelamento, config ROOT (provider/modelos/governança) | `apps/api/src/routes/assistant.ts` (992 l.), montada em `/api/assistant` (`apps/api/src/index.ts` l.150) |
| UI | gaveta de chat com preview markdown + botões Aprovar/Rejeitar/Ajustar | `apps/web/src/components/AzyAgentDrawer.tsx` (aprovação em l.327–428, botões em l.541–560) |

### 6.2 Integração com LLM

- Interface `ModelProvider { createRun, streamRun, cancelRun?, capabilities }` — `apps/api/src/services/openaiProvider.ts` (usa o SDK oficial `openai`, timeout 10 s, `maxOutputTokens` 2048, retry 2).
- Implementações: `OpenAIProvider` (default), `OpenRouterProvider` (`apps/api/src/services/openrouterProvider.ts`), `FallbackModelProvider` (`apps/api/src/services/fallbackModelProvider.ts`) e `TestModelProvider` (stub determinístico, **proibido em produção** — `TEST_PROVIDER_FORBIDDEN_IN_PRODUCTION`).
- Fábrica: `createAssistantProvider()` em `apps/api/src/services/assistantProvider.ts` (flag `AZY_AGENT_PROVIDER=stub` só fora de produção).
- Modelos e chaves **por tenant**: tabelas `assistant_model_configs` e `assistant_credentials` (segredo cifrado com AES-GCM, chave de `ASSISTANT_ENCRYPTION_KEY`) — `apps/api/src/services/assistantEncryption.ts`; administração em `/api/assistant/root/*` restrita a `requireGlobalGroup('ROOT')`.
- Governança/limites (`Governance`, `DEFAULT_GOVERNANCE`: `maxSteps`, `maxToolCalls`, tokens, `dailyBudgetMicros`, concorrência) — **fonte única** em `packages/assistant-contracts/src/assistantLimits.ts`, consumida por API, frontend e docs.

### 6.3 Contrato de tools do agente

Reusa o **mesmo catálogo** do MCP (`getSharedToolDefinitions`) com três filtros extras: `authorizeAssistantTool()` (`apps/api/src/routes/assistant.ts` l.53) revalida policy por contexto (inclusive membership/papel do projeto), `assertHumanContext()` exige identidade preenchida (`packages/tool-execution/src/registry.ts`), e tools de **UI** (`set_board_filters`, `open_item`, `explain_item_visibility`…) só mudam a tela do usuário, nunca dados — `apps/api/src/services/assistantUiTools.ts`. O system prompt instrui que *mutações exigem aprovação humana* e que a aplicação mostra a prévia após a chamada da tool.

### 6.4 Fluxo de aprovação de mutações (preview → aprovação → execução)

1. **Prévia:** o harness gera `approvalPreview(name, args, context, …)` (`assistantHarness.ts` l.720) a partir do payload **canonicalizado** (`canonicalArguments`) e persiste uma linha em `assistant_approvals` com `preview_json`, `operation_hash`, `expires_at = agora + 15 min` e status `PENDING` (l.471–473); a run passa a `WAITING_APPROVAL` e o evento `APPROVAL_REQUIRED` entra em `assistant_events`.
2. **Decisão do humano:** UI mostra o preview (markdown) em `AzyAgentDrawer.tsx`; `POST /api/assistant/runs/:runId/approval` (`routes/assistant.ts` l.930) chama `harness.approve/reject` — transação **CAS por (run, operationHash, status='PENDING')**, com validação de expiração (`APPROVAL_EXPIRED`) e evento único `APPROVAL_DECIDED` (`assistantHarness.ts` l.520–555).
3. **Execução:** o run volta para a fila (`status: QUEUED`) e o **worker** o consome; `executeApproved` rebusca a aprovação `APPROVED`, compara `operationHash` do payload atual com o aprovado (`APPROVAL_OPERATION_CHANGED` se divergir) e só então chama a tool (`assistantHarness.ts` l.568–592). Caminho alternativo: `POST /runs/:runId/adjust` (l.953) cancela a aprovação e re-gera prévia com instrução do usuário.
4. **Idempotência:** mutações carregam `Idempotency-Key` (repassado também pelo header `Idempotency-Key` do MCP, `MCP_IDEMPOTENCY_HEADER`), com tabela `idempotency_records` retida por 24 h.

### 6.5 Audit trail

| Registro | Conteúdo | Caminho |
|---|---|---|
| Eventos da run | enum de 11 tipos (`RUN_CREATED`, `RUN_STARTED`, `TEXT_DELTA`, `TOOL_STARTED`, `TOOL_COMPLETED`, `QUESTION`, `APPROVAL_REQUIRED`, `APPROVAL_DECIDED`, `RUN_FAILED`, `RUN_CANCELLED`, `RUN_COMPLETED`) com `sequence` única por run | tabela `assistant_events`, `apps/api/src/db/schema.ts` l.267 |
| Tool calls | `tool_name`, `risk_level` (READ…DESTRUCTIVE), `status`, `arguments_json`, `operation_hash`, `idempotency_key`, timestamps | `assistant_tool_calls`, l.277 |
| Aprovações | `preview_json`, `operation_hash`, `status`, `decided_by`, `decided_at`, `expires_at` | `assistant_approvals`, l.293 |
| Ações no board | `actor_type` (`HUMAN`/`AGENT`/`SYSTEM`), `actor_label`, `source` (`REST`/`MCP`/`SYSTEM`) nos logs de trabalho | `item_logs`, l.753 |
| Eventos de item | `actor_id`, `origin`, `correlation_id`, `before_snapshot`/`after_snapshot` por mutação | `item_events`, l.893 |
| API Keys | `last_used_at`, escopos, revogação | `api_keys`, l.123 |
| Política | classificação, retenção (90 d conversas, 30 d runs, 180 d auditoria), redação proibida de secrets/prompts/PII, `tenant_id` obrigatório em toda leitura/job | `docs/AI_AGENT_DATA_POLICY.md` |

Observabilidade do agente: métricas OTel (`agent.run.steps`, `agent.run.input_tokens`, `agent.run.cost_micros`, `agent.worker.*`) em `assistantHarness.ts` e `agentWorker.ts`.

---

## 7. Realtime (WebSocket) — e se é essencial

**Servidor:** WebSocket nativo do Bun montado no mesmo `serve()` da API — upgrade em `apps/api/src/index.ts` l.226–271. Autenticação no handshake lendo o cookie `session` e chamando `verifyJwt` + `authorizeProjectSubscription` (`apps/api/src/services/wsAuthorization.ts`); sem `projectId` na query, 400. Salas por **tenant+projeto** (`ProjectRoom`), heartbeat, métricas de gap/lag/dedup e **replay com sequência durável** vinda da outbox de domínio (`apps/api/src/services/websocket.ts`, 538 l.; `apps/api/src/services/domainEventDispatcher.ts`; tabela `domain_event_outbox`, l.352). Contratos de versão/eventos: `packages/realtime-contracts/src/index.ts`.

**Cliente web:** `apps/web/src/hooks/useWebSocket.ts` (IO, reconexão com backoff exponencial até 30 s, detecção de conexão zumbi) + `apps/web/src/lib/realtimeSession.ts` (máquina de estados de cursor/buffer de lacunas/barreira de refetch, testável sem DOM).

**Importante:** os eventos do Azy Agent **não** usam o WS — chegam por **SSE** em `GET /api/assistant/runs/:runId/events` (`apps/api/src/routes/assistant.ts`, resposta `text/event-stream`).

**É essencial?** Para o dbmapper v2, **não**. O WS resolve multiusuário editando o mesmo board simultaneamente com reação instantânea + replay pós-desconexão; é a parte mais complexa do sistema (outbox, watermarks, resync, protocolo versionado). Recomendação: começar com refetch/polling (ou apenas SSE para os eventos do agente) e adotar o padrão de `realtime-contracts` + `RealtimeSession` apenas se o dbmapper tiver edição colaborativa simultânea.

---

## 8. Padrões de teste e verificações de fronteira

| Verificação | O que faz | Caminho |
|---|---|---|
| `bun run check` | gate completo: `typecheck` → `lint` → `check:persistence` → `check:api-boundary` → `bun test --isolate` → `build` | `package.json` raiz |
| `check:persistence` | varre `apps/api/src/routes` e `apps/api/src/services` e **proíbe** imports de `db/schema`, `db/index`, `/db` e `drizzle-orm` (allowlist de 2 arquivos de métricas); força o SQL a ficar nos adapters | `scripts/check-persistence-boundaries.ts` |
| `check:api-boundary` | (a) proíbe a API importar `apps/mcp`/`@azy-board/mcp` (exceto o neutro `mcp-protocol`); (b) proíbe `packages/**` importarem `apps/**`, `hono`, `drizzle-orm` ou `@modelcontextprotocol`; (c) detecta ciclos entre packages workspace | `scripts/check-api-boundary.ts` |
| `test:mcp-catalog` | catálogo registrado × documentação × dispatcher × campos obrigatórios × policies | `scripts/check-mcp-catalog.ts` |
| `test:migrations` | migração, integridade referencial e timestamps | `apps/api/src/db/{migration,integrity,timestamp}.test.ts` |
| `test:integration` | fluxos de negócio ponta-a-ponta em SQLite **em memória** (nunca toca `dev.db`) | `apps/api/src/integration.test.ts` |
| Testes unitários | colocados junto ao código (`*.test.ts`), incluindo contratos estruturais (ex.: `packages/tool-registry/src/registry-contract.test.ts`) | `apps/api/src/**`, `packages/**`, `apps/web/src/**` |
| E2E/visual | Playwright com captura de tela e regressão visual | `e2e/regression.ts`, `e2e/visual.ts`, `e2e/journeys.ts` |
| Smoke/evals | smoke HTTP contra app local publicada; evals do agente com gate | `scripts/smoke.ts`, `scripts/evals.ts`, `scripts/evalGate.ts` |
| Documentação do processo | níveis de teste, regras ("testes não usam banco persistente") | `TESTING.md` |

O que torna o projeto "à prova de refactor": **as duas verificações de fronteira são scripts de arquivo que falham o build** quando alguém importa o dialeto errado ou cria um ciclo de dependência — barato de adaptar ao dbmapper e de alto valor.

---

## 9. Mapa de reaproveitamento para o dbmapper v2

Legenda de ação: **Copiar** = usar quase literalmente; **Adaptar** = mesma estrutura, domínio trocado; **Simplificar** = pegar o padrão e reduzir.

| Necessidade do dbmapper | Origem (azyboard) | Caminhos exatos | O que adaptar |
|---|---|---|---|
| **Auth** (login, sessão, senha) | JWT HS256 em cookie HttpOnly + bcrypt 12 + throttle | `apps/api/src/services/auth.ts` · `apps/api/src/routes/auth.ts` · `apps/api/src/middleware/auth.ts` · `apps/api/src/services/loginThrottle.ts` · contrato `JwtPayload`/`RequestContext` em `packages/api-contracts/src/index.ts` | **Copiar/Adaptar.** Manter cookie `session`, TTL com rolagem (`resolveSessionState`), `passwordPolicy` (`apps/api/src/services/passwordPolicy.ts`). Remover: OAuth Microsoft/Google (ou deixar para depois), API Keys *só se* o MCP for remoto — para MCP local via stdio a API Key continua útil. |
| **Multi-usuário / RBAC** | tenant + grupo global + membership por projeto | `apps/api/src/db/schema.ts` (l.33 `tenants`, l.44 `users`, l.469 `memberships`) · `apps/api/src/services/projectAuthorization.ts` · `apps/api/src/services/authorization.ts` · `requireRole`/`requireGlobalGroup` em `apps/api/src/middleware/auth.ts` | **Simplificar.** Single-tenant: eliminar `tenants` e as FKs compostas `(tenant_id, id)`; manter `users` + papel global + `memberships` por recurso, mantendo o hábito de *toda* consulta filtrar o escopo. |
| **Camada de dados (dual-dialect / SQLite)** | ports + composition root + adapter | `apps/api/src/db/installProfile.ts` · `apps/api/src/persistence/ports.ts` · `apps/api/src/persistence/context.ts` · `apps/api/src/persistence/runtime.ts` · `apps/api/src/db/index.ts` · `apps/api/src/db/sqlite/adapter.ts` · `apps/api/src/db/sqlite/atomicTransaction.ts` · `apps/api/src/db/migrate.ts` | **Adaptar.** Começar só com o perfil SIMPLE: `drizzle.config.ts` + `src/db/schema.ts` + `db:migrate`. Manter a fronteira (rotas nunca importam Drizzle) para que plugar PostgreSQL depois não exija reescrever serviços. Se não quiser Drizzle, manter a ideia de *ports* + `PersistenceContext`. |
| **Migrações e integridade** | migrações SQL versionadas + checagem de FK + testes | `apps/api/src/db/migrations/` (58 arquivos) · `apps/api/src/db/migrate.ts` · `apps/api/src/db/integrity.ts` · `apps/api/src/db/migration.test.ts` | **Copiar o padrão** (migração explícita no startup de CLI, nunca implícita no boot da API; `foreign_key_check` obrigatório). |
| **Server MCP + opencode** | núcleo protocolo + adaptadores stdio/HTTP | `packages/mcp-protocol/src/index.ts` · `apps/mcp/src/index.ts` · `apps/mcp/mcp-server.ts` · `apps/api/src/routes/mcp.ts` · `opencode.json.example` · `skills/azyboard/` · `docs/TOOLS-AZY-AGENT.md` · `scripts/check-mcp-catalog.ts` | **Adaptar.** Reaproveitar `createMcpServer`/`handleMcpHttpRequest`/`parseApiResponse`/`FORBIDDEN_ARGUMENT_KEYS` trocando o `ApiCall` pelos endpoints do dbmapper. Manter os dois transportes (stdio p/ dev, `/mcp` remoto p/ produção) e o cabeçalho de projeto. |
| **Tool registry (catálogo)** | definição + policy + validação por tool | `packages/tool-registry/src/registry.ts` · `fields.ts` · `policies.ts` · `validation.ts` · `coercion.ts` · `limits.ts` | **Adaptar.** Reestruturar o domínio (tabelas, colunas, consultas, migrações…) mantendo os tipos `ToolDefinition`, `ToolRisk`, `McpPolicy` e o padrão "schema estrito + `additionalProperties: false` + coerção antes da validação". |
| **Tool execution** | dispatcher + adaptadores HTTP + resolvers | `packages/tool-execution/src/registry.ts` (`executeSharedTool`, `assertHumanContext`, `resolveProjectId`) · `http-adapter.ts` | **Adaptar.** Um adaptador por endpoint REST do dbmapper; manter resolvers que aceitam ID **ou** nome exato e recusam ambiguidade (`AMBIGUOUS_*`). |
| **Agente + aprovação de mutações** | harness com preview, hash de operação e CAS | `apps/api/src/services/assistantHarness.ts` (`approvalPreview`, `operationHash`, `approve`/`reject`, `executeApproved`) · `assistantRunExecutor.ts` · `agentJobQueue.ts` · `agentWorker.ts` · rotas em `apps/api/src/routes/assistant.ts` (l.930 aprovação, l.953 ajuste) · UI em `apps/web/src/components/AzyAgentDrawer.tsx` · limites em `packages/assistant-contracts/src/assistantLimits.ts` | **Copiar/Adaptar.** Núcleo transferível: *tool de mutação → persistir preview + `operationHash` com expiração → `WAITING_APPROVAL` → decisão CAS → revalidar hash na execução → fila com lease*. Reduzir o system prompt ao domínio do dbmapper e manter a regra "mutação sempre passa por aprovação". |
| **Provider LLM** | interface de provider + fallback + credenciais cifradas | `apps/api/src/services/openaiProvider.ts` · `assistantProvider.ts` · `fallbackModelProvider.ts` · `assistantEncryption.ts` (AES-GCM) · `assistantCredentials`/`assistantModelConfigs` em `apps/api/src/db/schema.ts` (l.145–209) | **Copiar.** Já é genérico (OpenAI + OpenRouter + stub de teste proibido em produção). |
| **Contracts / envelope de erro** | contrato único de erro e contexto | `packages/api-contracts/src/index.ts` (`ApiErrorPayload`, `JwtPayload`) · `apps/api/src/middleware/errorResponse.ts` (sanitização) · `apps/api/src/middleware/agentResponse.ts` (`Accept: application/vnd...+json`) | **Copiar.** O envelope `{ error: { code, message, retryable, details } }` + sanitização vale para REST, MCP e agente do dbmapper. |
| **Validação de entrada** | Zod strict + parse helper + OpenAPI | `apps/api/src/validation.ts` (554 l., `parseJson`, `loginSchema`, `openApiDocument()`) | **Adaptar.** Padrão: schemas `.strict()`, normalização de entrada vazia → `null`, OpenAPI gerado dos schemas. |
| **Boundary checks** | scripts que falham o build | `scripts/check-persistence-boundaries.ts` · `scripts/check-api-boundary.ts` · gate `bun run check` no `package.json` | **Copiar.** Trocar alvos por `apps/dbmapper/src/{routes,services}` e as regras de import proibido. |
| **Realtime** | WS por sala + replay | `packages/realtime-contracts/src/index.ts` · `apps/api/src/services/websocket.ts` · `apps/web/src/hooks/useWebSocket.ts` · `apps/web/src/lib/realtimeSession.ts` | **Adiar.** Não essencial no v1; se precisar, copiar a separação "contrato puro + estado testável + IO no hook". |
| **Skills / docs do agente** | skill de operação + catálogo documentado | `skills/azyboard/SKILL.md` (+ `commands/`, `references/`) · `docs/TOOLS-AZY-AGENT.md` · `scripts/check-agent-skill.ts` · `docs/AI_AGENT_DATA_POLICY.md` | **Adaptar.** Reutilizar a estrutura da skill (fluxo obrigatório, regras de segurança, payloads leves) e a política de dados como base da política do dbmapper. |

### Riscos/pegadinhas ao reaproveitar

1. **`opencode.json` commitado tem API Keys reais e caminhos absolutos de outra máquina** — usar `opencode.json.example` como modelo e nunca copiar segredos.
2. O dbmapper é **single-tenant**; a maior parte do código azyboard é recortada por `tenant_id` (FKs compostas, índices únicos, escopos). Ao remover o tenant, revogar *todas* as cláusulas — deixar uma pela metade quebra invariantes de unicidade.
3. `apps/api/src/db/index.ts` e `migrate.ts` **recusam** qualquer perfil que não seja `SIMPLE`; não copiar trechos de um dialect para o outro sem entender os preflights (`installationMarkers`).
4. Os limites do agente (`GOVERNANCE`) são fonte única em `packages/assistant-contracts/src/assistantLimits.ts` — não duplicar em docs/UI (o projeto tem até gerador de docs a partir daí).
5. Fronteiras são verificadas por regex: ao copiar padrões, copiar **também** os scripts de checagem, senão a garantia se perde silenciosamente.
