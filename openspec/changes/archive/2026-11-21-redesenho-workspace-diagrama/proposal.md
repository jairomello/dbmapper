# Proposal

## Why

O workspace perde legibilidade em modelos grandes e distribui ações entre várias barras, dificultando a exploração de relacionamentos e a revisão de metadados. O redesenho organiza essas tarefas em uma interface coesa, com temas claro e escuro.

## What Changes

- Adotar Órbita como referência visual do diagrama e Caderno como referência para o painel de metadados, com versões claras e escuras.
- Reorganizar navegação, árvore, canvas, ferramentas, cartões e painel de edição mantendo as operações existentes acessíveis.
- Permitir alternar tema e preservar a preferência local.
- Introduzir foco opcional na vizinhança da tabela e apresentação legível para diferentes escalas.
- Non-goals: agrupamento automático em áreas do Atlas, mudanças no modelo de dados, autenticação, API ou legacy.

## Capabilities

### New Capabilities

- `workspace-appearance`: temas e apresentação do workspace v2.

### Modified Capabilities

- `diagram-canvas`: foco opcional em relações, detalhes progressivos e painel de metadados no workspace.

## Impact

- `apps/web/src/index.css`, workspace, árvore, editor, canvas, cartões, arestas, menus, diálogos e exportação.
- Testes de componentes e smoke visual para os dois temas e papéis.
- Compatibilizar com as changes em andamento de redimensionamento e layout compacto.
