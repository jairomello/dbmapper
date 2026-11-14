# Análise da codebase DBMapper — Relatório v1

- **Data:** 2026-11-14
- **Escopo:** leitura estática da codebase em `/mnt/shared/projetos/dbmapper` (repo `jairomello/dbmapper`), specs OpenSpec e testes.
- **Método:** leitura de todos os arquivos de raiz, das 8 specs em `openspec/specs/` e execução dos 5 testes (`node tests/*.test.js` — todos saem com `ok`, exit 0).
- **Base para:** proposta de evolução para servidor multi-usuário com auth + agente de IA + MCP (stack bun+react+sqlite).

---

## 1. Visão geral e propósito

DBMapper é um **app web 100% estático** (HTML/CSS/JS puro, sem build, sem package manager, sem backend) para autoria de uma **camada semântica** (dicionário de dados) sobre um schema relacional. O fluxo é:

1. Usuário importa um `.sql` → parser próprio monta tabelas/colunas/FKs.
2. Usuário escreve **descrições**, **termos de negócio** (chips) e **aprova** cada item (`reviewed`).
3. O modelo é **exportado como JSON** (contrato do dicionário) e consumido pelo **DBViewer** (visualizador somente leitura).
4. Quando o banco físico muda, o usuário roda o **wizard "Atualizar Modelo"**, que faz diff entre o projeto atual e um novo SQL, preservando metadados.

Segundo o `README.md:7-9`, a proposta é "alimentar IAs e documentação com metadados de negócio … sem acoplar o modelo a um banco ou a um schema físico específico" — ou seja, o JSON exportado já é pensado como insumo para IA, o que alinha com o objetivo futuro de agente + MCP.

**Características estruturais:**

| Aspecto | Estado atual |
|---|---|
| Runtime | Navegador puro; estado em memória (`projectData` global) |
| Persistência | Só arquivo: download JSON + `FileReader` de import |
| Segurança | CSP meta + SRI + sem scripts inline (`dbmapper.html:6,15,310-311`) |
| Multi-usuário | Inexistente |
| Testes | 5 scripts Node `assert` (sem framework, sem deps) |
| Dependências CDN | Materialize CSS/JS 1.0.0 (cdnjs), Google Fonts |

---

## 2. Arquitetura atual

### 2.1 Módulos de `app.js` (2.177 linhas, 81 KB)

`app.js` é um único arquivo com estado global, parser, diff engine, render de DOM imperativo e persistência. Faixas reais de linha:

| Faixa | Seção | Responsabilidade |
|---|---|---|
| `app.js:1-24` | Global State | `projectData`, `currentSelectedItem`, `collapseState`, `hasLoadedProject`, `updateWizardState`, `sqlDatabaseName` |
| `app.js:26-38` | `createIcon` | helper Materialize (com fallback p/ Node) |
| `app.js:40-114` | Init / `setupEventListeners` | `DOMContentLoaded`, `M.AutoInit`, wiring dos botões |
| `app.js:116-238` | **SQL Parsing** | `handleSQLUpload` (118), `parseSQLToTables` (147) |
| `app.js:240-346` | Parser helpers | `splitSqlDefinitions` (240), identificadores (281-309), FK inline/constraint (311-346) |
| `app.js:348-452` | ALTER + normalização | `parseAlterTableForeignKeys` (348), `normalizeRelationships` (416) |
| `app.js:454-506` | `parseSQL` / **`mergeSchemas`** (458-506) | merge que preserva descrições — **não é chamado pela UI** (ver §3.3) |
| `app.js:508-536` | `cloneColumn` / `cloneTable` | imutabilidade no diff |
| `app.js:538-819` | **Wizard diff engine** | `createUpdateWizardState` (538), `buildTableRows` (555), `getUsedTableRenameTargets` (599), `buildTablePlans` (605), `buildColumnGroups` (648), `buildColumnRows` (663), `getUsedColumnRenameTargets` (741), `applyUpdateWizardState` (747) |
| `app.js:821-897` | **Stats / Status bar** | `computeStats` (823), `renderStatusBar` (851), `updateUpdateModelButton` (893) |
| `app.js:899-1528` | **Wizard UI** | abrir/fechar/upload (899-941), navegação (943-992), `renderUpdateWizard` (994), grid de tabelas (1093), de colunas (1177), de relacionamentos (1393), `renderUpdateSummary` (1474) |
| `app.js:1530-1756` | **Render da árvore** | `makeTreeItem` (1532), `makeCheckbox` (1538, **sem chamadas**), `makeReviewButton` (1548), `getItemSemanticStatus` (1559), `makeSemanticBadge` (1585), `renderTreeView` (1594) |
| `app.js:1758-1950` | **Selection & Editor** | `selectItem` (1760), `loadItemToEditor` (1771), painel de relacionamentos (1860), `persistEditorFields` (1892), `saveCurrentItemChanges` (1905), `updateEditorReviewAction` (1916), `toggleCurrentItemReview` (1935) |
| `app.js:1952-1977` | Review inline | `toggleReview` (1954) |
| `app.js:1979-2000` | Collapse | `toggleCollapse` / `toggleCollapseAll` |
| `app.js:2002-2111` | **Persistence** | modal de save (2004-2041), `downloadProjectJSON` (2043), `handleJSONUpload` (2056) |
| `app.js:2113-2156` | Save filename helpers | `buildTimestamp`, `stripTimestampPrefix`, `slugifyBaseName`, `resolveBaseName`, `suggestSaveFilename`, `sanitizeUserFilename` |
| `app.js:2158-2177` | `module.exports` | exporta funções puras para os testes Node (`setProjectData` injeta o estado global) |

