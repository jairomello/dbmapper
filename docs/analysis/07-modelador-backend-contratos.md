# 07 — Modelador visual ER: camada backend/contratos

> Análise **somente-leitura** do repositório `/home/jairo/work/dbmapper` (v2, monorepo Bun)
> para sustentar o planejamento do modelador visual de banco de dados (canvas ER).
> Toda afirmação abaixo foi verificada em código real com caminho + faixa de linha;
> o que é inferência está marcado como **SUPOSIÇÃO**.
>
> Escopo: `packages/`, `apps/api/`, `openspec/`, `scripts/`, `legacy/` (apenas onde
> toca no change ativo). Nenhum arquivo do repositório foi alterado por esta análise
> (o único artefato gravado é este relatório).

---

## 0. Correção de premissa (importante antes de qualquer coisa)

**O contrato de export v1 NÃO mora em `packages/contracts`.** O pacote tem 20 linhas
no total e contém só três tipos de infraestrutura:

- `packages/contracts/src/index.ts:1-8` → `ApiErrorPayload`
- `packages/contracts/src/index.ts:10-16` → `JwtPayload` (com `role: 'ADMIN' | 'MEMBER' | 'VIEWER'`)
- `packages/contracts/src/index.ts:18-20` → `HealthResponse`

O contrato v1 (JSON de projeto) está em **`packages/domain`**, com comentário explícito
de que é o contrato serializado:

- `packages/domain/src/index.ts:44-49` — bloco `/** The v1 JSON contract model. ... Field names stay in snake_case because they are the serialized contract consumed by DBViewer and other v1 readers. */`
- `packages/domain/src/index.ts:50-103` — os shapes em si.

**Consequência para o planejamento:** qualquer trabalho "nos contratos" do modelador
ER deve ser feito em `packages/domain` (ou em novo módulo), nunca em `packages/contracts`.
Ver item 9 (incompatibilidade **I1**).

---

## 1. Formato exato do contrato de export v1

### 1.1 Shapes (fonte da verdade: `packages/domain`)

| Conceito | Tipo | Arquivo:linhas | Campos |
|---|---|---|---|
| Documento raiz | `ProjectDocument` | `packages/domain/src/index.ts:93-95` | `{ database: DatabaseModel }` |
| Banco | `DatabaseModel` | `packages/domain/src/index.ts:85-91` | `name`, `description`, `business_terms: string[]`, `reviewed: boolean`, `tables: TableModel[]` |
| Tabela | `TableModel` | `packages/domain/src/index.ts:75-83` | `name`, `description`, `business_terms`, `reviewed`, `status`, `relationships`, `columns` |
| Relações da tabela | `TableRelationshipsModel` | `packages/domain/src/index.ts:70-73` | `{ parents: RelationshipModel[], children: RelationshipModel[] }` |
| Relacionamento/FK | `RelationshipModel` | `packages/domain/src/index.ts:50-57` | `table` (nome da tabela alvo), `local_columns: string[]`, `referenced_columns: string[]`, `constraint_name`, `description`, `reviewed` |
| Coluna | `ColumnModel` | `packages/domain/src/index.ts:59-68` | `name`, `type` (string livre), `primary_key: boolean`, `foreign_key: boolean`, `description`, `business_terms`, `reviewed`, `status` |
| Status de revisão | `ReviewStatus` | `packages/domain/src/index.ts:1` e `97-103` | `'NEW' \| 'UNCHANGED' \| 'REMOVED' \| 'RENAMED' \| 'CHANGED'` |

Pontos estruturais do contrato:

- **Tudo em `snake_case`** no export (é o formato serializado v1); os registros internos
  usam `camelCase` e a tradução acontece só no mapeador.
- **PK e FK são flags booleans na coluna** (`primary_key`, `foreign_key`) — não há
  objeto de constraint nem coluna "chave" separada.
- **Relationships não têm id no export**: referenciam as coisas **por nome**
  (`RelationshipModel.table` = nome da tabela; `local_columns`/`referenced_columns`
  = nomes de colunas).
- **`children` é sempre derivado de `parents`** — nunca vem do cliente como fonte
  de verdade (ver 1.3).
- **Não existe no contrato v1**: posição/x/y de layout, zonas/abas, cardinalidade
  explícita (1:N/N:1), `NOT NULL`/`UNIQUE`/auto-incremento, nem id de tabela/coluna.

### 1.2 Mapeador (aggregate SQLite → JSON v1)

- `apps/api/src/services/model-mapper.ts:122-124` → `projectExport(aggregate)` = `{ database: databaseFromAggregate(aggregate) }`
- `apps/api/src/services/model-mapper.ts:53-90` → `databaseFromAggregate`: monta `TableModel`
  a partir dos records; `relationships: { parents, children: [] }` (linha 77) e depois
  chama `normalizeRelationships` (linha 81) para derivar os `children`.
- `apps/api/src/services/model-mapper.ts:42-51` → `relationshipToModel` (record → `RelationshipModel`).
- `apps/api/src/services/model-mapper.ts:98-100` → `interface ProjectExport { database: DatabaseModel }`.
- Derivação de `children`: `packages/sql-parser/src/parser.ts:200-242`
  (`normalizeRelationships`; o laço em 220-234 espelha cada `parents` para o
  `children` da tabela-alvo, invertendo `local_columns` ↔ `referenced_columns`).
- Marcação de FK: `packages/sql-parser/src/parser.ts:158-161` (`markColumnAsForeignKey`
  **só marca coluna que já existe**; se não existir, é no-op) — chamado em 213-217.

