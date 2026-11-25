# Proposal

## Why

O modo temporário com Ctrl funciona, mas não dá retorno visual: a toolbar continua
marcando **Selecionar** e o cursor não muda, então o usuário não sabe que está em
pan até arrastar. Além disso, a tecla só era detectada em alguns teclados/eventos
(Ctrl esquerdo não ativava em um teste real).

## What Changes

- Enquanto Ctrl estiver pressionado, a toolbar marca **Mover** (e desmarca
  **Selecionar**); ao soltar, volta a **Selecionar** sem mudar a ferramenta real.
- O cursor do pane e dos cards vira `grab` durante o modo temporário e
  `grabbing` enquanto arrasta.
- A detecção passa a aceitar as duas teclas (`key === 'Control'`,
  `code === 'ControlLeft'`/`ControlRight`) em fase de captura e também usa
  `event.ctrlKey` no ponteiro como fallback.
- O pan temporário ignora áreas interativas (toolbar, controles, minimapa,
  diálogos) para não roubar cliques.

## Capabilities

### New Capabilities

_None._

### Modified Capabilities

- `diagram-canvas` (delta ADDED): feedback do modo temporário na toolbar e no
  cursor, com suporte às duas teclas Ctrl.

## Non-goals

- Alterar o comportamento da ferramenta **Mover** acionada pelo botão.
- Suporte a Meta/Command.

## Impact

- **Frontend**: `DiagramCanvas` (estado de pan, listeners em captura, atributos
  `data-pan-mode`/`data-panning`) e `index.css` (cursores).
- **Testes**: componente cobrindo Ctrl esquerdo/direito e `aria-pressed` da
  toolbar.
- **Contrato/API**: intactos.
