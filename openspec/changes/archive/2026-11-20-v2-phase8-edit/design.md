# Design

## Context

Fase 8 do modelador (canvas já existe pela Fase 7 — `v2-phase7-diagram`).
Restrições reais verificadas em `docs/analysis/07` e `08`:

- **O backend não cria coluna FK**: `markColumnAsForeignKey`
  (`packages/sql-parser/src/parser.ts:158-161`) é no-op para coluna
  inexistente; o zod aceita `local_columns` fantasma (probe: coluna não é
  criada). Porém **um único `PUT /api/projects/:id` já é atômico** para
  coluna + relationship (probe, doc 07 §3) e o `requireRole('MEMBER')` já
  existe nessa rota.
- O editor atual só descreve/termos/aprova (`MetadataEditor.tsx:105-134`);
  criação estrutural não tem precedente na UI (o `UpdateWizard` consome plano
  do servidor).
- Não existe fila de comandos, menu de contexto, undo nem indicador de save
  hoje — tudo é código novo (`08:§8 h`).
- Testes em happy-dom não simulam gesto real de pointer (`08:§8 k`).

## Goals / Non-Goals

**Goals:**

- Edição estrutural completa no canvas com uma única fila de save serializada,
  undo/redo e indicador de status.
- Auto-criação da coluna FK sem nenhuma mudança de backend.
- `VIEWER` sem affordances de edição.

**Non-Goals:**

- Flags `NN/UQ/AI/UUID`/coluna visualizável (decisão 4 — fora do contrato v1).
- Edição de descrição/termos/revisão pelo canvas (segue no painel do editor).
- Zonas/abas, export de imagem (Fase 9); estabilizar ids internos.

## Decisions

**D1 — Cliente compõe coluna + relationship num único `PUT`.** O diálogo de
relacionamento monta o payload com a coluna FK nova (ou reusa a existente) e a
relationship juntas; o `replaceModel` atual persiste tudo atomicamente e grava
`project.saved`. Alternativa considerada: lógica de auto-criação no servidor
(`normalizeDatabaseModel`) — descartada: exige mudar zod + normalização para
benefício só de UX, e o cliente já tem todas as informações (maior controle de
nome/tipo e de validação de colisão).

**D2 — Fila de comandos única com `reverse_action`** (padrão do Mad.Builder,
doc 05 §2): cada mutação vira
`{action, params, reverse_action, reverse_params}`; a fila (a) serializa os
PUTs — um em voo por vez, com guarda tipo `sendingCommand`, (b) alimenta
undo/redo (`executedCommands`/`redoCommands`), (c) dirige o indicador
`Salvando...` → `Salvo às: HH:MM`. Alternativa: React Query puro sem fila —
descartada: não resolve undo nem ordenação de mutações rápidas.

**D3 — Undo é local-first e sempre persistido.** Undo aplica o inverso no
modelo em memória e passa pela mesma fila (o save é o caminho único);
servidor é autoritativo: PUT rejeitado → mensagem + refetch do modelo
(`invalidateQueries`, padrão já usado em `WorkspacePage.tsx:35-44`).

**D4 — Escopo do undo = mutações do canvas.** A fila é do modo diagrama;
edições do painel de descrição mantêm o comportamento atual (sem undo). Evita
misturar dois modelos de histórico.

**D5 — Menu de contexto nas coordenadas do cursor** (como o referência,
`relativePosition`): "Adicionar tabela" cria no ponto clicado; "Excluir" e
"Propriedades" nos itens. Toolbar cria no centro da viewport.

**D6 — Popover de coluna só com campos v1** (nome, tipo/tamanho, PK, FK);
descrição/termos/revisão continuam no `MetadataEditor` — evita duplicar a
requirement `semantic-editor` e manter uma única fonte para metadados.

**D7 — Modo `1:n` por botão** além do arrasto handle→handle: clique no botão,
origem, destino. Fallback acessível (o arrasto de handle de 8px é difícil);
cardinalidade fina continua derivada das relationships (1:N é o único caso de
criação — N:M exige tabela de junção, fora do escopo).

**D8 — Validações inline no cliente + envelope do servidor**: nome obrigatório
e duplicado checados antes do PUT (evita roundtrip); erros do servidor no
envelope padrão aparecem no indicador.

**D9 — Papel**: `VIEWER` recebe os controles ocultos por prop de papel (o
header já tem o estado "Somente leitura"); o 403 do servidor é a guarda final
(teste de rota existente cobre a rota; teste de UI cobre a ausência dos
controles).

## Risks / Trade-offs

- [PUT do modelo inteiro é pesado para modelos grandes] → já é o caminho do
  editor hoje; fila serializada + debounce evita rajadas; sem mudança de
  contrato.
- [Conflito com `UpdateWizard` aberto (plano do servidor)] → edição pelo
  canvas fica bloqueada enquanto o wizard está aberto (mesmo lock do header).
- [Undo de edição feita por outro usuário em paralelo] → servidor é
  autoritativo: PUT rejeitado ressincroniza (D3); sem merge otimista.
- [happy-dom não prova gesto de drag] → handlers testados em unidade; gesto
  real coberto pelo e2e.
- [Fila duplicar estado com React Query cache] → fila é dona apenas das
  mutações do canvas; cache continua sendo fonte de leitura.

## Migration Plan

Sem mudança de banco e sem mudança de contrato — passos:
1. Código entra via change (componentes + fila no `apps/web`); backend
   intocado.
2. Gate: `bun run check` + `bun run test:e2e` verdes; `openspec validate
   v2-phase8-edit --strict` = 0.
3. Rollback: reverter o commit da fase (nenhuma migração para desfazer, nenhum
   dado novo persistido além do próprio modelo).
