# Design

## Context

Fase 9 fecha o modelador (Fases 7 `v2-phase7-diagram` e 8 `v2-phase8-edit`
anteriores). Premissas verificadas:

- A Fase 7 cria `diagram_layouts(project_id, zone_name, positions_json,
  viewport_*, zoom, ...)` com `UNIQUE(project_id, zone_name)` e
  `zone_name='Principal'` — a base por zona **já existe**.
- No produto de referência cada aba é um banco de dados separado; para nós
  zona é **agrupamento lógico dentro de um único modelo** (doc 06 §1) — não
  mexe no contrato v1 (`DatabaseModel` não tem zonas, `08:§8 j`).
- Auditoria: rotas mutantes novas exigiriam delta em `audit-log`
  (`07:I6`) — por isso as zonas entram no **documento de layout existente**.
- `migration.test.ts` usa `toEqual` em `PRAGMA table_info('projects')` →
  mexer em `projects` quebraria; tabela nova é segura (`toContain`).

## Goals / Non-Goals

**Goals:**

- Abas/zonas com atribuição de tabelas, layout próprio por zona e chaves entre
  zonas derivadas — tudo numa única escrita do documento de layout.
- Trazer/remover tabelas do diagrama sem tocar no modelo e localizar qualquer
  tabela da árvore na aba correta.
- Export PNG/SVG e contagem de tabelas no cabeçalho do diagrama.

**Non-Goals:**

- Zonas como conceito do modelo de dados / export v1 (fora do contrato).
- Diagrama no viewer; edição estrutural (Fase 8); coluna `zone` em tabelas do
  modelo; teto de tabelas (o `/500` do referência não se aplica — decisão 6
  do doc 09).

## Decisions

**D1 — Registro de zonas em tabela nova `diagram_zones`.**
`(id, project_id, name, tab_order, members_json)` com
`UNIQUE(project_id, name)`. `members_json` = nomes de tabelas da zona;
posições/viewport continuam em `diagram_layouts` por `zone_name`. O documento
de layout do `PUT /diagram` passa a ser `{ zones: [...], layouts: [...] }` e o
adapter grava zonas + layouts **na mesma transação**. Alternativa: adicionar
coluna em `diagram_layouts` — descartada: exigiria alterar tabela da Fase 7 e
misturaria registro com posicionamento.

**D2 — Atribuição explícita, com tabela fora de zona permitida.** Tabela
listada em `members_json` de uma zona pertence a ela. Tabela **não listada em
nenhuma zona** continua no modelo e na árvore, mas **não é renderizada em aba
alguma** — é o que dá sentido a "remover do diagrama" (doc 05 §3.8). Documento
de layout sem `zones` (Fase 7) é interpretado como "todas as tabelas em
`Principal`" e a primeira escrita materializa os membros; importações novas
gravam todos os membros em `Principal`. Excluir zona devolve os membros a
`Principal`.

**D3 — Chaves entre zonas são derivadas** na renderização (origem/destino em
zonas diferentes) — nenhum dado armazenado (docs 05 §3.7, 06 §1). A faixa
"Chaves estrangeiras" mantém as internas.

**D4 — Export client-side com `html-to-image`** (o `toPng`/`toSvg` do React Flow
usa a mesma lib): PNG e SVG do container do diagrama, sem tocar em estado.
Descartado o caminho do referência (html2canvas em 2 passadas escondendo os
cards — doc 05 §3.10). Efeito colateral: dependência nova `html-to-image` +
lock (mesma regra do `--frozen-lockfile` da Fase 7).

**D5 — Contagem = tabelas não-`REMOVED`**, sem teto — exibida no cabeçalho do
modo diagrama.

**D6 — Zonas na mesma PUT do layout**: o zod de `PUT /diagram` ganha `zones`
(opcional, validação de nome único e de membros conhecidos); nenhuma rota nova
→ **nenhum evento novo** → `audit-log` sem delta. Falha na escrita desfaz
zonas e layouts juntos (transação única).

