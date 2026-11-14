# Proposta de evolução — DBMapper v2 (servidor, multi-usuário, agêntico)

- **Data:** 2026-11-14
- **Status:** proposta para aprovação do Jairo — nada implementado ainda.
- **Base:** [`01-analise-dbmapper-v1.md`](./01-analise-dbmapper-v1.md) (codebase atual) e [`02-analise-azyboard-reaproveitamento.md`](./02-analise-azyboard-reaproveitamento.md) (padrões reaproveitáveis do Azy Board).
- **Stack pedida:** Bun + React + SQLite (evoluindo para PostgreSQL depois).

---

## 1. Resumo executivo

Hoje o DBMapper é um app estático que funciona bem, mas é **manual**: descrições são escritas à mão uma a uma, o estado vive só na aba do navegador (salvar = exportar JSON na mão), não há usuários, nem histórico, nem inteligência. O v2 vira um **servidor multi-usuário com agente embutido e MCP**, mantendo o que já é bom:

| Manter do v1 (já funciona) | Mudar no v2 |
|---|---|
| Parser de SQL e wizard de diff (`app.js`) | Persistência server-side (SQLite), histórico de importações |
| Contrato JSON do dicionário | Vira schema de banco + continua sendo formato de export |
| Workflow de revisão: `sem desc → revisar → aprovado` com gate por descrição | Ganha **autor, data, fonte (humano/IA) e auditoria** |
| Specs OpenSpec + 5 testes executáveis | Viram critérios de aceitação da UI React e da API |

**O ganho central:** em vez de escrever descrição na mão, o Jairo (ou o opencode via MCP) pede — e a IA gera descrições fundamentadas no conhecimento real do sistema; o humano só **revisa e aprova com o check** (que já existe e é preservado).

---

## 2. Visão de produto — os três fluxos que passam a existir

### 2.1 Import de SQL (evolução do wizard atual)
Upload do `.sql` atualizado → parser → diff contra o modelo atual → preview na tela → confirmar. Igual ao wizard de hoje, mas **server-side**: aplicação registrada em `import_runs` com diff, autor e data; metadados preservados; nada é destruído sem confirmação.

### 2.2 Agente interno (dentro do app)
O usuário pede, por exemplo: *"sugira descrições para os campos deste banco que estão sem descrição"*. O agente:
1. coleta contexto (tabela, colunas, tipos, FKs, SQL de origem, descrições vizinhas);
2. chama o LLM (OpenAI/OpenRouter — mesmo padrão do Azy Agent);
3. grava **sugestões pendentes** (`ai_suggestions`) — nunca sobrescreve direto;
4. o humano vê a fila na UI, edita/rejeita/aplica em lote — e o check de aprovação continua sendo dele.

### 2.3 MCP — o opencode conectado no DBMapper
```
opencode (na codebase do sistema alvo)
   │  MCP (stdio, API key)
   ▼
DBMapper v2 ── tools: list_missing_descriptions, get_table, set_description…
   │
   ▼
sugestão/descrição gravada com fonte='mcp' e reviewed=false
   │
   ▼
humano abre o DBMapper → vê o que mudou → marca revisado/aprovado ✓
```
O opencode faz o que ele faz de melhor — **ler o código do sistema e deduzir a melhor descrição** — e o DBMapper fornece o mapa do que falta. O check humano de aprovação é inegociável e permanece.

---

## 3. Arquitetura proposta

Monorepo Bun workspaces no **mesmo shape do Azy Board** (o que já deu certo lá):