### 1.3 Rota e congelamento do contrato

- Rota: `apps/api/src/routes/projects.ts:76-80` → `GET /api/projects/:id/export`
  (sem `requireRole`: qualquer autenticado, inclusive `VIEWER`).
- Spec: `openspec/specs/project-api/spec.md:32` — "Export in the v1 JSON contract",
  exigindo campo a campo `{"database": {...}}`.
- **Teste que congela a forma exata**: `apps/api/src/tests/export.test.ts:61-117`
  (`Object.keys(body)).toEqual(['database'])`, `expect('table_ids' in body).toBe(false)`,
  `expect(JSON.stringify(body)).not.toContain('table_ids')`, e `Object.keys(...).sort()`
  exato para database/tabela/coluna/relationship) + `export.test.ts:118-137`
  (`toEqual` com os objetos inteiros).
- Leitores do contrato: `apps/web/src/api/types.ts:32` (`table_ids` só na **view**,
  não no export) e `apps/mcp/src/handlers.ts:42-44`.
- `table_ids`/`column_ids`/`relationship_ids` (mapa **nome → id**) existem só na
  resposta de `GET/PUT /api/projects/:id` (`projectView`):
  `apps/api/src/services/model-mapper.ts:126-170`.

---

## 2. Rota `PUT /api/projects/:id`

### 2.1 Handler

`apps/api/src/routes/projects.ts:55-74`:

| Linha | Conteúdo |
|---|---|
| 55 | `app.put('/api/projects/:id', requireMember, ...)` — exige papel ≥ `MEMBER` |
| 56 | lê o parâmetro `:id` |
| 57 | `parseJsonBody(c, projectDocumentSchema)` → validação zod |
| 58 | `normalizeDatabaseModel(document.database)` |
| 59-71 | `repository.replaceModel(id, database, { actorUserId, audit: {...} })` |
| 63 | `action: 'project.saved'` |
| 64-66 | `subjectType: 'project'`, `subjectId: id` |
| 66-69 | `payload: { tables: N, columns: M }` (contagens agregadas) |
| 72 | retorno `null` → `404 NOT_FOUND` |
| 73 | `c.json(projectView(saved))` — devolve view completa (com `table_ids` etc.) |

### 2.2 Payload e validação zod

- Schema raiz: `apps/api/src/validation.ts:64-66` → `projectDocumentSchema = z.object({ database: databaseInputSchema })`.
  **Não é `.strict()`** → chaves desconhecias são **descartadas silenciosamente**
  (padrão `strip` do zod), não rejeitadas. Verificado em execução (item 3, PUT 3).
- Sub-schemas:
  - `databaseInputSchema` — `apps/api/src/validation.ts:56-62`
  - `tableInputSchema` — `apps/api/src/validation.ts:46-54`
  - `columnInputSchema` — `apps/api/src/validation.ts:30-39`
  - `relationshipInputSchema` — `apps/api/src/validation.ts:21-28`
  - `relationshipsInputSchema` (`parents`/`children`) — `apps/api/src/validation.ts:41-44`
- Filosofia "tolerante" documentada em `apps/api/src/validation.ts:7-19`: campos
  ausentes recebem default, campos inválidos caem em `.catch(default)`; **a única
  rejeição estrutural é falta do objeto `database`**.
- Falha de parse → `parseJsonBody` (`apps/api/src/validation.ts:194-216`) lança
  `ApiError(400, 'VALIDATION_ERROR', ...)` com `details.issues`; JSON malformado →
  `400 INVALID_JSON` (linhas 197-201).
- **Não há validação de referência**: `local_columns` pode citar coluna inexistente
  e `table` pode citar tabela inexistente — o zod só exige `z.string()`.

### 2.3 Normalização

`apps/api/src/services/model-mapper.ts:17-40` (`normalizeDatabaseModel`):
copia tabelas/colunas, **zera `children`** (`children: []`, linha 27) e chama
`normalizeRelationships` (linha 31) para deduplicar `parents`, derivar `children` e
marcar `foreign_key` nas colunas locais referenciadas.

### 2.4 Transação

`apps/api/src/persistence/sqlite/adapter.ts:562-584` (`replaceModel`):

- `564` → `db.transaction((tx) => { ... })` — **uma única transação SQLite**.
- `565-566` → checagem de existência; se não existir, retorna `false` (→ 404 na rota)
  e **nenhuma escrita acontece**.
- `567` → `writeModel(tx, id, database, now, actorUserId)`.
- `568-579` → `insertEventRow(tx, {...context.audit, projectId: id, subjectId: ...}, now)`
  **dentro da mesma transação**.
- `583` → relê o aggregate (`getProject`) fora da transação para responder.

`writeModel` (`apps/api/src/persistence/sqlite/adapter.ts:312-478`) é um
**replace completo do modelo**:

- `345-373` → lê o estado anterior (para preservar atribuição `reviewedBy/At`) e
  **apaga tudo**: `delete relationships` (370), `delete columns` (371),
  `delete tables` do projeto (372).
- `388-399` → `update projects`.
- `401-421` → reinsere cada tabela com **`id: crypto.randomUUID()` (linha 402)** e
  `position: tableIndex` (417).
- `423-446` → reinsere colunas com **`id: crypto.randomUUID()` (428)**,
  `position: columnIndex` (439).
- `448-476` → reinsere `parents` com **`id: crypto.randomUUID()` (460)** e `position: index` (471).

### 2.5 Evento de auditoria

