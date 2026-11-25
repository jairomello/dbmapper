# Proposal

## Why

Faltam atalhos de canvas como em modeladores conhecidos: navegar sem trocar de
ferramenta e rolar a visão com a roda. Hoje é preciso clicar em **Mover** para
arrastar o canvas e a roda sempre dá zoom, o que torna a navegação lenta.

## What Changes

- Segurar **Ctrl** entra temporariamente no modo mover; enquanto estiver
  pressionado, arrastar (inclusive sobre cards) desloca o canvas e os cards não
  arrastam. Soltar volta ao modo atual (`Selecionar`).
- **Ctrl + roda** rola o canvas verticalmente sem zoom.
- **Shift + roda** rola horizontalmente.
- Sem modificador, a roda continua com o comportamento atual (zoom).
- O blur da janela/aba solta o modo temporário, evitando ficar preso no mover.

## Capabilities

### New Capabilities

_None._

### Modified Capabilities

- `diagram-canvas` (delta ADDED): modo mover temporário com Ctrl e rolagem por
  modificador na roda.

## Non-goals

- Suporte a Meta/Command como equivalente ao Ctrl.
- Alterar os atalhos existentes de teclado ou a ferramenta **Mover** do toolbar.

## Impact

- **Frontend**: listener de teclado e de roda (`passive: false`, captura) em
  `DiagramCanvas`, mapeamento puro em `diagram/wheelPan.ts`, cursor de arraste.
- **Testes**: unidade do mapeamento da roda e componente cobrindo Ctrl e a roda.
- **Contrato/API/persistência**: intactos.
