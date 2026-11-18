# Avaliação — HTML salvo do Mad.Builder vs. nosso plano (doc 04)

> Fonte: `/mnt/shared/modelo/html-exemplo/Mad.Builder.html` (886 KB, página salva
> de `app.madbuilder.com.br/model-open-109699`) + `Mad.Builder_files/` (50 assets).
> Análise estática do DOM, templates Handlebars, CSS e do bundle `m-libs.min.js`
> (onde vive a classe `Diagram`, ~900 ocorrências). 18/11/2026.

## 0. Correção de identificação

O doc 04 chamou o sistema de referência de **"Builder Ensino"**. O HTML é do
**Mad.Builder v4.2** (`app.madbuilder.com.br`, framework **Adianti**, PHP). As
imagens/vídeos mostram o mesmo padrão (abas `Permission`/`Principal`, contagem
`N/500 tabelas`), então é o mesmo produto — provavelmente white-label. Corrigido
no cabeçalho do doc 04; confirmar com o Jairo se as capturas eram do Mad.Builder.

## 1. Stack do referência (o que NÃO fazer)

| Camada | Escolha deles | Observação |
|---|---|---|
| Arestas | **jsPlumb** (community) + conector `Flowchart` | endpoint = PNG de cardinalidade (`one-to-many-l.png`), não SVG |
| Zoom/pan | **panzoom** (anvaka) + jQuery UI `draggable/resizable/sortable` | matriz de transform manual, repaint do jsPlumb com `setTimeout` |
| Estado | rivets.js + Handlebars + DOM imperativo | 421 `<script>` inline, templates `[[ ]]`/`{{ }}` |
| Export PNG | **html2canvas** em 2 passadas: esconde os cards, renderiza o SVG à parte com `drawSvg`, compõe no canvas | frágil — restaura width/height na mão depois |
| Colaboração | socket.io + fila de comandos no servidor | opt-in (`setColaboration`) |
| Persistência | `POST receiveCommand` / `undo` / `redo` (Adianti `add.php`) | servidor é autoritário; pode rejeitar e forçar `undo`/`reload` no cliente |

**Confirma a decisão 1 do doc 04**: React Flow é o oposto disso — nodes DOM/SVG
com arestas SVG nativas, minimapa/zoom/edge-routing embutidos, export sem
malabarismo. jsPlumb+panzoom+jQuery é exatamente a dívida técnica que queremos
evitar.

## 2. Arquitetura de escrita deles (o achado mais valioso)

Todo mutação passa por **UMA fila de comandos** (`Diagram.newCommand`):

```js
{ action: "Diagram.instance.setEntityPosition",
  action_params: {positionX, positionY, id},
  reverse_action: "Diagram.instance.setEntityPosition",   // inverso declarado
  reverse_action_params: {positionX: startX, positionY: startY, id} }
```

- Fila serializada (`sendingCommand` flag) → **um POST por vez**, sem corrida;
- `executedCommands` alimenta o **undo**, `redoCommands` o **redo** — o inverso
  já vem embutido no comando;
- o mesmo fluxo atualiza o indicador no canto: **`Salvando...` → `Salvo às: HH:MM`**;
- **não existe botão salvar** no diagrama — auto-save é a única via;
- posição do card é um comando como qualquer outro (`setEntityPosition` com
  reverse = posição inicial) → **undo desfaz arrastos**;
- o viewport (pan x/y) é persistido à parte (`sendDiagramViewPosition`);
- servidor pode rejeitar: `status:error` → cliente faz `undo(true)` ou `reload()`.

**Tradução para o nosso plano:** o "undo/redo: fila local" do doc 04 (§3.4) deve
virar **um mecanismo único** na Fase 8 — a mesma fila que (a) serializa os PUTs,
(b) alimenta undo/redo via `reverse_action`, (c) dirige o indicador de save.
Uma fila, três funcionalidades. E valida a **decisão 5** (auto-save com
indicador, sem botão) com a copy exata: `Salvando...` / `Salvo às: HH:MM`.

## 3. Onde eles estão à frente do nosso plano (deltas concretos)

### Fase 7 — adicionar
1. **Viewport no schema**: `diagram_layouts` hoje tem `zoom`. Eles persistem
   `position_x/y` do panzoom → adicionar `viewport_x, viewport_y` para reabrir
   exatamente onde o usuário ficou. (mudança mínima no DDL do §3.2 do doc 04)
2. **Fila de save serializada + indicador** `Salvando.../Salvo às: HH:MM` —
   um PUT em voo por vez (React Query `mutationFn` com guarda), status no
   canto do canvas.
3. **VIEWER = canvas travado**: eles removem os botões da sidebar em
   `readOnly`. Nossa API já nega (VIEWER lê, MEMBER grava) — mas a UI tem que
   esconder drag/edit e o e2e tem que provar que o arrasto do VIEWER não persiste.