Observação de arquitetura: o arquivo mistura **lógica pura** (parser, diff, stats, filename — testável, exportada) com **DOM imperativo** (render via `innerHTML`/`createElement`, toasts `M.toast`), separadas por convenção de comentário (`// ── … ──`) e não por módulos ES — não há `import`/`export`, apenas `require` condicional para Node.

### 2.2 Papel dos arquivos raiz

| Arquivo | Linhas | Papel |
|---|---|---|
| `dbmapper.html` | 313 | Shell do editor: navbar, sidebar (`#tree-view`), área do editor (`#editor-area`), barra de status (`#status-bar`, grupos 1–6), modal do wizard (`#update-modal`, ln. 244) e modal de save (ln. 277). CSP em ln. 6; Materialize com SRI em ln. 15/310. |
| `app.js` | 2.177 | Toda a lógica do editor (ver tabela acima). |
| `style.css` | 1.516 | Design system do editor; inclui `.tree-checkbox` (ln. 441-464) — CSS legado de um checkbox de revisão que a UI não usa mais. |
| `dbviewer.html` | 118 | Visualizador somente leitura (mesmo contrato JSON). |
| `dbviewer.js` | 457 | Estado + carga JSON + busca + navegação + tema. **Duplica** lógica do editor: `normalizeRelationship` (47), `relationshipKey` (56), `normalizeRelationships` (74), `computeStats` (147), `sortColumns` (272). `localStorage` só para tema (ln. 404, 456). |
| `dbviewer.css` | 907 | Design system do viewer (tema claro/escuro). |
| `example.sql` | ~17 | Fixture de teste (3 `CREATE TABLE`, sem FKs, com `UNIQUE`). |
| `tests/` | 5 arquivos / 696 linhas | Contrato executável (ver §8). |
| `openspec/specs/` | 8 capacidades | Contrato comportamental (ver §7). |
| `README.md`, `AGENTS.md`, `SECURITY.md`, `CONTRIBUTING.md`, `LICENSE`, `THIRD_PARTY_NOTICES` | — | Documentação; `AGENTS.md` fixa o fluxo de testes e o estilo (4 espaços, texto de UI em PT). |

---

## 3. Parser SQL

### 3.1 O que suporta

Implementação em `parseSQLToTables` (`app.js:147-238`), apoiada por `splitSqlDefinitions` (240-279) e `parseAlterTableForeignKeys` (348-369). Contrato em `openspec/specs/sql-import/spec.md`.