- Ação: **`project.saved`** (`apps/api/src/routes/projects.ts:63`).
- Gravação: `insertEventRow` em `apps/api/src/persistence/sqlite/adapter.ts:184-196`
  (monta a row em 185-195 e `tx.insert(eventsTable).values(row).run()` na 196).
- Colunas gravadas: `apps/api/src/db/schema.ts:241-256` (`events`: `id`, `project_id`
  FK→projects com `onDelete: cascade`, `actor_user_id` FK→users, `action`,
  `subject_type`, `subject_id`, `payload_json` (JSON string, default `'{}'`),
  `created_at` default SQL `strftime`).
- O `projectId` é **sobreposto pelo repositório** (`adapter.ts:573`), não depende do caller.
- **Rollback ⇒ sem evento**: como está dentro de `db.transaction`, falha em qualquer
  statement desfaz mutação e evento juntos (exigido pela spec, item 6).

---

## 3. Um único PUT consegue adicionar atomicamente uma coluna NOVA + uma relationship NOVA?

**Sim — e já funciona hoje, sem nenhuma mudança de backend.**

O `PUT` é um *replace* de documento completo dentro de uma transação única
(`adapter.ts:564-581`): qualquer coisa que esteja no payload é gravada no mesmo
commit. Um payload que contenha a coluna nova **e** a relationship nova resulta em
ambas persistidas atomicamente.

**Verificação executada** (script de probe em `$BH_AGENT_WORKSPACE/cache/scratch/probe-put-model.ts`,
somente-leitura no repositório; DB temporário em `tmpdir`; `bun` 1.4.4). Saída real:

```
table_ids antes  : {"cliente":"99775d45-...","pedido":"5c4f5470-..."}
colunas pedido    : ["id:pk=true:fk=false","cliente_id:pk=false:fk=true"]
relationships     : 1 [{"target":"cliente","local":["cliente_id"],"ref":["id"],"fk":"fk_pedido_cliente"}]
table_ids depois  : {"cliente":"1ab3ecab-...","pedido":"c61a3c04-..."}
IDs de tabela estáveis entre PUTs? false
rel. dangling aceita? true | gravadas: 1 [["coluna_fantasma"]]
coluna fantasma criada pelo servidor? false
parse ok? true | chave "diagram" sobrevive ao zod? false
eventos do projeto: [{"action":"project.saved","subject":"ab3f1470-...","actor":"ea64d552-..."}]
PROBE OK
```

Conclusões dessa execução:

1. **Atomicidade confirmada**: coluna `cliente_id` + relationship `pedido→cliente`
   gravadas no mesmo `replaceModel`, e `foreign_key: true` foi aplicado na coluna
   nova pelo `normalizeRelationships` (parser.ts:213-217).
2. **A auto-criação de coluna FK NÃO existe hoje**: o servidor aceita relationship
   apontando para `coluna_fantasma` e **não cria a coluna** (`markColumnAsForeignKey`
   é no-op, `parser.ts:158-161`). Ou seja: o "auto-cria a coluna `<tabela>_id`" da
   Fase 8 precisa de lógica nova **ou** do cliente já enviar a coluna junto no
   mesmo payload (o que é atômico por construção).
3. **IDs não são estáveis entre PUTs** (`false` acima) — item 9, **I2**.
4. **Chave `diagram` no payload do PUT é descartada** pelo zod (`false` acima) —
   item 9, **I4**.
5. O evento `project.saved` sai na mesma transação, com ator e subject.

---

## 4. Padrão de migração/Drizzle para tabela nova (ex.: `diagram_layouts`)

Fluxo real, em ordem:

1. **Schema**: declarar em `apps/api/src/db/schema.ts` com `sqliteTable(...)` de
   `drizzle-orm/sqlite-core` (import na linha 2). Padrões já usados no arquivo:
   - coluna `text(...).primaryKey()`; `integer(..., { mode: 'boolean' })` para boolean;
     `text(...).notNull().default('[]' | '{}')` para JSON serializado;
     default de timestamp via `isoNow = sql\`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))\`` (`schema.ts:4`);
   - FK: `.references(() => projects.id, { onDelete: 'cascade' })` (ex.: `schema.ts:77-79`);
   - índices/única/check na terceira arg de `sqliteTable` (ex.: `tables` em
     `schema.ts:92-95` com `uniqueIndex('tables_project_name_uq')` sobre
     `(projectId, name)` — **exatamente o padrão que `diagram_layouts` precisa
     para `UNIQUE(project_id, zone_name)`**);
   - tabelas existentes como referência: `projects` 60-71, `tables` 73-96,
     `columns` 98-124, `relationships` 126-149, `events` 241-256.
2. **Gerar a migração**: `bun run db:generate` → `drizzle-kit generate`
   (`package.json:13` → `apps/api/package.json` script `db:generate`).
   Config: `apps/api/drizzle.config.ts:3-12` (`schema: './src/db/schema.ts'`,
   `out: './src/db/migrations'`, `dialect: 'sqlite'`, **`strict: true`**).
   `AGENTS.md:60`: "Run `bun run db:generate` after changing `apps/api/src/db/schema.ts`".
3. **Artefatos gerados**: `apps/api/src/db/migrations/000N_<nome>.sql` +
   `apps/api/src/db/migrations/meta/000N_snapshot.json` +
   `apps/api/src/db/migrations/meta/_journal.json`. Hoje há 5 entradas
   (`idx` 0..4 → tags `0000_flowery_morgan_stark` … `0004_adorable_inhumans`),
   portanto a próxima é **`0005_*`** (`_journal.json`).
   Exemplo de SQL gerado para tabela nova: `apps/api/src/db/migrations/0004_adorable_inhumans.sql:1-9`
   (`CREATE TABLE api_keys ...` + `CREATE UNIQUE INDEX` + `CREATE INDEX`, com
   `--> statement-breakpoint` separando statements).