### Fase 8 — refinar
4. **Comando com `reverse_action`** (ver §2) em vez de "fila local" genérica.
5. **Menu de contexto "adicionar tabela aqui"**: cria a tabela nas coordenadas
   do cursor (`relativePosition` deles), não na origem do canvas.
6. **Modo `1:n` por botão** além do arrasto handle→handle: clique no botão,
   clica tabela origem, clica destino. Fallback muito mais fácil (e acessível)
   que acertar handle de 8px.

### Fase 9 — refinar
7. **"Chaves entre modelos" é derivado, não dado novo**: eles gravam
   `dbForeignKey` com `ref_diagramId` (target zone explícito). Nós já temos
   relationships modelo-wide → basta checar se origem/destino estão em zonas
   diferentes. **Sem schema novo.**
8. **"Remover da zona" ≠ "excluir tabela"**: dois comandos distintos
   (`removeEntityFromDiagramView` vs `deleteEntity` deles). No modelo de zona
   única (Fase 7) isso não existe; entra junto com as zonas.
9. **Arrastar da árvore para o canvas** adiciona a tabela na zona atual
   (`ui-droppable` deles) — natural com as zonas prontas.
10. **Export: SVG primeiro, PNG depois**. Eles só têm PNG e o caminho deles
    (html2canvas em 2 passadas escondendo os cards) é o pior pedaço do código.
    Com React Flow as arestas já são SVG → `toSvg` é quase grátis; PNG via
    `html-to-image`. Nosso SVG passa a ser vantagem sobre eles.

## 4. Backlog (não entra em 7/8/9 — anotar na proposta v2 §10.1)

- **Import de banco vivo** (`importDatabase`: conecta e faz reverse-engineering)
  — hoje só importamos script SQL. Temos `pg-local`; é feature de exploração.
- **Gerar SQL CREATE / classes de modelo a partir do diagrama** (`generateSql`,
  `generatePhp`) — fechar o ciclo import→editar→exportar.
- **Templates de tabelas** (`addTableTemplate("calendar")`).
- **Force case** (`setForceCase('L')`: força minúsculas ao digitar nomes) +
  **validação de palavras reservadas** (`databaseReservedWords`,
  `phpReservedWords`, `frameworkReservedColumnWords`).
- **Criar tabelas com IA** (`craeteTablesChatAI` — sim, typo deles) — já temos
  agente/MCP; é caminho natural, mas fora do escopo do canvas.
- **Colaboração** (socket.io) — só viável porque a fila de comandos já existe;
  nosso design (§2) deixa a porta aberta.
- **Ordenar colunas por drag** no card (`ui-sortable`) e **redimensionar card**
  (eles persistem `width/height` por view — nosso positions_json aceita, mas
  decidir se queremos resize).

## 5. O que confirma o plano como está

- **React Flow** (eles usando jsPlumb+panzoom é a prova do caminho difícil).
- **Auto-save com indicador, sem botão** (decisão 5) — eles não têm botão.
- **Layout por zona/aba**: `diagram_view.entities[id] = {x,y,w,h}` — posição é
  propriedade da view, não da tabela. Nosso `positions_json` por `zone_name`
  bate.
- **Abas/zonas na Fase 9** com `+`, rename, delete, reordenar por drag —
  eles têm exatamente isso (`showNewDiagramView`, `showEditDiagramName`,
  `showDeleteDiagram`, `ui-sortable` nas tabs).
- **Contagem `N/500 tabelas`** no breadcrumb (Fase 9) — eles têm.
- **Undo/redo na Fase 8** (decisão 6) — mantém; só muda o mecanismo (§2).
- **Flags `NN/UQ/AI/UUID/Coluna visualizável` fora do modelo v1** (decisão 4) —
  eles têm (geram CRUD), nós não geramos UI; manter fora continua certo.
- Busca na sidebar com highlight, faixas `Chaves estrangeiras`/`Chaves entre
  modelos` no rodapé do card, minimapa — tudo bate com o mapeado no doc 04.

## 6. Decisões que ficam de pé (com o HTML como voto)

1. React Flow — **sim** (eles são a contra-prova).
2. Fase 7 primeiro — **sim**.
3. Abas/zonas na Fase 9 — **sim**.
4. Flags fora do v1 — **sim**.
5. Auto-save com indicador — **sim** (+ copy `Salvo às: HH:MM`).
6. Undo/redo Fase 8 — **sim** (+ mecanismo `reverse_action` unificado).

Nenhuma decisão muda de resposta; os deltas são de escopo (viewport, fila
serializada, VIEWER travado, contexto, modo 1:n, export SVG) e vira nota na
abertura do change `v2-phase7-diagram`.