| Suporte | Como é feito | Onde |
|---|---|---|
| `CREATE DATABASE` / `CREATE SCHEMA` (último que aparecer) | regex `dbRegex`, guarda em `sqlDatabaseName` | 154-159 |
| `CREATE TABLE [IF NOT EXISTS] [schema.]nome`, com aspas `"`, `` ` ``, `[]` | regex `tableRegex` com corpo entre `(...)` | 161-166 |
| Remoção de comentários `--` e `/* */` | `replace` antes de parsear | 151-152 |
| Definições multi-linha e vírgulas internas (`decimal(10,2)`, `DEFAULT (…)`) | splitter com contador de parênteses **e** de aspas (aspas escapadas `''`) | 240-279 |
| Nome + tipo de coluna (tipo em minúsculas, com argumentos) | regex por linha `colMatch` | 204-208 |
| `PRIMARY KEY` inline | `/\bPRIMARY\s+KEY\b/` na linha | 209 |
| `PRIMARY KEY (a, b)` em constraint de tabela | `parseColumnListFromConstraint` + `markColumnAsPrimaryKey` | 184-187, 301-304, 371 |
| `FOREIGN KEY (…) REFERENCES t (…)` nomeado (`CONSTRAINT fk_x …`) | `parseForeignKeyConstraint`; nome extraído por `extractConstraintName` | 189-193, 306-334 |
| FK inline `REFERENCES t (c)` na coluna | `parseInlineForeignKey`; seta `foreign_key` nas colunas locais | 218-219, 336-346, 381-385 |
| `ALTER TABLE [IF EXISTS] [schema.]t ADD [CONSTRAINT n] FOREIGN KEY (…) REFERENCES r (…)` | regex única; **pula** silenciosamente se a tabela alvo não existir no arquivo | 348-369; spec `sql-import` L65-76 |
| Identificadores qualificados em schema (`public.users` → `users`) | `cleanTableIdentifier` pega a última parte | 287-293 |
| Normalização bidirecional pai/filho + deduplicação | `normalizeRelationships` + `dedupeRelationships` (chave `table\|locals\|refs`) | 398-452 |
| Erro claro quando não há `CREATE TABLE` | `throw` com mensagem fixa (contratada na spec) | 231-233 |

### 3.2 O que **não** suporta

| Não suportado | Evidência / efeito |
|---|---|
| **`CREATE VIEW` / `CREATE OR REPLACE VIEW`** | Nenhuma menção a `VIEW` em `app.js` — views são invisíveis para o modelo. |
| **`CREATE INDEX` / índices** | Nenhuma tratativa; índices não entram no JSON. |
| **`CHECK` e `UNIQUE`** | **Descartados de propósito**: linhas começando com `CONSTRAINT`, `UNIQUE`, `CHECK`, `KEY ` são puladas (`app.js:195-202`). Não há flag `unique`/`check` na coluna — ver `example.sql` (`email VARCHAR(100) UNIQUE` vira coluna comum). |
| **`ALTER TABLE … ADD COLUMN`, `DROP`, `RENAME`, `ALTER TYPE`, `SET NOT NULL`** | Só existe a forma `ADD … FOREIGN KEY` (`app.js:351-354`). Alterações estruturais fora de FK são ignoradas — o wizard só as vê re-gerando o `CREATE TABLE` completo. |
| **`NOT NULL`, `DEFAULT`, `AUTO_INCREMENT`, `GENERATED`, `COMMENT ON`** | Não modelados: a coluna guarda só `name` + `type` (regex 204) e flags PK/FK. |
| **Índices/unique em constraints nomeadas não-PK/FK** | `CONSTRAINT … UNIQUE/CHECK` cai no ramo de skip (195-202). |
| **`TRIGGER`, `PROCEDURE`, `ENUM` como tipo composto, particionamento, CTE, `INSERT`** | Sem qualquer tratativa. |
| Normalização de tipos (`int4`→`int`, `varchar`→`text`) | Só `.toLowerCase()` (208) — `INT` e `int` viram o mesmo, mas `decimal(10, 2)` mantém espaço interno. |
| Detecção de renomes de tabela/coluna no parser | Não existe; renome é decisão manual no wizard (§4). |
| Views em schema com nome qualificado no `CREATE DATABASE` | O regex captura só o último token (154) e **sobrescreve** a cada match (último `CREATE DATABASE` vence, 156-158). |
| Parse de arquivos SQL muito estruturados com `)` dentro de strings não aspas adequadamente | `tableRegex` casa até o primeiro `)` seguido de `;`/`ENGINE`/fim (161) — é heurístico, não um parser de gramática. |

Também não há tratamento de encoding/dialeto (MySQL vs PostgreSQL vs SQL Server): o parser é genérico por regex e só elimina aspas/qualificação de schema.

### 3.3 `mergeSchemas` — código órfão

`mergeSchemas` (`app.js:458-506`) faria o merge preservando `description`, `business_terms` e `reviewed` (status `UNCHANGED`/`NEW`/`REMOVED`) e é usado apenas por `parseSQL` (`454-456`). **Nenhum dos dois é chamado pela UI**: `handleSQLUpload` (118-145) faz `projectData.database.tables = parseSQLToTables(sql)` (126) e zera `hasLoadedProject` (127). Consequência prática: **importar SQL destrói as descrições já escritas** e esconde o botão "Atualizar Modelo" — o caminho seguro para preservar metadados é o wizard. `mergeSchemas` não está em `module.exports` nem é coberto por teste: é candidato a remoção ou a reativação no rewrite.

---

## 4. Wizard "Atualizar Modelo" (diff de modelo)

Contrato: `openspec/specs/model-update-wizard/spec.md` (10 requirements, 31 cenários). Fluxo de 5 passos: `upload → tables → columns → relationships → summary` (`renderUpdateWizard`, `app.js:994-1074`; navegação 943-992).

### 4.1 Algoritmo de diff

1. **Estado inicial** (`createUpdateWizardState`, 538-553): clona `oldTables` (exceto `REMOVED`) e `newTables` com `cloneTable`/`cloneColumn` — o wizard nunca muta o projeto antes da confirmação (garantia reforçada na spec, cenário "Cancel discards wizard state").
2. **Tabelas** (`buildTableRows`, 555-597): matching **por igualdade exata de nome**.
   - nome nos dois lados → `kind: 'same'`, ação `keep`;
   - só no atual → `kind: 'oldOnly'`, ação padrão `delete` (alternativa `rename`);
   - só no novo → `kind: 'newOnly'`, ação `add`.
   - **Não há heurística automática de rename** (sem similaridade/estrutura): o usuário escolhe "Tabela mudou de nome" e seleciona o alvo num `<select>` (1115-1126).
3. **Planos** (`buildTablePlans`, 605-646): converte linhas em `matched | renamed | delete | add`; linhas `newOnly` cujo nome já foi usado como alvo de rename são **excluídas do plano de `add`** (`getUsedTableRenameTargets`, 599-603) — evita duplicar a tabela alvo.
4. **Colunas** (`buildColumnGroups` 648-661 → `buildColumnRows` 663-739): para cada plano de tabela, mesmo matching por nome exato; comparação de tipo gera `kind: 'changed'` (700) quando `oldCol.type !== newCol.type`. Rename de coluna manual com as mesmas regras (`getUsedColumnRenameTargets`, 741-745).
5. **Relacionamentos** (`buildRelationshipGroups`, 1324-1383): mapeia FKs antigas para os novos nomes de tabela/coluna (`buildTableNameMap` 1272, `buildColumnNameMaps` 1282, `mapOldRelationship` 1307) e compara por `relationshipKey` (398) → linhas `same | oldOnly (Remover FK) | newOnly (Adicionar FK)`.
6. **Resumo** (`renderUpdateSummary`, 1474-1528): 9 contadores (tabelas/campos +, −, renomeados, tipos atualizados, FKs ±) e a nota de preservação de metadados.

### 4.2 O que é aplicado (`applyUpdateWizardState`, 747-819)

| Plano | Efeito |
|---|---|
| `delete` (tabela) | tabela sai de `database.tables` (755) |
| `add` (tabela) | entra com `description: ""`, `business_terms: []`, `reviewed: false`, `status: 'NEW'` e colunas idem (757-775) |
| `renamed` / `matched` | **preserva** descrição/termos/revisão da tabela antiga; colunas mantêm metadados quando o nome foi mantido ou renomeado; tipo atualizado com `status: 'CHANGED'` quando mudou (787-801) |
| `add` (coluna) | metadados vazios + `status: 'NEW'` (795-801) |
| Relacionamentos | **sempre os do SQL novo** para tabelas mantidas/renomeadas (808-811) — o passo `relationships` é **somente informativo**, não há ação por linha (a spec diz "no per-row action beyond review", `model-update-wizard` L94-96). |
| Banco | `database.reviewed` recalculado como `every(table.reviewed)` (817) |

Após aplicar: limpa seleção, re-renderiza a árvore, fecha o modal e mostra `Modelo atualizado com sucesso!` (983-991).

### 4.3 Estados de item (usados no diff e na UI)

`status ∈ {'NEW', 'UNCHANGED', 'REMOVED', 'RENAMED', 'CHANGED'}` (badges "novo"/"renomeado"/"removido"/"tipo" em `renderTreeView`, 1671-1746). **Inconsistência:** o exemplo do `README.md:39` mostra `"status": "ACTIVE"`, valor que o código nunca produz nem valida — o contrato real é o dos 5 valores acima.

### 4.4 Lacunas do wizard

- Sem diff automático de rename (tudo manual);
- Sem comparação de `NOT NULL`/`DEFAULT` (o parser nem os extrai);
- Relacionamentos removidos/aceitos não são "desfazíveis" e o diff de FK é display-only;
- Sem histórico/undo da aplicação (só sobrescreve `projectData`);
- Estados de diff recalculados a cada render (1044-1074), sem memoização — problema potencial só em modelos muito grandes.

---

## 5. Workflow de revisão/aprovação de descrições (hoje)

### 5.1 Modelo de estado

Não há máquina de estados: apenas o booleano **`reviewed`** em `database`, `table`, `column` e (por normalização) em cada `relationship` (`normalizeRelationship`, `app.js:387-396`). O status semântico exibido é derivado em `getItemSemanticStatus` (`app.js:1559-1583`):

| Estado | Condição | Ícone / badge |
|---|---|---|
| `missing` | descrição vazia/só espaço | `edit_note` / "sem desc" |
| `review` | descrição preenchida, `reviewed: false` | `rate_review` / "revisar" |
| `approved` | descrição preenchida, `reviewed: true` | `verified` / "aprovado" |

### 5.2 Onde o usuário revisa (dois pontos de entrada)

1. **Botão inline na árvore** — `makeReviewButton` (`app.js:1548-1557`), criado para o banco (ln. 1625), cada tabela não-removida (ln. 1661) e cada coluna (ln. 1720); dispara `toggleReview` (`app.js:1954-1977`).
   - **Regra de liberação:** se `reviewed === false` e descrição vazia → toast `Preencha a descrição antes de aprovar.` e nada muda (1968-1971). Caso contrário, `item.reviewed = !item.reviewed` (1973) e re-render.
2. **Botão no editor** — `#btn-review-item` ("Aprovar Descrição" / "Reabrir Revisão", `dbmapper.html:117-119`; wiring em `app.js:108`), gerido por `updateEditorReviewAction` (`app.js:1916-1933`) e `toggleCurrentItemReview` (`app.js:1935-1950`).
   - **Desabilitado** enquanto a descrição do textarea estiver vazia (1922-1924) com título `Preencha a descrição antes de aprovar`;
   - ao aprovar: toast `Descrição aprovada.`; ao reabrir: `Descrição reaberta para revisão.` (1947);
   - o rótulo alterna entre `Aprovar Descrição` e `Reabrir Revisão` (1926-1929).

