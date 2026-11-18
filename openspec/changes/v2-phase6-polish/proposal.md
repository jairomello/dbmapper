# Proposal

## Why

Fases 0–5 entregaram o produto (editor multi-usuário, agente interno, MCP). Faltam os itens de polish aprovados em §7/§8 para uso real: consumir o dicionário sem risco de edição (DBViewer como rota read-only), fechar a auditoria de **todas** as mutações com superfície de consulta, e os artefatos de deploy (notebook → labapps → Vultr `jairo.tools`).

## What Changes

- **Rota DBViewer read-only**: `/viewer/:id` na web app, alimentada por `GET /api/projects/:id/export` (contrato v1), reusando `SemanticTree`/`StatusBar` em visualização, busca no cliente e painel de detalhe **sem** controles de mutação; qualquer papel autenticado; a rota emite apenas GETs.
- **Auditoria completa**: eventos `events` em toda rota mutante — lacunas hoje: projeto criar/salvar/importar (JSON e apply de SQL) e usuários (criar/mudança de papel); convenção `project.*`, `model.*`, `user.*` somada às famílias já existentes `item.*`, `agent.*`, `api_key.*`; evento na mesma transação da mutação (rollback não audita).
- **Consulta de auditoria**: `GET /api/events` (ADMIN, filtros por prefixo de ação/projeto/limite, ator resolvido) + página `/audit` na web (ADMIN): ator, ação, assunto, quando.
- **Deploy**: `Dockerfile.api`, `Dockerfile.web` (nginx), `docker-compose.yml` com volume SQLite, entrypoint com migrate/seed opcional, `.dockerignore` e `docs/DEPLOY.md` (labapps → Vultr) + checklist de produção; padrões adaptados do azyboard, sem segredos copiados.
- **E2E**: smoke cobre o viewer read-only.

## Capabilities

### New Capabilities

- `project-viewer`: a rota read-only do dicionário — dados do export v1, superfície sem mutação, transparência de revisão/fonte.
- `audit-log`: auditoria completa e append-only de toda mutação, com consulta ADMIN via API e UI.

### Modified Capabilities

_None._

## Impact

- **Web**: rotas `/viewer/:id` e `/audit` + entry points na galeria/workspace.
- **API**: `GET /api/events` + preenchimento de eventos nas rotas mutantes (padrão `audit` já existente).
- **Repo**: `docker/` (Dockerfiles, compose, entrypoint, .dockerignore), `docs/DEPLOY.md`, README/AGENTS aditivos.
- **`legacy/` intocado**; sem dependências novas. Docker **não existe nesta VM** — o build real será validado no ambiente de deploy (documentado em `docs/DEPLOY.md`).

## Non-goals

Transporte HTTP `/mcp` e preparação PostgreSQL (opcionais do roadmap — fora desta fase); links públicos de compartilhamento sem sessão; paginação/filtros avançados de auditoria; CI/CD; backlog §10 (desenhador ER, versionamento do modelo, JSON no repositório do sistema).
