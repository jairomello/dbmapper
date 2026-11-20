# Tasks

## 1. Algoritmos de organização automática

- [ ] 1.1 Extrair a grade atual para `apps/web/src/diagram/auto-layout.ts` com `layoutGrid(tables, options)` determinístico e gap mínimo — verificação: teste unitário afirma posições esperadas e ausência de sobreposição.
- [ ] 1.2 `layoutStar(tables, relationships)`: hub por grau (desempate alfabético), anéis por BFS com raio calculado pela altura do card e faixa lateral para isoladas — verificação: teste cobre hub no centro, primeiro anel com vizinhas diretas, isoladas na faixa e determinismo.
- [ ] 1.3 Garantia de não sobreposição determinística (ordenar + empurrar) e caso de 108 tabelas sem estouro de tempo — verificação: teste com o modelo real (fixture) afirma zero pares sobrepostos.
- [ ] 1.4 Nomes de tabelas duplicados/acentuados não alteram o resultado (ordenação estável) — verificação: teste com nomes com acento e prefixo comum.

## 2. Toolbar do canvas

- [ ] 2.1 Toolbar com `Selecionar`/`Mover`, zoom `+`/`−`, ajustar e `aria-pressed` nos modos; `Mover` faz pan sem selecionar — verificação: teste de componente cobre troca de modo, pan sem mudança de seleção e labels acessíveis.
- [ ] 2.2 Botões criar tabela e criar relacionamento delegando às ações da Fase 8; auto-layout com menu `Em grade`/`Em estrela` — verificação: teste cobre abertura do menu e chamada das ações corretas.
- [ ] 2.3 Gating por papel: `VIEWER` vê só zoom/ajustar/exportar — verificação: teste de papel como no restante do canvas.
- [ ] 2.4 Aplicar organização: calcular posições, gravar num único PUT com viewport/zoom e `fitView` em seguida — verificação: teste afirma um único PUT e chamada de fit.

## 3. Destaque de relacionamentos

- [ ] 3.1 Marcar arestas com `emphasis: outgoing | incoming | none` em `createDiagramEdges` (comparação por nome) e memoizar por tabela selecionada — verificação: teste unitário cobre as três classificações para um modelo com FK nos dois sentidos.
- [ ] 3.2 Realçar card e arestas incidentes, esmaecer o restante (canvas e árvore) — verificação: teste de componente afirma classes/atributos de ênfase ao selecionar pela árvore e pelo canvas.
- [ ] 3.3 Cores e padrões distintos por direção (tokens no CSS) e espessura 2 px/3 px com marcas proporcionais — verificação: teste afirma estilo aplicado e presença das classes de padrão; conferência visual no e2e.
- [ ] 3.4 Tracejado animado no sentido FK → PK respeitando `prefers-reduced-motion` — verificação: teste com `matchMedia` simulado garante ausência da classe de animação no modo reduzido.

## 4. Integração com zonas e e2e

- [ ] 4.1 Organização e destaque restritos às tabelas da zona ativa (Fase 9) — verificação: teste em duas zonas aplica layout só na ativa e não altera a outra.
- [ ] 4.2 E2e Playwright: diagrama → selecionar tabela (destaque e direções) → organizar `Em estrela` → recarregar (posições mantidas) → `VIEWER` sem controles de edição — verificação: `bun run test:e2e` verde com o cenário novo.

## 5. Docs

- [ ] 5.1 Atualizar `README.md` (toolbar, destaque, organização) e a seção de fluxo no `ROADMAP.md` — verificação: passos documentados reproduzidos na UI.

## 6. Validate

- [ ] 6.1 `bun run check` e `bun run test:e2e` — verificação: exit 0 nos dois.
- [ ] 6.2 `openspec validate v2-phase11-canvas-ux --strict` — verificação: exit 0.

## 7. Archive

- [ ] 7.1 `openspec archive v2-phase11-canvas-ux --yes` após o ok do Jairo, marcar o checkbox e commitar — verificação: `openspec list` sem o change e specs `diagram-canvas`/`diagram-layout` atualizadas.