### 5.3 Regras adicionais importantes

- **Reabertura automática ao editar:** `persistEditorFields` (`app.js:1892-1903`) reseta `reviewed = false` se a descrição mudou em relação ao snapshot (`editorDescriptionSnapshot`) — item aprovado editado volta para "revisar" (spec `semantic-editor`, cenário "Editing an approved description reopens review", L44-46).
- **Salvar** (`saveCurrentItemChanges`, 1905-1914) grava em `projectData` e mostra `Alterações salvas temporariamente.` — "temporariamente" é literal: só existe no JSON exportado.
- **Aprovação conta só com descrição:** `computeStats` (`app.js:834-841`) só incrementa `revTables`/`revCols` quando `hasDescription && reviewed` — item aprovado sem descrição (improvável, dado o gate) não contaria; descrição sem aprovar conta só em `desc*`.
- **Banco:** `database.reviewed` é recalculado no apply do wizard (817); não há botão dedicado que aprove o banco inteiro de uma vez.

### 5.4 Sobre o "checkbox revisado"

**Hoje não existe checkbox na UI.** O que existe é:

- `makeCheckbox` (`app.js:1538-1546`, classe `tree-checkbox`) — **definido e nunca chamado** (único grep em `app.js`/`dbviewer.js` é a própria definição);
- CSS legado `.tree-checkbox` (`style.css:441-464`, comentado como "Checkbox de revisão");
- nenhum `input[type=checkbox]` em `dbmapper.html`.

