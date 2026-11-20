# Proposal

## Why

Com o modelo real (108 tabelas, 203 FKs) o canvas atual não dá conta de
acompanhar relacionamentos: as arestas têm 1–1,5 px, nada destaca as conexões da
tabela em foco e não há como reorganizar o diagrama — cada projeto precisa ser
arrastado à mão. O produto de referência resolve isso com barra de ferramentas,
destaque de relações e organização automática; sem isso o modelador não escala
para leitura e revisão do dicionário.

## What Changes

- **Barra de ferramentas do canvas**: modos `Selecionar` e `Mover` (pan sem
  selecionar), zoom `+`/`−`/ajustar, criar tabela, criar relacionamento,
  organizar automaticamente e exportar (PNG/SVG da Fase 9). Edição e
  organização só para `MEMBER`+; navegação e export para todos.
- **Destaque de relacionamentos**: selecionar uma tabela realça o card e todas
  as arestas que o tocam, esmaecendo o resto. As arestas ganham **cor por
  direção** — tabela selecionada referenciando outra (FK emitida) em uma cor,
  outras tabelas referenciando a selecionada (FK recebida) em outra — e o
  tracejado animado indica o sentido FK → PK. Com `prefers-reduced-motion` o
  tracejado fica estático.
- **Arestas mais espessas**: base 2 px e destacadas 3 px, com as marcas de
  cardinalidade (pé de galinha/traço) proporcionais, mantendo leitura no zoom
  inicial.
- **Organização automática** com duas opções: `Em grade` (linhas e colunas,
  comportamento atual) e `Em estrela` (tabela mais conectada no centro,
  vizinhas em anéis por nível de relacionamento, isoladas em faixa lateral).
  Aplicar grava posições no documento de layout e enquadra a view.
- **Acessibilidade**: botões com rótulo/`aria-pressed`, cores combinadas com
  padrões de traço distintos (não depender só de cor).

**Non-goals:** layout por força (`d3-force`) ou roteamento ortogonal manual,
redimensionar cards, fullscreen, colaboração em tempo real, atalhos de teclado
obrigatórios e qualquer mudança no modelo/export v1.

## Capabilities

### New Capabilities

_None._ Todo o comportamento novo cabe nas capabilities do modelador já
promovidas.

### Modified Capabilities

- `diagram-canvas`: barra de ferramentas do canvas, destaque de tabela e
  arestas com cor por direção, animação de sentido e espessura das arestas.
- `diagram-layout`: algoritmos de organização automática (`grade` e `estrela`),
  determinismo, não sobreposição e persistência numa única escrita.

## Impact

- **Frontend**: novos módulos puros `apps/web/src/diagram/auto-layout.ts`
  (algoritmos) e ajustes em `layout.ts`/`CrowFootEdge.tsx`/`TableNode.tsx`
  (ênfase, direção, espessura); toolbar no `DiagramCanvas`; tokens de cor/espessura
  no CSS.
- **Backend**: nenhum — posições continuam no `PUT /api/projects/:id/diagram`
  já existente e auditado.
- **Contrato**: export v1 e modelo intactos.
- **Testes**: unitários dos algoritmos (determinismo, não sobreposição, hub no
  centro), componente da toolbar e do destaque, e2e de organizar/destacar.