```
dbmapper/
├── apps/
│   ├── api/          # Hono + Drizzle + bun:sqlite — REST, auth, agente, rota /mcp
│   ├── web/          # React + Vite + TanStack Query — árvore, editor, wizard, fila de sugestões
│   └── mcp/          # adaptador stdio do MCP (conexão local do opencode)
├── packages/
│   ├── sql-parser/   # parser portado do v1 (app.js:147-452) — puro, com os testes atuais
│   ├── model-diff/   # wizard diff portado do v1 (app.js:538-819) — puro, com testes
│   ├── domain/       # tipos do dicionário (tabela/coluna/relacionamento/status)
│   ├── contracts/    # JwtPayload, ApiErrorPayload, envelope de erro
│   └── tool-registry/ # catálogo de tools MCP (padrão azyboard, domínio dbmapper)
├── legacy/           # v1 estático, congelado (esta versão atual)
├── docs/analysis/    # esta análise + proposta
└── openspec/         # specs continuam aqui (fluxo OpenSpec mantido)
```

| Pilar | Escolha | De onde vem |
|---|---|---|
| Runtime/API | Bun + Hono (`serve()` nativo) | azyboard `apps/api` |
| Frontend | React 18 + Vite + TanStack Query | padrão azyboard `apps/web` (domínio novo, UI reescrita) |
| Banco | SQLite + Drizzle + migrações SQL versionadas | azyboard perfil `SIMPLE` (sem Redis, sem PG no início) |
| Camada de acesso | `ports.ts` + composition root + adapter (rotas nunca importam Drizzle) | azyboard `persistence/` — é o que permite trocar p/ PostgreSQL depois |
| Auth | cookie `session` HttpOnly + JWT HS256 (`jose`) + bcrypt 12 + throttle de login | **copiar** azyboard `services/auth.ts`, `routes/auth.ts`, `middleware/auth.ts` |
| Multi-usuário | **single-tenant simplificado**: sem tabela `tenants`, papéis simples por projeto | azyboard `memberships`/`requireRole` simplificados |
| Agente | harness com `approvalPreview` + `operationHash` + decisão CAS + fila com lease | **copiar/adaptar** azyboard `assistantHarness.ts` (§5.1) |
| LLM | interface `ModelProvider` OpenAI + OpenRouter + fallback; segredo cifrado AES-GCM | **copiar** azyboard `openaiProvider.ts` etc. |
| MCP | núcleo `mcp-protocol` (transporte-independente) + adaptador stdio + rota `/mcp` HTTP opcional | **adaptar** azyboard `packages/mcp-protocol` + `apps/mcp` |
| Erro/validação | envelope `{ error: { code, message, retryable, details } }` + Zod strict | **copiar** azyboard `errorResponse.ts` + `validation.ts` |
| Qualidade | Biome + `bun test` + boundary checks (`check:persistence`, `check:api-boundary`, `check-mcp-catalog`) | **copiar** os scripts do azyboard adaptando alvos |
| Realtime | **não** no início — SSE só para eventos do agente, refetch na UI | WS/outbox do azyboard é a parte mais complexa e não é essencial aqui |

---

## 4. Modelo de dados (esboço — SQLite/Drizzle)

Derivado do contrato JSON v1 (doc 01 §6), estendido com identidade e auditoria:

| Tabela | Papel | Campos-chave |
|---|---|---|
| `users` | usuários | `email` único, `password_hash`, `role` (`ADMIN`/`MEMBER`/`VIEWER`), `created_at` |
| `projects` | um dicionário de banco | `name`, `description`, `business_terms`, `sql_source_name` |
| `tables` | tabelas | `project_id`, `name`, `description`, `business_terms`, `status`, `position` |
| `columns` | colunas | `table_id`, `name`, `type`, `primary_key`, `foreign_key`, `description`, `business_terms`, `status` |
| `relationships` | FKs (pais; filhos derivados) | `table_id`, `local_columns`/`referenced_columns` (JSON), `constraint_name`, `description`, `reviewed` |
| **campos de revisão** (em cada item) | o check que já existe, agora auditável | `reviewed`, `reviewed_by`, `reviewed_at`, `description_source` (`human`/`agent`/`mcp`), `description_updated_by/at` |
| `ai_suggestions` | fila de sugestões da IA | `target_type`/`target_id`, `suggested_description`, `source` (`internal_agent`/`mcp:<client>`), `status` (`pending`/`applied`/`rejected`), `context_json`, `decided_by/at` |
| `import_runs` | histórico do wizard | `project_id`, `sql_hash`, `diff_json`, `applied_at`, `user_id` |
| `api_keys` | identidade de agentes/MCP | prefixo `dbmp_`, hash SHA-256, escopos, `last_used_at` |
| `events` | audit trail | `actor` (`HUMAN`/`AGENT`), `action`, `target`, `before`/`after`, `at` |