Ou seja, o README (`README.md:18`, "marca/desmarca 'revisado'") descreve a intenção; a implementação atual é **botão** (`tree-review-btn` + `btn-review-item`), conforme a spec `schema-tree` ("Inline review toggle per item", `openspec/specs/schema-tree/spec.md:77-89`). Vale tratar isso como débito: ou remover o helper/CSS morto, ou restaurar o checkbox no rewrite.

### 5.5 Specs que governam o workflow

| Spec | Requirement | Conteúdo |
|---|---|---|
| `semantic-editor` L64-86 | *Review action* | botão aprovar/reabrir, gate por descrição não vazia, botão desabilitado com descrição vazia |
| `semantic-editor` L30-46 | *Description editing* | salvar re-renderiza e **reabre revisão** se aprovado |
| `schema-tree` L77-89 | *Inline review toggle* | toggle sem abrir editor + toast de bloqueio |
| `schema-tree` L61-75 | *Semantic status badge* | badges `sem desc` / `revisar` / `aprovado` |
| `coverage-stats` | *Reviewed coverage counters* | contadores de revisão na barra |

### 5.6 Lacunas do workflow (relevante para multi-usuário)

Sem **identidade do revisor**, sem **data/hora**, sem **histórico/audit trail**, sem estados intermediários (`draft`/`in_review`/`changes_requested`), sem **fluxo de 2 pessoas** (aprovar é auto-aprovação do próprio autor), sem **comentários** por item, sem trava de edição concorrente, sem aprovação em lote, e **relacionamentos não são editáveis** (o editor só lida com `database|table|column`, `getSelectedItem`, 1876-1890) — logo `relationship.description/reviewed` só vêm do JSON e os contadores `fksDesc`/`fksRev` da barra (`computeStats`, 843-846) ficam em `0/0` num projeto criado só pela UI.

