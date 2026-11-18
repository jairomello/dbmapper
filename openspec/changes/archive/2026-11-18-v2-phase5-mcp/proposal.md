# Proposal

## Why

Fases 0–4 entregaram o dicionário utilizável com agente interno, mas ele ainda não é a "ferramenta sempre conectada" aprovada em §8.7: o opencode não consegue ler o mapa do que falta nem escrever descrições enquanto trabalha na codebase do sistema alvo. Esta fase abre isso — servidor MCP, API keys, skill oficial e o teste ponta-a-ponta com opencode conectado.

## What Changes

- **API keys**: tabela `api_keys` (`dbmp_`, hash SHA-256, prefixo de exibição, escopo opcional de projeto, expiração, revogação, `last_used_at`) + rotas `POST/GET/DELETE /api/keys` (chaves próprias, `MEMBER`+); texto puro retornado uma única vez.
- **Autenticação Bearer**: `Authorization: Bearer *** autentica como dono da chave (mesmo papel do dono) apenas na superfície MCP (leitura/export de projeto, rotas do agente, escrita de descrição de item); login/logout/me e administração de usuários continuam só com sessão; identidade vem sempre do servidor.
- **Endpoint de descrição por item**: `PATCH /api/projects/:id/items/:type/:itemId/description` grava `description` (fonte derivada da credencial: `mcp` ou `human`), reabre revisão se aprovado e registra evento de auditoria — o back-end REST do tool `set_description`.
- **Servidor MCP stdio** (`apps/mcp`, `@modelcontextprotocol/sdk`): 9 tools — `get_project_overview`, `list_missing_descriptions`, `get_table`, `get_column`, `set_description`, `list_suggestions`, `apply_suggestion`, `reject_suggestion`, `get_export` — chamando a REST com a chave; envelopes de erro convertidos em erro de tool MCP.
- **Guarda de catálogo**: `bun run test:mcp-catalog` (`scripts/check-mcp-catalog.ts`) ligado ao `bun run check`: todo tool registrado está documentado em `docs/TOOLS-DBMAPPER.md`, tem dispatcher e schema válido, e não aceita argumentos de identidade.
- **Skill + config exemplo**: `skills/dbmapper/SKILL.md` (adaptada da azyboard) e `opencode.json.example` (só `{env:...}`; `/opencode.json` no `.gitignore`).
- **Docs**: catálogo de tools, seção MCP no README, variáveis do adaptador no `.env.example`, seção aditiva no AGENTS.md.

## Capabilities

### New Capabilities

- `api-keys`: emissão, listagem, revogação e autenticação Bearer das chaves por usuário, com escopo opcional de projeto.
- `mcp-server`: servidor stdio, catálogo dos 9 tools, mapeamento de erros, guarda de catálogo, skill e config exemplo.

### Modified Capabilities

- `auth`: proteção de rotas passa a aceitar sessão **ou** API key na superfície MCP; rotas de sessão pura rejeitam chave.
- `project-api`: novo requisito de atualização de descrição por item (fonte derivada da credencial, reabertura de revisão, evento).

## Impact

- **API**: `api_keys` + migração; middleware de credencial (session|Bearer); rotas de chaves; endpoint de descrição por item; eventos `api_key.*` e `item.description_written`.
- **MCP**: `apps/mcp` de stub para servidor real (SDK, catálogo, adaptador REST) — nova dependência `@modelcontextprotocol/sdk`.
- **Repo**: `scripts/check-mcp-catalog.ts`, root `package.json` (`test:mcp-catalog` no `check`), `skills/`, `docs/TOOLS-DBMAPPER.md`, `opencode.json.example`, `.gitignore`.
- **`legacy/` intocado**; sem dependências novas fora do SDK do MCP.

## Non-goals

Transporte HTTP `/mcp` (Fase 6); UI de gestão de chaves (API + docs); escopos granulares por tool (só escopo de projeto); rotação automática de chaves; recursos/prompts do MCP (só tools); multi-tenant; comandos de skill além do `SKILL.md` principal.
