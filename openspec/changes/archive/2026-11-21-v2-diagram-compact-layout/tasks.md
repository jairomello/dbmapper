# Tasks

## 1. Layout estrela compacto

- [x] 1.1 Reescrever `layoutStar` com anéis discretos: hub na célula central, tabelas atribuídas em ordem BFS às células mais próximas (Chebyshev), linhas com altura do maior card e isoladas em faixa lateral — verificação: teste unitário cobre hub no centro, vizinhas diretas nas células vizinhas e determinismo com entrada embaralhada.
- [x] 1.2 Garantir zero sobreposição e extensão compacta: teste com o fixture real (108 tabelas, 203 FKs, cards de até 2 671 px) afirma `overlappingPairs` vazio e extensão total abaixo de 1,5× o grid empacotado — verificação: `bun test apps/web/src/diagram/auto-layout.test.ts` verde.
- [x] 1.3 Manter o comportamento de isoladas (faixa lateral) e o fallback para grade sem relacionamentos — verificação: testes existentes ajustados continuam verdes.

## 2. Grade adaptativa

- [x] 2.1 `adaptiveColumns(count)` = `ceil(sqrt(count))` exportada e usada pela ação `Em grade` do canvas — verificação: teste unitário cobre 1, 4, 9, 100 e 108 tabelas; grid de 108 fica com 11 colunas.
- [x] 2.2 Manter o default de `layoutGrid` (3 colunas) para as chamadas existentes — verificação: testes de posicionamento inicial continuam idênticos.

## 3. Zoom e minimapa

- [x] 3.1 `minZoom` do `ReactFlow` de `0.2` para `0.05`, mantendo `maxZoom` 2, e conferir "Ajustar à tela" num modelo de ~6 000 px — verificação: teste de componente afirma `minZoom` do fluxo; conferência manual no e2e.
- [x] 3.2 `MiniMap` maior (240×180) com destaque de seleção/busca e máscara suave — verificação: teste de componente afirma dimensões/estilo e classe do nó selecionado.
- [x] 3.3 Conferir no e2e: organizar `Em estrela` no projeto grande, enquadrar e validar que o minimapa mostra o arranjo — verificação: cenário e2e verde.

## 4. Docs

- [x] 4.1 Atualizar `README.md` (organização compacta, zoom/minimapa) — verificação: passos reproduzidos na UI batem com o texto.

## 5. Validate

- [x] 5.1 `bun run check` e `bun run test:e2e` — verificação: exit 0 nos dois.
- [x] 5.2 `openspec validate v2-diagram-compact-layout --strict` — verificação: exit 0.

## 6. Archive

- [x] 6.1 `openspec archive v2-diagram-compact-layout --yes` após o ok do Jairo, marcar o checkbox e commitar — verificação: `openspec list` sem o change e specs `diagram-layout`/`diagram-canvas` atualizadas.
