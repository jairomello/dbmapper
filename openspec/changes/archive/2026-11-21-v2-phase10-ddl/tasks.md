# Tasks

## 1. Pacote `packages/ddl`

- [x] 1.1 Criar o pacote puro `packages/ddl` (package.json, tsconfig, export em `src/index.ts`) e incluí-lo no `typecheck` raiz — verificação: `bun run typecheck` verde com o pacote vazio e sem dependências externas.
- [x] 1.2 Modelo de tipos por dialeto (`postgres`, `mysql`) com quoting de identificadores e mapa de tipos comuns; tipo desconhecido entra em `warnings` — verificação: testes de tabela cobrem cada tipo mapeado e o fallback com aviso.
- [x] 1.3 `generateCreateScript(model, options)`: `CREATE TABLE` de tabelas não-`REMOVED`, PK inline, FKs ao final, saída determinística e sem metadados — verificação: snapshot por dialeto + teste de estabilidade (duas chamadas idênticas) e de tabela `REMOVED` omitida.
- [x] 1.4 Diff estrutural baseline × modelo (tabelas/colunas criadas, removidas, tipo alterado; FKs adicionadas/removidas) — verificação: testes de tabela para cada classificação, incluindo FK órfã (vira aviso, não statement).
- [x] 1.5 `generateMigrationScript(baseline, model, options)` com `statements`, `destructive` e `warnings`; renames explícitos viram `ALTER ... RENAME`, ausência de mapeamento vira DROP+CREATE com aviso de perda — verificação: testes por dialeto cobrem rename mapeado, não mapeado e tipo alterado.

## 2. Backend: baseline e rotas

- [x] 2.1 Tabela `schema_baselines` em `apps/api/src/db/schema.ts` + migração (`bun run db:generate`) — verificação: `bun test apps/api/src/tests/migration.test.ts` verde e `PRAGMA table_info('schema_baselines')` lista `project_id`, `document_json`, `captured_at`, `captured_by`.
- [x] 2.2 `saveDdlBaseline`/`readDdlBaseline` em `ports.ts`/`adapter.ts`, serializando só estrutura e chaveando por nome — verificação: teste do adapter cobre roundtrip, substituição do baseline anterior e leitura ausente (`null`).
- [x] 2.3 `GET /api/projects/:id/ddl` com `dialect`/`mode`/`renames`, validação zod da query e erros `DDL_BASELINE_MISSING`/`DDL_INVALID_RENAMES` — verificação: testes de rota cobrem modo `create`, `migration` com e sem baseline, rename inválido e 404 de projeto.
- [x] 2.4 `PUT /api/projects/:id/ddl/baseline` (`MEMBER`+) gravando o baseline do modelo atual e emitindo `ddl.baseline_captured` na mesma transação; `VIEWER` recebe `403` — verificação: teste de rota + caso novo no array do teste de cobertura de auditoria.
- [x] 2.5 Capturar baseline no *apply* de `POST /api/projects/:id/import/apply` na mesma transação do modelo — verificação: teste confirma baseline igual à estrutura importada e nenhum evento quando o apply falha.
- [x] 2.6 Geração não escreve nada: nenhum evento e nenhum PUT interno — verificação: teste conta `events` e garante modelo/layout/baseline inalterados após duas gerações.
- [x] 2.7 `GET /api/projects/:id/ddl/baseline` devolvendo `{ baseline: { projectId, capturedAt, capturedBy, database } | null }` (mesma proteção do `GET /ddl`, sem evento) e o diálogo exibindo o estado REAL do servidor ao abrir — verificação: teste de rota cobre leitura com baseline, `null` sem baseline e ausência de evento; teste do diálogo afirma que, com baseline existente, a data aparece e o rótulo "Ainda não capturado" não é exibido.

## 3. Frontend: diálogo "Gerar SQL"

- [x] 3.1 Diálogo no workspace com seletor de dialeto e modo, botão de geração e estados de loading/erro — verificação: teste de componente cobre troca de dialeto/modo e erro `DDL_BASELINE_MISSING` com mensagem própria.
- [x] 3.2 Preview do script (área somente leitura, fonte monoespaçada), lista de operações destrutivas e avisos de tipo desconhecido/data do baseline — verificação: teste afirma que avisos e destrutivos aparecem e que o modo `create` não mostra avisos de rename.
- [x] 3.3 Mapeamento explícito de renomeações (tabelas e colunas) com aplicação na nova geração — verificação: teste preenche o mapa, regera e confirma a instrução de rename no script.
- [x] 3.4 Copiar para a área de transferência e baixar `.sql` — verificação: teste cobre `clipboard` e download com o conteúdo do preview.
- [x] 3.5 Ação "Marcar banco como sincronizado" (`MEMBER`+) que captura o baseline e invalida as queries — verificação: teste chama a rota, atualiza o estado e esconde a ação para `VIEWER`.
- [x] 3.6 Família `ddl.` no `AuditPage` e rótulo do novo evento — verificação: teste da página de auditoria lista `ddl.baseline_captured` com o rótulo.

## 4. E2e e docs

- [x] 4.1 E2e Playwright: login → importar SQL → abrir "Gerar SQL" → script completo (Postgres) → modo migração após editar um campo → baixar `.sql` → marcar como sincronizado — verificação: `bun run test:e2e` verde com o cenário novo.
- [x] 4.2 Documentar o fluxo (README: "Gerar SQL") e o novo evento em `docs/` — verificação: passos do README reproduzidos na UI batem com o texto.

## 5. Validate

- [x] 5.1 `bun run check` e `bun run test:e2e` — verificação: exit 0 nos dois.
- [x] 5.2 `openspec validate v2-phase10-ddl --strict` — verificação: exit 0.

## 6. Archive

- [x] 6.1 `openspec archive v2-phase10-ddl --yes` após o ok do Jairo, marcar o checkbox e commitar — verificação: `openspec list` sem o change e `openspec/specs/schema-ddl` existente.
