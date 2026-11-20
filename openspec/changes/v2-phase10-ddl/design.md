# Design

## Context

Ver `proposal.md` — Why. Restrições do repositório que moldam a solução:

- O contrato v1 (`packages/domain`) não tem DDL, índices, views nem
  nullability; o gerador só pode usar o que existe: nome, `type`, `primary_key`,
  `foreign_key`, relationships `parents`/`children` e `status`.
- A fronteira de persistência (`scripts/check-persistence-boundaries.ts`) proíbe
  drizzle em `routes/`/`services/`: tabela nova exige `schema.ts` + migração +
  `ports.ts` + `adapter.ts`.
- Ids internos de tabela/coluna regeneram a cada `PUT` (doc 09 A2): qualquer
  dado persistido por DDL deve ser chaveado por **nome**.
- `audit-log` enumera mutações e o teste é tabela-driven; rota mutante nova
  exige caso novo no array e no texto da spec.
- `packages/sql-parser` e `packages/model-diff` são puros e testáveis — o
  gerador segue o mesmo padrão.

## Goals / Non-Goals

**Goals:**

- Um pacote puro que transforma `DatabaseModel` em SQL determinístico, com
  dialeto e modo, e um diff estrutural contra um baseline.
- Baseline capturado automaticamente no import e de forma explícita, auditado.
- Preview confiável: avisos de tipo desconhecido e lista de operações
  destrutivas antes de qualquer download.

**Non-Goals:**

- Executar o script, conectar no banco ou guardar credenciais.
- Introspecção (reverse engineering) de banco vivo.
- Índices, views, triggers, sequences, defaults e nullability (fora do modelo).
- Exposição via MCP/API key (mesma decisão de escopo da Fase 7, doc 09 A7).

## Decisions

**D1 — Pacote novo `packages/ddl`, puro e sem dependências.**
Exporta `generateCreateScript(model, options)` e
`generateMigrationScript(baseline, model, options)`, onde `options =
{ dialect: 'postgres' | 'mysql', renames? }`, devolvendo
`{ statements, destructive, warnings }`. Alternativa: implementar em
`apps/api/src/services` — descartada: a fronteira proíbe lógica pesada em
services e perderíamos o teste unitário isolado.

**D2 — Diff estrutural próprio, não o `model-diff` do wizard.**
`model-diff` devolve um plano de UI (`kind: same|oldOnly|newOnly`, `status`,
rename assistido) que não cobre FKs adicionadas/removidas nem diferenças de tipo
por coluna de forma direta. O diff do DDL compara baseline × modelo por nome de
tabela/coluna e é exercitado com testes de tabela. O `model-diff` continua sendo
o motor do wizard, sem alteração.

**D3 — Baseline em tabela nova `schema_baselines`.**
`(project_id TEXT PRIMARY KEY REFERENCES projects(id), document_json TEXT,
captured_at TEXT, captured_by TEXT)`. Guarda apenas estrutura (tabelas, colunas,
tipos, PK e FKs), serializada na ordem do modelo, sem descrição/termos. Uma
linha por projeto (último baseline); histórico fica no `events`. Alternativa:
guardar em `projects.baseline_json` — descartada: `migration.test.ts` compara
`PRAGMA table_info('projects')` com `toEqual` e a coluna quebraria o teste.

**D4 — Captura no apply do import, na mesma transação.**
O apply já substitui o modelo via `repository`; a gravação do baseline entra no
mesmo `transaction` do adapter (porta nova `saveDdlBaseline`). Se o apply falha,
nada é gravado. Alternativa: segunda chamada depois do apply — descartada por
deixar estado divergente se a segunda falhar.

**D5 — Geração via `GET /api/projects/:id/ddl`.**
Query: `dialect` (`postgres` default, `mysql`), `mode` (`create` default,
`migration`) e `renames` (JSON compacto:
`{"tables":{"cliente":"clientes"},"columns":{"cliente.cpf":"documento"}}`).
GET porque não muta nada e não deve gerar evento; corpo de resposta
`{ dialect, mode, script, statements, destructive, warnings }`. Renomeações são
raras, então o tamanho de query é aceitável; JSON inválido → `400` com
`DDL_INVALID_RENAMES`. Alternativa: `POST` para fugir do limite de URL —
descartada porque um POST não-mutante confunde a varredura de mutações do
`audit-log`.

**D6 — Mapa de tipos explícito por dialeto.**
`integer/int`, `serial`, `varchar(n)`/`varchar`, `char(n)`, `text`,
`decimal(p,s)`/`numeric`, `date`, `timestamp`, `boolean`. `serial` vira
`SERIAL` no Postgres e `INT ... AUTO_INCREMENT` no MySQL (quando PK). Tipo fora
do mapa é emitido como está e entra em `warnings`. Alternativa: biblioteca de
dialetos (knex/drizzle-kit) — descartada: dependência grande e dialeto duplicado
com o `drizzle-kit` que já usamos só para migrações internas.

**D7 — Renomeação só explícita, com aviso de perda de dados.**
Sem `renames`, tabela que sai e outra que entra viram `DROP`+`CREATE`; o
response marca o par como destrutivo e a UI mostra o aviso antes do download. O
wizard já tem o mesmo princípio (renames explícitos, nunca inferidos), então o
comportamento é consistente no produto.

**D8 — Diálogo "Gerar SQL" no workspace.**
Abre pelo header (e, na Fase 11, pela toolbar do diagrama). Estado local:
dialeto, modo, mapeamentos, resposta. Download via `Blob` + `URL.createObjectURL`
e cópia via `navigator.clipboard`, sem rota de app nova. `VIEWER` vê o botão
(geração é leitura), mas não o "Marcar como sincronizado".

## Risks / Trade-offs

- [DDL errado em casos de borda (FK que referencia tabela removida, ALTER
  encadeado no MySQL)] → gerador valida a coerência do modelo antes de emitir
  (FK órfã vira `warning` + statement comentado) e os testes cobrem os pares
  criar/remover/trocar tipo por dialeto.
- [Baseline desatualizado em relação ao banco real] → ação "Marcar como
  sincronizado" e aviso no preview com a data do baseline; o script é sempre
  revisável antes de executar.
- [Query string com `renames` grande estoura o limite do servidor] → limite
  explícito (ex.: 200 entradas) com `400` claro; acima disso a fase futura pode
  trocar para POST.
- [Tipos desconhecidos geram DDL inválido no banco alvo] → nunca falham a
  geração; viram `warnings` destacados no preview e no topo do `.sql` como
  comentário.

## Migration Plan

1. **Banco**: `bun run db:generate` cria migração aditiva com
   `schema_baselines`; `bun run db:migrate` aplica. Nenhuma tabela existente é
   alterada. Rollback = `DROP TABLE schema_baselines` (perde só baselines; a
   geração em modo `create` continua funcionando).
2. **Pacote**: `packages/ddl` entra no workspace (`package.json`, tsconfig,
   typecheck raiz) sem dependências externas.
3. **Código**: rotas novas + evento `ddl.baseline_captured` (array do teste de
   auditoria + `ACTION_FAMILIES` da UI de auditoria); comportamento anterior
   preservado (nenhuma rota existente muda).
4. **Gate**: `bun run check` e `bun run test:e2e` verdes; `openspec validate
   v2-phase10-ddl --strict` = 0.
