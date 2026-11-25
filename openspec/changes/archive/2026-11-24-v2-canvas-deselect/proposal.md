# Proposal

## Why

Depois de selecionar uma tabela no diagrama, não há como limpar a seleção sem
escolher outra tabela. Além disso, o arraste dos cards só funciona pela alça
`⠿` minúscula, enquanto o resto do cabeçalho parece arrastável — o usuário vê o
cursor de mão mas não consegue mover o card.

## What Changes

- Clicar no **canvas vazio** seleciona a raiz (banco), tirando o destaque da
  tabela/coluna, e fecha a ficha do item no modo Diagrama.
- O **cabeçalho inteiro** do card passa a ser a área de arraste (mantendo os
  botões de ação com `nodrag`), com cursor `grab`/`grabbing` e tooltip
  "Arraste para mover a tabela".

## Capabilities

### New Capabilities

_None._

### Modified Capabilities

- `diagram-canvas` (delta ADDED): limpar a seleção pelo canvas vazio e área de
  arraste do card no cabeçalho.

## Non-goals

- Um estado "nenhum item" separado da raiz do banco no modelo de seleção.
- Atalho de teclado para limpar a seleção.

## Impact

- **Frontend**: `DiagramCanvas` (`onPaneClick`), `TableNode` (cabeçalho como
  drag handle) e `WorkspacePage` (fechar a ficha ao voltar para a raiz).
- **Testes**: componente do canvas cobrindo o clique no vazio.
- **Contrato/API**: intactos.