---

## 6. Contrato JSON do modelo

**Fontes de verdade:** `openspec/specs/project-persistence/spec.md` (requirements *Project data model* L6-20, *Cross-consumer JSON contract*, *Relationship metadata fields*), forma inicial em `app.js:3-11`, backfill em `handleJSONUpload` (`app.js:2056-2111`), export em `downloadProjectJSON` (`2043-2054`, `JSON.stringify(projectData, null, 2)`) e exemplo no `README.md:28-65`.

```jsonc
{
  "database": {
    "name": "…",                 // default "Novo Banco"
    "description": "",
    "business_terms": [],
    "reviewed": false,
    "tables": [
      {
        "name": "…",
        "description": "",
        "business_terms": [],
        "reviewed": false,
        "status": "NEW|UNCHANGED|REMOVED|RENAMED|CHANGED",
        "relationships": {
          "parents":  [ { "table": "…", "local_columns": [], "referenced_columns": [],
                          "constraint_name": "", "description": "", "reviewed": false } ],
          "children": [ /* espelho derivado, nunca fonte primária */ ]
        },
        "columns": [
          { "name": "…", "type": "…", "primary_key": false, "foreign_key": false,
            "description": "", "business_terms": [], "reviewed": false,
            "status": "NEW|UNCHANGED|CHANGED|…" }
        ]
      }
    ]
  }
}
```

Pontos do contrato:

- **Backfill na importação** (`app.js:2066-2090`): campos ausentes ganham default (`reviewed: false`, `description: ""`, `business_terms: []`, `status: 'UNCHANGED'`, `relationships: {parents:[],children:[]}`) e as relações passam por `normalizeRelationships` — arquivos antigos continuam válidos.
- **Validação mínima:** só exige `json.database` (2064); qualquer estrutura interna é "consertada" por default, não rejeitada.
- **`children` é derivado:** `normalizeRelationships` (416-452) sempre reconstrói `children` a partir de `parents` e deduplica — consumidores podem confiar nesse invariante.
- **Nome do arquivo:** sugestão `AAAA-MM-DD-HH-MM-<base>.json` (`suggestSaveFilename`, 2144-2147; cadeia `resolveBaseName` 2131-2142: nome do projeto → `database.name` → `sqlDatabaseName` → `mapper`), sanitizada (`sanitizeUserFilename`, 2149-2156).
- **Consumidor:** `dbviewer.js` normaliza de novo (`normalizeProject`, ln. 113) e **omite deliberadamente** `reviewed`/status de revisão (spec `dbviewer`, *Viewer surface omits internal review status*).
- **Divergência conhecida:** `README.md:39` usa `"status": "ACTIVE"` (nunca produzido pelo código).

---

## 7. Specs OpenSpec × implementação (breve)

8 capacidades, **70 requirements / 171 cenários** em `openspec/specs/*/spec.md`:

| Capacidade | Req / Cen. | Teste executável | Situação |
|---|---|---|---|
| `sql-import` | 8 / 19 | `tests/sql-import.test.js` | Implementado e coberto |
| `model-update-wizard` | 10 / 31 | `tests/update-model.test.js` | Implementado e coberto (UI do wizard só indiretamente) |
| `coverage-stats` | 8 / 17 | `tests/coverage-stats.test.js` | Lógica coberta; render da barra sem teste |
| `project-persistence` | 11 / 32 | `tests/project-persistence.test.js` (helpers de filename) | Helpers cobertos; export/import DOM sem teste |
| `schema-tree` | 10 / 24 | — | Implementado, sem contrato executável |
| `semantic-editor` | 7 / 20 | — | Implementado, sem contrato executável |
| `dbviewer` | 10 / 16 | `tests/dbviewer.test.js` (regex sobre fontes) | Implementado; teste é de forma, não de comportamento |
| `static-site-security` | 6 / 12 | parcial em `dbviewer.test.js` | Implementado (CSP/SRI/no-inline em `dbmapper.html:6,15,310`) |

