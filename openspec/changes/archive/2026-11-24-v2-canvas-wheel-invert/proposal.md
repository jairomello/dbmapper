# Proposal

## Why

O comportamento anterior (roda dá zoom; Ctrl+roda rola) não é o mais comum em
canvas. O padrão esperado é: roda rola, **Ctrl+roda dá zoom**, e Shift+roda rola
na horizontal. Isso também evita zoom acidental ao navegar.

## What Changes

- **Roda sem modificador**: rola o canvas verticalmente, sem alterar o zoom.
- **Ctrl + roda**: dá zoom no ponto do cursor; Shift junto não muda (Ctrl tem
  prioridade).
- **Shift + roda**: rola horizontalmente.
- O zoom/pan por roda continua sendo gravado no viewport do layout.
- Listas roláveis dentro dos cards (colunas) continuam rolando com a roda; o
  canvas só intercepta quando o alvo não é uma área rolável.
- Zoom do React Flow por roda é desligado (`zoomOnScroll={false}`,
  `zoomActivationKeyCode={null}`) — o comportamento passa a ser explícito.

## Capabilities

### New Capabilities

_None._

### Modified Capabilities

- `diagram-canvas`: REMOVED o requisito "Wheel scrolling with modifier keys" e
  ADDED "Wheel zoom and scrolling" com a nova semântica.

## Non-goals

- Alterar o pan por arrasto (Ctrl pressionado) ou os botões de zoom.
- Suporte a Meta/Command.

## Impact

- **Frontend**: `diagram/wheelPan.ts` (nova ação de roda), `DiagramCanvas`
  (zoom em torno do cursor, detecção de área rolável) e props do React Flow.
- **Testes**: unidade da ação da roda e componente cobrindo rolagem e zoom.
- **Contrato/API**: intactos.