**Compatibilidade:** o **export JSON mantém o formato v1** (o contrato com DBViewer e com os agentes que já consomem esse JSON), apenas enriquecido com os novos campos de revisão. Import de JSON v1 continua aceitando (backfill como hoje).

---

## 5. Desenho do workflow agêntico

### 5.1 Agente interno — fila de sugestões com aprovação humana
Adaptação direta do padrão de aprovação do Azy Agent (doc 02 §6.4), simplificado:

1. Ação do usuário: *"descrever campos sem descrição"* (escopo: projeto, tabela ou seleção).
2. Pipeline coleta contexto → LLM → grava N linhas em `ai_suggestions` (status `pending`).
3. UI: fila com preview lado a lado (sugestão × contexto da coluna), ações **aplicar / editar / rejeitar** (individual e em lote).
4. Ao aplicar: `description` preenchida, `description_source='agent'`, `reviewed=false` — **o item entra em "revisar"** e o check de aprovação continua sendo humano.
5. Eventos em `events` (quem pediu, quem aplicou, quando).

Regra de segurança herdada do azyboard: o agente **nunca** altera `reviewed` — aprovação é exclusivamente humana.

### 5.2 MCP — tools e conexão do opencode

| Tool | Tipo | O que faz |
|---|---|---|
| `get_project_overview` | read | projeto + cobertura (% descrita/aprovada, pendentes) |
| `list_missing_descriptions` | read | itens sem descrição (filtro: tabela, tipo `column`/`table`, ordenação) |
| `get_table` / `get_column` | read | item + tipos + FKs + SQL de origem + descrições vizinhas |
| `set_description` | write | grava descrição com `source='mcp'`, `reviewed=false` + evento |
| `list_suggestions` / `apply_suggestion` / `reject_suggestion` | write | fecha o ciclo das sugestões do agente interno |
| `get_export` | read | JSON do dicionário no formato v1 (contexto completo) |

- **Auth:** API Key `dbmp_...` por usuário (hash SHA-256, escopos) — mesmo desenho das `azb_` do azyboard; header opcional de projeto.
- **Conexão do opencode:** entrada `remote` no `opencode.json` apontando para `/mcp` (ou adaptador stdio local durante dev) — copiar o padrão de `opencode.json.example` do azyboard (**nunca** commitar chave real; o `opencode.json` do azyboard tem chave em claro, usar só o `.example` como modelo).
- **Skill do opencode:** `skills/dbmapper/SKILL.md` adaptada da skill azyboard — descobrir o projeto, listar faltantes, analisar a codebase local, escrever descrições, reportar o que escreveu.
- **Guarda de catálogo:** `check-mcp-catalog` (tool registrada ⇒ documentada ⇒ dispatcher ⇒ policy) — copiar o script.

### 5.3 Workflow humano — o check que você já usa, preservado
- Os 3 estados semânticos continuam: **`sem desc` → `revisar` → `aprovado`**.
- Gate mantido: não aprova sem descrição; editar algo aprovado **reabre** a revisão (regra v1).
- Ganho: ao lado do check, aparece **quem** descreveu (humano/IA), **quando**, e **quem aprovou** — o mínimo para confiar em descrição gerada por máquina.

---

## 6. O que reaproveitar — resumo executivo

**Do v1** (detalhes no doc 01 §10): parser SQL quase 1:1 · diff engine do wizard · contrato JSON → schema · specs OpenSpec como critérios de aceitação · os 5 testes migrando para `bun test`. Descartar: render DOM imperativo, Materialize, `mergeSchemas` órfão, `makeCheckbox` morto.

