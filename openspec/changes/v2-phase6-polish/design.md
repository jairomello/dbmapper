# Design — v2-phase6-polish

## Context

A infra de auditoria já existe: `insertEventRow` no adapter SQLite, parâmetro `audit` nas portas (usado por `keys`, `item.description` e `agent`), tabela `events` com índice `(project_id, created_at)` desde a Fase 4. **Lacuna real:** das ~18 rotas mutantes, só keys/item/agent auditan — `routes/projects.ts` (criar/salvar/importar) e `routes/users.ts` (criar/papel) não passam `audit`; `replaceModel` já aceita `options.audit` e é só plugá-lo.

Na web: rotas em `App.tsx` com `RequireSession`/`RequireProject`; `SemanticTree` é puramente display+seleção (`onSelect`) e `StatusBar` é display — reuso seguro para uma página read-only. O endpoint `GET /api/projects/:id/export` (contrato v1) é a fonte do viewer.

Referências de deploy: azyboard tem `docker/Dockerfile*`, `docker-compose.*`, `docker/entrypoint-api.sh`, templates nginx/Caddy e docs `DEPLOY*.md` (produção real) — adaptar single-tenant, **sem copiar segredos/caminhos daquela máquina**. **Docker não existe nesta VM** (`docker: comando não encontrado`).

## Goals / Non-Goals

**Goals:** rota viewer sem nenhuma mutação; cobertura total de eventos + consulta ADMIN (API e UI); artefatos de deploy reproduzíveis e documentados para labapps → Vultr.

**Non-goals:** `/mcp` HTTP, PostgreSQL, links públicos sem sessão, paginação de auditoria, CI/CD.

## Decisions

### 1. Cobertura de eventos — matriz e taxonomia

| Rota | Action | Payload mínimo |
|---|---|---|
| `POST /api/projects` | `project.created` | projectId, name |
| `PUT /api/projects/:id` | `project.saved` | projectId, counts (tabelas/colunas) |
| `POST /api/projects/import` | `project.imported` | projectId, name |
| `POST /api/projects/:id/imports/apply` | `model.import_applied` | projectId, resumo do plano |
| `POST /api/users` | `user.created` | userId, email, role |
| `PATCH /api/users/:id` | `user.role_changed` | userId, role old→new |

Já existentes (mantidos): `item.description_written`, `agent.generate_requested|suggestions_applied|suggestions_edited|suggestions_rejected`, `api_key.created|api_key.revoked`.

- **Fora da auditoria (decisão):** login/logout (a trilha de segurança é o `login_attempts`), leituras e `imports/preview` (não muta).
- Implementação: as rotas passam `audit` no padrão já usado por `keys.ts`; evento na mesma transação — mutação que falha não audita (cenario da spec).
- A task 1.1 começa com uma **matriz das rotas mutantes** (grep `app.post|put|patch|delete`) e a implementação cobre a lista inteira — a spec exige teste tabela-Driven cobrindo cada rota.

### 2. `GET /api/events` (consulta)

- Guarda global de sessão + `requireAdmin` na rota; parâmetros zod: `action` (prefixo), `projectId`, `limit` (default 100, max 500); resposta `{ events: [...] }` newest-first com `actorEmail` resolvido (join `users`).
- Porta nova `listEvents(filters)` no `Persistence` + impl SQLite (select + join, ordenação `created_at DESC, rowid DESC`).
- Escala: endpoint com cap + índices existentes; paginação é non-goal (risco aceito e documentado).

### 3. Rota viewer (`/viewer/:id`)

- Nova rota em `App.tsx` **dentro de `RequireSession` mas fora de `RequireProject`** (viewer não edita; qualquer papel serve).
- `ViewerPage` (novo, `apps/web/src/pages/`): busca `GET export` via client tipado → estado loading/404 amigável (link p/ galeria)/vazio.
- Composição: campo de busca (filtra o modelo no cliente antes de passar à árvore), `SemanticTree` em reuso puro, `StatusBar` (display), novo `ViewerDetail` (descrição, termos, badge de fonte humano/IA/MCP + "revisar", tudo em texto — sem textarea/botões).
- **Regra de ferro:** a página não usa nenhuma mutation hook do React Query — só `useQuery`; teste espiona `fetch` e exige só GETs.
- Entry points: link "Somente leitura" no card da galeria + link no header do workspace → `/viewer/:id`.

### 4. UI de auditoria (`/audit`)

- Guard `RequireAdmin` (novo componente de rota; papel vem do `GET /api/auth/me` já existente) — MEMBER/VIEWER redirecionado para a galeria.
- `AuditPage`: React Query em `GET /api/events`; tabela ator/ação/assunto/quando; select de família de ação (`project.`, `model.`, `user.`, `item.`, `agent.`, `api_key.`) mapeado para o filtro `action` prefixo; empty state PT-BR.

### 5. Artefatos de deploy (adaptados do azyboard, single-tenant)

```
docker/
  Dockerfile.api       # oven/bun → deps frozen → apps/api start
  Dockerfile.web       # stage bun build (vite) → nginx:alpine servindo dist
                       #   + proxy /api/ e /health → api:3000 (template nginx do azy)
  docker-compose.yml   # api (volume data:/data, DATABASE_URL=/data/dbmapper.db,
                       #   JWT_SECRET do .env) + web (80/443)
  entrypoint-api.sh    # db:migrate (+ db:seed se DBMAPPER_ADMIN_PASSWORD setado) → start
  .dockerignore        # node_modules, .git, *.db, .env
docs/DEPLOY.md         # notebook (dev) → labapps (compose) → Vultr (jairo.tools)
                       #   + checklist produção + rollback
```

- `.env` de produção **nunca** commitado; compose lê do `.env` na máquina alvo.
- README ganha seção "Deploy"; AGENTS.md ganha seção aditiva com os comandos docker.

### 6. Limitação de verificação (declarada)

Sem Docker nesta VM: verificação local = `python3 -c 'yaml.safe_load'` no compose, existência de todos os paths/scripts referenciados, grep de segredos literais e revisão dos Dockerfiles. O `docker build` + `docker compose up` são o **passo de deploy** (Jairo, em labapps) e ficam documentados passo a passo em `docs/DEPLOY.md`.

### 7. E2E

`e2e/smoke.ts` ganha passo após o fluxo atual: abrir `/viewer/:id` do projeto smoke, exigir dados visíveis (árvore com `users`) e ausência de controles de mutação (nenhum botão Salvar/Aprovar) — capturando as requisições da página e garantindo que só `GET` saiu.

## Risks / Trade-offs

- **Viewer duplica parte do workspace** — aceito: superfície independente e pequena, sem risco de regressão no editor (specs do editor intocadas).
- **Volume de eventos** — cap no endpoint + índices existentes; paginação fica para o backlog.
- **Docker não testado aqui** — mitigado por padrões já usados em produção no azyboard + validação de YAML/paths/secrets localmente.
- **Cobertura de auditoria depende de discipline futura** — o teste tabela-Driven da task 1.1 falha quando uma rota mutante nova nasce sem evento.

## Migration Plan

Sem mudança de schema: `events` e índices existem desde a Fase 4/5. Steps: (1) nenhuma migração necessária para o código desta fase; (2) se o teste de cobertura indicar necessidade de índice adicional em `events(created_at)` para a listagem global, gerar via `bun run db:generate` (migração aditiva) antes do push — decisão tomada na task 1.1; (3) deploy roda `db:migrate` no entrypoint (idempotente); (4) rollback = voltar a imagem anterior (dados de auditoria permanecem; migrações são aditivas).