**D7 — Troca de zona local**: o `GET /diagram` devolve o documento completo
(zonas + layouts); o cliente troca de aba sem requisição e persiste no mesmo
debounce do drag.

**D8 — Reordenação das abas por arrasto** (tab_order numérico calculado no
cliente, persistido na PUT).

**D9 — Drag da árvore para o canvas via DnD nativo (`dragstart`/`drop`)** no
`SemanticTree` + canvas: o drop calcula a posição em coordenadas de fluxo pelo
`screenToFlowPosition` do React Flow e grava `{members, positions}` no mesmo
PUT do debounce. Alternativa: pointer events custom — descartada porque o
navegador já resolve o "fantasma" do arrasto e o teclado/leitor de tela não
piora (a ação também existe pelo menu "Adicionar à aba atual"). Um único arrasto
**não** move a tabela entre zonas no servidor antes do drop (evita escrita
intermediária).

**D10 — "Remover do diagrama" é edição de layout, não do modelo**: remove o
nome da zona, apaga a posição daquela tabela e emite só `diagram.layout_saved`.
O menu do card deixa a ação e o "Excluir tabela" (Fase 8) visualmente
separados, com cópias distintas, para não induzir perda de dados. A árvore
marca as tabelas sem zona ("fora do diagrama") e oferece "Adicionar à aba
atual".

**D11 — Localizar é zona-aware**: o handler de seleção da árvore procura a zona
da tabela antes de centralizar; se for outra aba, troca de zona (sem PUT) e só
então aplica `setCenter`. Tabela sem zona não troca de aba — abre a ação de
adição (MEMBER) ou uma mensagem para `VIEWER`.

## Risks / Trade-offs

- [Documento de layout cresce (todas as zonas numa PUT)] → escala aceitável
  (posições são poucos bytes por tabela); se crescer, GET por zona é evolução
  compatível.
- [Delta da Fase 9 em `diagram-canvas` alveja capability promovida só no
  archive da Fase 7] → `openspec validate` hoje passa (INFO possível); ordem
  7→8→9 do roadmap garante o archive antes do archive desta fase.
- [Arrasto de aba e de tabela em happy-dom] → handlers em unidade; gesto real
  no e2e.
- [Usuário "perde" tabelas ao remover do diagrama] → árvore marca as tabelas
  fora do diagrama e o card em foco oferece "Adicionar à aba atual"; exclusão
  real continua sendo a da Fase 8, com confirmação própria.
- [Documento antigo sem `zones` virar "diagrama vazio"] → leitura sem `zones`
  equivale a todos os membros em `Principal`; teste cobre o documento da
  Fase 7 e a primeira escrita materializada.
- [Export de diagramas muito grandes estoura memória do canvas] → limitar à
  área visível + aviso; risco aceito para a escala atual (projetos < 500
  tabelas).

## Migration Plan

1. **Banco**: `bun run db:generate` gera migração aditiva `000N_*` com a tabela
   `diagram_zones` (nenhuma tabela existente é alterada — `PRAGMA
   table_info('projects')` intocado; `diagram_layouts` recebe apenas novas
   linhas por `zone_name`). Deploy = `db:migrate` normal; rollback = drop de
   `diagram_zones` (perde só registro de abas; posições continuam válidas com
   zona única `Principal`).
2. **Dependência**: `bun add html-to-image` em `apps/web` + commit do
   `bun.lock` (Docker `--frozen-lockfile`); rollback = reverter dep/lock.
3. **Código**: entra via change; comportamentos existentes preservados —
   documento de layout antigo (sem `zones`) continua válido (campo opcional),
   então Fase 7 → Fase 9 não exige reescrita de dado.
4. **Gate**: `bun run check` + `bun run test:e2e` verdes antes do commit de
   encerramento; `openspec validate v2-phase9-zones --strict` = 0.