4. **Aplicar**: `bun run db:migrate` → `apps/api/src/db/migrate.ts:7-18`
   (`migrate(db, { migrationsFolder })` na linha 14; `DATABASE_URL` default `./dev.db`,
   override `MIGRATIONS_DIR`). A API também pode migrar na inicialização:
   `createSqlitePersistence(path, { migrate: true })` (`adapter.ts:169`, bloco
   `if (options.migrate)` em ~176-180) — é o que os testes usam.
5. **Teste de migração**: `apps/api/src/db/migration.test.ts:20-56` roda todas as
   migrações num SQLite temporário e assera:
   - `tableNames` **`toContain`** as tabelas do domínio (linhas 34-41) → **adicionar
     `diagram_layouts` não quebra** (é `toContain`, não `toEqual`);
   - mas `PRAGMA table_info('projects')` é `toEqual` (linhas 44-55) → **criar coluna
     nova em tabela existente QUEBRA esse teste** (é o caso a evitar/não é o nosso).
6. **Repository**: por causa do item 7 (fronteira de persistência), a tabela nova
   exige método novo em `apps/api/src/persistence/ports.ts:179-192` (`ProjectRepository`)
   + implementação em `apps/api/src/persistence/sqlite/adapter.ts`. A rota só chama
   `persistence.projects.<método>(...)`.

---

## 5. Onde papéis/permissoes (ADMIN/MEMBER/VIEWER) são aplicados

### 5.1 Mecanismo

- Ranking: `apps/api/src/middleware/session.ts:14` → `ROLE_RANK = { VIEWER: 1, MEMBER: 2, ADMIN: 3 }`.
- Guarda: `apps/api/src/middleware/session.ts:48-59` → `requireRole(role)`; papel
  insuficiente → `403 FORBIDDEN` com envelope (`session.ts:54`); sem usuário → `401`.
- Autenticação global: `apps/api/src/app.ts:39` → `app.use('/api/*', requireCredential(auth, persistence))`
  (implementado em `apps/api/src/middleware/credential.ts:80-126`): aceita **sessão por
  cookie** ou **API key Bearer**; para API key, o papel vem do **dono da chave**
  (`credential.ts:104-109`).
- Definição dos papéis: `apps/api/src/persistence/ports.ts:111-112`
  (`USER_ROLES = ['ADMIN','MEMBER','VIEWER']`) e `packages/contracts/src/index.ts:13`.

### 5.2 Aplicação por rota (arquivo:linha)

| Guarda | Rotas |
|---|---|
| `requireRole('MEMBER')` | `POST /api/projects`, `POST /api/projects/import`, **`PUT /api/projects/:id`** — `apps/api/src/routes/projects.ts:11,13,31,55` |
| `requireRole('MEMBER')` | `PATCH .../items/:itemType/:itemId/description` — `apps/api/src/routes/items.ts:12,16` |
| `requireRole('MEMBER')` | `POST /api/projects/:id/imports/preview`, `.../imports/apply` — `apps/api/src/routes/imports.ts:20,22,32` |
| `requireRole('MEMBER')` | `POST|PATCH|POST /api/keys...` — `apps/api/src/routes/keys.ts:10,12,44,50` |
| `requireRole('MEMBER')` | 6 rotas de sugestões do agente — `apps/api/src/routes/agent.ts:32,35,77,89,109,129,143` |
| `requireRole('ADMIN')` | `POST /api/users`, `GET /api/users`, `PATCH /api/users/:id` — `apps/api/src/routes/users.ts:30,32,57,59` |
| `requireRole('ADMIN')` | `GET /api/events` — `apps/api/src/routes/events.ts:20,22` |
| **sem `requireRole`** (qualquer autenticado, inclusive VIEWER) | `GET /api/projects`, `GET /api/projects/:id`, `GET /api/projects/:id/export` (`projects.ts:29,49,76`), `GET /api/auth/me`, etc. |

### 5.3 Cobertura de teste

- `apps/api/src/tests/route-protection.test.ts:27-37` (401 sem sessão) e
  `:39-98` (**VIEWER lê mas não pode criar/salvar/preview/apply → 403 FORBIDDEN**,
  com asserções de que nada mudou no banco).
