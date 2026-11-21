# Design

## Context

O workspace usa classes Tailwind com cores fixas em múltiplos componentes e variáveis limitadas para arestas em index.css. A seleção é compartilhada entre árvore, canvas e editor. O layout por zona é salvo na API e o canvas utiliza React Flow, com busca, exportação, minimapa, comandos de edição e indicadores de salvamento. Os SVGs em docs/prototipos/diagramas/02-orbita.svg e 03-caderno.svg são referências visuais, com dados ilustrativos.

As changes v2-diagram-card-resize e v2-diagram-compact-layout estão em andamento e há alterações locais nos mesmos arquivos. A implementação deve primeiro inspecionar seu estado e incorporar seus contratos, sem sobrescrevê-los.

## Goals / Non-Goals

**Goals:** produzir uma interface consistente em ambos os temas, acessível e legível em modelos grandes, preservando os fluxos e dados existentes.

**Non-Goals:** classificação de áreas do Atlas, alteração de endpoints, migração de banco ou mudanças no legacy. As demais telas do produto podem manter sua apresentação atual, respeitando os componentes compartilhados.

## Decisions

- Tema local por preferência explícita, com preferência do sistema como padrão e fallback claro. Tokens semânticos para fundos, superfícies, texto, borda, destaque, estado, arestas e foco evitam duplicar paletas por componente. Verificar também elementos de React Flow, menus, diálogos e exportação, que podem escapar do escopo de estilos.
- Órbita orienta a hierarquia do canvas e Caderno a ficha lateral. A versão clara usa superfícies neutras e destaque ameixa ou verde consistente, a escura usa grafite e verde da Órbita. Reproduzir hierarquia, espaçamento, tipografia e estados dos SVGs, adaptando densidade e controles aos dados reais.
- A seleção continua sincronizada. Foco na vizinhança é temporário e explícito, derivado do modelo e da zona ativa. Guardar e restaurar o viewport em memória e suprimir sua persistência durante foco e restauração. Preservar pesquisa, acesso a relações entre zonas e estado anterior quando sair.
- O cartão completo permanece disponível. A apresentação compacta deve manter pontos de conexão coerentes e abrir o detalhe quando uma coluna for selecionada. Coordenar dimensões, cálculo de handles, rotas, redimensionamento, layout automático, exportação e posições existentes. Não alterar posições persistidas ao mudar apenas o nível de detalhe.
- Conservar Editor/Diagrama, árvore, zonas, métricas, criação e exclusão, undo/redo, feedback de erro, modo VIEWER e todas as operações atuais. Agrupar ações em menus acessíveis por teclado. A ficha lateral reaproveita MetadataEditor, inclusive termos múltiplos e revisão.
- Em largura reduzida, usar painel recolhível ou sobreposto com fechamento e foco acessíveis. Evitar controles que se sobreponham ao canvas. Conteúdo extenso precisa rolagem própria e nomes longos precisam acesso ao texto integral.
- PNG e SVG devem refletir tema, conteúdo e relações sem mutar estado. Verificar cores resolvidas e fundos na exportação, inclusive modo compacto e foco, sem alterar o contrato de exportação da zona completa vigente.

## Risks / Trade-offs

- Mudanças de geometria podem deslocar arestas ou sobrepor cartões → preservar tamanhos salvos, reavaliar handles e verificar zonas grandes, resize e algoritmos.
- Linhas em cartões compactos podem sugerir colunas incorretas → manter origem e destino identificáveis e revelar campos envolvidos.
- Foco temporário pode salvar um viewport inesperado → separar estado de navegação temporária da persistência e testar saída e falha.
- Cores fixas ou exportação podem gerar elementos ilegíveis → auditar estados, portais, SVG e PNG em ambos os temas.
- A interface proposta é estática e simplifica controles → validar todos os fluxos reais, sem remover operações ou estados vazios e de erro.

## Migration Plan

Integrar após verificar as changes de cartão e layout e resolver sobreposições de especificação. O tema é uma preferência local nova, com fallback seguro para usuários existentes. Não há migração de dados. Validar em desenvolvimento e aplicar o deploy habitual do web. Para rollback, retornar à versão anterior do web; o valor local de tema pode permanecer sem afetar o servidor.

## Integração com as changes em andamento

A implementação foi feita sobre o estado local do repositório, sem reverter nenhuma alteração existente do usuário. Ordem e contratos preservados:

1. **`v2-diagram-card-resize`** — `width`/`height` opcionais por tabela no `positions` de cada zona continuam sendo a fonte de tamanho; o nível compacto apenas reduz a altura renderizada (`min(tamanho salvo, altura do conteúdo compacto)`) e **nunca** grava posições/tamanhos. O `onResize`, o accordion de chaves e a rolagem do corpo foram mantidos.
2. **`v2-diagram-compact-layout`** — `minZoom = 0.05`, alturas estimadas com rodapé e minimapa 240×180 foram mantidos; o foco usa `fitView` dentro desse mesmo limite e a grade/estrela continuam donas do layout persistido.
3. **`v2-phase11-canvas-ux`** — destaque outgoing/incoming, espessura e animação seguem via variáveis CSS; o tema apenas troca os valores `--diagram-edge-*`, sem mexer na lógica de ênfase.
4. **Estratégia de tema** — tokens semânticos novos (`surface`, `line`, `ink`, `muted`, `accent`, `card`, `canvas`, `header`) e remapeamento das escalas neutras (`slate`, `indigo`, `emerald`, `amber`, `rose`, `red`) por `[data-theme]`. Isso cobre componentes legados (diálogos, menus, chips) sem reescrever cada classe, e `.bg-white` passa a apontar para `--surface` para não vazar branco fixo no escuro.
5. **Foco em relações** — filtro derivado por nome na zona ativa, `viewport` guardado em memória, `fitView` na entrada, `setViewport` na saída e supressão total de `PUT /diagram` enquanto o foco está ativo (inclusive no `onMoveEnd`). Edição de modelo/layout fica desabilitada no foco.
6. **Detalhe progressivo** — colunas visíveis em compacto = PK + colunas de extremidade de relacionamento (pais e filhos) + coluna selecionada/pesquisada; o restante aparece pelo botão "Mostrar todos os N campos", por seleção na árvore/busca ou pelo nível detalhado. Handles e arestas só existem para colunas visíveis, então não há aresta órfã.