Todas as specs trazem os requisitos transversais "Capability Purpose paragraph" e "Page is served under the static-site-security controls". Há uma mudança aberta não arquivada: `openspec/changes/sort-columns-by-pk-alphabetical` (já refletida em `dbviewer.js` `sortColumns`, ln. 272 e no teste).

**Débito de specs:** `model-update-wizard` afirma que o botão "Avançar" constrói `columnGroups`/`relationshipGroups` (L61-64, L89-92) — isso de fato acontece em `goNextUpdateWizard` (963-975); mas nenhum requirement cobre a morte de `mergeSchemas`/`parseSQL`, que também não tem spec própria.

---

## 8. Testes (5 arquivos, 696 linhas) — todos passando

Executados em 2026-11-14: `node tests/*.test.js` → `… : ok`, exit 0 para os 5.

| Arquivo | Linhas | Cobre |
|---|---|---|
| `tests/sql-import.test.js` | 158 | 11 blocos: extração nome/tipo; PK inline; FK inline (`REFERENCES`); FK nomeado; identificadores entreaspados e qualificados em schema; tipo com vírgula interna (`decimal(10,2)`); `ALTER TABLE` com 2 FKs; `ALTER` de tabela inexistente pulado; normalização bidirecional; deduplicação; chamada direta de `parseAlterTableForeignKeys`/`normalizeRelationships` |
| `tests/update-model.test.js` | 240 | pipeline end-to-end: parse de fixture → `createUpdateWizardState` → `buildColumnGroups`/`buildRelationshipGroups` → `applyUpdateWizardState`, verificando preservação de descrição/reviewed em tabela mantida, `status: 'NEW'` e metadados vazios em adicionadas, `CHANGED` em tipo alterado, merge de FKs em projeto sem `relationships`, PK/FK propagados |
| `tests/coverage-stats.test.js` | 147 | 6 blocos: sem FKs; FKs não descritas; misto descrito/aprovado/pendente; FKs de tabela `REMOVED` não contam; descrição só-espaço não conta; backfill de `description`/`reviewed` em relationship |
| `tests/project-persistence.test.js` | 111 | helpers puros de filename: `buildTimestamp` (padding, fuso local), `stripTimestampPrefix`, `slugifyBaseName`, `resolveBaseName` (cadeia de fallbacks), `suggestSaveFilename`, `sanitizeUserFilename` (rejeição de vazio/espaço/caracteres) |
| `tests/dbviewer.test.js` | 40 | **testes de forma**: regex sobre `dbviewer.html/js/css` — ids esperados, tema claro/escuro, `localStorage` do tema, ausência de status de revisão no viewer, ausência de `<script>`/`<style>` inline, `sortColumns` com PK primeiro |

**Lacunas de teste:** nenhum teste de DOM/UI (editor, wizard, árvore, toasts); nenhum para `mergeSchemas` (código órfão); nenhum para `parseSQLToTables` com DDL não suportado (views/índices) documentando o comportamento; nenhum contrato executável para `schema-tree`/`semantic-editor`; `dbviewer.test.js` valida string-fonte, não comportamento — refatorar renomeando funções quebra o teste sem mudar comportamento.

---

## 9. Limitações para evoluir a servidor multi-usuário com IA

| Área | Limitação hoje | Impacto |
|---|---|---|
| **Auth** | Nenhum conceito de usuário/sessão; app aberto em qualquer `file://` ou estático | Precisa de camada de auth inteira (o `SECURITY.md` só trata do site estático) |
| **Multi-usuário** | Um `projectData` global por aba; sem concorrência, sem bloqueio, sem merge de edições | Edições simultâneas se sobrescreveriam no export/import manual |
| **Persistência** | Só download/Upload de JSON (`app.js:2043-2111`); `localStorage` só no viewer para tema | Sem histórico, sem versionamento, sem "salvar" automático (o toast literalmente diz "salvas temporariamente") |
| **Workflow de revisão** | Booleano `reviewed` sem autor/data/historial; auto-aprovação (§5) | Impossível auditoria, accountability, revisão por pares ou aprovação em lote |
| **Estado de app** | Estado global imperativo + `renderTreeView` re-renderiza tudo; sem virtualização | Escala limitada para milhares de colunas; difícil isomorfismo cliente/servidor |
| **Contrato de dados** | Validação por default-fill, não por schema (§6) | Um servidor precisa de schema (zod/JSON Schema) e versionamento do formato |
| **Parser** | Regex, DDL parcial (§3), sem diacletos | Agente de IA teria que compensar; `CREATE VIEW`/índices fora do modelo |
| **Segurança** | CSP `connect-src 'self'` e sem chamadas de rede; CDN Materialize por SRI | Em servidor: CSP precisa mudar; dependência CDN vira risco/latência a reavaliar |
| **Testes** | Só lógica pura; UI sem contrato | Refator para React quebra sem rede de segurança |
| **Duplicação** | `dbviewer.js` reimplementa normalização/stats (§2.2) | Duas fontes de verdade para o contrato a convergir |
| **Acesso a IA/MCP** | Nenhum ponto de extensão; sem API | Requer expor o modelo via API + MCP server; hoje o "API" é o arquivo JSON |
| **Relacionamentos** | Não editáveis na UI; `fksDesc`/`fksRev` permanentemente 0 | Gap funcional a decidir antes de virar feature server-side |

