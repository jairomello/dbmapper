# Tools MCP do DBMapper

O servidor MCP (`apps/mcp`) expõe nove tools sobre o dicionário do DBMapper.
O catálogo em `apps/mcp/src/catalog.ts` é a fonte única: esta página e o guard de
catálogo (`bun run test:mcp-catalog`) leem os mesmos nomes, descrições e schemas.
A identidade vem sempre da API key (`DBMAPPER_API_KEY`); nenhuma tool aceita
argumentos de identidade.

## Argumentos comuns

- `projectId` (string, opcional na maioria das chamadas) — ID do projeto.
  Pode ser omitido quando `DBMAPPER_PROJECT_ID` está configurado no ambiente do
  cliente. Sem argumento e sem env, a chamada falha com `VALIDATION_ERROR`.
- `itemType` (string, enum `table` | `column` | `relationship`) — onde aparece,
  identifica o tipo do item do dicionário.
- Os IDs de tabela, coluna e relacionamento (`itemId`) vêm das tools de leitura;
  nunca são inventados.

Todas as respostas de sucesso são JSON em `content[0].text`.

## Visão geral e leitura

### get_project_overview

Resumo do projeto: nome, cobertura de descrições (itens descritos e aprovados) e
sugestões pendentes. Não altera nada.

**Argumentos:** `projectId` (opcional com `DBMAPPER_PROJECT_ID`).

**Resposta:**

```json
{
  "project": { "id": "...", "name": "...", "description": "...", "reviewed": false, "databaseName": "..." },
  "coverage": {
    "totalItems": 0,
    "describedItems": 0,
    "approvedItems": 0,
    "describedPercent": 0,
    "approvedPercent": 0
  },
  "pendingSuggestions": 0,
  "missingDescriptions": 0
}
```

A contagem de cobertura é derivada do modelo com regras simples e é informativa;
o número oficial continua sendo o da UI (`coverage-stats`).

### list_missing_descriptions

Lista os itens sem descrição, com filtro opcional por tabela e tipo de item.

**Argumentos:**

- `projectId` (opcional com `DBMAPPER_PROJECT_ID`).
- `table` (string, opcional) — nome exato da tabela.
- `itemType` (opcional, `table` | `column` | `relationship`).

**Resposta:** `{ projectId, project, filters, count, items[] }`, onde cada item
traz `itemType`, `itemId`, `table`, `name`, `type` (colunas), `description` e
`reviewed`.

### get_table

Detalha uma tabela: descrição, revisão, colunas e relacionamentos com os IDs dos
itens.

**Argumentos:**

- `projectId` (opcional com `DBMAPPER_PROJECT_ID`).
- `table` (string, obrigatório) — nome da tabela.

**Resposta:** `{ projectId, table }` com `itemId`, `name`, `description`,
`reviewed`, `status`, `businessTerms`, `columns[]` (`itemId`, `name`, `type`,
`primaryKey`, `foreignKey`, `description`, `reviewed`) e `relationships[]`
(`itemId`, `targetTable`, `localColumns`, `referencedColumns`, `constraintName`,
`description`, `reviewed`). Tabela inexistente → `isError` com `NOT_FOUND`.

### get_column

Detalha uma coluna (tipo, PK/FK, descrição) e as descrições das colunas vizinhas.

**Argumentos:**

- `projectId` (opcional com `DBMAPPER_PROJECT_ID`).
- `column` (string, obrigatório) — nome da coluna.
- `table` (string, opcional) — obrigatório quando o nome da coluna existe em mais
  de uma tabela; sem ele a chamada falha com `VALIDATION_ERROR`.

**Resposta:** `{ projectId, table: { name, description, reviewed }, column:
{ itemId, name, type, primaryKey, foreignKey, description, reviewed,
businessTerms }, neighbors[] }`, com `neighbors` listando `name`, `type`,
`description` e `reviewed` das outras colunas da mesma tabela.

## Escrita

### set_description

Grava a descrição de uma tabela, coluna ou relacionamento. A descrição fica como
**não revisada**: a aprovação é exclusivamente humana.

**Argumentos:**

- `projectId` (opcional com `DBMAPPER_PROJECT_ID`).
- `itemType` (obrigatório, `table` | `column` | `relationship`).
- `itemId` (string, obrigatório) — ID devolvido pelas tools de leitura.
- `description` (string, obrigatório, até 20000 caracteres).

**Resposta:** `{ item, warning }`, onde `item` traz `itemType`, `itemId`,
`description`, `descriptionSource` (`mcp`), `reviewed` (`false` em mudança real)
e `changed`. O `warning` sempre informa que o item ficou como não revisado.

O endpoint grava com `description_source='mcp'`, reabre a revisão quando o valor
muda e registra um evento de auditoria na mesma transação.

## Ciclo de sugestões

### list_suggestions

Lista sugestões do agente com o contexto armazenado, filtráveis por status.

**Argumentos:**

- `projectId` (opcional com `DBMAPPER_PROJECT_ID`).
- `status` (opcional, `pending` | `applied` | `rejected`; padrão `pending`).

**Resposta:** `{ projectId, status, count, suggestions[] }`.

### apply_suggestion

Aplica uma sugestão pendente do agente. A decisão usa CAS: uma sugestão fora de
`pending` vira erro `409` (`isError: true`), nunca sucesso silencioso.

**Argumentos:**

- `projectId` (opcional com `DBMAPPER_PROJECT_ID`).
- `suggestionId` (string, obrigatório) — ID da sugestão.

**Resposta:** o corpo da API de apply acrescido de `projectId`.

### reject_suggestion

Rejeita uma sugestão pendente do agente, com a mesma regra CAS do apply.

**Argumentos:**

- `projectId` (opcional com `DBMAPPER_PROJECT_ID`).
- `suggestionId` (string, obrigatório) — ID da sugestão.

**Resposta:** o corpo da API de reject acrescido de `projectId`.

## Export

### get_export

Exporta o projeto no contrato JSON v1 consumido pelo DBViewer. Não altera nada.

**Argumentos:** `projectId` (opcional com `DBMAPPER_PROJECT_ID`).

**Resposta:** `{ database: { ... } }` no contrato v1 documentado no
[`README`](../README.md#como-o-modelo-é-estruturado).

## Erros

Toda falha é um resultado `isError: true` cujo texto é
`{ "error": { "code", "message", "status"? } }`. Stack traces, corpos crus e
material de chave nunca aparecem.

| `code` | Quando ocorre |
| --- | --- |
| `MCP_CONFIG_ERROR` | `DBMAPPER_API_KEY` ou `DBMAPPER_URL` ausente/inválida |
| `VALIDATION_ERROR` | argumento fora do schema, `projectId` ausente ou coluna ambígua |
| `UNKNOWN_TOOL` | nome de tool fora do catálogo |
| `NOT_FOUND` | tabela, coluna ou item inexistente no projeto |
| `UNAUTHORIZED` / `INVALID_API_KEY` | chave revogada, expirada ou inválida |
| `FORBIDDEN` | projeto fora do escopo da chave ou papel insuficiente (`VIEWER` escrevendo) |
| `CONFLICT` (409) | decisão CAS sobre sugestão que não está mais `pending` |
| `NETWORK_ERROR` | API inacessível (retryable) |
| `INVALID_RESPONSE` | resposta não-JSON ou malformada (sem eco do corpo) |
| `API_ERROR` / `INTERNAL_ERROR` | erro inesperado da API ou do adaptador |

Use `retryable` e `Retry-After` quando presentes; não repita validação,
autorização ou conflito permanentes.
