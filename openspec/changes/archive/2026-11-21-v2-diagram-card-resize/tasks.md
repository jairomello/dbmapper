# Tasks

## 1. Contrato e backend

- [x] 1.1 `diagramPositionSchema` aceita `width`/`height` opcionais com limites (≈180–1200 de largura, ≈100–4000 de altura) mantendo `.strict()` — verificação: testes de rota aceitam tamanho, rejeitam fora do limite e aceitam documento só com `x/y`.
- [x] 1.2 Tipos de persistência (`ports.ts`/`adapter.ts`) propagam `width`/`height` sem alterar a transação de zonas — verificação: teste de adapter faz roundtrip de posição com tamanho.

## 2. Altura e tamanho no canvas

- [x] 2.1 `estimatedTableHeight` inclui o rodapé de chaves (cabeçalho + linhas de pais/filhos) — verificação: teste unitário compara tabela com e sem FKs e garante que o card padrão comporta o rodapé.
- [x] 2.2 `createDiagramNodes` aplica `position.width ?? 260` e `position.height ?? alturaEstimada` no nó (`style` e `width/height`) — verificação: teste de unidade do layout confirma tamanho salvo aplicado e default sem tamanho.

## 3. Card: padding, rolagem e accordion

- [x] 3.1 `TableNode` em coluna flex com corpo rolável: cabeçalho/rodapé fixos, colunas em `overflow-y-auto`, padding interno consistente — verificação: teste de componente confirma a área rolável e a ausência de corte (classes/estrutura) e o rodapé presente.
- [x] 3.2 Accordion de "Chaves entre modelos" e "Chaves estrangeiras" com `aria-expanded`/`aria-controls`, recolhendo as linhas sem alterar o modelo — verificação: teste de componente alterna as seções e confere o estado acessível.

## 4. Redimensionamento

- [x] 4.1 `NodeResizer` no card selecionado para `MEMBER`+, com mínimos; oculto em `VIEWER` — verificação: teste de componente confirma presença das alças só quando selecionado e com `canEdit`.
- [x] 4.2 `onNodesChange` trata mudanças de dimensão e persiste `width`/`height` em `positions` com o mesmo debounce do arrasto — verificação: teste de componente simula resize e afirma um único PUT com o tamanho novo.
- [x] 4.3 Tamanho por zona: resize em uma aba não altera a outra e cada aba restaura o seu — verificação: teste com duas zonas cobre tamanhos distintos e troca de aba.
- [x] 4.4 Re-medição de handles ao rolar/resize (`useUpdateNodeInternals` com `requestAnimationFrame`) — verificação: teste de componente garante a chamada no evento de scroll e conferência visual das arestas no e2e.

## 5. Docs e e2e

- [x] 5.1 README: redimensionar, rolagem do conteúdo, accordion e tamanho por aba — verificação: passos reproduzidos na UI batem com o texto.
- [x] 5.2 E2e: selecionar tabela → redimensionar (card menor com rolagem) → recolher chaves → trocar de aba e voltar (tamanho preservado) — verificação: `bun run test:e2e` verde.

## 6. Validate

- [x] 6.1 `bun run check` e `bun run test:e2e` — verificação: exit 0 nos dois.
- [x] 6.2 `openspec validate v2-diagram-card-resize --strict` — verificação: exit 0.

## 7. Archive

- [x] 7.1 `openspec archive v2-diagram-card-resize --yes` após o ok do Jairo, marcar o checkbox e commitar — verificação: `openspec list` sem o change e specs `diagram-canvas`/`diagram-layout` atualizadas.