- Papel via API key: `apps/api/src/tests/credential.test.ts` (caso "papel vem do dono:
  chave de VIEWER não escreve").

### 5.4 Superfície de API key (relevante para o diagrama)

`apps/api/src/middleware/credential.ts:26-33` → whitelist `KEY_ENABLED` com
**exatamente 4 rotas** (`GET /api/projects/:id`, `GET .../export`, `* .../agent/*`,
`PATCH .../items/.../description`), fixada pelo teste
`apps/api/src/tests/credential.test.ts:49-63`
(`expect(KEY_ENABLED).toHaveLength(4)` + casos `false`, incluindo
`isKeyEnabled('GET', '/api/projects/p1/imports') === false`).
**Rota fora da lista = sessão exclusivamente.**

---

## 6. Requisitos da spec `audit-log` (lida inteira: `openspec/specs/audit-log/spec.md`, 69 linhas)

### 6.1 Requirement: Mutations emit events (`spec.md:8-26`)

- **Formato do evento**: row na tabela `events` **dentro da mesma transação da mutação**,
  com: id do usuário que agiu, **action namespaced `domain.verb`**, subject ids e timestamp.
- **Cobertura enumerada** (texto literal da spec): *project create/save/JSON import,
  SQL model import apply, item description write, agent decisions, key create/revoke,
  user create and role change*.
- **Mutação que rola back NÃO pode deixar evento.**
- Cenários:
  - `spec.md:12-15` — `project.save` de `MEMBER` → row com action **`project.saved`**, actor id e project id.
  - `spec.md:17-20` — troca de papel → **`user.role_changed`** com target user id no payload.
  - `spec.md:22-26` — *cada rota mutante registrada* precisa produzir ≥1 row com
    action `domain.verb`; mutação falha → nenhuma row.

### 6.2 Requirement: Events are append-only (`spec.md:28-35`)

- A camada de persistência **só pode expor insert e list** para `events`; nenhum
  update/delete para nenhum papel (inclusive ADMIN).
- Conforme no código: `apps/api/src/persistence/ports.ts:376-381` →
  `EventRepository { insert, list, listAll, listEvents }` — sem update/delete.

### 6.3 Requirement: Audit query API (`spec.md:37-55`)

- `GET /api/events` **ADMIN-only**; mais recente primeiro; e-mail do ator resolvido;
  filtros `action` (**prefix match**), `projectId`, `limit` (default 100, teto 500).
- Implementação: `apps/api/src/routes/events.ts:11-41` (`eventQuerySchema` strict em
  11-17; `requireAdmin` 20/22; clamp `Math.min(limit ?? 100, 500)` na 33) e
  `apps/api/src/persistence/sqlite/adapter.ts:1300-1324` (`like(action, prefix%)`,
  `orderBy(desc(createdAt), desc(rowid))`, `.limit(...)`, `leftJoin users` para `actorEmail`).
- Constantes: `events.ts:9-10` (`MAX_EVENTS_LIMIT = 500`, `DEFAULT_EVENTS_LIMIT = 100`).
- Testes: `apps/api/src/tests/events.test.ts:52,64,82,91,100,106`.

### 6.4 Requirement: Audit UI (`spec.md:57-69`)

- Rota `/audit` visível só para ADMIN; lista actor/action/subject/timestamp com
  **filtro por família de ação** e empty state; não-admin é redirecionado.
- Implementação: `apps/web/src/pages/AuditPage.tsx` — e **a lista de famílias é
  hardcoded**: `AuditPage.tsx:8-16` (`ACTION_FAMILIES` = `''`, `project.`, `model.`,
  `user.`, `item.`, `agent.`, `api_key.`).

### 6.5 Testes "tabela-driven"

A spec **não** manda literalmente "table-driven"; ela exime que *cada rota mutante
seja exercitada no teste*. O padrão executável hoje é o array de casos em
`apps/api/src/tests/audit-coverage.test.ts`:

- `audit-coverage.test.ts:127-131` → `interface Case { name; action; run }`.
- `audit-coverage.test.ts:133-297` → `const cases: Case[]` com **14 casos**
  (nome da rota + action esperada + closure que faz o request), ex.:
  `POST /api/projects → project.created` (134-141),
  **`PUT /api/projects/:id → project.saved` (142-149)**,
  `POST /api/projects/import → project.imported` (150-159),
  `POST .../imports/apply → model.import_applied` (160-175),
  `PATCH .../description → item.description_written` (176-190),
  `POST /api/users → user.created` (191-202), `PATCH /api/users/:id → user.role_changed` (203-210),
  `POST /api/keys → api_key.created` (211-218), `DELETE /api/keys/:id → api_key.revoked` (219-227),
  e 6 casos do agente (228-296).
- `audit-coverage.test.ts:299-311` → o laço que executa cada caso e assera:
  evento existe com a `action` esperada (305), `actorUserId` = usuário padrão (307),
  `subjectId` não vazio (308) e **`action` casa com `/^[a-z_]+\.[a-z_]+$/` (309)**.
- `audit-coverage.test.ts:313-357` → teste negativo: 404/409/404/404 e chamadas
  diretas ao repositório com projeto inexistente **não podem deixar evento**
  (`expect(newEvents(before)).toHaveLength(0)`, linha 356).

**`diagram.layout_saved`** satisfaz o regex (domínio `diagram`, verbo `layout_saved`),
mas **não está enumerado no texto da spec** nem no array `cases` — ver item 9 (**I6**).

---

## 7. Regras de `scripts/check-persistence-boundaries.ts` (67 linhas)

| Linha | Regra |
|---|---|
| 6 | `guardedDirectories = ['apps/api/src/routes', 'apps/api/src/services']` — só essas duas pastas são varridas (recursivamente, `.ts`/`.tsx`, linhas 14-33; diretório ausente é ignorado, ENOENT → `[]`, linhas 30-31) |
| 7 | regex de import que captura `from '...'`, `import('...')` e `require('...')` |
| 9-12 | `isForbidden`: proibido **`drizzle-orm`** e qualquer `drizzle-orm/*`, **e** qualquer especificador que termine em **`db/schema`** (regex `(^|\/)db\/schema$`) |
| 45-54 | varre **linha a linha** (com `lastIndex = 0` por linha) e registra `arquivo:linha imports <specifier>` |
| 58-62 | havendo qualquer violação → imprime `Persistence boundary violation: routes/services must not import drizzle-orm or db/schema.` + lista e **`process.exit(1)`** |
| 64 | caso contrário → `Persistence boundaries ok: routes/services only depend on persistence ports.` |

Integração no gate: `package.json:21` → `"check:persistence": "bun run scripts/check-persistence-boundaries.ts"`;
`package.json:20` → o gate `check` = `typecheck && lint && check:persistence && test:mcp-catalog && test`
(ou seja, **roda em toda verificação**, conforme `AGENTS.md` "Build, Test, and Development Commands (v2)").

**Tradução prática para o modelador ER:** a rota `GET/PUT /api/projects/:id/diagram`
e qualquer serviço novo **não podem** importar `drizzle-orm` nem `../db/schema`;
todo acesso a `diagram_layouts` precisa passar por `persistence/ports.ts` +
`persistence/sqlite/adapter.ts`.

---

## 8. Escopo do change ativo `openspec/changes/sort-columns-by-pk-alphabetical/`

Comando: `openspec list` → `sort-columns-by-pk-alphabetical  5/9 tasks  28/06/2026`.

### 8.1 O que ele faz

- `proposal.md:1-31` — reordenar colunas no **DBViewer** (PK primeiro + resto em
  ordem alfabética), **só na superfície do viewer** (`dbviewer.html`/`dbviewer.js`);
  o editor preserva a ordem do SQL; *"No changes to the JSON project format"*;
  capability modificada: **`dbviewer`**; impacto: `dbviewer.js` e `tests/dbviewer.test.js`.
- `design.md` — decisões: ordenar **no render** (não no load), PK via
  `column.primary_key === true`, sort estável case-insensitive; seção "Migration Plan: no migration needed".
- `specs/dbviewr/spec.md:1-23` — bloco `## MODIFIED Requirements` com o requirement
  "Column rendering order in table view" e 4 cenários (PK único, sem PK, PK composto,
  case-insensitive).
- `tasks.md` — grupos 1 (implementar), 2 (testes), **3 (Validate — 3.1/3.2/3.3 desmarcados)**,
  **4 (Archive — 4.1 desmarcado)**; 1.x e 2.x marcados → **5/9**.

### 8.2 Estado real do código

- **Implementado**: `legacy/dbviewer.js:272-288` (`sortColumns`: separa PK, ordena
  não-PK com `localeCompare(..., { sensitivity: 'base' })`, concatena) e
  `legacy/dbviewer.js:314` (uso em `renderTable`).
- **Testado**: `legacy/tests/dbviewer.test.js:35-38` (regex sobre o script);
  execução real: `cd legacy && node tests/dbviewer.test.js` → `dbviewer.test.js: ok`.
- **Delta ainda não sincronizado**: `openspec/specs/dbviewer/spec.md` **não tem**
  o requirement "Column rendering order" (grep em todos os `### Requirement` do
  arquivo: `Project JSON loading`, `REMOVED tables are hidden`, `Viewer surface omits
  internal review status`, `Search and table navigation`, `Relationships panel with
  Filha de / Mãe de`, `Per-table anchor links`, `Light and dark theme with persistence`,
  `Capability Purpose paragraph`, `Page is served under the static-site-security controls`,
  `Viewer is published under the correct name`).

### 8.3 Defeito concreto no change (bloqueio de archive)

O delta está no diretório **`specs/dbviewr/`** — typo para a capability `dbviewer`
(há até um change arquivado `2026-06-28-rename-dbviewr-to-dbviewer`, ou seja, o nome
errado é conhecido no repo). Executado:

```
$ openspec validate sort-columns-by-pk-alphabetical
Change 'sort-columns-by-pk-alphabetical' is valid
ℹ [INFO] dbviewr/spec.md: Archive would refuse this delta: dbviewr: target spec does not
exist; only ADDED requirements are allowed for new specs. MODIFIED and RENAMED operations
require an existing spec.
```

Ou seja: **o archive do change vai ser recusado** enquanto o diretório se chamar `dbviewr`.

### 8.4 Conflito com a feature de diagrama?

**Nenhum conflito técnico.** Superfícies disjuntas:

| | sort-columns | modelador ER |
|---|---|---|
| Alvo | `legacy/dbviewer.js` (v1 congelado, read-only) | `apps/api` + `apps/web` (v2) |
| Formato JSON | intocado (`proposal.md` "No changes to the JSON project format") | intocado (layout fica fora do export v1) |
| Ordem de colunas | ordenação **no render** do viewer | `position` gravado no banco (item 11) |

Conexões indiretas a considerar no planejamento:

1. Ambos são mudanças em `openspec/` — abrir o change do diagrama enquanto este
   está pendente de archive é possível (múltiplos changes coexistem), mas convém
   fechar/arrumar o `dbviewr` antes para não herdar o padrão de diretório errado.
2. Ele cria precedente de que **ordem de exibição de coluna é concern da superfície,
   não do contrato** — consistente com o plano do diagrama (layout fora do export).
3. **SUPOSIÇÃO**: o change está parado desde 28/06/2026 (5/9) por esquecimento,
   não por bloqueio técnico — não há registro no repo explicando a pausa.

---

## 9. INCOMPATIBILIDADES concretas entre a arquitetura atual e o plano

Base: (a) tabela nova `diagram_layouts`; (b) endpoints `GET/PUT /api/projects/:id/diagram`;
(c) evento `diagram.layout_saved`; (d) auto-criação de coluna FK no mesmo PUT existente.

### I1 — O plano/relatórios citam `packages/contracts`, mas o contrato v1 está em `packages/domain`
`packages/contracts/src/index.ts` tem 20 linhas e só `ApiErrorPayload`/`JwtPayload`/`HealthResponse`.
O export v1 é `packages/domain/src/index.ts:44-103`. Trabalhar "nos contratos" no pacote
errado não produzirá nada (e `apps/api/package.json` depende dos dois: `@dbmapper/contracts`
e `@dbmapper/domain`). **Corrigir a referência no plano.**

### I2 — IDs de tabela/coluna/relationship **não sobrevivem** a um PUT
`writeModel` apaga e reinsere tudo com `crypto.randomUUID()` novo
(`adapter.ts:370-372` deletes; `402`, `428`, `460` novos ids) — **verificado em execução
("IDs de tabela estáveis entre PUTs? false")**.
Consequências:
- `diagram_layouts` **não pode** ter FK para `tables.id` nem guardar layout por id de
  tabela/coluna — só por **nome** (como `docs/analysis/04-proposta-modelo-er.md:106-107`
  já determina). Um `position`/`zone` indexado por id quebraria em **todo** save de modelo.
- Se o plano algum dia quiser ids estáveis, é mudança de alto impacto: `table_ids`/
  `column_ids`/`relationship_ids` são consumidos por `apps/web/src/pages/WorkspacePage.tsx:203`
  e `apps/mcp/src/handlers.ts:115,135,141,259,265,319` (ações MCP resolvem item por id).

### I3 — Auto-criação de coluna FK **não existe** e não cai "de graça" no PUT
`markColumnAsForeignKey` (`packages/sql-parser/src/parser.ts:158-161`) só marca coluna
**existente**; `normalizeRelationships` não cria nada. **Verificado em execução**:
relationship com `local_columns: ["coluna_fantasma"]` é aceita e a coluna não é criada.
Além disso o zod aceita `local_columns` como `z.string()` qualquer (`validation.ts:23-24`)
— **nenhuma validação de integridade referencial** no caminho do PUT.
→ A Fase 8 precisa de **lógica nova** (em `normalizeDatabaseModel` ou `writeModel`,
com regra de nome de coluna e de tipo), **ou** o cliente envia a coluna junto —
o segundo caminho é atômico hoje (item 3) e não toca em backend.

### I4 — Não dá para enfiar o layout dentro do PUT existente
`projectDocumentSchema` (`validation.ts:64-66`) **não é `.strict()`**: chave extra é
**descartada em silêncio** (verificado: `chave "diagram" sobrevive ao zod? false`) —
ou seja, nem erro o cliente recebe. E mesmo que o schema aceitasse,
`normalizeDatabaseModel` (`model-mapper.ts:17-40`) só copia campos conhecidos do modelo.
→ **Endpoint próprio é obrigatório** (o plano já prevê `GET/PUT .../diagram`); o PUT
do modelo continua intocado.

### I5 — A tabela nova exige mudança em 3 camadas por causa da fronteira de persistência
`scripts/check-persistence-boundaries.ts:6,9-12` proíbe `drizzle-orm`/`db/schema` em
`apps/api/src/routes` **e** `apps/api/src/services`, com `exit(1)` (linhas 58-62) dentro
do gate `check` (`package.json:20-21`).
→ Criar `diagram_layouts` obriga: `db/schema.ts` + migração `0005_*` + **método novo em
`persistence/ports.ts`** + implementação em `persistence/sqlite/adapter.ts`; a rota só
orquestra. Não existe atalho "gravar layout direto no handler".

### I6 — Evento novo exige 3 sincronizações (spec + teste tabela-driven + UI de famílias)
1. **Spec**: `openspec/specs/audit-log/spec.md:10` **enumera** as mutações cobertas
   (*project create/save/JSON import, SQL model import apply, item description write,
   agent decisions, key create/revoke, user create and role change*) — `PUT /diagram`
   não está lá → a capability `audit-log` precisa de delta (ADDED/MODIFIED) no change do diagrama.
2. **Teste**: novo caso no array `cases` de
   `apps/api/src/tests/audit-coverage.test.ts:133-297`; sem ele, a cobertura fica
   incompleta (a spec exige "each registered mutating route", e **não há teste que
   enumere rotas automaticamente** — a cobertura é declarativa nesse array).
   A action `diagram.layout_saved` passa no regex da linha 309 (`^[a-z_]+\.[a-z_]+$`).
3. **UI**: `apps/web/src/pages/AuditPage.tsx:8-16` tem `ACTION_FAMILIES` **hardcoded**
   (`project.`, `model.`, `user.`, `item.`, `agent.`, `api_key.`) — eventos `diagram.`
   aparecem em "Todas as ações" mas **não terão filtro de família** até a lista ser
   estendida (a spec `audit-log:59` exige "action-family filter").

### I7 — A superfície de API key é fixa em 4 rotas e travada por teste
`credential.ts:26-33` + `credential.test.ts:49-63` (`toHaveLength(4)`).
→ `GET /api/projects/:id/diagram` **não** será acessível por MCP/API key sem mudar
os dois arquivos de propósito (o teste falha de propósito para obrigar a decisão).
Se a Fase 7 quiser ler layout via MCP, é decisão explícita; se não quiser, nada a fazer.

### I8 — O export v1 está congelado por teste — o layout jamais pode entrar lá
`apps/api/src/tests/export.test.ts:61-66` assera o conjunto exato de chaves e
`expect(JSON.stringify(body)).not.toContain('table_ids')`.
→ Qualquer tentativa de "devolver o diagrama junto no export" quebra o gate. O plano
já diz que o layout fica fora do export (`docs/analysis/04-proposta-modelo-er.md:108`) —
isto é uma **guarda a preservar**, não um bloqueio.

### I9 — Não existe capability/spec de diagrama, e código v2 só entra via change OpenSpec
`openspec/specs/` tem 19 capabilities, **nenhuma** `diagram` (grep por `diagram|layout`
retorna só uma menção incidental em `dbviewer/spec.md:8`).
Restrições de processo: `AGENTS.md` ("Agent-Specific Instructions": *"do not start v2 code
outside that flow"*) e `openspec/config.yaml` (contexto: *"v2 code may be introduced only
through OpenSpec changes"*), além das regras por artefato no próprio `config.yaml`
(proposal com Non-goals e ~500 palavras; design com seção `Migration Plan`; scenarios
com exatamente `#### Scenario:`; tasks `## N.` + `- [ ] N.x` terminando em `Validate`
e `Archive`).
→ O modelador ER exige **change novo com capability nova** (ou delta em capability
existente, ex.: `project-api` para os endpoints + `audit-log` para o evento + capability
nova para o layout).

### I10 — Ordem de colunas divergente entre viewer legado e v2 (decisão de produto)
O change ativo faz o **viewer legado** ordenar PK+alfabético no render
(`legacy/dbviewer.js:272-288,314`), enquanto o v2 persiste ordem de SQL:
`position = índice do payload` (`adapter.ts:417` tabelas, `439` colunas, `471` relationships)
e o export devolve `columns` nessa ordem.
→ O canvas ER vai exibir ordem diferente do DBViewer para o mesmo JSON. Não é bug,
mas é decisão a registrar (seguir `position` ou replicar a ordenação do viewer).

### I11 — Change ativo com delta em capability errada (bloqueio de archive)
Ver item 8.3: `openspec/changes/sort-columns-by-pk-alphabetical/specs/dbviewr/spec.md`
→ `openspec validate` avisa *"Archive would refuse this delta: dbviewr: target spec does not exist"*.
Não bloqueia a implementação do diagrama, mas **bloqueia o fluxo de archive** se o
próximo change herdar o mesmo padrão de diretório, e mantém `openspec list` com
"5/9 tasks" pendente desde 28/06/2026.

### I12 — Sem `requireRole` não há distinção VIEWER×leitura nos GETs novos (escolha a tomar)
Hoje `GET /api/projects/:id` e `GET .../export` não têm `requireRole`
(`projects.ts:49,76`) — qualquer autenticado lê. Se o plano quiser `GET /diagram`
"VIEWER lê", basta seguir o mesmo padrão (sem `requireRole`); **mas** se a rota for
acessível por API key (I7), o `projectScope` já funciona porque
`PROJECT_PATH = /^\/api\/projects\/([^/]+)/` (`credential.ts:35`) casa
`/api/projects/:id/diagram`.
**SUPOSIÇÃO**: o plano assume `requireRole('MEMBER')` só no PUT — coerente com
`route-protection.test.ts:39-98`, que seria o teste a estender para o PUT do diagrama.

---

## 10. Verificações executadas (reais)

| Verificação | Resultado |
|---|---|
| Probe de comportamento do PUT (`bun` sobre `persistence/.../adapter.ts` + `model-mapper.ts` + `validation.ts`, DB temporário) | `PROBE OK` — atomicidade coluna+relationship confirmada; ids regenerados (`false`); relationship dangling aceita e coluna não criada; chave `diagram` descartada pelo zod; evento `project.saved` gravado com actor/subject |
| `bun test apps/api/src/tests/audit-coverage.test.ts route-protection.test.ts export.test.ts credential.test.ts` | **26 pass, 0 fail, 152 expect() calls** |
| `cd legacy && node tests/dbviewer.test.js` | `dbviewer.test.js: ok` |
| `openspec list` | `sort-columns-by-pk-alphabetical  5/9 tasks  28/06/2026` |
| `openspec validate sort-columns-by-pk-alphabetical` | válido + INFO: archive recusaria delta `dbviewr` |
| `git status --porcelain` antes/depois | 12 arquivos modificados **pré-existentes** (LICENSE, SECURITY, THIRD_PARTY_NOTICES e 9 specs em `openspec/specs/`) — inalterados por esta análise; nenhum commit, nenhum install, nenhum build |

---

## 11. Suposições (marcadas, não verificadas)

- **SUPOSIÇÃO** — `diagram_layouts` seguirá o shape do doc 04
  (`docs/analysis/04-proposta-modelo-er.md:100-111`): `(id, project_id FK, zone_name,
  positions_json, zoom, updated_at, updated_by)` + `UNIQUE(project_id, zone_name)`.
  Esse shape é compatível com o padrão `uniqueIndex` já usado em `tables`
  (`db/schema.ts:93`) e com a FK cascade (`schema.ts:77-79`); como a chave do layout
  é **nome de tabela** dentro do JSON, não há FK para `tables.id` (coerente com I2).
- **SUPOSIÇÃO** — a migração da tabela nova será `0005_*` (próximo idx do `_journal.json`,
  que hoje termina em `idx: 4`).
- **SUPOSIÇÃO** — `GET /diagram` sai sem `requireRole` (leitura para qualquer autenticado)
  e `PUT /diagram` com `requireRole('MEMBER')`, espelhando `projects.ts:49/55`.
- **SUPOSIÇÃO** — a Fase 7 não exporá layout via MCP/API key (logo I7 é só uma nota,
  não um trabalho imediato).
- **SUPOSIÇÃO** — o change `sort-columns-by-pk-alphabetical` está parado por
  esquecimento (não há registro de bloqueio no repositório).