---

## 10. O que é reaproveitável num rewrite `bun+react+sqlite`

| Ativo | Reaproveitamento | Como |
|---|---|---|
| **Parser SQL** (`app.js:147-452`) | **Alto — quase 1:1** | Funções puras, sem DOM, já exportadas p/ Node. Extrair p/ pacote `@dbmapper/sql-parser` e manter `tests/sql-import.test.js` como contract. Limitação de escopo (§3.2) documentável, não bloqueante. |
| **Diff engine** (`app.js:538-819`) | **Alto** | Pura e testada: `buildTableRows`/`buildTablePlans`/`buildColumnRows`/`buildRelationshipGroups`/`applyUpdateWizardState` viram hook/reducer de React (`useReducer`) ou módulo TS. O estado do wizard já é um objeto serializável — ideal para etapas de servidor. |
| **Contrato JSON** (§6) | **Alto — é o core do SQLite** | Virar schema normalizado: `databases`, `tables`, `columns`, `relationships`, `review_events` (estender com `reviewed_by`, `reviewed_at`). Manter o shape atual como *formato de export/import* para compat com projetos existentes e com o DBViewer. `normalizeRelationships` (416-452) vira rotina de integridade. |
| **Lógica de stats** (`computeStats`, 823-849) | **Alto** | Pura; pode virar view SQL/endpoint. |
| **UI de revisão** (§5) | **Médio-alto (fluxo), Baixo (código)** | O modelo mental (3 estados semânticos `missing/review/review`, gate por descrição não vazia, reabertura automática ao editar, badges, toggle inline, aprovação no editor) é reutilizável como spec+componentes React; o código DOM imperativo não. O contrato semântico das specs (`semantic-editor`, `schema-tree`) vira acceptance criteria dos componentes. |
| **Helpers de filename/persistência** (2113-2156) | **Baixo** | Com servidor, save vira `PUT /projects/:id`; sugestão de nome só se mantém na exportação. |
| **DBViewer** | **Médio** | Pode virar rota read-only do app novo; antes, eliminar a duplicação de `normalizeRelationships`/`computeStats` unificando num pacote compartilhado. |
| **Testes** | **Alto** | Os 5 scripts já são contrato executável; migrar para `bun test` mantendo os mesmos asserts. `dbviewer.test.js` (regex de fonte) deve ser reescrito como teste de componente. |
| **Segurança estática** (CSP/SRI) | **Parcial** | Princípio "sem código inline" continua válido; CSP e SRI serão redefinidos para a arquitetura servida. |
| **Descartar** | `mergeSchemas`/`parseSQL` órfãos, `makeCheckbox` + `.tree-checkbox` CSS, `M.toast`/Materialize, render imperativo, `projectData` global | — |

**Recomendação de fatiamento sugerida pelo código:** (1) extrair parser + diff + normalização como pacote puro já coberto por teste; (2) definir o schema SQLite a partir do contrato JSON + estender `review` com autor/data/histórico; (3) reconstruir a árvore/editor/wizard em React reutilizando as specs como critérios de aceitação; (4) só então adicionar auth, API e o servidor MCP.

---

### Verificações realizadas

- Leitura integral de `app.js` (2.177 linhas), `dbmapper.html`, `README.md`, `AGENTS.md`, das 8 specs e dos 5 testes.
- Execução dos 5 testes: todos `ok`, exit 0.
- Greps confirmados: `makeCheckbox` sem chamadores; `parseSQL`/`mergeSchemas` sem chamadores na UI; `localStorage` presente apenas em `dbviewer.js` (tema); ausência de `VIEW`/`INDEX`/`TRIGGER`/`ADD COLUMN` em `app.js`.
