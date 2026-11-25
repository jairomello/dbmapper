# Proposal

## Why

A árvore exibe as tabelas na ordem em que vieram do modelo/importação, o que
parece uma ordem por status de revisão e dificulta localizar uma tabela pelo
nome. Também não há como olhar só o que falta revisar.

## What Changes

- As tabelas da árvore passam a ser ordenadas **alfabeticamente** (locale
  `pt-BR`, sem diferenciar maiúsculas, com numeração natural), independente da
  ordem do modelo.
- Acima da lista, um filtro segmentado **Todas / Aprovadas / Pendentes** (padrão
  **Todas**) filtra por `reviewed` da tabela.
- Busca e filtro se combinam; a contagem `Tabelas N` reflete o resultado.
- Colunas continuam na ordem do schema e o nó raiz do banco permanece no topo.

## Capabilities

### New Capabilities

_None._

### Modified Capabilities

- `schema-tree` (delta ADDED): ordenação alfabética e filtro por estado de
  revisão.

## Non-goals

- Filtrar por colunas, status de mudança (`NEW`/`RENAMED`) ou cobertura.
- Mudar a ordem das tabelas no diagrama ou no export.

## Impact

- **Frontend**: `SemanticTree` (ordenação, estado do filtro e controles).
- **Testes**: componente cobrindo ordem e filtros.
- **Contrato/API**: intactos.