**Do Azy Board** (detalhes no doc 02 §9): auth completo · `ports`+composition root (simplificado single-tenant) · núcleo MCP + tool registry/execution · harness de aprovação com `operationHash` · providers LLM com fallback · envelope de erro + Zod strict · boundary checks · skill/docs do agente. Não levar: WebSocket/outbox, OAuth, tenants, espelho PostgreSQL, UI Kanban.

**5 pegadinhas já mapeadas** (doc 02, final): não copiar chave do `opencode.json`; remover tenant por completo (não pela metade); não misturar dialetos sem entender os preflights; limites do agente em fonte única; copiar também os scripts de fronteira.

---

## 7. Plano de fases (cada uma vira um change OpenSpec)

| # | Fase | Entrega verificável |
|---|---|---|
| 0 | **Scaffold** | monorepo Bun, Biome, Drizzle + 1 migração, gates `check`, `bun test` rodando |
| 1 | **Domínio + import** | schema SQLite completo; parser/diff portados com testes; API de projeto + import com preview/apply; export JSON v1-compatível |
| 2 | **Auth + multi-usuário** | login/logout, usuários, papéis, rotas protegidas |
| 3 | **UI React** | árvore, editor, wizard de atualização, barra de status — specs v1 como acceptance criteria |
| 4 | **Agente interno** | provider LLM, geração em lote de sugestões, fila de aprovação na UI, auditoria |
| 5 | **MCP + opencode** | tools, API key, skill, documentação; teste ponta-a-ponta: opencode conectado escrevendo descrição que aparece para aprovação |
| 6 | **Polish** | DBViewer como rota read-only, auditoria completa, (opcional: `/mcp` HTTP, preparação PG) |

Fases 0–3 = produto utilizável sem IA (o v1 no servidor). Fases 4–5 = a parte agêntica. Cada fase é um change OpenSpec (`proposal.md` → `design.md` → `specs/` → `tasks.md`), exatamente como você já faz hoje — e a implementação é delegada ao opencode por mim, com revisão antes de aplicar.

---

## 8. Decisões em aberto (preciso da sua palavra)

1. **Escrita via MCP:** o `set_description` do opencode grava **direto** (com `source='mcp'`, `reviewed=false`, auditado) ou gera **sugestão pendente** que exige aplicar antes? — *Recomendo: grava direto com `reviewed=false`.* Fecha o ciclo do opencode sem fila extra, e o check humano continua decidindo o "aprovado". A fila `pending` fica só para o agente interno (lote).
2. **Papéis:** só login, ou já `ADMIN`/`MEMBER`/`VIEWER` por projeto? — *Recomendo já os 3, é barato copiar do azyboard.*
3. **Onde roda:** `labapps` (Docker), notebook, ou Proxmox? — afeta Dockerfile, domínio e backup do SQLite.
4. **LLM do agente interno:** OpenRouter, OpenAI, ou outro? (mesmas chaves padrão do azyboard servem)
5. **Drizzle ORM** está ok como escolha? (é o padrão do azyboard e o caminho natural p/ PostgreSQL)
6. **Nome do pacote:** `@dbmapper/*` e manter o DBViewer como rota read-only do v2?

## 9. Non-goals / riscos

- **Não agora:** WebSocket/edição colaborativa simultânea, OAuth (Microsoft/Google), multi-tenant, PostgreSQL, views/índices no parser (o parser v1 é regex e limitado — manter fiel ao v1 no port e evoluir depois com spec própria).
- **Risco:** refator de UI do zero — mitigado usando as 8 specs existentes como critérios de aceitação e os 5 testes como contrato executável.
- As regras "sem framework/sem build" do `AGENTS.md`/`CONTRIBUTING.md` atuais valem para `legacy/` e foram escopadas na reorganização de 14/11/2026.

## 10. Próximo passo

Aprovado o direcionamento (e as decisões da §8): gero o primeiro change OpenSpec (`v2-scaffold` + domínio/import) e delego a implementação ao opencode, com revisão minha antes de aplicar no share.
