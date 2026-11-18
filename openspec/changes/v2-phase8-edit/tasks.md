# Tasks

## 1. Fila de comandos e indicador de save

- [ ] 1.1 Fila de comandos do canvas (`newCommand` com `action`/`reverse_action`, serialização — um PUT em voo — e limpeza do redo em mutação nova) em `apps/web/src/diagram/` — verificação: teste de unidade cobre serialização, inverso aplicado e limpeza de redo.
- [ ] 1.2 Indicador de status `Salvando...`/`Salvo às: HH:MM` ligado à fila, com exibição de erro no envelope padrão e refetch do modelo em PUT rejeitado — verificação: teste cobre os três estados (em voo, sucesso, falha com resync).

## 2. Criar e excluir tabela

- [ ] 2.1 Menu de contexto do canvas ("Adicionar tabela" nas coordenadas do cursor, "Excluir" com confirmação, "Propriedades") + botão da toolbar — verificação: teste de componente cobre criação no ponto clicado, confirmação de exclusão e presença na árvore após save.
- [ ] 2.2 Integração com React Query (save via `projectsApi.save` + invalidação, mesmo fluxo do editor) e lock enquanto `UpdateWizard` estiver aberto — verificação: teste cobre um único PUT por mutação e a bloqueação com wizard aberto.

## 3. Criar e excluir coluna

- [ ] 3.1 Ação de adicionar coluna no card e exclusão com confirmação — verificação: teste cobre criação, exclusão e re-render do card após save.
- [ ] 3.2 Validações inline de coluna (nome obrigatório, duplicado na mesma tabela) bloqueando o PUT — verificação: teste afirma que nome duplicado/vazio não dispara requisição e mostra a mensagem.

## 4. Relacionamentos com coluna FK auto-criada

- [ ] 4.1 Criação por arrasto handle→handle e pelo modo `1:n` (botão → origem → destino) com diálogo de confirmação — verificação: teste de componente cobre os dois caminhos e o cancelamento.
- [ ] 4.2 Payload composto: coluna `<target>_id` (nome editável, tipo alinhado ao PK destino) + relationship num **único** `PUT`; reuso de coluna existente e conflito de nome reportado — verificação: teste afirma exatamente um PUT contendo coluna e relationship, o caso de reuso sem coluna nova e o conflito sem save.
- [ ] 4.3 Exclusão de relationship pelo canvas (card e aresta) — verificação: teste cobre remoção da aresta e da FK do modelo após save.

## 5. Popover de coluna e de tabela

- [ ] 5.1 Popover de coluna (nome, tipo/tamanho, PK) e de tabela (nome) persistindo pelo save — verificação: teste cobre edição, validação inline e re-render.
- [ ] 5.2 Confirmação de que descrição/termos/revisão continuam apenas no painel do editor (sem duplicação) — verificação: teste do popover não expõe campos de metadados e `bun run check` verde.

## 6. Undo/redo

- [ ] 6.1 Undo/redo sobre a fila (inverso persistido, redo limpo por mutação nova) com botões no modo diagrama — verificação: teste cobre desfazer exclusão com restauração completa e reaplicação; estado oculto quando não há histórico.

## 7. Papel VIEWER

- [ ] 7.1 Controles de edição ocultos para `VIEWER` (menu de contexto reduzido, sem adicionar/excluir/popover, modo `1:n` ausente) — verificação: teste de componente de VIEWER afirma ausência dos controles e zero requisições de save.

## 8. E2e de edição

- [ ] 8.1 E2e Playwright: login → diagrama → criar tabela → criar relacionamento com coluna auto → undo → recarregar → modelo persistido — verificação: `bun run test:e2e` verde com o cenário novo.

## 9. Docs e integração

- [ ] 9.1 Atualizar `README.md` (edição pelo canvas) e conferir que os docs de análise 04–09 batem com o implementado — verificação: comandos/fluxos do README reproduzidos batem; `bun run check` + e2e verdes.

## 10. Validate

- [ ] 10.1 `bun run check` e `bun run test:e2e` — verificação: exit 0 nos dois.
- [ ] 10.2 `openspec validate v2-phase8-edit --strict` — verificação: exit 0.

## 11. Archive

- [ ] 11.1 `openspec archive v2-phase8-edit --yes` após o ok do Jairo, marcar o checkbox no tasks arquivado e commitar o change promovido — verificação: `openspec list` sem o change e `openspec/specs/diagram-editing` existente.
