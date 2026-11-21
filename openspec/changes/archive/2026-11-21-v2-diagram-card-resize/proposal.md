# Proposal

## Why

Os cards do diagrama têm altura estimada só pelas colunas: a faixa de **chaves
estrangeiras** (Fase 9) fica fora do cálculo e o `overflow-hidden` corta o
conteúdo na base e nas laterais. Além disso, o tamanho é fixo (260 px), então
tabelas com nomes longos ou muitas FKs não podem ser lidas sem cortar texto.
O produto de referência permite **redimensionar o card** e **recolher as chaves
estrangeiras**, com rolagem para o conteúdo.

## What Changes

- **Padding e contenção**: o card passa a reservar espaço interno coerente
  (cabeçalho, colunas, rodapé de chaves) e a altura estimada inclui o rodapé —
  sem cortar conteúdo nas laterais nem na base. O corpo de colunas vira área
  rolável quando o card é menor que o conteúdo.
- **Redimensionar o card**: com a tabela selecionada e para `MEMBER`+, alças nas
  bordas/cantos ajustam **largura e altura**; o conteúdo rola em vez de ser
  cortado, com mínimos de largura/altura.
- **Tamanho por aba/zona**: largura e altura são gravadas junto da posição no
  documento de layout **da zona ativa**, então a mesma tabela pode ter tamanhos
  diferentes em abas diferentes e cada aba restaura o seu.
- **Chaves estrangeiras em accordion**: as seções "Chaves entre modelos" e
  "Chaves estrangeiras" do rodapé podem ser recolhidas/expandidas por card,
  liberando espaço para as colunas.
- **Persistência sem contrato novo**: `width`/`height` opcionais entram no
  `positions` do `PUT /api/projects/{id}/diagram` já existente e auditado;
  layouts antigos (sem tamanho) continuam válidos e caem no tamanho padrão.

**Non-goals:** redimensionar colunas individualmente, lembrar largura/altura
entre projetos (é por zona do projeto), alterar o export v1 e mudar o
algoritmo de organização (que passa a considerar o rodapé no espaçamento).

## Capabilities

### New Capabilities

_None._

### Modified Capabilities

- `diagram-canvas`: padding/contenção do card, redimensionamento com rolagem,
  accordion das chaves estrangeiras e reação de arestas/handles ao conteúdo
  rolado.
- `diagram-layout`: tamanho do card opcional por posição, por zona, aceito e
  devolvido pelo layout document, com retrocompatibilidade.

## Impact

- **Backend**: `diagramPositionSchema` ganha `width`/`height` opcionais com
  limites (`strict`), validação e testes de rota; nenhuma migração (JSON já
  existente).
- **Frontend**: `DiagramPosition`, `auto-layout` (altura estimada com rodapé),
  `layout.ts` (tamanho por nó e callback de resize), `TableNode` (flex/rolagem,
  alças, accordion) e `DiagramCanvas` (mudanças de dimensão persistidas com o
  mesmo debounce).
- **Testes**: unidade de altura/limites, componente (resize, accordion,
  rolagem, tamanho por zona), rota e e2e.
